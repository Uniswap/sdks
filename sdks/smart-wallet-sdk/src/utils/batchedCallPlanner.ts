import { encodeAbiParameters } from 'viem'

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
      { type: 'bool', name: 'shouldRevert' }
    ]
  }
] as const

/**
 * BatchedCallPlanner is used to encode a BatchedCall, which are `calls` and `shouldRevert`
 */
export class BatchedCallPlanner {
  callPlanner: CallPlanner
  shouldRevert: boolean

  /**
   * Create a new BatchedCallPlanner
   * @param callPlanner optionally initialize with a CallPlanner
   * @param shouldRevert optionally initialize with a boolean for shouldRevert
   */
  constructor(callPlanner: CallPlanner, shouldRevert = true) {
    this.callPlanner = callPlanner
    this.shouldRevert = shouldRevert
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
        calls: this.callPlanner.calls,
        shouldRevert: this.shouldRevert
      }
    ])
  }
}
