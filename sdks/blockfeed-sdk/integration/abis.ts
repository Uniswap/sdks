import { type AbiEvent, parseAbi, parseAbiItem } from 'viem'

/**
 * Shared ABI fragments for the fork integration tests. The SDK intentionally exposes only read/log
 * descriptors, so the write-side calldata (bid submission, swaps, pool seeding) and the extra token
 * views the tests drive live here, in ONE place, rather than inline in each fork suite.
 */

/** ERC-20 surface the fork tests exercise (approve/transfer/balanceOf/deposit + the Transfer event). */
export const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function deposit() payable',
])

/** The ERC-20 `Transfer` event (engine fork suite watches it as a log filter). */
export const TRANSFER_EVENT: AbiEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

/**
 * ContinuousClearingAuction write/read surface, `submitBid` ported from the backend AuctionAbi
 * (data-api Auctions/AuctionAbi.ts) — the same source the SDK ported `BidSubmitted` from. Kept in the
 * tests (not the SDK): the SDK exposes only read/log descriptors for auctions, not bid calldata.
 */
export const CCA_BID_ABI = parseAbi([
  'function submitBid(uint256 maxPrice, uint128 amount, address owner, bytes hookData) payable returns (uint256)',
  'function isGraduated() view returns (bool)',
  'function currencyRaised() view returns (uint256)',
  'function checkpoint() returns (uint256 clearingPrice, uint256 a, uint256 b, uint24 c, uint64 d, uint64 e)',
])

/** v4 StateView `getSlot0` for the direct pool-price cross-check. */
export const STATE_VIEW_GETSLOT0_ABI = parseAbi([
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
])

/** v3 pool: current price + in-range liquidity. */
export const V3_POOL_ABI = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() view returns (uint128)',
])

/** v3 factory: pool lookup by pair + fee. */
export const V3_FACTORY_ABI = parseAbi(['function getPool(address,address,uint24) view returns (address)'])

/** v4 PoolManager: pool initialization. */
export const POOL_MANAGER_ABI = parseAbi([
  'function initialize((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, uint160 sqrtPriceX96) returns (int24 tick)',
])

/** SwapRouter02 exact-input single-hop swap. */
export const SWAP_ROUTER_ABI = parseAbi([
  'struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }',
  'function exactInputSingle(ExactInputSingleParams params) payable returns (uint256 amountOut)',
])

/** v3 NonfungiblePositionManager: pool create/initialize + mint. */
export const NPM_ABI = parseAbi([
  'function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) payable returns (address pool)',
  'struct MintParams { address token0; address token1; uint24 fee; int24 tickLower; int24 tickUpper; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; address recipient; uint256 deadline; }',
  'function mint(MintParams params) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
])
