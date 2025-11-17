"use strict";
/**
 * Chain and deployment configuration for The Compact v1
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultDeployments = void 0;
exports.getDefaultAddress = getDefaultAddress;
exports.hasDefaultDeployment = hasDefaultDeployment;
/**
 * Default deployments of The Compact v1 across supported chains
 * All deployments use the same address: 0x00000000000000171ede64904551eeDF3C6C9788
 */
exports.defaultDeployments = [
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
];
/**
 * Get the default Compact contract address for a given chain ID
 * @param chainId - The chain ID to look up
 * @returns The contract address, or undefined if not found
 */
function getDefaultAddress(chainId) {
    return exports.defaultDeployments.find((d) => d.chainId === chainId)?.address;
}
/**
 * Check if a chain ID has a default deployment
 * @param chainId - The chain ID to check
 * @returns True if the chain has a default deployment
 */
function hasDefaultDeployment(chainId) {
    return exports.defaultDeployments.some((d) => d.chainId === chainId);
}
//# sourceMappingURL=chains.js.map