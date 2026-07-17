import { afterAll, describe, expect, it } from 'bun:test'

import { anvilAvailable, FORK_RPC_BASE, startAnvilFork } from './anvil'

const RUN = anvilAvailable() && process.env.BLOCKFEED_SKIP_FORK !== '1'

// Pinned Base block; see engine.fork.test.ts for provenance. Reused here so the harness test shares
// anvil's on-disk fork cache with the scenario suite (cheap rerun).
const FORK_BLOCK = 48_730_000n
const PORT = 8590

describe.skipIf(!RUN)('startAnvilFork harness', () => {
  it('spins up a pinned Base fork, answers JSON-RPC, and stops', async () => {
    const fork = await startAnvilFork({ forkUrl: FORK_RPC_BASE, forkBlock: FORK_BLOCK, port: PORT })
    try {
      const chainId = await fork.rpc<string>('eth_chainId', [])
      expect(BigInt(chainId)).toBe(8453n)

      const blockNumber = await fork.rpc<string>('eth_blockNumber', [])
      expect(BigInt(blockNumber)).toBe(FORK_BLOCK)

      // Multicall3 must be present on the fork (every engine tick self-calls it).
      const code = await fork.rpc<string>('eth_getCode', ['0xcA11bde05977b3631167028862bE2a173976CA11', 'latest'])
      expect(code.length).toBeGreaterThan(2)
    } finally {
      await fork.stop()
    }

    // After stop, the endpoint should no longer answer.
    await expect(fork.rpc<string>('eth_blockNumber', [])).rejects.toBeDefined()
  }, 60_000)

  it('reports anvil as available in this environment', () => {
    expect(anvilAvailable()).toBe(true)
  })
})

afterAll(() => {
  // No shared state; per-test forks are torn down in their own finally blocks.
})
