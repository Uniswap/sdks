import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * A running Anvil fork. `rpcUrl`/`wsUrl` are the HTTP and WebSocket endpoints (Anvil serves both on
 * the same port); `rpc` issues a raw JSON-RPC call (for the `anvil_*` / `evm_*` cheatcodes); `stop`
 * kills the process and resolves once it has exited.
 */
export interface AnvilFork {
  rpcUrl: string
  wsUrl: string
  stop(): Promise<void>
  rpc<T>(method: string, params: unknown[]): Promise<T>
}

/** Default upstream Base RPC to fork from. No key required; overridable via env. */
export const FORK_RPC_BASE = process.env.BLOCKFEED_FORK_RPC_BASE ?? 'https://mainnet.base.org'

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
  while (Date.now() < deadline) {
    try {
      await jsonRpc<string>(rpcUrl, 'eth_blockNumber', [])
      return
    } catch {
      await new Promise((r) => setTimeout(r, 200))
    }
  }
  throw new Error(`anvil fork did not become ready within ${timeoutMs}ms (${rpcUrl})`)
}

/**
 * Spin up an Anvil fork of `opts.forkUrl` (pinned to `opts.forkBlock` when given) and resolve once it
 * answers JSON-RPC. Anvil caches fork state, so pinned-block reruns are cheap. Always call
 * {@link AnvilFork.stop} (e.g. in `afterAll`) to reclaim the process, even on test failure.
 */
export async function startAnvilFork(opts: { forkUrl: string; forkBlock?: bigint; port?: number }): Promise<AnvilFork> {
  const bin = resolveAnvilBin()
  if (!bin) throw new Error('anvil binary not found (install foundry: https://getfoundry.sh)')

  const port = opts.port ?? 8545
  const rpcUrl = `http://127.0.0.1:${port}`
  const wsUrl = `ws://127.0.0.1:${port}`

  // Guard against a stale anvil left on this port by a crashed run: connecting to it would silently
  // serve mutated state. Fail loudly instead so the caller picks a free port / cleans up.
  try {
    await jsonRpc<string>(rpcUrl, 'eth_blockNumber', [])
    throw new Error(`port ${port} is already serving JSON-RPC; refusing to attach to a stale instance`)
  } catch (err) {
    if (err instanceof Error && err.message.includes('already serving')) throw err
    // Otherwise the port is free (fetch failed) — proceed to spawn.
  }

  const args = ['--fork-url', opts.forkUrl, '--port', String(port), '--silent']
  if (opts.forkBlock !== undefined) args.push('--fork-block-number', String(opts.forkBlock))

  const child: ChildProcess = spawn(bin, args, { stdio: 'ignore' })
  let exited = false
  child.once('exit', () => {
    exited = true
  })

  try {
    await waitForReady(rpcUrl, 30_000)
    if (exited) throw new Error('anvil exited during startup (port in use or bad fork args?)')
  } catch (err) {
    child.kill('SIGKILL')
    throw err
  }

  return {
    rpcUrl,
    wsUrl,
    rpc: <T>(method: string, params: unknown[]) => jsonRpc<T>(rpcUrl, method, params),
    async stop() {
      if (exited || child.exitCode !== null) return
      await new Promise<void>((resolve) => {
        child.once('exit', () => resolve())
        child.kill('SIGKILL')
        // Safety net: resolve even if the exit event is somehow missed.
        setTimeout(resolve, 2_000)
      })
    },
  }
}
