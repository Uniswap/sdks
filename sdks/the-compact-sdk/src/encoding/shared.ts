/**
 * Shared encoding utilities for Tribunal and Exarch
 *
 * These functions are identical between the two protocols and are re-exported
 * here for convenience when users need protocol-agnostic encoding.
 */

// Re-export claimant encoding from exarch (identical for tribunal)
export { encodeClaimant, decodeClaimant } from './exarch'

// Re-export validity conditions encoding from exarch (identical for tribunal)
export { encodeValidityConditions, decodeValidityConditions } from './exarch'

// Re-export types from types/exarch
export type { DecodedClaimant, DecodedValidityConditions } from '../types/exarch'

// Also export from tribunal for protocol-specific imports
export {
  encodeClaimant as encodeTribunalClaimant,
  decodeClaimant as decodeTribunalClaimant,
  encodeValidityConditions as encodeTribunalValidityConditions,
  decodeValidityConditions as decodeTribunalValidityConditions,
} from './tribunal'
