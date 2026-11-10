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
 * (0x0000000000890d0ee01040c8855A0423e37c757B, the permissionless-market-key 2026-10-22
 * deployment) on 2026-10-22.
 */
const ONCHAIN_VECTORS: ReadonlyArray<[Address, bigint, Address]> = [
  ['0x0000000000000000000000000000000000000001', 0n, '0x7A564a52742D07329336B679C71FE04ce62150FF'],
  ['0x0000000000000000000000000000000000000001', 1n, '0xC4D35B046b42561982f6A6D8De0D708E4D5FB6eb'],
  ['0x0000000000000000000000000000000000000001', 42n, '0x8Ffcc991029f9299938bc58b616764c2FBF6C726'],
  ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 0n, '0x9fEE2C93041C4b6AfD81DbCC091611BC5c06cDd8'],
  ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 1n, '0x5ce7701092BFB0CEf237A8Aa77E86105Ea0B4a74'],
  ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 42n, '0x4a31046d0390793F7EBF5100B98cF1ea2a3123E4'],
  ['0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', 0n, '0xd058a25Fa875440FBe85835dB1680043983F7A3F'],
  ['0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', 1n, '0x55A5C9683C54F40d059CC6C478BFe25F6197347E'],
  ['0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', 42n, '0xb02fD7D36D315821dC1EA2b2e2C9A7E57b94Bb47'],
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
      '0x8Ffcc991029f9299938bc58b616764c2FBF6C726'
    )
  })

  test('getMarginAccountAddress defaults subId to 0', () => {
    expect(getMarginAccountAddress(1, '0x0000000000000000000000000000000000000001')).toBe(
      '0x7A564a52742D07329336B679C71FE04ce62150FF'
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
