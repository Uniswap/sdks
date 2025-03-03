import { BigNumber } from '@ethersproject/bignumber'

import { Call } from '../types'
import { AbiCoder } from '@ethersproject/abi'

/**
 * ExecuteCallPlanner is used to build a sequence of calls for an `executionData`
 */
export class ExecuteCallPlanner {
  abiEncoder: AbiCoder = new AbiCoder()
  calls: Call[]

  /**
   * Create a new ExecuteCallPlanner
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
    return this.abiEncoder.encode(["(address,bytes,uint256)"], this.calls)
  }

  /**
   * Add a command to execute a call
   * @param to The target address of the call
   * @param data The calldata for the call
   * @param value The ETH value to send with the call
   */
  add(to: string, data: string, value: string): ExecuteCallPlanner {
    this.calls.push({ to, data, value })
    return this
  }
}
