/**
 * Runs every demo flow sequentially against one anvil mainnet fork, impersonating the margin
 * deployer (0x58e28b95a2ee57c4E90613AFce9e8CCEED3aB1E8) as the sender. Each flow mirrors a
 * v4-periphery contract test and exercises the SDK end-to-end against the LIVE deployed stack.
 *
 *   bun demo/run-all.ts            (or: bun run demo)
 *   MARGIN_DEMO_RPC=<url> bun demo/run-all.ts
 */
import { run as longLifecycle } from './01-long-lifecycle'
import { run as nativeEth } from './02-native-eth'
import { run as shortAave } from './03-short-aave'
import { run as hedge } from './04-hedge-subaccounts'
import { run as executePlans } from './05-execute-plans'
import { withAnvil } from './lib/env'

await withAnvil(async (ctx) => {
  console.log(`forked mainnet · sender ${ctx.deployer} · router ${ctx.addresses.marginRouter}`)
  await longLifecycle(ctx)
  await nativeEth(ctx)
  await shortAave(ctx)
  await hedge(ctx)
  await executePlans(ctx)
  console.log('\nall demo flows passed ✓')
})
