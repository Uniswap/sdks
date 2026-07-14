import { type Address, type Hex } from 'viem'

import {
  type CreateTokenArgs,
  encodeCreateToken,
  encodeDepositToken,
  encodeDistributeToken,
  encodeErc20Approve,
  encodeMigrate,
  encodeMulticall,
  encodePermit2Approve,
  encodeSweepUnsoldTokens,
} from './encode'
import type { Distribution } from './types'

/**
 * Pure transaction assembler. Given already-resolved inputs (predicted addresses, decimals, derived
 * blocks/prices, and any opaque product fields such as an X-verification `extraData` or a KYC
 * `validationHook`), it composes the launcher `multicall` and any approval transactions — the exact
 * shape the backend builds, with no I/O and no product policy of its own.
 *
 * Recommended flow: resolve inputs (see `reads`) → derive config (see `config/*`) → encode structs
 * (see `encode`) → assemble here.
 */

/** A minimal, chain-agnostic transaction. Consumers add `from` / `chainId` / gas. */
export interface TransactionRequest {
  to: Address
  data: Hex
  value: bigint
}

export type TokenAcquisition =
  // Existing token: the launcher pulls `amount` (uint160) from the wallet via Permit2 in depositToken.
  | { kind: 'deposit'; amount: bigint }
  // New token: the launcher mints `initialSupply` to itself (set `recipient` to the launcher).
  | { kind: 'create'; args: CreateTokenArgs }

export interface BuildLaunchParams {
  /** The LiquidityLauncher address (from {@link getLauncherAddresses}). */
  liquidityLauncher: Address
  /** The token being launched (predicted new-token address, or the existing token). */
  token: Address
  /** The user salt (bytes32) passed to every `distributeToken` in this launch. */
  salt: Hex
  /** How the launcher acquires the tokens before distributing them. */
  acquire: TokenAcquisition
  /**
   * Distributions executed in order within the multicall. The first is the primary LBP distribution
   * (`strategy = lbpStrategy`, `configData = encodeConfigData(...)`); an optional second returns the
   * creator's un-auctioned portion (`strategy = tokenSplitter`, `configData = encodeTokenSplitterConfig(...)`).
   */
  distributions: Distribution[]
  /** Approval transactions to prepend (existing-token path). The caller decides which are needed. */
  approvals?: TransactionRequest[]
}

/** Builds just the LiquidityLauncher `multicall` calldata (acquire + distribute subcalls). */
export function buildLaunchMulticall(p: BuildLaunchParams): Hex {
  const calls: Hex[] = []
  calls.push(
    p.acquire.kind === 'create' ? encodeCreateToken(p.acquire.args) : encodeDepositToken(p.token, p.acquire.amount)
  )
  for (const distribution of p.distributions) {
    calls.push(encodeDistributeToken(p.token, distribution, p.salt))
  }
  return encodeMulticall(calls)
}

/**
 * Builds the ordered transaction list: any approvals, then the single launcher `multicall`. A
 * new-token launch needs no approvals (it mints in-flight); an existing-token launch prepends the
 * ERC20→Permit2 and Permit2→launcher approvals the caller determined are missing.
 */
export function buildLaunchTransactions(p: BuildLaunchParams): TransactionRequest[] {
  const multicall: TransactionRequest = { to: p.liquidityLauncher, data: buildLaunchMulticall(p), value: 0n }
  return [...(p.approvals ?? []), multicall]
}

/** Convenience: the ERC20 `approve(permit2, max)` transaction for an existing-token launch. */
export function buildErc20ApprovePermit2Tx(token: Address, permit2: Address): TransactionRequest {
  return { to: token, data: encodeErc20Approve(permit2), value: 0n }
}

/** Convenience: the Permit2 `approve(token, launcher, max)` transaction for an existing-token launch. */
export function buildPermit2ApproveLauncherTx(permit2: Address, token: Address, launcher: Address): TransactionRequest {
  return { to: permit2, data: encodePermit2Approve(token, launcher), value: 0n }
}

/**
 * The creator's post-auction token recovery: `ContinuousClearingAuction.sweepUnsoldTokens()` on the
 * auction instance. Must be sent by the auction's `tokensRecipient()`, after `endBlock`, and only if
 * `sweepUnsoldTokensBlock() == 0` (one-shot) — see the `reads` descriptors for these gates.
 */
export function buildSweepUnsoldTokensTx(p: { auctionAddress: Address }): TransactionRequest {
  return { to: p.auctionAddress, data: encodeSweepUnsoldTokens(), value: 0n }
}

/**
 * The permissionless success-path migration: `LBPStrategy.migrate(auctionAddress)` on the strategy.
 * Reverts until the auction is finalized & graduated and its `migrationBlock` has passed.
 */
export function buildMigrateTx(p: { lbpStrategyAddress: Address; auctionAddress: Address }): TransactionRequest {
  return { to: p.lbpStrategyAddress, data: encodeMigrate(p.auctionAddress), value: 0n }
}
