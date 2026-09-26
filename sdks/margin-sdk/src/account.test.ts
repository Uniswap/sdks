import { describe, expect, test } from 'bun:test'
import { type Address, keccak256 } from 'viem'

import {
  cloneInitCode,
  getMarginAccountAddress,
  marginAccountArgs,
  marginAccountSalt,
  predictMarginAccountAddress,
} from './account.js'
import { MARGIN_ADDRESSES } from './addresses.js'
import { SupportedChainId } from './chains.js'
import { MarginSdkError } from './errors.js'

const MAINNET = MARGIN_ADDRESSES[SupportedChainId.MAINNET]!
const ROUTER = MAINNET.marginRouter
const IMPL = MAINNET.marginAccountImplementation

/**
 * Ground truth: `MarginRouter.accountOf(owner, subId)` read from the live mainnet router
 * (0x0000000000F57fCd0d5a78a19907240F1169EDEC, the post-audit 2026-08-26 deployment) on 2026-08-27.
 */
const ONCHAIN_VECTORS: ReadonlyArray<[Address, bigint, Address]> = [
  ['0x0000000000000000000000000000000000000001', 0n, '0x8f699e6b373Bad167Eb88aF2d9dFb780C180f87A'],
  ['0x0000000000000000000000000000000000000001', 1n, '0x91669Fd56c4bedBE2006f0D08d200A0546E46a05'],
  ['0x0000000000000000000000000000000000000001', 42n, '0xb5C8b83b8CeDd38E92310880B9Dd4A21DBC850B4'],
  ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 0n, '0xb8E365666bB11C0FEA6797d7C1F5c166D8674b05'],
  ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 1n, '0xFD54E02B02BDe6206033dDD9FCb1551DCdC26a0c'],
  ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 42n, '0x063Ecf550De77148ba3F0c55973CDab14F75843e'],
  ['0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', 0n, '0x23BA58C0F905A10b14DD70d06C2BCA5013Da5f65'],
  ['0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', 1n, '0x22636849d77577f4AdC0111459f860B7837A15AF'],
  ['0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', 42n, '0xF5077CfaE124d89dc1909245b6443bA0DCC8c725'],
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
      '0xb5C8b83b8CeDd38E92310880B9Dd4A21DBC850B4'
    )
  })

  test('getMarginAccountAddress defaults subId to 0', () => {
    expect(getMarginAccountAddress(1, '0x0000000000000000000000000000000000000001')).toBe(
      '0x8f699e6b373Bad167Eb88aF2d9dFb780C180f87A'
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
