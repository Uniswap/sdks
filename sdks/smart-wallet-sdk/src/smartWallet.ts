import { ChainId } from '@uniswap/sdk-core'
import { encodeAbiParameters, encodeFunctionData } from 'viem'

import { abi } from '../abis/MinimalDelegation.json'

import { MODE_TYPE_ABI_PARAMETERS, ModeType, SMART_WALLET_ADDRESSES } from './constants'
import { Call, MethodParameters, ExecuteOptions, AdvancedCall } from './types'
import { CallPlanner } from './utils'

/**
 * Main SDK class for interacting with ERC7821-compatible smart wallets
 */
export class SmartWallet {
  /**
   * Creates method parameters for executing a simple batch of calls through a smart wallet
   * @dev does not support opData
   * @param calls Array of calls to encode
   * @returns Method parameters with calldata and value
   */
  public static encodeCalls(calls: Call[], options: ExecuteOptions = {}): MethodParameters {
    const mode = this.getModeFromOptions(options)
    if(mode != ModeType.BATCHED_CALL && mode != ModeType.BATCHED_CALL_CAN_REVERT) {
      throw new Error(`Invalid mode: ${mode}`)
    }
    const planner = new CallPlanner(calls)
    
    const executionData = planner.encode()
    const encoded = this._encodeExecute(mode, executionData)
    return {
      calldata: encoded,
      value: planner.value
    }
  }

  /// To be implemented
  public static encodeAdvancedCalls(calls: AdvancedCall[], opData: string, _options: ExecuteOptions = {}): MethodParameters {
    throw new Error('Not implemented')
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
      return ModeType.BATCHED_CALL_CAN_REVERT
    }

    return ModeType.BATCHED_CALL
  }

  /** Internal methods */
  
  protected static _encodeExecute(mode: ModeType, data: `0x${string}`): `0x${string}` {
    return encodeFunctionData({
      abi,
      functionName: 'execute',
      args: [
        mode,
        data
      ]
    })
  }

  protected static _encodeBatchedCallSupportsOpdata(
    planner: CallPlanner,
    opData: `0x${string}`
  ): `0x${string}` {
    return encodeAbiParameters(
      MODE_TYPE_ABI_PARAMETERS[ModeType.BATCHED_CALL_SUPPORTS_OPDATA],
      [planner.encode(), opData]
    )
  }
}
