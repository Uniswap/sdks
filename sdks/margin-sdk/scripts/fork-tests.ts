// Gated fork-test entry: runs the end-to-end demo suite (an anvil mainnet fork exercising the
// live margin deployment) when a fork RPC is configured, and skips cleanly otherwise. CI provides
// FORK_URL; locally use MARGIN_DEMO_RPC or FORK_URL.
const rpc = process.env.MARGIN_DEMO_RPC ?? process.env.FORK_URL

if (!rpc) {
  console.log('fork tests skipped: set FORK_URL (or MARGIN_DEMO_RPC) to run the anvil-fork demo suite')
  process.exit(0)
}

const proc = Bun.spawnSync(['bun', 'demo/run-all.ts'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, MARGIN_DEMO_RPC: rpc },
  stdout: 'inherit',
  stderr: 'inherit',
})
process.exit(proc.exitCode ?? 1)
