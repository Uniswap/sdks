/**
 * Tribunal type definitions for cross-chain fill orchestration
 *
 * Based on: tribunal/src/types/TribunalStructs.sol
 */
import { BatchCompact } from './eip712';
/**
 * Fill component specifying output requirements
 */
export interface FillComponent {
    /** Token to be provided (address(0) for native) */
    fillToken: `0x${string}`;
    /** Minimum fill amount */
    minimumFillAmount: bigint;
    /** Recipient of the tokens */
    recipient: `0x${string}`;
    /** Whether to apply priority fee scaling to the minimum amount */
    applyScaling: boolean;
}
/**
 * Parameters for a fill operation (same-chain or cross-chain)
 */
export interface FillParameters {
    /** Chain ID where fill occurs (same as current if same-chain, otherwise cross-chain) */
    chainId: bigint;
    /** Tribunal contract address where the fill is performed */
    tribunal: `0x${string}`;
    /** Fill expiration timestamp */
    expires: bigint;
    /** Fill components defining output requirements */
    components: FillComponent[];
    /** Base fee threshold where scaling kicks in */
    baselinePriorityFee: bigint;
    /** Fee scaling multiplier (1e18 = baseline) */
    scalingFactor: bigint;
    /** Price curve: packed block durations and scaling factors */
    priceCurve: bigint[];
    /** Optional recipient callback for bridge operations */
    recipientCallback: RecipientCallback[];
    /** Salt for uniqueness */
    salt: `0x${string}`;
}
/**
 * Recipient callback for bridge operations
 * Enables composability: filler receives tokens + compact to register on target chain
 */
export interface RecipientCallback {
    /** Target chain ID for the callback */
    chainId: bigint;
    /** Compact to be registered on target chain */
    compact: BatchCompact;
    /** Hash of the mandate for the target chain compact */
    mandateHash: `0x${string}`;
    /** Arbitrary context data */
    context: `0x${string}`;
}
/**
 * Mandate structure defining fill orchestration
 * This is the witness data attached to The Compact claims
 */
export interface Mandate {
    /** Address of the adjuster who can modify fills */
    adjuster: `0x${string}`;
    /** Array of fill operations */
    fills: FillParameters[];
}
/**
 * Adjustment signed by the adjuster to modify a fill
 */
export interface Adjustment {
    /** Adjuster address (not in EIP-712 payload) */
    adjuster: `0x${string}`;
    /** Index of the fill to adjust */
    fillIndex: bigint;
    /** Target block for price curve evaluation */
    targetBlock: bigint;
    /** Supplemental price curve to apply */
    supplementalPriceCurve: bigint[];
    /** Optional validity conditions (blocks past target + exclusive filler) */
    validityConditions: `0x${string}`;
    /** Adjuster's signature (not in EIP-712 payload) */
    adjustmentAuthorization: `0x${string}`;
}
/**
 * Fill recipient for event emissions
 */
export interface FillRecipient {
    fillAmount: bigint;
    recipient: `0x${string}`;
}
/**
 * Fill requirement details for callbacks
 */
export interface FillRequirement {
    /** Token to be provided */
    fillToken: `0x${string}`;
    /** Minimum specified fill amount */
    minimumFillAmount: bigint;
    /** Actual fill amount that must be provided */
    realizedFillAmount: bigint;
}
/**
 * Dispatch parameters for cross-chain callbacks
 */
export interface DispatchParameters {
    /** Chain ID for the dispatch */
    chainId: bigint;
    /** Target address for the callback */
    target: `0x${string}`;
    /** Amount of native tokens to send */
    value: bigint;
    /** Arbitrary context data */
    context: `0x${string}`;
}
/**
 * Disposition details assigned by filler
 * Indicates a successful fill with optional claim modifications
 */
export interface DispositionDetails {
    /** Claimant to receive the claim */
    claimant: `0x${string}`;
    /** Scaling factor to apply */
    scalingFactor: bigint;
}
