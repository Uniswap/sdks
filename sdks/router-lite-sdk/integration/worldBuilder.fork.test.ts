import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { decodeEventLog, getAddress, parseEther, zeroAddress, type Address, type Hex } from 'viem'

import { ERC20_ABI, V2_PAIR_ABI, V3_POOL_ABI, V4_POOL_MANAGER_ABI, V4_QUOTER_ABI } from './abis'
import { FORK_BLOCK, forkTestsEnabled, startAnvilFork, type AnvilClient } from './anvil'
import { createWorld, poolIdOf, type World } from './worldBuilder'

// ---------------------------------------------------------------------------
// Self-test for the harness itself.
//
// Nothing here touches the SDK: it proves that `createWorld` really does put
// pools on the fork, that their state reads back as the numbers we asked for,
// and that `expectedV2Out` is arithmetic we can trust as ground truth. Every
// later fork suite assumes all three.
// ---------------------------------------------------------------------------

const RUN = forkTestsEnabled()

/** Reserves chosen so the 0.30% fee and the constant-product rounding are both visible. */
const RESERVE_A = 1_000_000n * 10n ** 18n
const RESERVE_B = 4_000_000n * 10n ** 18n

const TRADER: Address = '0x00000000000000000000000000000000000d0b1e'

describe.skipIf(!RUN)('worldBuilder (mainnet fork)', () => {
  let anvil: AnvilClient
  let world: World
  let tokenA: Address
  let tokenB: Address

  beforeAll(async () => {
    anvil = await startAnvilFork({ port: 8645 })
    world = createWorld(anvil)
    tokenA = await world.deployToken('Alpha')
    tokenB = await world.deployToken('Bravo')
  }, 300_000)

  afterAll(async () => {
    await anvil?.stop()
  })

  it('forks mainnet at the pinned block with v2/v3/v4 all deployed', async () => {
    expect(await anvil.publicClient.getChainId()).toBe(1)
    // The fork's base is FORK_BLOCK; the head has advanced by whatever `beforeAll` mined on top.
    expect(await anvil.publicClient.getBlockNumber()).toBeGreaterThanOrEqual(FORK_BLOCK)
    expect((await anvil.publicClient.getBlock({ blockNumber: FORK_BLOCK })).number).toBe(FORK_BLOCK)
    for (const address of [world.addresses.v2Factory, world.addresses.v3Factory, world.addresses.v4PoolManager]) {
      expect((await anvil.publicClient.getCode({ address }))?.length ?? 0).toBeGreaterThan(2)
    }
  }, 120_000)

  it('deployToken mints a real ERC20; the fee-on-transfer variant taxes transfers', async () => {
    expect(await world.read({ address: tokenA, abi: ERC20_ABI, functionName: 'symbol' })).toBe('ALPHA')
    expect(tokenA).not.toBe(tokenB)

    const fot = await world.deployToken('Taxed', { feeOnTransferBps: 500 })
    await world.supply(fot, world.deployer, 1_000n * 10n ** 18n)
    await world.write({
      address: fot,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [TRADER, 1_000n * 10n ** 18n],
    })
    // 5% skimmed on the way out: the recipient never sees the amount the sender named.
    const received = await world.read<bigint>({
      address: fot,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [TRADER],
    })
    expect(received).toBe(950n * 10n ** 18n)
  }, 120_000)

  it('createV2Pool seeds the exact reserves it was asked for, and expectedV2Out matches the manual formula', async () => {
    const pool = await world.createV2Pool(tokenA, tokenB, RESERVE_A, RESERVE_B)
    if (pool.protocol !== 'v2') throw new Error('unreachable')

    const [reserve0, reserve1] = await world.read<readonly [bigint, bigint, number]>({
      address: pool.address,
      abi: V2_PAIR_ABI,
      functionName: 'getReserves',
    })
    const [expected0, expected1] =
      getAddress(pool.token0) === getAddress(tokenA) ? [RESERVE_A, RESERVE_B] : [RESERVE_B, RESERVE_A]
    expect(reserve0).toBe(expected0)
    expect(reserve1).toBe(expected1)

    // Ground truth, recomputed inline (NOT via the harness helper) from the reserves just read.
    const amountIn = 1_000n * 10n ** 18n
    const inWithFee = amountIn * 997n
    const manual0For1 = (inWithFee * reserve1) / (reserve0 * 1000n + inWithFee)
    const manual1For0 = (inWithFee * reserve0) / (reserve1 * 1000n + inWithFee)

    expect(await world.expectedV2Out(amountIn, pool)).toBe(manual0For1)
    expect(await world.expectedV2Out(amountIn, pool, pool.token0)).toBe(manual0For1)
    expect(await world.expectedV2Out(amountIn, pool, pool.token1)).toBe(manual1For0)
    expect(manual0For1).toBeGreaterThan(0n)
    expect(manual0For1).not.toBe(manual1For0)
  }, 180_000)

  it('createV3Pool initializes at the requested price and lands real in-range liquidity', async () => {
    const liquidity = 10n ** 21n
    const pool = await world.createV3Pool(tokenA, tokenB, 3000, { liquidity, priceApprox: 4 })
    if (pool.protocol !== 'v3') throw new Error('unreachable')
    expect(pool.fee).toBe(3000)

    const [sqrtPriceX96] = await world.read<readonly [bigint, number, ...unknown[]]>({
      address: pool.address,
      abi: V3_POOL_ABI,
      functionName: 'slot0',
    })
    // priceApprox is quoted a-per-b before sorting, so flip it when tokenA sorted second.
    const price1per0 = getAddress(pool.token0) === getAddress(tokenA) ? 4 : 1 / 4
    const expectedSqrt = world.encodeSqrtPriceX96(price1per0)
    const drift = sqrtPriceX96 > expectedSqrt ? sqrtPriceX96 - expectedSqrt : expectedSqrt - sqrtPriceX96
    expect(drift).toBe(0n)

    const inRange = await world.read<bigint>({ address: pool.address, abi: V3_POOL_ABI, functionName: 'liquidity' })
    expect(inRange).toBeGreaterThanOrEqual(liquidity)
  }, 240_000)

  it('createV4Pool emits a retrievable Initialize log and funds the pool through the real PositionManager', async () => {
    const { ref, receipt } = await world.createV4Pool(tokenA, tokenB, {
      fee: 3000,
      tickSpacing: 60,
      liquidity: 10n ** 21n,
    })
    if (ref.protocol !== 'v4') throw new Error('unreachable')
    expect(ref.poolKey.hooks).toBe(zeroAddress)
    expect(ref.poolId).toBe(poolIdOf(ref.poolKey))

    // The receipt's Initialize log is the one discovery has to find — assert it is on the fork,
    // reachable by an ordinary eth_getLogs over fork-local blocks, and decodes to this pool.
    const logs = await anvil.publicClient.getLogs({
      address: world.addresses.v4PoolManager,
      fromBlock: FORK_BLOCK + 1n,
      toBlock: 'latest',
    })
    const initializes = logs
      .filter((log) => log.blockNumber === receipt.blockNumber)
      .map((log) => {
        try {
          return decodeEventLog({ abi: V4_POOL_MANAGER_ABI, data: log.data, topics: log.topics })
        } catch {
          return undefined
        }
      })
      .filter((decoded): decoded is NonNullable<typeof decoded> => decoded?.eventName === 'Initialize')

    expect(initializes.length).toBe(1)
    const args = initializes[0]!.args as unknown as { id: Hex; fee: number; tickSpacing: number; hooks: Address }
    expect(args.id).toBe(ref.poolId)
    expect(args.fee).toBe(3000)
    expect(args.tickSpacing).toBe(60)

    // Liquidity landed: the PoolManager now custodies both currencies.
    for (const currency of [ref.poolKey.currency0, ref.poolKey.currency1]) {
      const held = await world.read<bigint>({
        address: currency,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [world.addresses.v4PoolManager],
      })
      expect(held).toBeGreaterThan(0n)
    }
  }, 300_000)

  it('deployHook installs each behavior at an address whose low bits encode its permissions', async () => {
    const flags = (hook: Address): number => Number(BigInt(hook) & 0x3fffn)
    const BEFORE_SWAP = 1 << 7
    const AFTER_SWAP = 1 << 6
    const AFTER_SWAP_RETURNS_DELTA = 1 << 2

    const none = await world.deployHook('none')
    const skim = await world.deployHook('skim-fee-bps-30')
    const gate = await world.deployHook('revert-if-sender-not')
    const blocked = await world.deployHook('revert-on-swap')

    expect(flags(none)).toBe(BEFORE_SWAP)
    expect(flags(blocked)).toBe(BEFORE_SWAP)
    expect(flags(gate)).toBe(BEFORE_SWAP)
    expect(flags(skim)).toBe(AFTER_SWAP | AFTER_SWAP_RETURNS_DELTA)

    for (const hook of [none, skim, gate, blocked]) {
      expect((await anvil.publicClient.getCode({ address: hook }))?.length ?? 0).toBeGreaterThan(2)
    }

    // setCode skips constructors, so the gate's allowed sender comes from a storage write.
    const allowed = await world.read<Address>({
      address: gate,
      abi: [
        {
          type: 'function',
          name: 'allowedSender',
          inputs: [],
          outputs: [{ type: 'address' }],
          stateMutability: 'view',
        },
      ],
      functionName: 'allowedSender',
    })
    expect(getAddress(allowed)).toBe(world.addresses.universalRouter)
  }, 120_000)

  it('a hooked v4 pool initializes against a permission-encoding hook address', async () => {
    const hook = await world.deployHook('skim-fee-bps-30')
    const { ref, receipt } = await world.createV4Pool(tokenA, tokenB, {
      fee: 3000,
      tickSpacing: 60,
      hooks: hook,
      liquidity: 10n ** 21n,
    })
    if (ref.protocol !== 'v4') throw new Error('unreachable')

    expect(getAddress(ref.poolKey.hooks)).toBe(getAddress(hook))
    // Same currencies and fee as the hookless pool, yet a different pool id: the hook is part of
    // the key, which is exactly why discovery has to enumerate hooks rather than assume them.
    expect(ref.poolId).not.toBe(poolIdOf({ ...ref.poolKey, hooks: zeroAddress }))
    expect(receipt.status).toBe('success')
  }, 300_000)

  it('the installed hooks actually run inside the PoolManager: one skims 0.30%, one blocks the swap', async () => {
    // Quoting drives a real `swap` inside the PoolManager's unlock, so hook code executes. Same
    // currencies, same fee tier, same liquidity in all three pools — only the hook differs, so any
    // difference in the quote is the hook's doing.
    const shape = { fee: 500, tickSpacing: 10, liquidity: 10n ** 22n } as const
    const plain = await world.createV4Pool(tokenA, tokenB, shape)
    const skimmed = await world.createV4Pool(tokenA, tokenB, {
      ...shape,
      hooks: await world.deployHook('skim-fee-bps-30'),
    })
    const blocked = await world.createV4Pool(tokenA, tokenB, {
      ...shape,
      hooks: await world.deployHook('revert-on-swap'),
    })

    const quote = async (ref: typeof plain.ref): Promise<bigint> => {
      if (ref.protocol !== 'v4') throw new Error('unreachable')
      const { result } = await anvil.publicClient.simulateContract({
        address: world.addresses.v4Quoter,
        abi: V4_QUOTER_ABI,
        functionName: 'quoteExactInputSingle',
        args: [{ poolKey: ref.poolKey, zeroForOne: true, exactAmount: 10n ** 18n, hookData: '0x' }],
        account: world.deployer,
      })
      return (result as readonly [bigint, bigint])[0]
    }

    const baseline = await quote(plain.ref)
    expect(baseline).toBeGreaterThan(0n)

    // afterSwap + afterSwapReturnsDelta: the hook takes 30bps of the output for itself.
    const afterSkim = await quote(skimmed.ref)
    expect(afterSkim).toBe(baseline - (baseline * 30n) / 10_000n)

    // beforeSwap reverting makes the pool discoverable but unroutable — the 19C adversarial case.
    await expect(quote(blocked.ref)).rejects.toThrow()

    // The sender gate reads slot 0, so the SAME pool flips between blocked and open depending on
    // who the PoolManager's caller is. Default (Universal Router) blocks the Quoter...
    const gated = await world.createV4Pool(tokenA, tokenB, {
      ...shape,
      hooks: await world.deployHook('revert-if-sender-not'),
    })
    await expect(quote(gated.ref)).rejects.toThrow()
    // ...and re-pointing it at the Quoter lets the identical call through.
    await world.deployHook('revert-if-sender-not', { allowedSender: world.addresses.v4Quoter })
    expect(await quote(gated.ref)).toBe(baseline)
  }, 600_000)

  it('fundTrader and approvePermit2 leave the trader able to spend through the router', async () => {
    await world.fundTrader(TRADER, { eth: parseEther('10'), tokens: [[tokenA, 5_000n * 10n ** 18n]] })
    expect(await anvil.publicClient.getBalance({ address: TRADER })).toBe(parseEther('10'))
    expect(
      await world.read<bigint>({ address: tokenA, abi: ERC20_ABI, functionName: 'balanceOf', args: [TRADER] })
    ).toBe(5_000n * 10n ** 18n)

    await world.approvePermit2(TRADER, tokenA, { toRouter: true })
    const erc20Allowance = await world.read<bigint>({
      address: tokenA,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [TRADER, world.addresses.permit2],
    })
    expect(erc20Allowance).toBeGreaterThan(0n)

    const [permit2Amount] = await world.read<readonly [bigint, number, number]>({
      address: world.addresses.permit2,
      abi: [
        {
          type: 'function',
          name: 'allowance',
          inputs: [{ type: 'address' }, { type: 'address' }, { type: 'address' }],
          outputs: [{ type: 'uint160' }, { type: 'uint48' }, { type: 'uint48' }],
          stateMutability: 'view',
        },
      ],
      functionName: 'allowance',
      args: [TRADER, tokenA, world.addresses.universalRouter],
    })
    expect(permit2Amount).toBeGreaterThan(0n)
  }, 180_000)
})
