/**
 * Encoding utilities for Tribunal protocol
 *
 * Provides hash computation, type hashes, and hash derivation utilities.
 * These functions match the Solidity implementations in Tribunal.sol and TribunalTypeHashes.sol
 */

import { keccak256, encodeAbiParameters, encodePacked, Address, Hex } from 'viem'

import { BatchCompact, Lock } from '../types/eip712'
import {
  FillComponent,
  FillParameters,
  RecipientCallback,
  Mandate,
  Adjustment,
  TribunalBatchClaim,
  ERC7683OriginData,
  ERC7683FillerData,
} from '../types/tribunal'

// ============ Type String Constants ============

/**
 * Tribunal Mandate typestring
 * Must match MANDATE_TYPESTRING in TribunalTypeHashes.sol
 */
export const TRIBUNAL_MANDATE_TYPESTRING =
  'Mandate(address adjuster,Mandate_Fill[] fills)Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)Mandate_Fill(uint256 chainId,address tribunal,uint256 expires,Mandate_FillComponent[] components,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)Mandate_Lock(bytes12 lockTag,address token,uint256 amount)Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes context)'

/**
 * Tribunal Fill typestring
 * Must match MANDATE_FILL_TYPESTRING in TribunalTypeHashes.sol
 */
export const TRIBUNAL_FILL_TYPESTRING =
  'Mandate_Fill(uint256 chainId,address tribunal,uint256 expires,Mandate_FillComponent[] components,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)Mandate(address adjuster,Mandate_Fill[] fills)Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)Mandate_Lock(bytes12 lockTag,address token,uint256 amount)Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes context)'

/**
 * Tribunal FillComponent typestring
 */
export const TRIBUNAL_FILL_COMPONENT_TYPESTRING =
  'Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)'

/**
 * Tribunal RecipientCallback typestring
 */
export const TRIBUNAL_RECIPIENT_CALLBACK_TYPESTRING =
  'Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes context)Mandate(address adjuster,Mandate_Fill[] fills)Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)Mandate_Fill(uint256 chainId,address tribunal,uint256 expires,Mandate_FillComponent[] components,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)Mandate_Lock(bytes12 lockTag,address token,uint256 amount)'

/**
 * Tribunal BatchCompact typestring for mandate
 */
export const TRIBUNAL_BATCH_COMPACT_TYPESTRING =
  'Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)Mandate(address adjuster,Mandate_Fill[] fills)Mandate_Fill(uint256 chainId,address tribunal,uint256 expires,Mandate_FillComponent[] components,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)Mandate_Lock(bytes12 lockTag,address token,uint256 amount)Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes context)'

/**
 * Tribunal Lock typestring
 */
export const TRIBUNAL_LOCK_TYPESTRING = 'Mandate_Lock(bytes12 lockTag,address token,uint256 amount)'

/**
 * The Compact BatchCompact with Tribunal mandate typestring
 */
export const COMPACT_WITH_TRIBUNAL_MANDATE_TYPESTRING =
  'BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Lock[] commitments,Mandate mandate)Lock(bytes12 lockTag,address token,uint256 amount)Mandate(address adjuster,Mandate_Fill[] fills)Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)Mandate_Fill(uint256 chainId,address tribunal,uint256 expires,Mandate_FillComponent[] components,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)Mandate_Lock(bytes12 lockTag,address token,uint256 amount)Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes context)'

/**
 * Tribunal Adjustment typestring
 * NOTE: Unlike Exarch, Tribunal's adjustment does NOT include adjuster address or nonce
 */
export const TRIBUNAL_ADJUSTMENT_TYPESTRING =
  'Adjustment(bytes32 claimHash,uint256 fillIndex,uint256 targetBlock,uint256[] supplementalPriceCurve,bytes32 validityConditions)'

/**
 * Tribunal witness typestring (partial, provided to The Compact)
 */
export const TRIBUNAL_WITNESS_TYPESTRING =
  'address adjuster,Mandate_Fill[] fills)Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)Mandate_Fill(uint256 chainId,address tribunal,uint256 expires,Mandate_FillComponent[] components,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)Mandate_Lock(bytes12 lockTag,address token,uint256 amount)Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes context'

// ============ Type Hash Constants ============
// Hardcoded to match TribunalTypeHashes.sol (reduces computation overhead)

/**
 * Tribunal Mandate typehash
 * keccak256(TRIBUNAL_MANDATE_TYPESTRING)
 */
export const TRIBUNAL_MANDATE_TYPEHASH = '0xd98eceb6e5c7770b3b664a99c269855402fe5255294a30970d25376caea662c6' as Hex

/**
 * Tribunal Fill typehash
 * keccak256(TRIBUNAL_FILL_TYPESTRING)
 */
export const TRIBUNAL_FILL_TYPEHASH = '0x1d0ee69a7bc1ac54d9a6b38f32ab156fbfe09a9098843d54f89e7b1033533d33' as Hex

/**
 * Tribunal FillComponent typehash
 * keccak256(TRIBUNAL_FILL_COMPONENT_TYPESTRING)
 */
export const TRIBUNAL_FILL_COMPONENT_TYPEHASH =
  '0x97a135285706d21a6b74ac159b77b16cea827acc358fc6c33e430ce0a85fe9d6' as Hex

/**
 * Tribunal RecipientCallback typehash
 * keccak256(TRIBUNAL_RECIPIENT_CALLBACK_TYPESTRING)
 */
export const TRIBUNAL_RECIPIENT_CALLBACK_TYPEHASH =
  '0xb60a17eb6828a433f2f2fcbeb119166fa25e1fb6ae3866e33952bb74f5055031' as Hex

/**
 * Tribunal BatchCompact typehash
 * keccak256(TRIBUNAL_BATCH_COMPACT_TYPESTRING)
 */
export const TRIBUNAL_BATCH_COMPACT_TYPEHASH =
  '0x75d7205b7ec9e9b203d9161387d95a46c8440f4530dceab1bb28d4194a586227' as Hex

/**
 * Tribunal Lock typehash
 * keccak256(TRIBUNAL_LOCK_TYPESTRING)
 */
export const TRIBUNAL_LOCK_TYPEHASH = '0xce4f0854d9091f37d9dfb64592eee0de534c6680a5444fd55739b61228a6e0b0' as Hex

/**
 * The Compact typehash with Tribunal mandate
 * keccak256(COMPACT_WITH_TRIBUNAL_MANDATE_TYPESTRING)
 */
export const COMPACT_WITH_TRIBUNAL_MANDATE_TYPEHASH =
  '0xdbbdcf42471b4a26f7824df9f33f0a4f9bb4e7a66be6a31be8868a6cbbec0a7d' as Hex

/**
 * Tribunal Adjustment typehash
 * keccak256(TRIBUNAL_ADJUSTMENT_TYPESTRING)
 */
export const TRIBUNAL_ADJUSTMENT_TYPEHASH = '0xe829b2a82439f37ac7578a226e337d334e0ee0da2f05ab63891c19cb84714414' as Hex

// Re-export LOCK_TYPEHASH from registration for convenience
import { LOCK_TYPEHASH } from './registration'
export { LOCK_TYPEHASH } from './registration'

// Pre-computed hash of empty bytes (keccak256 of empty array)
const EMPTY_BYTES_HASH = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470' as Hex

// ============ Hash Derivation ============

/**
 * Derive the fill component hash for a single component
 * Matches Solidity: keccak256(abi.encode(TYPEHASH, fillToken, minimumFillAmount, recipient, applyScaling))
 *
 * @param component - The fill component to hash
 * @returns The component hash
 */
export function deriveTribunalFillComponentHash(component: FillComponent): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { name: 'typehash', type: 'bytes32' },
        { name: 'fillToken', type: 'address' },
        { name: 'minimumFillAmount', type: 'uint256' },
        { name: 'recipient', type: 'address' },
        { name: 'applyScaling', type: 'bool' },
      ],
      [
        TRIBUNAL_FILL_COMPONENT_TYPEHASH,
        component.fillToken,
        component.minimumFillAmount,
        component.recipient,
        component.applyScaling,
      ]
    )
  )
}

/**
 * Derive the fill components hash from an array of components
 * Matches Solidity: keccak256(abi.encodePacked(componentHashes))
 *
 * @param components - Array of fill components
 * @returns The components hash
 */
export function deriveTribunalFillComponentsHash(components: FillComponent[]): Hex {
  const componentHashes = components.map(deriveTribunalFillComponentHash)
  return keccak256(encodePacked(['bytes32[]'], [componentHashes]))
}

/**
 * Derive the commitments hash using the specified typehash
 * Matches Solidity _deriveCommitmentsHash
 *
 * @param commitments - Array of lock commitments
 * @param typehash - The typehash to use (LOCK_TYPEHASH or TRIBUNAL_LOCK_TYPEHASH)
 * @returns The commitments hash
 */
export function deriveTribunalCommitmentsHash(commitments: Lock[], typehash: Hex): Hex {
  const commitmentHashes = commitments.map((commitment) =>
    keccak256(
      encodeAbiParameters(
        [
          { name: 'typehash', type: 'bytes32' },
          { name: 'lockTag', type: 'bytes12' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        [typehash, commitment.lockTag, commitment.token, commitment.amount]
      )
    )
  )
  return keccak256(encodePacked(['bytes32[]'], [commitmentHashes]))
}

/**
 * Derive the claim hash using provided typehashes
 * Matches Solidity _deriveClaimHash
 *
 * @param compact - The batch compact
 * @param mandateHash - The mandate hash
 * @param lockTypehash - The lock typehash
 * @param compactTypehash - The compact typehash
 * @returns The claim hash
 */
export function deriveTribunalClaimHashWithTypehash(
  compact: BatchCompact,
  mandateHash: Hex,
  lockTypehash: Hex,
  compactTypehash: Hex
): Hex {
  const commitmentsHash = deriveTribunalCommitmentsHash(compact.commitments, lockTypehash)
  return keccak256(
    encodeAbiParameters(
      [
        { name: 'compactTypehash', type: 'bytes32' },
        { name: 'arbiter', type: 'address' },
        { name: 'sponsor', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'expires', type: 'uint256' },
        { name: 'commitmentsHash', type: 'bytes32' },
        { name: 'mandateHash', type: 'bytes32' },
      ],
      [compactTypehash, compact.arbiter, compact.sponsor, compact.nonce, compact.expires, commitmentsHash, mandateHash]
    )
  )
}

/**
 * Derive the recipient callback hash
 * Matches Solidity deriveRecipientCallbackHash
 *
 * @param recipientCallback - Array of recipient callbacks (0 or 1 elements)
 * @returns The callback hash
 */
export function deriveTribunalRecipientCallbackHash(recipientCallback: RecipientCallback[]): Hex {
  // Return pre-computed empty hash if no callback
  if (recipientCallback.length === 0) {
    return EMPTY_BYTES_HASH
  }

  // Only single callback supported
  if (recipientCallback.length !== 1) {
    throw new Error('Only single recipient callback is supported')
  }

  const callback = recipientCallback[0]

  // Derive the compact hash for the callback (using mandate typehashes)
  const compactHash = deriveTribunalClaimHashWithTypehash(
    callback.compact,
    callback.mandateHash,
    TRIBUNAL_LOCK_TYPEHASH,
    TRIBUNAL_BATCH_COMPACT_TYPEHASH
  )

  // Hash the callback struct
  // Note: Tribunal uses keccak256(callback.context), not keccak256(context.hash) like Exarch
  const callbackHash = keccak256(
    encodeAbiParameters(
      [
        { name: 'typehash', type: 'bytes32' },
        { name: 'chainId', type: 'uint256' },
        { name: 'compactHash', type: 'bytes32' },
        { name: 'contextHash', type: 'bytes32' },
      ],
      [TRIBUNAL_RECIPIENT_CALLBACK_TYPEHASH, callback.chainId, compactHash, keccak256(callback.context)]
    )
  )

  // Return keccak256(abi.encodePacked(callbackHash))
  return keccak256(encodePacked(['bytes32'], [callbackHash]))
}

/**
 * Derive the fill hash from fill parameters
 * Matches Solidity deriveFillHash
 *
 * IMPORTANT: The fill hash includes the chainId and tribunal address from the FillParameters,
 * which must match where the fill is being executed.
 *
 * @param fill - The fill parameters
 * @returns The fill hash
 */
export function deriveTribunalFillHash(fill: FillParameters): Hex {
  const componentsHash = deriveTribunalFillComponentsHash(fill.components)
  const priceCurveHash = keccak256(
    encodePacked(
      fill.priceCurve.map(() => 'uint256'),
      fill.priceCurve
    )
  )
  const recipientCallbackHash = deriveTribunalRecipientCallbackHash(fill.recipientCallback)

  return keccak256(
    encodeAbiParameters(
      [
        { name: 'typehash', type: 'bytes32' },
        { name: 'chainId', type: 'uint256' },
        { name: 'tribunal', type: 'address' },
        { name: 'expires', type: 'uint256' },
        { name: 'componentsHash', type: 'bytes32' },
        { name: 'baselinePriorityFee', type: 'uint256' },
        { name: 'scalingFactor', type: 'uint256' },
        { name: 'priceCurveHash', type: 'bytes32' },
        { name: 'recipientCallbackHash', type: 'bytes32' },
        { name: 'salt', type: 'bytes32' },
      ],
      [
        TRIBUNAL_FILL_TYPEHASH,
        fill.chainId,
        fill.tribunal,
        fill.expires,
        componentsHash,
        fill.baselinePriorityFee,
        fill.scalingFactor,
        priceCurveHash,
        recipientCallbackHash,
        fill.salt,
      ]
    )
  )
}

/**
 * Derive the fills hash from an array of fill hashes
 * Matches Solidity deriveFillsHash
 *
 * @param fillHashes - Array of fill hashes
 * @returns The fills hash
 */
export function deriveTribunalFillsHash(fillHashes: Hex[]): Hex {
  return keccak256(encodePacked(['bytes32[]'], [fillHashes]))
}

/**
 * Derive the fills hash from an array of fill parameters
 * Convenience function that hashes all fills first
 *
 * @param fills - Array of fill parameters
 * @returns The fills hash
 */
export function deriveTribunalFillsHashFromFills(fills: FillParameters[]): Hex {
  const fillHashes = fills.map(deriveTribunalFillHash)
  return deriveTribunalFillsHash(fillHashes)
}

/**
 * Derive the mandate hash from mandate components
 * Matches Solidity deriveMandateHash
 *
 * @param adjuster - The adjuster address
 * @param fillHashes - Array of fill hashes
 * @returns The mandate hash
 */
export function deriveTribunalMandateHashFromComponents(adjuster: Address, fillHashes: Hex[]): Hex {
  const fillsHash = deriveTribunalFillsHash(fillHashes)
  return keccak256(
    encodeAbiParameters(
      [
        { name: 'typehash', type: 'bytes32' },
        { name: 'adjuster', type: 'address' },
        { name: 'fillsHash', type: 'bytes32' },
      ],
      [TRIBUNAL_MANDATE_TYPEHASH, adjuster, fillsHash]
    )
  )
}

/**
 * Derive the mandate hash from a full mandate
 * Matches Solidity deriveMandateHash
 *
 * @param mandate - The mandate to hash
 * @returns The mandate hash
 */
export function deriveTribunalMandateHash(mandate: Mandate): Hex {
  const fillsHash = deriveTribunalFillsHashFromFills(mandate.fills)
  return keccak256(
    encodeAbiParameters(
      [
        { name: 'typehash', type: 'bytes32' },
        { name: 'adjuster', type: 'address' },
        { name: 'fillsHash', type: 'bytes32' },
      ],
      [TRIBUNAL_MANDATE_TYPEHASH, mandate.adjuster, fillsHash]
    )
  )
}

/**
 * Derive the claim hash for Tribunal
 * Matches Solidity deriveClaimHash (uses LOCK_TYPEHASH and COMPACT_TYPEHASH_WITH_MANDATE)
 *
 * @param compact - The batch compact
 * @param mandateHash - The mandate hash
 * @returns The claim hash
 */
export function deriveTribunalClaimHash(compact: BatchCompact, mandateHash: Hex): Hex {
  return deriveTribunalClaimHashWithTypehash(
    compact,
    mandateHash,
    LOCK_TYPEHASH,
    COMPACT_WITH_TRIBUNAL_MANDATE_TYPEHASH
  )
}

/**
 * Derive the adjustment hash for signature verification
 * This matches the hash that gets signed by the adjuster
 *
 * IMPORTANT: Unlike Exarch, Tribunal's adjustment does NOT include:
 * - adjuster address (recovered from signature instead)
 * - nonce (replay protection is via claim hash uniqueness)
 *
 * @param adjustment - The adjustment parameters (without signature)
 * @param claimHash - The claim hash this adjustment applies to
 * @returns The adjustment hash
 */
export function deriveTribunalAdjustmentHash(
  adjustment: {
    fillIndex: bigint
    targetBlock: bigint
    supplementalPriceCurve: bigint[]
    validityConditions: Hex
  },
  claimHash: Hex
): Hex {
  // Hash the supplemental price curve array
  const curveHash = keccak256(
    encodePacked(
      adjustment.supplementalPriceCurve.map(() => 'uint256'),
      adjustment.supplementalPriceCurve
    )
  )

  return keccak256(
    encodeAbiParameters(
      [
        { name: 'typehash', type: 'bytes32' },
        { name: 'claimHash', type: 'bytes32' },
        { name: 'fillIndex', type: 'uint256' },
        { name: 'targetBlock', type: 'uint256' },
        { name: 'curveHash', type: 'bytes32' },
        { name: 'validityConditions', type: 'bytes32' },
      ],
      [
        TRIBUNAL_ADJUSTMENT_TYPEHASH,
        claimHash,
        adjustment.fillIndex,
        adjustment.targetBlock,
        curveHash,
        adjustment.validityConditions,
      ]
    )
  )
}

/**
 * Derive the adjustment hash from a full Adjustment type
 * Convenience function that extracts the relevant fields
 *
 * @param adjustment - The full adjustment (adjuster and signature are ignored)
 * @param claimHash - The claim hash this adjustment applies to
 * @returns The adjustment hash
 */
export function deriveTribunalAdjustmentHashFromAdjustment(
  adjustment: Omit<Adjustment, 'adjustmentAuthorization'>,
  claimHash: Hex
): Hex {
  return deriveTribunalAdjustmentHash(
    {
      fillIndex: adjustment.fillIndex,
      targetBlock: adjustment.targetBlock,
      supplementalPriceCurve: adjustment.supplementalPriceCurve,
      validityConditions: adjustment.validityConditions,
    },
    claimHash
  )
}

// ============ Claimant Encoding ============

/**
 * Encode a lock tag and address into a bytes32 claimant
 *
 * Layout: lockTag (96 bits, upper) | address (160 bits, lower)
 * bytes32 claimant = uint256(bytes32(lockTag)) | uint256(uint160(address))
 *
 * @param lockTag - The lock tag (bytes12)
 * @param address - The claimant address
 * @returns The encoded claimant (bytes32)
 */
export function encodeClaimant(lockTag: Hex, address: Address): Hex {
  // lockTag is bytes12 (96 bits), stored in upper bits
  // address is 160 bits, stored in lower bits
  const lockTagBigInt = BigInt(lockTag)
  const addressBigInt = BigInt(address)

  // Combine: lockTag in upper 96 bits, address in lower 160 bits
  const combined = (lockTagBigInt << 160n) | addressBigInt

  return ('0x' + combined.toString(16).padStart(64, '0')) as Hex
}

/**
 * Decoded claimant components
 */
export interface DecodedClaimant {
  lockTag: Hex
  address: Address
}

/**
 * Decode a bytes32 claimant into lock tag and address
 *
 * @param claimant - The encoded claimant (bytes32)
 * @returns The decoded lock tag and address
 */
export function decodeClaimant(claimant: Hex): DecodedClaimant {
  const value = BigInt(claimant)

  // Extract lower 160 bits for address
  const addressBigInt = value & ((1n << 160n) - 1n)
  const address = ('0x' + addressBigInt.toString(16).padStart(40, '0')) as Address

  // Extract upper 96 bits for lockTag (as bytes12)
  const lockTagBigInt = value >> 160n
  const lockTag = ('0x' + lockTagBigInt.toString(16).padStart(24, '0')) as Hex

  return { lockTag, address }
}

// ============ Validity Conditions ============

/**
 * Decoded validity conditions
 */
export interface DecodedValidityConditions {
  exclusiveBidder: Address | null
  blockWindow: number
}

/**
 * Encode exclusive bidder and block window into bytes32 validity conditions
 *
 * Layout: blockWindow (96 bits, upper) | exclusiveBidder (160 bits, lower)
 *
 * @param exclusiveBidder - Address of exclusive bidder (undefined or 0x0 = any bidder)
 * @param blockWindow - Number of blocks the adjustment is valid for (0 = no limit, 1 = exact block)
 * @returns The encoded validity conditions (bytes32)
 */
export function encodeValidityConditions(exclusiveBidder?: Address, blockWindow?: number): Hex {
  const bidderValue = exclusiveBidder ? BigInt(exclusiveBidder) : 0n
  const windowValue = BigInt(blockWindow || 0)

  // Pack: upper 96 bits = blockWindow, lower 160 bits = exclusiveBidder
  const combined = (windowValue << 160n) | bidderValue

  return ('0x' + combined.toString(16).padStart(64, '0')) as Hex
}

/**
 * Decode bytes32 validity conditions into exclusive bidder and block window
 *
 * @param conditions - The encoded validity conditions (bytes32)
 * @returns The decoded exclusive bidder and block window
 */
export function decodeValidityConditions(conditions: Hex): DecodedValidityConditions {
  const value = BigInt(conditions)

  // Extract lower 160 bits for exclusive bidder
  const bidderBigInt = value & ((1n << 160n) - 1n)
  const exclusiveBidder = bidderBigInt === 0n ? null : (('0x' + bidderBigInt.toString(16).padStart(40, '0')) as Address)

  // Extract upper 96 bits for block window
  const blockWindow = Number(value >> 160n)

  return { exclusiveBidder, blockWindow }
}

// ============ ERC-7683 Encoding ============

/**
 * Encode origin data for ERC7683Tribunal.fill
 *
 * The origin data contains:
 * - BatchClaim (compact + signatures)
 * - FillParameters (mandate for this fill)
 * - Fill hashes array
 *
 * This matches the expected ABI encoding: abi.encode(claim, mandate, fillHashes)
 *
 * @param data - The origin data to encode
 * @returns Encoded origin data as bytes
 */
export function encodeERC7683OriginData(data: ERC7683OriginData): Hex {
  const { claim, mandate, fillHashes } = data

  // Build the BatchCompact tuple for encoding
  const compactTuple = [
    claim.compact.arbiter,
    claim.compact.sponsor,
    claim.compact.nonce,
    claim.compact.expires,
    claim.compact.commitments.map((c) => [c.lockTag, c.token, c.amount]),
  ]

  // Build the BatchClaim tuple
  const claimTuple = [compactTuple, claim.sponsorSignature, claim.allocatorSignature]

  // Build the FillParameters tuple
  const mandateTuple = [
    mandate.chainId,
    mandate.tribunal,
    mandate.expires,
    mandate.components.map((c) => [c.fillToken, c.minimumFillAmount, c.recipient, c.applyScaling]),
    mandate.baselinePriorityFee,
    mandate.scalingFactor,
    mandate.priceCurve,
    mandate.recipientCallback.map((cb) => [
      cb.chainId,
      [
        cb.compact.arbiter,
        cb.compact.sponsor,
        cb.compact.nonce,
        cb.compact.expires,
        cb.compact.commitments.map((c) => [c.lockTag, c.token, c.amount]),
      ],
      cb.mandateHash,
      cb.context,
    ]),
    mandate.salt,
  ]

  return encodeAbiParameters(
    [
      {
        name: 'claim',
        type: 'tuple',
        components: [
          {
            name: 'compact',
            type: 'tuple',
            components: [
              { name: 'arbiter', type: 'address' },
              { name: 'sponsor', type: 'address' },
              { name: 'nonce', type: 'uint256' },
              { name: 'expires', type: 'uint256' },
              {
                name: 'commitments',
                type: 'tuple[]',
                components: [
                  { name: 'lockTag', type: 'bytes12' },
                  { name: 'token', type: 'address' },
                  { name: 'amount', type: 'uint256' },
                ],
              },
            ],
          },
          { name: 'sponsorSignature', type: 'bytes' },
          { name: 'allocatorSignature', type: 'bytes' },
        ],
      },
      {
        name: 'mandate',
        type: 'tuple',
        components: [
          { name: 'chainId', type: 'uint256' },
          { name: 'tribunal', type: 'address' },
          { name: 'expires', type: 'uint256' },
          {
            name: 'components',
            type: 'tuple[]',
            components: [
              { name: 'fillToken', type: 'address' },
              { name: 'minimumFillAmount', type: 'uint256' },
              { name: 'recipient', type: 'address' },
              { name: 'applyScaling', type: 'bool' },
            ],
          },
          { name: 'baselinePriorityFee', type: 'uint256' },
          { name: 'scalingFactor', type: 'uint256' },
          { name: 'priceCurve', type: 'uint256[]' },
          {
            name: 'recipientCallback',
            type: 'tuple[]',
            components: [
              { name: 'chainId', type: 'uint256' },
              {
                name: 'compact',
                type: 'tuple',
                components: [
                  { name: 'arbiter', type: 'address' },
                  { name: 'sponsor', type: 'address' },
                  { name: 'nonce', type: 'uint256' },
                  { name: 'expires', type: 'uint256' },
                  {
                    name: 'commitments',
                    type: 'tuple[]',
                    components: [
                      { name: 'lockTag', type: 'bytes12' },
                      { name: 'token', type: 'address' },
                      { name: 'amount', type: 'uint256' },
                    ],
                  },
                ],
              },
              { name: 'mandateHash', type: 'bytes32' },
              { name: 'context', type: 'bytes' },
            ],
          },
          { name: 'salt', type: 'bytes32' },
        ],
      },
      { name: 'fillHashes', type: 'bytes32[]' },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [claimTuple as any, mandateTuple as any, fillHashes]
  )
}

/**
 * Encode filler data for ERC7683Tribunal.fill
 *
 * The filler data contains:
 * - Adjustment (adjuster, fillIndex, targetBlock, supplementalPriceCurve, validityConditions, authorization)
 * - Claimant (bytes32: lockTag || address)
 * - Fill block (0 = current block)
 *
 * This matches ERC7683Tribunal.getFillerData: abi.encode(adjustment, claimant, fillBlock)
 *
 * @param data - The filler data to encode
 * @returns Encoded filler data as bytes
 */
export function encodeERC7683FillerData(data: ERC7683FillerData): Hex {
  const { adjustment, claimant, fillBlock } = data

  // Build the Adjustment tuple
  const adjustmentTuple = [
    adjustment.adjuster,
    adjustment.fillIndex,
    adjustment.targetBlock,
    adjustment.supplementalPriceCurve,
    adjustment.validityConditions,
    adjustment.adjustmentAuthorization,
  ]

  return encodeAbiParameters(
    [
      {
        name: 'adjustment',
        type: 'tuple',
        components: [
          { name: 'adjuster', type: 'address' },
          { name: 'fillIndex', type: 'uint256' },
          { name: 'targetBlock', type: 'uint256' },
          { name: 'supplementalPriceCurve', type: 'uint256[]' },
          { name: 'validityConditions', type: 'bytes32' },
          { name: 'adjustmentAuthorization', type: 'bytes' },
        ],
      },
      { name: 'claimant', type: 'bytes32' },
      { name: 'fillBlock', type: 'uint256' },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [adjustmentTuple as any, claimant, fillBlock]
  )
}

// Re-export TribunalBatchClaim for convenience
export type { TribunalBatchClaim, ERC7683OriginData, ERC7683FillerData }
