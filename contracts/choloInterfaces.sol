// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

struct Route {
    address from;
    address to;
    bool stable;
}

interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    function decimals() external view returns (uint8);
}

interface ICLPool {
    /// @notice The gauge corresponding to this pool
    /// @return The gauge contract address
    function gauge() external view returns (address);

    /// @notice The nft manager
    /// @return The nft manager contract address
    function nft() external view returns (address);
}

interface ICLGauge {
    /// @notice Check whether a position is staked in the gauge by a certain user
    /// @param depositor The address of the user
    /// @param tokenId The tokenId of the position
    /// @return Whether the position is staked in the gauge
    function stakedContains(
        address depositor,
        uint256 tokenId
    ) external view returns (bool);

    /// @notice Used to deposit a CL position into the gauge
    /// @notice Allows the user to receive emissions instead of fees
    /// @param tokenId The tokenId of the position
    function deposit(uint256 tokenId) external;

    /// @notice Returns the claimable rewards for a given account and tokenId
    /// @dev Throws if account is not the position owner
    /// @dev pool.updateRewardsGrowthGlobal() needs to be called first, to return the correct claimable rewards
    /// @param account The address of the user
    /// @param tokenId The tokenId of the position
    /// @return The amount of claimable reward
    function earned(
        address account,
        uint256 tokenId
    ) external view returns (uint256);

    /// @notice Used to withdraw a CL position from the gauge
    /// @notice Allows the user to receive fees instead of emissions
    /// @notice Outstanding emissions will be collected on withdrawal
    /// @param tokenId The tokenId of the position
    function withdraw(uint256 tokenId) external;

    /// @notice Retrieve rewards for a tokenId
    /// @dev Throws if not called by the position owner
    /// @param tokenId The tokenId of the position
    function getReward(uint256 tokenId) external;
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

    /// @notice Returns true if operator is approved to transfer all of owner's tokens
    /// @param owner The address that owns the NFTs
    /// @param operator The address that acts on behalf of the owner
    /// @return True if operator is approved to transfer all of owner's tokens
    function isApprovedForAll(
        address owner,
        address operator
    ) external view returns (bool);

    /// @notice Approve or remove operator as an operator for the caller
    /// @param operator The address to approve/remove as an operator
    /// @param approved True if the operator is approved, false to revoke approval
    function setApprovalForAll(address operator, bool approved) external;

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
            uint128 tokensOwed1
        );

    /// @notice Decreases the amount of liquidity in a position and accounts it to the position
    /// @param params tokenId The ID of the token for which liquidity is being decreased,
    /// amount The amount by which liquidity will be decreased,
    /// amount0Min The minimum amount of token0 that should be accounted for the burned liquidity,
    /// amount1Min The minimum amount of token1 that should be accounted for the burned liquidity,
    /// deadline The time by which the transaction must be included to effect the change
    /// @return amount0 The amount of token0 accounted to the position's tokens owed
    /// @return amount1 The amount of token1 accounted to the position's tokens owed
    /// @dev The use of this function can cause a loss to users of the NonfungiblePositionManager
    /// @dev for tokens that have very high decimals.
    /// @dev The amount of tokens necessary for the loss is: 3.4028237e+38.
    /// @dev This is equivalent to 1e20 value with 18 decimals.
    function decreaseLiquidity(
        DecreaseLiquidityParams calldata params
    ) external payable returns (uint256 amount0, uint256 amount1);

    /// @notice Collects up to a maximum amount of fees owed to a specific position to the recipient
    /// @notice Used to update staked positions before deposit and withdraw
    /// @param params tokenId The ID of the NFT for which tokens are being collected,
    /// recipient The account that should receive the tokens,
    /// amount0Max The maximum amount of token0 to collect,
    /// amount1Max The maximum amount of token1 to collect
    /// @return amount0 The amount of fees collected in token0
    /// @return amount1 The amount of fees collected in token1
    function collect(
        CollectParams calldata params
    ) external returns (uint256 amount0, uint256 amount1);

    /// @notice Burns a token ID, which deletes it from the NFT contract. The token must have 0 liquidity and all tokens
    /// must be collected first.
    /// @param tokenId The ID of the token that is being burned
    function burn(uint256 tokenId) external payable;
}
