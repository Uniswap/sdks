/**
 * Claim type definitions
 * These mirror the Solidity structs for claim operations
 */
import type { Address, Hex } from 'viem';
/**
 * A component of a claim, specifying a claimant and amount
 * The claimant field is a packed value: (lockTag << 160) | recipient
 */
export interface Component {
    claimant: bigint;
    amount: bigint;
}
/**
 * A single claim against a compact
 */
export interface Claim {
    allocatorData: Hex;
    sponsorSignature: Hex;
    sponsor: Address;
    nonce: bigint;
    expires: bigint;
    witness: Hex;
    witnessTypestring: string;
    id: bigint;
    allocatedAmount: bigint;
    claimants: Component[];
}
/**
 * A batch claim against multiple compacts
 */
export interface BatchClaim {
    allocatorData: Hex;
    sponsorSignature: Hex;
    sponsor: Address;
    nonce: bigint;
    expires: bigint;
    witness: Hex;
    witnessTypestring: string;
    claims: BatchClaimComponent[];
}
/**
 * A batch claim component for batch multichain claims
 * Named "portions" in Solidity
 */
export interface BatchClaimComponent {
    id: bigint;
    allocatedAmount: bigint;
    portions: Component[];
}
/**
 * A multichain claim against a single compact
 * Uses hash references (additionalChains) to coordinate cross-chain claims
 */
export interface MultichainClaim {
    allocatorData: Hex;
    sponsorSignature: Hex;
    sponsor: Address;
    nonce: bigint;
    expires: bigint;
    witness: Hex;
    witnessTypestring: string;
    id: bigint;
    allocatedAmount: bigint;
    claimants: Component[];
    additionalChains: Hex[];
}
/**
 * A batch multichain claim against multiple compacts
 * Uses hash references (additionalChains) to coordinate cross-chain batch claims
 */
export interface BatchMultichainClaim {
    allocatorData: Hex;
    sponsorSignature: Hex;
    sponsor: Address;
    nonce: bigint;
    expires: bigint;
    witness: Hex;
    witnessTypestring: string;
    claims: BatchClaimComponent[];
    additionalChains: Hex[];
}
/**
 * An exogenous multichain claim against a single compact
 * Similar to MultichainClaim but with explicit chain identification
 */
export interface ExogenousMultichainClaim {
    allocatorData: Hex;
    sponsorSignature: Hex;
    sponsor: Address;
    nonce: bigint;
    expires: bigint;
    witness: Hex;
    witnessTypestring: string;
    id: bigint;
    allocatedAmount: bigint;
    claimants: Component[];
    additionalChains: Hex[];
    chainIndex: bigint;
    notarizedChainId: bigint;
}
/**
 * An exogenous batch multichain claim against multiple compacts
 * Similar to BatchMultichainClaim but with explicit chain identification
 */
export interface ExogenousBatchMultichainClaim {
    allocatorData: Hex;
    sponsorSignature: Hex;
    sponsor: Address;
    nonce: bigint;
    expires: bigint;
    witness: Hex;
    witnessTypestring: string;
    claims: BatchClaimComponent[];
    additionalChains: Hex[];
    chainIndex: bigint;
    notarizedChainId: bigint;
}
/**
 * ID and amount pair for batch operations
 */
export interface IdAndAmount {
    id: bigint;
    amount: bigint;
}
