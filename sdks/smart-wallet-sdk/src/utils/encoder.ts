import { AbiCoder } from '@ethersproject/abi';
import { MODE_TYPE_ABI_ENCODING, ModeType } from '../constants'
import { Call } from '../types'
import { ExecuteCallPlanner } from './callPlanner';

/**
 * Utility functions for encoding execution data for different ERC-7579 modes
 * supports ERC-7821 modes
 */
export abstract class ModeEncoder {
  protected static abiEncoder = new AbiCoder()

  public static encode(mode: ModeType, planner: ExecuteCallPlanner, opData?: string): string {
    const calls = planner.calls
    switch (mode) {
      case ModeType.BATCHED_CALL || ModeType.BATCHED_CAN_REVERT_CALL:
        return this.encodeBatchedCall(calls);
      case ModeType.BATCHED_CALL_SUPPORTS_OPDATA || ModeType.BATCHED_CALL_SUPPORTS_OPDATA_AND_CAN_REVERT:
        if (!opData) throw new Error('opData is required for CALL_WITH_OPDATA mode');
        return this.encodeBatchedCallSupportsOpdata(calls, opData);
      default:
        throw new Error(`Unsupported mode type: ${mode}`);
    }
  }

  protected static encodeBatchedCall(calls: Call[]): string {
    return this.abiEncoder.encode(MODE_TYPE_ABI_ENCODING[ModeType.BATCHED_CALL], calls)
  }

  protected static encodeBatchedCallSupportsOpdata(calls: Call[], opData: string): string {
    return this.abiEncoder.encode(MODE_TYPE_ABI_ENCODING[ModeType.BATCHED_CALL_SUPPORTS_OPDATA], [calls, opData])
  }
}
