/**
 * Chain and deployment configuration for The Compact v1
 */

export interface CompactDeployment {
  chainId: number
  address: `0x${string}`
  name: string
}

/**
 * Default deployments of The Compact v1 across supported chains
 * All deployments use the same address: 0x00000000000000171ede64904551eeDF3C6C9788
 */
export const defaultDeployments: CompactDeployment[] = [
  {
    chainId: 1,
    address: '0x00000000000000171ede64904551eeDF3C6C9788',
    name: 'Ethereum Mainnet',
  },
  {
    chainId: 8453,
    address: '0x00000000000000171ede64904551eeDF3C6C9788',
    name: 'Base',
  },
  {
    chainId: 130,
    address: '0x00000000000000171ede64904551eeDF3C6C9788',
    name: 'Unichain',
  },
]

/**
 * Get the default Compact contract address for a given chain ID
 * @param chainId - The chain ID to look up
 * @returns The contract address, or undefined if not found
 */
export function getDefaultAddress(chainId: number): `0x${string}` | undefined {
  return defaultDeployments.find((d) => d.chainId === chainId)?.address
}

/**
 * Check if a chain ID has a default deployment
 * @param chainId - The chain ID to check
 * @returns True if the chain has a default deployment
 */
export function hasDefaultDeployment(chainId: number): boolean {
  return defaultDeployments.some((d) => d.chainId === chainId)
}
