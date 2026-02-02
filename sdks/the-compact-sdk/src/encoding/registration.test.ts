import { Address, Hex, concat, encodeAbiParameters, keccak256, toHex } from 'viem'

import { MandateFields, simpleMandate } from '../builders/mandate'

import { encodeLockId } from './locks'
import {
  BATCH_COMPACT_TYPEHASH,
  COMPACT_TYPEHASH,
  ELEMENT_TYPEHASH,
  LOCK_TYPEHASH,
  MULTICHAIN_COMPACT_TYPEHASH,
  batchCompactTypehash,
  compactTypehash,
  idsAndAmountsLockCommitmentsHash,
  multichainCompactTypehash,
  multichainElementHash,
  multichainElementTypehash,
  multichainElementsHash,
  registrationBatchClaimHash,
  registrationCompactClaimHash,
  registrationCompactClaimHashFromId,
  registrationMultichainClaimHash,
} from './registration'

describe('encoding/registration (compat with The Compact)', () => {
  it('matches upstream typehash constants (EIP712Types.sol)', () => {
    // Values copied from The Compact `src/types/EIP712Types.sol`
    expect(COMPACT_TYPEHASH).toBe('0x73b631296de001508966ddfc334593ad8f850ccd3be4d2c58a9ed469844eebc7')
    expect(LOCK_TYPEHASH).toBe('0xfb7744571d97aa61eb9c2bc3c67b9b1ba047ac9e95afb2ef02bc5b3d9e64fbe5')
    expect(BATCH_COMPACT_TYPEHASH).toBe('0x179fcd593ea3b4b32623a455fb55eb007c5040f4c85774f2e3f18d98e87eb76b')
    expect(ELEMENT_TYPEHASH).toBe('0xc3e0b49b35866f940704f2fb568b9d5dae17a245971e2c095778b60ea177f03b')
    expect(MULTICHAIN_COMPACT_TYPEHASH).toBe('0x172d857ea70e48d30dcad00bb0fc789a34f09c5545da1245400da01d4ef6c8a2')
  })

  it('derives with-witness typehashes matching upstream typestrings', () => {
    const Mandate = simpleMandate<{ witnessArgument: bigint }>([MandateFields.uint256('witnessArgument')])

    const compactWithWitnessTypestring =
      'Compact(address arbiter,address sponsor,uint256 nonce,uint256 expires,bytes12 lockTag,address token,uint256 amount,Mandate mandate)Mandate(uint256 witnessArgument)'
    const batchWithWitnessTypestring =
      'BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Lock[] commitments,Mandate mandate)Lock(bytes12 lockTag,address token,uint256 amount)Mandate(uint256 witnessArgument)'
    const multichainWithWitnessTypestring =
      'MultichainCompact(address sponsor,uint256 nonce,uint256 expires,Element[] elements)Element(address arbiter,uint256 chainId,Lock[] commitments,Mandate mandate)Lock(bytes12 lockTag,address token,uint256 amount)Mandate(uint256 witnessArgument)'
    const elementWithWitnessTypestring =
      'Element(address arbiter,uint256 chainId,Lock[] commitments,Mandate mandate)Lock(bytes12 lockTag,address token,uint256 amount)Mandate(uint256 witnessArgument)'

    expect(compactTypehash(Mandate)).toBe(keccak256(toHex(compactWithWitnessTypestring)))
    expect(batchCompactTypehash(Mandate)).toBe(keccak256(toHex(batchWithWitnessTypestring)))
    expect(multichainCompactTypehash(Mandate)).toBe(keccak256(toHex(multichainWithWitnessTypestring)))
    expect(multichainElementTypehash(Mandate)).toBe(keccak256(toHex(elementWithWitnessTypestring)))
  })

  it('computes witness hash as EIP-712 struct hash', () => {
    const Mandate = simpleMandate<{ witnessArgument: bigint }>([MandateFields.uint256('witnessArgument')])
    const witnessArgument = 234n

    const expected = keccak256(
      encodeAbiParameters(
        [
          { name: 'typehash', type: 'bytes32' },
          { name: 'witnessArgument', type: 'uint256' },
        ],
        [Mandate.typehash(), witnessArgument]
      )
    )

    expect(Mandate.hash({ witnessArgument })).toBe(expected)
  })

  it('computes registrationCompactClaimHash (no witness)', () => {
    const arbiter = '0x2222222222222222222222222222222222222222' as Address
    const sponsor = '0x1111111111111111111111111111111111111111' as Address
    const lockTag = '0x000000000000000000000123' as Hex
    const token = '0x0000000000000000000000000000000000000000' as Address
    const nonce = 0n
    const expires = 123n
    const amount = 1000n

    const expected = keccak256(
      encodeAbiParameters(
        [
          { name: 'typehash', type: 'bytes32' },
          { name: 'arbiter', type: 'address' },
          { name: 'sponsor', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expires', type: 'uint256' },
          { name: 'lockTag', type: 'bytes12' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        [COMPACT_TYPEHASH, arbiter, sponsor, nonce, expires, lockTag, token, amount]
      )
    )

    expect(
      registrationCompactClaimHash({
        typehash: COMPACT_TYPEHASH,
        arbiter,
        sponsor,
        nonce,
        expires,
        lockTag,
        token,
        amount,
      })
    ).toBe(expected)
  })

  it('computes registrationCompactClaimHashFromId (with witness)', () => {
    const Mandate = simpleMandate<{ witnessArgument: bigint }>([MandateFields.uint256('witnessArgument')])
    const witness = Mandate.hash({ witnessArgument: 999n })
    const typehash = compactTypehash(Mandate)

    const arbiter = '0x2222222222222222222222222222222222222222' as Address
    const sponsor = '0x1111111111111111111111111111111111111111' as Address
    const lockTag = '0x000000000000000000000123' as Hex
    const token = '0x0000000000000000000000000000000000000000' as Address
    const id = encodeLockId(lockTag, token)
    const nonce = 1n
    const expires = 2n
    const amount = 3n

    const expected = keccak256(
      encodeAbiParameters(
        [
          { name: 'typehash', type: 'bytes32' },
          { name: 'arbiter', type: 'address' },
          { name: 'sponsor', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expires', type: 'uint256' },
          { name: 'lockTag', type: 'bytes12' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'witness', type: 'bytes32' },
        ],
        [typehash, arbiter, sponsor, nonce, expires, lockTag, token, amount, witness]
      )
    )

    expect(
      registrationCompactClaimHashFromId({
        typehash,
        arbiter,
        sponsor,
        nonce,
        expires,
        id,
        amount,
        witness,
      })
    ).toBe(expected)
  })

  it('computes idsAndAmountsHash and registrationBatchClaimHash (with witness)', () => {
    const Mandate = simpleMandate<{ witnessArgument: bigint }>([MandateFields.uint256('witnessArgument')])
    const witness = Mandate.hash({ witnessArgument: 5n })
    const typehash = batchCompactTypehash(Mandate)

    const arbiter = '0x2222222222222222222222222222222222222222' as Address
    const sponsor = '0x1111111111111111111111111111111111111111' as Address
    const lockTag = '0x000000000000000000000123' as Hex
    const token = '0x0000000000000000000000000000000000000000' as Address
    const id = encodeLockId(lockTag, token)

    const pairs: readonly [bigint, bigint][] = [
      [id, 10n],
      [id, 20n],
    ]
    const h = idsAndAmountsLockCommitmentsHash(pairs)

    // Manually mirror Setup._hashOfHashes
    const lockHashes = pairs.map(([pairId, amount]) => {
      const lockTagOfId = `0x${(pairId >> 160n).toString(16).padStart(24, '0')}` as Hex // bytes12
      const tokenOfId = `0x${(pairId & ((1n << 160n) - 1n)).toString(16).padStart(40, '0')}` as Address
      return keccak256(
        encodeAbiParameters(
          [
            { name: 'lockTypehash', type: 'bytes32' },
            { name: 'lockTag', type: 'bytes12' },
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          [LOCK_TYPEHASH, lockTagOfId, tokenOfId, amount]
        )
      )
    })
    const expectedIdsAndAmountsHash = keccak256(concat(lockHashes))
    expect(h).toBe(expectedIdsAndAmountsHash)

    const expectedClaimHash = keccak256(
      encodeAbiParameters(
        [
          { name: 'typehash', type: 'bytes32' },
          { name: 'arbiter', type: 'address' },
          { name: 'sponsor', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expires', type: 'uint256' },
          { name: 'idsAndAmountsHash', type: 'bytes32' },
          { name: 'witness', type: 'bytes32' },
        ],
        [typehash, arbiter, sponsor, 0n, 1n, h, witness]
      )
    )

    expect(
      registrationBatchClaimHash({
        typehash,
        arbiter,
        sponsor,
        nonce: 0n,
        expires: 1n,
        idsAndAmountsHash: h,
        witness,
      })
    ).toBe(expectedClaimHash)
  })

  it('computes multichain element hash, elementsHash (packed), and registrationMultichainClaimHash', () => {
    const Mandate = simpleMandate<{ witnessArgument: bigint }>([MandateFields.uint256('witnessArgument')])
    const witness = Mandate.hash({ witnessArgument: 7n })
    const elementTypehash = multichainElementTypehash(Mandate)
    const multichainTypehash = multichainCompactTypehash(Mandate)

    const arbiter = '0x2222222222222222222222222222222222222222' as Address
    const sponsor = '0x1111111111111111111111111111111111111111' as Address
    const commitmentsHash = keccak256(toHex('commitments'))

    const elementHash1 = multichainElementHash({
      typehash: elementTypehash,
      arbiter,
      chainId: 1n,
      commitmentsHash,
      witness,
    })
    const elementHash2 = multichainElementHash({
      typehash: elementTypehash,
      arbiter,
      chainId: 7171717n,
      commitmentsHash,
      witness,
    })

    const elementsHash = multichainElementsHash([elementHash1, elementHash2])
    const expectedElementsHash = keccak256(concat([elementHash1, elementHash2]))
    expect(elementsHash).toBe(expectedElementsHash)

    const claimHash = registrationMultichainClaimHash({
      typehash: multichainTypehash,
      sponsor,
      nonce: 0n,
      expires: 1n,
      elementsHash,
    })

    const expectedClaimHash = keccak256(
      encodeAbiParameters(
        [
          { name: 'typehash', type: 'bytes32' },
          { name: 'sponsor', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expires', type: 'uint256' },
          { name: 'elementsHash', type: 'bytes32' },
        ],
        [multichainTypehash, sponsor, 0n, 1n, elementsHash]
      )
    )
    expect(claimHash).toBe(expectedClaimHash)
  })
})
