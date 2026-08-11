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
 * (0x00000000000Dc78b00e36d3a7997Bd9c4cd9F1f0) on 2026-08-11.
 */
const ONCHAIN_VECTORS: ReadonlyArray<[Address, bigint, Address]> = [
  ['0x0000000000000000000000000000000000000001', 0n, '0x9e57f7E08A76fD43fF250511f720F711AC5D79F7'],
  ['0x0000000000000000000000000000000000000001', 1n, '0xB3e67Ef478dDc10FbcdBf10e1023a4a571b10A38'],
  ['0x0000000000000000000000000000000000000001', 42n, '0x85CbB1CF9ba99d04B6493C95487ec3b0a768bDE6'],
  ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 0n, '0x7B1D9bCd4E286929c32fE49E400815BEee51f3e4'],
  ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 1n, '0xbDd0081d3065e75075E58787bBad9ae91a687520'],
  ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 42n, '0xc091164EF9E614fE3E0CB4Ded87037B95961B8fb'],
  ['0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', 0n, '0xb6339328ef61cD5975d6a061C230A2575C77fba8'],
  ['0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', 1n, '0x12D575d54FD617A63Fb0e451C86F669dbBbc99c6'],
  ['0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B', 42n, '0x1FebA116d1Df6B74f3f5AF0902fA87126C598189'],
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
      '0x85CbB1CF9ba99d04B6493C95487ec3b0a768bDE6'
    )
  })

  test('getMarginAccountAddress defaults subId to 0', () => {
    expect(getMarginAccountAddress(1, '0x0000000000000000000000000000000000000001')).toBe(
      '0x9e57f7E08A76fD43fF250511f720F711AC5D79F7'
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
