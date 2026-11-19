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
 * Ground truth: `MarginRouter.accountOf(owner, subId)` read from the live router
 * (0x000000000e69bAAd36D7569eA3Bd9cd07e3AA084, the 2026-11-19 CreateX deployment) on mainnet and
 * on Base on 2026-11-19, with identical results: the router and the implementation have the same
 * address on every chain, so an owner's accounts do too.
 */
const ONCHAIN_VECTORS: ReadonlyArray<[Address, bigint, Address]> = [
  ['0x0000000000000000000000000000000000000001', 0n, '0x9837854643Dc484ab70Bfcb38303C37C32b8Ba60'],
  ['0x0000000000000000000000000000000000000001', 1n, '0xf1CB2E26a2252A11C523a2bBFdC58163ed032FFd'],
  ['0x0000000000000000000000000000000000000001', 42n, '0xE67d94c1bd38b94699432D7b20825AD416Dc118b'],
  ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 0n, '0x04D064Ef7fbdDDC4377B5D8e9f9B24EA20fDB9D4'],
  ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 1n, '0x95b70Fb0f92B44917119609e1cAff3325AF755cd'],
  ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 42n, '0x55580B30B80db8fab31D1ef776b6f55F6f1c9353'],
  ['0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', 0n, '0x20B7857744837d0645e00A92D7Db8F32a99B5A5e'],
  ['0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', 1n, '0xEF5B0F0C3Bd5Eee9Ee06d93edF49441c71DfD8d2'],
  ['0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', 42n, '0x1E5FF97de7D18661121c5822E8C71896c878A4c2'],
]

describe('predictMarginAccountAddress', () => {
  test('matches the live router accountOf for every vector', () => {
    for (const [owner, subId, expected] of ONCHAIN_VECTORS) {
      expect(predictMarginAccountAddress({ owner, subId, marginRouter: ROUTER, accountImplementation: IMPL })).toBe(
        expected
      )
    }
  })

  test('getMarginAccountAddress resolves the mainnet deployment', () => {
    expect(getMarginAccountAddress(1, '0x0000000000000000000000000000000000000001', 42n)).toBe(
      '0xE67d94c1bd38b94699432D7b20825AD416Dc118b'
    )
  })

  test('getMarginAccountAddress defaults subId to 0', () => {
    expect(getMarginAccountAddress(1, '0x0000000000000000000000000000000000000001')).toBe(
      '0x9837854643Dc484ab70Bfcb38303C37C32b8Ba60'
    )
  })

  test('getMarginAccountAddress gives the same account on every deployed chain', () => {
    for (const chainId of [SupportedChainId.BASE, SupportedChainId.ARBITRUM_ONE, SupportedChainId.ROBINHOOD_CHAIN]) {
      expect(getMarginAccountAddress(chainId, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 1n)).toBe(
        '0x95b70Fb0f92B44917119609e1cAff3325AF755cd'
      )
    }
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
