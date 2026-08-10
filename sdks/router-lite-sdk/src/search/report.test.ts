import { expect, test } from 'bun:test'
import type { Address } from 'viem'
import { zeroHash } from 'viem'

import { PoolIndex } from '../pools/poolIndex'
import type { ProtocolModule } from '../protocols/types'
import type { BlockRef, ChainManifest, Protocol, SwapRequest } from '../types'

import { discoveryStatus } from './report'
import { initialState } from './waves'
import type { Run, SearchContext } from './waves'

// ---------------------------------------------------------------------------
// C4-T1 mutation-audit kill: M15.
//
// `discoveryStatus` judges completeness against THIS TRADE'S TWO ENDPOINTS BY
// NAME (see the function's own docstring) — a count of scanned endpoints
// would let any two scans satisfy it while one endpoint's adjacency was never
// touched, reporting `complete` for a search that never looked. That is
// exactly what an `every` -> `some` mutation over the two endpoint nodes does:
// only ONE endpoint needs to be complete for the mutant to skip the `partial`
// branch. Confirmed surviving the pre-existing suite (audit + local
// reproduction: `bun test` with `every` mutated to `some` in `report.ts`
// still passes green), so this test pins the two-endpoint check directly
// rather than through a full multi-wave `searchWaves` scenario.
// ---------------------------------------------------------------------------

const WETH = `0x${'ee'.repeat(20)}` as Address
const TOKEN_A = `0x${'aa'.repeat(20)}` as Address
const TOKEN_B = `0x${'bb'.repeat(20)}` as Address
const TRADER = `0x${'11'.repeat(20)}` as Address

const BLOCK: BlockRef = { number: 1_000n, hash: zeroHash, timestamp: 1_700_000_000n }

function manifest(): ChainManifest {
  return { chainId: 1, wrappedNative: WETH, v2: { factory: `0x${'44'.repeat(20)}` as Address, deploymentBlock: 0n } }
}

/** A minimal enabled-only module: `discoveryStatus` reads nothing else off `ProtocolModule`. */
function enabledModule(id: Protocol): ProtocolModule {
  return {
    id,
    enabled: () => true,
    speculativeDirect: () => [],
    adjacencyShape: () => undefined,
    parsePoolLog: () => null,
    validateHint: async () => null,
    encodeQuote: () => {
      throw new Error('not used by discoveryStatus')
    },
    compileOperation: () => {
      throw new Error('not used by discoveryStatus')
    },
  }
}

function makeRun(): Run {
  const modules = { v2: enabledModule('v2'), v3: enabledModule('v3'), v4: enabledModule('v4') }
  const ctx: SearchContext = {
    client: {
      request: async () => {
        throw new Error('discoveryStatus must never issue RPC')
      },
    },
    manifest: manifest(),
    modules,
    index: new PoolIndex(WETH), // discoveryStatus never touches the index; a real one is cheapest to build
    hookData: new Map(),
  }
  const state = initialState(BLOCK, false)
  const req: SwapRequest = { tokenIn: TOKEN_A, tokenOut: TOKEN_B, amountIn: 1n, trader: TRADER }
  return { ctx, state, kind: 'swap', req }
}

test('discoveryStatus: both endpoints complete -> complete', () => {
  const run = makeRun()
  run.state.discovery.v2.complete.add(TOKEN_A.toLowerCase())
  run.state.discovery.v2.complete.add(TOKEN_B.toLowerCase())

  expect(discoveryStatus(run, 'v2', [TOKEN_A, TOKEN_B])).toBe('complete')
})

test('discoveryStatus: neither endpoint complete -> partial', () => {
  const run = makeRun()

  expect(discoveryStatus(run, 'v2', [TOKEN_A, TOKEN_B])).toBe('partial')
})

// THE MUTATION-KILLING CASE (M15): exactly ONE of the two endpoints' adjacency is complete. The
// real `every` demands both; a search that never looked at the other endpoint must never be
// reported `complete` — an `every` -> `some` mutant would return `complete` here instead.
test('discoveryStatus: only ONE endpoint complete -> partial, never complete (M15)', () => {
  const inOnly = makeRun()
  inOnly.state.discovery.v2.complete.add(TOKEN_A.toLowerCase())
  expect(discoveryStatus(inOnly, 'v2', [TOKEN_A, TOKEN_B])).toBe('partial')

  const outOnly = makeRun()
  outOnly.state.discovery.v2.complete.add(TOKEN_B.toLowerCase())
  expect(discoveryStatus(outOnly, 'v2', [TOKEN_A, TOKEN_B])).toBe('partial')
})

test('discoveryStatus: a failed scan reports failed regardless of endpoint completeness', () => {
  const run = makeRun()
  run.state.discovery.v2.complete.add(TOKEN_A.toLowerCase())
  run.state.discovery.v2.complete.add(TOKEN_B.toLowerCase())
  run.state.discovery.v2.failed = true

  expect(discoveryStatus(run, 'v2', [TOKEN_A, TOKEN_B])).toBe('failed')
})

test('discoveryStatus: a disabled protocol reports disabled before looking at discovery state at all', () => {
  const run = makeRun()
  run.ctx.modules.v3 = { ...enabledModule('v3'), enabled: () => false }

  expect(discoveryStatus(run, 'v3', [TOKEN_A, TOKEN_B])).toBe('disabled')
})
