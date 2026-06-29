import { describe, expect, it } from 'bun:test'
import { decodeFunctionData, getAddress, slice, zeroAddress } from 'viem'

import { LIQUIDITY_LAUNCHER_ABI } from './abis'
import { buildLaunchTransactions } from './build'
import type { Distribution } from './types'

const LAUNCHER = getAddress('0x00004c4ccc709Ef590F7C81102C0689F0263D4e9')
const TOKEN = getAddress('0x15d0e0c55a3e7ee67152ad7e89acf164253ff68d')
const SALT = `0x${'00'.repeat(32)}` as const

const distribution: Distribution = {
  strategy: getAddress('0x824a3ecde463dd45cc156b64cefa132596c9a000'),
  amount: 100000000000000n,
  configData: '0x',
}

// Function selectors of the launcher subcalls.
const DEPOSIT_SELECTOR = '0x44599bc5'
const DISTRIBUTE_SELECTOR = '0xb6982b48'

describe('buildLaunchTransactions', () => {
  it('existing-token launch = approvals + one multicall(deposit, distribute) to the launcher', () => {
    const approval = { to: TOKEN, data: '0xabcdef' as const, value: 0n }
    const txs = buildLaunchTransactions({
      liquidityLauncher: LAUNCHER,
      token: TOKEN,
      salt: SALT,
      acquire: { kind: 'deposit', amount: 100000000000000n },
      distributions: [distribution],
      approvals: [approval],
    })

    expect(txs).toHaveLength(2)
    expect(txs[0]).toEqual(approval)

    const multicall = txs[1]!
    expect(multicall.to).toBe(LAUNCHER)
    expect(multicall.value).toBe(0n)

    const { functionName, args } = decodeFunctionData({ abi: LIQUIDITY_LAUNCHER_ABI, data: multicall.data })
    expect(functionName).toBe('multicall')
    const calls = args[0] as readonly `0x${string}`[]
    expect(slice(calls[0]!, 0, 4)).toBe(DEPOSIT_SELECTOR)
    expect(slice(calls[1]!, 0, 4)).toBe(DISTRIBUTE_SELECTOR)
  })

  it('new-token launch = a single multicall, no approvals', () => {
    const txs = buildLaunchTransactions({
      liquidityLauncher: LAUNCHER,
      token: TOKEN,
      salt: SALT,
      acquire: {
        kind: 'create',
        args: {
          factory: zeroAddress,
          name: 'Test',
          symbol: 'TST',
          decimals: 18,
          initialSupply: 1_000_000n,
          recipient: LAUNCHER,
          tokenData: '0x',
        },
      },
      distributions: [distribution],
    })

    expect(txs).toHaveLength(1)
    const { functionName, args } = decodeFunctionData({ abi: LIQUIDITY_LAUNCHER_ABI, data: txs[0]!.data })
    expect(functionName).toBe('multicall')
    expect((args[0] as readonly unknown[]).length).toBe(2)
  })
})
