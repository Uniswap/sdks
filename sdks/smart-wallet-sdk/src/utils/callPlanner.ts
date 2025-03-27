import { encodeAbiParameters, hashTypedData } from 'viem'

import { Call } from '../types'
import { DOMAIN_NAME, DOMAIN_VERSION } from '../constants'

// Define the ABI parameter type for the call tuple
const CALL_ABI_PARAMS = [
  {
    type: 'tuple[]',
    components: [
      { type: 'address', name: 'to' },
      { type: 'bytes', name: 'data' },
      { type: 'uint256', name: 'value' }
    ]
  }
] as const

const TYPES = {
  Call: [
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'data', type: 'bytes' }
  ],
  Execute: [
    { name: 'calls', type: 'Call[]' }
  ]
}

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
      const callValue = typeof call.value === 'string' 
        ? BigInt(call.value || '0') 
        : (call.value || 0n)
      
      return acc + callValue
    }, 0n)
  }

  /**
   * abi encode the Calls[]
   */
  encode(): `0x${string}` {
    if (this.calls.length === 0) {
      throw new Error("No calls to encode")
    }

    
    return encodeAbiParameters(CALL_ABI_PARAMS, [this.calls])
  }

  /**
   * Hash the calls using EIP-712
   * @param verifyingContract The verifying contract (should be the signer's account address)
   * @param chainId The chain ID
   * @returns The hash of the calls
   */
  hashTypedData(verifyingContract: `0x${string}`, chainId: number): `0x${string}` {
    return hashTypedData({
      domain: {
        name: DOMAIN_NAME,
        version: DOMAIN_VERSION,
        chainId,
        verifyingContract
      },
      types: TYPES,
      primaryType: 'Execute',
      message: {
        calls : this.calls
      }
    })
  }

  /**
   * Add a command to execute a call
   * @param to The target address of the call
   * @param data The calldata for the call
   * @param value The ETH value to send with the call
   */
  add(to: `0x${string}`, data: `0x${string}`, value: bigint): CallPlanner {
    this.calls.push({ to, data, value })
    return this
  }
}
