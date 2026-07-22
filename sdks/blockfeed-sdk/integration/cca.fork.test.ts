import {
  ccaBidsSource,
  createBlockFeed,
  type FeedEvent,
  type FeedStore,
  launchAssetSource,
  type LaunchAssetState,
} from '@uniswap/blockfeed-sdk'
import {
  buildErc20ApprovePermit2Tx,
  buildLaunchTransactions,
  buildMigrateTx,
  buildPermit2ApproveLauncherTx,
  buildLpAllocationSchedule,
  buildPositionDefinitions,
  computeInitializerSalt,
  computeLbpPoolId,
  deriveAuctionPricing,
  deriveConvexAuctionSteps,
  encodeAuctionParams,
  encodeAuctionSteps,
  encodeConfigData,
  encodeLpAllocationSchedule,
  encodePositionDefinitions,
  feeToTickSpacing,
  floorPriceToX96,
  getLauncherAddresses,
  predictAuctionAddress,
  requiredCurrencyRaised,
  type AuctionParameters,
  type MigratorParameters,
} from '@uniswap/liquidity-launcher-sdk'
import { afterAll, describe, expect, it } from 'bun:test'
import {
  type Address,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  getAddress,
  http,
  type WalletClient,
  zeroAddress,
} from 'viem'
import { base } from 'viem/chains'

import { CCA_BID_ABI, STATE_VIEW_GETSLOT0_ABI } from './abis'
import { type AnvilFork, forkTestsEnabled, FORK_RPC_BASE, startAnvilFork } from './anvil'
import { TEST_ERC20_CREATION_BYTECODE } from './testErc20.bytecode'

const RUN = forkTestsEnabled()

/** Pinned Base block — same fixture as the other fork suites; every launcher contract has code here. */
const FORK_BLOCK = 48_730_000n
const CHAIN_ID = 8453
/** Base v4 StateView (not carried by the launcher SDK's address map). */
const STATE_VIEW = getAddress('0xa3c0c9b65bad0b08107aa264b0f3db444b867a71')

// Impersonated EOAs: one creator, two bidders (funded with 1000 ETH each on the fork).
const CREATOR = getAddress('0x1111111111111111111111111111111111111111')
const BIDDER1 = getAddress('0x2222222222222222222222222222222222222222')
const BIDDER2 = getAddress('0x3333333333333333333333333333333333333333')

const liveForks = new Set<AnvilFork>()
async function newFork(port: number): Promise<AnvilFork> {
  const fork = await startAnvilFork({ forkUrl: FORK_RPC_BASE, forkBlock: FORK_BLOCK, port })
  liveForks.add(fork)
  return fork
}
async function teardown(fork: AnvilFork): Promise<void> {
  await fork.stop()
  liveForks.delete(fork)
}

interface Recorder<T> {
  events: FeedEvent<T>[]
  stop(): void
  waitFor(pred: (e: FeedEvent<T>) => boolean, timeoutMs?: number): Promise<FeedEvent<T>>
}
/** Buffer every event so `waitFor` matches past-or-future events (ticks fire during the mine awaits). */
function record<T>(store: FeedStore<T>): Recorder<T> {
  const events: FeedEvent<T>[] = []
  const waiters = new Set<{ pred: (e: FeedEvent<T>) => boolean; resolve: (e: FeedEvent<T>) => void; timer: ReturnType<typeof setTimeout> }>()
  const unsub = store.subscribe((e) => {
    events.push(e)
    for (const w of [...waiters]) if (w.pred(e)) { clearTimeout(w.timer); waiters.delete(w); w.resolve(e) }
  })
  return {
    events,
    stop: unsub,
    waitFor(pred, timeoutMs = 60_000) {
      const existing = events.find(pred)
      if (existing) return Promise.resolve(existing)
      return new Promise((resolve, reject) => {
        const w = { pred, resolve, timer: setTimeout(() => { waiters.delete(w); reject(new Error(`waitFor timed out after ${timeoutMs}ms`)) }, timeoutMs) }
        waiters.add(w)
      })
    },
  }
}

const isTick = <T>(e: FeedEvent<T>): e is Extract<FeedEvent<T>, { type: 'tick' }> => e.type === 'tick'

describe.skipIf(!RUN)('CCA launch lifecycle end-to-end (Base fork)', () => {
  it(
    'drives a real launch → bids → graduation → migration and asserts one continuous phase-tagged stream',
    async () => {
      const fork = await newFork(8671)
      try {
        const pub = createPublicClient({ chain: base, transport: http(fork.rpcUrl) })
        const mine = (n = 1): Promise<unknown> => fork.rpc('anvil_mine', [`0x${n.toString(16)}`])
        const bn = async (): Promise<bigint> => BigInt(await fork.rpc<string>('eth_blockNumber', []))
        const wallet = (a: Address): WalletClient => createWalletClient({ account: a, chain: base, transport: http(fork.rpcUrl) })
        const send = async (from: Address, to: Address, data: `0x${string}`, value = 0n): Promise<'success' | 'reverted'> => {
          const h = await wallet(from).sendTransaction({ account: from, chain: base, to, data, value, gas: 12_000_000n })
          await mine()
          return (await pub.getTransactionReceipt({ hash: h })).status
        }

        for (const a of [CREATOR, BIDDER1, BIDDER2]) {
          await fork.rpc('anvil_impersonateAccount', [a])
          await fork.rpc('anvil_setBalance', [a, '0x3635C9ADC5DEA00000']) // 1000 ETH
        }
        await fork.rpc('evm_setAutomine', [false])

        const addrs = getLauncherAddresses(CHAIN_ID)!
        const totalSupply = 1_000_000_000n * 10n ** 18n
        const reservedForLP = totalSupply / 2n
        const auctionSupply = totalSupply - reservedForLP

        // --- Deploy a plain ERC20 (deposit-path launch; avoids the superchain token factory, whose
        //     createToken reverts under a single-chain fork). The launched token is otherwise a normal
        //     18-decimal ERC20 the launcher pulls via Permit2. ---
        const deployData = (TEST_ERC20_CREATION_BYTECODE + encodeAbiParameters([{ type: 'uint256' }], [totalSupply]).slice(2)) as `0x${string}`
        const dh = await wallet(CREATOR).sendTransaction({ account: CREATOR, chain: base, data: deployData, gas: 2_000_000n })
        await mine()
        const token = getAddress((await pub.getTransactionReceipt({ hash: dh })).contractAddress as Address)

        // --- Small custom auction config (~40-block auction, NOT the 4h preset). ---
        const { floorPriceX96, tickSpacing: ccaTickSpacing } = deriveAuctionPricing(floorPriceToX96('0.0000000001', 18, 18))
        const required = requiredCurrencyRaised(floorPriceX96, auctionSupply)
        const startBlock = (await bn()) + 4n
        const endBlock = startBlock + 40n
        const migrationBlock = endBlock + 1n
        const auction: AuctionParameters = {
          currency: zeroAddress,
          tokensRecipient: CREATOR,
          fundsRecipient: getAddress('0x0000000000000000000000000000000000000001'), // sentinel → CCA rewrites to the strategy
          startBlock,
          endBlock,
          claimBlock: endBlock,
          tickSpacing: ccaTickSpacing,
          validationHook: zeroAddress,
          floorPrice: floorPriceX96,
          requiredCurrencyRaised: required,
          auctionStepsData: encodeAuctionSteps(deriveConvexAuctionSteps(startBlock, endBlock, { numSteps: 6 })),
        }
        const poolFee = 3000
        const poolTick = feeToTickSpacing(poolFee)
        const migrator: MigratorParameters = {
          token,
          currency: zeroAddress,
          migrationBlock,
          reservedTokenAmountForLP: reservedForLP,
          recipient: CREATOR,
          positionRecipient: CREATOR,
          poolParameters: { fee: poolFee, tickSpacing: poolTick, hook: zeroAddress },
          positionDefinitions: encodePositionDefinitions(buildPositionDefinitions('FULL_RANGE', [], poolTick)),
          lpAllocationSchedule: encodeLpAllocationSchedule(buildLpAllocationSchedule({ kind: 'single', percent: 100 })),
        }
        const userSalt = `0x${'00'.repeat(32)}` as `0x${string}`
        const configData = encodeConfigData(migrator, encodeAuctionParams(auction))
        const initializerSalt = computeInitializerSalt(CREATOR, userSalt, migrator)
        const auctionAddr = getAddress(
          await predictAuctionAddress(pub as never, { strategy: addrs.lbpStrategy, token, auctionSupply, auctionParams: encodeAuctionParams(auction), initializerSalt })
        )
        // Deterministic graduated-pool key: native (currency0) / token (currency1), hookless.
        const poolKey = { currency0: zeroAddress as Address, currency1: token, fee: poolFee, tickSpacing: poolTick, hooks: zeroAddress as Address }
        const poolId = computeLbpPoolId(zeroAddress, token, poolFee, poolTick, zeroAddress)

        // --- Launch: approvals (ERC20→Permit2, Permit2→launcher) then the launcher multicall. ---
        const txs = buildLaunchTransactions({
          liquidityLauncher: addrs.liquidityLauncher,
          token,
          salt: userSalt,
          acquire: { kind: 'deposit', amount: totalSupply },
          distributions: [{ strategy: addrs.lbpStrategy, amount: totalSupply, configData }],
          approvals: [buildErc20ApprovePermit2Tx(token, addrs.permit2), buildPermit2ApproveLauncherTx(addrs.permit2, token, addrs.liquidityLauncher)],
        })
        for (const t of txs) expect(await send(CREATOR, t.to, t.data, t.value)).toBe('success')
        expect((await pub.getBytecode({ address: auctionAddr }))?.length ?? 0).toBeGreaterThan(2)

        // --- Subscribe ONE launchAssetSource (price/phase lifecycle) + the dedicated bids source (the
        //     bid-log ticker; launchAssetSource carries no logFilters by design). Both share one engine
        //     heartbeat, so a bid's log and the clearing-price it moves land on the same block. ---
        const feed = createBlockFeed({ client: pub, chainId: CHAIN_ID, pollIntervalMs: 150 })
        const assetStore = feed.watch(
          launchAssetSource({ chainId: CHAIN_ID, auction: auctionAddr, tickDataLens: getAddress('0xc3C65F5453A3674aDb693cbdA3C842545cD30f53'), poolKey, endBlock }) as never
        ) as FeedStore<LaunchAssetState>
        const bidStore = feed.watch(ccaBidsSource({ auction: auctionAddr }) as never) as FeedStore<{ bidCount: number }>
        const asset = record(assetStore)
        const bids = record(bidStore)

        try {
          // The auction's checkpoint() reverts until startBlock; advance the chain so it becomes live
          // (the engine polls but never mines — anvil is on manual mining).
          while ((await bn()) < startBlock) await mine()

          // (1) Auction phase: a tick with a defined clearing price arrives.
          const firstAuction = await asset.waitFor((e) => isTick(e) && e.emission.value.phase === 'auction' && e.emission.value.priceX96 !== undefined)
          if (!isTick(firstAuction)) throw new Error('unreachable')
          expect(firstAuction.emission.value.priceX96! > 0n).toBe(true)

          // --- Bids: two early bids move the clearing price and emit BidSubmitted logs. ---
          const maxPrice = floorPriceX96 * 100_000n
          const bid = async (who: Address, amount: bigint): Promise<`0x${string}`> => {
            const h = await wallet(who).writeContract({ account: who, chain: base, address: auctionAddr, abi: CCA_BID_ABI, functionName: 'submitBid', args: [maxPrice, amount, who, '0x'], value: amount, gas: 4_000_000n })
            await mine()
            expect((await pub.getTransactionReceipt({ hash: h })).status).toBe('success')
            return h
          }
          const bidHash1 = await bid(BIDDER1, 2n * 10n ** 18n)
          const bidHash2 = await bid(BIDDER2, 2n * 10n ** 18n)

          // Bid logs surface on the bids source, deduped by (txHash, logIndex).
          const bidLog1 = await bids.waitFor((e) => e.type === 'log' && e.log.txHash.toLowerCase() === bidHash1.toLowerCase())
          const bidLog2 = await bids.waitFor((e) => e.type === 'log' && e.log.txHash.toLowerCase() === bidHash2.toLowerCase())
          if (bidLog1.type !== 'log' || bidLog2.type !== 'log') throw new Error('unreachable')
          expect(bidLog1.log.eventName).toBe('BidSubmitted')
          expect(bidLog2.log.eventName).toBe('BidSubmitted')

          // Engine ordering: within the bids stream, each bid `log` is dispatched BEFORE the `tick` of
          // the same block (deriveAndPublish order: logs → tick).
          for (const bl of [bidLog1, bidLog2]) {
            if (bl.type !== 'log') continue
            const logIdx = bids.events.indexOf(bl)
            const tickIdx = bids.events.findIndex((e, i) => i > logIdx && isTick(e) && e.emission.identity.blockNumber >= bl.log.blockNumber)
            expect(tickIdx).toBeGreaterThan(logIdx)
          }

          // The clearing price actually moved as bids landed.
          const auctionPrices = asset.events.filter(isTick).filter((e) => e.emission.value.phase === 'auction').map((e) => e.emission.value.priceX96)
          expect(new Set(auctionPrices.map(String)).size).toBeGreaterThan(1)

          // --- A late bid near full emission graduates the auction. ---
          while ((await bn()) < endBlock - 3n) await mine()
          const lateHash = await wallet(BIDDER1).writeContract({ account: BIDDER1, chain: base, address: auctionAddr, abi: CCA_BID_ABI, functionName: 'submitBid', args: [maxPrice, 5n * 10n ** 18n, BIDDER1, '0x'], value: 5n * 10n ** 18n, gas: 4_000_000n })
          await mine()
          expect((await pub.getTransactionReceipt({ hash: lateHash })).status).toBe('success')

          // (2) Mine past endBlock; a finalizing checkpoint() tx persists the cleared totals.
          while ((await bn()) < endBlock) await mine()
          await send(CREATOR, auctionAddr, '0xc2c4c5c1') // checkpoint()
          expect(await pub.readContract({ address: auctionAddr, abi: CCA_BID_ABI, functionName: 'isGraduated' })).toBe(true)
          const finalClearing = (await pub.simulateContract({ address: auctionAddr, abi: CCA_BID_ABI, functionName: 'checkpoint' })).result[0] as bigint

          // (3) Migrate (seeds the v4 pool). Then the NEXT tick that can read the pool carries
          //     phase:'graduated' AND poolSqrtPriceX96 in the SAME emission — the no-gap guarantee.
          while ((await bn()) <= migrationBlock) await mine()
          const migrateTx = buildMigrateTx({ lbpStrategyAddress: addrs.lbpStrategy, auctionAddress: auctionAddr })
          expect(await send(CREATOR, migrateTx.to, migrateTx.data, migrateTx.value)).toBe('success')

          const gradTick = await asset.waitFor((e) => isTick(e) && e.emission.value.phase === 'graduated')
          if (!isTick(gradTick)) throw new Error('unreachable')
          expect(gradTick.emission.value.phase).toBe('graduated')
          expect(gradTick.emission.value.poolSqrtPriceX96).toBeDefined()
          expect(gradTick.emission.value.poolSqrtPriceX96! > 0n).toBe(true)
          expect(gradTick.emission.value.priceX96).toBeDefined()

          // The lifecycle transitioned auction → graduated within the value: an earlier auction-phase
          // tick preceded the graduated tick on the same stream (phase lives in `value`, not as a
          // separate FeedEvent).
          const firstAuctionTick = asset.events.filter(isTick).find((e) => e.emission.value.phase === 'auction')
          expect(firstAuctionTick).toBeDefined()

          // No-gap: the poolSqrtPriceX96 in the graduation emission matches a direct StateView read at
          // that same block (the source read the freshly-initialized pool atomically in the tick batch).
          const slot0 = (await pub.readContract({ address: STATE_VIEW, abi: STATE_VIEW_GETSLOT0_ABI, functionName: 'getSlot0', args: [poolId], blockNumber: gradTick.emission.identity.blockNumber })) as readonly [bigint, ...unknown[]]
          expect(gradTick.emission.value.poolSqrtPriceX96).toBe(slot0[0])

          // (4) Post-graduation pool price is consistent with the auction's final clearing price (±10%).
          const poolPrice = gradTick.emission.value.priceX96!
          const diff = poolPrice > finalClearing ? poolPrice - finalClearing : finalClearing - poolPrice
          expect(Number(diff) / Number(finalClearing)).toBeLessThan(0.1)
        } finally {
          asset.stop()
          bids.stop()
          feed.stop()
        }
      } finally {
        await teardown(fork)
      }
    },
    240_000
  )
})

afterAll(async () => {
  for (const fork of liveForks) {
    try {
      await fork.stop()
    } catch {
      // best-effort reap
    }
  }
  liveForks.clear()
})
