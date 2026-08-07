import { parseAbi } from 'viem'

/**
 * Write-side ABI fragments for the fork harness.
 *
 * The SDK under test is read-only (it produces calldata but never sends it), so every contract the
 * harness *writes* to — factories, position managers, Permit2 — lives here rather than in `src/`.
 * Keeping them in one file also keeps the harness independent of the SDK's own ABIs: a bug in
 * `src/internal/abis.ts` must not be able to hide itself by being reused as ground truth.
 */

/** Our `TestERC20` surface plus the standard reads (`mint` is open on the test token only). */
export const ERC20_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function mint(address to, uint256 amount)',
])

/** WETH9's native wrap/unwrap. */
export const WETH_ABI = parseAbi(['function deposit() payable', 'function withdraw(uint256)'])

export const V2_FACTORY_ABI = parseAbi([
  'function createPair(address tokenA, address tokenB) returns (address pair)',
  'function getPair(address tokenA, address tokenB) view returns (address pair)',
])

export const V2_PAIR_ABI = parseAbi([
  'function mint(address to) returns (uint256 liquidity)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function totalSupply() view returns (uint256)',
])

export const V3_FACTORY_ABI = parseAbi([
  'function createPool(address tokenA, address tokenB, uint24 fee) returns (address pool)',
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
])

export const V3_POOL_ABI = parseAbi([
  'function initialize(uint160 sqrtPriceX96)',
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() view returns (uint128)',
  'function fee() view returns (uint24)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
])

/** v3 NonfungiblePositionManager — full-range mints. */
export const V3_NFPM_ABI = parseAbi([
  'struct MintParams { address token0; address token1; uint24 fee; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }',
  'function mint(MintParams params) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
])

/** v4 PoolManager — pool creation and state reads. */
export const V4_POOL_MANAGER_ABI = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'function initialize(PoolKey key, uint160 sqrtPriceX96) returns (int24 tick)',
  'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)',
])

/** v4 PositionManager — the `modifyLiquidities` action-encoding entrypoint. */
export const V4_POSITION_MANAGER_ABI = parseAbi([
  'function modifyLiquidities(bytes unlockData, uint256 deadline) payable',
])

/**
 * v4 Quoter — the harness uses it only to prove HOOKS ARE LIVE: quoting runs a real `swap` inside
 * the PoolManager's unlock, so a hook that skims or reverts shows up in the quote.
 */
export const V4_QUOTER_ABI = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }',
  'function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)',
  // v4-periphery `BaseV4Quoter`: raised when the swap could not consume the whole exact amount, i.e.
  // the pool ran out of liquidity before the trade was filled. Declared here so the harness can name
  // the failure it asserts on instead of matching a bare selector. (`PoolId` is a user-defined value
  // type over `bytes32`, which is what the selector is computed from.)
  'error NotEnoughLiquidity(bytes32 poolId)',
  // ...and the envelope it arrives in: the quoter returns its answer BY REVERTING (`QuoteSwap`), so
  // anything that is not that answer gets re-thrown wrapped in this, one layer down.
  'error UnexpectedRevertBytes(bytes revertData)',
])

/** Permit2's allowance-transfer approval (the leg between an ERC20 approval and the router). */
export const PERMIT2_ABI = parseAbi([
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
  'function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
])
