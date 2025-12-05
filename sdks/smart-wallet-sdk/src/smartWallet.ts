import { ChainId } from '@uniswap/sdk-core'
import { concatHex, encodeFunctionData } from 'viem'

import abi from '../abis/MinimalDelegationEntry.json'

import { ModeType, getSmartWalletAddress } from './constants'
import { Call, MethodParameters, ExecuteOptions } from './types'
import { CallPlanner } from './utils'
import { BatchedCallPlanner } from './utils/batchedCallPlanner'

/**
 * Main SDK class for interacting with Uniswap smart wallet contracts
 */
export class SmartWallet {
  /**
   * Creates method parameters for a UserOperation to be executed through a smart wallet
   * @dev Compatible with EntryPoint versions v0.7.0 and v0.8.0 (not v0.6.0)
   * 
   * @param calls Array of calls to encode
   * @param options Basic options for the execution
   * @returns Method parameters with userOp calldata and value
   */
  public static encodeUserOp(calls: Call[], options: ExecuteOptions = {}): MethodParameters {
    const planner = new CallPlanner(calls)
    const batchedCallPlanner = new BatchedCallPlanner(planner, options.revertOnFailure)

    // UserOp callData format: executeUserOp selector (0x8dd7712f) + abi.encode(abi.encode(Call[]), revertOnFailure)

    // The EntryPoint recognizes this selector and calls executeUserOp(userOp, userOpHash) on the account.
    // The account then extracts the execution data from userOp.callData (slicing off the selector).
    
    // We manually concat the selector + encoded data rather than using encodeFunctionData because
    // the callData is not a standard ABI-encoded function call to executeUserOp.
    const EXECUTE_USER_OP_SELECTOR = '0x8dd7712f'
    const calldata = concatHex([EXECUTE_USER_OP_SELECTOR, batchedCallPlanner.encode()])

    return {
      calldata,
      value: planner.value,
    }
  }

  /**
   * Creates method parameters for executing a simple batch of calls through a smart wallet
   * @param calls Array of calls to encode
   * @param options Basic options for the execution
   * @returns Method parameters with calldata and value
   */
  public static encodeBatchedCall(calls: Call[], options: ExecuteOptions = {}): MethodParameters {
    const planner = new CallPlanner(calls)
    const batchedCallPlanner = new BatchedCallPlanner(planner, options.revertOnFailure)

    const encoded = encodeFunctionData({
      abi,
      functionName: '0x99e1d016', // execute(((address,uint256,bytes)[],bool))
      args: [batchedCallPlanner.toBatchedCall()],
    })
    return {
      calldata: encoded,
      value: planner.value,
    }
  }

  /**
   * ERC7821 compatible entrypoint for executing batched calls through the contract
   * @deprecated use encodeBatchedCall instead unless you need to use the ERC7821 entrypoint
   */
  public static encodeERC7821BatchedCall(calls: Call[], options: ExecuteOptions = {}): MethodParameters {
    const mode = this.getModeFromOptions(options)
    if (mode != ModeType.BATCHED_CALL && mode != ModeType.BATCHED_CALL_CAN_REVERT) {
      throw new Error(`Invalid mode: ${mode}`)
    }

    const planner = new CallPlanner(calls)

    const executionData = planner.encode()
    const encoded = this._encodeERC7821Execute(mode, executionData)
    return {
      calldata: encoded,
      value: planner.value,
    }
  }

  /**
   * Creates a call to execute a method through a smart wallet
   * @dev can be refactored to return a Transaction object as well
   * @param methodParameters The method parameters to execute
   * @param chainId The chain ID for the smart wallet
   * @returns The call to execute
   */
  public static createExecute(methodParameters: MethodParameters, chainId: ChainId): Call {
    const address = getSmartWalletAddress(chainId)
    return {
      to: address,
      data: methodParameters.calldata,
      value: methodParameters.value,
    }
  }

  /**
   * Get the mode type from the options
   */
  public static getModeFromOptions(options: ExecuteOptions): ModeType {
    if (options.revertOnFailure) {
      return ModeType.BATCHED_CALL
    }

    return ModeType.BATCHED_CALL_CAN_REVERT
  }

  /** Internal methods */

  protected static _encodeERC7821Execute(mode: ModeType, data: `0x${string}`): `0x${string}` {
    return encodeFunctionData({
      abi,
      functionName: '0xe9ae5c53', // execute(bytes32,bytes)
      args: [mode, data],
    })
  }
}
