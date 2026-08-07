import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { createPublicClient, createWalletClient, http, type Address, type PublicClient, type WalletClient } from 'viem'
import { mainnet } from 'viem/chains'

// ---------------------------------------------------------------------------
// Anvil fork lifecycle.
//
// Every fork suite in this workspace starts from `startAnvilFork` and gates on
// `forkTestsEnabled()`. The gate is opt-IN (`ROUTER_LITE_FORK=1`): these suites
// spawn real processes, hit a public archive RPC, and take minutes, so they must
// never run implicitly — CI installs foundry, which would satisfy any opt-out
// gate by accident.
// ---------------------------------------------------------------------------

/**
 * Upstream mainnet RPCs to fork from, tried in order until one boots.
 *
 * Set `MAINNET_RPC_URL` to use your own endpoint (strongly recommended, and the only thing this
 * harness ever wants configured) — it replaces the list entirely.
 *
 * Choosing defaults is fussier than it looks: forking a PINNED block is an ARCHIVE workload, and
 * most "public mainnet RPC" endpoints are pruned full nodes that serve only ~128 blocks of state.
 * At the time of writing, of the usual suspects:
 *   - ethereum-rpc.publicnode.com  403s on archive reads ("requires a personal token")
 *   - eth.llamarpc.com             TLS handshake failures
 *   - rpc.ankr.com/eth             requires an API key
 *   - eth.drpc.org                 archive reads time out on the free plan
 *   - eth.merkle.io                works, but rate-limits (429) quickly
 * The three below all served archive state for the pinned block; Tenderly's public gateway is first
 * because it was by far the fastest to cold-start a fork.
 *
 * Foundry caches fork state per (chain, block) under `~/.foundry/cache`, so once a suite has run,
 * reruns against the pinned {@link FORK_BLOCK} are fast and largely offline.
 */
export const FORK_RPC_CANDIDATES: readonly string[] = process.env.MAINNET_RPC_URL
  ? [process.env.MAINNET_RPC_URL]
  : ['https://gateway.tenderly.co/public/mainnet', 'https://eth-mainnet.public.blastapi.io', 'https://eth.merkle.io']

/** The endpoint a caller gets when it does not care which one — the head of the candidate list. */
export const FORK_RPC_MAINNET = FORK_RPC_CANDIDATES[0]!

/**
 * The one place the fork block is pinned. Chosen as a round number below the chain tip at the time
 * this harness was written (tip was 25,678,686), and comfortably after the v4 PoolManager deployment
 * at 21,688,329 — so v2, v3 AND v4 are all live on the fork. Pinning keeps the foundry cache warm
 * and keeps every assertion in every fork suite reproducible.
 */
export const FORK_BLOCK = 25_670_000n

/** Anvil's first prefunded dev account (10,000 ETH, unlocked) — the harness's deployer/whale. */
export const ANVIL_DEPLOYER: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

/**
 * A running Anvil fork plus the viem clients bound to it. `rpc` issues a raw JSON-RPC call, which is
 * how the `anvil_*` / `evm_*` cheatcodes (setCode, setBalance, setStorageAt, impersonateAccount) are
 * reached — viem has no typed surface for them.
 */
export interface AnvilClient {
  rpcUrl: string
  wsUrl: string
  /** Read client, chain-bound to mainnet (the fork's chain id is 1). */
  publicClient: PublicClient
  /** Write client for {@link ANVIL_DEPLOYER}; unlocked, so it signs via `eth_sendTransaction`. */
  walletClient: WalletClient
  /** Write client for an arbitrary address — only usable after `anvil_impersonateAccount`. */
  walletFor(account: Address): WalletClient
  rpc<T>(method: string, params: unknown[]): Promise<T>
  stop(): Promise<void>
}

/** Candidate locations for the `anvil` binary, most-specific first. */
function anvilBinCandidates(): string[] {
  return [join(homedir(), '.foundry', 'bin', 'anvil'), '/usr/local/bin/anvil', '/opt/homebrew/bin/anvil']
}

/** Resolve an `anvil` binary path: PATH first (via `which`), then well-known install dirs. */
function resolveAnvilBin(): string | undefined {
  try {
    const fromPath = execFileSync('which', ['anvil'], { encoding: 'utf8' }).trim()
    if (fromPath) return fromPath
  } catch {
    // `which` failed / not on PATH; fall through to well-known locations.
  }
  return anvilBinCandidates().find((p) => existsSync(p))
}

/** Sync availability check used to `describe.skipIf` the fork suites when foundry is absent. */
export function anvilAvailable(): boolean {
  return resolveAnvilBin() !== undefined
}

/**
 * Whether the fork suites should run: `ROUTER_LITE_FORK=1` AND anvil present.
 * `ROUTER_LITE_SKIP_FORK=1` force-skips even when opted in (kill switch for CI).
 */
export function forkTestsEnabled(): boolean {
  if (process.env.ROUTER_LITE_SKIP_FORK === '1') return false
  if (process.env.ROUTER_LITE_FORK !== '1') return false
  return anvilAvailable()
}

async function jsonRpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const body = (await res.json()) as { result?: T; error?: { message: string } }
  if (body.error) throw new Error(`${method} failed: ${body.error.message}`)
  return body.result as T
}

/** Poll `eth_blockNumber` until the fork answers or the deadline passes. */
async function waitForReady(rpcUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      await jsonRpc<string>(rpcUrl, 'eth_blockNumber', [])
      return
    } catch (err) {
      lastError = err
      await new Promise((r) => setTimeout(r, 200))
    }
  }
  throw new Error(`anvil fork did not become ready within ${timeoutMs}ms (${rpcUrl}): ${String(lastError)}`)
}

/**
 * Spin up an Anvil fork of `opts.forkUrl` pinned to `opts.forkBlock` and resolve once it answers
 * JSON-RPC. Always call {@link AnvilClient.stop} (in a `finally`/`afterAll`) to reclaim the process,
 * even when the test fails — a leaked anvil holds its port and its mutated fork state.
 */
export async function startAnvilFork(
  opts: { forkUrl?: string; forkBlock?: bigint; port?: number; timeoutMs?: number } = {}
): Promise<AnvilClient> {
  const bin = resolveAnvilBin()
  if (!bin) throw new Error('anvil binary not found (install foundry: https://getfoundry.sh)')

  const candidates = opts.forkUrl ? [opts.forkUrl] : FORK_RPC_CANDIDATES
  const forkBlock = opts.forkBlock ?? FORK_BLOCK
  const port = opts.port ?? 8545
  const rpcUrl = `http://127.0.0.1:${port}`
  const wsUrl = `ws://127.0.0.1:${port}`

  // Guard against a stale anvil left on this port by a crashed run: silently attaching to it would
  // serve someone else's mutated state as if it were a clean fork.
  try {
    await jsonRpc<string>(rpcUrl, 'eth_blockNumber', [])
    throw new Error(`port ${port} is already serving JSON-RPC; refusing to attach to a stale instance`)
  } catch (err) {
    if (err instanceof Error && err.message.includes('already serving')) throw err
    // Otherwise the port is free (fetch failed) — proceed to spawn.
  }

  // Public endpoints fail in ways that only show up at genesis time (403 on archive state, 429,
  // TLS resets), so treat "did not come up" as a reason to try the next one rather than a fatal.
  let child: ChildProcess | undefined
  const failures: string[] = []
  for (const forkUrl of candidates) {
    const args = [
      '--fork-url',
      forkUrl,
      '--fork-block-number',
      String(forkBlock),
      '--port',
      String(port),
      '--chain-id',
      '1',
      '--silent',
    ]
    const spawned = spawn(bin, args, { stdio: 'ignore' })
    let died = false
    spawned.once('exit', () => {
      died = true
    })
    try {
      // Generous default: a cold foundry cache pulls the pinned block's state over a public RPC.
      await waitForReady(rpcUrl, opts.timeoutMs ?? 90_000)
      if (died) throw new Error('anvil exited during startup')
      child = spawned
      break
    } catch (err) {
      spawned.kill('SIGKILL')
      failures.push(`${forkUrl}: ${err instanceof Error ? err.message : String(err)}`)
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  if (!child) {
    throw new Error(
      `could not start an anvil fork at block ${forkBlock} from any upstream RPC.\n` +
        `Set MAINNET_RPC_URL to an archive endpoint you control.\n${failures.join('\n')}`
    )
  }
  const process_ = child
  let exited = false
  process_.once('exit', () => {
    exited = true
  })

  const transport = http(rpcUrl, { timeout: 120_000 })
  const publicClient = createPublicClient({ chain: mainnet, transport }) as PublicClient
  const walletFor = (account: Address): WalletClient =>
    createWalletClient({ account, chain: mainnet, transport }) as WalletClient

  return {
    rpcUrl,
    wsUrl,
    publicClient,
    walletClient: walletFor(ANVIL_DEPLOYER),
    walletFor,
    rpc: <T>(method: string, params: unknown[]) => jsonRpc<T>(rpcUrl, method, params),
    // SIGTERM first, SIGKILL only as a backstop: foundry writes its fork-state cache
    // (`~/.foundry/cache/rpc/<chain>/<block>/storage.json`) when the process shuts down cleanly, and
    // that cache is what makes the next run of a suite fast and largely offline. A hard kill throws
    // away everything this run pulled over the network, so every rerun starts cold again.
    async stop() {
      if (exited || process_.exitCode !== null) return
      await new Promise<void>((resolve) => {
        let settled = false
        const done = (): void => {
          if (settled) return
          settled = true
          resolve()
        }
        process_.once('exit', done)
        process_.kill('SIGTERM')
        setTimeout(() => {
          if (settled) return
          process_.kill('SIGKILL')
          // Safety net: resolve even if the exit event is somehow missed.
          setTimeout(done, 2_000)
        }, 5_000)
      })
    },
  }
}
