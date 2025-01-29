// SPDX-License-Identifier: LGPL-3.0
pragma solidity ^0.8.0;
// Imports will be added here
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@safe-global/safe-contracts/contracts/common/Enum.sol";
import "./choloInterfaces.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";
import "./ISafe.sol";

contract CholoDromeModule is Ownable {
    address public rewardToken; // Velo token address
    address public rewardStable; // USDT token address
    address public swapRouter; // Address of the Uniswap V3 Swap Router
    address public quoter;

    uint256 private constant SLIPPAGE_DENOMINATOR = 10000;
    uint256 public slippageTolerance = 50; // 0.5% default slippage tolerance

    // Mapping to store approved pools
    mapping(address => bool) public approvedPools;

    // Mapping to store encoded paths for swaps between two tokens
    mapping(address => mapping(address => bytes)) public swapPaths;

    event PoolApproved(address indexed safe, address indexed pool);
    event PoolRemoved(address indexed safe, address indexed pool);
    event WithdrawAndCollect(
        address indexed safe,
        address indexed pool,
        uint256 tokenId,
        uint256 amount0,
        uint256 amount1,
        uint256 veloAmount,
        uint256 totalUsdtAmount
    );
    event RewardTokenUpdated(
        address indexed oldToken,
        address indexed newToken
    );
    event RewardStableUpdated(
        address indexed oldStable,
        address indexed newStable
    );
    event SlippageToleranceUpdated(uint256 oldTolerance, uint256 newTolerance);
    event FeesCollectedAndSwapped(
        address indexed safe,
        address indexed pool,
        uint256 tokenId,
        uint256 amount0,
        uint256 amount1,
        uint256 veloAmount,
        uint256 totalUsdtAmount
    );

    constructor(
        address _owner,
        address _rewardToken,
        address _rewardStable,
        address _quoter,
        address _swapRouter
    ) Ownable(_owner) {
        require(_owner != address(0), "Invalid owner");
        require(_rewardToken != address(0), "Invalid reward token");
        require(_rewardStable != address(0), "Invalid reward stable");
        require(_quoter != address(0), "Invalid quoter");
        require(_swapRouter != address(0), "Invalid swap router");
        rewardToken = _rewardToken;
        rewardStable = _rewardStable;
        quoter = _quoter;
        swapRouter = _swapRouter;
    }

    /// @notice Set the slippage tolerance for swaps
    /// @param _slippageTolerance The new slippage tolerance (in basis points, e.g. 50 = 0.5%)
    function setSlippageTolerance(
        uint256 _slippageTolerance
    ) external onlyOwner {
        require(_slippageTolerance <= 1000, "Slippage too high"); // Max 10%
        uint256 oldTolerance = slippageTolerance;
        slippageTolerance = _slippageTolerance;
        emit SlippageToleranceUpdated(oldTolerance, _slippageTolerance);
    }

    /// @notice Approve a pool for all safes
    /// @dev Can only be called by the owner
    /// @param pool The address of the pool to approve
    function approvePool(address pool) external onlyOwner {
        require(pool != address(0), "Invalid pool");
        approvedPools[pool] = true;
        emit PoolApproved(address(0), pool); // Use address(0) to indicate all safes
    }

    /// @notice Remove approval for a pool for all safes
    /// @dev Can only be called by the owner
    /// @param pool The address of the pool to remove
    function removePool(address pool) external onlyOwner {
        require(pool != address(0), "Invalid pool");
        approvedPools[pool] = false;
        emit PoolRemoved(address(0), pool); // Use address(0) to indicate all safes
    }

    /// @notice Update the reward token address (Velo)
    /// @param _newRewardToken The new reward token address
    function setRewardToken(address _newRewardToken) external onlyOwner {
        require(_newRewardToken != address(0), "Invalid reward token");
        address oldToken = rewardToken;
        rewardToken = _newRewardToken;
        emit RewardTokenUpdated(oldToken, _newRewardToken);
    }

    /// @notice Update the reward stable token address (USDT)
    /// @param _newRewardStable The new reward stable token address
    function setRewardStable(address _newRewardStable) external onlyOwner {
        require(_newRewardStable != address(0), "Invalid reward stable");
        address oldStable = rewardStable;
        rewardStable = _newRewardStable;
        emit RewardStableUpdated(oldStable, _newRewardStable);
    }

    /// @notice Update the encoded path for swaps between two tokens
    /// @dev Can only be called by the owner
    /// @param fromToken The address of the token to swap from
    /// @param toToken The address of the token to swap to
    /// @param path The encoded path for the swap
    function setSwapPath(
        address fromToken,
        address toToken,
        bytes calldata path
    ) external onlyOwner {
        require(fromToken != address(0), "Invalid fromToken");
        require(toToken != address(0), "Invalid toToken");
        require(path.length > 0, "Invalid path");
        swapPaths[fromToken][toToken] = path;
    }

    /// @notice Retrieve the swap path for a given token pair
    /// @param fromToken The address of the token to swap from
    /// @param toToken The address of the token to swap to
    /// @return path The encoded path for the swap
    function _getSwapPath(
        address fromToken,
        address toToken
    ) internal view returns (bytes memory path) {
        path = swapPaths[fromToken][toToken];
        require(path.length > 0, "Swap path not set");
    }

    /// @notice Handles unstaking from gauge if position is staked
    function _handleUnstake(
        ISafe safe,
        address gauge,
        uint256 tokenId
    ) internal {
        require(gauge != address(0), "Invalid gauge");

        ICLGauge clGauge = ICLGauge(gauge);
        bool isStaked = clGauge.stakedContains(address(safe), tokenId);
        uint256 amount = clGauge.earned(address(safe), tokenId);

        // if not staked nothing to do here just return
        if (!isStaked) return;

        if (isStaked) {
            bytes memory withdrawData = abi.encodeWithSelector(
                ICLGauge.withdraw.selector,
                tokenId
            );
            require(
                safe.execTransactionFromModule(
                    gauge,
                    0,
                    withdrawData,
                    Enum.Operation.Call
                ),
                "Gauge withdraw failed"
            );
        }

        if (amount > 0) {
            require(
                _swapToStable(safe, rewardToken, amount),
                "Swap to stable failed"
            );
        }
    }

    /// @notice Decreases liquidity and returns new token amounts
    function _decreaseLiquidity(
        ISafe safe,
        address nftManager,
        uint256 tokenId,
        uint128 liquidity,
        uint128 initialTokensOwed0,
        uint128 initialTokensOwed1
    )
        internal
        returns (
            uint256 lpAmount0,
            uint256 lpAmount1,
            uint128 remainingLiquidity
        )
    {
        bytes memory decreaseData = abi.encodeWithSelector(
            INonfungiblePositionManager.decreaseLiquidity.selector,
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: tokenId,
                liquidity: liquidity,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp
            })
        );
        require(
            safe.execTransactionFromModule(
                nftManager,
                0,
                decreaseData,
                Enum.Operation.Call
            ),
            "Decrease liquidity failed"
        );

        // Get position details after decreasing liquidity
        {
            (
                ,
                ,
                ,
                ,
                ,
                ,
                ,
                uint128 liq,
                ,
                ,
                uint128 tokensOwed0,
                uint128 tokensOwed1
            ) = INonfungiblePositionManager(nftManager).positions(tokenId);
            remainingLiquidity = liq;
            lpAmount0 = tokensOwed0 - initialTokensOwed0;
            lpAmount1 = tokensOwed1 - initialTokensOwed1;
        }
    }

    /// @notice Collects fees from position
    function _collectFees(
        ISafe safe,
        address nftManager,
        uint256 tokenId
    ) internal returns (uint256 amount0, uint256 amount1) {
        bytes memory collectData = abi.encodeWithSelector(
            INonfungiblePositionManager.collect.selector,
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(safe),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        (bool success, bytes memory returnData) = safe
            .execTransactionFromModuleReturnData(
                nftManager,
                0,
                collectData,
                Enum.Operation.Call
            );
        require(success, "Collect failed");
        (amount0, amount1) = abi.decode(returnData, (uint256, uint256));
    }

    /// @notice Swaps tokens to USDT using the stored path
    function _swapToStable(
        ISafe safe,
        address token,
        uint256 amountIn
    ) internal returns (bool) {
        if (amountIn == 0) return true;
        if (token == rewardStable) return true;

        bytes memory path = _getSwapPath(token, rewardStable);

        // Approve the swap router to spend the input token
        bytes memory approveData = abi.encodeWithSelector(
            IERC20.approve.selector,
            swapRouter,
            amountIn
        );
        require(
            safe.execTransactionFromModule(
                token,
                0,
                approveData,
                Enum.Operation.Call
            ),
            "Token approve failed"
        );

        // Calculate minimum amount out with slippage tolerance
        uint256 amountOutMinimum = _calculateAmountOutMinimum(token, amountIn);

        // Create the swap parameters
        ISwapRouter.ExactInputParams memory params = ISwapRouter
            .ExactInputParams({
                path: path,
                recipient: address(safe),
                deadline: block.timestamp + 300, // 5-minute deadline
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum
            });

        // Execute the swap
        bytes memory swapData = abi.encodeWithSelector(
            ISwapRouter.exactInput.selector,
            params
        );

        return
            safe.execTransactionFromModule(
                swapRouter,
                0,
                swapData,
                Enum.Operation.Call
            );
    }

    /// @notice Calculate the minimum amount out with slippage tolerance
    function _calculateAmountOutMinimum(
        address token,
        uint256 amountIn
    ) internal returns (uint256) {
        // Use the quoter to get the expected output amount
        bytes memory path = _getSwapPath(token, rewardStable);
        uint256 amountOut = IQuoter(quoter).quoteExactInput(path, amountIn);

        // Calculate minimum amount out with slippage tolerance
        return
            (amountOut * (SLIPPAGE_DENOMINATOR - slippageTolerance)) /
            SLIPPAGE_DENOMINATOR;
    }

    /// @notice Main function to withdraw liquidity and collect fees
    function withdrawAndCollect(address pool, uint256 tokenId) external {
        require(approvedPools[pool], "Pool not approved for this module");

        ISafe safe = ISafe(payable(msg.sender));
        address nftManager = ICLPool(pool).nft();
        INonfungiblePositionManager nftPositionManager = INonfungiblePositionManager(
                nftManager
            );

        // Get initial position details
        (
            ,
            ,
            address token0,
            address token1,
            ,
            ,
            ,
            uint128 liquidity,
            ,
            ,
            uint128 initialTokensOwed0,
            uint128 initialTokensOwed1
        ) = nftPositionManager.positions(tokenId);

        uint256 initialUsdtBalance = _getUsdtBalance(address(safe));
        uint256 veloAmount = 0;

        // Handle unstaking if needed
        address gaugeAddress = ICLPool(pool).gauge();
        ICLGauge clGauge = ICLGauge(gaugeAddress);
        veloAmount = clGauge.earned(address(safe), tokenId);
        _handleUnstake(safe, gaugeAddress, tokenId);

        // Decrease liquidity if any
        uint256 lpAmount0;
        uint256 lpAmount1;

        if (liquidity > 0) {
            (lpAmount0, lpAmount1, liquidity) = _decreaseLiquidity(
                safe,
                nftManager,
                tokenId,
                liquidity,
                initialTokensOwed0,
                initialTokensOwed1
            );
        }

        // Collect fees
        _collectFees(safe, nftManager, tokenId);

        // Swap earned fees to USDT
        require(
            _swapToStable(safe, token0, initialTokensOwed0),
            "Token0 swap failed"
        );
        require(
            _swapToStable(safe, token1, initialTokensOwed1),
            "Token1 swap failed"
        );

        // Verify all fees collected
        _verifyFeesCollected(nftPositionManager, tokenId);

        // make sure there isnt liquidity left... in theory we should have nothing left
        require(liquidity == 0, "Liquidity not zero");
        _burnPosition(safe, nftManager, tokenId);

        uint256 finalUsdtBalance = _getUsdtBalance(address(safe));
        uint256 totalUsdtAmount = finalUsdtBalance - initialUsdtBalance;

        bool isStaked = clGauge.stakedContains(address(safe), tokenId);

        // when token is staked the amount0 and amount1 are 0 because we dont get to collect those
        // when not staked we collect the fees (velos)
        emit WithdrawAndCollect(
            address(safe),
            pool,
            tokenId,
            isStaked ? 0 : initialTokensOwed0,
            isStaked ? 0 : initialTokensOwed1,
            veloAmount,
            totalUsdtAmount
        );
    }

    function _verifyFeesCollected(
        INonfungiblePositionManager nftManager,
        uint256 tokenId
    ) internal view {
        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        ) = nftManager.positions(tokenId);
        require(tokensOwed0 == 0, "Uncollected token0 fees");
        require(tokensOwed1 == 0, "Uncollected token1 fees");
    }

    function _burnPosition(
        ISafe safe,
        address nftManager,
        uint256 tokenId
    ) internal {
        bytes memory burnData = abi.encodeWithSelector(
            INonfungiblePositionManager.burn.selector,
            tokenId
        );
        require(
            safe.execTransactionFromModule(
                nftManager,
                0,
                burnData,
                Enum.Operation.Call
            ),
            "Burn failed"
        );
    }

    // 0xebd5311bea1948e1441333976eadcfe5fbda777c
    // 1191434
    function collectStaked(address pool, uint256 tokenId) external {
        require(approvedPools[pool], "Pool not approved for this module");

        ISafe safe = ISafe(payable(msg.sender));

        address gaugeAddress = ICLPool(pool).gauge();
        ICLGauge clGauge = ICLGauge(gaugeAddress);

        uint256 veloAmount = clGauge.earned(address(safe), tokenId);

        bool isStaked = clGauge.stakedContains(address(safe), tokenId);

        require(isStaked, "Position not staked");

        if (veloAmount > 0) {
            bytes memory getRewardData = abi.encodeWithSelector(
                ICLGauge.getReward.selector,
                tokenId
            );
            require(
                safe.execTransactionFromModule(
                    gaugeAddress,
                    0,
                    getRewardData,
                    Enum.Operation.Call
                ),
                "Gauge get reward failed"
            );
        }
    }

    /// @notice Collects fees from a position and converts them to USDT
    /// @param pool The pool address
    /// @param tokenId The ID of the position
    function collectAndConvertFees(address pool, uint256 tokenId) external {
        require(approvedPools[pool], "Pool not approved for this module");

        ISafe safe = ISafe(payable(msg.sender));
        address nftManager = ICLPool(pool).nft();
        INonfungiblePositionManager nftPositionManager = INonfungiblePositionManager(
                nftManager
            );

        // Get initial position details
        (
            ,
            ,
            address token0,
            address token1,
            ,
            ,
            ,
            ,
            ,
            ,
            ,

        ) = nftPositionManager.positions(tokenId);

        address gaugeAddress = ICLPool(pool).gauge();
        ICLGauge clGauge = ICLGauge(gaugeAddress);

        uint256 initialUsdtBalance = _getUsdtBalance(address(safe));
        uint256 veloAmount;
        uint256 amount0;
        uint256 amount1;

        bool isStaked = clGauge.stakedContains(address(safe), tokenId);
        veloAmount = clGauge.earned(address(safe), tokenId);

        // Claim gauge rewards if staked
        if (isStaked) {
            if (veloAmount > 0) {
                bytes memory getRewardData = abi.encodeWithSelector(
                    ICLGauge.getReward.selector,
                    tokenId
                );
                require(
                    safe.execTransactionFromModule(
                        gaugeAddress,
                        0,
                        getRewardData,
                        Enum.Operation.Call
                    ),
                    "Gauge get reward failed"
                );

                require(
                    _swapToStable(safe, rewardToken, veloAmount),
                    "Swap to stable failed"
                );
            }
        } else {
            // Collect fees
            (amount0, amount1) = _collectFees(safe, nftManager, tokenId);

            // Swap collected fees to USDT if any
            if (amount0 > 0) {
                require(
                    _swapToStable(safe, token0, amount0),
                    "Token0 swap failed"
                );
            }
            if (amount1 > 0) {
                require(
                    _swapToStable(safe, token1, amount1),
                    "Token1 swap failed"
                );
            }
        }

        uint256 finalUsdtBalance = _getUsdtBalance(address(safe));
        uint256 totalUsdtAmount = finalUsdtBalance - initialUsdtBalance;

        emit FeesCollectedAndSwapped(
            address(safe),
            pool,
            tokenId,
            amount0,
            amount1,
            veloAmount,
            totalUsdtAmount
        );
    }

    // Helper function to get USDT balance
    function _getUsdtBalance(address safe) internal view returns (uint256) {
        return IERC20(rewardStable).balanceOf(safe);
    }

    // Functions will be added here
}
