import { ChainId } from '@uniswap/sdk-core'

// https://eips.ethereum.org/EIPS/eip-7702
export const DELEGATION_MAGIC_PREFIX = '0xef0100';

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
  BATCHED_CALL_CAN_REVERT = '0x0101000000000000000000000000000000000000000000000000000000000000',
  BATCHED_CALL_SUPPORTS_OPDATA = '0x0100000000007821000100000000000000000000000000000000000000000000',
  BATCHED_CALL_SUPPORTS_OPDATA_AND_CAN_REVERT = '0x0101000000007821000100000000000000000000000000000000000000000000'
}

const BATCHED_CALL_EXECUTION_DATA_ABI = [
  {
    type: 'tuple[]',
    components: [
      { type: 'address', name: 'to' },
      { type: 'uint256', name: 'value' },
      { type: 'bytes', name: 'data' }
    ]
  }
]

const BATCHED_CALL_SUPPORTS_OPDATA_EXECUTION_DATA_ABI = [
  ...BATCHED_CALL_EXECUTION_DATA_ABI,
  { type: 'bytes', name: 'opData' }
]

/**
 * ABI encoding for each mode type
 */
export const MODE_TYPE_ABI_PARAMETERS = {
  [ModeType.BATCHED_CALL]: BATCHED_CALL_EXECUTION_DATA_ABI,
  [ModeType.BATCHED_CALL_CAN_REVERT]: BATCHED_CALL_EXECUTION_DATA_ABI,
  [ModeType.BATCHED_CALL_SUPPORTS_OPDATA]: BATCHED_CALL_SUPPORTS_OPDATA_EXECUTION_DATA_ABI,
  [ModeType.BATCHED_CALL_SUPPORTS_OPDATA_AND_CAN_REVERT]: BATCHED_CALL_SUPPORTS_OPDATA_EXECUTION_DATA_ABI
} as const

/**
 * Mapping of chainId to Smart Wallet contract addresses
 */
export const SMART_WALLET_ADDRESSES: { [chainId in ChainId]?: `0x${string}` } = {
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
