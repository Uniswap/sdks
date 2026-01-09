import { encodeAbiParameters } from 'viem'

import { Call } from '../types'

// Define the ABI parameter type for the call tuple
export const CALL_ABI_PARAMS = [
  {
    type: 'tuple[]',
    components: [
      { type: 'address', name: 'to' },
      { type: 'uint256', name: 'value' },
      { type: 'bytes', name: 'data' },
    ],
  },
] as const

/**
 * CallPlanner is used to encode a series Calls
 */
export class CallPlanner {
  calls: Call[]

  /**
   * Create a new CallPlanner
   * @param calls optionally initialize with a list of calls
   */
  constructor(calls: Call[] = []) {
    this.calls = calls
  }

  /**
   * Get the total value of the calls
   */
  get value(): bigint {
    return this.calls.reduce((acc, call) => {
      // Convert string values to bigint
      const callValue = typeof call.value === 'string' ? BigInt(call.value || '0') : call.value || 0n

      return acc + callValue
    }, 0n)
  }

  /**
   * abi encode the Calls[]
   */
  encode(): `0x${string}` {
    if (this.calls.length === 0) {
      throw new Error('No calls to encode')
    }

    return encodeAbiParameters(CALL_ABI_PARAMS, [this.calls])
  }

  /**
   * Add a command to execute a call
   * @param to The target address of the call
   * @param value The ETH value to send with the call
   * @param data The calldata for the call
   */
  add(to: `0x${string}`, value: bigint, data: `0x${string}`): CallPlanner {
    this.calls.push({ to, value, data })
    return this
  }
}
