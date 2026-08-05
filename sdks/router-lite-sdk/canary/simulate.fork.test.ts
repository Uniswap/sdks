import { createRouter, type Router } from '@uniswap/router-lite-sdk'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { parseEther, type Address } from 'viem'

// The anvil-fork harness lives in `../integration` (Task 19A/B) — reused here by relative import,
// the same escape hatch `integration/e2e.ts` already uses for `../src/internal/testing`. Both
// `canary/` and `integration/` are private, dev-only directories under the same package root; there
// is no reason to duplicate an entire fork lifecycle module to keep them from touching.
import { forkTestsEnabled, startAnvilFork, type AnvilClient } from '../integration/anvil'
import { forkManifest, needsAction } from '../integration/e2e'
import { createWorld } from '../integration/worldBuilder'

import { simulateSwapE2E } from './simulate'

// ---------------------------------------------------------------------------
// The one executable proof that `simulateSwapE2E`'s chained acquire -> approve
// -> permit2.approve -> swap logic actually runs, in CI-like conditions,
// without a live provider: an anvil mainnet fork (verified to support
// eth_simulateV1 — anvil 1.7.1 does, confirmed against
// `{"blockStateCalls":[...],"validation":false,"traceTransfers":true}`
// directly against a freshly booted instance before writing this suite).
//
// Gated on ROUTER_LITE_FORK=1 (same gate as every other fork suite in this
// workspace) — never PR-blocking, opt-in only, requires foundry installed.
// ---------------------------------------------------------------------------

const RUN = forkTestsEnabled()

const TRADER: Address = '0x1111111111111111111111111111111111111111'
const AMOUNT_IN = 1_000n * 10n ** 18n

describe.skipIf(!RUN)('simulateSwapE2E end-to-end (ROUTER_LITE_FORK=1, anvil)', () => {
  let anvil: AnvilClient
  let router: Router
  let tokenX: Address

  beforeAll(async () => {
    anvil = await startAnvilFork({ port: 8647 })
    const world = createWorld(anvil)
    // A synthetic v2 pool (tokenX <-> native) — synthetic so no real-token whale/impersonation is
    // needed for the acquisition leg to have somewhere to trade native into.
    tokenX = await world.deployToken('CanaryX')
    await world.createV2Pool(tokenX, 'native', 5_000_000n * 10n ** 18n, 2_000n * 10n ** 18n)
    router = createRouter({ client: anvil.publicClient, manifest: forkManifest() })
  }, 300_000)

  afterAll(async () => {
    await anvil?.stop()
  })

  it('the acquire -> approve -> permit2.approve -> swap chain executes and delivers >= minAmountOut', async () => {
    // TRADER is never funded here — exactly the canary's synthetic-trader shape: zero real balance,
    // zero real approvals, so `getSwap` must come back `needs-action` naming every missing piece.
    const result = needsAction(await router.getSwap({ tokenIn: tokenX, tokenOut: 'native', amountIn: AMOUNT_IN, trader: TRADER }))
    expect(result.requirements.map((r) => r.kind).sort()).toEqual(['erc20-approval', 'insufficient-balance', 'permit2-allowance'])

    // A small acquisition budget deliberately: the acquisition leg trades through the SAME pool as
    // the main swap (there is only one pool for this synthetic token), so a large acquisition would
    // move the pool's price enough to eat into the main swap's own 1% slippage floor before it even
    // runs — a real property of chaining two trades through shared liquidity, not a bug. 2 ETH against
    // a 2,000 ETH pool is ~0.1% impact, comfortably inside the floor.
    const outcome = await simulateSwapE2E(anvil.publicClient, result, TRADER, { acquireNativeBudget: parseEther('2') })
    expect(outcome.ok).toBe(true)
    expect(outcome.outputReceived).toBeGreaterThan(0n)
  }, 300_000)
})
