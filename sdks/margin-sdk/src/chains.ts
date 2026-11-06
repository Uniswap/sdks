/**
 * Chains where the margin trading periphery is deployed. Values are numeric chain ids so the SDK
 * stays framework-agnostic: callers map their own chain enum (e.g. sdk-core `ChainId`, a proto
 * chain id, or wagmi's `chain.id`) to a number before calling in.
 */
export enum SupportedChainId {
  MAINNET = 1,
}

const SUPPORTED_CHAIN_IDS = new Set<number>(
  Object.values(SupportedChainId).filter((v): v is number => typeof v === 'number')
)

/** Whether the margin stack is deployed on `chainId` (i.e. {@link getMarginAddresses} resolves). */
export function isMarginSupportedChain(chainId: number): chainId is SupportedChainId {
  return SUPPORTED_CHAIN_IDS.has(chainId)
}
