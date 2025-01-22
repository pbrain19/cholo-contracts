// SPDX-License-Identifier: LGPL-3.0
pragma solidity ^0.8.0;
// Imports will be added here
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@safe-global/safe-contracts/contracts/common/Enum.sol";
import "@safe-global/safe-contracts/contracts/Safe.sol";
import "contracts/interfaces/external/velodrome/periphery/interfaces/INonfungiblePositionManager.sol";
import "contracts/interfaces/external/velodrome/core/interfaces/ICLPool.sol";
import "contracts/interfaces/external/velodrome/gauge/interfaces/ICLGauge.sol";

contract CholoModule {
  // State variables will be added here

  address public immutable owner;
  
  // Mapping of Safe => NFT Position Manager => is approved
  mapping(address => mapping(address => bool)) public approvedManagers;

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

  constructor(address _owner) {
    require(_owner != address(0), "Invalid owner");
    owner = _owner;
  }

  modifier onlyOwner() {
    require(msg.sender == owner, "Only owner");
    _;
  }
 

  /// @notice Batch approve multiple NFT position managers for a Safe
  /// @dev Can only be called by the owner
  /// @param managers Array of NFT position manager addresses to approve
  function batchApproveManagers(address[] calldata managers) onlyOwner external {
    for(uint i = 0; i < managers.length; i++) {
      require(managers[i] != address(0), "Invalid manager");
      approvedManagers[msg.sender][managers[i]] = true;
      emit ManagerApproved(msg.sender, managers[i]);
    }
  }

  /// @notice Batch remove approval for multiple NFT position managers for a Safe
  /// @dev Can only be called by the owner
  /// @param managers Array of NFT position manager addresses to remove
  function batchRemoveManagers(address[] calldata managers) onlyOwner  external {
    for(uint i = 0; i < managers.length; i++) {
      delete approvedManagers[msg.sender][managers[i]];
      emit ManagerRemoved(msg.sender, managers[i]);
    }
  }

  /// @notice Executes a transaction through the Safe to withdraw liquidity, collect fees, and burn the NFT
  /// @param manager The NFT position manager contract
  /// @param tokenId The NFT token ID to process
  function withdrawAndCollect(
    address manager,
    uint256 tokenId
  ) external {
    require(approvedManagers[msg.sender][manager], "Manager not approved for Safe");
    
    Safe safe = Safe(payable(msg.sender));
    INonfungiblePositionManager nftManager = INonfungiblePositionManager(manager);
    
    // Get position details to find the pool
    (,, address token0, address token1, int24 tickSpacing,,, uint128 liquidity,,,,) = nftManager.positions(tokenId);
    
    // Get the pool address from the position details
    bytes32 poolKey = keccak256(abi.encodePacked(token0, token1, tickSpacing));
    address pool = address(uint160(uint256(poolKey))); // This is a simplified version, you should use your actual pool address derivation
    
    // Check if position is staked in the pool's gauge
    address gauge = ICLPool(pool).gauge();
    bool isStaked = false;
    
    if (gauge != address(0)) {
      ICLGauge clGauge = ICLGauge(gauge);
      
      isStaked = clGauge.stakedContains(address(safe), tokenId);
      
      // If staked, withdraw from gauge first
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
    }

    uint256 amount0;
    uint256 amount1;

    if (liquidity > 0) {
      // Decrease all liquidity
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
    }

    // Collect all fees
    bytes memory collectData = abi.encodeWithSelector(
      INonfungiblePositionManager.collect.selector,
      INonfungiblePositionManager.CollectParams({
        tokenId: tokenId,
        recipient: address(safe),
        amount0Max: type(uint128).max,
        amount1Max: type(uint128).max
      })
    );
    
    // Execute collect and get return data
    (bool success, bytes memory returnData) = safe.execTransactionFromModuleReturnData(
      manager,
      0,
      collectData,
      Enum.Operation.Call
    );
    require(success, "Collect failed");
    (amount0, amount1) = abi.decode(returnData, (uint256, uint256));

    // Burn NFT
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

    emit WithdrawAndCollect(address(safe), manager, tokenId, isStaked, amount0, amount1);
  }
 

  // Functions will be added here
}