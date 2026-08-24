import { describe, expect, it } from 'bun:test'
import { type AbiFunction, toFunctionSelector, toFunctionSignature } from 'viem'

import { LIQUIDITY_LAUNCHER_ABI } from './abis'

const FUNCTIONS = LIQUIDITY_LAUNCHER_ABI.filter((entry): entry is AbiFunction => entry.type === 'function')

function fn(name: string): AbiFunction {
  const entry = FUNCTIONS.find((candidate) => candidate.name === name)
  if (entry === undefined) {
    throw new Error(`${name} is not declared in LIQUIDITY_LAUNCHER_ABI`)
  }
  return entry
}

describe('LIQUIDITY_LAUNCHER_ABI', () => {
  // Selectors read off the deployed chain-4663 launcher's dispatcher (2026-08-04). `payable` is not
  // part of a selector, so these must be identical before and after the mutability flip — the pin
  // catches a signature typo that a mutability-only review would miss.
  it.each([
    ['createToken', '0xdec14be1'],
    ['distributeToken', '0xb6982b48'],
    ['depositToken', '0x44599bc5'],
    ['distributeWithNative', '0x0ef847b6'],
    ['multicall', '0xac9650d8'],
  ])('pins %s to selector %s', (name, selector) => {
    expect(toFunctionSelector(fn(name))).toBe(selector)
  })

  // Every launcher entry point is payable in liquidity-launcher#223/#227: `multicall`
  // self-delegatecalls, so a non-payable callee reverts on solc's callvalue check inside a
  // value-carrying batch. viem/ethers refuse to attach `value` to a nonpayable entry, so a
  // regression here silently makes native-carrying launches unconstructable.
  it('declares every function payable', () => {
    for (const entry of FUNCTIONS) {
      expect(entry.stateMutability).toBe('payable')
    }
  })

  it('declares distributeWithNative with the explicit nativeAmount parameter', () => {
    // The amount is a parameter, not msg.value: msg.value is identical in every delegatecall frame,
    // so reading it would let a single payment fund two hand-offs.
    expect(toFunctionSignature(fn('distributeWithNative'))).toBe(
      'distributeWithNative(address,bytes,bytes32,uint256)'
    )
  })

  // #223 added sweepNative; #227 removed it again (unauthenticated and reachable mid-batch, so a
  // contract gaining execution inside the transaction could divert un-forwarded native), together
  // with the NativeNotSwept multicall guard. The deployed launcher has neither, so neither belongs
  // here — an ABI entry for sweepNative would encode a call that reverts with empty data.
  it('does not declare sweepNative, removed in liquidity-launcher#227', () => {
    expect(FUNCTIONS.map((entry) => entry.name)).not.toContain('sweepNative')
  })
})
