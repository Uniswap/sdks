/**
 * Encoding utilities for Exarch protocol
 *
 * Provides hash computation, claimant encoding, validity conditions encoding,
 * BidState packing/unpacking, and amount derivation utilities.
 *
 * These functions match the Solidity implementations in Exarch.sol
 */

import { keccak256, encodeAbiParameters, encodePacked, toHex, Address, Hex } from 'viem'

import {
  ExarchFillParameters,
  ExarchFillComponent,
  ExarchRecipientCallback,
  BidState,
  UnpackedBidState,
  DecodedClaimant,
  DecodedValidityConditions,
  RescindRefundParams,
  ExarchDeriveAmountsParams,
  ExarchDerivedAmounts,
} from '../types/exarch'
import { BatchCompact, Lock } from '../types/eip712'

// ============ Type Hash Constants ============

/**
 * Exarch Mandate typestring
 * Must match MANDATE_TYPESTRING in ExarchTypeHashes.sol
 */
export const EXARCH_MANDATE_TYPESTRING =
  'Mandate(address adjuster,address legate,Mandate_Fill[] fills)Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)Mandate_Fill(uint256 chainId,address exarch,uint256 expires,Mandate_FillComponent[] components,uint256 bondAmount,uint256 earnestAmount,uint256 holdPeriod,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)Mandate_Lock(bytes12 lockTag,address token,uint256 amount)Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes32 mandateHash,bytes context)'

/**
 * Exarch Fill typestring
 * Must match MANDATE_FILL_TYPESTRING in ExarchTypeHashes.sol
 */
export const EXARCH_FILL_TYPESTRING =
  'Mandate_Fill(uint256 chainId,address exarch,uint256 expires,Mandate_FillComponent[] components,uint256 bondAmount,uint256 earnestAmount,uint256 holdPeriod,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)Mandate(address adjuster,address legate,Mandate_Fill[] fills)Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)Mandate_Lock(bytes12 lockTag,address token,uint256 amount)Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes32 mandateHash,bytes context)'

/**
 * Exarch FillComponent typestring
 */
export const EXARCH_FILL_COMPONENT_TYPESTRING =
  'Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)'

/**
 * Exarch RecipientCallback typestring
 */
export const EXARCH_RECIPIENT_CALLBACK_TYPESTRING =
  'Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes32 mandateHash,bytes context)Mandate(address adjuster,address legate,Mandate_Fill[] fills)Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)Mandate_Fill(uint256 chainId,address exarch,uint256 expires,Mandate_FillComponent[] components,uint256 bondAmount,uint256 earnestAmount,uint256 holdPeriod,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)Mandate_Lock(bytes12 lockTag,address token,uint256 amount)'

/**
 * Exarch BatchCompact typestring for mandate
 */
export const EXARCH_BATCH_COMPACT_TYPESTRING =
  'Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)Mandate(address adjuster,address legate,Mandate_Fill[] fills)Mandate_Fill(uint256 chainId,address exarch,uint256 expires,Mandate_FillComponent[] components,uint256 bondAmount,uint256 earnestAmount,uint256 holdPeriod,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)Mandate_Lock(bytes12 lockTag,address token,uint256 amount)Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes32 mandateHash,bytes context)'

/**
 * Exarch Lock typestring
 */
export const EXARCH_LOCK_TYPESTRING = 'Mandate_Lock(bytes12 lockTag,address token,uint256 amount)'

/**
 * The Compact BatchCompact with Exarch mandate typestring
 */
export const COMPACT_WITH_EXARCH_MANDATE_TYPESTRING =
  'BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Lock[] commitments,Mandate mandate)Lock(bytes12 lockTag,address token,uint256 amount)Mandate(address adjuster,address legate,Mandate_Fill[] fills)Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)Mandate_Fill(uint256 chainId,address exarch,uint256 expires,Mandate_FillComponent[] components,uint256 bondAmount,uint256 earnestAmount,uint256 holdPeriod,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)Mandate_Lock(bytes12 lockTag,address token,uint256 amount)Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes32 mandateHash,bytes context)'

/**
 * Exarch Adjustment typestring
 */
export const EXARCH_ADJUSTMENT_TYPESTRING =
  'Adjustment(address adjuster,bytes32 claimHash,uint256 fillIndex,uint256 targetBlock,uint256[] supplementalPriceCurve,bytes32 validityConditions,uint256 nonce)'

/**
 * Exarch witness typestring (partial, provided to The Compact)
 */
export const EXARCH_WITNESS_TYPESTRING =
  'address adjuster,address legate,Mandate_Fill[] fills)Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)Mandate_Fill(uint256 chainId,address exarch,uint256 expires,Mandate_FillComponent[] components,uint256 bondAmount,uint256 earnestAmount,uint256 holdPeriod,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)Mandate_Lock(bytes12 lockTag,address token,uint256 amount)Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes32 mandateHash,bytes context'

// Compute type hashes
export const EXARCH_MANDATE_TYPEHASH: Hex = keccak256(toHex(EXARCH_MANDATE_TYPESTRING))
export const EXARCH_FILL_TYPEHASH: Hex = keccak256(toHex(EXARCH_FILL_TYPESTRING))
export const EXARCH_FILL_COMPONENT_TYPEHASH: Hex = keccak256(toHex(EXARCH_FILL_COMPONENT_TYPESTRING))
export const EXARCH_RECIPIENT_CALLBACK_TYPEHASH: Hex = keccak256(toHex(EXARCH_RECIPIENT_CALLBACK_TYPESTRING))
export const EXARCH_BATCH_COMPACT_TYPEHASH: Hex = keccak256(toHex(EXARCH_BATCH_COMPACT_TYPESTRING))
export const EXARCH_LOCK_TYPEHASH: Hex = keccak256(toHex(EXARCH_LOCK_TYPESTRING))
export const COMPACT_WITH_EXARCH_MANDATE_TYPEHASH: Hex = keccak256(toHex(COMPACT_WITH_EXARCH_MANDATE_TYPESTRING))
export const EXARCH_ADJUSTMENT_TYPEHASH: Hex = keccak256(toHex(EXARCH_ADJUSTMENT_TYPESTRING))

// Import LOCK_TYPEHASH from registration to avoid duplicate export
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
export function deriveExarchFillComponentHash(component: ExarchFillComponent): Hex {
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
        EXARCH_FILL_COMPONENT_TYPEHASH,
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
export function deriveExarchFillComponentsHash(components: ExarchFillComponent[]): Hex {
  const componentHashes = components.map(deriveExarchFillComponentHash)
  return keccak256(encodePacked(['bytes32[]'], [componentHashes]))
}

/**
 * Derive the commitments hash using the Lock typehash
 * Matches Solidity: keccak256(abi.encodePacked(commitmentHashes))
 *
 * @param commitments - Array of lock commitments
 * @param typehash - The typehash to use (LOCK_TYPEHASH or EXARCH_LOCK_TYPEHASH)
 * @returns The commitments hash
 */
export function deriveCommitmentsHash(commitments: Lock[], typehash: Hex): Hex {
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
 * Matches Solidity _deriveClaimHashWithTypehash
 *
 * @param compact - The batch compact
 * @param mandateHash - The mandate hash
 * @param lockTypehash - The lock typehash
 * @param compactTypehash - The compact typehash
 * @returns The claim hash
 */
export function deriveClaimHashWithTypehash(
  compact: BatchCompact,
  mandateHash: Hex,
  lockTypehash: Hex,
  compactTypehash: Hex
): Hex {
  const commitmentsHash = deriveCommitmentsHash(compact.commitments, lockTypehash)
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
 * Matches Solidity _deriveRecipientCallbackHash
 *
 * @param recipientCallback - Array of recipient callbacks (0 or 1 elements)
 * @returns The callback hash
 */
export function deriveRecipientCallbackHash(recipientCallback: ExarchRecipientCallback[]): Hex {
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
  const compactHash = deriveClaimHashWithTypehash(
    callback.compact,
    callback.mandateHash,
    EXARCH_LOCK_TYPEHASH,
    EXARCH_BATCH_COMPACT_TYPEHASH
  )

  // Hash the callback struct
  const callbackHash = keccak256(
    encodeAbiParameters(
      [
        { name: 'typehash', type: 'bytes32' },
        { name: 'chainId', type: 'uint256' },
        { name: 'compactHash', type: 'bytes32' },
        { name: 'mandateHash', type: 'bytes32' },
        { name: 'contextHash', type: 'bytes32' },
      ],
      [
        EXARCH_RECIPIENT_CALLBACK_TYPEHASH,
        callback.chainId,
        compactHash,
        callback.mandateHash,
        keccak256(callback.context),
      ]
    )
  )

  // Return keccak256(abi.encodePacked(callbackHash))
  return keccak256(encodePacked(['bytes32'], [callbackHash]))
}

/**
 * Derive the fill hash from fill parameters
 * Matches Solidity _deriveFillHash
 *
 * @param fill - The fill parameters
 * @returns The fill hash
 */
export function deriveExarchFillHash(fill: ExarchFillParameters): Hex {
  const componentsHash = deriveExarchFillComponentsHash(fill.components)
  const priceCurveHash = keccak256(
    encodePacked(
      fill.priceCurve.map(() => 'uint256'),
      fill.priceCurve
    )
  )
  const recipientCallbackHash = deriveRecipientCallbackHash(fill.recipientCallback)

  // Pack all values as uint256 and use encodePacked
  const args: bigint[] = [
    BigInt(EXARCH_FILL_TYPEHASH),
    fill.chainId,
    BigInt(fill.exarch),
    fill.expires,
    BigInt(componentsHash),
    fill.bondAmount,
    fill.earnestAmount,
    fill.holdPeriod,
    fill.baselinePriorityFee,
    fill.scalingFactor,
    BigInt(priceCurveHash),
    BigInt(recipientCallbackHash),
    BigInt(fill.salt),
  ]

  return keccak256(
    encodePacked(
      args.map(() => 'uint256'),
      args
    )
  )
}

/**
 * Derive the mandate hash from fill parameters
 * Matches Solidity _deriveMandateHash
 *
 * @param adjuster - The adjuster address
 * @param legate - The legate address
 * @param fillHashes - Array of fill hashes
 * @returns The mandate hash
 */
export function deriveExarchMandateHash(adjuster: Address, legate: Address, fillHashes: Hex[]): Hex {
  const fillsHash = keccak256(encodePacked(['bytes32[]'], [fillHashes]))
  return keccak256(
    encodeAbiParameters(
      [
        { name: 'typehash', type: 'bytes32' },
        { name: 'adjuster', type: 'address' },
        { name: 'legate', type: 'address' },
        { name: 'fillsHash', type: 'bytes32' },
      ],
      [EXARCH_MANDATE_TYPEHASH, adjuster, legate, fillsHash]
    )
  )
}

/**
 * Derive the claim hash for Exarch
 * Matches Solidity _deriveClaimHash (uses LOCK_TYPEHASH and COMPACT_TYPEHASH_WITH_MANDATE)
 *
 * @param compact - The batch compact
 * @param mandateHash - The mandate hash
 * @returns The claim hash
 */
export function deriveExarchClaimHash(compact: BatchCompact, mandateHash: Hex): Hex {
  return deriveClaimHashWithTypehash(compact, mandateHash, LOCK_TYPEHASH, COMPACT_WITH_EXARCH_MANDATE_TYPEHASH)
}

/**
 * Derive the adjustment hash for signature verification
 * This matches the hash that gets signed by the adjuster
 *
 * @param adjustment - The adjustment parameters (without signature)
 * @param claimHash - The claim hash this adjustment applies to
 * @returns The adjustment hash
 */
export function deriveExarchAdjustmentHash(
  adjustment: {
    adjuster: Address
    fillIndex: bigint
    targetBlock: bigint
    supplementalPriceCurve: bigint[]
    validityConditions: Hex
    nonce: bigint
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
        { name: 'adjuster', type: 'address' },
        { name: 'claimHash', type: 'bytes32' },
        { name: 'fillIndex', type: 'uint256' },
        { name: 'targetBlock', type: 'uint256' },
        { name: 'curveHash', type: 'bytes32' },
        { name: 'validityConditions', type: 'bytes32' },
        { name: 'nonce', type: 'uint256' },
      ],
      [
        EXARCH_ADJUSTMENT_TYPEHASH,
        adjustment.adjuster,
        claimHash,
        adjustment.fillIndex,
        adjustment.targetBlock,
        curveHash,
        adjustment.validityConditions,
        adjustment.nonce,
      ]
    )
  )
}

/**
 * Derive the execution hash (used for legate verification)
 * Matches Solidity: keccak256(abi.encode(fillInstructions, claimHash))
 *
 * @param fillInstructions - Array of fill instructions
 * @param claimHash - The claim hash
 * @returns The execution hash
 */
export function deriveExecutionHash(
  fillInstructions: Array<{ fillToken: Address; fillAmount: bigint; recipient: Address }>,
  claimHash: Hex
): Hex {
  // Encode fill instructions array
  const instructionsEncoded = encodeAbiParameters(
    [
      {
        name: 'fillInstructions',
        type: 'tuple[]',
        components: [
          { name: 'fillToken', type: 'address' },
          { name: 'fillAmount', type: 'uint256' },
          { name: 'recipient', type: 'address' },
        ],
      },
      { name: 'claimHash', type: 'bytes32' },
    ],
    [fillInstructions, claimHash]
  )

  return keccak256(instructionsEncoded)
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

// ============ BidState Utilities ============

/**
 * Bit positions for packed BidState data
 * Pack values: aggregateBond(96) | bidExpiry(64) | fillIndex(16) | filled(8) | cancelled(8)
 */
const AGGREGATE_BOND_MASK = (1n << 96n) - 1n
const BID_EXPIRY_SHIFT = 96n
const BID_EXPIRY_MASK = (1n << 64n) - 1n
const FILL_INDEX_SHIFT = 160n
const FILL_INDEX_MASK = (1n << 16n) - 1n
const FILLED_SHIFT = 176n
const CANCELLED_SHIFT = 184n

/**
 * Unpack BidState.packedData into individual fields
 *
 * @param bidState - The bid state from contract
 * @returns Unpacked bid state with all fields accessible
 */
export function unpackBidState(bidState: BidState): UnpackedBidState {
  const packed = bidState.packedData

  return {
    claimant: bidState.claimant,
    scalingFactor: bidState.scalingFactor,
    aggregateBond: packed & AGGREGATE_BOND_MASK,
    bidExpiry: (packed >> BID_EXPIRY_SHIFT) & BID_EXPIRY_MASK,
    fillIndex: Number((packed >> FILL_INDEX_SHIFT) & FILL_INDEX_MASK),
    filled: ((packed >> FILLED_SHIFT) & 1n) !== 0n,
    cancelled: ((packed >> CANCELLED_SHIFT) & 1n) !== 0n,
  }
}

/**
 * Pack individual fields into BidState.packedData
 * Useful for testing and mocking
 *
 * @param params - The individual fields to pack
 * @returns The packed uint256 value
 */
export function packBidStateData(params: {
  aggregateBond: bigint
  bidExpiry: bigint
  fillIndex: number
  filled: boolean
  cancelled: boolean
}): bigint {
  return (
    (params.aggregateBond & AGGREGATE_BOND_MASK) |
    ((params.bidExpiry & BID_EXPIRY_MASK) << BID_EXPIRY_SHIFT) |
    ((BigInt(params.fillIndex) & FILL_INDEX_MASK) << FILL_INDEX_SHIFT) |
    ((params.filled ? 1n : 0n) << FILLED_SHIFT) |
    ((params.cancelled ? 1n : 0n) << CANCELLED_SHIFT)
  )
}

/**
 * Check if there's an active bid (claimant != 0)
 *
 * @param claimant - The claimant bytes32 value
 * @returns True if there is an active bid
 */
export function hasActiveBid(claimant: Hex): boolean {
  return BigInt(claimant) !== 0n
}

// ============ Rescindable Bond Calculation ============

/**
 * Calculate the refund amount for bid rescission
 * Uses linear interpolation between submission and expiry blocks
 *
 * Formula: rescindableBond * (currentBlock - submissionBlock) / (expiryBlock - submissionBlock)
 *
 * @param params - Parameters for calculation
 * @returns The forfeit amount (what bidder loses)
 */
export function calculateRescindForfeit(params: RescindRefundParams): bigint {
  const { rescindableBond, submissionBlock, currentBlock, expiryBlock } = params

  // If current block is at or after expiry, no refund
  if (currentBlock >= expiryBlock) {
    return rescindableBond
  }

  // If current block is at submission, forfeit everything (linear decay)
  if (currentBlock <= submissionBlock) {
    return 0n
  }

  // Linear interpolation: forfeit increases over time
  const elapsed = currentBlock - submissionBlock
  const total = expiryBlock - submissionBlock

  return (rescindableBond * elapsed) / total
}

/**
 * Calculate the refund amount for bid rescission
 *
 * @param params - Parameters for calculation
 * @returns The refund amount (what bidder gets back)
 */
export function calculateRescindRefund(params: RescindRefundParams): bigint {
  return params.rescindableBond - calculateRescindForfeit(params)
}

// ============ Amount Derivation ============

/**
 * Neutral scaling factor (1e18 = 100%)
 */
export const NEUTRAL_SCALING_FACTOR = 1000000000000000000n

/**
 * Derive fill and claim amounts based on scaling factor
 * Matches Solidity _deriveAmounts logic
 *
 * For scaling > 1e18 (exact-in): Filler provides more, claim amounts unchanged
 * For scaling < 1e18 (exact-out): Claim amounts reduced, fill amounts unchanged
 *
 * @param params - Parameters for amount derivation
 * @returns Derived fill and claim amounts
 */
export function deriveAmounts(params: ExarchDeriveAmountsParams): ExarchDerivedAmounts {
  const { commitments, components, scalingFactor } = params

  const fillAmounts: bigint[] = []
  const claimAmounts: bigint[] = []

  // Derive claim amounts from commitments
  for (const commitment of commitments) {
    if (scalingFactor >= NEUTRAL_SCALING_FACTOR) {
      // Exact-in: claim amounts unchanged
      claimAmounts.push(commitment.amount)
    } else {
      // Exact-out: claim amounts scaled down
      // claimAmount = commitment.amount * scalingFactor / 1e18
      claimAmounts.push((commitment.amount * scalingFactor) / NEUTRAL_SCALING_FACTOR)
    }
  }

  // Derive fill amounts from components
  for (const component of components) {
    if (!component.applyScaling || scalingFactor <= NEUTRAL_SCALING_FACTOR) {
      // No scaling or exact-out: fill amounts unchanged
      fillAmounts.push(component.minimumFillAmount)
    } else {
      // Exact-in with scaling: fill amounts increased
      // fillAmount = minimumFillAmount * scalingFactor / 1e18
      fillAmounts.push((component.minimumFillAmount * scalingFactor) / NEUTRAL_SCALING_FACTOR)
    }
  }

  return { fillAmounts, claimAmounts }
}
