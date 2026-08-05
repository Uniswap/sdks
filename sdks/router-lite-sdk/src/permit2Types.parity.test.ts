import { AllowanceTransfer } from '@uniswap/permit2-sdk'
import { describe, expect, test } from 'bun:test'
import type { Address } from 'viem'

import { PERMIT2_TYPES, permit2Domain } from './internal/testing'

// ---------------------------------------------------------------------------
// R6(b): the hand-restated Permit2 EIP-712 shape, checked against the SDK.
//
// `internal/testing.ts` restates Permit2's typed-data shape deliberately — the
// fork suite's signature has to be independent of any Uniswap library, or a
// wrong shape would be validated against an equally wrong one (the same reason
// `integration/worldBuilder.ts` restates the pool math). But "independent" was
// being used to mean "unchecked": the literal lived inside
// `integration/readiness.fork.test.ts`, and if a field name, a field ORDER, or
// one of the non-obvious widths (`uint160` amount, `uint48` expiration/nonce —
// Permit2's own packing, not an ERC-20 permit's `uint256`s) were wrong, the
// only signal was a fork run producing a signature the real contract rejects.
//
// This closes that with a UNIT test: the restatement is compared, field by
// field and in order, against `AllowanceTransfer.getPermitData(...)`. The two
// stay independent implementations; they just have to agree.
//
// `@uniswap/permit2-sdk` is a devDependency ONLY, and this file is the only
// importer — the same C4-P4 posture that keeps `sdk-core` (and ethers, which
// permit2-sdk pulls in transitively) out of this package's runtime graph. See
// `manifest.parity.test.ts`.
// ---------------------------------------------------------------------------

const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address
const TOKEN = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address
const SPENDER = '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af' as Address
const CHAIN_ID = 1

/** A representative `PermitSingle`; only the SHAPE of the returned typed data is under test. */
const permitData = AllowanceTransfer.getPermitData(
  { details: { token: TOKEN, amount: 1_000n.toString(), expiration: 2_000, nonce: 0 }, spender: SPENDER, sigDeadline: 3_000 },
  PERMIT2,
  CHAIN_ID,
)

describe('Permit2 EIP-712 parity with @uniswap/permit2-sdk (R6)', () => {
  test('the restated types equal AllowanceTransfer.getPermitData(...).types', () => {
    // `toEqual` on the whole record covers names, types, ORDER (arrays compare positionally) and
    // the absence of any extra struct — all four of which change the EIP-712 struct hash.
    expect(JSON.parse(JSON.stringify(PERMIT2_TYPES))).toEqual(permitData.types)
  })

  test('both structs are present, and field order matches exactly', () => {
    // Guards the loop above against vacuity: a missing struct on OUR side would make the records
    // unequal, but a missing struct on THEIRS with a matching omission on ours would not.
    expect(Object.keys(permitData.types).sort()).toEqual(['PermitDetails', 'PermitSingle'])
    expect(PERMIT2_TYPES.PermitSingle.map((f) => f.name)).toEqual(['details', 'spender', 'sigDeadline'])
    expect(PERMIT2_TYPES.PermitDetails.map((f) => f.name)).toEqual(['token', 'amount', 'expiration', 'nonce'])
  })

  test("the non-obvious widths are Permit2's, not an ERC-20 permit's", () => {
    // The single likeliest transcription error: `uint256` for all three, which is what an ERC-2612
    // permit uses and what a careless copy would produce.
    expect(PERMIT2_TYPES.PermitDetails.map((f) => f.type)).toEqual(['address', 'uint160', 'uint48', 'uint48'])
  })

  test('the domain matches, and has NO `version` field', () => {
    const ours = permit2Domain(PERMIT2, CHAIN_ID)
    expect(ours).toEqual(permitData.domain as typeof ours)
    // Stated as its own assertion because it is the trap: most EIP-712 domains carry `version: '1'`,
    // Permit2's `DOMAIN_SEPARATOR` does not, and adding it silently changes the separator — a
    // signature the contract rejects, from typed data that looks entirely reasonable.
    expect('version' in ours).toBe(false)
    expect('version' in (permitData.domain as Record<string, unknown>)).toBe(false)
    expect(ours.name).toBe('Permit2')
  })
})
