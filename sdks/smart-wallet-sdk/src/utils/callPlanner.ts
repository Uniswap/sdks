import { BigNumber } from '@ethersproject/bignumber'

import { Call } from '../types'

/**
 * ExecuteCallPlanner is used to build a sequence of calls for an `executionData`
 */
export class ExecuteCallPlanner {
  calls: Call[]

  constructor() {
    this.calls = []
  }

  get value(): BigNumber {
    return this.calls.reduce((acc, call) =>  acc.add(call.value ?? 0), BigNumber.from(0))
  }

  /**
   * abi encode the Calls[]
   */
  encode(): string {
    return '0x'
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

  /**
   * Add a command to authorize an operator
   * @param key The key data to authorize
   */
  addAuthorize(_key: string): ExecuteCallPlanner {
    throw new Error('Not implemented')
  }

  /**
   * Add a command to revoke an operator
   * @param operator The operator address to revoke
   */
  addRevoke(_operator: string): ExecuteCallPlanner {
    throw new Error('Not implemented')
  }
}
