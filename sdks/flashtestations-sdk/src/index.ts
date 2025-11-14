/**
 * Flashtestations SDK - Verify TEE-built blocks on Unichain
 *
 * This SDK provides tools to verify whether blockchain blocks were built by
 * Trusted Execution Environments (TEEs) running specific workload software.
 */

// Main verification function
export { verifyFlashtestationInBlock, getFlashtestationEvent } from './verification/service';


// Core types
export type {
  VerificationResult,
  WorkloadMeasureRegisters,
  BlockParameter,
  FlashtestationEvent,
  ChainConfig,
  ClientConfig,
} from './types';

// Error classes for programmatic error handling
export {
  NetworkError,
  BlockNotFoundError,
  ValidationError,
  ChainNotSupportedError,
} from './types';

// Chain configuration utilities
export {
  getSupportedChains,
  isChainSupported,
  getChainConfig,
} from './config/chains';

// Workload ID computation utility
export { computeWorkloadId } from './crypto/workload';
