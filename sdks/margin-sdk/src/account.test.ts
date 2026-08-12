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
 * (0x000000000075e82F7B7DdC5DD1B4984b560eF5D4) on 2026-08-12.
 */
const ONCHAIN_VECTORS: ReadonlyArray<[Address, bigint, Address]> = [
  ['0x0000000000000000000000000000000000000001', 0n, '0xD7C02b7C37Ee30Ff5e9aDc6C5ea783f444bBcB73'],
  ['0x0000000000000000000000000000000000000001', 1n, '0x1eF11dc8FB7d38Bfa5f6A8b26F4f8986dadDFd0D'],
  ['0x0000000000000000000000000000000000000001', 42n, '0xee498f09e825f23ADE58C898677166Adc3bf2160'],
  ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 0n, '0x40CeAfE48c1b0534948f14bbDCD4AB1CDA38cA7a'],
  ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 1n, '0x41e01B815A41556d568641E61e59E9Fdfbf85126'],
  ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 42n, '0xa00De5FDA56dEcd6044E32B939f0041f01018ABa'],
  ['0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', 0n, '0x527dE4A75c55AaFEDe1C5730b288929003131F93'],
  ['0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', 1n, '0x99E6a6C8106Bbe459211D4D348581B7FD6A65126'],
  ['0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', 42n, '0xBfd53528aF1eb006e70D25f478d73A9436C08035'],
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
      '0xee498f09e825f23ADE58C898677166Adc3bf2160'
    )
  })

  test('getMarginAccountAddress defaults subId to 0', () => {
    expect(getMarginAccountAddress(1, '0x0000000000000000000000000000000000000001')).toBe(
      '0xD7C02b7C37Ee30Ff5e9aDc6C5ea783f444bBcB73'
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
