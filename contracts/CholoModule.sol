// SPDX-License-Identifier: LGPL-3.0
pragma solidity ^0.8.0;
// Imports will be added here
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@safe-global/safe-contracts/contracts/common/Enum.sol";
import "@safe-global/safe-contracts/contracts/Safe.sol";
import "./choloInterfaces.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IQuoter.sol";

contract CholoModule is Ownable {
    address public rewardToken; // Velo token address
    address public rewardStable; // USDT token address
    address public swapRouter; // Address of the Uniswap V3 Swap Router
    address public quoter;

    uint256 private constant SLIPPAGE_DENOMINATOR = 10000;
    uint256 public slippageTolerance = 50; // 0.5% default slippage tolerance

    // Mapping of Safe => NFT Position Manager => is approved
    mapping(address => mapping(address => bool)) public approvedManagers;

    // Mapping to store encoded paths for swaps between two tokens
    mapping(address => mapping(address => bytes)) public swapPaths;

    event ManagerApproved(address indexed safe, address indexed manager);
    event ManagerRemoved(address indexed safe, address indexed manager);
    event WithdrawAndCollect(
        address indexed safe,
        address indexed manager,
        uint256 tokenId,
        bool wasStaked,
        uint256 amount0,
        uint256 amount1
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

    /// @notice Batch approve multiple NFT position managers for a Safe
    /// @dev Can only be called by the owner
    /// @param safe The Safe address to approve managers for
    /// @param managers Array of NFT position manager addresses to approve
    function batchApproveManagers(
        address safe,
        address[] calldata managers
    ) external onlyOwner {
        require(safe != address(0), "Invalid safe");
        for (uint i = 0; i < managers.length; i++) {
            require(managers[i] != address(0), "Invalid manager");
            approvedManagers[safe][managers[i]] = true;
            emit ManagerApproved(safe, managers[i]);
        }
    }

    /// @notice Batch remove approval for multiple NFT position managers for a Safe
    /// @dev Can only be called by the owner
    /// @param safe The Safe address to remove managers from
    /// @param managers Array of NFT position manager addresses to remove
    function batchRemoveManagers(
        address safe,
        address[] calldata managers
    ) external onlyOwner {
        require(safe != address(0), "Invalid safe");
        for (uint i = 0; i < managers.length; i++) {
            delete approvedManagers[safe][managers[i]];
            emit ManagerRemoved(safe, managers[i]);
        }
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
        Safe safe,
        address gauge,
        uint256 tokenId
    ) internal returns (bool) {
        if (gauge == address(0)) return false;

        ICLGauge clGauge = ICLGauge(gauge);
        bool isStaked = clGauge.stakedContains(address(safe), tokenId);
        uint256 amount = clGauge.earned(address(safe), tokenId);

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
        return isStaked;
    }

    /// @notice Decreases liquidity and returns new token amounts
    function _decreaseLiquidity(
        Safe safe,
        address manager,
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
                manager,
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
                uint128 tokensOwed1,

            ) = INonfungiblePositionManager(manager).positions(tokenId);
            remainingLiquidity = liq;
            lpAmount0 = tokensOwed0 - initialTokensOwed0;
            lpAmount1 = tokensOwed1 - initialTokensOwed1;
        }
    }

    /// @notice Collects fees from position
    function _collectFees(
        Safe safe,
        address manager,
        uint256 tokenId,
        uint128 initialTokensOwed0,
        uint128 initialTokensOwed1
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
                manager,
                0,
                collectData,
                Enum.Operation.Call
            );
        require(success, "Collect failed");
        (amount0, amount1) = abi.decode(returnData, (uint256, uint256));

        require(amount0 >= initialTokensOwed0, "Collect amount0 too low");
        require(amount1 >= initialTokensOwed1, "Collect amount1 too low");
    }

    /// @notice Swaps tokens to USDT using the stored path
    function _swapToStable(
        Safe safe,
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
    function withdrawAndCollect(address manager, uint256 tokenId) external {
        require(
            approvedManagers[msg.sender][manager],
            "Manager not approved for Safe"
        );

        Safe safe = Safe(payable(msg.sender));
        INonfungiblePositionManager nftManager = INonfungiblePositionManager(
            manager
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
            uint128 initialTokensOwed1,
            address pool
        ) = nftManager.positions(tokenId);

        // Handle unstaking if needed
        bool isStaked = _handleUnstake(safe, ICLPool(pool).gauge(), tokenId);

        uint256 amount0;
        uint256 amount1;
        uint256 lpAmount0;
        uint256 lpAmount1;

        // Decrease liquidity if any
        if (liquidity > 0) {
            uint128 remainingLiquidity;
            (lpAmount0, lpAmount1, remainingLiquidity) = _decreaseLiquidity(
                safe,
                manager,
                tokenId,
                liquidity,
                initialTokensOwed0,
                initialTokensOwed1
            );
            liquidity = remainingLiquidity;
        }

        // Collect fees
        (amount0, amount1) = _collectFees(
            safe,
            manager,
            tokenId,
            initialTokensOwed0,
            initialTokensOwed1
        );

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
        {
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
                uint128 tokensOwed1,

            ) = nftManager.positions(tokenId);
            require(tokensOwed0 == 0, "Uncollected token0 fees");
            require(tokensOwed1 == 0, "Uncollected token1 fees");
        }

        // Burn if no liquidity
        if (liquidity == 0) {
            bytes memory burnData = abi.encodeWithSelector(
                INonfungiblePositionManager.burn.selector,
                tokenId
            );
            require(
                safe.execTransactionFromModule(
                    manager,
                    0,
                    burnData,
                    Enum.Operation.Call
                ),
                "Burn failed"
            );
        }

        emit WithdrawAndCollect(
            address(safe),
            manager,
            tokenId,
            isStaked,
            amount0,
            amount1
        );
    }

    function approveManager(address manager) external {
        require(msg.sender == address(this), "Only callable by Safe");
        require(manager != address(0), "Invalid manager");
        approvedManagers[msg.sender][manager] = true;
        emit ManagerApproved(msg.sender, manager);
    }

    function removeManager(address manager) external {
        require(msg.sender == address(this), "Only callable by Safe");
        require(manager != address(0), "Invalid manager");
        approvedManagers[msg.sender][manager] = false;
        emit ManagerRemoved(msg.sender, manager);
    }

    function batchWithdrawAndCollect(
        address manager,
        uint256[] calldata tokenIds
    ) external {
        require(msg.sender == address(this), "Only callable by Safe");
        require(approvedManagers[msg.sender][manager], "Manager not approved");

        for (uint256 i = 0; i < tokenIds.length; i++) {
            this.withdrawAndCollect(manager, tokenIds[i]);
        }
    }

    // Functions will be added here
}
