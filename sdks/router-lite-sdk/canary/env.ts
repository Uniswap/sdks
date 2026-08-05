import { createPublicClient, http, type PublicClient } from 'viem'
import { mainnet } from 'viem/chains'

// ---------------------------------------------------------------------------
// Gating + provider matrix for the live-RPC canary suite.
//
// Every canary test is opt-IN (`ROUTER_LITE_CANARY=1` + at least
// `CANARY_RPC_URL_1`) and NEVER PR-blocking — this is what every suite in
// this workspace gates on, mirroring `integration/anvil.ts`'s
// `forkTestsEnabled()` for the same reason: CI must never accidentally
// satisfy the gate and start hitting real providers on every PR.
//
// Up to three providers (`CANARY_RPC_URL_1`/`_2`/`_3`) form the provider
// matrix referenced throughout the suite (Alchemy / Infura / a public node,
// in whatever order the caller assigns them) — `_2`/`_3` are optional and
// only light up the cross-provider tests when present.
// ---------------------------------------------------------------------------

const RPC_ENV_VARS = ['CANARY_RPC_URL_1', 'CANARY_RPC_URL_2', 'CANARY_RPC_URL_3'] as const

export type CanaryProvider = { label: string; url: string; client: PublicClient }

function clientFor(url: string): PublicClient {
  return createPublicClient({ chain: mainnet, transport: http(url, { timeout: 30_000 }) }) as PublicClient
}

/**
 * A brand-new client for `provider`, sharing no state with `provider.client` or any other caller's.
 *
 * This exists for the latency benchmarks, where "cold" has to actually mean cold. A `Router` keeps a
 * pool index across calls and a viem client caches the block number, so a second measurement taken
 * through either one is measuring a warm cache, not discovery. The C4-T4b run caught exactly that:
 * the cold-long-tail row reported 113ms because the same router had already discovered that pool
 * while hunting for a tradeable candidate moments earlier — a real number for the wrong question.
 */
export function freshClient(provider: CanaryProvider): PublicClient {
  return clientFor(provider.url)
}

/** Whether ANY canary test should run at all. */
export function canaryEnabled(): boolean {
  if (process.env.ROUTER_LITE_CANARY !== '1') return false
  return Boolean(process.env.CANARY_RPC_URL_1)
}

/** Every configured provider, in `_1`/`_2`/`_3` order. Empty when {@link canaryEnabled} is false. */
export function canaryProviders(): CanaryProvider[] {
  const providers: CanaryProvider[] = []
  for (const key of RPC_ENV_VARS) {
    const url = process.env[key]
    if (!url) continue
    providers.push({ label: key, url, client: clientFor(url) })
  }
  return providers
}

/** The first configured provider — what a single-provider test runs against. Throws if none are
 * configured; callers must gate on {@link canaryEnabled} first and skip cleanly when it's false. */
export function primaryProvider(): CanaryProvider {
  const [first] = canaryProviders()
  if (!first) throw new Error('primaryProvider(): no CANARY_RPC_URL_* configured — call canaryEnabled() first and skip')
  return first
}

/** `console.log` under a consistent `[canary]` prefix, structured as JSON when `data` is given — the
 * nightly job's log IS the report, so every note/skip/measurement goes through here rather than an
 * ad hoc `console.log` per call site. */
export function canaryLog(message: string, data?: unknown): void {
  if (data !== undefined) {
    console.log(`[canary] ${message} ${JSON.stringify(data)}`)
  } else {
    console.log(`[canary] ${message}`)
  }
}
