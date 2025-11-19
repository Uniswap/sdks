"use strict";
/**
 * Tests for coreClient
 */
Object.defineProperty(exports, "__esModule", { value: true });
const arbiter_1 = require("./arbiter");
const coreClient_1 = require("./coreClient");
const sponsor_1 = require("./sponsor");
const view_1 = require("./view");
// Mock viem clients
const mockPublicClient = {};
const mockWalletClient = {};
describe('createCompactClient', () => {
    describe('with explicit address', () => {
        it('should create a client with all sub-clients', () => {
            const config = {
                chainId: 1,
                address: '0x00000000000000171ede64904551eeDF3C6C9788',
                publicClient: mockPublicClient,
                walletClient: mockWalletClient,
            };
            const client = (0, coreClient_1.createCompactClient)(config);
            expect(client).toBeDefined();
            expect(client.sponsor).toBeInstanceOf(sponsor_1.SponsorClient);
            expect(client.arbiter).toBeInstanceOf(arbiter_1.ArbiterClient);
            expect(client.view).toBeInstanceOf(view_1.ViewClient);
            expect(client.config).toBeDefined();
            expect(client.config.chainId).toBe(1);
            expect(client.config.address).toBe('0x00000000000000171ede64904551eeDF3C6C9788');
            expect(client.config.publicClient).toBe(mockPublicClient);
            expect(client.config.walletClient).toBe(mockWalletClient);
        });
        it('should work without wallet client', () => {
            const config = {
                chainId: 1,
                address: '0x00000000000000171ede64904551eeDF3C6C9788',
                publicClient: mockPublicClient,
            };
            const client = (0, coreClient_1.createCompactClient)(config);
            expect(client).toBeDefined();
            expect(client.sponsor).toBeInstanceOf(sponsor_1.SponsorClient);
            expect(client.arbiter).toBeInstanceOf(arbiter_1.ArbiterClient);
            expect(client.view).toBeInstanceOf(view_1.ViewClient);
            expect(client.config.walletClient).toBeUndefined();
        });
    });
    describe('with default address resolution', () => {
        it('should resolve default address for mainnet', () => {
            const config = {
                chainId: 1,
                publicClient: mockPublicClient,
                walletClient: mockWalletClient,
            };
            const client = (0, coreClient_1.createCompactClient)(config);
            expect(client).toBeDefined();
            expect(client.config.address).toBeDefined();
            expect(client.config.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
        });
        it('should resolve default address for Unichain', () => {
            const config = {
                chainId: 130,
                publicClient: mockPublicClient,
                walletClient: mockWalletClient,
            };
            const client = (0, coreClient_1.createCompactClient)(config);
            expect(client).toBeDefined();
            expect(client.config.address).toBeDefined();
            expect(client.config.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
        });
        it('should resolve default address for Base', () => {
            const config = {
                chainId: 8453,
                publicClient: mockPublicClient,
                walletClient: mockWalletClient,
            };
            const client = (0, coreClient_1.createCompactClient)(config);
            expect(client).toBeDefined();
            expect(client.config.address).toBeDefined();
            expect(client.config.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
        });
        it('should use same address across all supported chains', () => {
            const expectedAddress = '0x00000000000000171ede64904551eeDF3C6C9788';
            // Test all supported chains use the same address
            const chains = [1, 130, 8453];
            chains.forEach((chainId) => {
                const config = {
                    chainId,
                    publicClient: mockPublicClient,
                    walletClient: mockWalletClient,
                };
                const client = (0, coreClient_1.createCompactClient)(config);
                expect(client.config.address).toBe(expectedAddress);
            });
        });
    });
    describe('error cases', () => {
        it('should throw for unsupported chain without explicit address', () => {
            const config = {
                chainId: 999999, // Unsupported chain
                publicClient: mockPublicClient,
                walletClient: mockWalletClient,
            };
            expect(() => (0, coreClient_1.createCompactClient)(config)).toThrow('No default deployment found for chain 999999. Please provide an address.');
        });
        it('should work for unsupported chain with explicit address', () => {
            const config = {
                chainId: 999999, // Unsupported chain
                address: '0x1234567890123456789012345678901234567890',
                publicClient: mockPublicClient,
                walletClient: mockWalletClient,
            };
            const client = (0, coreClient_1.createCompactClient)(config);
            expect(client).toBeDefined();
            expect(client.config.address).toBe('0x1234567890123456789012345678901234567890');
        });
    });
    describe('sub-client functionality', () => {
        it('should create sub-clients with shared config', () => {
            const config = {
                chainId: 1,
                address: '0x00000000000000171ede64904551eeDF3C6C9788',
                publicClient: mockPublicClient,
                walletClient: mockWalletClient,
            };
            const client = (0, coreClient_1.createCompactClient)(config);
            // All sub-clients should have access to the same config
            expect(client.sponsor).toBeDefined();
            expect(client.arbiter).toBeDefined();
            expect(client.view).toBeDefined();
            // Verify config is stored on the client
            expect(client.config).toEqual({
                chainId: 1,
                address: '0x00000000000000171ede64904551eeDF3C6C9788',
                publicClient: mockPublicClient,
                walletClient: mockWalletClient,
            });
        });
        it('should create independent clients for different chains', () => {
            const mainnetConfig = {
                chainId: 1,
                publicClient: mockPublicClient,
            };
            const baseConfig = {
                chainId: 8453,
                publicClient: mockPublicClient,
            };
            const mainnetClient = (0, coreClient_1.createCompactClient)(mainnetConfig);
            const baseClient = (0, coreClient_1.createCompactClient)(baseConfig);
            expect(mainnetClient.config.chainId).toBe(1);
            expect(baseClient.config.chainId).toBe(8453);
            // They should have the same address since all supported chains use the same deployment
            expect(mainnetClient.config.address).toBe(baseClient.config.address);
        });
    });
});
//# sourceMappingURL=coreClient.test.js.map