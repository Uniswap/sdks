import { type AbiEvent, parseAbi, parseAbiItem } from 'viem'

/**
 * Minimal human-readable const ABIs the blockfeed sources and discovery read from. Each keeps only
 * the entries actually invoked, so viem's type inference stays tight and bundles stay small.
 */

/**
 * The three Multicall3 self-calls that anchor every tick's identity (block number, parent hash,
 * timestamp). See the tick reader's call site for why bundling them into the same `aggregate3` batch
 * is what makes a tick atomic.
 */
export const MULTICALL3_HELPER_ABI = parseAbi([
  'function getBlockNumber() view returns (uint256 blockNumber)',
  'function getLastBlockHash() view returns (bytes32 blockHash)',
  'function getCurrentBlockTimestamp() view returns (uint256 timestamp)',
])

/** Uniswap v2 pair: spot reserves plus the sorted token accessors (used by discovery). */
export const V2_PAIR_ABI = parseAbi([
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
])

/** Uniswap v3 pool: current price via slot0 and in-range liquidity. */
export const V3_POOL_ABI = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() view returns (uint128)',
])

/** Uniswap v4 StateView: pool state by poolId. `sqrtPriceX96 == 0` means the pool is uninitialized. */
export const STATE_VIEW_ABI = parseAbi([
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
  'function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)',
])

/** Uniswap v2 factory: canonical pair lookup for a token pair. */
export const V2_FACTORY_ABI = parseAbi(['function getPair(address tokenA, address tokenB) view returns (address pair)'])

/** Uniswap v3 factory: pool lookup for a token pair at a fee tier. */
export const V3_FACTORY_ABI = parseAbi([
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
])

/**
 * Uniswap v4 PoolManager `Initialize` event — `currency0`/`currency1` are indexed, so an
 * `eth_getLogs` scan per token surfaces every v4 pool containing it, each log carrying the full
 * PoolKey (discovery, §5).
 */
export const V4_POOL_MANAGER_INITIALIZE_EVENT: AbiEvent = parseAbiItem(
  'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)'
)

/** Uniswap v3 QuoterV2: two-way executable probe quotes (discovery evaluation, §5). */
export const QUOTER_V2_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
])

/** Uniswap v4 Quoter: probe quotes across arbitrary PoolKeys (discovery evaluation, §5). */
export const V4_QUOTER_ABI = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'function quoteExactInputSingle((PoolKey poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)',
])
