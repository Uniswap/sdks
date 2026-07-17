import { type Abi, type Address, type Hex, type PublicClient, erc20Abi, zeroAddress } from 'viem'

import {
  CCA_ABI,
  CCA_FACTORY_ABI,
  LBP_STRATEGY_ABI,
  PERMIT2_ABI,
  STATE_VIEW_ABI,
  TICK_DATA_LENS_ABI,
  UERC20_FACTORY_ABI,
  USUPERC20_FACTORY_ABI,
} from './abis'
import type { TokenFactoryKind } from './addresses'
import { computeGraffiti } from './poolId'

/**
 * Read layer. Every read is exposed two ways:
 *  - a pure `*Call` **descriptor** — `{ address, abi, functionName, args }` — that drops straight
 *    into wagmi `useReadContracts`, viem multicall, or any rpc client (the backend runs these
 *    through its own client). The SDK never binds a transport.
 *  - an async helper that executes the descriptor against a viem `PublicClient`, for scripts and
 *    quick server-side use.
 */

/** A framework-agnostic contract read/write descriptor. */
export interface ContractCall<TAbi extends Abi = Abi> {
  address: Address
  abi: TAbi
  functionName: string
  args: readonly unknown[]
}

/** Execute a descriptor against a viem `PublicClient`. */
export async function readContract<T>(client: PublicClient, call: ContractCall): Promise<T> {
  return client.readContract({
    address: call.address,
    abi: call.abi,
    functionName: call.functionName,
    args: call.args,
  }) as Promise<T>
}

// ---------------------------------------------------------------------------
// LBPStrategy.registeredPoolIds + v4 StateView.getSlot0 (pool-availability gates)
// ---------------------------------------------------------------------------

/** `LBPStrategy.registeredPoolIds(poolId)` — returns the reserving initializer, or address(0) if free. */
export function registeredPoolIdCall(p: { lbpStrategy: Address; poolId: Hex }): ContractCall<typeof LBP_STRATEGY_ABI> {
  return { address: p.lbpStrategy, abi: LBP_STRATEGY_ABI, functionName: 'registeredPoolIds', args: [p.poolId] }
}

/** Reads which initializer reserved `poolId` (address(0) when the pool id is free). */
export async function getRegisteredInitializer(
  client: PublicClient,
  p: { lbpStrategy: Address; poolId: Hex }
): Promise<Address> {
  return readContract<Address>(client, registeredPoolIdCall(p))
}

/** `StateView.getSlot0(poolId)` — pool state by id; `sqrtPriceX96 == 0` means uninitialized. */
export function slot0Call(p: { stateView: Address; poolId: Hex }): ContractCall<typeof STATE_VIEW_ABI> {
  return { address: p.stateView, abi: STATE_VIEW_ABI, functionName: 'getSlot0', args: [p.poolId] }
}

/** Whether the v4 pool for `poolId` is already initialized (`sqrtPriceX96 != 0`). */
export async function isV4PoolInitialized(
  client: PublicClient,
  p: { stateView: Address; poolId: Hex }
): Promise<boolean> {
  const [sqrtPriceX96] = await readContract<readonly [bigint, number, number, number]>(client, slot0Call(p))
  return sqrtPriceX96 !== 0n
}

// ---------------------------------------------------------------------------
// ContinuousClearingAuction instance state (post-auction outcome & recovery gates)
// ---------------------------------------------------------------------------

/** `auction.isGraduated()` — whether the auction met its graduation criteria. */
export function isGraduatedCall(auction: Address): ContractCall<typeof CCA_ABI> {
  return { address: auction, abi: CCA_ABI, functionName: 'isGraduated', args: [] }
}
/** `auction.sweepUnsoldTokensBlock()` — 0 until the creator sweeps; non-zero once swept (one-shot). */
export function sweepUnsoldTokensBlockCall(auction: Address): ContractCall<typeof CCA_ABI> {
  return { address: auction, abi: CCA_ABI, functionName: 'sweepUnsoldTokensBlock', args: [] }
}
/** `auction.sweepCurrencyBlock()` — 0 until the raised currency is swept (`migrate()` does this). */
export function sweepCurrencyBlockCall(auction: Address): ContractCall<typeof CCA_ABI> {
  return { address: auction, abi: CCA_ABI, functionName: 'sweepCurrencyBlock', args: [] }
}
/** `auction.currencyRaised()` — total currency raised so far. */
export function currencyRaisedCall(auction: Address): ContractCall<typeof CCA_ABI> {
  return { address: auction, abi: CCA_ABI, functionName: 'currencyRaised', args: [] }
}
/** `auction.remainingSupply()` — tokens not (yet) sold; the graduated-path sweep amount. */
export function remainingSupplyCall(auction: Address): ContractCall<typeof CCA_ABI> {
  return { address: auction, abi: CCA_ABI, functionName: 'remainingSupply', args: [] }
}
/** `auction.tokensRecipient()` — the only address allowed to call `sweepUnsoldTokens()`. */
export function tokensRecipientCall(auction: Address): ContractCall<typeof CCA_ABI> {
  return { address: auction, abi: CCA_ABI, functionName: 'tokensRecipient', args: [] }
}
/** `auction.endBlock()` — when the auction finishes (in the auction's block domain, see below). */
export function auctionEndBlockCall(auction: Address): ContractCall<typeof CCA_ABI> {
  return { address: auction, abi: CCA_ABI, functionName: 'endBlock', args: [] }
}
/** `auction.claimBlock()` — when winning bids become claimable. */
export function auctionClaimBlockCall(auction: Address): ContractCall<typeof CCA_ABI> {
  return { address: auction, abi: CCA_ABI, functionName: 'claimBlock', args: [] }
}

export type AuctionOutcome = 'active' | 'graduated' | 'failed'

/**
 * Derives the auction outcome from already-read state (there is no failure enum on-chain):
 * `active` until `endBlock`, then `graduated` or `failed` by `isGraduated()`. A `failed` auction's
 * creator recovers the full deposited supply via {@link buildSweepUnsoldTokensTx}; a `graduated`
 * one migrates via {@link buildMigrateTx} (and can sweep only the unsold remainder).
 *
 * `currentBlock` must be in the auction's own block domain: the CCA is BlockNumberish-aware, so on
 * chains like Arbitrum it counts L1 (ArbSys) blocks, not the L2 blocks `eth_blockNumber` returns.
 */
export function deriveAuctionOutcome(p: {
  isGraduated: boolean
  endBlock: bigint
  currentBlock: bigint
}): AuctionOutcome {
  if (p.currentBlock < p.endBlock) {
    return 'active'
  }
  return p.isGraduated ? 'graduated' : 'failed'
}

// ---------------------------------------------------------------------------
// CCA live clearing price (auction.checkpoint().clearingPrice)
// ---------------------------------------------------------------------------

/** The live clearing-state checkpoint returned by `auction.checkpoint()`. */
export interface AuctionCheckpoint {
  /** Current clearing price, Q96 raw-currency-per-raw-token. */
  clearingPrice: bigint
  currencyRaisedAtClearingPriceQ96_X7: bigint
  cumulativeMpsPerPrice: bigint
  cumulativeMps: number
  prev: bigint
  next: bigint
}

/**
 * `auction.checkpoint()` — the live per-block clearing state. This is the source the backend reads
 * for the current clearing price (data-api `getLatestCheckpoint`); the CCA price decays with
 * emission every block, so `checkpoint()` recomputes the current-block value rather than returning a
 * stale stored one. Declared `nonpayable` on-chain but read via `eth_call`/multicall; the price of
 * interest is `.clearingPrice` (Q96 raw-currency-per-raw-token).
 */
export function clearingPriceCall(auction: Address): ContractCall<typeof CCA_ABI> {
  return { address: auction, abi: CCA_ABI, functionName: 'checkpoint', args: [] }
}

/** Reads the auction's current clearing price (Q96 raw-currency-per-raw-token) from `checkpoint()`. */
export async function getClearingPrice(client: PublicClient, auction: Address): Promise<bigint> {
  const checkpoint = await readContract<AuctionCheckpoint>(client, clearingPriceCall(auction))
  return checkpoint.clearingPrice
}

// ---------------------------------------------------------------------------
// TickDataLens.getInitializedTickData (live bid-distribution data)
// ---------------------------------------------------------------------------

/** One initialized auction price tick and its demand data. All quantities are Q96. */
export interface InitializedTick {
  priceQ96: bigint
  currencyDemandQ96: bigint
  requiredCurrencyDemandQ96: bigint
  currencyRequiredQ96: bigint
}

/**
 * `TickDataLens.getInitializedTickData(auction)` — the auction's initialized price ticks with their
 * demand data, in a single (non-paginated) call. The lens address is version-specific to the auction
 * factory; resolve it via {@link getTickDataLensForFactory}. The returned order is not guaranteed
 * sorted — sort by `priceQ96` before interpolating.
 */
export function tickDataCall(lens: Address, auction: Address): ContractCall<typeof TICK_DATA_LENS_ABI> {
  return { address: lens, abi: TICK_DATA_LENS_ABI, functionName: 'getInitializedTickData', args: [auction] }
}

/** Reads the auction's initialized tick data from the lens. */
export async function getTickData(
  client: PublicClient,
  lens: Address,
  auction: Address
): Promise<InitializedTick[]> {
  const ticks = await readContract<readonly InitializedTick[]>(client, tickDataCall(lens, auction))
  return ticks.map((t) => ({
    priceQ96: t.priceQ96,
    currencyDemandQ96: t.currencyDemandQ96,
    requiredCurrencyDemandQ96: t.requiredCurrencyDemandQ96,
    currencyRequiredQ96: t.currencyRequiredQ96,
  }))
}

/** A tick's price paired with its fill ratio. */
export interface TickFillRatio {
  /** The tick price, Q96 raw-currency-per-raw-token. */
  priceQ96: bigint
  /**
   * `currencyDemandQ96 / requiredCurrencyDemandQ96` at this tick: `1` is exactly filled, `>1`
   * oversubscribed, `<1` partially filled. `undefined` when required demand is `0` (undefined ratio).
   */
  fillRatio: number | undefined
}

/**
 * Pure: per-tick fill ratio from lens output. Mirrors the frontend's fill-ratio semantics
 * (universe `interpolateFillRatio`): `currencyDemandQ96 / requiredCurrencyDemandQ96`, computed at
 * 1e-4 resolution, `undefined` when required demand is `0`. Does not sort or interpolate — one ratio
 * per input tick, in input order.
 */
export function deriveTickFillRatios(ticks: readonly InitializedTick[]): TickFillRatio[] {
  return ticks.map((t) => ({
    priceQ96: t.priceQ96,
    fillRatio:
      t.requiredCurrencyDemandQ96 === 0n
        ? undefined
        : Number((t.currencyDemandQ96 * 10000n) / t.requiredCurrencyDemandQ96) / 10000,
  }))
}

// ---------------------------------------------------------------------------
// ERC20 + Permit2 allowance reads
// ---------------------------------------------------------------------------

export function erc20DecimalsCall(token: Address): ContractCall<typeof erc20Abi> {
  return { address: token, abi: erc20Abi, functionName: 'decimals', args: [] }
}
export function erc20BalanceCall(token: Address, account: Address): ContractCall<typeof erc20Abi> {
  return { address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account] }
}
export function erc20AllowanceCall(token: Address, owner: Address, spender: Address): ContractCall<typeof erc20Abi> {
  return { address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] }
}
export function permit2AllowanceCall(p: {
  permit2: Address
  owner: Address
  token: Address
  spender: Address
}): ContractCall<typeof PERMIT2_ABI> {
  return { address: p.permit2, abi: PERMIT2_ABI, functionName: 'allowance', args: [p.owner, p.token, p.spender] }
}

export async function getErc20Decimals(client: PublicClient, token: Address): Promise<number> {
  return readContract<number>(client, erc20DecimalsCall(token))
}
export async function getErc20Balance(client: PublicClient, token: Address, account: Address): Promise<bigint> {
  return readContract<bigint>(client, erc20BalanceCall(token, account))
}
export async function getErc20Allowance(
  client: PublicClient,
  token: Address,
  owner: Address,
  spender: Address
): Promise<bigint> {
  return readContract<bigint>(client, erc20AllowanceCall(token, owner, spender))
}

/**
 * Reads the Permit2 `amount` and `expiration` for `owner`'s `token` to `spender`. Callers must check
 * both: an allowance with sufficient amount but a past `expiration` is not spendable.
 */
export async function getPermit2Allowance(
  client: PublicClient,
  p: { permit2: Address; owner: Address; token: Address; spender: Address }
): Promise<{ amount: bigint; expiration: number }> {
  const [amount, expiration] = await readContract<readonly [bigint, number, number]>(client, permit2AllowanceCall(p))
  return { amount, expiration }
}

// ---------------------------------------------------------------------------
// Deterministic address prediction (factory views)
// ---------------------------------------------------------------------------

export interface PredictTokenParams {
  factory: Address
  /** Selects the factory's address-derivation scheme (uERC20 vs super-uERC20). */
  kind: TokenFactoryKind
  /** msg.sender at the factory == the LiquidityLauncher (it calls createToken). */
  launcherAddress: Address
  /** The original creator (tx sender); folded into the graffiti. */
  wallet: Address
  name: string
  symbol: string
  decimals: number
  /** Home chain (== launch chain) id, folded into the super-uERC20 salt. Unused for uERC20. */
  homeChainId: bigint
}

/** The factory view descriptor that returns the deterministic new-token address. */
export function predictTokenAddressCall(p: PredictTokenParams): ContractCall {
  // The original creator rides in the graffiti; the on-chain `creator` is the launcher (msg.sender).
  const graffiti = computeGraffiti(p.wallet)
  if (p.kind === 'usuperc20') {
    return {
      address: p.factory,
      abi: USUPERC20_FACTORY_ABI,
      functionName: 'getUSUPERC20Address',
      args: [p.name, p.symbol, p.decimals, p.homeChainId, p.launcherAddress, graffiti],
    }
  }
  return {
    address: p.factory,
    abi: UERC20_FACTORY_ABI,
    functionName: 'getUERC20Address',
    args: [p.name, p.symbol, p.decimals, p.launcherAddress, graffiti],
  }
}

/** Reads the deterministic new-token address from the factory. */
export async function predictTokenAddress(client: PublicClient, p: PredictTokenParams): Promise<Address> {
  return readContract<Address>(client, predictTokenAddressCall(p))
}

export interface PredictAuctionParams {
  strategy: Address
  token: Address
  /** auctionSupply = totalSupply - reservedTokenAmountForLP. */
  auctionSupply: bigint
  /** `abi.encode(AuctionParameters)` — the inner initializer params. */
  auctionParams: Hex
  initializerSalt: Hex
}

/**
 * Reads the deterministic auction (initializer) address. Two-step: the CCA factory address is read
 * from the strategy's `initializerFactory()`, then its `getAddress(...)` view is queried. The factory
 * re-derives the CREATE2 salt as `keccak256(abi.encode(sender, salt))` and rewrites the address(1)
 * recipient sentinel to `sender` — `sender` is the LBPStrategy (msg.sender), not the creator wallet.
 */
export async function predictAuctionAddress(client: PublicClient, p: PredictAuctionParams): Promise<Address> {
  const factory = await readContract<Address>(client, {
    address: p.strategy,
    abi: LBP_STRATEGY_ABI,
    functionName: 'initializerFactory',
    args: [],
  })
  if (factory === zeroAddress) {
    throw new Error('LBPStrategy.initializerFactory() returned the zero address')
  }
  return readContract<Address>(client, {
    address: factory,
    abi: CCA_FACTORY_ABI,
    functionName: 'getAddress',
    args: [p.token, p.auctionSupply, p.auctionParams, p.initializerSalt, p.strategy],
  })
}
