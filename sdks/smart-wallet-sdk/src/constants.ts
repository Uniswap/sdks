import { ChainId } from '@uniswap/sdk-core'

/**
 * The target address for self-calls is address(0)
 */
export const SELF_CALL_TARGET = "0x0000000000000000000000000000000000000000"

/**
 * Call types for smart wallet calls
 * Follows ERC-7579
 */
export enum ModeType {
  BATCHED_CALL = '0x0100000000000000000000000000000000000000000000000000000000000000',
  BATCHED_CAN_REVERT_CALL = '0x0101000000000000000000000000000000000000000000000000000000000000',
  BATCHED_CALL_SUPPORTS_OPDATA = '0x0100000000007821000100000000000000000000000000000000000000000000',
  BATCHED_CALL_SUPPORTS_OPDATA_AND_CAN_REVERT = '0x0101000000007821000100000000000000000000000000000000000000000000'
}

/**
 * ABI encoding for each mode type
 */
export const MODE_TYPE_ABI_ENCODING = {
  [ModeType.BATCHED_CALL]: ['(address,uint256,bytes)[]'],
  [ModeType.BATCHED_CAN_REVERT_CALL]: ['(address,uint256,bytes)[]'],
  [ModeType.BATCHED_CALL_SUPPORTS_OPDATA]: ['(address,uint256,bytes)[]', 'bytes'],
  [ModeType.BATCHED_CALL_SUPPORTS_OPDATA_AND_CAN_REVERT]: ['(address,uint256,bytes)[]', 'bytes']
}

/**
 * Call types for smart wallet calls
 * Follows ERC-7579
 */
export enum ERC7579CallType {
  BATCHED_CALL = 1
}

/**
 * Execution types for smart wallet calls
 * Follows ERC-7579
 */
export enum ERC7579ExecutionType {
  /** A batch call where if any of the calls fail, the whole transaction reverts */
  REVERT_ON_FAILURE = 0,
  /** A batch call where if one of the calls fails but specifies to continue, the transaction continues */
  CAN_REVERT = 1
}

/**
 * Mode selectors for smart wallet calls
 * Follows ERC-7579 and ERC-7821
 */
export enum ERC7579ModeSelector {
  BATCHED_CALL = 0,
  BATCHED_CALL_SUPPORTS_OPDATA = 0x78210001
}

/**
 * Mapping of chainId to Smart Wallet contract addresses
 */
export const SMART_WALLET_ADDRESSES: { [chainId in ChainId]?: string } = {
  // Mainnet
  [ChainId.MAINNET]: '0x0000000000000000000000000000000000000000', // Placeholder - to be replaced
  // Optimism
  [ChainId.OPTIMISM]: '0x0000000000000000000000000000000000000000', // Placeholder - to be replaced
  // Polygon
  [ChainId.POLYGON]: '0x0000000000000000000000000000000000000000', // Placeholder - to be replaced
  // Arbitrum
  [ChainId.ARBITRUM_ONE]: '0x0000000000000000000000000000000000000000', // Placeholder - to be replaced
  // Base
  [ChainId.BASE]: '0x0000000000000000000000000000000000000000', // Placeholder - to be replaced
}
