/**
 * Tribunal type definitions for cross-chain fill orchestration
 *
 * Based on: tribunal/src/types/TribunalStructs.sol
 */

import { Address, Hex } from 'viem'

import { BatchCompact, Lock } from './eip712'

/**
 * Fill component specifying output requirements
 */
export interface FillComponent {
  /** Token to be provided (address(0) for native) */
  fillToken: Address
  /** Minimum fill amount */
  minimumFillAmount: bigint
  /** Recipient of the tokens */
  recipient: Address
  /** Whether to apply priority fee scaling to the minimum amount */
  applyScaling: boolean
}

/**
 * Parameters for a fill operation (same-chain or cross-chain)
 */
export interface FillParameters {
  /** Chain ID where fill occurs (same as current if same-chain, otherwise cross-chain) */
  chainId: bigint
  /** Tribunal contract address where the fill is performed */
  tribunal: Address
  /** Fill expiration timestamp */
  expires: bigint
  /** Fill components defining output requirements */
  components: FillComponent[]
  /** Base fee threshold where scaling kicks in */
  baselinePriorityFee: bigint
  /** Fee scaling multiplier (1e18 = baseline) */
  scalingFactor: bigint
  /** Price curve: packed block durations and scaling factors */
  priceCurve: bigint[]
  /** Optional recipient callback for bridge operations */
  recipientCallback: RecipientCallback[]
  /** Salt for uniqueness */
  salt: Hex
}

/**
 * Recipient callback for bridge operations
 * Enables composability: filler receives tokens + compact to register on target chain
 */
export interface RecipientCallback {
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
 * Mandate structure defining fill orchestration
 * This is the witness data attached to The Compact claims
 */
export interface Mandate {
  /** Address of the adjuster who can modify fills */
  adjuster: Address
  /** Array of fill operations */
  fills: FillParameters[]
}

/**
 * Adjustment signed by the adjuster to modify a fill
 */
export interface Adjustment {
  /** Adjuster address (not in EIP-712 payload) */
  adjuster: Address
  /** Index of the fill to adjust */
  fillIndex: bigint
  /** Target block for price curve evaluation */
  targetBlock: bigint
  /** Supplemental price curve to apply */
  supplementalPriceCurve: bigint[]
  /** Optional validity conditions (blocks past target + exclusive filler) */
  validityConditions: Hex
  /** Adjuster's signature (not in EIP-712 payload) */
  adjustmentAuthorization: Hex
}

/**
 * Fill recipient for event emissions
 */
export interface FillRecipient {
  fillAmount: bigint
  recipient: Address
}

/**
 * Fill requirement details for callbacks
 */
export interface FillRequirement {
  /** Token to be provided */
  fillToken: Address
  /** Minimum specified fill amount */
  minimumFillAmount: bigint
  /** Actual fill amount that must be provided */
  realizedFillAmount: bigint
}

/**
 * Dispatch parameters for cross-chain callbacks
 */
export interface DispatchParameters {
  /** Chain ID for the dispatch */
  chainId: bigint
  /** Target address for the callback */
  target: Address
  /** Amount of native tokens to send */
  value: bigint
  /** Arbitrary context data */
  context: Hex
}

/**
 * Disposition details assigned by filler
 * Indicates a successful fill with optional claim modifications
 */
export interface DispositionDetails {
  /** Claimant to receive the claim (bytes32: lockTag || address) */
  claimant: Hex
  /** Scaling factor to apply */
  scalingFactor: bigint
}

// ============ BatchClaim for claimAndFill ============

/**
 * Batch claim structure for claimAndFill operations
 * Combines compact with signatures needed to claim directly
 */
export interface TribunalBatchClaim {
  /** The batch compact defining the claim */
  compact: BatchCompact
  /** Sponsor's signature authorizing the compact */
  sponsorSignature: Hex
  /** Allocator's signature (if required by the lock type) */
  allocatorSignature: Hex
}

// ============ Callback Interface Types ============

/**
 * Parameters for the ITribunalCallback.tribunalCallback function
 * Implementers receive these parameters when a fill completes
 */
export interface TribunalCallbackParams {
  /** The claim hash identifying this fill */
  claimHash: Hex
  /** The commitments being claimed */
  commitments: Lock[]
  /** The amounts actually claimed (after scaling) */
  claimedAmounts: bigint[]
  /** Fill requirements for the filler */
  fillRequirements: FillRequirement[]
}

/**
 * Parameters for the IDispatchCallback.dispatchCallback function
 * Used for cross-chain message relaying
 */
export interface DispatchCallbackParams {
  /** Chain ID of the destination chain */
  chainId: bigint
  /** The original compact */
  compact: BatchCompact
  /** The mandate hash */
  mandateHash: Hex
  /** The claim hash */
  claimHash: Hex
  /** The claimant (bytes32: lockTag || address) */
  claimant: Hex
  /** Scaling factor applied to claims */
  claimReductionScalingFactor: bigint
  /** The claim amounts after scaling */
  claimAmounts: bigint[]
  /** Arbitrary context data */
  context: Hex
}

/**
 * Parameters for the IRecipientCallback.recipientCallback function
 * Used for bridge operations where filler receives tokens + compact to register
 */
export interface RecipientCallbackParams {
  /** Source chain ID */
  chainId: bigint
  /** Claim hash from source chain */
  sourceClaimHash: Hex
  /** Mandate hash from source chain */
  sourceMandateHash: Hex
  /** Fill token address */
  fillToken: Address
  /** Fill amount received */
  fillAmount: bigint
  /** Compact to register on target chain */
  targetCompact: BatchCompact
  /** Mandate hash for target compact */
  targetMandateHash: Hex
  /** Arbitrary context data */
  context: Hex
}

// ============ ERC-7683 Types ============

/**
 * Origin data for ERC7683Tribunal.fill
 * Encoded using abi.encode(claim, mandate, fillHashes)
 */
export interface ERC7683OriginData {
  /** The batch claim with signatures */
  claim: TribunalBatchClaim
  /** The fill parameters for this fill */
  mandate: FillParameters
  /** Array of fill hashes from the mandate */
  fillHashes: Hex[]
}

/**
 * Filler data for ERC7683Tribunal.fill
 * Encoded using abi.encode(adjustment, claimant, fillBlock)
 */
export interface ERC7683FillerData {
  /** Adjustment from the adjuster */
  adjustment: Adjustment
  /** Claimant (bytes32: lockTag || address) */
  claimant: Hex
  /** Block number for fill (0 = current block) */
  fillBlock: bigint
}

// ============ Arg Detail for Callbacks ============

/**
 * Argument detail for callback encoding
 * Used in tribunal callback context data
 */
export interface ArgDetail {
  /** Index where data starts */
  offset: bigint
  /** Length of the data */
  length: bigint
}
