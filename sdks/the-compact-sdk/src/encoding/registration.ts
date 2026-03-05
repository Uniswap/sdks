/**
 * Canonical hashing helpers for on-chain registration flows.
 *
 * These helpers mirror The Compact's Solidity test helpers (`test/integration/TestHelpers.sol`)
 * and HashLib (`src/lib/HashLib.sol`) to ensure byte-for-byte compatibility.
 */

import invariant from 'tiny-invariant'
import { Address, Hex, concat, encodeAbiParameters, keccak256, toHex, zeroAddress } from 'viem'

import type { MandateType } from '../builders/mandate'

import { decodeLockId } from './locks'

// ------------------------------------------------------------
// Canonical type strings (no witness)
// ------------------------------------------------------------

export const COMPACT_TYPESTRING =
  'Compact(address arbiter,address sponsor,uint256 nonce,uint256 expires,bytes12 lockTag,address token,uint256 amount)'

export const LOCK_TYPESTRING = 'Lock(bytes12 lockTag,address token,uint256 amount)'

export const BATCH_COMPACT_TYPESTRING =
  'BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Lock[] commitments)Lock(bytes12 lockTag,address token,uint256 amount)'

export const ELEMENT_TYPESTRING =
  'Element(address arbiter,uint256 chainId,Lock[] commitments)Lock(bytes12 lockTag,address token,uint256 amount)'

export const MULTICHAIN_COMPACT_TYPESTRING =
  'MultichainCompact(address sponsor,uint256 nonce,uint256 expires,Element[] elements)Element(address arbiter,uint256 chainId,Lock[] commitments)Lock(bytes12 lockTag,address token,uint256 amount)'

export const COMPACT_TYPEHASH = keccak256(toHex(COMPACT_TYPESTRING))
export const LOCK_TYPEHASH = keccak256(toHex(LOCK_TYPESTRING))
export const BATCH_COMPACT_TYPEHASH = keccak256(toHex(BATCH_COMPACT_TYPESTRING))
export const ELEMENT_TYPEHASH = keccak256(toHex(ELEMENT_TYPESTRING))
export const MULTICHAIN_COMPACT_TYPEHASH = keccak256(toHex(MULTICHAIN_COMPACT_TYPESTRING))

// ------------------------------------------------------------
// Typehash derivation (with witness / mandate)
// ------------------------------------------------------------

export function compactTypehash(mandateType?: MandateType<any>): Hex {
  if (!mandateType) return COMPACT_TYPEHASH
  return keccak256(
    toHex(
      'Compact(address arbiter,address sponsor,uint256 nonce,uint256 expires,bytes12 lockTag,address token,uint256 amount,Mandate mandate)' +
        mandateType.typestring()
    )
  )
}

export function batchCompactTypehash(mandateType?: MandateType<any>): Hex {
  if (!mandateType) return BATCH_COMPACT_TYPEHASH
  return keccak256(
    toHex(
      'BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Lock[] commitments,Mandate mandate)Lock(bytes12 lockTag,address token,uint256 amount)' +
        mandateType.typestring()
    )
  )
}

export function multichainCompactTypehash(mandateType?: MandateType<any>): Hex {
  if (!mandateType) return MULTICHAIN_COMPACT_TYPEHASH
  return keccak256(
    toHex(
      'MultichainCompact(address sponsor,uint256 nonce,uint256 expires,Element[] elements)' +
        'Element(address arbiter,uint256 chainId,Lock[] commitments,Mandate mandate)' +
        'Lock(bytes12 lockTag,address token,uint256 amount)' +
        mandateType.typestring()
    )
  )
}

export function multichainElementTypehash(mandateType?: MandateType<any>): Hex {
  if (!mandateType) return ELEMENT_TYPEHASH
  return keccak256(
    toHex(
      'Element(address arbiter,uint256 chainId,Lock[] commitments,Mandate mandate)Lock(bytes12 lockTag,address token,uint256 amount)' +
        mandateType.typestring()
    )
  )
}

// ------------------------------------------------------------
// Registration claim hash helpers (as used by register/registerFor/.../depositAndRegisterFor)
// ------------------------------------------------------------

/**
 * Compute witness hash (EIP-712 struct hash) for a Mandate value.
 * This is the bytes32 used in Compact/BatchCompact/etc claim-hash preimages.
 */
export function witnessHash<T extends object>(mandateType: MandateType<T>, mandate: T): Hex {
  return mandateType.hash(mandate)
}

/**
 * Compute Compact claim hash for registration.
 *
 * Mirrors The Compact's `TestHelpers._createClaimHash{WithWitness}` logic:
 * - If `typehash === COMPACT_TYPEHASH` (no-witness type), witness is omitted from the preimage.
 * - Otherwise the witness word is included.
 */
export function registrationCompactClaimHash(params: {
  typehash: Hex
  arbiter: Address
  sponsor: Address
  nonce: bigint
  expires: bigint
  lockTag: Hex // bytes12
  token: Address
  amount: bigint
  witness?: Hex // bytes32
}): Hex {
  const baseParams = [
    { name: 'typehash', type: 'bytes32' },
    { name: 'arbiter', type: 'address' },
    { name: 'sponsor', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expires', type: 'uint256' },
    { name: 'lockTag', type: 'bytes12' },
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ] as const

  if (params.typehash === COMPACT_TYPEHASH) {
    const encoded = encodeAbiParameters(baseParams as any, [
      params.typehash,
      params.arbiter,
      params.sponsor,
      params.nonce,
      params.expires,
      params.lockTag,
      params.token,
      params.amount,
    ])
    return keccak256(encoded)
  }

  invariant(params.witness, 'witness is required when typehash is not COMPACT_TYPEHASH')
  const encoded = encodeAbiParameters([...baseParams, { name: 'witness', type: 'bytes32' }] as any, [
    params.typehash,
    params.arbiter,
    params.sponsor,
    params.nonce,
    params.expires,
    params.lockTag,
    params.token,
    params.amount,
    params.witness,
  ])
  return keccak256(encoded)
}

export function registrationCompactClaimHashFromId(params: {
  typehash: Hex
  arbiter: Address
  sponsor: Address
  nonce: bigint
  expires: bigint
  id: bigint
  amount: bigint
  witness?: Hex
}): Hex {
  const { lockTag, token } = decodeLockId(params.id)
  return registrationCompactClaimHash({
    typehash: params.typehash,
    arbiter: params.arbiter,
    sponsor: params.sponsor,
    nonce: params.nonce,
    expires: params.expires,
    lockTag,
    token,
    amount: params.amount,
    witness: params.witness,
  })
}

/**
 * Compute the idsAndAmountsHash used by `registerBatchFor` / batch registration flows.
 *
 * Mirrors `Setup._hashOfHashes`:
 * - For each [id, amount], create a Lock(lockTag, token, amount) where lockTag/token are derived from id.
 * - Hash each lock as keccak256(abi.encode(LOCK_TYPEHASH, lock)).
 * - Return keccak256(abi.encodePacked(lockHashes)).
 */
export function idsAndAmountsLockCommitmentsHash(idsAndAmounts: readonly [bigint, bigint][]): Hex {
  const lockHashes: Hex[] = idsAndAmounts.map(([id, amount]) => {
    const { lockTag, token } = decodeLockId(id)
    const encoded = encodeAbiParameters(
      [
        { name: 'lockTypehash', type: 'bytes32' },
        { name: 'lockTag', type: 'bytes12' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      [LOCK_TYPEHASH, lockTag, token, amount]
    )
    return keccak256(encoded)
  })

  return keccak256(concat(lockHashes))
}

/**
 * Compute commitments hash from an array of lock commitments (lockTag, token, amount).
 *
 * Mirrors how The Compact hashes Lock[] commitments in its Solidity test helpers:
 * `keccak256(abi.encodePacked( keccak256(abi.encode(LOCK_TYPEHASH, lock))... ))`.
 */
export function commitmentsHashFromLocks(
  commitments: readonly { lockTag: Hex; token: Address; amount: bigint }[]
): Hex {
  const lockHashes: Hex[] = commitments.map((lock) => {
    const encoded = encodeAbiParameters(
      [
        { name: 'lockTypehash', type: 'bytes32' },
        { name: 'lockTag', type: 'bytes12' },
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      [LOCK_TYPEHASH, lock.lockTag, lock.token, lock.amount]
    )
    return keccak256(encoded)
  })

  return keccak256(concat(lockHashes))
}

export function registrationBatchClaimHash(params: {
  typehash: Hex
  arbiter: Address
  sponsor: Address
  nonce: bigint
  expires: bigint
  idsAndAmountsHash: Hex
  witness?: Hex
}): Hex {
  const baseParams = [
    { name: 'typehash', type: 'bytes32' },
    { name: 'arbiter', type: 'address' },
    { name: 'sponsor', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expires', type: 'uint256' },
    { name: 'idsAndAmountsHash', type: 'bytes32' },
  ] as const

  if (params.typehash === BATCH_COMPACT_TYPEHASH) {
    const encoded = encodeAbiParameters(baseParams as any, [
      params.typehash,
      params.arbiter,
      params.sponsor,
      params.nonce,
      params.expires,
      params.idsAndAmountsHash,
    ])
    return keccak256(encoded)
  }

  invariant(params.witness, 'witness is required when typehash is not BATCH_COMPACT_TYPEHASH')
  const encoded = encodeAbiParameters([...baseParams, { name: 'witness', type: 'bytes32' }] as any, [
    params.typehash,
    params.arbiter,
    params.sponsor,
    params.nonce,
    params.expires,
    params.idsAndAmountsHash,
    params.witness,
  ])
  return keccak256(encoded)
}

export function registrationMultichainClaimHash(params: {
  typehash: Hex
  sponsor: Address
  nonce: bigint
  expires: bigint
  elementsHash: Hex
}): Hex {
  const encoded = encodeAbiParameters(
    [
      { name: 'typehash', type: 'bytes32' },
      { name: 'sponsor', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'expires', type: 'uint256' },
      { name: 'elementsHash', type: 'bytes32' },
    ],
    [params.typehash, params.sponsor, params.nonce, params.expires, params.elementsHash]
  )
  return keccak256(encoded)
}

/**
 * Compute multichain element hash given a commitmentsHash (bytes32).
 *
 * Mirrors `TestHelpers._createMultichainElementHash(typeHash, arbiter, chainId, commitmentsHash, witnessHash)`.
 */
export function multichainElementHash(params: {
  typehash: Hex
  arbiter: Address
  chainId: bigint
  commitmentsHash: Hex
  witness?: Hex
}): Hex {
  if (!params.witness || params.witness === '0x' + '0'.repeat(64)) {
    const encoded = encodeAbiParameters(
      [
        { name: 'typehash', type: 'bytes32' },
        { name: 'arbiter', type: 'address' },
        { name: 'chainId', type: 'uint256' },
        { name: 'commitmentsHash', type: 'bytes32' },
      ],
      [params.typehash, params.arbiter, params.chainId, params.commitmentsHash]
    )
    return keccak256(encoded)
  }

  const encoded = encodeAbiParameters(
    [
      { name: 'typehash', type: 'bytes32' },
      { name: 'arbiter', type: 'address' },
      { name: 'chainId', type: 'uint256' },
      { name: 'commitmentsHash', type: 'bytes32' },
      { name: 'witness', type: 'bytes32' },
    ],
    [params.typehash, params.arbiter, params.chainId, params.commitmentsHash, params.witness]
  )
  return keccak256(encoded)
}

/**
 * Compute elementsHash for multichain registration: keccak256(abi.encodePacked(elementHashes)).
 * This matches The Compact's `RegisterFor.t.sol` helper.
 */
export function multichainElementsHash(elementHashes: readonly Hex[]): Hex {
  return keccak256(concat(elementHashes))
}

/**
 * Convenience helper for native token id encoding cases.
 */
export const NATIVE_TOKEN: Address = zeroAddress
