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

    function depositMax(
        DepositInput[] calldata deposits,
        address pool,
        int256 ticksBelow,
        int256 ticksAbove
    ) external payable {
        ISafe safe = ISafe(msg.sender);
        ICholoDromeModule choloDrome = ICholoDromeModule(choloDromeModule);

        address USDC = choloDrome.USDC();

        // Track initial balances before any operations
        uint256 initialUSDCBalance = IERC20(USDC).balanceOf(address(safe));
        address token0 = ICLPool(pool).token0();
        address token1 = ICLPool(pool).token1();
        uint256 initialToken0Balance = IERC20(token0).balanceOf(address(safe));
        uint256 initialToken1Balance = IERC20(token1).balanceOf(address(safe));

        // Convert all deposit amounts to USDC
        uint256 totalUSDCAllowed = 0;

        for (uint256 i = 0; i < deposits.length; i++) {
            DepositInput memory dep = deposits[i];
            if (dep.token == USDC) {
                totalUSDCAllowed += dep.amount;
            } else {
                uint256 preSwapBalance = IERC20(USDC).balanceOf(address(safe));
                _swap(safe, dep.token, dep.amount, USDC);
                uint256 postSwapBalance = IERC20(USDC).balanceOf(address(safe));
                totalUSDCAllowed += (postSwapBalance - preSwapBalance);
            }
        }

        // Verify actual USDC received matches deposits
        uint256 finalUSDCBalance = IERC20(USDC).balanceOf(address(safe));
        require(
            finalUSDCBalance == initialUSDCBalance + totalUSDCAllowed,
            "USDC deposit mismatch"
        );

        // After swaps, calculate available amounts using only deposited funds
        uint256 balanceToken0 = IERC20(token0).balanceOf(address(safe)) -
            initialToken0Balance;
        uint256 balanceToken1 = IERC20(token1).balanceOf(address(safe)) -
            initialToken1Balance;

        // Verify USDC usage matches deposited amount
        bool isUSDCtoken0 = (token0 == USDC);
        bool isUSDCtoken1 = (token1 == USDC);
        if (isUSDCtoken0) {
            require(
                balanceToken0 == totalUSDCAllowed,
                "USDC usage exceeds deposit"
            );
        } else {
            require(
                balanceToken1 == totalUSDCAllowed,
                "USDC usage exceeds deposit"
            );
        }

        // Retrieve pool token addresses
        ICLPool poolContract = ICLPool(pool);
        require(isUSDCtoken0 || isUSDCtoken1, "Pool must contain USDC");

        // Get current pool parameters
        (uint160 sqrtPriceX96, int24 currentTick, , , , ) = poolContract
            .slot0();
        int24 tickSpacing = poolContract.tickSpacing();

        // Compute tick boundaries
        int24 tickLower = int24(currentTick - (ticksBelow * tickSpacing));
        int24 tickUpper = int24(currentTick + (ticksAbove * tickSpacing));

        // Calculate required amounts using liquidity math
        (uint160 sqrtPriceLower, uint160 sqrtPriceUpper) = (
            ISlipstreamSugar(slipstreamSugar).getSqrtRatioAtTick(tickLower),
            ISlipstreamSugar(slipstreamSugar).getSqrtRatioAtTick(tickUpper)
        );

        // Calculate liquidity using only deposited amounts
        (, uint256 usedAmount0, uint256 usedAmount1) = _calculateLiquidity(
            sqrtPriceX96,
            sqrtPriceLower,
            sqrtPriceUpper,
            isUSDCtoken0 ? totalUSDCAllowed : balanceToken0,
            isUSDCtoken1 ? totalUSDCAllowed : balanceToken1
        );

        // Ensure that at least 98% of each token balance is utilized
        require(
            usedAmount0 >=
                (isUSDCtoken0 ? totalUSDCAllowed : balanceToken0 * 98) / 100,
            "Token0 used less than 98%"
        );
        require(
            usedAmount1 >=
                (isUSDCtoken1 ? totalUSDCAllowed : balanceToken1 * 98) / 100,
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
                amount0Desired: isUSDCtoken0 ? totalUSDCAllowed : balanceToken0,
                amount1Desired: isUSDCtoken1 ? totalUSDCAllowed : balanceToken1,
                amount0Min: (
                    isUSDCtoken0 ? totalUSDCAllowed : balanceToken0 * 98
                ) / 100,
                amount1Min: (
                    isUSDCtoken1 ? totalUSDCAllowed : balanceToken1 * 98
                ) / 100,
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
