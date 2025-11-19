/**
 * Tests for SponsorClient
 */
import invariant from 'tiny-invariant';
import { parseEther, encodeEventTopics, encodeAbiParameters } from 'viem';
import { theCompactAbi } from '../abi/theCompact';
import { simpleMandate } from '../builders/mandate';
import { SponsorClient } from './sponsor';
// Mock viem clients
const mockPublicClient = {
    waitForTransactionReceipt: jest.fn(),
};
const mockWalletClient = {
    writeContract: jest.fn(),
};
const testAddress = '0x00000000000000171ede64904551eeDF3C6C9788';
const sponsorAddress = '0x1234567890123456789012345678901234567890';
const tokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const lockTag = '0x000000000000000000000001';
// Helper to create a realistic Transfer event log
function createTransferEvent(params) {
    const transferEvent = theCompactAbi.find((item) => item.type === 'event' && item.name === 'Transfer');
    invariant(transferEvent, 'Transfer event not found');
    const topics = encodeEventTopics({
        abi: [transferEvent],
        eventName: 'Transfer',
        args: {
            from: params.from,
            to: params.to,
            id: params.id,
        },
    });
    const data = encodeAbiParameters([
        { type: 'address', name: 'by' },
        { type: 'uint256', name: 'amount' },
    ], [params.by, params.amount]);
    return {
        address: testAddress,
        topics,
        data,
    };
}
// Helper to create a realistic ForcedWithdrawalStatusUpdated event log
function createForcedWithdrawalStatusUpdatedEvent(params) {
    const event = theCompactAbi.find((item) => item.type === 'event' && item.name === 'ForcedWithdrawalStatusUpdated');
    invariant(event, 'ForcedWithdrawalStatusUpdated event not found');
    const topics = encodeEventTopics({
        abi: [event],
        eventName: 'ForcedWithdrawalStatusUpdated',
        args: {
            account: params.account,
            id: params.id,
        },
    });
    const data = encodeAbiParameters([
        { type: 'bool', name: 'activating' },
        { type: 'uint256', name: 'withdrawableAt' },
    ], [params.activating, params.withdrawableAt]);
    return {
        address: testAddress,
        topics,
        data,
    };
}
describe('SponsorClient', () => {
    let config;
    let client;
    beforeEach(() => {
        config = {
            chainId: 1,
            address: testAddress,
            publicClient: mockPublicClient,
            walletClient: mockWalletClient,
        };
        client = new SponsorClient(config);
        jest.clearAllMocks();
    });
    describe('depositNative()', () => {
        it('should deposit native tokens and extract lock ID from Transfer event', async () => {
            const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
            const lockId = 123n;
            const depositAmount = parseEther('1.0');
            mockWalletClient.writeContract.mockResolvedValue(txHash);
            // Mock receipt with realistic Transfer event (minting from address(0))
            const transferEvent = createTransferEvent({
                from: '0x0000000000000000000000000000000000000000', // Minting from zero address
                to: sponsorAddress,
                id: lockId,
                by: sponsorAddress,
                amount: depositAmount,
            });
            mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
                logs: [transferEvent],
            });
            const result = await client.depositNative({
                lockTag,
                recipient: sponsorAddress,
                value: depositAmount,
            });
            expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
                address: testAddress,
                abi: expect.any(Array),
                functionName: 'depositNative',
                args: [lockTag, sponsorAddress],
                value: depositAmount,
                chain: null,
                account: undefined,
            });
            expect(result.txHash).toBe(txHash);
            expect(result.id).toBe(lockId);
        });
        it('should throw if walletClient is missing', async () => {
            const clientWithoutWallet = new SponsorClient({
                ...config,
                walletClient: undefined,
            });
            await expect(clientWithoutWallet.depositNative({
                lockTag,
                recipient: sponsorAddress,
                value: parseEther('1.0'),
            })).rejects.toThrow('walletClient is required');
        });
        it('should throw if contract address is missing', async () => {
            const clientWithoutAddress = new SponsorClient({
                ...config,
                address: undefined,
            });
            await expect(clientWithoutAddress.depositNative({
                lockTag,
                recipient: sponsorAddress,
                value: parseEther('1.0'),
            })).rejects.toThrow('contract address is required');
        });
        it('should handle contract errors', async () => {
            mockWalletClient.writeContract.mockRejectedValue(new Error('Insufficient funds'));
            await expect(client.depositNative({
                lockTag,
                recipient: sponsorAddress,
                value: parseEther('1.0'),
            })).rejects.toThrow('Insufficient funds');
        });
    });
    describe('depositERC20()', () => {
        it('should deposit ERC20 tokens and extract lock ID from Transfer event', async () => {
            const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
            const amount = 1000000n;
            const lockId = 456n;
            mockWalletClient.writeContract.mockResolvedValue(txHash);
            // Mock receipt with realistic Transfer event (minting from address(0))
            const transferEvent = createTransferEvent({
                from: '0x0000000000000000000000000000000000000000', // Minting from zero address
                to: sponsorAddress,
                id: lockId,
                by: sponsorAddress,
                amount,
            });
            mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
                logs: [transferEvent],
            });
            const result = await client.depositERC20({
                token: tokenAddress,
                lockTag,
                recipient: sponsorAddress,
                amount,
            });
            expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
                address: testAddress,
                abi: expect.any(Array),
                functionName: 'depositERC20',
                args: [tokenAddress, lockTag, amount, sponsorAddress],
                chain: null,
                account: undefined,
            });
            expect(result.txHash).toBe(txHash);
            expect(result.id).toBe(lockId);
        });
        it('should throw if walletClient is missing', async () => {
            const clientWithoutWallet = new SponsorClient({
                ...config,
                walletClient: undefined,
            });
            await expect(clientWithoutWallet.depositERC20({
                token: tokenAddress,
                lockTag,
                recipient: sponsorAddress,
                amount: 1000000n,
            })).rejects.toThrow('walletClient is required');
        });
        it('should throw if contract address is missing', async () => {
            const clientWithoutAddress = new SponsorClient({
                ...config,
                address: undefined,
            });
            await expect(clientWithoutAddress.depositERC20({
                token: tokenAddress,
                lockTag,
                recipient: sponsorAddress,
                amount: 1000000n,
            })).rejects.toThrow('contract address is required');
        });
    });
    describe('register()', () => {
        it('should register a claim hash', async () => {
            const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
            const claimHash = '0x1111111111111111111111111111111111111111111111111111111111111111';
            const typehash = '0x2222222222222222222222222222222222222222222222222222222222222222';
            mockWalletClient.writeContract.mockResolvedValue(txHash);
            const result = await client.register({
                claimHash,
                typehash,
            });
            expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
                address: testAddress,
                abi: expect.any(Array),
                functionName: 'register',
                args: [claimHash, typehash],
                chain: null,
                account: undefined,
            });
            expect(result).toBe(txHash);
        });
        it('should throw if walletClient is missing', async () => {
            const clientWithoutWallet = new SponsorClient({
                ...config,
                walletClient: undefined,
            });
            await expect(clientWithoutWallet.register({
                claimHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
                typehash: '0x2222222222222222222222222222222222222222222222222222222222222222',
            })).rejects.toThrow('walletClient is required');
        });
    });
    describe('enableForcedWithdrawal()', () => {
        it('should enable forced withdrawal and extract withdrawableAt timestamp', async () => {
            const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
            const lockId = 100n;
            const withdrawableAt = BigInt(Date.now() + 86400000); // 24 hours from now
            mockWalletClient.writeContract.mockResolvedValue(txHash);
            // Mock receipt with realistic ForcedWithdrawalStatusUpdated event
            const statusEvent = createForcedWithdrawalStatusUpdatedEvent({
                account: sponsorAddress,
                id: lockId,
                activating: true,
                withdrawableAt,
            });
            mockPublicClient.waitForTransactionReceipt.mockResolvedValue({
                logs: [statusEvent],
            });
            const result = await client.enableForcedWithdrawal(lockId);
            expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
                address: testAddress,
                abi: expect.any(Array),
                functionName: 'enableForcedWithdrawal',
                args: [lockId],
                chain: null,
                account: undefined,
            });
            expect(result.txHash).toBe(txHash);
            expect(result.withdrawableAt).toBe(withdrawableAt);
        });
        it('should throw if walletClient is missing', async () => {
            const clientWithoutWallet = new SponsorClient({
                ...config,
                walletClient: undefined,
            });
            await expect(clientWithoutWallet.enableForcedWithdrawal(100n)).rejects.toThrow('walletClient is required');
        });
        it('should throw if contract address is missing', async () => {
            const clientWithoutAddress = new SponsorClient({
                ...config,
                address: undefined,
            });
            await expect(clientWithoutAddress.enableForcedWithdrawal(100n)).rejects.toThrow('contract address is required');
        });
    });
    describe('disableForcedWithdrawal()', () => {
        it('should disable forced withdrawal', async () => {
            const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
            const lockId = 100n;
            mockWalletClient.writeContract.mockResolvedValue(txHash);
            const result = await client.disableForcedWithdrawal(lockId);
            expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
                address: testAddress,
                abi: expect.any(Array),
                functionName: 'disableForcedWithdrawal',
                args: [lockId],
                chain: null,
                account: undefined,
            });
            expect(result).toBe(txHash);
        });
        it('should throw if walletClient is missing', async () => {
            const clientWithoutWallet = new SponsorClient({
                ...config,
                walletClient: undefined,
            });
            await expect(clientWithoutWallet.disableForcedWithdrawal(100n)).rejects.toThrow('walletClient is required');
        });
        it('should throw if contract address is missing', async () => {
            const clientWithoutAddress = new SponsorClient({
                ...config,
                address: undefined,
            });
            await expect(clientWithoutAddress.disableForcedWithdrawal(100n)).rejects.toThrow('contract address is required');
        });
        it('should handle contract errors', async () => {
            mockWalletClient.writeContract.mockRejectedValue(new Error('No forced withdrawal enabled'));
            await expect(client.disableForcedWithdrawal(100n)).rejects.toThrow('No forced withdrawal enabled');
        });
    });
    describe('forcedWithdrawal()', () => {
        it('should execute forced withdrawal with specified amount', async () => {
            const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
            const lockId = 100n;
            const recipient = '0xfedcbafedcbafedcbafedcbafedcbafedcbafedd';
            const amount = 5000000n;
            mockWalletClient.writeContract.mockResolvedValue(txHash);
            const result = await client.forcedWithdrawal(lockId, recipient, amount);
            expect(mockWalletClient.writeContract).toHaveBeenCalledWith({
                address: testAddress,
                abi: expect.any(Array),
                functionName: 'forcedWithdrawal',
                args: [lockId, recipient, amount],
                chain: null,
                account: undefined,
            });
            expect(result).toBe(txHash);
        });
        it('should throw if walletClient is missing', async () => {
            const clientWithoutWallet = new SponsorClient({
                ...config,
                walletClient: undefined,
            });
            await expect(clientWithoutWallet.forcedWithdrawal(100n, '0xfedcbafedcbafedcbafedcbafedcbafedcbafedd', 5000000n)).rejects.toThrow('walletClient is required');
        });
        it('should throw if contract address is missing', async () => {
            const clientWithoutAddress = new SponsorClient({
                ...config,
                address: undefined,
            });
            await expect(clientWithoutAddress.forcedWithdrawal(100n, '0xfedcbafedcbafedcbafedcbafedcbafedcbafedd', 5000000n)).rejects.toThrow('contract address is required');
        });
        it('should handle contract errors', async () => {
            mockWalletClient.writeContract.mockRejectedValue(new Error('Delay not elapsed'));
            await expect(client.forcedWithdrawal(100n, '0xfedcbafedcbafedcbafedcbafedcbafedd', 5000000n)).rejects.toThrow('Delay not elapsed');
        });
    });
    describe('builder factories', () => {
        describe('compact()', () => {
            it('should create a CompactBuilder with correct domain', () => {
                const arbiterAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
                const builder = client.compact();
                expect(builder).toBeDefined();
                // Builder should be functional
                const compact = builder
                    .arbiter(arbiterAddress)
                    .sponsor(sponsorAddress)
                    .nonce(1n)
                    .expires(BigInt(Date.now() + 3600000))
                    .lockTag(lockTag)
                    .token(tokenAddress)
                    .amount(1000000n)
                    .build();
                expect(compact.struct.sponsor).toBe(sponsorAddress);
                expect(compact.hash).toBeDefined();
            });
            it('should throw if contract address is missing', () => {
                const clientWithoutAddress = new SponsorClient({
                    ...config,
                    address: undefined,
                });
                expect(() => clientWithoutAddress.compact()).toThrow('contract address is required');
            });
        });
        describe('batchCompact()', () => {
            it('should create a BatchCompactBuilder with correct domain', () => {
                const arbiterAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
                const builder = client.batchCompact();
                expect(builder).toBeDefined();
                // Builder should be functional
                const compact = builder
                    .arbiter(arbiterAddress)
                    .sponsor(sponsorAddress)
                    .nonce(1n)
                    .expires(BigInt(Date.now() + 3600000))
                    .addLock({ lockTag, token: tokenAddress, amount: 1000000n })
                    .build();
                expect(compact.struct.sponsor).toBe(sponsorAddress);
                expect(compact.hash).toBeDefined();
            });
            it('should throw if contract address is missing', () => {
                const clientWithoutAddress = new SponsorClient({
                    ...config,
                    address: undefined,
                });
                expect(() => clientWithoutAddress.batchCompact()).toThrow('contract address is required');
            });
        });
        describe('multichainCompact()', () => {
            it('should create a MultichainCompactBuilder with correct domain', () => {
                const arbiterAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
                const mandateType = simpleMandate([{ name: 'fillerAddress', type: 'address' }]);
                const mandate = { fillerAddress: '0x9876543210987654321098765432109876543210' };
                const builder = client.multichainCompact();
                expect(builder).toBeDefined();
                // Builder should be functional
                const compact = builder
                    .sponsor(sponsorAddress)
                    .nonce(1n)
                    .expires(BigInt(Date.now() + 3600000))
                    .addElement()
                    .arbiter(arbiterAddress)
                    .chainId(1n)
                    .addCommitment({ lockTag, token: tokenAddress, amount: 1000000n })
                    .witness(mandateType, mandate)
                    .done()
                    .build();
                expect(compact.struct.sponsor).toBe(sponsorAddress);
                expect(compact.hash).toBeDefined();
            });
            it('should throw if contract address is missing', () => {
                const clientWithoutAddress = new SponsorClient({
                    ...config,
                    address: undefined,
                });
                expect(() => clientWithoutAddress.multichainCompact()).toThrow('contract address is required');
            });
        });
    });
});
//# sourceMappingURL=sponsor.test.js.map