#!/usr/bin/env bun
/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// compare — quotes a matrix of pairs through BOTH this package's router
// (`src/`, straight from source, same convention as `cli/rl.ts`) and the
// Uniswap Trading API, and reports amount-out deltas, latency, and route
// shapes side by side.
//
// Usage:
//
//   cd sdks/router-lite-sdk
//   chainz exec 1 -- bun scripts/compare.ts --rpc @rpc
//   chainz exec 8453 -- bun scripts/compare.ts                      # Base's own matrix
//   ETH_RPC_URL=https://… UNISWAP_API_KEY=… bun scripts/compare.ts
//   bun scripts/compare.ts --rpc https://… --dry-run                # no key needed
//   bun scripts/compare.ts --rpc https://… --pair "USDC/WETH:5000"  # override the matrix
//
// THE MATRIX IS PER-CHAIN AND PER-SIZE. The connected endpoint identifies its
// own chain (`buildChainContext`, exactly as `rl` does) and that chain selects
// its pair matrix from {@link CHAIN_MATRICES}; every pair carries a LIST of
// human amounts (small / typical / whale, the last ~100x the typical) and each
// one is a row of its own, labelled `PAIR @ AMOUNT`. Sizes are part of the
// matrix rather than a flag because depth is where a router's coverage
// actually breaks: the same pair that ties at 1 ETH can miss entirely at 100.
//
// COVERAGE, NOT CONVERGENCE. The per-pair budget stays small (10s by default)
// on purpose — this script's question is "can the router see this trade at
// all", and a MISSES section (see {@link classifyMiss}) answers it directly:
// every row where the router found nothing the API found, or came back more
// than 100 bps behind, or found something the API could not. Each miss prints
// the search's own evidence (per-protocol discovery status, legs measured, the
// pair ceiling, abort) so it is diagnosable from the output alone rather than
// only by re-running the pair by hand.
//
// Chain detection, the RPC transport, `--rpc-header`/`$ETH_RPC_HEADERS`
// redaction, `--budget`'s transport shaping, and the on-disk pool cache are
// all `cli/commands/context.ts#buildChainContext` — the exact seam
// `cli/commands/quote.ts` builds on — rather than re-derived here. What is
// genuinely new is: the built-in pair matrix, on-chain symbol/decimals
// verification for it, the Trading API client, and the side-by-side report.
//
// TRADING API REQUEST SHAPE — CORRECTED AGAINST THE LIVE API. The obvious
// AMM-only request (`routingPreference: "CLASSIC"`) is REJECTED outright: the
// field only accepts `BEST_PRICE`/`FASTEST`. The mechanism that actually
// restricts routing to classic AMM pools is `protocols: ["V2","V3","V4"]`
// (confirmed HTTP 200 against a live key, response echoes `routing:
// "CLASSIC"`), so that is the ONLY body shape this script ever sends — no
// retry ladder, because there is nothing to fall back from. Native ETH as the
// zero address is confirmed working and is the only form sent.
//
// THE API CAN RETURN A SPLIT ROUTE — `quote.route` is an ARRAY OF ARRAYS
// (parallel paths, e.g. three ways for 1 ETH → USDC), never a single list of
// legs. This script never re-derives a route STRING from that structure —
// `quote.routeString` is already the API's own human-readable rendering — but
// it does read the outer array's length to report a split count, because
// `router-lite` never splits (single best route, by design) and a reader
// comparing route SHAPES needs to see that difference rather than either
// silently drop it or mis-render the parallel paths as one path.
// ---------------------------------------------------------------------------

import { fileURLToPath } from 'node:url'

import type { Address } from 'viem'

import { AmountError, parseAmount, parseBudget } from '../cli/amounts'
import { bold, cyan, dim, green, red, setColorEnabled, yellow } from '../cli/ansi'
import { parseArgs, UsageError, type FlagSpec } from '../cli/args'
import { CACHE_FLAGS, flushCacheSave } from '../cli/cache'
import { buildChainContext, hydrateLegSymbols, startBudget, type ChainContext } from '../cli/commands/context'
import { redact } from '../cli/redact'
import { amountFor, jsonify, renderRoute, viewKey, type RenderCtx } from '../cli/report'
import { fetchTokenMeta, resolveToken, RpcError, type ResolvedToken } from '../cli/tokens'
import { PROTOCOLS, type CurrencyRef, type QuoteRequest, type QuoteResult } from '../src/index'

// ---------------------------------------------------------------------------
// Built-in per-chain pair matrices
//
// One matrix per chain that has a built-in manifest AND a curated pair list
// (see {@link CHAIN_MATRICES} and {@link matrixFor}); the guard in {@link main}
// is what turns a chain with no matrix into a one-line explanation rather than
// an empty run.
//
// THREE SIZES PER PAIR, ALWAYS: small (retail), typical (the size a desk
// actually quotes), and whale (~100x the typical, sized to stress depth). The
// whale row is the point of the sweep — it is where a single-route router meets
// a pair whose depth only exists as a split, and where a search that runs out
// of budget mid-scan stops having anything to say.
// ---------------------------------------------------------------------------

const NATIVE: CurrencyRef = 'native'
const NATIVE_TOKEN: ResolvedToken = { ref: 'native', symbol: 'ETH', decimals: 18 }

type BuiltinTokenSpec = { ref: CurrencyRef; expectedSymbol?: string }
/** `amounts` are HUMAN units of `tokenIn`, smallest first — one comparison row each (see
 * {@link resolvePairs}, which labels them `PAIR @ AMOUNT`). */
type BuiltinPairSpec = { label: string; tokenIn: BuiltinTokenSpec; tokenOut: BuiltinTokenSpec; amounts: string[]; notes: string }

// Addresses named once, so a matrix entry can never disagree with itself about what USDC is. Each is
// verified LIVE at startup by {@link verifyBuiltinTokens} against the expected symbol beside it —
// nothing here is trusted because it is written down.
const M_WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address
const M_USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address
const M_USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address
const M_WBTC = '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' as Address
const M_PEPE = '0x6982508145454Ce325dDbE47a25d4ec3d2311933' as Address
const B_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address
const A_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as Address
const U_USDC = '0x078D782b760474a361dDA0AF3839290b0EF57AD6' as Address

/**
 * Mainnet (chain 1). The original twelve, each now swept at three sizes, plus five added for
 * miss-hunting reach: two exotic stables whose depth lives outside the WETH/USDC core (GHO, LUSD), a
 * bluechip-to-bluechip hop with no stable leg (WETH→cbBTC), a fee-CAPABLE token (PAXG — its
 * `feeRate` is settable by the issuer and is 0 today, so it exercises the quoting path a real
 * fee-on-transfer token would without depending on a token whose fee could change under the sweep),
 * and ETH→USDT, whose deepest venue on this chain is a v4 pool.
 */
const MAINNET_PAIRS: BuiltinPairSpec[] = [
  {
    label: 'ETH→USDC',
    tokenIn: { ref: NATIVE },
    tokenOut: { ref: M_USDC, expectedSymbol: 'USDC' },
    amounts: ['0.01', '1', '100'],
    notes: 'baseline bluechip',
  },
  {
    label: 'USDC→USDT',
    tokenIn: { ref: M_USDC, expectedSymbol: 'USDC' },
    tokenOut: { ref: M_USDT, expectedSymbol: 'USDT' },
    amounts: ['100', '10000', '1000000'],
    notes: 'stable/stable',
  },
  {
    label: 'WBTC→ETH',
    tokenIn: { ref: M_WBTC, expectedSymbol: 'WBTC' },
    tokenOut: { ref: NATIVE },
    amounts: ['0.005', '0.5', '50'],
    notes: '',
  },
  {
    label: 'wstETH→ETH',
    tokenIn: { ref: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0' as Address, expectedSymbol: 'wstETH' },
    tokenOut: { ref: NATIVE },
    amounts: ['0.1', '10', '1000'],
    notes: 'correlated pair',
  },
  {
    label: 'PEPE→ETH',
    tokenIn: { ref: M_PEPE, expectedSymbol: 'PEPE' },
    tokenOut: { ref: NATIVE },
    amounts: ['10000000', '1000000000', '100000000000'],
    notes: 'memecoin',
  },
  {
    label: 'ETH→MOG',
    tokenIn: { ref: NATIVE },
    tokenOut: { ref: '0xaaeE1A9723aaDB7afA2810263653A34bA2C21C7a' as Address, expectedSymbol: 'MOG' },
    amounts: ['0.01', '1', '100'],
    notes: 'memecoin',
  },
  {
    label: 'SHIB→PEPE',
    tokenIn: { ref: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE' as Address, expectedSymbol: 'SHIB' },
    tokenOut: { ref: M_PEPE, expectedSymbol: 'PEPE' },
    amounts: ['1000000', '100000000', '10000000000'],
    notes: 'memecoin→memecoin, forces an intermediate',
  },
  {
    label: 'TURBO→USDC',
    tokenIn: { ref: '0xA35923162C49cF95e6BF26623385eb431aD920D3' as Address, expectedSymbol: 'TURBO' },
    tokenOut: { ref: M_USDC, expectedSymbol: 'USDC' },
    amounts: ['10000', '1000000', '100000000'],
    notes: 'long-tail',
  },
  {
    label: 'UNI→AAVE',
    tokenIn: { ref: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984' as Address, expectedSymbol: 'UNI' },
    tokenOut: { ref: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9' as Address, expectedSymbol: 'AAVE' },
    amounts: ['10', '1000', '100000'],
    notes: 'midcap→midcap',
  },
  {
    label: 'LINK→WBTC',
    tokenIn: { ref: '0x514910771AF9Ca656af840dff83E8264EcF986CA' as Address, expectedSymbol: 'LINK' },
    tokenOut: { ref: M_WBTC, expectedSymbol: 'WBTC' },
    amounts: ['10', '1000', '100000'],
    notes: '',
  },
  {
    label: 'ENA→ETH',
    tokenIn: { ref: '0x57e114B691Db790C35207b2e685D4A43181e6061' as Address, expectedSymbol: 'ENA' },
    tokenOut: { ref: NATIVE },
    amounts: ['100', '10000', '1000000'],
    notes: '',
  },
  {
    label: 'BITCOIN→ETH',
    tokenIn: { ref: '0x72e4f9F808C49A2a61dE9C5896298920Dc4EEEa9' as Address, expectedSymbol: 'BITCOIN' },
    tokenOut: { ref: NATIVE },
    amounts: ['1000', '100000', '10000000'],
    notes: 'v2-only long-tail (HarryPotterObamaSonic10Inu)',
  },
  {
    label: 'GHO→USDC',
    tokenIn: { ref: '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f' as Address, expectedSymbol: 'GHO' },
    tokenOut: { ref: M_USDC, expectedSymbol: 'USDC' },
    amounts: ['100', '10000', '1000000'],
    notes: 'exotic stable — depth is mostly outside the core intermediates',
  },
  {
    label: 'LUSD→USDC',
    tokenIn: { ref: '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0' as Address, expectedSymbol: 'LUSD' },
    tokenOut: { ref: M_USDC, expectedSymbol: 'USDC' },
    amounts: ['100', '10000', '1000000'],
    notes: 'exotic stable — thin, split-heavy',
  },
  {
    label: 'WETH→cbBTC',
    tokenIn: { ref: M_WETH, expectedSymbol: 'WETH' },
    tokenOut: { ref: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf' as Address, expectedSymbol: 'cbBTC' },
    amounts: ['0.01', '1', '100'],
    notes: 'bluechip→bluechip with no stable leg',
  },
  {
    label: 'PAXG→USDC',
    tokenIn: { ref: '0x45804880De22913dAFE09f4980848ECE6EcbAf78' as Address, expectedSymbol: 'PAXG' },
    tokenOut: { ref: M_USDC, expectedSymbol: 'USDC' },
    amounts: ['0.01', '1', '100'],
    notes: 'fee-capable token (issuer-settable transfer fee, 0 today)',
  },
  {
    label: 'ETH→USDT',
    tokenIn: { ref: NATIVE },
    tokenOut: { ref: M_USDT, expectedSymbol: 'USDT' },
    amounts: ['0.01', '1', '100'],
    notes: 'v4-heavy venue',
  },
]

/** Base (chain 8453). `flETH` is the deliberate v4/hooked probe: its pools are v4-native with a hook
 * attached, so a miss there localises to pool CLASS rather than to depth. */
const BASE_PAIRS: BuiltinPairSpec[] = [
  {
    label: 'ETH→USDC',
    tokenIn: { ref: NATIVE },
    tokenOut: { ref: B_USDC, expectedSymbol: 'USDC' },
    amounts: ['0.01', '1', '100'],
    notes: 'baseline bluechip',
  },
  {
    label: 'cbBTC→USDC',
    tokenIn: { ref: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf' as Address, expectedSymbol: 'cbBTC' },
    tokenOut: { ref: B_USDC, expectedSymbol: 'USDC' },
    amounts: ['0.005', '0.5', '50'],
    notes: '',
  },
  {
    label: 'DEGEN→ETH',
    tokenIn: { ref: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed' as Address, expectedSymbol: 'DEGEN' },
    tokenOut: { ref: NATIVE },
    amounts: ['1000', '100000', '10000000'],
    notes: 'memecoin',
  },
  {
    label: 'BRETT→USDC',
    tokenIn: { ref: '0x532f27101965dd16442E59d40670FaF5eBB142E4' as Address, expectedSymbol: 'BRETT' },
    tokenOut: { ref: B_USDC, expectedSymbol: 'USDC' },
    amounts: ['1000', '100000', '10000000'],
    notes: 'memecoin→stable, forces an intermediate',
  },
  {
    label: 'AERO→USDC',
    tokenIn: { ref: '0x940181a94A35A4569E4529A3CDfB74e38FD98631' as Address, expectedSymbol: 'AERO' },
    tokenOut: { ref: B_USDC, expectedSymbol: 'USDC' },
    amounts: ['100', '10000', '1000000'],
    notes: 'Aerodrome-native token — Uniswap depth is thin, a miss candidate',
  },
  {
    label: 'TOSHI→ETH',
    tokenIn: { ref: '0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4' as Address, expectedSymbol: 'TOSHI' },
    tokenOut: { ref: NATIVE },
    amounts: ['10000', '1000000', '100000000'],
    notes: 'memecoin',
  },
  {
    label: 'ETH→EURC',
    tokenIn: { ref: NATIVE },
    tokenOut: { ref: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42' as Address, expectedSymbol: 'EURC' },
    amounts: ['0.01', '1', '100'],
    notes: 'non-USD stable',
  },
  {
    label: 'VIRTUAL→ETH',
    tokenIn: { ref: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b' as Address, expectedSymbol: 'VIRTUAL' },
    tokenOut: { ref: NATIVE },
    amounts: ['10', '1000', '100000'],
    notes: '',
  },
  {
    label: 'ETH→flETH',
    tokenIn: { ref: NATIVE },
    tokenOut: { ref: '0x000000000D564D5be76f7f0d28fE52605afC7Cf8' as Address, expectedSymbol: 'flETH' },
    amounts: ['0.01', '1', '100'],
    notes: 'v4-native / hooked pools — probes pool CLASS, not depth',
  },
]

/** Arbitrum One (chain 42161). `USD₮0` is the on-chain symbol of the bridged USDT at
 * `0xFd08…Cbb9` since its rebrand — expected verbatim, not as 'USDT'. */
const ARBITRUM_PAIRS: BuiltinPairSpec[] = [
  {
    label: 'ETH→USDC',
    tokenIn: { ref: NATIVE },
    tokenOut: { ref: A_USDC, expectedSymbol: 'USDC' },
    amounts: ['0.01', '1', '100'],
    notes: 'baseline bluechip',
  },
  {
    label: 'ARB→ETH',
    tokenIn: { ref: '0x912CE59144191C1204E64559FE8253a0e49E6548' as Address, expectedSymbol: 'ARB' },
    tokenOut: { ref: NATIVE },
    amounts: ['100', '10000', '1000000'],
    notes: 'chain-native governance token',
  },
  {
    label: 'GMX→ETH',
    tokenIn: { ref: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a' as Address, expectedSymbol: 'GMX' },
    tokenOut: { ref: NATIVE },
    amounts: ['1', '100', '10000'],
    notes: '',
  },
  {
    label: 'PENDLE→ETH',
    tokenIn: { ref: '0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8' as Address, expectedSymbol: 'PENDLE' },
    tokenOut: { ref: NATIVE },
    amounts: ['10', '1000', '100000'],
    notes: '',
  },
  {
    label: 'wstETH→ETH',
    tokenIn: { ref: '0x5979D7b546E38E414F7E9822514be443A4800529' as Address, expectedSymbol: 'wstETH' },
    tokenOut: { ref: NATIVE },
    amounts: ['0.1', '10', '1000'],
    notes: 'correlated pair',
  },
  {
    label: 'MAGIC→ETH',
    tokenIn: { ref: '0x539bdE0d7Dbd336b79148AA742883198BBF60342' as Address, expectedSymbol: 'MAGIC' },
    tokenOut: { ref: NATIVE },
    amounts: ['1000', '100000', '10000000'],
    notes: 'thin long-tail — a miss candidate',
  },
  {
    label: 'ETH→USD₮0',
    tokenIn: { ref: NATIVE },
    tokenOut: { ref: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as Address, expectedSymbol: 'USD₮0' },
    amounts: ['0.01', '1', '100'],
    notes: '',
  },
]

/** Unichain (chain 130). Short on purpose: this chain's long tail is genuinely young, so the matrix
 * sticks to pairs with real venues and lets the sizes do the stressing. */
const UNICHAIN_PAIRS: BuiltinPairSpec[] = [
  {
    label: 'ETH→USDC',
    tokenIn: { ref: NATIVE },
    tokenOut: { ref: U_USDC, expectedSymbol: 'USDC' },
    amounts: ['0.01', '1', '100'],
    notes: 'baseline bluechip',
  },
  {
    label: 'USDC→USD₮0',
    tokenIn: { ref: U_USDC, expectedSymbol: 'USDC' },
    tokenOut: { ref: '0x9151434b16b9763660705744891fA906F660EcC5' as Address, expectedSymbol: 'USD₮0' },
    amounts: ['100', '10000', '1000000'],
    notes: 'stable/stable',
  },
  {
    label: 'ETH→DAI',
    tokenIn: { ref: NATIVE },
    tokenOut: { ref: '0x20CAb320A855b39F724131C69424240519573f81' as Address, expectedSymbol: 'DAI' },
    amounts: ['0.01', '1', '100'],
    notes: 'thinner stable',
  },
  {
    label: 'WBTC→ETH',
    tokenIn: { ref: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c' as Address, expectedSymbol: 'WBTC' },
    tokenOut: { ref: NATIVE },
    amounts: ['0.005', '0.5', '50'],
    notes: '',
  },
]

/**
 * Chain id → its pair matrix. A chain with a built-in MANIFEST but no entry here is a run this
 * script declines with a one-liner (see {@link main}) rather than an empty matrix: Robinhood Chain
 * (4663) routes fine through `rl`, but nobody has curated a pair list for it and the Trading API
 * does not serve it, so there is nothing here to compare.
 */
const CHAIN_MATRICES: Record<number, BuiltinPairSpec[]> = {
  1: MAINNET_PAIRS,
  130: UNICHAIN_PAIRS,
  8453: BASE_PAIRS,
  42161: ARBITRUM_PAIRS,
}

/**
 * The matrix for a chain, or the one-liner that says what would work.
 *
 * The MANIFEST check is already `buildChainContext`'s (`cli/chains.ts#resolveManifest` — an endpoint
 * serving a chain the SDK ships no manifest for never gets this far), so what is left for this
 * script to decide is narrower and its own: whether it has a curated pair list to sweep.
 */
function matrixFor(chainId: number): BuiltinPairSpec[] {
  const matrix = CHAIN_MATRICES[chainId]
  if (!matrix) {
    const covered = Object.keys(CHAIN_MATRICES)
      .map(Number)
      .sort((a, b) => a - b)
      .join(', ')
    throw new UsageError(
      `compare.ts ships no built-in pair matrix for chain ${chainId} (matrices exist for: ${covered}) — ` +
        'pass --pair "TOKENA/TOKENB[:amount]" to compare pairs on this chain instead',
    )
  }
  return matrix
}

/**
 * Verifies every distinct non-native address `specs` name, in one batch (`Promise.allSettled` over
 * `fetchTokenMeta`, which itself issues `symbol()`/`decimals()` together — see `cli/tokens.ts`), and
 * cross-checks the on-chain symbol against what the matrix expects.
 *
 * A mismatch or an unreadable token is reported as an `Error` in the returned map, never thrown —
 * {@link resolvePairs} drops the one or two pairs that named it, with a warning, rather than aborting
 * the whole run. That asymmetry with `resolveToken` (used for user-supplied `--pair`s, which throws)
 * is deliberate and matches this script's contract: a stale hardcoded address in ITS OWN matrix must
 * not block every other pair in the run, while a user who typed something that does not resolve
 * needs to know immediately.
 *
 * A wrong address therefore FAILS LOUDLY (a dropped pair, named, with the symbol it actually found)
 * and never quotes garbage — which is the whole reason the matrix carries `expectedSymbol` at all.
 */
async function verifyBuiltinTokens(ctx: ChainContext, specs: BuiltinPairSpec[]): Promise<Map<string, ResolvedToken | Error>> {
  const expected = new Map<string, string | undefined>()
  for (const spec of specs) {
    for (const t of [spec.tokenIn, spec.tokenOut]) {
      if (t.ref === 'native') continue
      const key = t.ref.toLowerCase()
      if (!expected.has(key)) expected.set(key, t.expectedSymbol)
    }
  }
  const entries = [...expected.entries()]
  const settled = await Promise.allSettled(entries.map(([addr]) => fetchTokenMeta(ctx.client, ctx.chain.chainId, addr as Address)))
  const out = new Map<string, ResolvedToken | Error>()
  settled.forEach((result, i) => {
    const [addr, expectedSymbol] = entries[i]!
    if (result.status === 'rejected') {
      const reason = result.reason instanceof Error ? result.reason : new Error(String(result.reason))
      out.set(addr, reason)
      return
    }
    if (expectedSymbol !== undefined && result.value.symbol.toLowerCase() !== expectedSymbol.toLowerCase()) {
      out.set(addr, new Error(`on-chain symbol '${result.value.symbol}' does not match expected '${expectedSymbol}'`))
      return
    }
    out.set(addr, result.value)
  })
  return out
}

// ---------------------------------------------------------------------------
// `--pair "TOKENA/TOKENB[:amount]"` parsing — pure, unit-tested.
// ---------------------------------------------------------------------------

export type PairSpecInput = { tokenInArg: string; tokenOutArg: string; amountHuman: string }

/** Amount defaults to `'1'` (human units) when the spec carries no `:amount` suffix. */
export function parsePairSpec(spec: string): PairSpecInput {
  const trimmed = spec.trim()
  const slash = trimmed.indexOf('/')
  if (slash <= 0 || slash === trimmed.length - 1) {
    throw new UsageError(`malformed --pair '${spec}' — expected 'TOKENA/TOKENB[:amount]'`)
  }
  const tokenInArg = trimmed.slice(0, slash).trim()
  const rest = trimmed.slice(slash + 1)
  const colon = rest.lastIndexOf(':')
  const tokenOutArg = (colon >= 0 ? rest.slice(0, colon) : rest).trim()
  const amountHuman = (colon >= 0 ? rest.slice(colon + 1) : '1').trim()
  if (tokenOutArg.length === 0) throw new UsageError(`malformed --pair '${spec}' — expected 'TOKENA/TOKENB[:amount]'`)
  if (amountHuman.length === 0) throw new UsageError(`malformed --pair '${spec}' — empty amount after ':'`)
  return { tokenInArg, tokenOutArg, amountHuman }
}

// ---------------------------------------------------------------------------
// Resolved pairs: what both sides quote against.
// ---------------------------------------------------------------------------

/**
 * One comparison subject: a pair AND a size.
 *
 * `pairLabel` and `amountHuman` are carried SEPARATELY from `label` (which is `PAIR @ AMOUNT`)
 * because the misses report groups by both axes — "every size of this pair missed" and "only the
 * whale size missed" are different findings, and reconstructing them by splitting a rendered string
 * back apart would be a parser where a field will do.
 */
export type ResolvedPair = {
  label: string
  pairLabel: string
  amountHuman: string
  tokenIn: ResolvedToken
  tokenOut: ResolvedToken
  amountIn: bigint
  notes: string
}

async function resolvePairs(ctx: ChainContext, userPairSpecs: string[]): Promise<ResolvedPair[]> {
  if (userPairSpecs.length > 0) {
    const pairs: ResolvedPair[] = []
    for (const spec of userPairSpecs) {
      const { tokenInArg, tokenOutArg, amountHuman } = parsePairSpec(spec)
      // `resolveToken` THROWS on a bad symbol/address (see cli/tokens.ts) — deliberately not caught
      // here, unlike the built-in matrix below: a user-supplied pair that does not resolve is an
      // argument mistake to fix, not a stale fixture to drop and move on from.
      const [tokenIn, tokenOut] = await Promise.all([
        resolveToken(ctx.client, ctx.chain.manifest, tokenInArg),
        resolveToken(ctx.client, ctx.chain.manifest, tokenOutArg),
      ])
      const amountIn = parseAmount(amountHuman, tokenIn.decimals)
      const pairLabel = `${tokenIn.symbol}→${tokenOut.symbol}`
      pairs.push({ label: `${pairLabel} @ ${amountHuman}`, pairLabel, amountHuman, tokenIn, tokenOut, amountIn, notes: 'user-supplied' })
    }
    return pairs
  }

  const specs = matrixFor(ctx.chain.chainId)
  const verified = await verifyBuiltinTokens(ctx, specs)
  const pairs: ResolvedPair[] = []
  for (const spec of specs) {
    const resolve = (t: BuiltinTokenSpec): ResolvedToken | Error =>
      t.ref === 'native' ? NATIVE_TOKEN : (verified.get(t.ref.toLowerCase()) ?? new Error('not verified'))
    const tokenIn = resolve(spec.tokenIn)
    const tokenOut = resolve(spec.tokenOut)
    if (tokenIn instanceof Error || tokenOut instanceof Error) {
      const reasons = [tokenIn, tokenOut].filter((t): t is Error => t instanceof Error).map((e) => e.message)
      console.error(yellow(`[compare] dropping built-in pair '${spec.label}': ${reasons.join('; ')}`))
      continue
    }
    // EVERY size is its own row — see {@link BuiltinPairSpec.amounts}.
    for (const amountHuman of spec.amounts) {
      pairs.push({
        label: `${spec.label} @ ${amountHuman}`,
        pairLabel: spec.label,
        amountHuman,
        tokenIn,
        tokenOut,
        amountIn: parseAmount(amountHuman, tokenIn.decimals),
        notes: spec.notes,
      })
    }
  }
  return pairs
}

function registerViews(renderCtx: RenderCtx, pairs: ResolvedPair[]): void {
  for (const pair of pairs) {
    renderCtx.views.set(viewKey(pair.tokenIn.ref), { symbol: pair.tokenIn.symbol, decimals: pair.tokenIn.decimals })
    renderCtx.views.set(viewKey(pair.tokenOut.ref), { symbol: pair.tokenOut.symbol, decimals: pair.tokenOut.decimals })
  }
  if (!renderCtx.views.has('native')) renderCtx.views.set('native', { symbol: 'ETH', decimals: 18 })
}

// ---------------------------------------------------------------------------
// router-lite side
// ---------------------------------------------------------------------------

export type LiteFlags = {
  aborted: boolean
  headRegressed: boolean
  verificationDegraded: boolean
  transportFailed: number
  /** {@link HARD_STOP_MULTIPLIER}'s wall-clock guard fired: the search's cooperative budget had
   * already expired and its stream was STILL producing, so this harness stopped reading. Reported,
   * never silent — a row that hard-stopped is a row whose search never got to finish winding down,
   * and that is evidence about the search, not a detail of the harness. */
  hardStopped: boolean
}

/**
 * The search's own account of what it managed to look at — the evidence a MISS is diagnosed from.
 *
 * Every field is read straight off `SearchReport` (`src/types.ts`), which is the point: a miss is
 * explained by the search's OWN report or not at all, never by this script guessing. `discovery` is
 * the per-protocol status word for each of `PROTOCOLS` (`v2:complete v3:partial v4:disabled`), which
 * separates "the router looked everywhere and there is no route" from "the router never finished
 * looking"; `legsMeasured` says whether it priced anything at all; `pairCeilingHit` names the one cap
 * that silently stops measuring pools; `exhaustive` is the report's own verdict over all of those.
 */
export type LiteEvidence = {
  discovery: string
  legsMeasured: number
  pairCeilingHit: boolean
  exhaustive: boolean
  intermediatesSelected: number
  intermediatesDiscovered: number
  quoting: QuoteResult['search']['quoting']
  aborted: boolean
}

export type LiteSideResult =
  | {
      kind: 'quote'
      amountOut: bigint
      gasEstimate?: bigint
      route: string
      firstActionableMs?: number
      finalMs: number
      flags: LiteFlags
      evidence: LiteEvidence
    }
  | {
      kind: 'no-route' | 'inconclusive'
      reasonCode: string
      reasonDetail: string
      firstActionableMs?: number
      finalMs: number
      flags: LiteFlags
      evidence: LiteEvidence
    }
  | { kind: 'error'; message: string; finalMs: number }

/** Folds a settled search's report into {@link LiteEvidence}. */
export function liteEvidence(search: QuoteResult['search']): LiteEvidence {
  return {
    discovery: PROTOCOLS.map((p) => `${p}:${search.discovery[p].status}`).join(' '),
    legsMeasured: search.enumeration.legsMeasured,
    pairCeilingHit: search.enumeration.pairCeilingHit,
    exhaustive: search.enumeration.exhaustiveWithinMaxHops,
    intermediatesSelected: search.enumeration.intermediatesSelected,
    intermediatesDiscovered: search.enumeration.intermediatesDiscovered,
    quoting: search.quoting,
    aborted: search.aborted,
  }
}

/**
 * How far past its own budget one row's stream is allowed to keep producing before this harness stops
 * reading, as a multiple of the budget.
 *
 * THE GUARD IS NOT BELT-AND-BRACES — IT IS LOAD-BEARING, and measured. `--budget` is COOPERATIVE
 * (see `cli/commands/context.ts`): the SDK observes the signal between search cycles, so a pair with
 * thousands of eligible intermediates and a hit pair ceiling can keep an already-aborted stream
 * producing for minutes. Observed on a warm mainnet cache at a 10s budget: `ETH→USDC @ 1` reported
 * `final 156681ms` with `aborted` set, and the same search through `rl quote --watch --budget 10s`
 * was still running past five minutes. Unguarded, one such pair costs more wall time than a whole
 * chain's sweep, which is fatal to a tool whose entire job is breadth.
 *
 * 3x, not 1x: the wind-down is legitimate work (in-flight legs settling into the last `final` event),
 * and cutting at the budget itself would throw away results the search had genuinely paid for.
 */
const HARD_STOP_MULTIPLIER = 3
/** Floor for the guard, so a deliberately tiny `--budget` still permits one real round trip. */
const HARD_STOP_FLOOR_MS = 5_000

/** The race's "the deadline won" arm — a unique value no `IteratorResult` can collide with. */
const DEADLINE = Symbol('deadline')

/**
 * Runs one pair through the router's `quotes()` event stream to the end of its OWN budget (like
 * `rl quote --watch`), recording the first-actionable moment as the first `lead` event's arrival
 * (like `rl quote --verbose`'s opening line) and the final best after the budget expires. Each pair
 * gets its own
 * fresh budget clock (`startBudget`, `cli/commands/context.ts`) rather than sharing one across the
 * whole matrix — a slow pair must not eat into the next pair's allowance.
 *
 * The stream is pulled one event at a time, RACED against a wall-clock deadline
 * ({@link HARD_STOP_MULTIPLIER}), rather than drained with `for await`: a cooperative budget cannot
 * bound a matrix run on its own, and the best-so-far this loop already holds is a perfectly good
 * answer to report for a row whose search would not stop. A row stopped that way says so
 * (`flags.hardStopped`).
 */
async function quoteLite(
  ctx: ChainContext,
  renderCtx: RenderCtx,
  pair: ResolvedPair,
  budgetMs: number,
  converge: boolean,
): Promise<LiteSideResult> {
  const budget = startBudget(budgetMs)
  const started = Date.now()
  const hardStopMs = Math.max(HARD_STOP_FLOOR_MS, budgetMs * HARD_STOP_MULTIPLIER)
  let firstActionableMs: number | undefined
  let final: QuoteResult | undefined
  let hardStopped = false
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined
  try {
    const request: QuoteRequest = {
      tokenIn: pair.tokenIn.ref,
      tokenOut: pair.tokenOut.ref,
      amountIn: pair.amountIn,
      ...(budget.signal ? { signal: budget.signal } : {}),
    }
    const iterator = ctx.router.quotes(request)[Symbol.asyncIterator]()
    const deadline = new Promise<typeof DEADLINE>((resolve) => {
      deadlineTimer = setTimeout(() => resolve(DEADLINE), hardStopMs)
    })
    for (;;) {
      const pull = iterator.next()
      const step = await Promise.race([pull, deadline])
      if (step === DEADLINE) {
        hardStopped = true
        // The abandoned pull and the courtesy `return()` are both fire-and-forget: whatever they
        // settle to lands after this row is already reported, and an abandoned promise that rejects
        // must not surface as an unhandled rejection halfway through the next pair's search.
        void pull.catch(() => undefined)
        void iterator.return?.(undefined).catch(() => undefined)
        break
      }
      if (step.done) break
      const event = step.value
      if (event.type === 'progress') continue
      // The first `lead` IS the first-actionable moment: a lead carries the full interim result
      // `getQuote` would have resolved with had the search stopped there. A `final` that never had a
      // lead before it priced nothing, so it must not backfill this.
      if (event.type === 'lead' && firstActionableMs === undefined) firstActionableMs = Date.now() - started
      final = event.result
      // THE DEFAULT STOP RULE IS `getQuote`'s, NOT `--watch`'s, and that is a correction this sweep
      // forced. `cli/commands/quote.ts` stops its default path at the first result that carries a
      // quote — "the same answer `getQuote` would give" — and only `--watch` drains the stream. This
      // script drained, on the theory that a comparison should give the router its whole budget.
      //
      // MEASURED, AND IT DOES NOT: the engine's post-settle phase is CPU-bound and does not yield, so
      // a single `next()` can sit for over a minute with the loop pegged at ~98%. The two bounds
      // below (the budget's own signal, and the wall-clock guard) are both checked BETWEEN events and
      // are therefore powerless inside that stretch. Whole-sweep effect on Base: 27 rows still
      // unfinished after 45 minutes, ~100s a row, against a documented 10s budget.
      //
      // So the default reading is now the one a caller actually gets from `getQuote`, which is also
      // the honest thing to compare against a Trading API response. `--converge` opts back into the
      // drain for a focused re-run of a handful of pairs, where minutes-per-row is affordable and the
      // question is convergence rather than coverage.
      if (!converge && final.status === 'quote') break
      // Both bounds still apply — to `--converge`, and to any row that never settles (a no-route pair
      // keeps searching until something stops it). The signal is cooperative, so the engine keeps
      // producing after it fires; stopping at the first event AFTER it keeps every result the budget
      // paid for and none of the work it did not. Synchronous, so it needs no timer to be serviced.
      if (budget.signal.aborted) break
    }
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err), finalMs: Date.now() - started }
  } finally {
    budget.cancel()
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer)
  }

  const finalMs = Date.now() - started
  if (!final) return { kind: 'error', message: 'search yielded no result', finalMs }

  const flags: LiteFlags = {
    aborted: final.search.aborted,
    headRegressed: final.search.headRegressed,
    verificationDegraded: final.search.verificationDegraded,
    transportFailed: final.search.quoting.transportFailed,
    hardStopped,
  }
  const evidence = liteEvidence(final.search)

  if (final.status === 'quote') {
    await hydrateLegSymbols(ctx, renderCtx, [final.best, ...final.alternatives])
    return {
      kind: 'quote',
      amountOut: final.best.quote.amountOut,
      ...(final.best.quote.gasEstimate !== undefined ? { gasEstimate: final.best.quote.gasEstimate } : {}),
      route: renderRoute(final.best.route, renderCtx),
      ...(firstActionableMs !== undefined ? { firstActionableMs } : {}),
      finalMs,
      flags,
      evidence,
    }
  }
  return {
    kind: final.status,
    reasonCode: final.reason.code,
    reasonDetail: final.reason.detail,
    ...(firstActionableMs !== undefined ? { firstActionableMs } : {}),
    finalMs,
    flags,
    evidence,
  }
}

// ---------------------------------------------------------------------------
// Trading API side
// ---------------------------------------------------------------------------

export const TRADING_API_URL = 'https://trade-api.gateway.uniswap.org/v1/quote'
/** A syntactically valid, never-funded address — the API requires a `swapper` but never moves funds
 * for a `/quote` call. */
export const TRADING_API_SWAPPER = '0x37305B1cD40574E4C5Ce33f8e8306Be057fD7341'
const NATIVE_ETH_ADDRESS = '0x0000000000000000000000000000000000000000'
/** Generous but bounded — this script's own request must never hang the whole matrix run. */
const API_REQUEST_TIMEOUT_MS = 30_000

export type TradingApiRequestBody = {
  type: 'EXACT_INPUT'
  amount: string
  tokenInChainId: number
  tokenOutChainId: number
  tokenIn: string
  tokenOut: string
  swapper: string
  slippageTolerance: number
  protocols: string[]
}

function tokenAddressForApi(ref: CurrencyRef): string {
  return ref === 'native' ? NATIVE_ETH_ADDRESS : ref
}

/**
 * The ONLY request shape this script sends — see the module header for why `routingPreference:
 * "CLASSIC"` (the spec's original guess) is not: the live API rejects it outright, and
 * `protocols: ["V2","V3","V4"]` is the confirmed way to get AMM-only routing, so there is no
 * fallback ladder to build.
 */
export function buildTradingApiBody(pair: Pick<ResolvedPair, 'tokenIn' | 'tokenOut' | 'amountIn'>, chainId: number): TradingApiRequestBody {
  return {
    type: 'EXACT_INPUT',
    amount: pair.amountIn.toString(),
    tokenInChainId: chainId,
    tokenOutChainId: chainId,
    tokenIn: tokenAddressForApi(pair.tokenIn.ref),
    tokenOut: tokenAddressForApi(pair.tokenOut.ref),
    swapper: TRADING_API_SWAPPER,
    slippageTolerance: 0.5,
    protocols: ['V2', 'V3', 'V4'],
  }
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined
}

/** `quote.output.amount` first (the confirmed live path), then a defensive scan of shapes an
 * unannounced API change might take — never a crash on an unfamiliar response. */
function extractAmountOut(json: unknown): bigint | undefined {
  const root = asRecord(json)
  if (!root) return undefined
  const quote = asRecord(root.quote)
  const candidates: unknown[] = [
    asRecord(quote?.output)?.amount,
    asRecord(root.output)?.amount,
    quote?.amountOut,
    root.amountOut,
    quote?.amount,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && /^\d+$/.test(c)) return BigInt(c)
    if (typeof c === 'number' && Number.isFinite(c)) return BigInt(Math.trunc(c))
  }
  return undefined
}

export type ParsedApiQuote = {
  amountOut?: bigint
  routing?: string
  routeString?: string
  /** Length of `quote.route` (an ARRAY OF ARRAYS — parallel paths, not legs of one path) when
   * present; `1` means a single path, `> 1` a split. Absent when the field is missing/malformed. */
  splitCount?: number
  gasUseEstimate?: string
  gasFeeWei?: string
  gasFeeUSD?: string
  priceImpact?: number
}

/** Parses a successful (2xx) Trading API body against the confirmed field paths — see this file's
 * header. Never throws: an unfamiliar shape simply yields fewer fields, all optional. */
export function parseTradingApiResponse(json: unknown): ParsedApiQuote {
  const root = asRecord(json)
  const quote = asRecord(root?.quote)
  const amountOut = extractAmountOut(json)
  const routing = typeof root?.routing === 'string' ? root.routing : undefined
  const routeString = typeof quote?.routeString === 'string' ? quote.routeString : undefined
  const splitCount = Array.isArray(quote?.route) ? quote.route.length : undefined
  const gasUseEstimate = typeof quote?.gasUseEstimate === 'string' ? quote.gasUseEstimate : undefined
  const gasFeeWei = typeof quote?.gasFee === 'string' ? quote.gasFee : undefined
  const gasFeeUSDRaw = quote?.gasFeeUSD
  const gasFeeUSD = typeof gasFeeUSDRaw === 'string' ? gasFeeUSDRaw : typeof gasFeeUSDRaw === 'number' ? String(gasFeeUSDRaw) : undefined
  const priceImpact = typeof quote?.priceImpact === 'number' ? quote.priceImpact : undefined
  return {
    ...(amountOut !== undefined ? { amountOut } : {}),
    ...(routing !== undefined ? { routing } : {}),
    ...(routeString !== undefined ? { routeString } : {}),
    ...(splitCount !== undefined ? { splitCount } : {}),
    ...(gasUseEstimate !== undefined ? { gasUseEstimate } : {}),
    ...(gasFeeWei !== undefined ? { gasFeeWei } : {}),
    ...(gasFeeUSD !== undefined ? { gasFeeUSD } : {}),
    ...(priceImpact !== undefined ? { priceImpact } : {}),
  }
}

/** The confirmed 400 shape: `{"errorCode":"RequestValidationError","detail":"..."}`. Returns
 * `undefined` for anything else (not JSON, or JSON without a `detail` string) so the caller falls
 * back to the raw (redacted) body. */
function extractApiErrorDetail(text: string): string | undefined {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return undefined
  }
  const root = asRecord(json)
  if (!root || typeof root.detail !== 'string') return undefined
  const code = typeof root.errorCode === 'string' ? `${root.errorCode}: ` : ''
  return `${code}${root.detail}`
}

/** Scrubs a literal API key out of anything about to be printed/persisted — a SEPARATE registry
 * from `cli/redact.ts`'s RPC-header-value scrub (a different credential, on a different transport),
 * composed with it via {@link redact} at every call site below. */
function redactApiKey(message: string, apiKey: string): string {
  return apiKey.length > 0 ? message.split(apiKey).join('<UNISWAP_API_KEY: redacted>') : message
}

type ApiHttpResult =
  | { ok: true; json: unknown; latencyMs: number }
  | { ok: false; httpStatus: number; text: string; detail?: string; latencyMs: number }
  | { ok: false; error: string; latencyMs: number }

/** One POST, wall-clock timed. The API key is sent only as the `x-api-key` header value — never in
 * the body, and never logged: every text this function returns to a `false` branch is already run
 * through {@link redactApiKey} composed with `redact` before it leaves this module. */
async function postTradingApiQuote(body: TradingApiRequestBody, apiKey: string): Promise<ApiHttpResult> {
  const started = Date.now()
  let res: Response
  try {
    res = await fetch(TRADING_API_URL, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(API_REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: redact(redactApiKey(message, apiKey)), latencyMs: Date.now() - started }
  }
  const latencyMs = Date.now() - started
  const text = await res.text()
  const scrubbed = redact(redactApiKey(text, apiKey))
  if (!res.ok) {
    const detail = extractApiErrorDetail(text)
    return {
      ok: false,
      httpStatus: res.status,
      text: scrubbed,
      ...(detail !== undefined ? { detail: redact(redactApiKey(detail, apiKey)) } : {}),
      latencyMs,
    }
  }
  try {
    return { ok: true, json: JSON.parse(text), latencyMs }
  } catch {
    // 2xx with a body that isn't JSON at all: report it as the error it is rather than crash.
    return { ok: false, httpStatus: res.status, text: scrubbed, latencyMs }
  }
}

export type ApiSideResult =
  | { kind: 'skipped' }
  | ({ kind: 'ok'; latencyMs: number; raw: unknown } & ParsedApiQuote)
  | { kind: 'error'; latencyMs: number; httpStatus?: number; message: string; raw?: string }

async function quoteTradingApi(pair: ResolvedPair, chainId: number, apiKey: string): Promise<ApiSideResult> {
  const body = buildTradingApiBody(pair, chainId)
  const attempt = await postTradingApiQuote(body, apiKey)
  if (attempt.ok) return { kind: 'ok', ...parseTradingApiResponse(attempt.json), latencyMs: attempt.latencyMs, raw: attempt.json }
  if ('httpStatus' in attempt) {
    return {
      kind: 'error',
      latencyMs: attempt.latencyMs,
      httpStatus: attempt.httpStatus,
      message: attempt.detail ?? attempt.text,
      raw: attempt.text,
    }
  }
  return { kind: 'error', latencyMs: attempt.latencyMs, message: attempt.error }
}

// ---------------------------------------------------------------------------
// Delta math — pure, unit-tested.
// ---------------------------------------------------------------------------

/**
 * `(lite - api) / api` in bps, signed: positive means router-lite found MORE output. `undefined`
 * when either side has no amount, or the API side is zero (nothing to divide by) — a delta is a
 * claim about a comparison that actually happened, not a fabricated number for a side that failed.
 * Three decimal places of precision (matches `cli/report.ts`'s own promoted-route bps note).
 */
export function deltaBps(liteOut: bigint | undefined, apiOut: bigint | undefined): number | undefined {
  if (liteOut === undefined || apiOut === undefined || apiOut === 0n) return undefined
  return Number(((liteOut - apiOut) * 10_000_000n) / apiOut) / 1000
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

export type ComparisonRow = { pair: ResolvedPair; lite: LiteSideResult; api: ApiSideResult }

// ---------------------------------------------------------------------------
// Miss detection — pure, unit-tested.
//
// A MISS is the finding this sweep exists for, and it is deliberately not the
// same thing as a loss. A loss is a price difference; a miss is a COVERAGE
// difference — one side had an answer and the other did not, or the answer was
// far enough off that it would never be chosen.
// ---------------------------------------------------------------------------

/**
 * The four miss kinds, each a different root-cause neighbourhood:
 *
 *  - `no-route` — the API quoted and router-lite reported `no-route`/`inconclusive`. The headline
 *    class: a trade the router cannot see at all.
 *  - `delta` — both quoted, but router-lite is off by more than {@link MISS_DELTA_BPS}. Catastrophic
 *    rather than merely worse: at 100+ bps the route would never be the one taken, so as a coverage
 *    finding it sits with the misses rather than in the win/loss record.
 *  - `error` — the router-lite side THREW (transport, config) instead of returning a verdict.
 *    Separated from `no-route` because the fix lives in a different place: nothing about the chain's
 *    liquidity is implicated.
 *  - `reverse` — router-lite quoted and the API did not. Also interesting, and reported rather than
 *    quietly celebrated: it is as often an API-side gap (an unsupported chain, an unlisted token) as
 *    it is a router-lite win, and only the row's own API error text can say which.
 */
export type MissClass = 'no-route' | 'delta' | 'error' | 'reverse'

export const MISS_CLASSES: MissClass[] = ['no-route', 'delta', 'error', 'reverse']

/** `|delta| >` this many bps is a miss, not a loss — see {@link MissClass}'s `delta` arm. */
export const MISS_DELTA_BPS = 100

/**
 * Which miss class a row is, or `undefined` for a row that is not a miss (including every row whose
 * API side was `skipped` — with no API answer there is nothing to be missing FROM).
 *
 * An API `ok` response with no readable `amountOut` counts as the API having no quote, exactly like
 * an HTTP error: the comparison this script can make is about amounts, and a 200 that carries none
 * did not answer the question.
 */
export function classifyMiss(row: ComparisonRow): MissClass | undefined {
  const { lite, api } = row
  if (api.kind === 'skipped') return undefined
  const apiQuoted = api.kind === 'ok' && api.amountOut !== undefined
  if (!apiQuoted) return lite.kind === 'quote' ? 'reverse' : undefined
  if (lite.kind === 'error') return 'error'
  if (lite.kind !== 'quote') return 'no-route'
  const delta = deltaBps(lite.amountOut, api.kind === 'ok' ? api.amountOut : undefined)
  return delta !== undefined && Math.abs(delta) > MISS_DELTA_BPS ? 'delta' : undefined
}

export type Miss = { row: ComparisonRow; missClass: MissClass }

/** Every miss, in row order. */
export function findMisses(rows: ComparisonRow[]): Miss[] {
  const out: Miss[] = []
  for (const row of rows) {
    const missClass = classifyMiss(row)
    if (missClass !== undefined) out.push({ row, missClass })
  }
  return out
}

export type Summary = {
  pairsTotal: number
  pairsCompared: number
  wins: number
  ties: number
  losses: number
  medianDeltaBps?: number
  /** The most NEGATIVE delta observed (router-lite's biggest shortfall vs the API), not the largest
   * absolute value — that is the number a reader chasing a regression actually wants. */
  worstDeltaBps?: number
  liteFirstActionableMedianMs?: number
  liteFinalMedianMs?: number
  apiMedianMs?: number
  /** Rows per {@link MissClass}, every class always present (zeroes included) — "no reverse misses"
   * is a result, and a key that vanishes when its count is zero makes it unreadable. */
  missCounts: Record<MissClass, number>
  missesTotal: number
  /** Rows whose stream was still producing past {@link HARD_STOP_MULTIPLIER}x their budget. A
   * budget-adherence reading, reported alongside the misses because it is the other way a coverage
   * sweep can be lied to: a row that hard-stopped answered from a truncated search. */
  hardStopped: number
  /** Always present: router-lite quotes a single best route by design, so a Trading API response
   * with more than one path in `quote.route` is an expected structural difference, not a discrepancy. */
  note: string
}

const SPLIT_ROUTE_NOTE =
  'router-lite always quotes a single best route by design; the Trading API can return a split route ' +
  '(quote.route as multiple parallel paths) — a split alone is not a discrepancy, it is a different execution model.'

export function summarize(rows: ComparisonRow[]): Summary {
  const deltas: number[] = []
  let wins = 0
  let ties = 0
  let losses = 0
  const liteFinalMs: number[] = []
  const liteFirstMs: number[] = []
  const apiMs: number[] = []

  for (const { lite, api } of rows) {
    if (lite.kind === 'quote') {
      liteFinalMs.push(lite.finalMs)
      if (lite.firstActionableMs !== undefined) liteFirstMs.push(lite.firstActionableMs)
    }
    if (api.kind === 'ok') {
      apiMs.push(api.latencyMs)
      if (lite.kind === 'quote') {
        const d = deltaBps(lite.amountOut, api.amountOut)
        if (d !== undefined) {
          deltas.push(d)
          if (Math.abs(d) < 1) ties++
          else if (d > 0) wins++
          else losses++
        }
      }
    }
  }

  const missCounts = { 'no-route': 0, delta: 0, error: 0, reverse: 0 } satisfies Record<MissClass, number>
  for (const { missClass } of findMisses(rows)) missCounts[missClass]++
  const missesTotal = MISS_CLASSES.reduce((sum, c) => sum + missCounts[c], 0)
  const hardStopped = rows.filter((r) => r.lite.kind !== 'error' && r.lite.flags.hardStopped).length

  const worst = deltas.length > 0 ? deltas.reduce((min, d) => (d < min ? d : min)) : undefined
  const medianDelta = median(deltas)
  const liteFinalMedian = median(liteFinalMs)
  const liteFirstMedian = median(liteFirstMs)
  const apiMedian = median(apiMs)

  return {
    pairsTotal: rows.length,
    pairsCompared: deltas.length,
    wins,
    ties,
    losses,
    ...(medianDelta !== undefined ? { medianDeltaBps: medianDelta } : {}),
    ...(worst !== undefined ? { worstDeltaBps: worst } : {}),
    ...(liteFirstMedian !== undefined ? { liteFirstActionableMedianMs: liteFirstMedian } : {}),
    ...(liteFinalMedian !== undefined ? { liteFinalMedianMs: liteFinalMedian } : {}),
    ...(apiMedian !== undefined ? { apiMedianMs: apiMedian } : {}),
    missCounts,
    missesTotal,
    hardStopped,
    note: SPLIT_ROUTE_NOTE,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderLiteSide(lite: LiteSideResult, pair: ResolvedPair, renderCtx: RenderCtx): string[] {
  const lines: string[] = []
  if (lite.kind === 'quote') {
    const first = lite.firstActionableMs !== undefined ? `${lite.firstActionableMs}ms` : 'n/a'
    lines.push(`  lite   ${bold(amountFor(renderCtx, pair.tokenOut.ref, lite.amountOut))}  first ${first} · final ${lite.finalMs}ms`)
    lines.push(`         ${dim(lite.route)}`)
  } else if (lite.kind === 'error') {
    lines.push(`  lite   ${red('error')} ${lite.message} (${lite.finalMs}ms)`)
  } else {
    lines.push(`  lite   ${yellow(lite.kind)} ${lite.reasonCode} — ${lite.reasonDetail} (${lite.finalMs}ms)`)
  }
  if (lite.kind !== 'error') {
    const flagList = [
      lite.flags.aborted && 'aborted',
      lite.flags.headRegressed && 'head-regressed',
      lite.flags.verificationDegraded && 'verification-degraded',
      lite.flags.transportFailed > 0 && `${lite.flags.transportFailed} transport-lost`,
      lite.flags.hardStopped && 'hard-stopped (stream still producing past the budget)',
    ].filter((f): f is string => Boolean(f))
    if (flagList.length > 0) lines.push(`         ${dim(`flags: ${flagList.join(' · ')}`)}`)
  }
  return lines
}

function renderApiSide(api: ApiSideResult, pair: ResolvedPair, renderCtx: RenderCtx): string[] {
  if (api.kind === 'skipped') return [`  api    ${dim('skipped (no UNISWAP_API_KEY)')}`]
  if (api.kind === 'error') {
    const status = api.httpStatus !== undefined ? `HTTP ${api.httpStatus}` : 'request failed'
    return [`  api    ${red(status)} ${api.message} (${api.latencyMs}ms)`]
  }
  const amount = api.amountOut !== undefined ? amountFor(renderCtx, pair.tokenOut.ref, api.amountOut) : dim('[no amount in response]')
  const split = api.splitCount !== undefined && api.splitCount > 1 ? cyan(` (${api.splitCount}-way split)`) : ''
  const lines = [`  api    ${bold(amount)}  ${api.latencyMs}ms  ${dim(api.routing ?? '')}`]
  lines.push(`         ${dim(api.routeString ?? '[no routeString in response]')}${split}`)
  return lines
}

function printRow(row: ComparisonRow, renderCtx: RenderCtx): void {
  const { pair, lite, api } = row
  const amountInStr = amountFor(renderCtx, pair.tokenIn.ref, pair.amountIn)
  const bps = lite.kind === 'quote' && api.kind === 'ok' ? deltaBps(lite.amountOut, api.amountOut) : undefined
  const bpsStr = bps !== undefined ? (bps >= 0 ? green(`+${bps} bps`) : red(`${bps} bps`)) : dim('n/a')
  console.log('')
  console.log(`${bold(pair.label)}  ${dim(amountInStr)}${pair.notes ? dim(` — ${pair.notes}`) : ''}  ${dim('delta')} ${bpsStr}`)
  for (const line of renderLiteSide(lite, pair, renderCtx)) console.log(line)
  for (const line of renderApiSide(api, pair, renderCtx)) console.log(line)
}

/** The search's own account of what it looked at, one line, for a MISS entry. */
function renderEvidence(evidence: LiteEvidence): string[] {
  const q = evidence.quoting
  return [
    `         ${dim(`discovery ${evidence.discovery} · exhaustive ${evidence.exhaustive}`)}`,
    `         ${dim(
      `legsMeasured ${evidence.legsMeasured} · quoting ${q.attempted} attempted / ${q.succeeded} ok / ${q.failed} reverted / ` +
        `${q.transportFailed} transport-lost / ${q.unattempted} unattempted`,
    )}`,
    `         ${dim(
      `intermediates ${evidence.intermediatesSelected}/${evidence.intermediatesDiscovered} selected · ` +
        `pairCeilingHit ${evidence.pairCeilingHit} · aborted ${evidence.aborted}`,
    )}`,
  ]
}

/** Why the API side counts as "no quote" for a {@link MissClass} `reverse` — the row's own text. */
function apiFailureNote(api: ApiSideResult): string {
  if (api.kind === 'error') return `api ${api.httpStatus !== undefined ? `HTTP ${api.httpStatus}` : 'request failed'}: ${api.message}`
  if (api.kind === 'ok') return 'api 200 with no readable amountOut'
  return 'api skipped'
}

/**
 * The MISSES section: every coverage gap, in one place, each with enough of the search's own report
 * beside it to be diagnosed without re-running the pair.
 *
 * Printed AFTER the per-row detail and the summary on purpose — it is the thing a reader scrolls to
 * the bottom for, and it repeats (rather than references) each miss's numbers so it stands alone when
 * copied out of a terminal into an issue.
 */
function printMisses(rows: ComparisonRow[], renderCtx: RenderCtx, chainId: number): void {
  const misses = findMisses(rows)
  console.log('')
  if (misses.length === 0) {
    console.log(`${bold('misses')} ${green('none')} ${dim(`— chain ${chainId}: no no-route/error/reverse gaps and every delta within ${MISS_DELTA_BPS} bps`)}`)
    return
  }
  console.log(`${bold('misses')} ${red(`${misses.length}`)} ${dim(`of ${rows.length} rows (chain ${chainId})`)}`)
  for (const missClass of MISS_CLASSES) {
    const inClass = misses.filter((m) => m.missClass === missClass)
    if (inClass.length === 0) continue
    console.log('')
    console.log(`  ${bold(`[${missClass}]`)} ${dim(`${inClass.length} row${inClass.length === 1 ? '' : 's'}`)}`)
    for (const { row } of inClass) {
      const { pair, lite, api } = row
      const apiAmount =
        api.kind === 'ok' && api.amountOut !== undefined ? amountFor(renderCtx, pair.tokenOut.ref, api.amountOut) : dim('[none]')
      const liteAmount = lite.kind === 'quote' ? amountFor(renderCtx, pair.tokenOut.ref, lite.amountOut) : dim('[none]')
      const bps = lite.kind === 'quote' && api.kind === 'ok' ? deltaBps(lite.amountOut, api.amountOut) : undefined
      console.log(`  ${bold(pair.label)}${pair.notes ? dim(` — ${pair.notes}`) : ''}`)
      console.log(`         api ${apiAmount}   lite ${liteAmount}${bps !== undefined ? dim(`   delta ${bps} bps`) : ''}`)
      if (lite.kind === 'error') {
        console.log(`         ${red('lite error')} ${lite.message}`)
      } else if (lite.kind !== 'quote') {
        console.log(`         ${yellow(lite.kind)} ${lite.reasonCode} — ${lite.reasonDetail}`)
      }
      if (api.kind !== 'ok' || api.amountOut === undefined) console.log(`         ${dim(apiFailureNote(api))}`)
      if (lite.kind !== 'error') for (const line of renderEvidence(lite.evidence)) console.log(line)
    }
  }
}

function printSummary(summary: Summary): void {
  console.log('')
  console.log(bold('summary'))
  console.log(`  pairs         ${summary.pairsCompared}/${summary.pairsTotal} compared (both sides answered)`)
  console.log(`  lite record   ${summary.wins} win${summary.wins === 1 ? '' : 's'} · ${summary.ties} tie${summary.ties === 1 ? '' : 's'} · ${summary.losses} loss${summary.losses === 1 ? '' : 'es'} (|Δ| < 1 bps is a tie)`)
  if (summary.medianDeltaBps !== undefined) console.log(`  delta bps     median ${summary.medianDeltaBps} · worst ${summary.worstDeltaBps}`)
  if (summary.liteFirstActionableMedianMs !== undefined) {
    console.log(`  lite latency  first-actionable median ${summary.liteFirstActionableMedianMs}ms · final median ${summary.liteFinalMedianMs}ms`)
  }
  if (summary.apiMedianMs !== undefined) console.log(`  api latency   median ${summary.apiMedianMs}ms`)
  const missBreakdown = MISS_CLASSES.map((c) => `${summary.missCounts[c]} ${c}`).join(' · ')
  const missTotal = summary.missesTotal === 0 ? green('0') : red(String(summary.missesTotal))
  console.log(`  misses        ${missTotal} total — ${missBreakdown} (delta miss: |Δ| > ${MISS_DELTA_BPS} bps)`)
  if (summary.hardStopped > 0) {
    console.log(
      `  budget        ${yellow(`${summary.hardStopped}`)} row${summary.hardStopped === 1 ? '' : 's'} hard-stopped — ` +
        `the search's stream was still producing at ${HARD_STOP_MULTIPLIER}x its budget`,
    )
  }
  console.log(dim(`  note: ${summary.note}`))
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const FLAGS: FlagSpec = {
  rpc: { kind: 'string' },
  'rpc-header': { kind: 'strings' },
  budget: { kind: 'string' },
  json: { kind: 'boolean' },
  'dry-run': { kind: 'boolean' },
  // Opt back into draining each row's stream to its budget instead of stopping at the first quote —
  // see the stop rule in `quoteLite` for why that is not the default, and what it costs.
  converge: { kind: 'boolean' },
  pair: { kind: 'strings' },
  ...CACHE_FLAGS,
}

/** `--budget`'s default for this script — PER PAIR, unlike `rl`'s unbounded default, because a
 * comparison matrix that could hang forever on one long-tail pair defeats the point of a tool meant
 * to be run repeatedly while iterating on the search. */
const DEFAULT_BUDGET_MS = 10_000
/** {@link DEFAULT_BUDGET_MS} in `--budget`'s own surface syntax, for {@link defaultTheBudgetFlag}. */
const DEFAULT_BUDGET_SPEC = `${DEFAULT_BUDGET_MS}ms`

/**
 * Writes this script's default into the `--budget` FLAG when the caller gave none — before
 * `buildChainContext` reads it.
 *
 * NOT COSMETIC, AND NOT REDUNDANT with the `?? DEFAULT_BUDGET_MS` further down. `--budget` shapes two
 * different things: the search's abort clock (`startBudget`, per pair, which the fallback below
 * covered) and the viem TRANSPORT's timeout and retry policy, which only `buildChainContext` can set
 * because that is where the client is built. A default that lived only in this file therefore left
 * the transport on its unbudgeted settings — a 30s per-request timeout times viem's default retries —
 * so the abort signal fired on schedule at 10s and then waited on an `eth_getLogs` that was still
 * allowed minutes to finish. MEASURED, on a warm mainnet cache: the first two rows of a sweep with
 * the documented 10s per-pair budget reported `final 150543ms` and `final 94177ms`, both flagged
 * `aborted`. Across 111 rows that is the difference between a 25-minute sweep and a 3-hour one.
 *
 * Defaulting the flag rather than threading a second parameter keeps ONE spelling of the budget:
 * `buildChainContext` and the per-pair clock read the same string, so they cannot disagree about what
 * this script's default is.
 */
export function defaultTheBudgetFlag(strings: Map<string, string>, spec: string = DEFAULT_BUDGET_SPEC): void {
  if (!strings.has('budget')) strings.set('budget', spec)
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2), FLAGS)
  const json = parsed.booleans.has('json')
  const dryRun = parsed.booleans.has('dry-run')
  const converge = parsed.booleans.has('converge')
  if (json) setColorEnabled(false)
  const userPairSpecs = parsed.lists.get('pair') ?? []
  // BEFORE `buildChainContext`, which is the only place the transport's timeout/retry policy can be
  // derived from `--budget` — see {@link defaultTheBudgetFlag} for what leaving it unset cost.
  defaultTheBudgetFlag(parsed.strings)

  // `buildChainContext` does the chain-touching setup this script shares with `rl quote`: resolves
  // the RPC endpoint, resolves+REGISTERS `--rpc-header`/`$ETH_RPC_HEADERS` for redaction (before its
  // own `eth_chainId` probe — the first network call), detects the chain, builds the client/router,
  // and loads/schedules the on-disk pool cache (respecting `--no-cache`). See that function for why
  // each of those happens in that order.
  const ctx = await buildChainContext(parsed)
  try {
    // The chain guard is now `matrixFor`'s, inside `resolvePairs` — reached only when no `--pair`
    // overrides the matrix, and phrased as "no matrix for this chain" because the narrower "no
    // manifest for this chain" was already decided upstream by `buildChainContext`.
    const pairs = await resolvePairs(ctx, userPairSpecs)
    if (pairs.length === 0) throw new UsageError('no pairs survived verification — nothing to compare')

    const renderCtx: RenderCtx = { views: new Map() }
    registerViews(renderCtx, pairs)

    if (dryRun) {
      const requests = pairs.map((pair) => ({ label: pair.label, body: buildTradingApiBody(pair, ctx.chain.chainId) }))
      if (json) {
        console.log(jsonify({ dryRun: true, chainId: ctx.chain.chainId, requests }))
      } else {
        console.log(bold(`compare — dry run: ${requests.length} Trading API request bod${requests.length === 1 ? 'y' : 'ies'} (chain ${ctx.chain.chainId})`))
        for (const { label, body } of requests) {
          console.log('')
          console.log(bold(label))
          console.log(JSON.stringify(body, null, 2))
        }
      }
      return 0
    }

    const apiKey = process.env.UNISWAP_API_KEY
    if (!apiKey && !json) console.log(dim('note: $UNISWAP_API_KEY is unset — running router-lite only; the api column will read "skipped"'))

    const budgetArg = parsed.strings.get('budget')
    const budgetMs = budgetArg !== undefined ? parseBudget(budgetArg) : DEFAULT_BUDGET_MS
    if (!json) {
      console.log(
        bold(`compare — ${ctx.chain.label} (${ctx.chain.chainId}): ${pairs.length} rows`) +
          dim(
            ` · ${budgetMs}ms lite budget per row · ${converge ? 'converge (drain to budget)' : 'getQuote reading (first quote)'} · ` +
              `miss threshold ${MISS_DELTA_BPS} bps`,
          ),
      )
    }

    // Sequential, deliberately: each pair gets the search's full attention (and its own budget
    // clock) rather than N searches contending for one client's concurrency limit at once, which
    // would make every pair's latency measurement a function of how many OTHER pairs happened to be
    // running at the same moment instead of a property of that pair alone.
    const rows: ComparisonRow[] = []
    for (const pair of pairs) {
      const lite = await quoteLite(ctx, renderCtx, pair, budgetMs, converge)
      const api = apiKey ? await quoteTradingApi(pair, ctx.chain.chainId, apiKey) : { kind: 'skipped' as const }
      rows.push({ pair, lite, api })
      if (!json) printRow(rows[rows.length - 1]!, renderCtx)
    }

    const summary = summarize(rows)
    if (json) {
      const misses = findMisses(rows).map(({ row, missClass }) => ({ label: row.pair.label, missClass }))
      console.log(jsonify({ chainId: ctx.chain.chainId, apiKeyPresent: Boolean(apiKey), rows, summary, misses }))
    } else {
      printSummary(summary)
      printMisses(rows, renderCtx, ctx.chain.chainId)
    }

    // Deltas are DATA, not a failure — the scripting contract here is "did the run complete", not
    // "did router-lite win". The one exception: every attempted API call coming back 401 is not a
    // comparison result at all, it is `$UNISWAP_API_KEY` being wrong, and that is an infra failure a
    // script should be able to tell apart from "the run completed and found a regression".
    const attempted = rows.map((r) => r.api).filter((a): a is Extract<ApiSideResult, { kind: 'error' }> => a.kind === 'error')
    if (apiKey && attempted.length > 0 && attempted.length === rows.length && attempted.every((a) => a.httpStatus === 401)) {
      console.error(red('compare: every Trading API call returned 401 — check $UNISWAP_API_KEY'))
      return 1
    }
    return 0
  } finally {
    await flushCacheSave()
  }
}

// Runs `main()` only when this file is the process's entry point (`bun scripts/compare.ts …`), never
// when `compare.test.ts` imports its pure functions — mirrors Node's `require.main === module` idiom
// rather than `import.meta.main`, which needs `bun-types`/`@types/bun` that this repo deliberately
// does not depend on (see `typings/bun-test.d.ts`'s header for why: hoisting `bun-types` into the
// root `node_modules` breaks sibling packages still on TypeScript 4.x).
const isEntryPoint = process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url)

if (isEntryPoint) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((err) => {
      // Mirrors `cli/rl.ts`'s own top-level mapping, collapsed to this script's simpler exit
      // contract (0 = completed, nonzero = infra/usage failure — see the module header).
      if (err instanceof UsageError || err instanceof AmountError || err instanceof RpcError) {
        console.error(red('compare: ') + redact(err.message))
      } else {
        const message = err instanceof Error ? (err.stack ?? err.message) : String(err)
        console.error(red('compare: unexpected error:'))
        console.error(redact(message))
      }
      process.exitCode = 1
    })
}
