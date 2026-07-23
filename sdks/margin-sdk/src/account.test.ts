import { describe, expect, test } from 'bun:test'
import { type Address, keccak256 } from 'viem'

import {
  cloneInitCode,
  getMarginAccountAddress,
  marginAccountArgs,
  marginAccountSalt,
  predictMarginAccountAddress,
} from './account'
import { MARGIN_ADDRESSES } from './addresses'
import { SupportedChainId } from './chains'
import { MarginSdkError } from './errors'

const MAINNET = MARGIN_ADDRESSES[SupportedChainId.MAINNET]!
const ROUTER = MAINNET.marginRouter
const IMPL = MAINNET.marginAccountImplementation

/**
 * Ground truth: `MarginRouter.accountOf(owner, subId)` read from the live mainnet router
 * (0x0000000004BBC92D0657580CAe35aEBF054E5CDC) on 2026-07-23.
 */
const ONCHAIN_VECTORS: ReadonlyArray<[Address, bigint, Address]> = [
  ['0x0000000000000000000000000000000000000001', 0n, '0x64487fb85302b5A2f38EF91144155986D331D2Fe'],
  ['0x0000000000000000000000000000000000000001', 1n, '0x823C9d821fEfF5cB48e29356047efaeE01E8f52C'],
  ['0x0000000000000000000000000000000000000001', 42n, '0x9E70eB12fEdf4854B0E5E76463b16b44577e5e30'],
  ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 0n, '0x9DEC18Fa954B9336421acBF8c6bc1E01434955Ed'],
  ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 1n, '0xf11Fb98E85EEF933C7467cDDD875b5841426799d'],
  ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 42n, '0x506Ec41dF068255352B94C63A120d35aFfF37966'],
  ['0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', 0n, '0xdC5dD9910A8964bA49a0971f4D70a213Fb94ada6'],
  ['0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', 1n, '0x175A5D0E0de01718240eCBF8d0Bf9696192e9A2e'],
  ['0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', 42n, '0xE9a97Ebfa7E0184CF4373E0Bc75cAD00E48fe86c'],
]

describe('predictMarginAccountAddress', () => {
  test('matches the live mainnet router accountOf for every vector', () => {
    for (const [owner, subId, expected] of ONCHAIN_VECTORS) {
      expect(predictMarginAccountAddress({ owner, subId, marginRouter: ROUTER, accountImplementation: IMPL })).toBe(
        expected
      )
    }
  })

  test('getMarginAccountAddress resolves the mainnet deployment', () => {
    expect(getMarginAccountAddress(1, '0x0000000000000000000000000000000000000001', 42n)).toBe(
      '0x9E70eB12fEdf4854B0E5E76463b16b44577e5e30'
    )
  })

  test('getMarginAccountAddress defaults subId to 0', () => {
    expect(getMarginAccountAddress(1, '0x0000000000000000000000000000000000000001')).toBe(
      '0x64487fb85302b5A2f38EF91144155986D331D2Fe'
    )
  })

  test('getMarginAccountAddress throws UNSUPPORTED_CHAIN off-deployment', () => {
    expect(() => getMarginAccountAddress(84532, '0x0000000000000000000000000000000000000001')).toThrow(MarginSdkError)
  })

  test('addresses are distinct per owner and per subId', () => {
    const a = predictMarginAccountAddress({
      owner: '0x0000000000000000000000000000000000000001',
      subId: 0n,
      marginRouter: ROUTER,
      accountImplementation: IMPL,
    })
    const b = predictMarginAccountAddress({
      owner: '0x0000000000000000000000000000000000000001',
      subId: 1n,
      marginRouter: ROUTER,
      accountImplementation: IMPL,
    })
    const c = predictMarginAccountAddress({
      owner: '0x0000000000000000000000000000000000000002',
      subId: 0n,
      marginRouter: ROUTER,
      accountImplementation: IMPL,
    })
    expect(new Set([a, b, c]).size).toBe(3)
  })
})

describe('CWIA building blocks', () => {
  const OWNER: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

  test('args are abi.encode(owner, manager)', () => {
    const args = marginAccountArgs(OWNER, ROUTER)
    expect(args).toBe(
      `0x${'0'.repeat(24)}${OWNER.slice(2).toLowerCase()}${'0'.repeat(24)}${ROUTER.slice(2).toLowerCase()}`
    )
  })

  test('salt is keccak256(abi.encode(owner, manager, subId))', () => {
    const salt = marginAccountSalt(OWNER, ROUTER, 7n)
    expect(salt).toBe(
      keccak256(
        `0x${'0'.repeat(24)}${OWNER.slice(2).toLowerCase()}${'0'.repeat(24)}${ROUTER.slice(
          2
        ).toLowerCase()}${'0'.repeat(63)}7`
      )
    )
  })

  test('initcode is the Solady CWIA layout with a 0x2d+args runtime length', () => {
    const args = marginAccountArgs(OWNER, ROUTER)
    const initCode = cloneInitCode(IMPL, args)
    // 20-byte prologue + 20-byte implementation + 15-byte suffix + 64-byte args
    expect((initCode.length - 2) / 2).toBe(20 + 20 + 15 + 64)
    // runtime length = 0x2d + 64 = 0x6d, PUSH2-encoded after the 0x61 opcode
    expect(initCode.slice(0, 8)).toBe('0x61006d')
    expect(initCode.toLowerCase()).toContain(IMPL.slice(2).toLowerCase())
    expect(initCode.toLowerCase().endsWith(args.slice(2).toLowerCase())).toBe(true)
  })

  test('rejects oversized immutable args', () => {
    expect(() => cloneInitCode(IMPL, `0x${'00'.repeat(0xffd3)}`)).toThrow(MarginSdkError)
  })
})
