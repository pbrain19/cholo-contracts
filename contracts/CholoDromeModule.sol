// SPDX-License-Identifier: LGPL-3.0
pragma solidity ^0.8.0;
// Imports will be added here
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@safe-global/safe-contracts/contracts/common/Enum.sol";
import "./choloInterfaces.sol";
import "./ISafe.sol";

contract CholoDromeModule is Ownable {
    address public rewardToken; // Velo token address
    address public rewardStable; // USDT token address
    address public swapRouter; // Address of the Uniswap V3 Swap Router
    address public immutable USDC;
    address public immutable WETH; // Added state variable for WETH

    uint256 private constant SLIPPAGE_DENOMINATOR = 10000;
    uint256 public slippageTolerance = 100; // 0.5% default slippage tolerance

    // Mapping to store approved pools
    mapping(address => bool) public approvedPools;

    // Mapping to store encoded paths for swaps between two tokens
    mapping(address => mapping(address => bytes)) public swapPaths;

    // Mapping to store price feed addresses for token pairs
    mapping(address => mapping(address => address)) public priceFeeds;

    // Add this struct near the top of the contract with other state variables
    struct PriceFeedData {
        address fromToken;
        address toToken;
        address priceFeed;
    }

    // Add this struct near the top with other state variables
    struct SwapPathData {
        address fromToken;
        address toToken;
        bytes path;
    }

    event PoolApproved(address indexed safe, address indexed pool);
    event PoolRemoved(address indexed safe, address indexed pool);
    event EarningsCollected(
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
    event PriceFeedUpdated(
        address indexed fromToken,
        address indexed toToken,
        address indexed priceFeed
    );

    // NEW: Event to signal completion of depositMax
    event DepositMaxCompleted(
        address indexed safe,
        address indexed pool,
        uint256 tokenId
    );

    constructor(
        address _owner,
        address _rewardToken,
        address _rewardStable,
        address _swapRouter,
        address _usdc,
        address _weth
    ) Ownable(_owner) {
        require(_owner != address(0), "Invalid owner");
        require(_rewardToken != address(0), "Invalid reward token");
        require(_rewardStable != address(0), "Invalid reward stable");
        require(_swapRouter != address(0), "Invalid swap router");
        require(_usdc != address(0), "Invalid USDC address");
        require(_weth != address(0), "Invalid WETH address");
        rewardToken = _rewardToken;
        rewardStable = _rewardStable;
        swapRouter = _swapRouter;
        USDC = _usdc;
        WETH = _weth;
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

    /// @notice Update multiple swap paths in a single transaction
    /// @param paths Array of swap path data containing token pairs and their corresponding encoded paths
    function setSwapPaths(SwapPathData[] calldata paths) external onlyOwner {
        uint256 length = paths.length;
        for (uint256 i = 0; i < length; ) {
            SwapPathData calldata pathData = paths[i];
            require(pathData.fromToken != address(0), "Invalid from token");
            require(pathData.toToken != address(0), "Invalid to token");
            require(pathData.path.length > 0, "Invalid path");

            swapPaths[pathData.fromToken][pathData.toToken] = pathData.path;

            unchecked {
                ++i;
            }
        }
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

    /// @notice Set multiple price feeds in a single transaction
    /// @param feeds Array of price feed data containing token pairs and their corresponding price feed addresses
    function setPriceFeeds(PriceFeedData[] calldata feeds) external onlyOwner {
        uint256 length = feeds.length;
        for (uint256 i = 0; i < length; ) {
            PriceFeedData calldata feed = feeds[i];
            require(feed.fromToken != address(0), "Invalid from token");
            require(feed.toToken != address(0), "Invalid to token");
            require(feed.priceFeed != address(0), "Invalid price feed");

            priceFeeds[feed.fromToken][feed.toToken] = feed.priceFeed;
            emit PriceFeedUpdated(feed.fromToken, feed.toToken, feed.priceFeed);

            unchecked {
                ++i;
            }
        }
    }

    /// @notice Get the latest price between two tokens, checking both direct and inverse feeds
    /// @param fromToken The source token address
    /// @param toToken The destination token address
    /// @return price The normalized price (8 decimals)
    /// @return inverse Whether the price feed was used in inverse
    function _getValidatedPrice(
        address fromToken,
        address toToken
    ) internal view returns (uint256 price, bool inverse) {
        // First try direct price feed
        address priceFeed = priceFeeds[fromToken][toToken];

        if (priceFeed != address(0)) {
            // Direct price feed exists
            AggregatorV3Interface oracle = AggregatorV3Interface(priceFeed);
            (, int256 rawPrice, , uint256 updatedAt, ) = oracle
                .latestRoundData();
            require(rawPrice > 0, "Invalid price");
            require(
                block.timestamp - updatedAt <= 24 hours,
                "Price feed too old"
            );
            return (uint256(rawPrice), false);
        }

        // Try inverse price feed
        priceFeed = priceFeeds[toToken][fromToken];
        if (priceFeed != address(0)) {
            // Inverse price feed exists
            AggregatorV3Interface oracle = AggregatorV3Interface(priceFeed);
            (, int256 rawPrice, , uint256 updatedAt, ) = oracle
                .latestRoundData();
            require(rawPrice > 0, "Invalid price");
            require(
                block.timestamp - updatedAt <= 24 hours,
                "Price feed too old"
            );
            // Calculate inverse price: 1e16 / price to maintain 8 decimals
            // We use 1e16 because price feeds are in 8 decimals, so 1e16/1e8 = 1e8 (our target decimals)
            return (1e16 / uint256(rawPrice), true);
        }

        revert("No price feed found");
    }

    /// @notice Calculate the minimum amount out with slippage tolerance using Chainlink oracle
    /// @param tokenIn The input token address
    /// @param amountIn The input amount
    /// @param tokenOut The output token address
    /// @return The minimum amount out considering slippage
    function _calculateAmountOutMinimum(
        address tokenIn,
        uint256 amountIn,
        address tokenOut
    ) internal view returns (uint256) {
        if (tokenIn == tokenOut) return amountIn;

        // Get token decimals
        uint8 tokenInDecimals = IERC20Metadata(tokenIn).decimals();
        uint8 tokenOutDecimals = IERC20Metadata(tokenOut).decimals();

        // Check for direct price feed
        address directFeed = priceFeeds[tokenIn][tokenOut];
        address inverseFeed = priceFeeds[tokenOut][tokenIn];

        uint256 expectedAmount;

        if (directFeed != address(0)) {
            // Direct price feed exists
            (uint256 price, bool inverse) = _getValidatedPrice(
                tokenIn,
                tokenOut
            );
            require(!inverse, "Unexpected inverse price");
            // Adjust for decimal differences: (amountIn * price * 10^outDecimals) / (10^8 * 10^inDecimals)
            expectedAmount =
                (amountIn * price * (10 ** tokenOutDecimals)) /
                (10 ** (8 + tokenInDecimals));
        } else if (inverseFeed != address(0)) {
            // Inverse price feed exists
            (uint256 price, bool inverse) = _getValidatedPrice(
                tokenIn,
                tokenOut
            );
            require(inverse, "Expected inverse price");
            // For inverse prices: (amountIn * price * 10^outDecimals) / (10^8 * 10^inDecimals)
            expectedAmount =
                (amountIn * price * (10 ** tokenOutDecimals)) /
                (10 ** (8 + tokenInDecimals));
        } else if (tokenIn != USDC && tokenOut != USDC) {
            // Try routing through USDC
            // First get price from tokenIn to USDC
            (uint256 priceToUsdc, bool inverseToUsdc) = _getValidatedPrice(
                tokenIn,
                USDC
            );
            // Then from USDC to tokenOut
            (uint256 priceFromUsdc, bool inverseFromUsdc) = _getValidatedPrice(
                USDC,
                tokenOut
            );

            // Calculate USDC amount first
            uint256 usdcAmount;
            if (!inverseToUsdc) {
                // Direct price to USDC
                usdcAmount =
                    (amountIn * priceToUsdc) /
                    (10 ** (8 + tokenInDecimals - 6));
            } else {
                // Inverse price to USDC
                usdcAmount =
                    (amountIn * priceToUsdc) /
                    (10 ** (8 + tokenInDecimals - 6));
            }

            // Then calculate final token amount
            if (!inverseFromUsdc) {
                // Direct price from USDC
                expectedAmount =
                    (usdcAmount * priceFromUsdc * (10 ** tokenOutDecimals)) /
                    (10 ** (8 + 6));
            } else {
                // Inverse price from USDC
                expectedAmount =
                    (usdcAmount * priceFromUsdc * (10 ** tokenOutDecimals)) /
                    (10 ** (8 + 6));
            }
        } else {
            revert("No valid price path");
        }

        // Apply slippage tolerance
        return
            (expectedAmount * (SLIPPAGE_DENOMINATOR - slippageTolerance)) /
            SLIPPAGE_DENOMINATOR;
    }

    function unstakeAndCollect(address pool, uint256 tokenId) external {
        require(approvedPools[pool], "Pool not approved for this module");

        ISafe safe = ISafe(payable(msg.sender));
        address gaugeAddress = ICLPool(pool).gauge();
        ICLGauge clGauge = ICLGauge(gaugeAddress);
        bool isStaked = clGauge.stakedContains(address(safe), tokenId);

        require(isStaked, "Position not staked");

        uint256 initialUsdtBalance = _getUsdtBalance(address(safe));

        uint256 veloAmount = clGauge.earned(address(safe), tokenId);

        _handleUnstakeAndCollect(safe, gaugeAddress, tokenId);

        uint256 finalUsdtBalance = _getUsdtBalance(address(safe));
        uint256 totalUsdtAmount = finalUsdtBalance - initialUsdtBalance;

        emit EarningsCollected(
            address(safe),
            pool,
            tokenId,
            0,
            0,
            veloAmount,
            totalUsdtAmount
        );
    }

    /// @notice Handles unstaking from gauge if position is staked
    function _handleUnstakeAndCollect(
        ISafe safe,
        address gauge,
        uint256 tokenId
    ) internal {
        require(gauge != address(0), "Invalid gauge");

        ICLGauge clGauge = ICLGauge(gauge);
        bool isStaked = clGauge.stakedContains(address(safe), tokenId);

        require(isStaked, "Position not staked");

        uint256 amount = clGauge.earned(address(safe), tokenId);

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
        uint128 liquidity
    ) internal {
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
    }

    /// @notice Collects owed tokens from positions.
    // Which may be earned fees or LP tokens after decreasing liquidity
    function _collectOwed(
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

    /// @notice Swaps tokens. If token is native ETH (represented by address(0)), it will be wrapped to WETH.
    /// If toToken is native ETH (address(0)), then received WETH is unwrapped.
    function swap(
        address token,
        uint256 amountIn,
        address toToken,
        bool isEarning
    ) public payable {
        ISafe safe = ISafe(payable(msg.sender));
        uint256 amountOut;
        if (toToken == address(0)) {
            uint256 balanceBefore = address(safe).balance;
            _swap(safe, token, amountIn, toToken);
            uint256 balanceAfter = address(safe).balance;
            amountOut = balanceAfter - balanceBefore;
        } else {
            uint256 balanceBefore = IERC20(toToken).balanceOf(address(safe));
            _swap(safe, token, amountIn, toToken);
            uint256 balanceAfter = IERC20(toToken).balanceOf(address(safe));
            amountOut = balanceAfter - balanceBefore;
        }
        if (isEarning) {
            emit EarningsCollected(
                address(safe),
                address(0),
                0,
                0,
                0,
                amountOut,
                0
            );
        }
    }

    /// @notice Internal swap function with native ETH support for wrapping/unwrapping.
    function _swap(
        ISafe safe,
        address token,
        uint256 amountIn,
        address toToken
    ) internal returns (bool) {
        // If token is native ETH (represented as address(0)), wrap it to WETH
        if (token == address(0)) {
            require(
                msg.value == amountIn,
                "Msg.value must equal amountIn for native ETH"
            );
            bytes memory depositData = abi.encodeWithSelector(
                IWETH.deposit.selector
            );
            require(
                safe.execTransactionFromModule(
                    WETH,
                    amountIn,
                    depositData,
                    Enum.Operation.Call
                ),
                "ETH wrapping failed"
            );
            token = WETH;
        } else {
            require(
                msg.value == 0,
                "No ETH should be sent when token is not native ETH"
            );
        }

        // If toToken is native ETH, set it to WETH and mark for unwrapping after swap
        bool shouldUnwrap = false;
        if (toToken == address(0)) {
            toToken = WETH;
            shouldUnwrap = true;
        }

        require(token != toToken, "Cannot swap to same token");

        bytes memory path = _getSwapPath(token, toToken);

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

        uint256 amountOutMinimum = _calculateAmountOutMinimum(
            token,
            amountIn,
            toToken
        );

        ISwapRouter02.ExactInputParams memory params = ISwapRouter02
            .ExactInputParams({
                path: path,
                recipient: address(safe),
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum
            });

        bytes memory swapData = abi.encodeWithSelector(
            ISwapRouter02.exactInput.selector,
            params
        );
        require(
            safe.execTransactionFromModule(
                swapRouter,
                0,
                swapData,
                Enum.Operation.Call
            ),
            "Swap execution failed"
        );

        if (shouldUnwrap) {
            uint256 wethBalance = IERC20(WETH).balanceOf(address(safe));
            bytes memory withdrawData = abi.encodeWithSelector(
                IWETH.withdraw.selector,
                wethBalance
            );
            require(
                safe.execTransactionFromModule(
                    WETH,
                    0,
                    withdrawData,
                    Enum.Operation.Call
                ),
                "WETH unwrapping failed"
            );
        }

        return true;
    }

    /// @notice Swaps tokens to USDT using the stored path
    /// @param safe The safe address
    /// @param token The token to swap
    /// @param amountIn The amount of tokens to swap
    /// @return success True if the swap was successful
    function _swapToStable(
        ISafe safe,
        address token,
        uint256 amountIn
    ) internal returns (bool) {
        if (amountIn == 0) return true;
        if (token == rewardStable) return true;

        return _swap(safe, token, amountIn, rewardStable);
    }

    /// @notice Main function to withdraw liquidity and collect fees
    /// @param pool The pool address
    /// @param tokenId The ID of the position
    /// @param convertToUsdc Whether to convert the collected fees to USDC to protect against major loss in a super down volatile market
    function withdrawAndCollect(
        address pool,
        uint256 tokenId,
        bool convertToUsdc
    ) external {
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
            ,

        ) = nftPositionManager.positions(tokenId);

        uint256 initialUsdtBalance = _getUsdtBalance(address(safe));
        uint256 veloAmount = 0;

        address gaugeAddress = ICLPool(pool).gauge();
        ICLGauge clGauge = ICLGauge(gaugeAddress);
        bool isStaked = clGauge.stakedContains(address(safe), tokenId);

        // Handle unstaking if needed
        if (isStaked) {
            veloAmount = clGauge.earned(address(safe), tokenId);
            _handleUnstakeAndCollect(safe, gaugeAddress, tokenId);
        }

        uint256 amount0 = 0;
        uint256 amount1 = 0;

        if (!isStaked) {
            // collect actual fees since collect can give u LP tokens and others
            (amount0, amount1) = _collectOwed(safe, nftManager, tokenId);
            // TODO: uncomment this when we know how we will deail with these tokens
            // if (amount0 > 0) {
            //     // Swap earned fees to USDT
            //     require(
            //         _swapToStable(safe, token0, amount0),
            //         "Token0 swap failed"
            //     );
            // }

            // if (amount1 > 0) {
            //     require(
            //         _swapToStable(safe, token1, amount1),
            //         "Token1 swap failed"
            //     );
            // }
        }

        // Decrease liquidity if any
        if (liquidity > 0) {
            _decreaseLiquidity(safe, nftManager, tokenId, liquidity);
        }

        _collectOwed(safe, nftManager, tokenId);
        // Collect fees

        _burnPosition(safe, nftManager, tokenId);

        uint256 finalUsdtBalance = _getUsdtBalance(address(safe));
        uint256 totalUsdtAmount = finalUsdtBalance - initialUsdtBalance;

        if (convertToUsdc) {
            uint256 balanceToken0 = IERC20(token0).balanceOf(address(safe));
            uint256 balanceToken1 = IERC20(token1).balanceOf(address(safe));

            // swap to usdc if needed
            if (token0 != USDC) {
                _swap(safe, token0, balanceToken0, USDC);
            }

            if (token1 != USDC) {
                _swap(safe, token1, balanceToken1, USDC);
            }
        }

        // when token is staked the amount0 and amount1 are 0 because we dont get to collect those
        // when not staked we collect the fees (velos)
        emit EarningsCollected(
            address(safe),
            pool,
            tokenId,
            amount0,
            amount1,
            veloAmount,
            totalUsdtAmount
        );
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

    /// @notice Collects fees from a position and converts them to USDT
    /// @param pool The pool address
    /// @param tokenId The ID of the position
    function collectAndConvertFees(address pool, uint256 tokenId) external {
        require(approvedPools[pool], "Pool not approved for this module");

        ISafe safe = ISafe(payable(msg.sender));
        address nftManager = ICLPool(pool).nft();
        address gaugeAddress = ICLPool(pool).gauge();
        ICLGauge clGauge = ICLGauge(gaugeAddress);

        uint256 initialUsdtBalance = _getUsdtBalance(address(safe));
        uint256 veloAmount;
        uint256 amount0;
        uint256 amount1;

        bool isStaked = clGauge.stakedContains(address(safe), tokenId);

        // Claim gauge rewards if staked
        if (isStaked) {
            veloAmount = clGauge.earned(address(safe), tokenId);
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
            (amount0, amount1) = _collectOwed(safe, nftManager, tokenId);

            // Swap collected fees to USDT if any
            // if (amount0 > 0) {
            //     require(
            //         _swapToStable(safe, token0, amount0),
            //         "Token0 swap failed"
            //     );
            // }
            // if (amount1 > 0) {
            //     require(
            //         _swapToStable(safe, token1, amount1),
            //         "Token1 swap failed"
            //     );
            // }
        }

        uint256 finalUsdtBalance = _getUsdtBalance(address(safe));
        uint256 totalUsdtAmount = finalUsdtBalance - initialUsdtBalance;

        emit EarningsCollected(
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

    /// @notice Stakes a position in the gauge and collects any earned fees before staking
    /// @param pool The pool address
    /// @param tokenId The ID of the position
    function stakeAndCollect(address pool, uint256 tokenId) external {
        require(approvedPools[pool], "Pool not approved for this module");

        ISafe safe = ISafe(payable(msg.sender));
        address nftManager = ICLPool(pool).nft();
        address gaugeAddress = ICLPool(pool).gauge();

        ICLGauge clGauge = ICLGauge(gaugeAddress);

        // Check if already staked
        bool isStaked = clGauge.stakedContains(address(safe), tokenId);
        require(!isStaked, "Position already staked");

        uint256 initialUsdtBalance = _getUsdtBalance(address(safe));

        // Collect any pending fees before staking
        (uint256 amount0, uint256 amount1) = _collectOwed(
            safe,
            nftManager,
            tokenId
        );

        // Swap collected fees to USDT if any
        // if (amount0 > 0) {
        //     require(_swapToStable(safe, token0, amount0), "Token0 swap failed");
        // }
        // if (amount1 > 0) {
        //     require(_swapToStable(safe, token1, amount1), "Token1 swap failed");
        // }

        // Check if NFT approval is needed
        bool isApproved = INonfungiblePositionManager(nftManager)
            .isApprovedForAll(address(safe), gaugeAddress);

        if (!isApproved) {
            bytes memory approvalData = abi.encodeWithSelector(
                INonfungiblePositionManager.setApprovalForAll.selector,
                gaugeAddress,
                true
            );
            require(
                safe.execTransactionFromModule(
                    nftManager,
                    0,
                    approvalData,
                    Enum.Operation.Call
                ),
                "NFT approval failed"
            );
        }

        // Stake the position
        bytes memory stakeData = abi.encodeWithSelector(
            ICLGauge.deposit.selector,
            tokenId
        );
        require(
            safe.execTransactionFromModule(
                gaugeAddress,
                0,
                stakeData,
                Enum.Operation.Call
            ),
            "Stake failed"
        );

        uint256 finalUsdtBalance = _getUsdtBalance(address(safe));
        uint256 totalUsdtAmount = finalUsdtBalance - initialUsdtBalance;

        emit EarningsCollected(
            address(safe),
            pool,
            tokenId,
            amount0,
            amount1,
            0, // No velo rewards yet since we just staked
            totalUsdtAmount
        );
    }
}
