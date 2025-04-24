import { ChainId } from '@uniswap/sdk-core'
import { encodeFunctionData } from 'viem'

import abi from '../abis/MinimalDelegationEntry.json'

import { ModeType, SMART_WALLET_ADDRESSES } from './constants'
import { Call, MethodParameters, ExecuteOptions } from './types'
import { CallPlanner } from './utils'
import { BatchedCallPlanner } from './utils/batchedCallPlanner'

/**
 * Main SDK class for interacting with Uniswap smart wallet contracts
 */
export class SmartWallet {
  /**
   * Creates method parameters for executing a simple batch of calls through a smart wallet
   * @param calls Array of calls to encode
   * @param options Basic options for the execution
   * @returns Method parameters with calldata and value
   */
  public static encodeBatchedCall(calls: readonly Call[], options: ExecuteOptions = {}): MethodParameters {
    const planner = new CallPlanner(calls)
    const batchedCallPlanner = new BatchedCallPlanner(planner, options.revertOnFailure)
    
    const encoded = encodeFunctionData({
      abi,
      functionName: '0x99e1d016', // execute(((address,uint256,bytes)[],bool))
      args: [batchedCallPlanner.toBatchedCall()]
    })
    return {
      calldata: encoded,
      value: planner.value
    }
  }

  /**
   * ERC7821 compatible entrypoint for executing batched calls through the contract
   * @deprecated use encodeBatchedCall instead unless you need to use the ERC7821 entrypoint
   */
  public static encodeERC7821BatchedCall(calls: Call[], options: ExecuteOptions = {}): MethodParameters {
    const mode = this.getModeFromOptions(options)
    if(mode != ModeType.BATCHED_CALL && mode != ModeType.BATCHED_CALL_CAN_REVERT) {
      throw new Error(`Invalid mode: ${mode}`)
    }

    const planner = new CallPlanner(calls)
    
    const executionData = planner.encode()
    const encoded = this._encodeERC7821Execute(mode, executionData)
    return {
      calldata: encoded,
      value: planner.value
    }
  }

  /**
   * Creates a call to execute a method through a smart wallet
   * @dev can be refactored to return a Transaction object as well
   * @param methodParameters The method parameters to execute
   * @param chainId The chain ID for the smart wallet
   * @returns The call to execute
   */
  public static createExecute(methodParameters: MethodParameters, chainId: ChainId ): Call {
    const address = SMART_WALLET_ADDRESSES[chainId]
    if(!address) {
      throw new Error(`Smart wallet not found for chainId: ${chainId}`)
    }
    return {
      to: address,
      data: methodParameters.calldata,
      value: methodParameters.value
    }
  }

  /**
   * Get the mode type from the options
   */
  public static getModeFromOptions(options: ExecuteOptions): ModeType {
    if(options.revertOnFailure) {
      return ModeType.BATCHED_CALL;
    }

    return ModeType.BATCHED_CALL_CAN_REVERT
  }

  /** Internal methods */
  
  protected static _encodeERC7821Execute(mode: ModeType, data: `0x${string}`): `0x${string}` {
    return encodeFunctionData({
      abi,
      functionName: '0xe9ae5c53', // execute(bytes32,bytes)
      args: [
        mode,
        data
      ]
    })
  }
}
