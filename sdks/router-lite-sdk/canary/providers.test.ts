import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createRouter, MAINNET_MANIFEST } from '@uniswap/router-lite-sdk'
import { describe, it, expect } from 'bun:test'
import { createPublicClient, http, parseEther, toHex, type Address } from 'viem'
import { mainnet } from 'viem/chains'

const CANARY_DIR = dirname(fileURLToPath(import.meta.url))

import { scanLogs } from '../src/internal/logScan'

import { canaryEnabled, canaryLog, canaryProviders, primaryProvider, type CanaryProvider } from './env'
import { probeSimulateV1Support } from './simulate'

// ---------------------------------------------------------------------------
// Provider-behavior evidence (Task 21, test group 3).
//
// This file is not about the SDK's routing/quoting correctness — it is about
// what REAL providers actually do when pushed: how they cap eth_getLogs (and
// whether the log scanner's bisection actually converges against that), what
// their error messages look like (captured as a committed fixture the unit
// suite can regression-test decoding against), whether a batched HTTP
// transport really coalesces concurrent calls onto the wire, and whether
// eth_simulateV1 is even implemented. Every assertion here is about provider
// behavior, never about a specific quote/route.
// ---------------------------------------------------------------------------

const RUN = canaryEnabled()

/** Committed IN THE MAIN PACKAGE (not `canary/`) — this is what the unit suite (e.g. a future
 * `logScan.test.ts` regression) can load without ever touching a live RPC. Additive, and keyed by
 * endpoint hostname ({@link fixtureKeyFor}): a run against fewer providers only ever adds or
 * refreshes the hosts it actually talked to, and never disturbs the rest of the corpus. */
const FIXTURE_PATH = join(CANARY_DIR, '../src/internal/__fixtures__/providerErrors.json')

type ProviderErrorEntry = { source: 'seed' | 'live-capture'; capturedAt?: string; message: string }
/** Keyed by ENDPOINT HOSTNAME — see {@link fixtureKeyFor}. */
type ProviderErrorFixture = Record<string, ProviderErrorEntry>

/**
 * The fixture key for `provider`: the endpoint's HOSTNAME, never its `CANARY_RPC_URL_n` slot.
 *
 * The slot is a property of one operator's configuration on one day; the error text is a property of
 * a VENDOR. Keying by slot silently destroys entries whenever the two disagree, which is not
 * hypothetical — the C4-T4b run moved drpc from `_3` to `_2` and its capture overwrote the blastapi
 * entry recorded the night before, deleting a distinct real error shape (a 10-block range cap) that
 * nothing else in this corpus has. Hostnames are stable across that, and self-describing in a diff.
 *
 * A hostname is not a secret — vendor keys live in the path or query string, which is why
 * {@link redactKeyedUrl} can scrub a URL and leave the host readable. Falls back to the label if the
 * URL will not parse, so a malformed endpoint still records SOMETHING rather than throwing here.
 */
function fixtureKeyFor(provider: CanaryProvider): string {
  try {
    return new URL(provider.url).hostname
  } catch {
    return provider.label
  }
}

/** What a keyed endpoint's URL is replaced with before anything is written down. */
const REDACTED_URL = 'https://<redacted-keyed-endpoint>'

/**
 * Minimum length of a URL path segment for it to be treated as a SECRET rather than a route.
 *
 * Vendor API keys live in the path (`.../v2/<key>`, `.../<key>/`), and every real one is a long
 * opaque token — the major vendors' documented formats are all twenty-something characters or
 * longer. Ordinary path segments (`v2`, `rpc`, `mainnet`, `eth`) are short. 16 sits comfortably
 * between the two, and erring toward over-redaction is the right side to err on here.
 */
const SECRET_SEGMENT_MIN_LENGTH = 16

/**
 * Replaces any KEY-BEARING URL in `message` with {@link REDACTED_URL}, leaving the rest of the
 * message — the status, the JSON-RPC code, the provider's own words — exactly as captured.
 *
 * This exists because `providerErrors.json` IS COMMITTED and viem embeds the full request URL in
 * every error it constructs. Run the canary against a keyed archive endpoint (which is the only way
 * several of these rows complete at all — see `canary.test.ts`'s header) and the naive capture path
 * writes that key straight into the repository. So the redaction happens here, at the boundary where
 * a live error becomes a durable artifact, rather than being left to whoever reviews the diff.
 *
 * KEYLESS PUBLIC URLS ARE DELIBERATELY LEFT INTACT. `https://eth.drpc.org` carries no secret, and
 * which vendor produced a given error message is the single most useful thing about the fixture —
 * redacting it unconditionally would trade a real diagnostic for no security at all. A URL is
 * treated as keyed when it has a path segment of at least {@link SECRET_SEGMENT_MIN_LENGTH}
 * characters, or any query string (some vendors pass the key as `?apikey=`).
 */
export function redactKeyedUrl(message: string): string {
  return message.replace(/https?:\/\/[^\s"'<>\\]+/g, (url) => {
    const withoutScheme = url.slice(url.indexOf('://') + 3)
    const [beforeQuery, ...queryParts] = withoutScheme.split('?')
    if (queryParts.length > 0 && queryParts.join('?').length > 0) return REDACTED_URL
    const segments = beforeQuery!.split('/').slice(1)
    return segments.some((s) => s.length >= SECRET_SEGMENT_MIN_LENGTH) ? REDACTED_URL : url
  })
}

function loadFixture(): ProviderErrorFixture {
  if (!existsSync(FIXTURE_PATH)) return {}
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as ProviderErrorFixture
}

function recordProviderError(key: string, message: string): boolean {
  const fixture = loadFixture()
  fixture[key] = { source: 'live-capture', capturedAt: new Date().toISOString(), message: redactKeyedUrl(message) }
  mkdirSync(dirname(FIXTURE_PATH), { recursive: true })
  writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`)
  return true
}

// First-contact finding (this canary's first-ever live run): 200_000n here against the real,
// live v4 PoolManager (unfiltered — every Swap/ModifyLiquidity/Initialize it has ever emitted)
// generates so much log volume that `scanLogs` bisects nearly the entire window down to
// `MIN_CHUNK` (128 blocks). That part is correct behavior, but a *permanently* failing provider
// (e.g. an archive-access wall — see below) never gets a success to reset
// `minFailuresSinceSuccess`, so EVERY one of those requests pays the escalating backoff wait too —
// worst case is `MAX_BACKOFF_TOTAL_MS` (60s) of pure sleep on top of ~1,562 sequential requests for
// the original 200k window, several minutes past this test's own timeout. A 100x smaller window
// keeps the worst-case walk (~16 min-chunk give-up groups) comfortably inside both the 60s backoff
// budget and the test's own timeout, while still being far more log volume than a capped provider
// will serve in one response — ~40,000 logs live, against drpc's 20,000-result ceiling.
//
// IT DOES NOT TRIP EVERY PROVIDER, and that is fine. A keyed archive endpoint (C4-T4b) served the
// whole 2,000-block window in a single response with no error at all. This test is not "make the
// provider fail"; it is "whatever this provider's ceiling turns out to be, `scanLogs` returns the
// same complete log set" — which is exactly what the two paths demonstrated, one in a single request
// and one by halving down under the cap, both recovering an identical 39,929 logs.
const HUGE_WINDOW_BLOCKS = 2_000n

/**
 * Issues one deliberately oversized, unfiltered `eth_getLogs` against the v4 PoolManager (every
 * Swap/ModifyLiquidity/Initialize it has ever emitted, over a {@link HUGE_WINDOW_BLOCKS}-block
 * window) to reliably trip a live provider's result-count/range cap, capturing its raw error text.
 * Then runs the SDK's own {@link scanLogs} over the identical range and asserts its bisection
 * actually converges to full coverage against that same real provider — proving the bisector isn't
 * just unit-tested against a stub that fails in exactly the shape the code expects.
 */
async function hugeLogsProbe(provider: CanaryProvider): Promise<{
  complete: boolean
  coveredRanges: number
  logCount: number
  rawErrorSample?: string
}> {
  const head = await provider.client.getBlockNumber()
  const fromBlock = head > HUGE_WINDOW_BLOCKS ? head - HUGE_WINDOW_BLOCKS : 0n
  const poolManager = MAINNET_MANIFEST.v4!.poolManager

  let rawErrorSample: string | undefined
  try {
    await provider.client.request({
      method: 'eth_getLogs',
      params: [{ address: poolManager, fromBlock: toHex(fromBlock), toBlock: toHex(head) }],
    } as any)
    // Some providers may just serve this fine (a generous plan, a quiet window) — not an error to
    // capture, and not a reason to fail: the bisector still gets exercised below regardless.
  } catch (err) {
    // Redacted AT CAPTURE, not at the write: `rawErrorSample` is logged to stdout as well as
    // persisted, and a keyed URL in a CI log is exactly as leaked as one in a committed file.
    // `recordProviderError` redacts again on the way to disk — `redactKeyedUrl` is idempotent, and
    // the file it writes is the one artifact that must never be wrong about this.
    rawErrorSample = redactKeyedUrl(err instanceof Error ? err.message : String(err))
  }

  const { logs, covered, complete } = await scanLogs(
    provider.client,
    { address: poolManager, topics: [] },
    { fromBlock, toBlock: head },
    {},
  )
  return { complete, coveredRanges: covered.length, logCount: logs.length, rawErrorSample }
}

// Pure, no RPC, and therefore NOT gated on `RUN`: this is the one thing in the canary suite whose
// failure mode is a leaked credential rather than a missed regression, so it is verified on every
// run of this file — including the ones where `canaryEnabled()` is false and nothing else executes.
describe('redactKeyedUrl (pure)', () => {
  it('redacts a URL whose path carries a vendor key', () => {
    const message = 'HTTP request failed.\n\nURL: https://eth-mainnet.g.alchemy.com/v2/EXAMPLE-KEY-NOT-A-REAL-ONE-000000\nStatus: 400'
    expect(redactKeyedUrl(message)).toBe('HTTP request failed.\n\nURL: https://<redacted-keyed-endpoint>\nStatus: 400')
  })

  it('redacts a URL that carries the key in a query string', () => {
    expect(redactKeyedUrl('URL: https://rpc.example.com/eth?apikey=abc')).toBe('URL: https://<redacted-keyed-endpoint>')
  })

  it('leaves keyless public endpoints alone — which vendor errored is the point of the fixture', () => {
    for (const url of ['https://eth.drpc.org', 'https://ethereum.publicnode.com/', 'https://eth-mainnet.public.blastapi.io/']) {
      expect(redactKeyedUrl(`URL: ${url}\n`)).toBe(`URL: ${url}\n`)
    }
  })

  it('leaves a vendor message that merely links to a signup page alone', () => {
    const message = 'Details: {"code":-32602,"message":"Archive requests require a personal token. Get one at: https://www.allnodes.com/publicnode"}'
    expect(redactKeyedUrl(message)).toBe(message)
  })

  it('is idempotent — re-redacting an already-redacted message is a no-op', () => {
    const once = redactKeyedUrl('URL: https://eth-mainnet.g.alchemy.com/v2/EXAMPLE-KEY-NOT-A-REAL-ONE-000000')
    expect(redactKeyedUrl(once)).toBe(once)
  })
})

describe.skipIf(!RUN)('provider-behavior evidence (canary, live head)', () => {
  const providers = canaryProviders()

  for (const provider of providers) {
    it(`${provider.label}: a deliberately huge eth_getLogs bisects and converges`, async () => {
      const res = await hugeLogsProbe(provider)
      canaryLog(`${provider.label}: huge-getLogs probe`, { complete: res.complete, coveredRanges: res.coveredRanges, logCount: res.logCount })
      // Capture BEFORE asserting: this canary's first-ever live run found the fixture capture
      // sitting after `expect(res.complete).toBe(true)` below, which THROWS on a non-convergent
      // provider and skipped the capture entirely for exactly the providers whose real error text
      // was most worth keeping (a categorically-blocked one never converges, so its error was
      // always the one least likely to be recorded — the opposite of the intent).
      let errorRecorded = false
      if (res.rawErrorSample) {
        const key = fixtureKeyFor(provider)
        errorRecorded = recordProviderError(key, res.rawErrorSample)
        canaryLog(`${provider.label}: captured a real provider error into the fixture`, { key, message: res.rawErrorSample })
      }
      // First-contact finding: `coveredRanges === 0` means not one single sub-range succeeded
      // anywhere in the window — a real provider can be categorically incapable of this query
      // (an archive-access paywall, or a per-call cap narrower than the scanner's own `MIN_CHUNK`
      // floor, both observed live) rather than merely under-budget. Neither is a bisector defect,
      // so — mirroring every other graceful-skip in this suite (the simulateV1 probe,
      // `pickTradeableRecentV4Pool` finding nothing) — this is logged and skipped rather than failed.
      // ONLY skip if zero coverage AND a provider error was actually captured. If zero coverage
      // with no provider error, that indicates a genuine bisector regression and must fail loudly.
      // Partial-but-incomplete coverage (`coveredRanges > 0`, `complete: false`) still asserts: that
      // shape means the provider DOES serve this query and the walk simply ran out of budget or hit
      // a real bug, which is exactly what this test exists to catch.
      if (res.coveredRanges === 0) {
        if (errorRecorded) {
          canaryLog(`${provider.label}: provider never served a single sub-range of this query — skipping the convergence assertion`, {
            rawErrorSample: res.rawErrorSample,
          })
          return
        }
        throw new Error(
          `${provider.label}: bisector returned zero coverage without capturing any provider error — this indicates a genuine bisector regression, not a provider limitation`,
        )
      }
      expect(res.complete).toBe(true)
    }, 180_000)
  }

  it('eth_simulateV1 support probe (graceful skip, never a failure)', async () => {
    for (const provider of providers) {
      const supported = await probeSimulateV1Support(provider.client)
      canaryLog(`${provider.label}: eth_simulateV1 support`, { supported })
    }
    // No assertion: an unsupported provider is a real, expected outcome (not every RPC vendor
    // implements this method) — the log line above IS the evidence this test exists to produce.
  }, 30_000)

  it('a batched transport carries a concurrent call burst in one HTTP request', async () => {
    const provider = primaryProvider()
    const batchSizes: number[] = []
    const countingFetch = async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
      if (typeof init?.body === 'string') {
        try {
          const parsed = JSON.parse(init.body)
          batchSizes.push(Array.isArray(parsed) ? parsed.length : 1)
        } catch {
          // not JSON — not a JSON-RPC batch, ignore
        }
      }
      return fetch(input, init)
    }
    const client = createPublicClient({
      chain: mainnet,
      transport: http(provider.url, { batch: { wait: 16 }, fetchFn: countingFetch }),
    })
    const router = createRouter({ client, manifest: MAINNET_MANIFEST })

    const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
    await router.getQuote({ tokenIn: 'native', tokenOut: USDC, amountIn: parseEther('1') })

    canaryLog('batched-transport request sizes', { batchSizes })
    expect(batchSizes.some((n) => n > 1)).toBe(true)
  }, 60_000)
})
