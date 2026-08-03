import { type Address, type Hex, type PublicClient, getAddress, isAddressEqual } from 'viem'

import { V4_QUOTER_ABI } from './abis'
import {
  getInstantLaunchContracts,
  getInstantLaunchDeployments,
  getInstantLaunchStrategy,
  getLauncherAddresses,
} from './addresses'
import { buildLaunchTransactions, type TransactionRequest } from './build'
import { NEW_TOKEN_DECIMALS, ZERO_ADDRESS } from './constants'
import { encodeInstantLaunchConfig, encodeTokenData } from './encode'
import { LauncherSdkError } from './errors'
import { computeLbpPoolId } from './poolId'
import { type ContractCall, predictTokenAddressCall, readContract } from './reads'
import type { Uerc20Metadata } from './types'

/**
 * Instant Launch — the canonical preset + transaction assembler, mirroring `quickLaunch`'s role for
 * the CCA path. Launch params in → one signable transaction out.
 *
 * On-chain flow (hookless InstantLaunchStrategy): one `LiquidityLauncher.multicall` wrapping
 *   1. `createToken(uerc20Factory, name, symbol, 18, 1e27, launcher, tokenData)`
 *      — mints the fixed 1B supply straight to the launcher, and
 *   2. `distributeToken(token, { strategy, amount: 1e27,
 *      configData: abi.encode(InstantLaunchConfig{feeBeneficiary}) }, salt)`
 *      — the strategy pulls the full supply, initializes the hookless native-ETH v4 pool
 *      (LP_FEE=2500, TICK_SPACING=60, price fixed by the strategy's immutable initialTick),
 *      optionally registers `feeBeneficiary` with the beneficiary vault (minting the transferable
 *      beneficiary ERC721, keyed by the LP position's tokenId) and parks the single-sided LP NFT in
 *      the strategy's FeeSplitter forever. `msg.value` is always 0.
 *
 * Creator fees are a **deployment variant, not a launch parameter**: each chain deploys two strategy
 * instances — one whose immutable `beneficiaryVault` is set (fees on) and one where it is zero (fees
 * off) — and the builder selects between them via `creatorFeesEnabled`. `configData` encodes
 * identically against both (the strategy requires a non-zero, non-launcher beneficiary either way);
 * on the fees-off instance the beneficiary is unused, so the builder encodes
 * {@link DISABLED_CREATOR_FEE_BENEFICIARY} internally.
 *
 * The token address is deterministic (CREATE2 keyed on name/symbol/decimals/creator/graffiti),
 * read from the factory's `getUERC20Address` view — see {@link predictInstantLaunchTokenAddressCall}.
 *
 * Addresses come from the `addresses.ts` Instant Launch deployment registry
 * (`INSTANT_LAUNCH_DEPLOYMENTS` / `INSTANT_LAUNCH_CONTRACTS`) — the one swap point for redeploys.
 */

/**
 * The fully-resolved Instant Launch stack for one (chain, creator-fee variant) pair: the
 * launcher-side contracts every launch uses plus the variant's strategy deployment and the chain
 * singletons. All fields required — {@link getInstantLaunchAddresses} only resolves where the whole
 * stack is deployed.
 */
export interface InstantLaunchAddresses {
  /** LiquidityLauncher singleton — the `multicall` entrypoint the wallet calls. */
  liquidityLauncher: Address
  /** uERC20 token factory `createToken` targets. */
  uerc20Factory: Address
  /** The variant's hookless InstantLaunchStrategy (`Distribution.strategy`). */
  strategy: Address
  /** The strategy's immutable FeeSplitter — permanent LP-NFT custodian + fee distributor. */
  feeSplitter: Address
  /**
   * UERC20BeneficiaryVault singleton — the fee-beneficiary ERC721 registry + the creator share's
   * vault. Only the fees-on strategy registers beneficiaries with it, but it is a chain singleton.
   */
  beneficiaryVault: Address
  /** CompoundingClaimRecipient singleton — the autocompound recipient of every FeeSplitter. */
  compoundingClaimRecipient: Address
  /** Which variant this stack is ({@link InstantLaunchDeployment.creatorFeesEnabled}). */
  creatorFeesEnabled: boolean
}

/**
 * Returns the Instant Launch stack for a chain and creator-fee variant, or `undefined` where any
 * piece of it is not deployed. Derived from the deployment registry, never a second copy.
 */
export function getInstantLaunchAddresses(
  chainId: number,
  options: { creatorFeesEnabled: boolean }
): InstantLaunchAddresses | undefined {
  const launcher = getLauncherAddresses(chainId)
  const contracts = getInstantLaunchContracts(chainId)
  const deployment = getInstantLaunchStrategy(chainId, options)
  if (!launcher?.uerc20Factory || contracts === undefined || deployment === undefined) {
    return undefined
  }
  return {
    liquidityLauncher: launcher.liquidityLauncher,
    uerc20Factory: launcher.uerc20Factory,
    strategy: deployment.strategy,
    feeSplitter: deployment.feeSplitter,
    beneficiaryVault: contracts.beneficiaryVault,
    compoundingClaimRecipient: contracts.compoundingClaimRecipient,
    creatorFeesEnabled: deployment.creatorFeesEnabled,
  }
}

/**
 * Whether Instant Launch is deployed on `chainId` — i.e. {@link getInstantLaunchAddresses} resolves
 * for at least one creator-fee variant.
 */
export function isInstantLaunchSupportedChain(chainId: number): boolean {
  return (
    getInstantLaunchAddresses(chainId, { creatorFeesEnabled: true }) !== undefined ||
    getInstantLaunchAddresses(chainId, { creatorFeesEnabled: false }) !== undefined
  )
}

/** Factory tokens are fixed at 18 decimals (the strategy reverts otherwise). */
export const INSTANT_LAUNCH_TOKEN_DECIMALS = NEW_TOKEN_DECIMALS

/** Fixed, standardized total supply: 1,000,000,000 (1B) whole tokens (minted via the Token Factory). */
export const INSTANT_LAUNCH_TOTAL_SUPPLY = 1_000_000_000n

/**
 * Total supply in raw base units, required exactly by InstantLaunchStrategy: 1B @ 18 decimals = 1e27.
 */
export const INSTANT_LAUNCH_TOTAL_SUPPLY_RAW =
  INSTANT_LAUNCH_TOTAL_SUPPLY * 10n ** BigInt(INSTANT_LAUNCH_TOKEN_DECIMALS)

/**
 * The `feeBeneficiary` the builder encodes when `creatorFeesEnabled` is `false`. The strategy's
 * `InstantLaunchConfig{feeBeneficiary}` is **mandatory on every instance** — including the fees-off
 * one, where the value goes unused (its `beneficiaryVault` immutable is zero, so registration is
 * skipped entirely) — and the strategy reverts on a zero or launcher beneficiary either way. So the
 * placeholder must be a non-zero address that is not the LiquidityLauncher; it is deliberately a
 * protocol-owned contract (the deployed 4663 CompoundingClaimRecipient) rather than a user address,
 * since it must never be mistaken for a creator claim.
 */
export const DISABLED_CREATOR_FEE_BENEFICIARY: Address = '0x666DA63451A502A323677C2Ef5F763181358be9b'

export interface PredictInstantLaunchTokenParams {
  chainId: number
  /** Original creator (tx sender); folded into the CREATE2 graffiti. */
  wallet: Address
  name: string
  symbol: string
}

/**
 * The factory view descriptor for the deterministic new-token address — `predictTokenAddressCall`
 * preconfigured for Instant Launch (uERC20 factory, fixed 18 decimals, the launcher as the on-chain
 * `creator` since it is the factory's msg.sender inside the multicall; the wallet rides in the
 * graffiti). Variant-independent: both strategy instances launch the same token. Execute it with
 * `readContract` / `predictTokenAddress` or any rpc client.
 */
export function predictInstantLaunchTokenAddressCall(params: PredictInstantLaunchTokenParams): ContractCall {
  const { liquidityLauncher, uerc20Factory } = requireInstantLaunchCore(params.chainId)
  return predictTokenAddressCall({
    factory: uerc20Factory,
    kind: 'uerc20',
    launcherAddress: liquidityLauncher,
    wallet: params.wallet,
    name: params.name,
    symbol: params.symbol,
    decimals: INSTANT_LAUNCH_TOKEN_DECIMALS,
    homeChainId: BigInt(params.chainId), // unused for uerc20
  })
}

/** The creator-fee choice: on with an explicit beneficiary, or off (no beneficiary accepted). */
export type InstantLaunchCreatorFeeParams =
  | {
      /** Launch through the fees-on strategy; `feeBeneficiary` receives the creator share. */
      creatorFeesEnabled: true
      /** LP-fee beneficiary — required; the strategy/vault revert on zero, the launcher, or the vault itself. */
      feeBeneficiary: Address
    }
  | {
      /** Launch through the fees-off strategy; 100% of fees autocompound. */
      creatorFeesEnabled: false
      /** Must be omitted — the builder encodes {@link DISABLED_CREATOR_FEE_BENEFICIARY} internally. */
      feeBeneficiary?: undefined
    }

export type BuildInstantLaunchParams = {
  chainId: number
  name: string
  symbol: string
  /** Deterministic new-token address from {@link predictInstantLaunchTokenAddressCall}. */
  predictedTokenAddress: Address
  /** On-chain uERC20 metadata (`image` is the uploaded ipfs:// URL, '' when absent). */
  metadata: Uerc20Metadata
  /** bytes32 user salt (the singleton strategies ignore it, but the launcher call carries it). */
  salt: Hex
} & InstantLaunchCreatorFeeParams

/** A signable Instant Launch transaction — the single launcher `multicall`, tagged with its chain. */
export interface InstantLaunchTransaction extends TransactionRequest {
  chainId: number
}

/**
 * Pure assembler: builds the one-transaction Instant Launch multicall (createToken then
 * distributeToken; `value` is always 0). `creatorFeesEnabled` selects the strategy instance —
 * fees-on launches require a real `feeBeneficiary`, fees-off launches must not pass one (the
 * mandatory config field is filled with {@link DISABLED_CREATOR_FEE_BENEFICIARY}, which the fees-off
 * instance never reads). Mirrors the on-chain guards where they are cheap to check client-side (a
 * zero/launcher feeBeneficiary reverts in the strategy; the vault rejects itself at registration).
 */
export function buildInstantLaunchTransaction(params: BuildInstantLaunchParams): InstantLaunchTransaction {
  const addresses = requireInstantLaunchAddresses(params.chainId, { creatorFeesEnabled: params.creatorFeesEnabled })

  let feeBeneficiary: Address
  if (params.creatorFeesEnabled) {
    if (
      isAddressEqual(params.feeBeneficiary, ZERO_ADDRESS) ||
      isAddressEqual(params.feeBeneficiary, addresses.liquidityLauncher) ||
      isAddressEqual(params.feeBeneficiary, addresses.beneficiaryVault)
    ) {
      throw new LauncherSdkError('INVALID_INPUT', `Invalid Instant Launch fee beneficiary: ${params.feeBeneficiary}`)
    }
    feeBeneficiary = params.feeBeneficiary
  } else {
    if (params.feeBeneficiary !== undefined) {
      throw new LauncherSdkError(
        'INVALID_INPUT',
        'feeBeneficiary must not be set when creator fees are disabled — the fees-off strategy ignores it'
      )
    }
    feeBeneficiary = DISABLED_CREATOR_FEE_BENEFICIARY
  }

  const [transaction] = buildLaunchTransactions({
    liquidityLauncher: addresses.liquidityLauncher,
    token: params.predictedTokenAddress,
    salt: params.salt,
    acquire: {
      kind: 'create',
      args: {
        factory: addresses.uerc20Factory,
        name: params.name,
        symbol: params.symbol,
        decimals: INSTANT_LAUNCH_TOKEN_DECIMALS,
        initialSupply: INSTANT_LAUNCH_TOTAL_SUPPLY_RAW,
        // The launcher must hold the mint: distributeToken approves the strategy, which pulls the
        // full supply from the launcher.
        recipient: addresses.liquidityLauncher,
        tokenData: encodeTokenData(params.metadata),
      },
    },
    distributions: [
      {
        strategy: addresses.strategy,
        amount: INSTANT_LAUNCH_TOTAL_SUPPLY_RAW,
        configData: encodeInstantLaunchConfig({ feeBeneficiary }),
      },
    ],
  })
  if (transaction === undefined) {
    throw new LauncherSdkError('INVALID_INPUT', 'buildLaunchTransactions returned no transaction')
  }
  return { to: transaction.to, data: transaction.data, value: transaction.value, chainId: params.chainId }
}

// ---------------------------------------------------------------------------
// The launch pool: deterministic PoolKey/PoolId derivation + on-chain quoting
// ---------------------------------------------------------------------------

/** InstantLaunchStrategy's compile-time pool LP fee (pips) — `LP_FEE`, unchanged across deploys. */
export const INSTANT_LAUNCH_POOL_LP_FEE = 2500

/** InstantLaunchStrategy's compile-time pool tick spacing — `TICK_SPACING`, unchanged across deploys. */
export const INSTANT_LAUNCH_POOL_TICK_SPACING = 60

/** The launch pool is hookless. */
export const INSTANT_LAUNCH_POOL_HOOKS: Address = ZERO_ADDRESS

/** The launch pool's raise currency: native ETH (address(0)), which always sorts as `currency0`. */
export const INSTANT_LAUNCH_POOL_CURRENCY0: Address = ZERO_ADDRESS

/**
 * InstantLaunchStrategy's compile-time lower tick of every launch position (`MIN_LAUNCH_TICK`) and
 * the exclusive floor for `initialTick`.
 */
export const INSTANT_LAUNCH_MIN_LAUNCH_TICK = -208_980

/**
 * The current 4663 deployments' immutable `initialTick` — the aligned tick the launch pool opens at
 * (highest price; the launch position's upper bound). A per-deployment immutable, not a compile-time
 * constant: the authoritative value for any strategy instance is
 * {@link InstantLaunchDeployment.initialTick} in the deployment registry.
 */
export const INSTANT_LAUNCH_INITIAL_TICK = 198_060

/** A Uniswap v4 `PoolKey` struct mirror (currencies sorted ascending, as the PoolManager requires). */
export interface V4PoolKey {
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks: Address
}

/**
 * The one v4 pool an Instant Launch token trades in: hookless native-ETH pool at the strategy's
 * compile-time fee/spacing. Native ETH (address(0)) sorts below every token, so `currency0` is
 * always ETH and an ETH→token swap is always `zeroForOne`. The token address is EIP-55 normalized.
 * Identical for both creator-fee variants (the pool parameters are compile-time constants).
 */
export function getInstantLaunchPoolKey(token: Address): V4PoolKey {
  return {
    currency0: INSTANT_LAUNCH_POOL_CURRENCY0,
    currency1: normalizeInstantLaunchToken(token),
    fee: INSTANT_LAUNCH_POOL_LP_FEE,
    tickSpacing: INSTANT_LAUNCH_POOL_TICK_SPACING,
    hooks: INSTANT_LAUNCH_POOL_HOOKS,
  }
}

/**
 * The launch pool's v4 PoolId — `keccak256(abi.encode(poolKey))`, matching the on-chain
 * `PoolKey.toId()`. Use it with `slot0Call` / `isV4PoolInitialized` or any StateView read.
 */
export function getInstantLaunchPoolId(token: Address): Hex {
  const key = getInstantLaunchPoolKey(token)
  return computeLbpPoolId(key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks)
}

export interface QuoteInstantLaunchBuyParams {
  /** The chain's v4 View Quoter (caller-supplied, like every read in `reads.ts`). */
  v4Quoter: Address
  /** The Instant Launch token being bought. */
  token: Address
  /** Exact ETH input, in wei. */
  exactAmountInWei: bigint
}

/**
 * `V4Quoter.quoteExactInputSingle` descriptor for an exact-in ETH→token buy on the launch pool
 * (`zeroForOne` since ETH is always `currency0`; no hook data). The quoter quotes by
 * revert-and-catch, so execute this as an `eth_call` simulation (viem `readContract` /
 * {@link quoteInstantLaunchBuy}), never as a transaction. Returns `(amountOut, gasEstimate)`.
 */
export function quoteInstantLaunchBuyCall(params: QuoteInstantLaunchBuyParams): ContractCall<typeof V4_QUOTER_ABI> {
  return {
    address: params.v4Quoter,
    abi: V4_QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: [
      {
        poolKey: getInstantLaunchPoolKey(params.token),
        zeroForOne: true,
        exactAmount: params.exactAmountInWei,
        hookData: '0x',
      },
    ],
  }
}

/** Executes {@link quoteInstantLaunchBuyCall} against a viem `PublicClient`. */
export async function quoteInstantLaunchBuy(
  client: PublicClient,
  params: QuoteInstantLaunchBuyParams
): Promise<{ amountOut: bigint; gasEstimate: bigint }> {
  const [amountOut, gasEstimate] = await readContract<readonly [bigint, bigint]>(
    client,
    quoteInstantLaunchBuyCall(params)
  )
  return { amountOut, gasEstimate }
}

/** EIP-55 normalizes the token address; rejects malformed input and the native-currency sentinel. */
function normalizeInstantLaunchToken(token: Address): Address {
  let normalized: Address
  try {
    normalized = getAddress(token)
  } catch {
    throw new LauncherSdkError('INVALID_INPUT', `Invalid Instant Launch token address: ${token}`)
  }
  if (isAddressEqual(normalized, ZERO_ADDRESS)) {
    throw new LauncherSdkError('INVALID_INPUT', 'Instant Launch token address must not be the zero address')
  }
  return normalized
}

/** The variant-independent launcher-side contracts, required on a chain with ≥1 strategy deployment. */
function requireInstantLaunchCore(chainId: number): { liquidityLauncher: Address; uerc20Factory: Address } {
  const launcher = getLauncherAddresses(chainId)
  if (!launcher?.uerc20Factory || getInstantLaunchDeployments(chainId).length === 0) {
    throw new LauncherSdkError('UNSUPPORTED_CHAIN', `Instant Launch is not deployed on chain ${chainId}`)
  }
  return { liquidityLauncher: launcher.liquidityLauncher, uerc20Factory: launcher.uerc20Factory }
}

function requireInstantLaunchAddresses(
  chainId: number,
  options: { creatorFeesEnabled: boolean }
): InstantLaunchAddresses {
  const addresses = getInstantLaunchAddresses(chainId, options)
  if (addresses === undefined) {
    throw new LauncherSdkError(
      'UNSUPPORTED_CHAIN',
      `Instant Launch (creator fees ${
        options.creatorFeesEnabled ? 'enabled' : 'disabled'
      }) is not deployed on chain ${chainId}`
    )
  }
  return addresses
}
