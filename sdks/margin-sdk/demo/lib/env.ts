import fs from 'node:fs'
import path from 'node:path'

import { type Subprocess } from 'bun'
import {
  http,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
  type TestClient,
  type WalletClient,
  createPublicClient,
  createTestClient,
  createWalletClient,
  zeroAddress,
} from 'viem'
import { mainnet } from 'viem/chains'

import {
  type MarginAddresses,
  type Market,
  type PoolKey,
  SupportedChainId,
  getMarginAddresses,
  toPoolKey,
} from '../../src'

/**
 * Demo environment: an anvil fork of Ethereum mainnet with the margin deployer impersonated as
 * the sender. Every flow runs against the LIVE deployed margin stack (router, adapters, Morpho
 * Blue, Aave v3, Aave v4) and the real, liquid USDC/WETH 0.05% v4 pool — the same surfaces the
 * v4-periphery fork tests exercise.
 */

/** The margin deployment deployer/governance EOA — the impersonated sender for all demo flows. */
export const DEPLOYER: Address = '0x58e28b95a2ee57c4E90613AFce9e8CCEED3aB1E8'

export const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

/** Canonical mainnet v4 Quoter (sdk-core `v4QuoterAddress`); used to derive real swap quotes. */
export const V4_QUOTER: Address = '0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203'

const DEFAULT_FORK_RPC =
  process.env.MARGIN_DEMO_RPC ?? process.env.FORK_URL ?? process.env.RPC_URL ?? 'https://ethereum-rpc.publicnode.com'

export interface Ctx {
  rpcUrl: string
  publicClient: PublicClient
  testClient: TestClient
  wallet: WalletClient
  deployer: Address
  addresses: MarginAddresses
  weth: Address
  usdc: Address
  /** The real mainnet v4 USDC/WETH 0.05% hookless pool (the most liquid USDC/WETH v4 pool). */
  poolKey: PoolKey
  /** Long ETH: collateral WETH, debt USDC. */
  longMarket: Market
  /** Short ETH: collateral USDC, debt WETH. */
  shortMarket: Market
  /**
   * The Universal Router the position swaps route through (a per-call parameter of the margin
   * flows). Deployed onto the fork by `withAnvil` from the pinned v4-periphery build — it must
   * carry already-unlocked `V4_SWAP` support (post-#491), which the canonical historical mainnet
   * deployments predate. Placeholder (zero) until `withAnvil` resolves it.
   */
  universalRouter: Address
}

export function buildCtx(rpcUrl: string): Ctx {
  const addresses = getMarginAddresses(SupportedChainId.MAINNET)!
  const weth = addresses.weth9
  const transport = http(rpcUrl)
  return {
    rpcUrl,
    publicClient: createPublicClient({ chain: mainnet, transport }),
    testClient: createTestClient({ chain: mainnet, mode: 'anvil', transport }),
    wallet: createWalletClient({ chain: mainnet, transport, account: DEPLOYER }),
    deployer: DEPLOYER,
    addresses,
    weth,
    usdc: USDC,
    poolKey: toPoolKey({ currencyA: weth, currencyB: USDC, fee: 500, tickSpacing: 10 }),
    longMarket: { collateral: weth, debt: USDC },
    shortMarket: { collateral: USDC, debt: weth },
    universalRouter: zeroAddress,
  }
}

/**
 * Resolves the Universal Router the demo flows route through. `MARGIN_DEMO_UNIVERSAL_ROUTER`
 * points at an existing deployment on the fork; otherwise a fresh UR is deployed from the pinned
 * v4-periphery build's artifact (the same artifact the periphery's `MarginRouteHelpers` deploys
 * via `vm.getCode`), bound to the canonical PoolManager/Permit2/WETH9 with the v2/v3 parameters
 * zero — the demos route only over v4 pools.
 */
async function resolveUniversalRouter(ctx: Ctx): Promise<Address> {
  const override = process.env.MARGIN_DEMO_UNIVERSAL_ROUTER
  if (override) return override as Address

  const peripheryPath = process.env.V4_PERIPHERY_PATH ?? `${process.env.HOME}/dev/v4-periphery`
  const artifactPath = path.join(peripheryPath, 'foundry-out/UniversalRouter.sol/UniversalRouter.json')
  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `Universal Router artifact not found at ${artifactPath} — run \`forge build\` in the v4-periphery checkout ` +
        '(V4_PERIPHERY_PATH), or set MARGIN_DEMO_UNIVERSAL_ROUTER to an existing post-#491 deployment'
    )
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as { abi: Abi; bytecode: { object: Hex } }
  const hash = await ctx.wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    account: DEPLOYER,
    chain: mainnet,
    args: [
      {
        permit2: ctx.addresses.permit2,
        weth9: ctx.weth,
        v2Factory: zeroAddress,
        v3Factory: zeroAddress,
        pairInitCodeHash: `0x${'0'.repeat(64)}`,
        poolInitCodeHash: `0x${'0'.repeat(64)}`,
        v4PoolManager: ctx.addresses.poolManager,
        permissionsAdapterFactory: zeroAddress,
        v3NFTPositionManager: zeroAddress,
        v4PositionManager: zeroAddress,
        spokePool: zeroAddress,
      },
    ],
  })
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success' || !receipt.contractAddress) {
    throw new Error('Universal Router deployment onto the fork failed')
  }
  return receipt.contractAddress
}

async function waitForRpc(rpcUrl: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now()
  for (;;) {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      })
      const body = (await response.json()) as { result?: string }
      if (body.result) return
    } catch {
      // anvil not up yet
    }
    if (Date.now() - start > timeoutMs) throw new Error(`anvil did not become ready on ${rpcUrl}`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

async function latestBlockNumber(rpcUrl: string): Promise<bigint> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
  })
  const body = (await response.json()) as { result: string }
  return BigInt(body.result)
}

export async function startAnvil(): Promise<{ rpcUrl: string; proc: Subprocess }> {
  const port = 8545 + Math.floor(Math.random() * 500)
  const rpcUrl = `http://127.0.0.1:${port}`
  // Pin the fork a safe depth below head: public load-balanced RPCs serve inconsistent state
  // near the tip, which makes anvil's lazily-fetched fork state flaky.
  const forkBlock = (await latestBlockNumber(DEFAULT_FORK_RPC)) - 32n
  const proc = Bun.spawn(
    [
      'anvil',
      '--fork-url',
      DEFAULT_FORK_RPC,
      '--fork-block-number',
      forkBlock.toString(),
      '--port',
      String(port),
      '--auto-impersonate',
      // The pinned v4-periphery Universal Router build (default 44444444-runs profile) has a
      // runtime above the EIP-170 limit; the periphery's own fork tests deploy the same artifact
      // under forge's relaxed test EVM, so relax anvil the same way for the demo deploy.
      '--disable-code-size-limit',
      '--silent',
    ],
    { stdout: 'ignore', stderr: 'inherit' }
  )
  process.on('exit', () => proc.kill())
  await waitForRpc(rpcUrl)
  return { rpcUrl, proc }
}

/**
 * Boots a fork, funds the deployer with gas ETH, resolves the Universal Router (deploying one
 * from the pinned v4-periphery build if none is supplied), runs `fn`, and tears the fork down.
 */
export async function withAnvil(fn: (ctx: Ctx) => Promise<void>): Promise<void> {
  const { rpcUrl, proc } = await startAnvil()
  try {
    const ctx = buildCtx(rpcUrl)
    await ctx.testClient.setBalance({ address: DEPLOYER, value: 1_000n * 10n ** 18n })
    const universalRouter = await resolveUniversalRouter(ctx)
    await fn({ ...ctx, universalRouter })
  } finally {
    proc.kill()
  }
}
