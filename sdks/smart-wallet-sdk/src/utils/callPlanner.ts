import { AbiCoder } from '@ethersproject/abi'
import { BigNumber } from '@ethersproject/bignumber'

import { Call } from '../types'

const CALL_TUPLE_ABI = "tuple(address,bytes,uint256)"

/**
 * CallPlanner is used to encode a series Calls
 */
export class CallPlanner {
  abiEncoder: AbiCoder = new AbiCoder()
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
  get value(): BigNumber {
    return this.calls.reduce((acc, call) =>  acc.add(call.value ?? 0), BigNumber.from(0))
  }

  /**
   * abi encode the Calls[]
   */
  encode(): string {
    if (this.calls.length === 0) {
      throw new Error("No calls to encode")
    }
    const values = this.calls.map((call) => [call.to, call.data, call.value])
    return this.abiEncoder.encode([
      CALL_TUPLE_ABI
    ], values)
  }

  /**
   * Add a command to execute a call
   * @param to The target address of the call
   * @param data The calldata for the call
   * @param value The ETH value to send with the call
   */
  add(to: string, data: string, value: string): CallPlanner {
    this.calls.push({ to, data, value })
    return this
  }
}
