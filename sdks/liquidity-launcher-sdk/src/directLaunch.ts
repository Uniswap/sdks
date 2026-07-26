import { type Address, type Hex, isAddressEqual } from 'viem'

import { getLauncherAddresses } from './addresses'
import { buildLaunchTransactions, type TransactionRequest } from './build'
import { NEW_TOKEN_DECIMALS, ZERO_ADDRESS } from './constants'
import { encodeDirectLaunchConfig, encodeTokenData } from './encode'
import { LauncherSdkError } from './errors'
import { type ContractCall, predictTokenAddressCall } from './reads'
import type { Uerc20Metadata } from './types'

/**
 * Direct Launch ("Instant Launch") — the canonical preset + transaction assembler, mirroring
 * `quickLaunch`'s role for the CCA path. Launch params in → one signable transaction out.
 *
 * On-chain flow (hookless DirectLaunchStrategy, liquidity-launcher#195): one
 * `LiquidityLauncher.multicall` wrapping
 *   1. `createToken(uerc20Factory, name, symbol, 18, 1e27, launcher, tokenData)`
 *      — mints the fixed 1B supply straight to the launcher, and
 *   2. `distributeToken(token, { strategy: directLaunchStrategy, amount: 1e27,
 *      configData: abi.encode(DirectLaunchConfig{feeBeneficiary}) }, salt)`
 *      — the strategy pulls the full supply, initializes the hookless native-ETH v4 pool
 *      (LP_FEE=2500, TICK_SPACING=60, price fixed by the strategy's immutable initialTick) and
 *      parks the single-sided LP NFT in the FeeSplitter forever. `msg.value` is always 0.
 *
 * The token address is deterministic (CREATE2 keyed on name/symbol/decimals/creator/graffiti),
 * read from the factory's `getUERC20Address` view — see {@link predictDirectLaunchTokenAddressCall}.
 *
 * Addresses come from the single `addresses.ts` registry (`directLaunchStrategy` / `feeSplitter`
 * on {@link getLauncherAddresses}) — the one swap point for the expected liquidity-launcher#196
 * strategy/splitter redeploy.
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
}

/**
 * Returns the Direct Launch stack for a chain, or `undefined` where any piece of it is not
 * deployed. Derived from the launcher address registry, never a second copy.
 */
export function getDirectLaunchAddresses(chainId: number): DirectLaunchAddresses | undefined {
  const addresses = getLauncherAddresses(chainId)
  if (!addresses?.uerc20Factory || !addresses.directLaunchStrategy || !addresses.feeSplitter) {
    return undefined
  }
  return {
    liquidityLauncher: addresses.liquidityLauncher,
    uerc20Factory: addresses.uerc20Factory,
    directLaunchStrategy: addresses.directLaunchStrategy,
    feeSplitter: addresses.feeSplitter,
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
 * reverts on zero or the launcher). Decision: Bruno 2026-07-24 — when the creator opts out, ALL
 * fees go to autocompound; this is the deployed 4663 FeeSplitter's autocompound/protocol recipient
 * (also its nativeFallback), so any beneficiary share stays protocol-owned.
 */
export const DISABLED_CREATOR_FEE_BENEFICIARY: Address = '0x2aC03e14Cfe755426DaAEe0a4994184Ce81482F8'

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
 * distributeToken; `value` is always 0). Mirrors the strategy's own guards where they are cheap to
 * check client-side (zero/launcher feeBeneficiary would revert on-chain).
 */
export function buildDirectLaunchTransaction(params: BuildDirectLaunchParams): DirectLaunchTransaction {
  const addresses = requireDirectLaunchAddresses(params.chainId)
  if (
    isAddressEqual(params.feeBeneficiary, ZERO_ADDRESS) ||
    isAddressEqual(params.feeBeneficiary, addresses.liquidityLauncher)
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

function requireDirectLaunchAddresses(chainId: number): DirectLaunchAddresses {
  const addresses = getDirectLaunchAddresses(chainId)
  if (addresses === undefined) {
    throw new LauncherSdkError('UNSUPPORTED_CHAIN', `Direct Launch is not deployed on chain ${chainId}`)
  }
  return addresses
}
