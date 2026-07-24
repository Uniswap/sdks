import { type Abi, type Address, type PublicClient } from 'viem'

import { LENDING_ADAPTER_ABI, MARGIN_ACCOUNT_ABI, MARGIN_ROUTER_ABI } from './abis'
import { type Market, type PositionData } from './types'

/**
 * Read layer. Every read is exposed two ways:
 *  - a pure `*Call` **descriptor** — `{ address, abi, functionName, args }` — that drops straight
 *    into wagmi `useReadContract(s)`, viem multicall, or any rpc client. The SDK never binds a
 *    transport.
 *  - an async helper that executes the descriptor against a viem `PublicClient`, for scripts and
 *    quick server-side use.
 *
 * The `ILendingAdapter` read surface is identical across the Morpho Blue, Aave v3, and Aave v4
 * adapters, so the same read code works for any venue — only the adapter address changes. All
 * position amounts are interest-accrued.
 */

/** A framework-agnostic contract read descriptor. */
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
// Router: accounts, allowlist, governance
// ---------------------------------------------------------------------------

/** `router.accountOf(owner, subId)` — the deterministic MarginAccount address (deployed or not). */
export function accountOfCall(p: {
  marginRouter: Address
  owner: Address
  subId?: bigint
}): ContractCall<typeof MARGIN_ROUTER_ABI> {
  return {
    address: p.marginRouter,
    abi: MARGIN_ROUTER_ABI,
    functionName: 'accountOf',
    args: [p.owner, p.subId ?? 0n],
  }
}

/** Reads the MarginAccount address for `(owner, subId)`. Prefer `predictMarginAccountAddress` offchain. */
export async function getAccount(
  client: PublicClient,
  p: { marginRouter: Address; owner: Address; subId?: bigint }
): Promise<Address> {
  return readContract<Address>(client, accountOfCall(p))
}

/** Whether the account at `address` has been deployed yet (positions can exist only after deploy). */
export async function isAccountDeployed(client: PublicClient, account: Address): Promise<boolean> {
  const code = await client.getCode({ address: account })
  return !!code && code !== '0x'
}

/** `router.isAdapterAllowed(adapter)` — whether the adapter can be used to add exposure. */
export function isAdapterAllowedCall(p: {
  marginRouter: Address
  adapter: Address
}): ContractCall<typeof MARGIN_ROUTER_ABI> {
  return { address: p.marginRouter, abi: MARGIN_ROUTER_ABI, functionName: 'isAdapterAllowed', args: [p.adapter] }
}

/** Reads the adapter allowlist status (close/decrease never require it). */
export async function getIsAdapterAllowed(
  client: PublicClient,
  p: { marginRouter: Address; adapter: Address }
): Promise<boolean> {
  return readContract<boolean>(client, isAdapterAllowedCall(p))
}

/** `router.governance()`. */
export function governanceCall(marginRouter: Address): ContractCall<typeof MARGIN_ROUTER_ABI> {
  return { address: marginRouter, abi: MARGIN_ROUTER_ABI, functionName: 'governance', args: [] }
}

// ---------------------------------------------------------------------------
// Adapter: market support and position state
// ---------------------------------------------------------------------------

/** `adapter.isSupportedMarket(market)` — whether the (collateral, debt) pair is routable. */
export function isSupportedMarketCall(p: {
  adapter: Address
  market: Market
}): ContractCall<typeof LENDING_ADAPTER_ABI> {
  return { address: p.adapter, abi: LENDING_ADAPTER_ABI, functionName: 'isSupportedMarket', args: [p.market] }
}

/** Reads whether the adapter routes `market`. */
export async function getIsSupportedMarket(
  client: PublicClient,
  p: { adapter: Address; market: Market }
): Promise<boolean> {
  return readContract<boolean>(client, isSupportedMarketCall(p))
}

/** `adapter.positionOf(account, market)` — (collateral, debt) amounts with accrued interest. */
export function positionOfCall(p: {
  adapter: Address
  account: Address
  market: Market
}): ContractCall<typeof LENDING_ADAPTER_ABI> {
  return { address: p.adapter, abi: LENDING_ADAPTER_ABI, functionName: 'positionOf', args: [p.account, p.market] }
}

/** `adapter.maxLtvWad(market)` — the market's maximum (liquidation) LTV (WAD, 1e18 == 100%). */
export function maxLtvCall(p: { adapter: Address; market: Market }): ContractCall<typeof LENDING_ADAPTER_ABI> {
  return { address: p.adapter, abi: LENDING_ADAPTER_ABI, functionName: 'maxLtvWad', args: [p.market] }
}

/** `adapter.currentLtvWad(account, market)` — the position's current LTV (WAD). */
export function currentLtvCall(p: {
  adapter: Address
  account: Address
  market: Market
}): ContractCall<typeof LENDING_ADAPTER_ABI> {
  return { address: p.adapter, abi: LENDING_ADAPTER_ABI, functionName: 'currentLtvWad', args: [p.account, p.market] }
}

/**
 * `adapter.describePosition(account, market)` — the consolidated snapshot: amounts, max/current
 * LTV, and health factor in one call.
 */
export function describePositionCall(p: {
  adapter: Address
  account: Address
  market: Market
}): ContractCall<typeof LENDING_ADAPTER_ABI> {
  return {
    address: p.adapter,
    abi: LENDING_ADAPTER_ABI,
    functionName: 'describePosition',
    args: [p.account, p.market],
  }
}

/**
 * Reads the consolidated position snapshot. Note for cross-collateral venues (Aave v3/v4): LTV
 * and health factor are account-level, so keep one position per `(owner, subId)` — never co-locate
 * two Aave markets under one sub-account.
 */
export async function getPosition(
  client: PublicClient,
  p: { adapter: Address; account: Address; market: Market }
): Promise<PositionData> {
  return readContract<PositionData>(client, describePositionCall(p))
}

// ---------------------------------------------------------------------------
// Account views
// ---------------------------------------------------------------------------

/** `account.owner()` — the immutable owner baked into the clone bytecode. */
export function accountOwnerCall(account: Address): ContractCall<typeof MARGIN_ACCOUNT_ABI> {
  return { address: account, abi: MARGIN_ACCOUNT_ABI, functionName: 'owner', args: [] }
}

/** `account.manager()` — the immutable manager (the MarginRouter) baked into the clone bytecode. */
export function accountManagerCall(account: Address): ContractCall<typeof MARGIN_ACCOUNT_ABI> {
  return { address: account, abi: MARGIN_ACCOUNT_ABI, functionName: 'manager', args: [] }
}
