/**
 * Claim type definitions
 * These mirror the Solidity structs for claim operations
 */

import type { Address, Hex } from 'viem'

/**
 * A component of a claim, specifying a claimant and amount
 * The claimant field is a packed value: (lockTag << 160) | recipient
 */
export interface Component {
  claimant: bigint // uint256 (packed: lockTag + recipient)
  amount: bigint // uint256
}

/**
 * A single claim against a compact
 */
export interface Claim {
  allocatorData: Hex // bytes
  sponsorSignature: Hex // bytes (empty if caller is sponsor/emissary)
  sponsor: Address // address
  nonce: bigint // uint256
  expires: bigint // uint256 (timestamp)
  witness: Hex // bytes32
  witnessTypestring: string // string
  id: bigint // uint256 (ERC6909 id)
  allocatedAmount: bigint // uint256
  claimants: Component[] // Component[]
}

/**
 * A batch claim against multiple compacts
 */
export interface BatchClaim {
  allocatorData: Hex // bytes
  sponsorSignature: Hex // bytes
  sponsor: Address // address
  nonce: bigint // uint256
  expires: bigint // uint256
  witness: Hex // bytes32
  witnessTypestring: string // string
  claims: BatchClaimComponent[] // BatchClaimComponent[] - matches Solidity
}

/**
 * A batch claim component for batch multichain claims
 * Named "portions" in Solidity
 */
export interface BatchClaimComponent {
  id: bigint // uint256
  allocatedAmount: bigint // uint256
  portions: Component[] // Component[]
}

/**
 * A multichain claim against a single compact
 * Uses hash references (additionalChains) to coordinate cross-chain claims
 */
export interface MultichainClaim {
  allocatorData: Hex // bytes
  sponsorSignature: Hex // bytes
  sponsor: Address // address
  nonce: bigint // uint256
  expires: bigint // uint256
  witness: Hex // bytes32
  witnessTypestring: string // string
  id: bigint // uint256 (single resource ID)
  allocatedAmount: bigint // uint256 (single amount)
  claimants: Component[] // Component[] (for this chain)
  additionalChains: Hex[] // bytes32[] (hashes to other chain elements)
}

/**
 * A batch multichain claim against multiple compacts
 * Uses hash references (additionalChains) to coordinate cross-chain batch claims
 */
export interface BatchMultichainClaim {
  allocatorData: Hex // bytes
  sponsorSignature: Hex // bytes
  sponsor: Address // address
  nonce: bigint // uint256
  expires: bigint // uint256
  witness: Hex // bytes32
  witnessTypestring: string // string
  claims: BatchClaimComponent[] // BatchClaimComponent[]
  additionalChains: Hex[] // bytes32[] (hashes to other chain elements)
}

/**
 * An exogenous multichain claim against a single compact
 * Similar to MultichainClaim but with explicit chain identification
 */
export interface ExogenousMultichainClaim {
  allocatorData: Hex // bytes
  sponsorSignature: Hex // bytes
  sponsor: Address // address
  nonce: bigint // uint256
  expires: bigint // uint256
  witness: Hex // bytes32
  witnessTypestring: string // string
  id: bigint // uint256 (single resource ID)
  allocatedAmount: bigint // uint256 (single amount)
  claimants: Component[] // Component[] (for this chain)
  additionalChains: Hex[] // bytes32[] (hashes to other chain elements)
  chainIndex: bigint // uint256 (index of this chain in the multichain set)
  notarizedChainId: bigint // uint256 (explicit chain ID for notarization)
}

/**
 * An exogenous batch multichain claim against multiple compacts
 * Similar to BatchMultichainClaim but with explicit chain identification
 */
export interface ExogenousBatchMultichainClaim {
  allocatorData: Hex // bytes
  sponsorSignature: Hex // bytes
  sponsor: Address // address
  nonce: bigint // uint256
  expires: bigint // uint256
  witness: Hex // bytes32
  witnessTypestring: string // string
  claims: BatchClaimComponent[] // BatchClaimComponent[]
  additionalChains: Hex[] // bytes32[] (hashes to other chain elements)
  chainIndex: bigint // uint256 (index of this chain in the multichain set)
  notarizedChainId: bigint // uint256 (explicit chain ID for notarization)
}

/**
 * ID and amount pair for batch operations
 */
export interface IdAndAmount {
  id: bigint // uint256
  amount: bigint // uint256
}
