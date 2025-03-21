/**
 * Represents a call to a smart contract
 */
export interface Call {
  /** The address of the contract to call */
  to: `0x${string}`
  /** The encoded calldata for the call */
  data: `0x${string}`
  /** The amount of ETH to send with the call */
  value: bigint
  /** The chain ID for the call (for client-side use) */
  chainId?: number | string
}

/**
 * Represents a call with advanced options like partial failure handling
 */
export interface AdvancedCall extends Call {
  /** Whether to revert the entire transaction if this call fails */
  revertOnFailure?: boolean
}

/**
 * Parameters for method execution
 */
export interface MethodParameters {
  /** Encoded calldata to be sent to the user's delegated account */
  calldata: `0x${string}`
  /** The amount of ETH to send with the transaction */
  value: bigint
}

/**
 * Options for the execute method
 */
export interface ExecuteOptions {
  /** Whether to allow the call to revert */
  revertOnFailure?: boolean
}

export interface AdvancedExecuteOptions extends ExecuteOptions {
  /** Whether the call supports opData */
  senderIsUser?: boolean
}
