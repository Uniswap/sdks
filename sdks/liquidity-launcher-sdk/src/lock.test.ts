import { describe, expect, it } from 'bun:test'
import { type Address, type Hex, concatHex, encodeAbiParameters, getCreate2Address, keccak256 } from 'viem'

import { CANONICAL_CREATE2_DEPLOYER } from './constants'
import { buildLockRecipient } from './lock'
import { LOCK_RECIPIENT_CREATION_BYTECODE } from './lockRecipientBytecode'

const PM: Address = '0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e'
const OPERATOR: Address = '0x1111111111111111111111111111111111111111'
const FEE_RECIPIENT: Address = '0x2222222222222222222222222222222222222222'
const SALT: Hex = `0x${'ab'.repeat(32)}`
const TIMELOCK_BLOCK = 21_000_000n

describe('buildLockRecipient', () => {
  it('predicts the timelock recipient address and deploy calldata', () => {
    const args = encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }],
      [PM, OPERATOR, TIMELOCK_BLOCK]
    )
    const initCode = concatHex([LOCK_RECIPIENT_CREATION_BYTECODE.TIMELOCK, args])
    const expected = getCreate2Address({
      from: CANONICAL_CREATE2_DEPLOYER,
      salt: SALT,
      bytecodeHash: keccak256(initCode),
    })

    const out = buildLockRecipient({
      mode: 'timelock',
      positionManager: PM,
      operator: OPERATOR,
      timelockBlockNumber: TIMELOCK_BLOCK,
      lockSalt: SALT,
    })

    expect(out.predictedAddress).toBe(expected)
    expect(out.deployData).toBe(concatHex([SALT, initCode]))
  })

  it('produces a distinct address per mode (fee recipient changes the init code)', () => {
    const timelockOnly = buildLockRecipient({
      mode: 'timelock',
      positionManager: PM,
      operator: OPERATOR,
      timelockBlockNumber: TIMELOCK_BLOCK,
      lockSalt: SALT,
    })
    const forwarder = buildLockRecipient({
      mode: 'feesForwarder',
      positionManager: PM,
      operator: OPERATOR,
      timelockBlockNumber: TIMELOCK_BLOCK,
      lockSalt: SALT,
      feeRecipient: FEE_RECIPIENT,
    })
    expect(forwarder.predictedAddress).not.toBe(timelockOnly.predictedAddress)
  })

  it('supports the buybackBurn mode', () => {
    const out = buildLockRecipient({
      mode: 'buybackBurn',
      positionManager: PM,
      operator: OPERATOR,
      timelockBlockNumber: TIMELOCK_BLOCK,
      lockSalt: SALT,
      token: '0x15d0e0c55a3e7ee67152ad7e89acf164253ff68d',
      currency: '0x0000000000000000000000000000000000000000',
      minTokenBurnAmount: 1_000n,
    })
    expect(out.predictedAddress).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })
})

// Pins the audited creation bytecode so an accidental recompile/version bump fails loudly.
describe('creation bytecode pins', () => {
  it('TIMELOCK bytecode hash is unchanged', () => {
    expect(keccak256(LOCK_RECIPIENT_CREATION_BYTECODE.TIMELOCK)).toBe(
      '0x2191c5153dfbfe1eff2d9e1140ea84188b935273eb299c3afbc4f9a82ce8203c'
    )
  })
  it('FEES_FORWARDER bytecode hash is unchanged', () => {
    expect(keccak256(LOCK_RECIPIENT_CREATION_BYTECODE.FEES_FORWARDER)).toBe(
      '0x507a9a1b056e76a6d3fa727c9cd50aeae62665594832e50dc977e1864de9e539'
    )
  })
})
