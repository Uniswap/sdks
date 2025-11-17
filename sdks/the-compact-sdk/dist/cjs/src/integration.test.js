"use strict";
/**
 * Integration tests against The Compact mainnet deployment
 *
 * These tests validate SDK logic against real on-chain data:
 * - Contract: 0x00000000000000171ede64904551eeDF3C6C9788 (mainnet)
 * - Known allocator: 0x060471752Be4DB56AaEe10CC2a753794795b6700
 * - Known deposit: 1 ETH by 0x0734d56DA60852A03e2Aafae8a36FFd8c12B32f1
 */
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const locks_1 = require("./encoding/locks");
const runtime_1 = require("./types/runtime");
const coreClient_1 = require("./client/coreClient");
// Known mainnet values
const MAINNET_COMPACT_ADDRESS = '0x00000000000000171ede64904551eeDF3C6C9788';
const DOMAIN_SEPARATOR = '0x4ac11bdf0eb5972bae47825af851d20c342d88f466669ec58827be03650df019';
const KNOWN_ALLOCATOR = '0x060471752Be4DB56AaEe10CC2a753794795b6700';
const KNOWN_ALLOCATOR_ID = 287803669127211327350859520n;
const KNOWN_DEPOSITOR = '0x0734d56DA60852A03e2Aafae8a36FFd8c12B32f1';
const KNOWN_LOCK_TAG = '0x00ee10cc2a753794795b6700';
const NATIVE_ETH_ADDRESS = '0x0000000000000000000000000000000000000000';
const KNOWN_TOKEN_ID_HEX = '0x00ee10cc2a753794795b67000000000000000000000000000000000000000000';
const KNOWN_TOKEN_ID_DECIMAL = 420625533659260790152146045461395372006532003561106597619092546332938731520n;
// Skip integration tests by default (require RPC connection)
// Run with: npm test -- --testPathPattern=integration
const describeIntegration = process.env.RPC_URL ? globals_1.describe : globals_1.describe.skip;
describeIntegration('The Compact SDK - Mainnet Integration', () => {
    // Create a public client for mainnet queries
    const publicClient = (0, viem_1.createPublicClient)({
        chain: chains_1.mainnet,
        transport: (0, viem_1.http)(),
    });
    (0, globals_1.describe)('lockTag encoding/decoding', () => {
        (0, globals_1.it)('should correctly encode and decode the known lock tag', () => {
            // Decode the known lock tag to verify our decoding logic
            const decoded = (0, locks_1.decodeLockTag)(KNOWN_LOCK_TAG);
            (0, globals_1.expect)(decoded.allocatorId).toBe(KNOWN_ALLOCATOR_ID);
            (0, globals_1.expect)(decoded.scope).toBe(runtime_1.Scope.Multichain);
            (0, globals_1.expect)(decoded.resetPeriod).toBe(runtime_1.ResetPeriod.OneSecond);
            // Re-encode it and verify we get the same value back
            const reencoded = (0, locks_1.encodeLockTag)(decoded);
            (0, globals_1.expect)(reencoded.toLowerCase()).toBe(KNOWN_LOCK_TAG.toLowerCase());
        });
        (0, globals_1.it)('should produce the correct token ID from lock tag and token address', () => {
            // Encode the lock ID from the known lock tag and native ETH address
            const tokenId = (0, locks_1.encodeLockId)(KNOWN_LOCK_TAG, NATIVE_ETH_ADDRESS);
            // Verify the encoded token ID matches the known value
            (0, globals_1.expect)(tokenId).toBe(KNOWN_TOKEN_ID_DECIMAL);
            (0, globals_1.expect)(`0x${tokenId.toString(16).padStart(64, '0')}`).toBe(KNOWN_TOKEN_ID_HEX.toLowerCase());
        });
        (0, globals_1.it)('should correctly decode the token ID back to lock tag and token', () => {
            const { lockTag, token } = (0, locks_1.decodeLockId)(KNOWN_TOKEN_ID_DECIMAL);
            (0, globals_1.expect)(lockTag.toLowerCase()).toBe(KNOWN_LOCK_TAG.toLowerCase());
            (0, globals_1.expect)(token.toLowerCase()).toBe(NATIVE_ETH_ADDRESS.toLowerCase());
        });
    });
    (0, globals_1.describe)('allocator ID computation', () => {
        (0, globals_1.it)('should derive the correct allocator ID from address', () => {
            // Extract allocator ID from the known lock tag
            const decoded = (0, locks_1.decodeLockTag)(KNOWN_LOCK_TAG);
            // The allocator ID should match the known value
            (0, globals_1.expect)(decoded.allocatorId).toBe(KNOWN_ALLOCATOR_ID);
        });
        (0, globals_1.it)('should extract allocator ID correctly from token ID', () => {
            const { lockTag } = (0, locks_1.decodeLockId)(KNOWN_TOKEN_ID_DECIMAL);
            const { allocatorId } = (0, locks_1.decodeLockTag)(lockTag);
            (0, globals_1.expect)(allocatorId).toBe(KNOWN_ALLOCATOR_ID);
        });
    });
    (0, globals_1.describe)('on-chain queries (requires RPC)', () => {
        (0, globals_1.it)('should query the balance of the known depositor', async () => {
            const compactClient = (0, coreClient_1.createCompactClient)({
                chainId: 1,
                address: MAINNET_COMPACT_ADDRESS,
                publicClient,
            });
            // Query the balance
            const balance = await compactClient.view.balanceOf({
                account: KNOWN_DEPOSITOR,
                id: KNOWN_TOKEN_ID_DECIMAL,
            });
            // The depositor should have at least 1 ETH deposited
            // (may be more if they've made additional deposits)
            (0, globals_1.expect)(balance).toBeGreaterThanOrEqual(1000000000000000000n);
        }, 30000); // 30s timeout for RPC call
        (0, globals_1.it)('should query lock details for the token ID', async () => {
            const compactClient = (0, coreClient_1.createCompactClient)({
                chainId: 1,
                address: MAINNET_COMPACT_ADDRESS,
                publicClient,
            });
            // Query lock details
            const lockDetails = await compactClient.view.getLockDetails(KNOWN_TOKEN_ID_DECIMAL);
            // Verify the lock details match our expectations
            (0, globals_1.expect)(lockDetails.token.toLowerCase()).toBe(NATIVE_ETH_ADDRESS.toLowerCase());
            (0, globals_1.expect)(lockDetails.lockTag.toLowerCase()).toBe(KNOWN_LOCK_TAG.toLowerCase());
            // Verify the allocator can be derived from lock details
            const { allocatorId } = (0, locks_1.decodeLockTag)(lockDetails.lockTag);
            (0, globals_1.expect)(allocatorId).toBe(KNOWN_ALLOCATOR_ID);
        }, 30000);
        (0, globals_1.it)('should verify domain separator matches on-chain value', async () => {
            const compactClient = (0, coreClient_1.createCompactClient)({
                chainId: 1,
                address: MAINNET_COMPACT_ADDRESS,
                publicClient,
            });
            // Get domain separator from contract
            const onChainDomainSeparator = await compactClient.view.getDomainSeparator();
            // Domain separator should be a valid bytes32
            (0, globals_1.expect)(onChainDomainSeparator).toEqual(DOMAIN_SEPARATOR);
        }, 30000);
    });
    (0, globals_1.describe)('round-trip encoding tests', () => {
        (0, globals_1.it)('should correctly round-trip encode/decode various lock tags', () => {
            const testCases = [
                {
                    name: 'ChainSpecific with OneDay reset',
                    parts: {
                        allocatorId: 123456789n,
                        scope: runtime_1.Scope.ChainSpecific,
                        resetPeriod: runtime_1.ResetPeriod.OneDay,
                    },
                },
                {
                    name: 'Multichain with OneMinute reset',
                    parts: {
                        allocatorId: 987654321n,
                        scope: runtime_1.Scope.Multichain,
                        resetPeriod: runtime_1.ResetPeriod.OneMinute,
                    },
                },
                {
                    name: 'Maximum allocator ID',
                    parts: {
                        allocatorId: (1n << 92n) - 1n, // Max 92-bit value
                        scope: runtime_1.Scope.ChainSpecific,
                        resetPeriod: runtime_1.ResetPeriod.ThirtyDays,
                    },
                },
            ];
            for (const testCase of testCases) {
                const encoded = (0, locks_1.encodeLockTag)(testCase.parts);
                const decoded = (0, locks_1.decodeLockTag)(encoded);
                (0, globals_1.expect)(decoded.allocatorId).toBe(testCase.parts.allocatorId);
                (0, globals_1.expect)(decoded.scope).toBe(testCase.parts.scope);
                (0, globals_1.expect)(decoded.resetPeriod).toBe(testCase.parts.resetPeriod);
            }
        });
        (0, globals_1.it)('should correctly round-trip encode/decode lock IDs with various tokens', () => {
            const testLockTag = (0, locks_1.encodeLockTag)({
                allocatorId: KNOWN_ALLOCATOR_ID,
                scope: runtime_1.Scope.ChainSpecific,
                resetPeriod: runtime_1.ResetPeriod.OneDay,
            });
            const testTokens = [
                '0x0000000000000000000000000000000000000000', // Native ETH
                '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
                '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
                '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
            ];
            for (const token of testTokens) {
                const lockId = (0, locks_1.encodeLockId)(testLockTag, token);
                const decoded = (0, locks_1.decodeLockId)(lockId);
                (0, globals_1.expect)(decoded.lockTag.toLowerCase()).toBe(testLockTag.toLowerCase());
                (0, globals_1.expect)(decoded.token.toLowerCase()).toBe(token.toLowerCase());
            }
        });
    });
});
//# sourceMappingURL=integration.test.js.map