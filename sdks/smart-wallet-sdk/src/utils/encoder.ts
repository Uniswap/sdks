import { encodeAbiParameters, type Address } from 'viem'

import { MODE_TYPE_ABI_PARAMETERS, ModeType } from '../constants'

import { CallPlanner } from './callPlanner'

/**
 * Utility functions for encoding execution data for different ERC-7579 modes
 * supports ERC-7821 modes
 */
export abstract class ModeEncoder {
  public static encode(mode: ModeType, planner: CallPlanner, opData?: string): string {
    const calls = planner.calls
    
    // Transform calls into the expected format for viem encoding
    const formattedCalls = calls.map(call => ({
      to: call.to as Address,
      value: typeof call.value === 'string' ? BigInt(call.value || "0") : (call.value || 0n),
      data: call.data as `0x${string}`
    }))
    
    switch (mode) {
      case ModeType.BATCHED_CALL:
      case ModeType.BATCHED_CALL_CAN_REVERT:
        return this.encodeBatchedCall(formattedCalls);
      case ModeType.BATCHED_CALL_SUPPORTS_OPDATA:
      case ModeType.BATCHED_CALL_SUPPORTS_OPDATA_AND_CAN_REVERT:
        if (!opData) throw new Error('opData is required for CALL_WITH_OPDATA mode');
        return this.encodeBatchedCallSupportsOpdata(formattedCalls, opData);
      default:
        throw new Error(`Unsupported mode type: ${mode}`);
    }
  }

  protected static encodeBatchedCall(formattedCalls: Array<{
    to: Address, 
    value: bigint, 
    data: `0x${string}`
  }>): string {
    return encodeAbiParameters(
      MODE_TYPE_ABI_PARAMETERS[ModeType.BATCHED_CALL],
      [formattedCalls]
    )
  }

  protected static encodeBatchedCallSupportsOpdata(
    formattedCalls: Array<{ to: Address, value: bigint, data: `0x${string}` }>, 
    opData: string
  ): string {
    return encodeAbiParameters(
      MODE_TYPE_ABI_PARAMETERS[ModeType.BATCHED_CALL_SUPPORTS_OPDATA],
      [formattedCalls, opData as `0x${string}`]
    )
  }
}
