// SPDX-License-Identifier: LGPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@safe-global/safe-contracts/contracts/common/Enum.sol";
import "./choloInterfaces.sol";
import "./ISafe.sol";

contract CholoDepositorModule is Ownable {
    // NEW: DepositInput struct for deposit amounts
    struct DepositInput {
        address token;
        uint256 amount;
    }
    address public choloDromeModule;
    address public immutable slipstreamSugar;

    event DepositMaxCompleted(
        address indexed safe,
        address indexed pool,
        uint256 tokenId
    );

    constructor(
        address _owner,
        address _choloDromeModule,
        address _slipstreamSugar
    ) Ownable(_owner) {
        require(_owner != address(0), "Invalid owner");
        require(
            _choloDromeModule != address(0),
            "Invalid CholoDromeModule address"
        );
        require(_slipstreamSugar != address(0), "Invalid Sugar address");

        choloDromeModule = _choloDromeModule;
        slipstreamSugar = _slipstreamSugar;
    }

    function _swap(
        ISafe safe,
        address token,
        uint256 amountIn,
        address toToken
    ) internal {
        // Add decimal normalization
        uint8 decimalsIn = IERC20Metadata(token).decimals();
        uint8 decimalsOut = IERC20Metadata(toToken).decimals();
        amountIn = (amountIn * 10 ** decimalsOut) / 10 ** decimalsIn;

        bytes memory swapData = abi.encodeWithSelector(
            ICholoDromeModule.swap.selector,
            token,
            amountIn,
            toToken,
            false // isEarning
        );

        require(
            safe.execTransactionFromModule(
                choloDromeModule,
                token == address(0) ? amountIn : 0, // Send ETH only if token is native
                swapData,
                Enum.Operation.Call
            ),
            "Swap failed"
        );
    }

    function _calculateLiquidity(
        uint160 sqrtPriceX96,
        uint160 sqrtPriceLower,
        uint160 sqrtPriceUpper,
        uint256 balance0,
        uint256 balance1
    )
        internal
        view
        returns (uint128 liquidity, uint256 usedAmount0, uint256 usedAmount1)
    {
        liquidity = uint128(
            ISlipstreamSugar(slipstreamSugar).getLiquidityForAmounts(
                balance0,
                balance1,
                sqrtPriceX96,
                sqrtPriceLower,
                sqrtPriceUpper
            )
        );

        (usedAmount0, usedAmount1) = ISlipstreamSugar(slipstreamSugar)
            .getAmountsForLiquidity(
                sqrtPriceX96,
                sqrtPriceLower,
                sqrtPriceUpper,
                uint128(liquidity)
            );
    }

    function _calculateIdealAmounts(
        uint256 totalUSDC,
        address pool,
        uint160 sqrtPriceX96,
        int24 tickLower,
        int24 tickUpper
    ) internal view returns (uint256 idealAmount0, uint256 idealAmount1) {
        idealAmount0 = ISlipstreamSugar(slipstreamSugar).estimateAmount0(
            totalUSDC,
            pool,
            sqrtPriceX96,
            tickLower,
            tickUpper
        );

        idealAmount1 = ISlipstreamSugar(slipstreamSugar).estimateAmount1(
            totalUSDC,
            pool,
            sqrtPriceX96,
            tickLower,
            tickUpper
        );

        // Ensure we don't exceed total USDC
        if (idealAmount0 + idealAmount1 > totalUSDC) {
            uint256 adjustment = (idealAmount0 + idealAmount1) - totalUSDC;
            if (idealAmount0 > adjustment) {
                idealAmount0 -= adjustment;
            } else {
                idealAmount1 -= adjustment;
            }
        }
    }

    function depositMax(
        DepositInput[] calldata deposits,
        address pool,
        int256 ticksBelow,
        int256 ticksAbove
    ) external payable {
        // Obtain the safe from msg.sender
        ISafe safe = ISafe(payable(msg.sender));
        ICholoDromeModule choloDrome = ICholoDromeModule(choloDromeModule);

        address USDC = choloDrome.USDC();

        // Convert all deposit amounts to USDC.
        uint256 initialUSDCBalance = IERC20(USDC).balanceOf(address(safe));
        uint256 totalUSDC = 0;

        for (uint256 i = 0; i < deposits.length; i++) {
            DepositInput memory dep = deposits[i];
            if (dep.token == USDC) {
                // Add directly to total if USDC
                totalUSDC += dep.amount;
            } else {
                // Track USDC received from swap
                uint256 preSwapBalance = IERC20(USDC).balanceOf(address(safe));
                _swap(safe, dep.token, dep.amount, USDC);
                uint256 postSwapBalance = IERC20(USDC).balanceOf(address(safe));
                totalUSDC += (postSwapBalance - preSwapBalance);
            }
        }

        // Verify we actually received the deposited USDC amounts
        uint256 finalBalance = IERC20(USDC).balanceOf(address(safe));
        require(
            finalBalance >= initialUSDCBalance + totalUSDC,
            "USDC deposit mismatch"
        );

        require(totalUSDC > 0, "No USDC available after swaps");

        // Retrieve pool token addresses
        ICLPool poolContract = ICLPool(pool);
        address token0 = poolContract.token0();
        address token1 = poolContract.token1();

        // Get current pool parameters
        (uint160 sqrtPriceX96, int24 currentTick, , , , ) = poolContract
            .slot0();
        int24 tickSpacing = poolContract.tickSpacing();

        // Compute tick boundaries
        int24 tickLower = int24(currentTick - (ticksBelow * tickSpacing));
        int24 tickUpper = int24(currentTick + (ticksAbove * tickSpacing));

        // Get ideal amounts using helper
        (uint256 idealAmount0, uint256 idealAmount1) = _calculateIdealAmounts(
            totalUSDC,
            pool,
            sqrtPriceX96,
            tickLower,
            tickUpper
        );

        // Swap from USDC to pool tokens as needed
        if (token0 != USDC) {
            _swap(safe, USDC, idealAmount0, token0);
        }
        if (token1 != USDC) {
            _swap(safe, USDC, idealAmount1, token1);
        }

        // Query updated balances for token0 and token1 held by the safe
        uint256 balanceToken0 = IERC20(token0).balanceOf(address(safe));
        uint256 balanceToken1 = IERC20(token1).balanceOf(address(safe));
        require(
            balanceToken0 > 0 && balanceToken1 > 0,
            "Insufficient token balances after swaps"
        );

        // Calculate liquidity using helper
        (, uint256 usedAmount0, uint256 usedAmount1) = _calculateLiquidity(
            sqrtPriceX96,
            ISlipstreamSugar(slipstreamSugar).getSqrtRatioAtTick(tickLower),
            ISlipstreamSugar(slipstreamSugar).getSqrtRatioAtTick(tickUpper),
            balanceToken0,
            balanceToken1
        );

        // Ensure that at least 98% of each token balance is utilized
        require(
            usedAmount0 >= (balanceToken0 * 98) / 100,
            "Token0 used less than 98%"
        );
        require(
            usedAmount1 >= (balanceToken1 * 98) / 100,
            "Token1 used less than 98%"
        );

        // Prepare parameters for minting a new position via the NFT manager
        address nftManager = poolContract.nft();
        INonfungiblePositionManager.MintParams
            memory params = INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                tickSpacing: tickSpacing,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: balanceToken0,
                amount1Desired: balanceToken1,
                amount0Min: (balanceToken0 * 98) / 100,
                amount1Min: (balanceToken1 * 98) / 100,
                recipient: address(safe),
                deadline: block.timestamp + 300,
                sqrtPriceX96: sqrtPriceX96
            });

        // Mint the liquidity position via the safe
        bytes memory mintData = abi.encodeWithSelector(
            INonfungiblePositionManager.mint.selector,
            params
        );
        (bool success, bytes memory returnData) = safe
            .execTransactionFromModuleReturnData(
                nftManager,
                0,
                mintData,
                Enum.Operation.Call
            );
        require(success, "Mint failed");

        (uint256 tokenId, , , ) = abi.decode(
            returnData,
            (uint256, uint128, uint256, uint256)
        );
        emit DepositMaxCompleted(address(safe), pool, tokenId);
    }
}
