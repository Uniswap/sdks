/**
 * Claim type definitions
 * These mirror the Solidity structs for claim operations
 */

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
  allocatorData: `0x${string}` // bytes
  sponsorSignature: `0x${string}` // bytes (empty if caller is sponsor/emissary)
  sponsor: `0x${string}` // address
  nonce: bigint // uint256
  expires: bigint // uint256 (timestamp)
  witness: `0x${string}` // bytes32
  witnessTypestring: string // string
  id: bigint // uint256 (ERC6909 id)
  allocatedAmount: bigint // uint256
  claimants: Component[] // Component[]
}

/**
 * A batch claim against multiple compacts
 */
export interface BatchClaim {
  allocatorData: `0x${string}` // bytes
  sponsorSignature: `0x${string}` // bytes
  sponsor: `0x${string}` // address
  nonce: bigint // uint256
  expires: bigint // uint256
  witness: `0x${string}` // bytes32
  witnessTypestring: string // string
  idsAndAmounts: Array<{ id: bigint; amount: bigint }> // IdAndAmount[]
  claimants: Component[] // Component[]
}

/**
 * A multichain claim element
 */
export interface MultichainClaimElement {
  chainId: bigint // uint256
  idsAndAmounts: Array<{ id: bigint; amount: bigint }> // IdAndAmount[]
  claimants: Component[] // Component[]
}

/**
 * A multichain claim
 */
export interface MultichainClaim {
  allocatorData: `0x${string}` // bytes
  sponsorSignature: `0x${string}` // bytes
  sponsor: `0x${string}` // address
  nonce: bigint // uint256
  expires: bigint // uint256
  witness: `0x${string}` // bytes32
  witnessTypestring: string // string
  elements: MultichainClaimElement[] // Element[]
}

/**
 * A batch multichain claim
 */
export interface BatchMultichainClaim {
  allocatorData: `0x${string}` // bytes
  sponsorSignature: `0x${string}` // bytes
  sponsor: `0x${string}` // address
  nonce: bigint // uint256
  expires: bigint // uint256
  witness: `0x${string}` // bytes32
  witnessTypestring: string // string
  elements: MultichainClaimElement[] // Element[]
}

/**
 * ID and amount pair for batch operations
 */
export interface IdAndAmount {
  id: bigint // uint256
  amount: bigint // uint256
}

