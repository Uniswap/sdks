import { type Address, type Hex, type PublicClient, getAddress, isAddressEqual } from 'viem'

import { V4_QUOTER_ABI } from './abis'
import { getLauncherAddresses } from './addresses'
import { buildLaunchTransactions, type TransactionRequest } from './build'
import { NEW_TOKEN_DECIMALS, ZERO_ADDRESS } from './constants'
import { encodeDirectLaunchConfig, encodeTokenData } from './encode'
import { LauncherSdkError } from './errors'
import { computeLbpPoolId } from './poolId'
import { type ContractCall, predictTokenAddressCall, readContract } from './reads'
import type { Uerc20Metadata } from './types'

/**
 * Direct Launch ("Instant Launch") — the canonical preset + transaction assembler, mirroring
 * `quickLaunch`'s role for the CCA path. Launch params in → one signable transaction out.
 *
 * On-chain flow (hookless DirectLaunchStrategy, liquidity-launcher#195 + the #196 fee-routing
 * rework): one `LiquidityLauncher.multicall` wrapping
 *   1. `createToken(uerc20Factory, name, symbol, 18, 1e27, launcher, tokenData)`
 *      — mints the fixed 1B supply straight to the launcher, and
 *   2. `distributeToken(token, { strategy: directLaunchStrategy, amount: 1e27,
 *      configData: abi.encode(DirectLaunchConfig{feeBeneficiary}) }, salt)`
 *      — the strategy pulls the full supply, initializes the hookless native-ETH v4 pool
 *      (LP_FEE=2500, TICK_SPACING=60, price fixed by the strategy's immutable initialTick),
 *      registers `feeBeneficiary` with the BeneficiaryVault (minting the transferable beneficiary
 *      ERC721, keyed by the LP position's tokenId) and parks the single-sided LP NFT in the
 *      FeeSplitter forever. `msg.value` is always 0.
 *
 * The token address is deterministic (CREATE2 keyed on name/symbol/decimals/creator/graffiti),
 * read from the factory's `getUERC20Address` view — see {@link predictDirectLaunchTokenAddressCall}.
 *
 * Addresses come from the single `addresses.ts` registry (`directLaunchStrategy` / `feeSplitter` /
 * `beneficiaryVault` on {@link getLauncherAddresses}) — the one swap point for contract redeploys.
 */

/**
 * The fully-resolved per-chain Direct Launch stack: the launcher-side contracts every launch uses
 * plus the two Direct-Launch-specific ones. All fields required — {@link getDirectLaunchAddresses}
 * only resolves on chains where the whole stack is deployed.
 */
export interface DirectLaunchAddresses {
  /** LiquidityLauncher singleton — the `multicall` entrypoint the wallet calls. */
  liquidityLauncher: Address
  /** uERC20 token factory `createToken` targets. */
  uerc20Factory: Address
  /** Hookless DirectLaunchStrategy (`Distribution.strategy`). */
  directLaunchStrategy: Address
  /** FeeSplitter singleton — permanent LP-NFT custodian + fee distributor. */
  feeSplitter: Address
  /** BeneficiaryVault singleton — the fee-beneficiary ERC721 registry + the beneficiary share's vault. */
  beneficiaryVault: Address
}

/**
 * Returns the Direct Launch stack for a chain, or `undefined` where any piece of it is not
 * deployed. Derived from the launcher address registry, never a second copy.
 */
export function getDirectLaunchAddresses(chainId: number): DirectLaunchAddresses | undefined {
  const addresses = getLauncherAddresses(chainId)
  if (
    !addresses?.uerc20Factory ||
    !addresses.directLaunchStrategy ||
    !addresses.feeSplitter ||
    !addresses.beneficiaryVault
  ) {
    return undefined
  }
  return {
    liquidityLauncher: addresses.liquidityLauncher,
    uerc20Factory: addresses.uerc20Factory,
    directLaunchStrategy: addresses.directLaunchStrategy,
    feeSplitter: addresses.feeSplitter,
    beneficiaryVault: addresses.beneficiaryVault,
  }
}

/** Whether Direct Launch is deployed on `chainId` (i.e. {@link getDirectLaunchAddresses} resolves). */
export function isDirectLaunchSupportedChain(chainId: number): boolean {
  return getDirectLaunchAddresses(chainId) !== undefined
}

/** Factory tokens are fixed at 18 decimals (the strategy reverts otherwise). */
export const DIRECT_LAUNCH_TOKEN_DECIMALS = NEW_TOKEN_DECIMALS

/** Fixed, standardized total supply: 1,000,000,000 (1B) whole tokens (minted via the Token Factory). */
export const DIRECT_LAUNCH_TOTAL_SUPPLY = 1_000_000_000n

/**
 * Total supply in raw base units, required exactly by DirectLaunchStrategy: 1B @ 18 decimals = 1e27.
 */
export const DIRECT_LAUNCH_TOTAL_SUPPLY_RAW = DIRECT_LAUNCH_TOTAL_SUPPLY * 10n ** BigInt(DIRECT_LAUNCH_TOKEN_DECIMALS)

/**
 * feeBeneficiary when the creator-fee toggle is OFF (the config field is mandatory — the strategy
 * reverts on zero or the launcher, and the vault additionally rejects itself). When the creator
 * opts out, the beneficiary share must stay protocol-owned: this is the deployed 4663
 * CompoundingClaimRecipient — the FeeSplitter's protocol/autocompound split recipient — so the
 * beneficiary claim NFT is minted to a protocol contract and the share never accrues to a user.
 */
export const DISABLED_CREATOR_FEE_BENEFICIARY: Address = '0x3fC7BA967295C10AFD2Ad4f098Dce3a71e6b8c73'

export interface PredictDirectLaunchTokenParams {
  chainId: number
  /** Original creator (tx sender); folded into the CREATE2 graffiti. */
  wallet: Address
  name: string
  symbol: string
}

/**
 * The factory view descriptor for the deterministic new-token address — `predictTokenAddressCall`
 * preconfigured for Direct Launch (uERC20 factory, fixed 18 decimals, the launcher as the on-chain
 * `creator` since it is the factory's msg.sender inside the multicall; the wallet rides in the
 * graffiti). Execute it with `readContract` / `predictTokenAddress` or any rpc client.
 */
export function predictDirectLaunchTokenAddressCall(params: PredictDirectLaunchTokenParams): ContractCall {
  const addresses = requireDirectLaunchAddresses(params.chainId)
  return predictTokenAddressCall({
    factory: addresses.uerc20Factory,
    kind: 'uerc20',
    launcherAddress: addresses.liquidityLauncher,
    wallet: params.wallet,
    name: params.name,
    symbol: params.symbol,
    decimals: DIRECT_LAUNCH_TOKEN_DECIMALS,
    homeChainId: BigInt(params.chainId), // unused for uerc20
  })
}

export interface BuildDirectLaunchParams {
  chainId: number
  name: string
  symbol: string
  /** Deterministic new-token address from {@link predictDirectLaunchTokenAddressCall}. */
  predictedTokenAddress: Address
  /** On-chain uERC20 metadata (`image` is the uploaded ipfs:// URL, '' when absent). */
  metadata: Uerc20Metadata
  /** LP-fee beneficiary — REQUIRED by the strategy; see {@link DISABLED_CREATOR_FEE_BENEFICIARY}. */
  feeBeneficiary: Address
  /** bytes32 user salt (the singleton strategy ignores it, but the launcher call carries it). */
  salt: Hex
}

/** A signable Direct Launch transaction — the single launcher `multicall`, tagged with its chain. */
export interface DirectLaunchTransaction extends TransactionRequest {
  chainId: number
}

/**
 * Pure assembler: builds the one-transaction Direct Launch multicall (createToken then
 * distributeToken; `value` is always 0). Mirrors the on-chain guards where they are cheap to check
 * client-side (a zero/launcher feeBeneficiary reverts in the strategy; the vault rejects itself at
 * registration).
 */
export function buildDirectLaunchTransaction(params: BuildDirectLaunchParams): DirectLaunchTransaction {
  const addresses = requireDirectLaunchAddresses(params.chainId)
  if (
    isAddressEqual(params.feeBeneficiary, ZERO_ADDRESS) ||
    isAddressEqual(params.feeBeneficiary, addresses.liquidityLauncher) ||
    isAddressEqual(params.feeBeneficiary, addresses.beneficiaryVault)
  ) {
    throw new LauncherSdkError('INVALID_INPUT', `Invalid Direct Launch fee beneficiary: ${params.feeBeneficiary}`)
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
        decimals: DIRECT_LAUNCH_TOKEN_DECIMALS,
        initialSupply: DIRECT_LAUNCH_TOTAL_SUPPLY_RAW,
        // The launcher must hold the mint: distributeToken approves the strategy, which pulls the
        // full supply from the launcher.
        recipient: addresses.liquidityLauncher,
        tokenData: encodeTokenData(params.metadata),
      },
    },
    distributions: [
      {
        strategy: addresses.directLaunchStrategy,
        amount: DIRECT_LAUNCH_TOTAL_SUPPLY_RAW,
        configData: encodeDirectLaunchConfig({ feeBeneficiary: params.feeBeneficiary }),
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

/** DirectLaunchStrategy's compile-time pool LP fee (pips) — `LP_FEE`, unchanged across deploys. */
export const DIRECT_LAUNCH_POOL_LP_FEE = 2500

/** DirectLaunchStrategy's compile-time pool tick spacing — `TICK_SPACING`, unchanged across deploys. */
export const DIRECT_LAUNCH_POOL_TICK_SPACING = 60

/** The launch pool is hookless. */
export const DIRECT_LAUNCH_POOL_HOOKS: Address = ZERO_ADDRESS

/** The launch pool's raise currency: native ETH (address(0)), which always sorts as `currency0`. */
export const DIRECT_LAUNCH_POOL_CURRENCY0: Address = ZERO_ADDRESS

/** A Uniswap v4 `PoolKey` struct mirror (currencies sorted ascending, as the PoolManager requires). */
export interface V4PoolKey {
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks: Address
}

/**
 * The one v4 pool a Direct Launch token trades in: hookless native-ETH pool at the strategy's
 * immutable fee/spacing. Native ETH (address(0)) sorts below every token, so `currency0` is always
 * ETH and an ETH→token swap is always `zeroForOne`. The token address is EIP-55 normalized.
 */
export function getDirectLaunchPoolKey(token: Address): V4PoolKey {
  return {
    currency0: DIRECT_LAUNCH_POOL_CURRENCY0,
    currency1: normalizeDirectLaunchToken(token),
    fee: DIRECT_LAUNCH_POOL_LP_FEE,
    tickSpacing: DIRECT_LAUNCH_POOL_TICK_SPACING,
    hooks: DIRECT_LAUNCH_POOL_HOOKS,
  }
}

/**
 * The launch pool's v4 PoolId — `keccak256(abi.encode(poolKey))`, matching the on-chain
 * `PoolKey.toId()`. Use it with `slot0Call` / `isV4PoolInitialized` or any StateView read.
 */
export function getDirectLaunchPoolId(token: Address): Hex {
  const key = getDirectLaunchPoolKey(token)
  return computeLbpPoolId(key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks)
}

export interface QuoteDirectLaunchBuyParams {
  /** The chain's v4 View Quoter (caller-supplied, like every read in `reads.ts`). */
  v4Quoter: Address
  /** The Direct Launch token being bought. */
  token: Address
  /** Exact ETH input, in wei. */
  exactAmountInWei: bigint
}

/**
 * `V4Quoter.quoteExactInputSingle` descriptor for an exact-in ETH→token buy on the launch pool
 * (`zeroForOne` since ETH is always `currency0`; no hook data). The quoter quotes by
 * revert-and-catch, so execute this as an `eth_call` simulation (viem `readContract` /
 * {@link quoteDirectLaunchBuy}), never as a transaction. Returns `(amountOut, gasEstimate)`.
 */
export function quoteDirectLaunchBuyCall(params: QuoteDirectLaunchBuyParams): ContractCall<typeof V4_QUOTER_ABI> {
  return {
    address: params.v4Quoter,
    abi: V4_QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: [
      {
        poolKey: getDirectLaunchPoolKey(params.token),
        zeroForOne: true,
        exactAmount: params.exactAmountInWei,
        hookData: '0x',
      },
    ],
  }
}

/** Executes {@link quoteDirectLaunchBuyCall} against a viem `PublicClient`. */
export async function quoteDirectLaunchBuy(
  client: PublicClient,
  params: QuoteDirectLaunchBuyParams
): Promise<{ amountOut: bigint; gasEstimate: bigint }> {
  const [amountOut, gasEstimate] = await readContract<readonly [bigint, bigint]>(
    client,
    quoteDirectLaunchBuyCall(params)
  )
  return { amountOut, gasEstimate }
}

/** EIP-55 normalizes the token address; rejects malformed input and the native-currency sentinel. */
function normalizeDirectLaunchToken(token: Address): Address {
  let normalized: Address
  try {
    normalized = getAddress(token)
  } catch {
    throw new LauncherSdkError('INVALID_INPUT', `Invalid Direct Launch token address: ${token}`)
  }
  if (isAddressEqual(normalized, ZERO_ADDRESS)) {
    throw new LauncherSdkError('INVALID_INPUT', 'Direct Launch token address must not be the zero address')
  }
  return normalized
}

function requireDirectLaunchAddresses(chainId: number): DirectLaunchAddresses {
  const addresses = getDirectLaunchAddresses(chainId)
  if (addresses === undefined) {
    throw new LauncherSdkError('UNSUPPORTED_CHAIN', `Direct Launch is not deployed on chain ${chainId}`)
  }
  return addresses
}
