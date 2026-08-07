import { parseAbi } from 'viem'

// ---------------------------------------------------------------------------
// All ABIs are viem-native (parseAbi over human-readable signatures) — no
// ethers Interface, no generated JSON artifacts. Kept minimal: only the
// functions/events this SDK actually calls or watches.
// ---------------------------------------------------------------------------

export const V2_FACTORY_ABI = parseAbi([
  'function getPair(address tokenA, address tokenB) view returns (address pair)',
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)',
])

export const V2_PAIR_ABI = parseAbi([
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
])

export const V3_FACTORY_ABI = parseAbi([
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
  'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
  'event FeeAmountEnabled(uint24 indexed fee, int24 indexed tickSpacing)',
])

export const QUOTER_V2_ABI = parseAbi([
  'function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)',
])

export const V4_POOL_MANAGER_ABI = parseAbi([
  'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)',
])

export const V4_QUOTER_ABI = parseAbi([
  'function quoteExactInput((address exactCurrency, (address intermediateCurrency, uint24 fee, int24 tickSpacing, address hooks, bytes hookData)[] path, uint128 exactAmount) params) returns (uint256 amountOut, uint256 gasEstimate)',
])

/**
 * The one Multicall3 function this package uses. `aggregate3` (not `aggregate`/`tryAggregate`)
 * because `allowFailure: true` per call is the whole point: a reverting quote must fail THAT slot —
 * with its revert data preserved verbatim in `returnData` — while every other quote in the batch
 * still answers, which is exactly the per-candidate isolation `mapConcurrent` gives the per-call
 * path. See `internal/multicall.ts` for the dispatch seam built on this.
 */
export const MULTICALL3_ABI = parseAbi([
  'struct Call3 { address target; bool allowFailure; bytes callData; }',
  'struct Result { bool success; bytes returnData; }',
  'function aggregate3(Call3[] calldata calls) payable returns (Result[] memory returnData)',
])

export const UR_ABI = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable'])

export const PERMIT2_ABI = parseAbi([
  'function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
])

export const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
])
