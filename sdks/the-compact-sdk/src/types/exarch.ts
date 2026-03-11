/**
 * Exarch type definitions for bonded source-chain auctions
 *
 * Exarch runs auctions on the origin chain where input tokens reside,
 * unlike Tribunal which runs auctions on the destination chain.
 *
 * Based on: exarch/src/types/ExarchStructs.sol
 */

import { Address, Hex } from 'viem'

import { BatchCompact, Lock } from './eip712'

/**
 * Fill component specifying output requirements
 * Same structure as Tribunal FillComponent
 */
export interface ExarchFillComponent {
  /** Token to be provided (address(0) for native) */
  fillToken: Address
  /** Minimum fill amount */
  minimumFillAmount: bigint
  /** Recipient of the tokens */
  recipient: Address
  /** Whether to apply price curve scaling to the minimum amount */
  applyScaling: boolean
}

/**
 * Recipient callback for bridge operations
 * Enables composability: filler receives tokens + compact to register on target chain
 */
export interface ExarchRecipientCallback {
  /** Target chain ID for the callback */
  chainId: bigint
  /** Compact to be registered on target chain */
  compact: BatchCompact
  /** Hash of the mandate for the target chain compact */
  mandateHash: Hex
  /** Arbitrary context data */
  context: Hex
}

/**
 * Parameters for a fill operation in Exarch
 *
 * Key differences from Tribunal:
 * - Uses `exarch` instead of `tribunal`
 * - Includes bonding parameters: bondAmount, earnestAmount, holdPeriod
 */
export interface ExarchFillParameters {
  /** Chain ID where fill occurs */
  chainId: bigint
  /** Exarch contract address on target chain */
  exarch: Address
  /** Fill expiration timestamp */
  expires: bigint
  /** Fill components defining output requirements */
  components: ExarchFillComponent[]
  /** Required bond amount in native tokens */
  bondAmount: bigint
  /** Non-rescindable portion of bond (forfeited unless bid settles) */
  earnestAmount: bigint
  /** Exclusive window duration for active bidder (in blocks) */
  holdPeriod: bigint
  /** Baseline priority fee threshold for competitive scaling */
  baselinePriorityFee: bigint
  /** Scaling factor for priority fee adjustment (1e18 = neutral) */
  scalingFactor: bigint
  /** Price curve: packed block durations and scaling factors */
  priceCurve: bigint[]
  /** Optional recipient callback for bridge operations (0 or 1 elements) */
  recipientCallback: ExarchRecipientCallback[]
  /** Salt for uniqueness */
  salt: Hex
}

/**
 * Mandate structure for Exarch auctions
 *
 * Key difference from Tribunal: includes legate address for cross-chain proof verification
 */
export interface ExarchMandate {
  /** Address of the adjuster who can modify fills */
  adjuster: Address
  /** Address authorized to verify proofs and mark bids as filled */
  legate: Address
  /** Array of fill operations */
  fills: ExarchFillParameters[]
}

/**
 * Adjustment signed by the adjuster to authorize a specific fill
 *
 * Key difference from Tribunal: includes nonce for replay protection
 */
export interface ExarchAdjustment {
  /** Adjuster address (included in EIP-712 payload) */
  adjuster: Address
  /** Index of the fill from fills array */
  fillIndex: bigint
  /** Block where auction begins */
  targetBlock: bigint
  /** Additional price adjustments */
  supplementalPriceCurve: bigint[]
  /** Optional: exclusive bidder address (lower 160 bits) + block window (upper 96 bits) */
  validityConditions: Hex
  /** Nonce for uniqueness (consumed on bid placement to prevent reuse) */
  nonce: bigint
  /** Adjuster's signature (not in EIP-712 payload) */
  adjustmentAuthorization: Hex
}

/**
 * Bid state for a specific claim hash (origin/claim chain only)
 * Raw struct as returned from contract
 */
export interface BidState {
  /** Bidder's preferred claimant identifier (bytes32(0) if no active bid) */
  claimant: Hex
  /** Price scaling factor at bid time (1e18 = no scaling) */
  scalingFactor: bigint
  /** Packed: aggregateBond(96) | bidExpiry(64) | fillIndex(16) | filled(8) | cancelled(8) */
  packedData: bigint
}

/**
 * Unpacked bid state for convenience
 * Provides easy access to individual fields from BidState.packedData
 */
export interface UnpackedBidState {
  /** Bidder's preferred claimant identifier */
  claimant: Hex
  /** Price scaling factor at bid time */
  scalingFactor: bigint
  /** Total accumulated bond amount */
  aggregateBond: bigint
  /** Block number when current bid expires */
  bidExpiry: bigint
  /** Index of the fill from mandate's fills array */
  fillIndex: number
  /** Whether the order has been successfully filled */
  filled: boolean
  /** Whether the sponsor cancelled the order */
  cancelled: boolean
}

/**
 * Simple fill specification for actual fill execution (not signed, not in mandate)
 */
export interface FillInstruction {
  /** Token to provide */
  fillToken: Address
  /** Amount to provide */
  fillAmount: bigint
  /** Token recipient */
  recipient: Address
}

/**
 * Fill requirement details for callbacks
 */
export interface ExarchFillRequirement {
  /** Token to be provided */
  fillToken: Address
  /** Minimum specified fill amount */
  minimumFillAmount: bigint
  /** Actual fill amount that must be provided */
  realizedFillAmount: bigint
}

/**
 * Dispatch callback parameters for cross-chain messaging
 */
export interface ExarchDispatchParameters {
  /** Target chain ID for message */
  chainId: bigint
  /** Callback target address */
  target: Address
  /** Native tokens to send */
  value: bigint
  /** Callback context data */
  context: Hex
}

/**
 * Token permissions for Permit2
 */
export interface TokenPermissions {
  /** Token address */
  token: Address
  /** Token amount */
  amount: bigint
}

/**
 * Deposit details for Permit2 registration
 */
export interface DepositDetails {
  /** Permit2 nonce */
  nonce: bigint
  /** Permit2 deadline */
  deadline: bigint
  /** Lock tag for the resource lock */
  lockTag: Hex
}

/**
 * Permit2 authorization parameters for registration
 */
export interface Permit2Arguments {
  /** Token permissions array */
  permitted: TokenPermissions[]
  /** Deposit details */
  details: DepositDetails
  /** Permit2 signature */
  signature: Hex
}

/**
 * Batch claim structure for claimAndFill operations
 */
export interface ExarchBatchClaim {
  /** Compact parameters */
  compact: BatchCompact
  /** Sponsor's signature */
  sponsorSignature: Hex
  /** Allocator's signature */
  allocatorSignature: Hex
}

/**
 * Auction state as returned from getAuctionState view function
 */
export interface AuctionState {
  /** Address of the current active bidder (address(0) if no active bid) */
  bidder: Address
  /** Total accumulated bond amount */
  bond: bigint
  /** Block number when the current bid expires */
  expiry: bigint
  /** Claimant identifier of the active bidder */
  claimant: Hex
  /** Whether the auction has been successfully filled */
  isFilled: boolean
  /** Whether the sponsor cancelled the auction */
  cancelled: boolean
}

/**
 * Decoded claimant containing lockTag and address
 */
export interface DecodedClaimant {
  /** Lock tag (bytes12) */
  lockTag: Hex
  /** Claimant address */
  address: Address
}

/**
 * Decoded validity conditions
 */
export interface DecodedValidityConditions {
  /** Exclusive bidder address (null if any bidder allowed) */
  exclusiveBidder: Address | null
  /** Block window duration (0 = no limit, 1 = exact block) */
  blockWindow: number
}

/**
 * Parameters for calculating rescind refund
 */
export interface RescindRefundParams {
  /** Rescindable bond amount (bondAmount - earnestAmount) */
  rescindableBond: bigint
  /** Block when bid was submitted */
  submissionBlock: bigint
  /** Current block number */
  currentBlock: bigint
  /** Block when bid expires */
  expiryBlock: bigint
}

/**
 * Parameters for deriving fill and claim amounts (Exarch-specific)
 */
export interface ExarchDeriveAmountsParams {
  /** Lock commitments from the compact */
  commitments: Lock[]
  /** Fill components from the fill parameters */
  components: ExarchFillComponent[]
  /** Scaling factor to apply */
  scalingFactor: bigint
}

/**
 * Result of deriving fill and claim amounts (Exarch-specific)
 */
export interface ExarchDerivedAmounts {
  /** Derived fill amounts for each component */
  fillAmounts: bigint[]
  /** Derived claim amounts for each commitment */
  claimAmounts: bigint[]
}
