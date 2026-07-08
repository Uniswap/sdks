/**
 * Chains where the Liquidity Launcher stack is deployed. Values are numeric chain ids so the
 * SDK stays framework-agnostic: callers map their own chain enum (e.g. sdk-core `ChainId`, a proto
 * chain id, or wagmi's `chain.id`) to a number before calling in.
 */
export enum SupportedChainId {
  MAINNET = 1,
  UNICHAIN = 130,
  BASE = 8453,
  ARBITRUM_ONE = 42161,
  AVALANCHE = 43114,
  XLAYER = 196,
  ROBINHOOD = 4663,
  SEPOLIA = 11155111,
  BASE_SEPOLIA = 84532,
}

const SUPPORTED_CHAIN_IDS = new Set<number>(
  Object.values(SupportedChainId).filter((v): v is number => typeof v === 'number')
)

/** Whether the launcher stack is deployed on `chainId` (i.e. {@link getLauncherAddresses} resolves). */
export function isLaunchSupportedChain(chainId: number): chainId is SupportedChainId {
  return SUPPORTED_CHAIN_IDS.has(chainId)
}
