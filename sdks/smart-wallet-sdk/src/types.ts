/// Contract specific batched call interface
export interface BatchedCall {
  calls: Call[]
  shouldRevert: boolean
}

/**
 * ERC 5792 style Call interface
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
  /** Whether the execute call should revert if a call fails */
  shouldRevert?: boolean
}
