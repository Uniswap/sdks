import { defaultAbiCoder } from 'ethers/lib/utils'

/**
 * V4 ActionType
 * @enum {number}
 */
export enum ActionType {
  INCREASE_LIQUIDITY = 0x00,
  DECREASE_LIQUIDITY = 0x01,
  MINT_POSITION = 0x02,
  BURN_POSITION = 0x03,
  SETTLE = 0x09,
  SETTLE_PAIR = 0x11,
  TAKE = 0x12,
  TAKE_PAIR = 0x15,
}

/**
 * 
struct PoolKey {
    /// @notice The lower currency of the pool, sorted numerically
    Currency currency0;
    /// @notice The higher currency of the pool, sorted numerically
    Currency currency1;
    /// @notice The pool swap fee, capped at 1_000_000. If the highest bit is 1, the pool has a dynamic fee and must be exactly equal to 0x800000
    uint24 fee;
    /// @notice Ticks that involve positions must be a multiple of tick spacing
    int24 tickSpacing;
    /// @notice The hooks of the pool
    IHooks hooks;
}
 */
const POOL_KEY_STRUCT = '(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)'

/**
 struct PathKey {
    Currency intermediateCurrency;
    uint24 fee;
    int24 tickSpacing;
    IHooks hooks;
    bytes hookData;
  }
 */
const PATH_KEY_STRUCT = '(address,uint24,int24,address,bytes)'

export const ABI_DEFINITION: { [key in ActionType]: string[] } = {
  [ActionType.INCREASE_LIQUIDITY]: [
    'uint256 tokenId',
    'uint256 liquidity',
    'uint128 amount0Max',
    'uint128 amount1Max',
    'bytes hookData',
  ],
  [ActionType.DECREASE_LIQUIDITY]: [
    'uint256 tokenId',
    'uint256 liquidity',
    'uint128 amount0Min',
    'uint128 amount1Min',
    'bytes hookData',
  ],
  [ActionType.MINT_POSITION]: [
    POOL_KEY_STRUCT,
    'int24 tickLower',
    'int24 tickUpper',
    'uint256 liquidity',
    'uint128 amount0Max',
    'uint128 amount1Max',
    'address owner',
    'bytes hookData',
  ],
  [ActionType.BURN_POSITION]: ['uint256 tokenId', 'uint128 amount0Min', 'uint128 amount1Min', 'bytes hookData'],
  [ActionType.SETTLE]: ['address currency', 'uint256 amount', 'bool payerIsUser'],
  [ActionType.SETTLE_PAIR]: ['address currency0', 'address currency1'],
  [ActionType.TAKE]: ['address currency', 'address recipient', 'uint256 amount'],
  [ActionType.TAKE_PAIR]: ['address currency0', 'address currency1', 'address recipient'],
}

export type RouterCommand = {
  type: ActionType
  encodedInput: string
}

export function encodeAction(type: ActionType, parameters: any[]): RouterCommand {
  const encodedInput = defaultAbiCoder.encode(ABI_DEFINITION[type], parameters)
  return { type, encodedInput }
}

export function decodeAction(type: ActionType, encodedInput: string): any {
  return defaultAbiCoder.decode(ABI_DEFINITION[type], encodedInput)
}
