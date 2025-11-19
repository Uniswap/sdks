/**
 * Chain and deployment configuration for The Compact v1
 */
export interface CompactDeployment {
    chainId: number;
    address: `0x${string}`;
    name: string;
}
/**
 * Default deployments of The Compact v1 across supported chains
 * All deployments use the same address: 0x00000000000000171ede64904551eeDF3C6C9788
 */
export declare const defaultDeployments: CompactDeployment[];
/**
 * Get the default Compact contract address for a given chain ID
 * @param chainId - The chain ID to look up
 * @returns The contract address, or undefined if not found
 */
export declare function getDefaultAddress(chainId: number): `0x${string}` | undefined;
/**
 * Check if a chain ID has a default deployment
 * @param chainId - The chain ID to check
 * @returns True if the chain has a default deployment
 */
export declare function hasDefaultDeployment(chainId: number): boolean;
