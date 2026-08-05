# router-lite-sdk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@uniswap/router-lite-sdk` — RPC-only, wave-based route finding across Uniswap v2/v3/v4 returning verified Universal Router calldata — per the approved spec `docs/superpowers/specs/2026-08-03-router-lite-sdk-design.md` (rev 4).

**Architecture:** A wave engine (async generator, owns stopping/abort) drives stateless primitives: ProtocolModules (discover/probe/quote-encode/custody-compile per protocol) → candidate generation → block-pinned quoting → ExecutionPlan compiler → version-bound UR encoder → readiness reads + real-trader preflight. One type ladder, data flows one way.

**Tech Stack:** TypeScript strict, viem ^2.23.5, bun test, plain tsc 3-pass build. `universal-router-sdk`/`v2-sdk`/`v3-sdk`/`v4-sdk` as devDependencies (differential oracles only).

## Global Constraints

- Runtime deps: **only** `viem` + `@uniswap/sdk-core`. Ethers-based SDKs are devDependencies, imported only in `*.test.ts`.
- All public types defined in-package (`src/types.ts`), viem-native (`Address`, `Hex`, `bigint`).
- Branch: `feat/router-lite-sdk-v2`. Package dir: `sdks/router-lite-sdk`. npm name: `@uniswap/router-lite-sdk`, version `0.0.0`, `private: false`.
- Copy build/lint conventions from `sdks/liquidity-launcher-sdk`: tsconfig.{base,cjs,esm,types}.json, `.eslintrc.js`, prettier `{ printWidth: 120, semi: false, singleQuote: true }`.
- Business outcomes are result values, never throws. Only `RouterConfigError` / `UnsupportedRouteError` throw.
- Internal constants (src/constants.ts): `MAX_POOLS_PER_PAIR = 3`, `MAX_INTERMEDIATES = 8`, `MAX_QUOTE_CANDIDATES = 48`, `PREFLIGHT_TOP_K = 3`, `SIMPLICITY_MARGIN_BPS = 5`, `MAX_CONCURRENT_CALLS = 20`, `REORG_OVERLAP_BLOCKS = 32n`.
- Run tests from repo root as `bun test sdks/router-lite-sdk` (workspace glob `sdks/*` already covers the new package).
- Every commit message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 0: Package scaffold

**Files:**
- Create: `sdks/router-lite-sdk/package.json`, `tsconfig.base.json`, `tsconfig.cjs.json`, `tsconfig.esm.json`, `tsconfig.types.json`, `.eslintrc.js`, `src/index.ts`

**Interfaces:**
- Produces: a building, lintable, testable empty package all later tasks live in.

- [ ] **Step 1:** Copy `sdks/liquidity-launcher-sdk/{tsconfig.base.json,tsconfig.cjs.json,tsconfig.esm.json,tsconfig.types.json,.eslintrc.js}` verbatim into `sdks/router-lite-sdk/`. Write `package.json` by copying liquidity-launcher-sdk's and changing: `"name": "@uniswap/router-lite-sdk"`, `"version": "0.0.0"`, `"description": "Lightweight RPC-only router: find and encode working Uniswap v2/v3/v4 routes over any viem PublicClient"`, deps `{ "@uniswap/sdk-core": "workspace:*", "viem": "^2.23.5" }`, devDeps `{ "@uniswap/universal-router-sdk": "workspace:*", "@uniswap/router-sdk": "workspace:*", "@uniswap/v2-sdk": "workspace:*", "@uniswap/v3-sdk": "workspace:*", "@uniswap/v4-sdk": "workspace:*", "typescript": "^5" }`. Add `"exports"` map entries for `"."` and `"./experimental"` (cjs/esm/types triplets, same pattern as the main export).
- [ ] **Step 2:** Write `src/index.ts` containing only `export const VERSION = '0.0.0'` (placeholder export removed in Task 18).
- [ ] **Step 3:** Run: `cd /Users/mark.toda/dev/sdks && bun install && bun run --cwd sdks/router-lite-sdk build && bun run --cwd sdks/router-lite-sdk lint`. Expected: clean build + lint.
- [ ] **Step 4:** Commit: `feat(router-lite-sdk): scaffold package`

---

### Task 1: Domain types, errors, constants

**Files:**
- Create: `sdks/router-lite-sdk/src/types.ts`, `src/errors.ts`, `src/constants.ts`
- Test: `src/types.test.ts`

**Interfaces:**
- Produces (verbatim names all later tasks use): `Protocol = 'v2' | 'v3' | 'v4'`, `CurrencyRef`, `PoolKey`, `PoolHint`, `PoolRef`, `PoolRecord`, `RouteLeg`, `RouteCandidate`, `RouteQuote`, `QuotedRoute`, `RankedRoute`, `EncodedTx`, `BlockRef`, `BlockRange = { fromBlock: bigint; toBlock: bigint }`, `Permit2PermitSingle`, `ExecutionRequirement`, `QuoteResult`, `SwapResult`, `SearchReport`, `QuoteRequest`, `SwapRequest`, `EthCall = { to: Address; data: Hex; value?: bigint; from?: Address }`, `QuoteCall = { call: EthCall; decode(returnData: Hex): bigint }`, `LogQuery = { address: Address; topics: (Hex | null)[] }`, `Custody = { payer: 'trader-via-permit2' | 'router'; recipient: 'router' | 'final' }`, `ExecutionPlan`, `ExecutionOperation`, `RouterConfigError`, `UnsupportedRouteError`.

- [ ] **Step 1: Write failing test**

```ts
// src/types.test.ts
import { describe, expect, test } from 'bun:test'
import { RouterConfigError, UnsupportedRouteError } from './errors'
import type { PoolRef, RouteLeg, SwapResult } from './types'

describe('domain types', () => {
  test('errors are typed and named', () => {
    expect(new RouterConfigError('x').name).toBe('RouterConfigError')
    expect(new UnsupportedRouteError('x').name).toBe('UnsupportedRouteError')
    expect(new RouterConfigError('x')).toBeInstanceOf(Error)
  })
  test('discriminated unions narrow', () => {
    const ref: PoolRef = { protocol: 'v2', address: '0x0000000000000000000000000000000000000001', token0: '0x0000000000000000000000000000000000000002', token1: '0x0000000000000000000000000000000000000003' }
    const leg: RouteLeg = { pool: ref, currencyIn: 'native', currencyOut: ref.token1 }
    const r: SwapResult = { status: 'no-route', reason: 'test', search: emptyReport() }
    expect(leg.pool.protocol).toBe('v2')
    expect(r.status).toBe('no-route')
  })
})
```

Add to `src/internal/testing.ts` (exported test helpers, used by every later task's tests):
- `emptyReport(): SearchReport` (all-zero counts, all-protocol `disabled`, `aborted: false`).
- `assertResultCoherent(r: QuoteResult | SwapResult): void` — the honesty invariants, mechanically enforced everywhere:

```ts
export function assertResultCoherent(r: QuoteResult | SwapResult): void {
  if (r.status === 'ready') {
    if (!r.tx || r.execution.verifiedAtBlock.number !== r.search.block.number) throw new Error('ready without at-block verification')
  }
  if (r.status === 'needs-action' && (r.requirements.length === 0 || !r.tx)) throw new Error('needs-action without requirements+tx')
  if (r.status === 'no-route') {
    for (const [p, d] of Object.entries(r.search.discovery))
      if (d.status !== 'complete' && d.status !== 'disabled') throw new Error(`no-route with ${p} discovery ${d.status}`)
    if (r.search.aborted) throw new Error('no-route despite abort')
  }
  if (r.status === 'inconclusive') {
    const incomplete = r.search.aborted || Object.values(r.search.discovery).some(d => d.status === 'partial' || d.status === 'failed') || r.search.quoting.unattempted > 0
    if (!incomplete) throw new Error('inconclusive with no incompleteness axis set')
  }
  const q = r.search.quoting
  if (q.attempted !== q.succeeded + q.failed) throw new Error('quoting stats do not add up')
}
```

Every test in Tasks 12, 17, 18, and the fork/canary suites that produces a result MUST pass it through `assertResultCoherent` — a classification bug then fails tests that were checking something else entirely.

- [ ] **Step 2:** Run `bun test sdks/router-lite-sdk` — FAIL (modules missing).
- [ ] **Step 3:** Write `src/types.ts` **exactly** as the spec's Domain model + Results + SearchReport + Requests sections (copy the code blocks; they are complete). Write `src/errors.ts` with the two Error subclasses setting `this.name`. Write `src/constants.ts` with the Global Constraints values.
- [ ] **Step 4:** Run `bun test sdks/router-lite-sdk` — PASS. Also `bun run --cwd sdks/router-lite-sdk build`.
- [ ] **Step 5:** Commit: `feat(router-lite-sdk): domain model, errors, internal constants`

---

### Task 2: Currency utilities

**Files:**
- Create: `src/internal/currency.ts`
- Test: `src/internal/currency.test.ts`

**Interfaces:**
- Produces: `isNative(c: CurrencyRef): c is 'native'`, `toGraphNode(c: CurrencyRef, wrappedNative: Address): Address` (native→wrapped, lowercased), `sortAddresses(a: Address, b: Address): [Address, Address]`, `sameToken(a: CurrencyRef, b: CurrencyRef): boolean` (exact), `sameFamily(a: CurrencyRef, b: CurrencyRef, wrappedNative: Address): boolean` (native≡wrapped).

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, test } from 'bun:test'
import { isNative, sameFamily, sortAddresses, toGraphNode } from './currency'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as const
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const

test('native normalizes to wrapped for the graph', () => {
  expect(isNative('native')).toBe(true)
  expect(toGraphNode('native', WETH)).toBe(WETH.toLowerCase())
  expect(toGraphNode(USDC, WETH)).toBe(USDC.toLowerCase())
})
test('sortAddresses is stable and case-insensitive', () => {
  expect(sortAddresses(WETH, USDC)).toEqual([USDC, WETH])
  expect(sortAddresses(USDC, WETH)).toEqual([USDC, WETH])
})
test('sameFamily unifies native and wrapped only', () => {
  expect(sameFamily('native', WETH, WETH)).toBe(true)
  expect(sameFamily('native', USDC, WETH)).toBe(false)
  expect(sameFamily(USDC, USDC, WETH)).toBe(true)
})
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement (compare via `.toLowerCase()`; sort by lowercased hex; return original casing). **Step 4:** Run — PASS. **Step 5:** Commit: `feat(router-lite-sdk): currency utilities`

---

### Task 3: v4 poolId

**Files:**
- Create: `src/internal/poolId.ts`
- Test: `src/internal/poolId.test.ts`

**Interfaces:**
- Produces: `computeV4PoolId(key: PoolKey): Hex` — `keccak256(encodeAbiParameters([{type:'address'},{type:'address'},{type:'uint24'},{type:'int24'},{type:'address'}], [currency0, currency1, fee, tickSpacing, hooks]))`. Note v4 encodes native as `address(0)`.

- [ ] **Step 1: Failing test** — differential against v4-sdk (devDep):

```ts
import { describe, expect, test } from 'bun:test'
import { Pool } from '@uniswap/v4-sdk'
import { Ether, Token } from '@uniswap/sdk-core'
import { computeV4PoolId } from './poolId'

test('matches v4-sdk Pool.getPoolId', () => {
  const eth = Ether.onChain(1)
  const usdc = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6)
  const sdkId = Pool.getPoolId(eth, usdc, 500, 10, '0x0000000000000000000000000000000000000000')
  const ours = computeV4PoolId({
    currency0: '0x0000000000000000000000000000000000000000',
    currency1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    fee: 500, tickSpacing: 10, hooks: '0x0000000000000000000000000000000000000000',
  })
  expect(ours.toLowerCase()).toBe(sdkId.toLowerCase())
})
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement with viem `keccak256` + `encodeAbiParameters`. **Step 4:** Run — PASS. **Step 5:** Commit: `feat(router-lite-sdk): v4 poolId computation (differential-tested vs v4-sdk)`

---

### Task 4: ABIs and event topic filters

**Files:**
- Create: `src/internal/abis.ts`, `src/internal/topics.ts`
- Test: `src/internal/topics.test.ts`

**Interfaces:**
- Produces (`abis.ts`, all via viem `parseAbi`): `V2_FACTORY_ABI` (`getPair`, `event PairCreated(address indexed token0, address indexed token1, address pair, uint256)`), `V2_PAIR_ABI` (`getReserves`), `V3_FACTORY_ABI` (`getPool`, `event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)`, `event FeeAmountEnabled(uint24 indexed fee, int24 indexed tickSpacing)`), `QUOTER_V2_ABI` (`function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)`), `V4_POOL_MANAGER_ABI` (`event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)`), `V4_QUOTER_ABI` (`function quoteExactInput((address exactCurrency, (address intermediateCurrency, uint24 fee, int24 tickSpacing, address hooks, bytes hookData)[] path, uint128 exactAmount) params) returns (uint256 amountOut, uint256 gasEstimate)`), `UR_ABI` (`function execute(bytes commands, bytes[] inputs, uint256 deadline) payable`), `PERMIT2_ABI` (`function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)`), `ERC20_ABI` (`balanceOf`, `allowance`).
- Produces (`topics.ts`): `adjacencyQueries(protocol: Protocol, contract: Address, token: Address): LogQuery[]` (two queries: token in each indexed slot; **v4 offsets by one for the id topic**), `exactPairQuery(protocol, contract, a: Address, b: Address): LogQuery` (sorted).

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, test } from 'bun:test'
import { pad } from 'viem'
import { adjacencyQueries, exactPairQuery } from './topics'
const F = '0x1F98431c8aD98523631AE4a59f267346ea31F984' as const
const PM = '0x000000000004444c5dc75cB358380D2e3dE08A90' as const
const T = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const
const padded = pad(T).toLowerCase()

test('v3 adjacency: token in topic1 and topic2', () => {
  const [asT0, asT1] = adjacencyQueries('v3', F, T)
  expect(asT0.topics[1]!.toLowerCase()).toBe(padded); expect(asT0.topics[2]).toBeNull()
  expect(asT1.topics[1]).toBeNull(); expect(asT1.topics[2]!.toLowerCase()).toBe(padded)
})
test('v4 adjacency shifts one slot for the poolId topic', () => {
  const [asC0] = adjacencyQueries('v4', PM, T)
  expect(asC0.topics[1]).toBeNull() // id
  expect(asC0.topics[2]!.toLowerCase()).toBe(padded)
})
test('exact pair sorts tokens', () => {
  const q = exactPairQuery('v3', F, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', T)
  expect(q.topics[1]!.toLowerCase()).toBe(padded) // USDC < WETH
})
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement `topics.ts` using viem `encodeEventTopics` with the ABIs (build the filter by passing named args; splice `null` wildcards). Event topic0 values come from the ABI, never hardcoded hex. **Step 4:** Run — PASS. **Step 5:** Commit: `feat(router-lite-sdk): ABIs and per-protocol creation-event topic filters`

---

### Task 5: Log scanner with bisection

**Files:**
- Create: `src/internal/logScan.ts`
- Test: `src/internal/logScan.test.ts`

**Interfaces:**
- Consumes: `LogQuery`, `BlockRange`.
- Produces: `scanLogs(client: Pick<PublicClient, 'getLogs'>, query: LogQuery, range: BlockRange, opts: { signal?: AbortSignal }): Promise<{ logs: Log[]; covered: BlockRange[]; complete: boolean }>` — recent-first (scans `toBlock` backward in chunks), halves the chunk on any provider error, gives up a sub-range after 3 consecutive failures at minimum chunk (recording it as uncovered), stops between chunks when `signal.aborted`.

- [ ] **Step 1: Failing test** — stub client that rejects any range wider than 1000 blocks with `new Error('query returned more than 10000 results')`, records calls, returns one fake log in range `[500n, 600n]`:

```ts
test('bisects on provider caps and reports coverage', async () => {
  const calls: Array<[bigint, bigint]> = []
  const client = { getLogs: async ({ fromBlock, toBlock }: any) => {
    calls.push([fromBlock, toBlock])
    if (toBlock - fromBlock > 1000n) throw new Error('query returned more than 10000 results')
    return fromBlock <= 550n && toBlock >= 550n ? [{ blockNumber: 550n } as any] : []
  }}
  const res = await scanLogs(client as any, { address: '0x1', topics: [] } as any, { fromBlock: 0n, toBlock: 5000n }, {})
  expect(res.logs).toHaveLength(1)
  expect(res.complete).toBe(true)
  expect(res.covered.reduce((s, r) => s + (r.toBlock - r.fromBlock + 1n), 0n)).toBe(5001n)
  expect(calls[0][1]).toBe(5000n) // recent-first
})
test('abort stops between chunks, complete=false', async () => {
  const ac = new AbortController()
  const client = { getLogs: async () => { ac.abort(); return [] } }
  const res = await scanLogs(client as any, { address: '0x1', topics: [] } as any, { fromBlock: 0n, toBlock: 50000n }, { signal: ac.signal })
  expect(res.complete).toBe(false)
})
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement: walk backward in `INITIAL_CHUNK = 10_000n` windows; on error halve (`minimum 128n`); merge contiguous covered ranges. **Step 4:** Run — PASS. **Step 5:** Commit: `feat(router-lite-sdk): recent-first log scanner with range bisection and coverage reporting`

---

### Task 6: Chain manifest

**Files:**
- Create: `src/manifest.ts`
- Test: `src/manifest.test.ts`

**Interfaces:**
- Produces: `ChainManifest`, `UniversalRouterDeployment` (spec-verbatim); `MAINNET_MANIFEST: ChainManifest`; `manifestFor(chainId: number, overrides?: Partial<ChainManifest>): ChainManifest` (whole-bundle replacement: an override key `v2`/`v3`/`v4`/`execution` replaces that entire bundle; unknown chainId with no complete overrides → `RouterConfigError`); `validateManifest(client: Pick<PublicClient, 'getChainId'>, m: ChainManifest): Promise<void>` (chainId cross-check → `RouterConfigError`).
- Mainnet values (verify against `sdks/sdk-core/src/addresses.ts` + Uniswap deployment docs during implementation; fork test in Task 19 asserts `eth_getCode` non-empty for every address): v2 factory `0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f` (block `10000835n`), v3 factory `0x1F98431c8aD98523631AE4a59f267346ea31F984` (block `12369621n`), **v3QuoterV2 `0x61fFE014bA17989E743c5F6cB21bF9697530B21e`** (NOT sdk-core's `quoterAddress`), v4 poolManager `0x000000000004444c5dc75cB358380D2e3dE08A90`, v4 quoter from sdk-core `CHAIN_TO_ADDRESSES_MAP[1].v4QuoterAddress`, v4 deploy block `21688329n`, execution: UR `0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af`, `commandSet: 'ur-2.0'`, permit2 `0x000000000022D473030F116dDEE9F6B43aC78BA3`, wrappedNative `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`, coreIntermediates `[WETH, USDC, USDT, WBTC, DAI]`.

- [ ] **Step 1: Failing test**

```ts
test('manifestFor returns mainnet defaults and replaces whole bundles', () => {
  const m = manifestFor(1)
  expect(m.v3?.v3QuoterV2).toBe('0x61fFE014bA17989E743c5F6cB21bF9697530B21e')
  const o = manifestFor(1, { v2: undefined })
  expect(o.v2).toBeUndefined()          // bundle removed wholesale
  expect(o.v3).toEqual(m.v3)            // others untouched
})
test('unknown chain without full overrides throws RouterConfigError', () => {
  expect(() => manifestFor(999999)).toThrow(RouterConfigError)
})
test('validateManifest rejects chainId mismatch', async () => {
  const client = { getChainId: async () => 8453 }
  await expect(validateManifest(client as any, manifestFor(1))).rejects.toThrow(RouterConfigError)
})
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement; cross-check every address against sdk-core / deployment docs while writing `MAINNET_MANIFEST`. **Step 4:** Run — PASS. **Step 5:** Commit: `feat(router-lite-sdk): chain manifest with atomic bundles and mainnet defaults`

---

### Task 7: PoolIndex with scan coverage

**Files:**
- Create: `src/index/poolIndex.ts`
- Test: `src/index/poolIndex.test.ts`

**Interfaces:**
- Consumes: `PoolRecord`, `PoolRef`, `BlockRange`, currency utils.
- Produces: `class PoolIndex { constructor(wrappedNative: Address); upsert(rec: PoolRecord): void; pair(a: CurrencyRef, b: CurrencyRef): PoolRecord[]; neighbors(endpoint: CurrencyRef): Map<string, PoolRecord[]>; addCoverage(p: Protocol, endpoint: Address, r: BlockRange): void; uncovered(p: Protocol, endpoint: Address, deployBlock: bigint, head: bigint): BlockRange[]; markSuccess(ref: PoolRef, block: bigint): void; markNegative(ref: PoolRef, block: bigint): void; isNegative(ref: PoolRef, block: bigint): boolean }`. Keys: pools by `poolKeyString(ref)` (protocol + address-or-poolId, lowercased) [superseded: `poolKeyString` was deleted when `PoolRef` gained a derived `id` field carrying that exact string — the index now keys by `ref.id`]; pairs by sorted graph-node pair; neighbors keyed by graph node (native family collapsed via `toGraphNode`). `upsert` merges metadata (keeps earliest `createdAtBlock`, latest `lastQuoteSuccessBlock`); coverage ranges merge when adjacent/overlapping; `uncovered` subtracts covered from `[deployBlock, head]` and re-opens the last `REORG_OVERLAP_BLOCKS`.

- [ ] **Step 1: Failing test**

```ts
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address
const rec = (addr: string, created?: bigint): PoolRecord => ({
  pool: { protocol: 'v2', address: addr as Address, token0: A, token1: B }, createdAtBlock: created, source: 'event',
})
test('upsert dedupes and merges metadata', () => {
  const idx = new PoolIndex(WETH)
  idx.upsert(rec('0xP1', 5n)); idx.upsert(rec('0xP1', undefined))
  expect(idx.pair(A, B)).toHaveLength(1)
  expect(idx.pair(A, B)[0].createdAtBlock).toBe(5n)
})
test('native family collapses in neighbor keys', () => {
  const idx = new PoolIndex(WETH)
  idx.upsert({ pool: { protocol: 'v2', address: '0xP2' as Address, token0: A, token1: WETH }, source: 'event' })
  expect(idx.neighbors('native').get(A.toLowerCase())).toHaveLength(1)
})
test('coverage merges and uncovered subtracts with reorg overlap', () => {
  const idx = new PoolIndex(WETH)
  idx.addCoverage('v4', A, { fromBlock: 100n, toBlock: 200n })
  idx.addCoverage('v4', A, { fromBlock: 201n, toBlock: 300n })
  const un = idx.uncovered('v4', A, 0n, 400n)
  expect(un).toEqual([{ fromBlock: 0n, toBlock: 99n }, { fromBlock: 269n, toBlock: 400n }]) // 300-32+1 re-opened
})
test('negative cache is block-scoped', () => {
  const idx = new PoolIndex(WETH); const ref = rec('0xP3').pool
  idx.markNegative(ref, 10n)
  expect(idx.isNegative(ref, 10n)).toBe(true)
  expect(idx.isNegative(ref, 11n)).toBe(false)
})
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5: Property tests for the coverage interval algebra** (add `fast-check` as a devDependency). Off-by-one block boundaries are exactly what example tests miss:

```ts
import fc from 'fast-check'
test('coverage algebra: covered ∪ uncovered = [deploy, head], disjoint, overlap re-opened', () => {
  fc.assert(fc.property(
    fc.array(fc.tuple(fc.bigInt(0n, 1000n), fc.bigInt(0n, 1000n)), { maxLength: 20 }),
    (pairs) => {
      const idx = new PoolIndex(WETH)
      for (const [a, b] of pairs) if (a <= b) idx.addCoverage('v4', A, { fromBlock: a, toBlock: b })
      const un = idx.uncovered('v4', A, 0n, 1000n)
      // disjoint + sorted
      for (let i = 1; i < un.length; i++) if (un[i].fromBlock <= un[i - 1].toBlock) return false
      // every block ≥ head - REORG_OVERLAP_BLOCKS must be uncovered (overlap re-scan)
      if (pairs.length > 0 && !un.some(r => r.toBlock === 1000n)) return false
      return true
    },
  ))
})
```

Run — PASS. **Step 6:** Commit: `feat(router-lite-sdk): in-memory pool index with scan-coverage cache (property-tested interval algebra)`

---

### Task 8: ProtocolModule interface + v2 module

**Files:**
- Create: `src/protocols/types.ts`, `src/protocols/v2.ts`
- Test: `src/protocols/v2.test.ts`

**Interfaces:**
- Produces (`protocols/types.ts`):

```ts
export interface ProtocolModule {
  readonly id: Protocol
  enabled(m: ChainManifest): boolean
  speculativeDirect(a: CurrencyRef, b: CurrencyRef, amountIn: bigint, m: ChainManifest): QuoteProbe[]
  adjacency(endpoint: Address, m: ChainManifest): LogQuery[]
  exactPair?(a: CurrencyRef, b: CurrencyRef, m: ChainManifest): LogQuery
  parsePoolLog(log: Log, m: ChainManifest): PoolRecord | null
  validateHint(hint: PoolHint, call: (c: EthCall) => Promise<Hex>, m: ChainManifest): Promise<PoolRecord | null>
  encodeQuote(legs: RouteLeg[], amountIn: bigint, m: ChainManifest): QuoteCall
  compileOperation(legs: RouteLeg[], custody: Custody): ExecutionOperation
}
export type QuoteProbe = { candidate: RouteCandidate; quote: QuoteCall }
```

- Produces (`v2.ts`): `v2Module: ProtocolModule`; `computeV2PairAddress(factory: Address, a: Address, b: Address): Address` (CREATE2, init code hash `0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f`); `getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint` (`amountIn*997n*reserveOut / (reserveIn*1000n + amountIn*997n)`). v2 quote = `getReserves` at the computed address, decoded with sorted-order awareness; **v2 segments are always single-leg** (v2→v2 two-hops chain as two segments — reserves compose leg-by-leg). Native legs use the wrapped address on-chain.

- [ ] **Step 1: Failing tests**

```ts
test('pair address matches v2-sdk (differential)', () => {
  const sdk = Pair.getAddress(new Token(1, USDC, 6), new Token(1, WETH, 18))
  expect(computeV2PairAddress(V2_FACTORY, USDC, WETH).toLowerCase()).toBe(sdk.toLowerCase())
})
test('getAmountOut applies the 0.3% fee', () => {
  expect(getAmountOut(1000n, 1_000_000n, 1_000_000n)).toBe(996n)
})
test('speculativeDirect probe decodes reserves into a quote', () => {
  const [probe] = v2Module.speculativeDirect(USDC, WETH, 10n ** 6n, MAINNET_MANIFEST)
  expect(probe.candidate.legs[0].pool.protocol).toBe('v2')
  const reservesReturn = encodeAbiParameters(
    [{ type: 'uint112' }, { type: 'uint112' }, { type: 'uint32' }],
    [2_000_000n * 10n ** 6n, 1_000n * 10n ** 18n, 0],  // reserve0=USDC (token0), reserve1=WETH
  )
  expect(probe.quote.decode(reservesReturn)).toBeGreaterThan(0n)
})
test('compileOperation maps custody', () => {
  const op = v2Module.compileOperation(legs, { payer: 'router', recipient: 'final' })
  expect(op).toMatchObject({ kind: 'v2-swap', payer: 'router', recipient: 'final' })
})
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement (`encodeQuote` = single-leg guard throwing `UnsupportedRouteError` on multi-leg; decode closure captures amountIn + zeroForOne). **Step 4:** Run — PASS. **Step 5:** Commit: `feat(router-lite-sdk): ProtocolModule interface and v2 module (speculative reserves quoting)`

---

### Task 9: v3 module

**Files:**
- Create: `src/protocols/v3.ts`
- Test: `src/protocols/v3.test.ts`

**Interfaces:**
- Consumes: `ProtocolModule`, `QUOTER_V2_ABI`, topic builders.
- Produces: `v3Module: ProtocolModule`; `encodeV3Path(legs: RouteLeg[]): Hex` (packed `token(20) | fee(3) | token(20)…`, wrapped for native); `STANDARD_V3_FEES = [100, 500, 3000, 10000]`; `mergeEnabledFees(standard: number[], feeEvents: Log[]): number[]`. `speculativeDirect` = one QuoterV2 `quoteExactInput` probe per fee (candidate carries the fee; the quote **is** the existence probe — revert ⇒ no pool). `encodeQuote` handles multi-leg same-protocol segments via the packed path. `decode` = first return word. `validateHint` = `factory.getPool(t0,t1,fee)` equals hinted address (or fills it in).

- [ ] **Step 1: Failing tests**

```ts
test('path encoding matches v3-sdk (differential)', () => {
  const route = new V3Route([usdcWethPool500], usdcToken, wethToken)  // built with dummy slot0 state
  expect(encodeV3Path(toLegs(route)).toLowerCase()).toBe(encodeRouteToPath(route, false).toLowerCase())
})
test('speculativeDirect emits one probe per standard fee', () => {
  const probes = v3Module.speculativeDirect(USDC, WETH, 10n ** 6n, MAINNET_MANIFEST)
  expect(probes.map(p => (p.candidate.legs[0].pool as Extract<PoolRef, { protocol: 'v3' }>).fee)).toEqual([100, 500, 3000, 10000])
})
test('decode extracts amountOut from QuoterV2 return', () => {
  const ret = encodeAbiParameters(quoterV2Returns, [123n, [], [], 0n])
  expect(v3Module.encodeQuote(legs, 1n, MAINNET_MANIFEST).decode(ret)).toBe(123n)
})
test('mergeEnabledFees adds nonstandard fees once', () => {
  expect(mergeEnabledFees([100, 500], [feeEnabledLog(250)])).toEqual([100, 250, 500])
})
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement with viem `encodePacked` / `decodeAbiParameters`.
- [ ] **Step 4: Recorded-fixture decode test.** Self-encoded stubs are circular (same ABI encodes and decodes). Add `src/protocols/__fixtures__/quoterV2.mainnet.json` — a real `QuoterV2.quoteExactInput` returndata blob captured once from mainnet via `cast call 0x61fFE014bA17989E743c5F6cB21bF9697530B21e "quoteExactInput(bytes,uint256)" <usdc-weth-500-path> 1000000 --rpc-url $MAINNET_RPC_URL` at a noted block, with the expected `amountOut` recorded alongside. Test: `decode(fixture.returnData) === BigInt(fixture.amountOut)`.
- [ ] **Step 5:** Run — PASS. **Step 6:** Commit: `feat(router-lite-sdk): v3 module (QuoterV2 speculative quoting, enabled-fee discovery, fixture-verified decode)`

---

### Task 10: v4 module

**Files:**
- Create: `src/protocols/v4.ts`
- Test: `src/protocols/v4.test.ts`

**Interfaces:**
- Consumes: `computeV4PoolId`, `V4_POOL_MANAGER_ABI`, `V4_QUOTER_ABI`.
- Produces: `v4Module: ProtocolModule`; `STANDARD_V4_CONFIGS = [{fee:100,tickSpacing:1},{fee:500,tickSpacing:10},{fee:3000,tickSpacing:60},{fee:10000,tickSpacing:200}]` (hooks = zero address); `toPathKeys(legs: RouteLeg[]): PathKeyStruct[]`. v4 uses `address(0)` for native on-chain. `parsePoolLog` decodes `Initialize`, recomputes poolId, **returns null on mismatch** (integrity). `validateHint` is local-only (sort currencies, recompute id) — no RPC. `speculativeDirect` = V4Quoter probes for the standard configs. `compileOperation` → `{ kind: 'v4-swap', legs, settleFrom: custody.payer, takeTo: custody.recipient }`.

- [ ] **Step 1: Failing tests**

```ts
test('parsePoolLog decodes Initialize and verifies poolId', () => {
  const rec = v4Module.parsePoolLog(initializeLog(ethUsdcKey), MAINNET_MANIFEST)!
  expect((rec.pool as any).poolId).toBe(computeV4PoolId(ethUsdcKey))
  expect(v4Module.parsePoolLog(initializeLogWithWrongId(ethUsdcKey), MAINNET_MANIFEST)).toBeNull()
})
test('validateHint sorts currencies and needs no RPC', async () => {
  const calls: unknown[] = []
  const rec = await v4Module.validateHint(
    { protocol: 'v4', poolKey: unsortedKey }, async c => { calls.push(c); return '0x' }, MAINNET_MANIFEST)
  expect(calls).toHaveLength(0)
  expect((rec!.pool as any).poolKey.currency0 < (rec!.pool as any).poolKey.currency1).toBe(true)
})
test('speculativeDirect probes standard no-hook configs', () => {
  const probes = v4Module.speculativeDirect('native', USDC, 10n ** 18n, MAINNET_MANIFEST)
  expect(probes).toHaveLength(4)
  for (const p of probes) expect((p.candidate.legs[0].pool as any).poolKey.hooks).toBe(zeroAddress)
})
test('encodeQuote builds PathKey[] with hookData', () => {
  const qc = v4Module.encodeQuote(legsWithHookData, 1n, MAINNET_MANIFEST)
  const decoded = decodeFunctionData({ abi: V4_QUOTER_ABI, data: qc.call.data })
  expect((decoded.args[0] as any).path[0].hookData).toBe('0xbeef')
})
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement.
- [ ] **Step 4:** Recorded-fixture decode test, same pattern as Task 9: `__fixtures__/v4Quoter.mainnet.json` captured via `cast call` against the mainnet V4Quoter (ETH/USDC 500/10 single-hop), asserting `decode` extracts the recorded `amountOut`. Also capture one real mainnet `Initialize` log (as JSON) and assert `parsePoolLog` reconstructs the record with a matching recomputed poolId.
- [ ] **Step 5:** Run — PASS. **Step 6:** Commit: `feat(router-lite-sdk): v4 module (Initialize parsing with poolId integrity, standard-config speculative quotes)`

---

### Task 11: Candidate generation

**Files:**
- Create: `src/search/candidates.ts`
- Test: `src/search/candidates.test.ts`

**Interfaces:**
- Consumes: `PoolIndex`, currency utils, constants.
- Produces: `generateRoutes(args: { tokenIn: CurrencyRef; tokenOut: CurrencyRef; index: PoolIndex; hookData: Map<string, Hex>; wrappedNative: Address; successfulIntermediates?: string[] }): { candidates: RouteCandidate[]; pruned: { intermediates: number; pools: number } }`; `routeId(c: RouteCandidate): string` (deterministic: joined pool keys). Rules: direct pools first; two-hop = neighbors(tokenIn) ∩ neighbors(tokenOut) as graph nodes; intermediate priority per spec (hints → successful → core — passed in by the engine as `successfulIntermediates` — → newest → stable order); ≤ `MAX_INTERMEDIATES`; per-pair pools capped at `MAX_POOLS_PER_PAIR` with **one slot always reserved for the newest `createdAtBlock`**; total capped at `MAX_QUOTE_CANDIDATES`; legs get concrete currencies (native form chosen per pool: v4 native pools take `'native'`, v2/v3 take wrapped); `hookData` map (key = poolId) stamped onto v4 legs; intermediates equal to either endpoint after normalization are excluded.

- [ ] **Step 1: Failing tests**

```ts
test('direct + shared-neighbor two-hops, mixed protocols', () => {
  // index: USDC/WETH v3, NEW/WETH v4, NEW/USDC v2(direct)
  const { candidates } = generateRoutes({ tokenIn: NEW, tokenOut: USDC, index, hookData: new Map(), wrappedNative: WETH })
  const ids = candidates.map(routeId)
  expect(candidates.some(c => c.legs.length === 1 && c.legs[0].pool.protocol === 'v2')).toBe(true)
  expect(candidates.some(c => c.legs.length === 2 && c.legs[0].pool.protocol === 'v4' && c.legs[1].pool.protocol === 'v3')).toBe(true)
  expect(new Set(ids).size).toBe(ids.length) // deterministic + unique
})
test('newest pool always survives the per-pair cap', () => {
  // 5 pools for one pair; newest created last
  const { candidates } = generateRoutes(fivePoolArgs)
  const kept = candidates.map(c => c.legs[0].pool)
  expect(kept).toHaveLength(3)
  expect(kept.some(p => (p as any).address === NEWEST)).toBe(true)
})
test('intermediate equal to an endpoint is excluded; native family counts as one node', () => {
  const { candidates } = generateRoutes(nativeEndpointArgs) // tokenIn 'native', WETH intermediate must not appear
  for (const c of candidates) if (c.legs.length === 2)
    expect(sameFamily(c.legs[0].currencyOut, 'native', WETH)).toBe(false)
})
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5: Property tests** (fast-check, arbitrary pool graphs of ≤30 random pools over ≤8 tokens): for all generated inputs — (a) no candidate exceeds 2 legs; (b) no candidate reuses a pool; (c) no intermediate equals an endpoint after family normalization; (d) candidate count ≤ `MAX_QUOTE_CANDIDATES`; (e) `generateRoutes` called twice with the same input yields identical `routeId` sequences (determinism); (f) if any direct pool exists in the index, at least one direct candidate survives. Run — PASS.
- [ ] **Step 6:** Commit: `feat(router-lite-sdk): bounded deterministic candidate generation (property-tested)`

---

### Task 12: Quoting engine

**Files:**
- Create: `src/quote/quote.ts`, `src/internal/rpc.ts`
- Test: `src/quote/quote.test.ts`

**Interfaces:**
- Consumes: `ProtocolModule.encodeQuote`, `QuoteProbe`.
- Produces (`rpc.ts`): `ethCall(client: Pick<PublicClient, 'request'>, call: EthCall, blockNumber: bigint): Promise<Hex>` (raw `eth_call`, hex block tag); `mapConcurrent<T, R>(items: T[], limit: number, fn): Promise<Array<R | Error>>` (never rejects; `MAX_CONCURRENT_CALLS`).
- Produces (`quote.ts`): `quoteCandidates(args: { client; modules: Record<Protocol, ProtocolModule>; manifest; candidates: RouteCandidate[]; amountIn: bigint; blockNumber: bigint; signal?: AbortSignal }): Promise<{ quoted: QuotedRoute[]; stats: { attempted: number; succeeded: number; failed: number } }>` — splits each candidate into contiguous same-protocol segments; same-protocol candidates quote whole-path in round 1; mixed candidates quote segment 1 in round 1, segment 2 in round 2 with realized outputs; failed segment ⇒ candidate dropped and counted. `rankRoutes(quoted: QuotedRoute[]): QuotedRoute[]` — amountOut desc → fewer protocol transitions → fewer hops → `routeId`; then the simplicity margin: while the leader is hooked-or-mixed and a simpler candidate is within `SIMPLICITY_MARGIN_BPS`, the simpler one wins.
- Produces: `probeQuotes(args: { client; probes: QuoteProbe[]; blockNumber; signal? })` — same machinery for wave-0 speculative probes (revert ⇒ silently dropped, counted as failed-probe not error).

- [ ] **Step 1: Failing tests**

```ts
test('mixed two-hop chains realized output into round 2', async () => {
  const client = stubClient({ ...v4QuoteReturns(500n), ...v3QuoteReturnsExpectingAmountIn(500n, 900n) })
  const { quoted } = await quoteCandidates({ client, modules, manifest, candidates: [mixedV4toV3], amountIn: 100n, blockNumber: 1n })
  expect(quoted[0].quote.amountOut).toBe(900n)
  expect(quoted[0].quote.intermediateAmounts).toEqual([500n])
})
test('reverting candidate is dropped and counted, others survive', async () => {
  const { quoted, stats } = await quoteCandidates({ client: revertFirstStub, modules, manifest, candidates: [bad, good], amountIn: 1n, blockNumber: 1n })
  expect(quoted).toHaveLength(1)
  expect(stats).toMatchObject({ attempted: 2, failed: 1 })
})
test('simplicity margin: hooked route must beat simple by >5bps', () => {
  const ranked = rankRoutes([hookedRoute(10_005n), simpleRoute(10_000n)])
  expect(ranked[0]).toBe(simpleRoute(10_000n)) // within 5 bps → simple wins
  expect(rankRoutes([hookedRoute(10_010n), simpleRoute(10_000n)])[0].quote.amountOut).toBe(10_010n)
})
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS. **Step 5:** Commit: `feat(router-lite-sdk): block-pinned segment quoting and ranking with simplicity margin`

---

### Task 13: ExecutionPlan compiler

**Files:**
- Create: `src/plan/compile.ts`
- Test: `src/plan/compile.test.ts`

**Interfaces:**
- Consumes: `QuotedRoute`, `ProtocolModule.compileOperation`, `Custody`, currency utils.
- Produces: `compileExecutionPlan(args: { quoted: QuotedRoute; tokenIn: CurrencyRef; tokenOut: CurrencyRef; trader: Address; recipient: Address; slippageBps: number; permit?: Permit2PermitSingle; wrappedNative: Address; modules: Record<Protocol, ProtocolModule> }): ExecutionPlan`; `assertPlanInvariants(plan: ExecutionPlan): void` (throws `UnsupportedRouteError`). Compilation rules:
  1. `minAmountOut = quote.amountOut * (10_000n - slippageBps) / 10_000n`.
  2. Group legs into contiguous same-protocol operations.
  3. `acquireInput`: native tokenIn + first op v4 → `native-value`; native tokenIn + first op v2/v3 → `native-value` + leading `wrap-native` op, first op payer `router`; ERC-20 → `permit2-pull` (with optional permit), first op payer `trader-via-permit2` (v4: `settleFrom`).
  4. Between groups: if previous group's output family ≠ next group's required form (v4-native vs v2/v3-wrapped), insert `wrap-native`/`unwrap-native` with `amount: 'router-balance'`. Intermediate groups: payer `router`, recipient `router`.
  5. Output: last group recipient `final` when currency form already matches `tokenOut`; native tokenOut from a v2/v3 WETH leg → recipient `router` + trailing `unwrap-native`; `deliverOutput = { recipient, currency: tokenOut, minAmountOut }`.
- Invariants (each independently tested): single consumer per intermediate output; no duplicate pool in `legs`; exactly one `deliverOutput`; recipients not equal to UR sentinels (`0x…01`, `0x…02`); wrap/unwrap only adjacent to a group needing the conversion; permit only on the first operation; rejects `tokenIn === tokenOut` (family-normalized).

- [ ] **Step 1: Failing tests**

```ts
test('v3 single-hop erc20→erc20', () => {
  const plan = compileExecutionPlan(base({ quoted: v3Single, tokenIn: USDC, tokenOut: WETH }))
  expect(plan.acquireInput.kind).toBe('permit2-pull')
  expect(plan.operations).toHaveLength(1)
  expect(plan.operations[0]).toMatchObject({ kind: 'v3-swap', payer: 'trader-via-permit2', recipient: 'final' })
  expect(plan.deliverOutput.minAmountOut).toBe(990n) // amountOut 1000, 100bps
})
test('v4-native → v3-WETH mixed inserts an INTERMEDIATE wrap', () => {
  const plan = compileExecutionPlan(base({ quoted: v4NativeThenV3, tokenIn: TOKA, tokenOut: USDC }))
  expect(plan.operations.map(o => o.kind)).toEqual(['v4-swap', 'wrap-native', 'v3-swap'])
  expect((plan.operations[1] as any).amount).toBe('router-balance')
})
test('native input to v2 wraps first, payer router', () => {
  const plan = compileExecutionPlan(base({ quoted: v2Single, tokenIn: 'native', tokenOut: USDC }))
  expect(plan.acquireInput.kind).toBe('native-value')
  expect(plan.operations.map(o => o.kind)).toEqual(['wrap-native', 'v2-swap'])
  expect((plan.operations[1] as any).payer).toBe('router')
})
test('invariants: duplicate pool rejected; sentinel recipient rejected', () => {
  expect(() => compileExecutionPlan(base({ quoted: duplicatePoolRoute }))).toThrow(UnsupportedRouteError)
  expect(() => compileExecutionPlan(base({ recipient: '0x0000000000000000000000000000000000000002' }))).toThrow(UnsupportedRouteError)
})
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement compiler + `assertPlanInvariants` (called at the end of compile). **Step 4:** Run — PASS. **Step 5:** Commit: `feat(router-lite-sdk): execution-plan compiler with custody invariants`

---

### Task 14: Universal Router `ur-2.0` encoder + differential oracle

**Files:**
- Create: `src/encode/ur20.ts`, `src/encode/goldens.json`
- Test: `src/encode/ur20.test.ts`, `src/encode/differential.test.ts`

**Interfaces:**
- Consumes: `ExecutionPlan`, `UniversalRouterDeployment`, `UR_ABI`.
- Produces: `encodeExecutionPlan(plan: ExecutionPlan, deployment: UniversalRouterDeployment, deadline: bigint): EncodedTx` — throws `UnsupportedRouteError` for any `commandSet !== 'ur-2.0'`.
- Command bytes (verify against the pinned `universal-router-sdk` `src/utils/routerCommands.ts` — the differential suite enforces): `V3_SWAP_EXACT_IN=0x00`, `V2_SWAP_EXACT_IN=0x08`, `PERMIT2_PERMIT=0x0a`, `WRAP_ETH=0x0b`, `UNWRAP_WETH=0x0c`, `V4_SWAP=0x10`. Sentinels: `MSG_SENDER=0x…01`, `ADDRESS_THIS=0x…02`, `CONTRACT_BALANCE=2n**255n`. v4 action bytes from the pinned `v4-sdk` `Actions` enum (`SWAP_EXACT_IN=0x07`, `SETTLE=0x0b`, `SETTLE_ALL=0x0c`, `TAKE=0x0e`, `TAKE_ALL=0x0f`).
- Input encodings: `V3_SWAP_EXACT_IN(address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser)`; `V2_SWAP_EXACT_IN(address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, bool payerIsUser)`; `WRAP_ETH(address recipient, uint256 amount)`; `UNWRAP_WETH(address recipient, uint256 amountMin)`; `PERMIT2_PERMIT(PermitSingle, bytes signature)`; `V4_SWAP(bytes actions, bytes[] params)`. Recipient mapping: `'final'` → plan recipient, `'router'` → `ADDRESS_THIS`; `amount 'router-balance'` → `CONTRACT_BALANCE` (wrap) / open-delta conventions (v4). Intermediate amountOutMin is always `0` (single final slippage check). For the exact v4 settle/take byte layout in mixed sections, mirror the pinned SDK's `addMixedSwap` — the differential tests are the specification.
- Differential oracle (in `differential.test.ts`): build each supported shape as a `router-sdk` `Trade` (via `RouterTradeAdapter.fromClassicQuote` with the same pool state) → `SwapRouter.swapCallParameters` → compare calldata **byte-for-byte** with ours. Shapes: {v2, v3, v4, v4→v3 mixed, v2→v4 mixed} × {erc20-in, native-in} × {erc20-out, native-out} × {no-permit, permit} (skip impossible combos, e.g. permit with native-in). On first green run, dump each `(shape, calldata)` into `goldens.json`; `ur20.test.ts` then asserts against goldens so the oracle can't drift silently.

- [ ] **Step 1:** Write `ur20.test.ts` golden-shape scaffolding + 3 hand-verifiable unit tests (command ordering `PERMIT2_PERMIT` first; `WRAP_ETH` recipient is `ADDRESS_THIS`; deadline lands in `execute` args). Run — FAIL.
- [ ] **Step 2:** Implement `encodeExecutionPlan`. Run unit tests — PASS.
- [ ] **Step 3:** Write `differential.test.ts` covering every supported shape; iterate on the encoder until **all** shapes are byte-identical. This step is the bulk of the task; every mismatch is a custody-semantics bug, not a formatting bug.
- [ ] **Step 4:** Generate `goldens.json` from the green differential run; add the golden-assert test. Run full suite — PASS.
- [ ] **Step 5:** Commit: `feat(router-lite-sdk): ur-2.0 execution-plan encoder, differential-tested byte-identical with universal-router-sdk`

---

### Task 15: Readiness checks

**Files:**
- Create: `src/verify/readiness.ts`
- Test: `src/verify/readiness.test.ts`

**Interfaces:**
- Consumes: `ERC20_ABI`, `PERMIT2_ABI`, `ethCall`.
- Produces: `checkReadiness(args: { client; trader: Address; currencyIn: CurrencyRef; amountIn: bigint; permit2: Address; router: Address; permit?: Permit2PermitSingle; blockNumber: bigint; blockTimestamp: bigint }): Promise<ExecutionRequirement[]>`. Native input: balance check only. ERC-20: `balanceOf(trader)`, `allowance(trader, permit2)`, `permit2.allowance(trader, token, router)` → emit `insufficient-balance` / `erc20-approval` / (`permit2-allowance` unless a supplied permit is valid: token+spender match, `details.amount ≥ amountIn`, `sigDeadline > blockTimestamp`, `expiration > blockTimestamp`). Multiple requirements returned together.

- [ ] **Step 1: Failing tests** — stub client keyed by calldata: (a) fully approved → `[]`; (b) no balance + no erc20 approval → both requirements; (c) erc20 approved, permit2 expired, no permit → `permit2-allowance`; (d) same but valid supplied permit → `[]`; (e) native input with balance → `[]`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement (single `mapConcurrent` batch). **Step 4:** Run — PASS. **Step 5:** Commit: `feat(router-lite-sdk): readiness requirements via reads`

---

### Task 16: Preflight

**Files:**
- Create: `src/verify/preflight.ts`
- Test: `src/verify/preflight.test.ts`

**Interfaces:**
- Produces: `preflightTx(client: Pick<PublicClient, 'request'>, tx: EncodedTx, trader: Address, blockNumber: bigint): Promise<{ ok: true } | { ok: false; revertData?: Hex }>` — raw `eth_call` `{ from: trader, to, data, value }` at the pinned block; revert data preserved verbatim, never interpreted.

- [ ] **Step 1: Failing tests**: success stub → `ok: true`; revert stub with data → `{ ok: false, revertData: '0x08c379a0…' }`; revert without data → `{ ok: false }`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS. **Step 5:** Commit: `feat(router-lite-sdk): real-trader preflight`

---

### Task 17: Wave engine

**Files:**
- Create: `src/search/waves.ts`
- Test: `src/search/waves.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `searchWaves(ctx: SearchContext, req: SwapRequest | QuoteRequest, kind: 'quote' | 'swap'): AsyncGenerator<InternalResult>` where `SearchContext = { client; manifest; modules; index: PoolIndex; hookData: Map<string, Hex> }` and `InternalResult = { best?: RankedRoute; alternatives: RankedRoute[]; requirements?: ExecutionRequirement[]; tx?: EncodedTx; report: SearchReport; done: boolean }`. Also `selectFocus(req, index): CurrencyRef` (spec order: `focusToken` → hinted endpoint → fewer cached neighbors → newer hinted pool → `tokenIn`).
- Behavior: snapshot block (`eth_getBlockByNumber('latest')`) once; wave 0 fires hints (validated) + cached candidates + `speculativeDirect` probes from every enabled module + v4 `exactPair` log query + (swap) `checkReadiness`, all concurrently; each wave: candidates → `quoteCandidates` → merge with running best via `rankRoutes` → (swap kind, requirements empty) compile+encode+`preflightTx` the leader, falling through up to `PREFLIGHT_TOP_K` on genuine reverts (failed leaders marked `execution: 'failed'`) → yield when the best improved or the wave is final. Waves 2/3 run `scanLogs` over `index.uncovered(...)` ranges only, updating coverage. `signal` checked between batches; aborted → finalize with `report.aborted = true, done: true`. Report populated per spec (discovery per protocol, enumeration counts, quoting stats).

- [ ] **Step 1: Failing tests** — all against scripted stub modules/client (no real ABI work; stub `ProtocolModule`s return canned probes/quotes):

```ts
test('wave 0 hint resolves a swap without any log scan', async () => {
  const events = await drain(searchWaves(ctxWithHint, swapReq, 'swap'))
  expect(events[0].best?.execution).toBe('verified')
  expect(scanCalls).toBe(0) // stopped before adjacency waves ran
})
test('iterator yields only on improvement, final yield has done=true', async () => {
  const events = await drain(searchWaves(ctxImprovingWave2, quoteReq, 'quote'))
  expect(events.map(e => e.best?.quote.amountOut)).toEqual([100n, 250n]) // wave0 then wave2
  expect(events.at(-1)!.done).toBe(true)
})
test('abort between waves → aborted report, best-so-far kept', async () => {
  const ac = new AbortController(); queueMicrotask(() => ac.abort())
  const events = await drain(searchWaves(ctxSlow, { ...quoteReq, signal: ac.signal }, 'quote'))
  expect(events.at(-1)!.report.aborted).toBe(true)
})
test('preflight failure falls through to next candidate', async () => {
  const events = await drain(searchWaves(ctxLeaderReverts, swapReq, 'swap'))
  expect(events.at(-1)!.best?.execution).toBe('verified')
  expect(events.at(-1)!.alternatives.some(a => a.execution === 'failed')).toBe(true)
})
test('unmet requirements → needs-action shape, no preflight attempted', async () => {
  const events = await drain(searchWaves(ctxNoApproval, swapReq, 'swap'))
  expect(events.at(-1)!.requirements).not.toHaveLength(0)
  expect(preflightCalls).toBe(0)
})
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement (largest single module; keep wave bodies as small named functions `wave0`, `wave1`, `wave2`, `wave3`). **Step 4:** Run — PASS. **Step 5:** Commit: `feat(router-lite-sdk): wave engine with abort, preflight fall-through, and search reporting`

---

### Task 18: Router facade and public exports

**Files:**
- Create: `src/router.ts`, `src/experimental.ts`
- Modify: `src/index.ts`
- Test: `src/router.test.ts`

**Interfaces:**
- Produces: `createRouter(opts: { client: PublicClient; manifest: ChainManifest }): Router` with `getQuote`, `getSwap`, `quotes`, `swaps`, `ingestPool`, `ingestLogs`, `ingestReceipt` per spec. Request validation up front (`tokenIn !== tokenOut` family-normalized, `amountIn > 0n`, swap has `trader`; violations throw `RouterConfigError`). `getSwap` = iterate `searchWaves`, resolve at the first event with `best.execution === 'verified'` (→ `ready`) or non-empty `requirements` with a best (→ `needs-action`); on `done` without either → classify `no-route` (report complete) vs `inconclusive` (aborted / any protocol `failed` / caps pruned a viable-looking axis). `getQuote` analogous with `quote` status. Iterators map `InternalResult` → public results 1:1. `ingestLogs` routes each log through every module's `parsePoolLog`; `ingestReceipt` = `ingestLogs(receipt.logs)`; `ingestPool` validates the hint then upserts. `index.ts` exports: `createRouter`, `manifestFor`, `MAINNET_MANIFEST`, and all public types. `experimental.ts` exports `generateRoutes`, `compileExecutionPlan`, `encodeExecutionPlan`.

- [ ] **Step 1: Failing tests**

```ts
test('getSwap end-to-end on stubbed client: hint → ready', async () => {
  const router = createRouter({ client: stubbedHappyClient, manifest: MAINNET_MANIFEST })
  router.ingestPool(v4Hint)
  const res = await router.getSwap(swapReq)
  expect(res.status).toBe('ready')
  if (res.status === 'ready') { expect(res.tx.to).toBe(MAINNET_MANIFEST.execution.address); expect(res.search.block.number).toBeGreaterThan(0n) }
})
test('needs-action carries requirements and tx', async () => {
  const res = await createRouter({ client: noApprovalClient, manifest: MAINNET_MANIFEST }).getSwap(swapReq)
  expect(res.status).toBe('needs-action')
  if (res.status === 'needs-action') expect(res.requirements[0].kind).toBe('erc20-approval')
})
test('tokenIn === tokenOut (family) throws RouterConfigError', async () => {
  await expect(router.getSwap({ ...swapReq, tokenIn: 'native', tokenOut: WETH })).rejects.toThrow(RouterConfigError)
})
test('second call reuses coverage — no repeat scans', async () => {
  await router.getQuote(quoteReq); const scansAfterFirst = scanCallCount
  await router.getQuote(quoteReq)
  expect(scanCallCount).toBe(scansAfterFirst) // only delta blocks, stub head unchanged
})
```

- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement; replace the Task 0 placeholder in `index.ts`. **Step 4:** Run full package suite + `bun run --cwd sdks/router-lite-sdk build && bun run --cwd sdks/router-lite-sdk lint` — PASS. **Step 5:** Commit: `feat(router-lite-sdk): public router facade (promises, iterators, ingest)`

---

### Task 19A: worldBuilder fork harness

**Files:**
- Create: `sdks/router-lite-sdk/integration/package.json`, `integration/anvil.ts`, `integration/worldBuilder.ts`, `integration/worldBuilder.fork.test.ts`

**Interfaces:**
- Setup: mine the abandoned worktree's harness at `/Users/mark.toda/dev/sdks/.claude/worktrees/router-lite-sdk/sdks/router-lite-sdk/integration/` (anvil lifecycle, fork-block pinning, funding) — adapt, don't import. Gate on `ROUTER_LITE_FORK=1` + `MAINNET_RPC_URL`; skip cleanly without anvil. Pin the fork block as `FORK_BLOCK` in one place. Nested workspace `package.json` keeps heavy deps (anvil client helpers, test-hook solidity artifacts) out of the publishable package.
- Produces (`worldBuilder.ts` — the ground-truth factory every fork test builds on):

```ts
type World = ReturnType<typeof createWorld>
createWorld(anvil: AnvilClient): {
  deployToken(name: string, opts?: { feeOnTransferBps?: number }): Promise<Address>   // simple mintable ERC20; optional FOT mode
  createV2Pool(a: Address | 'native', b: Address | 'native', reserveA: bigint, reserveB: bigint): Promise<PoolRef>
  createV3Pool(a, b, fee: number, opts: { liquidity: bigint; priceApprox: number }): Promise<PoolRef>   // factory + NFPM full-range mint
  createV4Pool(a: CurrencyRef, b: CurrencyRef, opts: { fee; tickSpacing; hooks?: Address; liquidity }): Promise<{ ref: PoolRef; receipt: TransactionReceipt }>
  deployHook(behavior: 'none' | 'skim-fee-bps-30' | 'revert-if-sender-not' | 'revert-on-swap'): Promise<Address>   // pre-compiled artifacts committed under integration/artifacts/
  fundTrader(t: Address, opts: { eth?: bigint; tokens?: Array<[Address, bigint]> }): Promise<void>
  approvePermit2(t: Address, token: Address, opts?: { toRouter?: boolean }): Promise<void>   // ERC20→Permit2 and optionally Permit2→UR
  expectedV2Out(amountIn: bigint, pool: PoolRef): Promise<bigint>   // ground truth from actual on-fork reserves
}
```

  Hook artifacts: write the 4 tiny hook contracts in `integration/contracts/`, compile once with `forge build`, commit bytecode JSON to `integration/artifacts/` — tests deploy bytecode directly, no forge at test time.

- [ ] **Step 1:** Write harness + a self-test that builds one world (2 tokens, one pool per protocol, hooked v4 pool), asserts pools exist on-fork (reserves read back, `Initialize` log retrievable via `eth_getLogs` on the fork), and `expectedV2Out` matches a manual computation. Run `ROUTER_LITE_FORK=1 bun test sdks/router-lite-sdk/integration` — iterate to PASS.
- [ ] **Step 2:** Verify plain `bun test sdks/router-lite-sdk` skips cleanly without the env var.
- [ ] **Step 3:** Commit: `test(router-lite-sdk): anvil worldBuilder harness (synthetic pools, hooks, ground-truth quotes)`

---

### Task 19B: Fork e2e — known pools + synthetic worlds

**Files:**
- Create: `integration/swap.fork.test.ts`, `integration/discovery.fork.test.ts`, `integration/readiness.fork.test.ts`, `integration/mixed.fork.test.ts`

**Interfaces:** consumes the public API + worldBuilder only. Every result asserted through `assertResultCoherent`. Every `ready` ends in **actual execution**: send the returned `tx` from the trader on the fork, assert receipt success and output-balance delta ≥ `minAmountOut`.

- Tests:
  1. `swap.fork.test.ts` (known mainnet pools at `FORK_BLOCK`): USDC→WETH, ETH→USDC (native-in), USDC→ETH (native-out), each `ready` → executed → balance-delta asserted **and** delta compared to `quote.amountOut` (must match exactly on a quiet fork — quote honesty).
  2. `mixed.fork.test.ts` (synthetic worlds — the chained-quote validation): build NEW/WETH-v4 + WETH/USDC-v3 with controlled liquidity → `getSwap(NEW→USDC)`: expect a mixed 2-hop, execute, **assert output equals the composed quote exactly** — this is the definitive test of two-round segment chaining and mixed custody encoding. Repeat for v2→v4 with a native-family intermediate (exercises the intermediate wrap operation on-chain). Also: v2-only synthetic pool where `expectedV2Out` must equal `quote.amountOut` to the wei.
  3. `discovery.fork.test.ts`: (a) create a fresh v4 pool → `ingestReceipt` → `getSwap`: `ready` with **zero** `eth_getLogs` (counting transport); (b) same world, new router instance, **no hint**: cold `getSwap` must find it via the exact-pair/adjacency scans and execute; (c) token whose only pool is nonstandard-fee v4 — speculative wave 0 misses it, event scan must find it; (d) 5 pools for one pair, newest is best — assert reserved-slot selection picks it and the quote reflects it.
  4. `readiness.fork.test.ts` (real Permit2 bytecode): no ERC20→Permit2 approval → `needs-action`/`erc20-approval`; approval but no Permit2→UR → `permit2-allowance`; both → `ready`; expired Permit2 allowance (warp time) → `permit2-allowance`; funded-with-ETH-only trader for ERC-20 swap → `insufficient-balance`.

- [ ] **Step 1:** Test file 1 — iterate to PASS. **Step 2:** Files 2–4 — iterate to PASS. **Step 3:** Commit: `test(router-lite-sdk): fork e2e — executed swaps, exact quote honesty, cold discovery, readiness matrix`

---

### Task 19C: Fork e2e — adversarial worlds

**Files:**
- Create: `integration/adversarial.fork.test.ts`

**Interfaces:** consumes worldBuilder hooks + FOT tokens. The theme: **the SDK must never overstate what it verified.**

- Tests:
  1. **Quoter/execution divergence**: v4 pool with the `skim-fee-bps-30` hook — quoter and execution disagree on output. Assert: route is either not `ready`, or `ready` with the *post-skim* accurate quote (preflight-derived); never `ready` with the naive quote. Executed output must be ≥ `minAmountOut` whenever we said `ready`.
  2. **Caller-sensitive hook**: `revert-if-sender-not(quoter)` — quotes fine, reverts under the Universal Router. Assert: never `ready`; falls through to an alternative route when one exists (build a second plain pool), else `no-route` with the hooked candidate visible in `alternatives` as `execution: 'failed'`.
  3. **Fee-on-transfer**: FOT token via worldBuilder — v2 reserve math overstates. Assert never `ready` with overstated output: either preflight rejects (output < minAmountOut ⇒ revert) or the result is accurate. Executed-when-ready must still satisfy minAmountOut.
  4. **Thin pool at size**: v4 pool with tiny liquidity — small `amountIn` quotes and executes; 100× `amountIn` must surface `NotEnoughLiquidity` as a dropped candidate (counted in `quoting.failed`), not a crash, and fall through to a deeper route when present.
  5. Codehash sanity: `eth_getCode` non-empty for every `MAINNET_MANIFEST` address at `FORK_BLOCK`.

- [ ] **Step 1:** Tests 1–2 — iterate to PASS. **Step 2:** Tests 3–5 — iterate to PASS. **Step 3:** Commit: `test(router-lite-sdk): adversarial fork suite — hooks, FOT, thin liquidity`

---

### Task 20: README, changeset, repo checks

**Files:**
- Create: `sdks/router-lite-sdk/README.md`, `.changeset/router-lite-sdk-initial.md`

- [ ] **Step 1:** README: the spec's two "in one sentence" paragraphs, a 15-line quickstart (`createRouter` → `getSwap` → send `tx`; iterator example with `AbortSignal.timeout(900)`), the status table, the "what this is not" list (no splits, no exact-out, quotes are per-block best-effort), and a launcher recipe (`ingestReceipt` + hint with `hookData`).
- [ ] **Step 2:** Changeset (minor, `@uniswap/router-lite-sdk`): "Initial release: RPC-only wave-based route finding across Uniswap v2/v3/v4 with verified Universal Router calldata."
- [ ] **Step 3:** Run repo-level gates: `bun run g:lint && bun run g:build && bun run g:test`. Fix anything the monorepo checks surface (dependency-version consistency, eslint config drift).
- [ ] **Step 4:** Commit: `docs(router-lite-sdk): README and initial changeset`

---

### Task 21: Live-RPC canary suite (eth_simulateV1)

**Files:**
- Create: `sdks/router-lite-sdk/canary/package.json`, `canary/simulate.ts`, `canary/canary.test.ts`, `canary/providers.test.ts`

**Interfaces:**
- Consumes: public API only. Gated on `ROUTER_LITE_CANARY=1` + one or more `CANARY_RPC_URL_*` env vars (provider matrix: Alchemy, Infura, a public node). Never PR-blocking; runs nightly. No keys, no funds — **simulation is the execution proof**, per design decision.
- Produces (`simulate.ts`): `simulateSwapE2E(client, result: SwapResult & { status: 'ready' | 'needs-action' }, trader: Address): Promise<{ ok: boolean; outputReceived: bigint }>` — one `eth_simulateV1` request whose `blockStateCalls` chain, from a synthetic `trader` with a native **balance override only** (first-class in eth_simulateV1; no storage-slot guessing):
  1. acquire the input token *inside the simulation* when `tokenIn` isn't native (a plain UR native→tokenIn swap — real transfer, real balance);
  2. `approve(tokenIn → Permit2)`; 3. `Permit2.approve(tokenIn, UR, amount, expiry)`;
  4. the SDK's returned `tx`, **verbatim**.
  Decode the final call's logs for the output `Transfer`/withdrawal to the recipient; `ok` ⇒ all calls succeeded and `outputReceived ≥ minAmountOut`.
- Tests (`canary.test.ts`, per provider, live head):
  1. Pair matrix (per chain in the manifest set): native→USDC, USDC→native, USDC→WBTC (likely 2-hop), and one recently-created v4 pool discovered from the last ~7 days of `Initialize` logs. For each: `getSwap` with the synthetic trader → expect `needs-action` (unfunded trader; requirements listed) → `simulateSwapE2E` → `ok`. Every result through `assertResultCoherent`.
  2. Quote sanity: same pair quoted via two different providers at the same block number must agree exactly.
  3. `providers.test.ts` — provider-behavior evidence: a deliberately huge `eth_getLogs` request per provider, asserting our bisection converges and records coverage (captures each provider's real error format as a committed fixture for the unit suite); a batched-transport run asserting one HTTP request carries the wave-0 batch (count via fetch interceptor); `eth_simulateV1` support probe with graceful skip.
  4. Latency benchmarks: hinted swap, direct pair, cold long-tail token — wall-clock per wave logged as structured JSON (these measurements are what revisit the internal constants; record, don't assert).

- [ ] **Step 1:** Implement `simulate.ts` + test 1 against one provider — iterate to PASS.
- [ ] **Step 2:** Tests 2–4; commit captured provider-error fixtures back into `src/internal/__fixtures__/`.
- [ ] **Step 3:** Commit: `test(router-lite-sdk): live-RPC canary suite via eth_simulateV1 (no keys, no funds)`

---

### Task 22: CI wiring

**Files:**
- Modify: `.github/workflows/monorepo-checks.yml`
- Create: `.github/workflows/router-lite-canary.yml`

- [ ] **Step 1:** Add a PR-blocking `router-lite-fork` job to `monorepo-checks.yml`: runs only when `sdks/router-lite-sdk/**` changed (`dorny/paths-filter` or `on.pull_request.paths` consistent with existing jobs); foundry is already installed by the workflow; steps: restore `~/.foundry/cache` keyed on `FORK_BLOCK`, `ROUTER_LITE_FORK=1 MAINNET_RPC_URL=${{ secrets.ROUTER_LITE_FORK_RPC }} bun test sdks/router-lite-sdk/integration`, save cache. Requires the `ROUTER_LITE_FORK_RPC` archival-RPC repo secret (flag to Mark if it doesn't exist — repo-settings change).
- [ ] **Step 2:** `router-lite-canary.yml`: `on: schedule: cron '0 6 * * *'` + `workflow_dispatch`; runs Task 21's suite against the provider-matrix secrets; `continue-on-error: false` but **not** a required status check; uploads the latency JSON as an artifact; opens/updates a pinned issue on failure (`actions/github-script` comment pattern).
- [ ] **Step 3:** Validate by pushing to the feature branch and observing both workflows (canary via `workflow_dispatch`).
- [ ] **Step 4:** Commit: `ci(router-lite-sdk): PR-blocking fork suite, nightly live canary`

---

## Testing architecture (added after testing design review with Mark)

Six layers, each proving what the previous cannot: (1) unit + property tests — algorithms, interval algebra, determinism; (2) differential tests — viem re-implementations byte-identical to the pinned ethers SDKs; (3) recorded-fixture decode — real captured returndata breaks the encode/decode circularity of stubs; (4) fork, known pools — full pipeline against real bytecode with actual execution; (5) fork, synthetic worlds (worldBuilder) — **exact** quote honesty, cold discovery of self-created pools, adversarial hooks/FOT; (6) live-RPC canary — provider caps/batching/latency plus `eth_simulateV1` chained-call execution proof (native balance override + in-simulation token acquisition; no keys, no funds, no storage-slot guessing). `assertResultCoherent` threads the honesty invariants through every layer. Fork suite is PR-blocking (pinned block + foundry cache); canary is nightly, non-blocking.

## Self-review notes (performed while writing)

- **Spec coverage:** waves incl. speculative wave 0 (T17, T8–T10), coverage cache (T7), focus selection (T17), hookData request-scoped map (T11/T17), promise+iterator+abort (T17/T18), readiness matrix (T15/T19B), plan invariants incl. intermediate wrap (T13), version-bound encoder + goldens (T14), manifest atomicity (T6), four-axis SearchReport (T17), `disabled` protocol reporting (T6/T17), latency benchmarks (T21, recorded not asserted; constants revisited from them); everything else v1 is tasked.
- **Type consistency:** all cross-task names sourced from Task 1's verbatim list; `QuoteCall.decode` closure pattern used consistently in T8–T10, T12.
- **Known judgment call:** exact v4 settle/take byte layouts in mixed sections are specified *by* the differential suite (T14 step 3) rather than transcribed here — transcribing from memory risks wrong constants; byte-equality against the pinned SDK is the stronger spec.
