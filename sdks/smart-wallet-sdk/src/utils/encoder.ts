import { AbiCoder } from '@ethersproject/abi';

import { MODE_TYPE_ABI_ENCODING, ModeType } from '../constants'

import { ExecuteCallPlanner } from './callPlanner';

/**
 * Utility functions for encoding execution data for different ERC-7579 modes
 * supports ERC-7821 modes
 */
export abstract class ModeEncoder {
  protected static abiEncoder = new AbiCoder()

  public static encode(mode: ModeType, planner: ExecuteCallPlanner, opData?: string): string {
    const calls = planner.calls
    // Transform calls into the expected format for ABI encoding
    const formattedCalls = calls.map(call => [call.to, call.value, call.data]) as Array<[string, string, string]>
    
    switch (mode) {
      case ModeType.BATCHED_CALL:
      case ModeType.BATCHED_CAN_REVERT_CALL:
        return this.encodeBatchedCall(formattedCalls);
      case ModeType.BATCHED_CALL_SUPPORTS_OPDATA:
      case ModeType.BATCHED_CALL_SUPPORTS_OPDATA_AND_CAN_REVERT:
        if (!opData) throw new Error('opData is required for CALL_WITH_OPDATA mode');
        return this.encodeBatchedCallSupportsOpdata(formattedCalls, opData);
      default:
        throw new Error(`Unsupported mode type: ${mode}`);
    }
  }

  protected static encodeBatchedCall(formattedCalls: Array<[string, string, string]>): string {
    return this.abiEncoder.encode(MODE_TYPE_ABI_ENCODING[ModeType.BATCHED_CALL], [formattedCalls])
  }

  protected static encodeBatchedCallSupportsOpdata(formattedCalls: Array<[string, string, string]>, opData: string): string {
    return this.abiEncoder.encode(MODE_TYPE_ABI_ENCODING[ModeType.BATCHED_CALL_SUPPORTS_OPDATA], [formattedCalls, opData])
  }
}
