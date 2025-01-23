// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

struct Route {
    address from;
    address to;
    bool stable;
}

interface ICLPool {
    function gauge() external view returns (address);
}

interface ICLGauge {
    function stakedContains(
        address depositor,
        uint256 tokenId
    ) external view returns (bool);

    function earned(
        address account,
        uint256 tokenId
    ) external view returns (uint256);

    function withdraw(uint256 tokenId) external;
}

interface INonfungiblePositionManager {
    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function positions(
        uint256 tokenId
    )
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            int24 tickSpacing,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1,
            address pool
        );

    function decreaseLiquidity(
        DecreaseLiquidityParams calldata params
    ) external returns (uint256 amount0, uint256 amount1);

    function collect(
        CollectParams calldata params
    ) external returns (uint256 amount0, uint256 amount1);

    function burn(uint256 tokenId) external;
}

interface IMixedRouteQuoterV1 {
    /// @notice Returns the amount out received for a given exact input swap without executing the swap
    /// @dev These functions are not marked view because they rely on calling non-view functions and reverting
    /// to compute the result. They are also not gas efficient and should not be called on-chain.
    function quoteExactInput(
        bytes memory path,
        uint256 amountIn
    )
        external
        returns (
            uint256 amountOut,
            uint160[] memory v3SqrtPriceX96AfterList,
            uint32[] memory v3InitializedTicksCrossedList,
            uint256 v3SwapGasEstimate
        );
}

interface IUniversalRouter {
    function execute(
        bytes calldata commands,
        bytes[] calldata inputs
    ) external payable;
}
