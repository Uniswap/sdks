import { ChainId } from '@uniswap/sdk-core'

// https://eips.ethereum.org/EIPS/eip-7702
export const DELEGATION_MAGIC_PREFIX = '0xef0100';

export const EXECUTE_USER_OP_SELECTOR = '0x8dd7712f'

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
  BATCHED_CALL_CAN_REVERT = '0x0101000000000000000000000000000000000000000000000000000000000000'
}

/**
 * Mapping of chainId to Smart Wallet contract addresses
 * @dev See README for detailed deployment addresses along with the commit hash
 */
export const SMART_WALLET_ADDRESSES: { [chainId in ChainId]?: `0x${string}` } = {
  [ChainId.SEPOLIA]: '0x964914430aAe3e6805675EcF648cEfaED9e546a7'
}
