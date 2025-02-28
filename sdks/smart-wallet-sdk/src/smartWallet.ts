import { ChainId } from '@uniswap/sdk-core'
import { Interface } from '@ethersproject/abi'
import { Call, MethodParameters, ExecuteOptions } from './types'
import { ExecuteCallPlanner, ModeEncoder } from './utils'
import { ModeType, SMART_WALLET_ADDRESSES } from './constants'
import { abi } from '../abis/MinimalDelegation.json'

// This will be uncommented once typechain is run
// import { SmartWalletABI } from './contracts'

/**
 * Main SDK class for interacting with ERC7821-compatible smart wallets
 */
export class SmartWallet {
  /**
   * Interface for the Smart Wallet contract (will be initialized from ABI)
   */
  public static INTERFACE: Interface = new Interface(abi)

  /**
   * Creates method parameters for executing a batch of calls through a smart wallet
   * @param calls Array of calls to encode
   * @param options Execution options
   * @param chainId The chain ID for the calls
   * @returns Method parameters with calldata and value
   */
  public static encodeExecute(calls: Call[], options: ExecuteOptions = {}): MethodParameters {
    const mode = this.getModeFromOptions(options)
    const planner = new ExecuteCallPlanner()
    for (const call of calls) {
      planner.add(call.to, call.data, call.value)
    }
    const data = ModeEncoder.encode(mode, planner)
    const encoded = this.INTERFACE.encodeFunctionData('execute(bytes32,bytes)', [
      mode,
      data
    ])
    return {
      calldata: encoded,
      value: planner.value.toString()
    }
  }

  /**
   * Creates a call to execute a method through a smart wallet
   * @param methodParameters The method parameters to execute
   * @param chainId The chain ID for the smart wallet
   * @returns The call to execute
   */
  public static createExecute(methodParameters: MethodParameters, chainId: ChainId ): Call {
    if(!SMART_WALLET_ADDRESSES[chainId]) {
      throw new Error(`Smart wallet not found for chainId: ${chainId}`)
    }
    return {
      to: SMART_WALLET_ADDRESSES[chainId],
      data: methodParameters.calldata,
      value: methodParameters.value
    }
  }

  protected static getModeFromOptions(options: ExecuteOptions): ModeType {
    if(options.senderIsUser) {
      if(options.revertOnFailure) {
        return ModeType.BATCHED_CALL_SUPPORTS_OPDATA_AND_CAN_REVERT
      }
      return ModeType.BATCHED_CALL_SUPPORTS_OPDATA
    }

    if(options.revertOnFailure) {
      return ModeType.BATCHED_CAN_REVERT_CALL
    }

    return ModeType.BATCHED_CALL
  }
}
