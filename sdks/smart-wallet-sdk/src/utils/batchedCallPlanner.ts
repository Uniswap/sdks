import { encodeAbiParameters } from 'viem'

import { FormattedBatchedCall } from '../types'

import { CallPlanner } from './callPlanner'

// Define the ABI parameter type for the call tuple
export const BATCHED_CALL_ABI_PARAMS = [
  {
    type: 'tuple',
    components: [
      { 
        type: 'tuple[]',
        components: [
          { type: 'address', name: 'to' },
          { type: 'uint256', name: 'value' },
          { type: 'bytes', name: 'data' }
        ],
        name: 'calls'
      },
      { type: 'bool', name: 'revertOnFailure' }
    ]
  }
] as const

/**
 * BatchedCallPlanner is used to encode a BatchedCall, which are `calls` and `revertOnFailure`
 */
export class BatchedCallPlanner {
  callPlanner: CallPlanner
  revertOnFailure: boolean

  /**
   * Create a new BatchedCallPlanner
   * @param callPlanner optionally initialize with a CallPlanner
   * @param revertOnFailure optionally initialize with a boolean for revertOnFailure
   */
  constructor(callPlanner: CallPlanner, revertOnFailure = true) {
    this.callPlanner = callPlanner
    this.revertOnFailure = revertOnFailure
  }

  /**
   * Get the total value of the calls
   */
  get value(): bigint {
    return this.callPlanner.value
  }

  /**
   * Add a command to execute a call
   * @param to The target address of the call
   * @param value The ETH value to send with the call
   * @param data The calldata for the call
   */
  add(to: `0x${string}`, value: bigint, data: `0x${string}`): BatchedCallPlanner {
    this.callPlanner.add(to, value, data)
    return this
  }

  /**
   * Encode the BatchedCall
   */
  encode(): `0x${string}` {
    return encodeAbiParameters(BATCHED_CALL_ABI_PARAMS, [
      {
        calls: this.callPlanner.toCalls(),
        revertOnFailure: this.revertOnFailure
      }
    ])
  }

  toBatchedCall(): FormattedBatchedCall {
    return {
      calls: this.callPlanner.toCalls(),
      revertOnFailure: this.revertOnFailure
    }
  }
}
