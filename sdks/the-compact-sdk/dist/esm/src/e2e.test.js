/**
 * End-to-end integration tests against Supersim forked chains
 *
 * This test suite validates the entire SDK stack against live forked chains:
 * - OP Mainnet fork: http://localhost:8545
 * - Base Mainnet fork: http://localhost:9545
 * - Unichain fork: http://localhost:10545
 *
 * Prerequisites:
 * - Supersim must be running
 * - The Compact contract must be deployed on each chain
 *
 * Run with: npm test -- --testPathPattern=e2e
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import { createPublicClient, createWalletClient, http, parseEther, zeroAddress, } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createCompactClient } from './client/coreClient';
import { encodeLockTag, encodeLockId, decodeLockTag } from './encoding/locks';
import { Scope, ResetPeriod } from './types/runtime';
// Skip e2e tests by default (require Supersim running)
// Run with: npm test -- --testPathPattern=e2e
const describeE2E = process.env.E2E_TESTS ? describe : describe.skip;
// Test accounts from Supersim
const ACCOUNTS = {
    sponsor: {
        address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    },
    arbiter: {
        address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    },
    allocator: {
        address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    },
    recipient1: {
        address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
        privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
    },
    recipient2: {
        address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
        privateKey: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
    },
};
// AlwaysOKAllocator - deployed test allocator that accepts all claims
const TEST_ALLOCATOR = {
    address: '0x060471752Be4DB56AaEe10CC2a753794795b6700',
    allocatorId: 287803669127211327350859520n,
};
// Real allocator registered on mainnet (rejects unauthorized claims)
const REAL_ALLOCATOR = {
    address: '0x00000000000014E936Ef81802C9eEe5cBa81Cb8e',
    allocatorId: 3074909908954802876355562382n,
};
// Fixed timestamps for deterministic EIP-712 hash generation
const FIXED_EXPIRY = 1893456000n; // January 1, 2030 00:00:00 GMT
const FIXED_EXPIRED = 1577836800n; // January 1, 2020 00:00:00 GMT
// Chain configurations for Supersim
const CHAINS = {
    mainnet: {
        id: 1,
        name: 'Ethereum Mainnet (Supersim Fork)',
        rpcUrl: 'http://localhost:8545',
        compactAddress: '0x00000000000000171ede64904551eeDF3C6C9788', // Mainnet deployment
    },
    op: {
        id: 10,
        name: 'OP Mainnet (Supersim Fork)',
        rpcUrl: 'http://localhost:9545',
        compactAddress: '0x00000000000000171ede64904551eeDF3C6C9788', // Check if deployed
    },
    base: {
        id: 8453,
        name: 'Base Mainnet (Supersim Fork)',
        rpcUrl: 'http://localhost:9546',
        compactAddress: '0x00000000000000171ede64904551eeDF3C6C9788', // Check if deployed
    },
    unichain: {
        id: 1301, // Unichain chain ID
        name: 'Unichain (Supersim Fork)',
        rpcUrl: 'http://localhost:9547',
        compactAddress: '0x00000000000000171ede64904551eeDF3C6C9788', // Check if deployed
    },
};
describeE2E('The Compact SDK - End-to-End Tests', () => {
    let mainnetPublicClient;
    let mainnetWalletClient;
    let arbiterWalletClient;
    let sponsorAccount;
    let arbiterAccount;
    let allocatorAccount;
    let recipient1Account;
    let recipient2Account;
    beforeAll(async () => {
        // Create accounts from private keys
        sponsorAccount = privateKeyToAccount(ACCOUNTS.sponsor.privateKey);
        arbiterAccount = privateKeyToAccount(ACCOUNTS.arbiter.privateKey);
        allocatorAccount = privateKeyToAccount(ACCOUNTS.allocator.privateKey);
        recipient1Account = privateKeyToAccount(ACCOUNTS.recipient1.privateKey);
        recipient2Account = privateKeyToAccount(ACCOUNTS.recipient2.privateKey);
        // Create clients for mainnet fork (port 8545)
        mainnetPublicClient = createPublicClient({
            transport: http(CHAINS.mainnet.rpcUrl),
        });
        mainnetWalletClient = createWalletClient({
            account: sponsorAccount,
            transport: http(CHAINS.mainnet.rpcUrl),
        });
        arbiterWalletClient = createWalletClient({
            account: arbiterAccount,
            transport: http(CHAINS.mainnet.rpcUrl),
        });
        console.log('✓ Test environment initialized');
        console.log('  - Chain:', CHAINS.mainnet.name);
        console.log('  - Compact:', CHAINS.mainnet.compactAddress);
        console.log('  - Sponsor:', sponsorAccount.address);
        console.log('  - Arbiter:', arbiterAccount.address);
        console.log('  - Test Allocator (AlwaysOK):', TEST_ALLOCATOR.address, 'with ID:', TEST_ALLOCATOR.allocatorId);
    });
    describe('Setup and Contract Discovery', () => {
        it('should connect to Supersim mainnet fork', async () => {
            const blockNumber = await mainnetPublicClient.getBlockNumber();
            expect(blockNumber).toBeGreaterThan(0n);
        });
        it('should have funded test accounts', async () => {
            const balance = await mainnetPublicClient.getBalance({
                address: sponsorAccount.address,
            });
            expect(balance).toBeGreaterThan(parseEther('1'));
        });
        it('should verify The Compact contract exists', async () => {
            const code = await mainnetPublicClient.getBytecode({
                address: CHAINS.mainnet.compactAddress,
            });
            expect(code).toBeDefined();
            expect(code).not.toBe('0x');
        });
        it('should query domain separator from contract', async () => {
            const compactClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
            });
            const domainSeparator = await compactClient.view.getDomainSeparator();
            expect(domainSeparator).toMatch(/^0x[0-9a-f]{64}$/);
        });
    });
    describe('Basic Deposit and Withdrawal Flow', () => {
        let depositLockId;
        const depositAmount = parseEther('0.1');
        it('should deposit native ETH', async () => {
            const compactClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
                walletClient: mainnetWalletClient,
            });
            // Create a lock tag using a real registered allocator
            const lockTag = encodeLockTag({
                allocatorId: TEST_ALLOCATOR.allocatorId,
                scope: Scope.ChainSpecific,
                resetPeriod: ResetPeriod.OneDay,
            });
            // Deposit ETH
            const result = await compactClient.sponsor.depositNative({
                lockTag,
                recipient: sponsorAccount.address,
                value: depositAmount,
            });
            expect(result.txHash).toMatch(/^0x[0-9a-f]{64}$/);
            expect(result.id).toBeGreaterThan(0n);
            // Use the lock ID returned from the deposit
            depositLockId = result.id;
            console.log('  ✓ Deposited', depositAmount.toString(), 'wei ETH');
            console.log('    TX:', result.txHash);
            console.log('    Lock ID:', depositLockId.toString());
            if (depositLockId === 0n) {
                throw new Error('Deposit returned invalid lock ID (0). Transfer event may not have been found.');
            }
        }, 30000);
        it('should query balance after deposit', async () => {
            const compactClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
            });
            const balance = await compactClient.view.balanceOf({
                account: sponsorAccount.address,
                id: depositLockId,
            });
            expect(balance).toBeGreaterThanOrEqual(depositAmount);
            console.log('  ✓ Balance:', balance.toString(), 'wei');
        }, 30000);
        it('should enable forced withdrawal for a lock', async () => {
            const compactClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
                walletClient: mainnetWalletClient,
            });
            // Enable forced withdrawal
            const result = await compactClient.sponsor.enableForcedWithdrawal(depositLockId);
            expect(result.txHash).toMatch(/^0x[0-9a-f]{64}$/);
            expect(result.withdrawableAt).toBeGreaterThan(BigInt(Math.floor(Date.now() / 1000)));
            console.log('  ✓ Forced withdrawal enabled');
            console.log('    Withdrawable at:', new Date(Number(result.withdrawableAt) * 1000).toISOString());
        }, 30000);
    });
    describe('Compact Creation and Signing', () => {
        let singleCompact;
        let batchCompact;
        const compactLockId = 123n;
        it('should create and sign a single compact', async () => {
            const compactClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
                walletClient: mainnetWalletClient,
            });
            const lockTag = '0x000000000000000000000001';
            const nativeToken = '0x0000000000000000000000000000000000000000';
            singleCompact = compactClient.sponsor
                .compact()
                .arbiter(arbiterAccount.address)
                .sponsor(sponsorAccount.address)
                .nonce(1n)
                .expires(FIXED_EXPIRY)
                .lockTag(lockTag)
                .token(nativeToken)
                .amount(parseEther('0.01'))
                .build();
            expect(singleCompact.struct).toBeDefined();
            expect(singleCompact.struct.sponsor).toBe(sponsorAccount.address);
            expect(singleCompact.struct.arbiter).toBe(arbiterAccount.address);
            expect(singleCompact.struct.token).toBe(nativeToken);
            expect(singleCompact.struct.amount).toBe(parseEther('0.01'));
            expect(singleCompact.struct.lockTag).toBe(lockTag);
            expect(singleCompact.struct.expires).toBe(FIXED_EXPIRY);
            expect(singleCompact.struct.nonce).toBe(1n);
            expect(singleCompact.hash).toBe('0xa1e3c7153b6bcbbd03b7ee0804aa51656a1942b8839db245df070b734058d442');
            console.log('  ✓ Compact hash:', singleCompact.hash);
        });
        it('should create and sign a batch compact', async () => {
            const compactClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
                walletClient: mainnetWalletClient,
            });
            const lockTag1 = '0x000000000000000000000001';
            const lockTag2 = '0x000000000000000000000002';
            const nativeToken = '0x0000000000000000000000000000000000000000';
            batchCompact = compactClient.sponsor
                .batchCompact()
                .arbiter(arbiterAccount.address)
                .sponsor(sponsorAccount.address)
                .nonce(2n)
                .expires(FIXED_EXPIRY)
                .addLock({ lockTag: lockTag1, token: nativeToken, amount: parseEther('0.005') })
                .addLock({ lockTag: lockTag2, token: nativeToken, amount: parseEther('0.005') })
                .build();
            expect(batchCompact.struct).toBeDefined();
            expect(batchCompact.struct.commitments.length).toBe(2);
            expect(batchCompact.hash).toMatch(/^0x[0-9a-f]{64}$/);
            console.log('  ✓ Batch compact hash:', batchCompact.hash);
        });
    });
    describe('Full Compact Lifecycle', () => {
        // This is a complete end-to-end test of the compact lifecycle
        let lockTag;
        let lockId;
        const depositAmount = parseEther('1');
        const allocatedAmount = parseEther('0.5');
        it('should complete full sponsor flow: deposit → allocate → compact', async () => {
            const sponsorClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
                walletClient: mainnetWalletClient,
            });
            // Step 1: Generate a lock tag using a real registered allocator
            lockTag = encodeLockTag({
                allocatorId: TEST_ALLOCATOR.allocatorId,
                scope: Scope.ChainSpecific,
                resetPeriod: ResetPeriod.OneDay,
            });
            const nativeToken = '0x0000000000000000000000000000000000000000';
            console.log('  Step 1: Generated lock tag:', lockTag);
            // Step 2: Deposit funds
            const depositResult = await sponsorClient.sponsor.depositNative({
                lockTag,
                recipient: sponsorAccount.address,
                value: depositAmount,
            });
            expect(depositResult.txHash).toMatch(/^0x[0-9a-f]{64}$/);
            expect(depositResult.id).toBe(94501698038978669571803571365020320502788394544394064879678379552762356563968n);
            // Use the lock ID returned from the deposit
            lockId = depositResult.id;
            console.log('  Step 2: Deposited', depositAmount.toString(), 'wei');
            console.log('         TX:', depositResult.txHash);
            console.log('         Lock ID:', lockId.toString());
            // Step 3: Verify balance
            const balance = await sponsorClient.view.balanceOf({
                account: sponsorAccount.address,
                id: lockId,
            });
            expect(balance).toBeGreaterThanOrEqual(depositAmount);
            console.log('  Step 3: Balance verified:', balance.toString(), 'wei');
            // Step 4: Create a compact
            const compact = sponsorClient.sponsor
                .compact()
                .arbiter(arbiterAccount.address)
                .sponsor(sponsorAccount.address)
                .nonce(100n)
                .expires(FIXED_EXPIRY)
                .lockTag(lockTag)
                .token(nativeToken)
                .amount(allocatedAmount)
                .build();
            expect(compact.struct).toBeDefined();
            expect(compact.hash).toMatch(/^0x[0-9a-f]{64}$/);
            console.log('  Step 4: Compact created');
            console.log('         Hash:', compact.hash);
            console.log('         Expires:', new Date(Number(FIXED_EXPIRY) * 1000).toISOString());
        }, 60000);
        it('should query lock details', async () => {
            const client = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
            });
            const lockDetails = await client.view.getLockDetails(lockId);
            expect(lockDetails.token.toLowerCase()).toBe('0x0000000000000000000000000000000000000000');
            expect(lockDetails.lockTag.toLowerCase()).toBe(lockTag.toLowerCase());
            console.log('  ✓ Lock details retrieved');
            console.log('    Token:', lockDetails.token);
            console.log('    Lock tag:', lockDetails.lockTag);
        }, 30000);
    });
    describe('Claim Builder Tests', () => {
        it('should build a single claim with transfers', () => {
            const compactClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
            });
            const lockTag = '0x000000000000000000000001';
            const nativeToken = '0x0000000000000000000000000000000000000000';
            const lockId = encodeLockId(lockTag, nativeToken);
            const claim = compactClient.arbiter
                .singleClaimBuilder()
                .sponsor(sponsorAccount.address)
                .nonce(1n)
                .expires(FIXED_EXPIRY)
                .id(lockId)
                .lockTag(lockTag)
                .allocatedAmount(parseEther('0.1'))
                .addTransfer({ recipient: recipient1Account.address, amount: parseEther('0.1') })
                .build();
            expect(claim.struct).toBeDefined();
            expect(claim.struct.claimants.length).toBe(1);
            expect(claim.hash).toBe('0x71daadf772a9f2ab10fb465d61ffede07dbc64cd476154bdc44d25e2b7a37b92');
            console.log('  ✓ Single claim built');
            console.log('    Claimants:', claim.struct.claimants);
            console.log('    Hash:', claim.hash);
        });
        it('should build a batch claim with multiple portions', () => {
            const compactClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
            });
            const lockTag = '0x000000000000000000000001';
            const nativeToken = '0x0000000000000000000000000000000000000000';
            const lockId = encodeLockId(lockTag, nativeToken);
            const claim = compactClient.arbiter
                .batchClaimBuilder()
                .sponsor(sponsorAccount.address)
                .nonce(2n)
                .expires(FIXED_EXPIRY)
                .addClaim()
                .id(lockId)
                .allocatedAmount(parseEther('0.2'))
                .addPortion(lockTag, {
                kind: 'transfer',
                recipient: recipient1Account.address,
                amount: parseEther('0.1'),
            })
                .addPortion(lockTag, {
                kind: 'transfer',
                recipient: recipient2Account.address,
                amount: parseEther('0.1'),
            })
                .done()
                .build();
            expect(claim.struct).toBeDefined();
            expect(claim.struct.claims.length).toBe(1);
            expect(claim.struct.claims[0].portions.length).toBe(2);
            expect(claim.hash).toMatch(/^0x[0-9a-f]{64}$/);
            console.log('  ✓ Batch claim built');
            console.log('    Claims:', claim.struct.claims.length);
            console.log('    Portions in claim 0:', claim.struct.claims[0].portions.length);
        });
    });
    describe('Allocator Operations', () => {
        it('should extract allocator address from lock details', async () => {
            const compactClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
                walletClient: mainnetWalletClient,
            });
            // Create a lock using a real registered allocator
            const lockTag = encodeLockTag({
                allocatorId: TEST_ALLOCATOR.allocatorId,
                scope: Scope.ChainSpecific,
                resetPeriod: ResetPeriod.OneDay,
            });
            const nativeToken = '0x0000000000000000000000000000000000000000';
            // Deposit to create the lock
            const depositResult = await compactClient.sponsor.depositNative({
                lockTag,
                recipient: sponsorAccount.address,
                value: parseEther('0.01'),
            });
            // Use the lock ID returned from the deposit
            const lockId = depositResult.id;
            // Query lock details - should contain allocator address
            const lockDetails = await compactClient.view.getLockDetails(lockId);
            expect(lockDetails.allocator).toMatch(/^0x[0-9a-fA-F]{40}$/);
            expect(lockDetails.token.toLowerCase()).toBe(nativeToken.toLowerCase());
            expect(lockDetails.lockTag.toLowerCase()).toBe(lockTag.toLowerCase());
            console.log('  ✓ Allocator extracted:', lockDetails.allocator);
        }, 30000);
        it('should decode allocator ID from lock tag', () => {
            const allocatorId = 287803669127211327350859520n;
            const lockTag = encodeLockTag({
                allocatorId,
                scope: Scope.Multichain,
                resetPeriod: ResetPeriod.OneSecond,
            });
            const decoded = decodeLockTag(lockTag);
            expect(decoded.allocatorId).toBe(allocatorId);
            expect(decoded.scope).toBe(Scope.Multichain);
            expect(decoded.resetPeriod).toBe(ResetPeriod.OneSecond);
            console.log('  ✓ Allocator ID decoded:', allocatorId.toString());
        });
    });
    describe('Lock Tag and Lock ID Encoding', () => {
        it('should encode and decode lock tags correctly', () => {
            // This doesn't require chain interaction
            const allocatorId = 12345n;
            const lockTag = encodeLockTag({
                allocatorId,
                scope: Scope.ChainSpecific,
                resetPeriod: ResetPeriod.OneDay,
            });
            expect(lockTag).toBe('0xd00000000000000000003039');
            console.log('  ✓ Lock tag encoded:', lockTag);
        });
        it('should encode lock IDs correctly', () => {
            const lockTag = '0x000000000000000000000001';
            const token = '0x0000000000000000000000000000000000000000'; // Native ETH
            const lockId = encodeLockId(lockTag, token);
            expect(lockId).toBe(1461501637330902918203684832716283019655932542976n);
            console.log('  ✓ Lock ID encoded:', lockId.toString());
        });
    });
    describe('Multichain Operations', () => {
        it('should create a compact with multichain scope', async () => {
            const compactClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
                walletClient: mainnetWalletClient,
            });
            const lockTag = encodeLockTag({
                allocatorId: TEST_ALLOCATOR.allocatorId,
                scope: Scope.Multichain, // Key difference - multichain scope
                resetPeriod: ResetPeriod.OneDay,
            });
            const nativeToken = zeroAddress;
            // Create a compact with multichain scope
            const compact = compactClient.sponsor
                .compact()
                .arbiter(arbiterAccount.address)
                .sponsor(sponsorAccount.address)
                .nonce(1000n)
                .expires(FIXED_EXPIRY)
                .lockTag(lockTag)
                .token(nativeToken)
                .amount(parseEther('0.01'))
                .build();
            expect(compact.struct).toBeDefined();
            expect(compact.struct.sponsor).toBe(sponsorAccount.address);
            expect(compact.struct.token).toBe(nativeToken);
            expect(compact.struct.amount).toBe(parseEther('0.01'));
            expect(compact.hash).toBe('0xe56491ce4e3847363b1823df9aab875d21ab6fa17c6bd18712b4fc635194ff38');
            console.log('  ✓ Compact with multichain scope created');
            console.log('    Hash:', compact.hash);
        });
        it('should create multichain claim with additional chain hashes', () => {
            const compactClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
            });
            const lockTag = '0x800000000000000000000001'; // Multichain scope
            const nativeToken = '0x0000000000000000000000000000000000000000';
            const lockId = encodeLockId(lockTag, nativeToken);
            // Hash representing claim on another chain (e.g., OP)
            const opChainHash = '0x1111111111111111111111111111111111111111111111111111111111111111';
            const baseChainHash = '0x2222222222222222222222222222222222222222222222222222222222222222';
            const claim = compactClient.arbiter
                .multichainClaimBuilder()
                .sponsor(sponsorAccount.address)
                .nonce(1n)
                .expires(FIXED_EXPIRY)
                .id(lockId)
                .lockTag(lockTag)
                .allocatedAmount(parseEther('0.1'))
                .addTransfer({ recipient: recipient1Account.address, amount: parseEther('0.1') })
                .addAdditionalChainHash(opChainHash)
                .addAdditionalChainHash(baseChainHash)
                .build();
            expect(claim.struct).toBeDefined();
            expect(claim.struct.additionalChains.length).toBe(2);
            expect(claim.struct.additionalChains[0]).toBe(opChainHash);
            expect(claim.struct.additionalChains[1]).toBe(baseChainHash);
            console.log('  ✓ Multichain claim created with', claim.struct.additionalChains.length, 'chain hashes');
        });
    });
    describe('Error Handling', () => {
        it('should handle expired compacts', async () => {
            const compactClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
                walletClient: mainnetWalletClient,
            });
            const lockTag = '0x000000000000000000000099';
            const nativeToken = '0x0000000000000000000000000000000000000000';
            // Create an already-expired compact (expired in 2020)
            const compact = compactClient.sponsor
                .compact()
                .arbiter(arbiterAccount.address)
                .sponsor(sponsorAccount.address)
                .nonce(999n)
                .expires(FIXED_EXPIRED)
                .lockTag(lockTag)
                .token(nativeToken)
                .amount(parseEther('0.01'))
                .build();
            // Verify the compact was created with expired timestamp
            expect(compact.struct.expires).toBeLessThan(BigInt(Math.floor(Date.now() / 1000)));
            console.log('  ✓ Expired compact created (for testing)');
            console.log('    Expired at:', new Date(Number(FIXED_EXPIRED) * 1000).toISOString());
        });
        it('should handle insufficient balance errors', async () => {
            const compactClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
                walletClient: mainnetWalletClient,
            });
            // Use real allocator but a different token to ensure lock doesn't exist
            const lockTag = encodeLockTag({
                allocatorId: TEST_ALLOCATOR.allocatorId,
                scope: Scope.ChainSpecific,
                resetPeriod: ResetPeriod.OneDay,
            });
            // Use a non-existent token address to ensure lock doesn't exist
            const nonExistentToken = '0x0000000000000000000000000000000000000001';
            const lockId = encodeLockId(lockTag, nonExistentToken);
            // Query balance (should be 0 for this non-existent lock)
            const balance = await compactClient.view.balanceOf({
                account: sponsorAccount.address,
                id: lockId,
            });
            expect(balance).toBe(0n);
            console.log('  ✓ Verified zero balance for new lock');
            // Attempting to withdraw from zero balance would fail on-chain
            // (We're not actually submitting to avoid transaction failure)
        }, 30000);
        it('should validate compact builder inputs', () => {
            const compactClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
            });
            const lockTag = '0x000000000000000000000001';
            const nativeToken = '0x0000000000000000000000000000000000000000';
            // Try to build a compact without required fields - should throw
            expect(() => {
                compactClient.sponsor
                    .compact()
                    .lockTag(lockTag)
                    .token(nativeToken)
                    .amount(parseEther('0.01'))
                    // Missing: arbiter, sponsor, nonce, expires
                    .build();
            }).toThrow();
            console.log('  ✓ Compact builder validates required fields');
        });
    });
    describe('Complete Protocol Flow: Deposit → Sign Compact → Submit Claim', () => {
        it('should complete full flow with registered claim hash', async () => {
            console.log('\n🔄 Starting protocol flow with claim hash registration...');
            console.log('ⓘ  Note: This test uses claim hash registration instead of signatures.');
            console.log('ⓘ  Using AlwaysOKAllocator which accepts all claims.');
            // Setup sponsor client for deposits and registration
            const sponsorClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
                walletClient: mainnetWalletClient,
            });
            // Setup arbiter client for claim submission
            const arbiterClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
                walletClient: arbiterWalletClient,
            });
            // Step 1: Deposit funds as sponsor
            console.log('\n📥 Step 1: Depositing funds...');
            const depositAmount = parseEther('0.5');
            const lockTag = encodeLockTag({
                allocatorId: TEST_ALLOCATOR.allocatorId,
                scope: Scope.ChainSpecific,
                resetPeriod: ResetPeriod.OneDay,
            });
            const nativeToken = zeroAddress;
            const lockId = encodeLockId(lockTag, nativeToken);
            const balanceBeforeDeposit = await sponsorClient.view.balanceOf({
                account: sponsorAccount.address,
                id: lockId,
            });
            const depositResult = await sponsorClient.sponsor.depositNative({
                lockTag,
                recipient: sponsorAccount.address,
                value: depositAmount,
            });
            expect(depositResult.id).toBe(lockId);
            console.log('  ✓ Deposited:', depositAmount.toString(), 'wei');
            const balanceAfterDeposit = await sponsorClient.view.balanceOf({
                account: sponsorAccount.address,
                id: lockId,
            });
            expect(balanceAfterDeposit).toBeGreaterThanOrEqual(balanceBeforeDeposit + depositAmount);
            // Step 2: Sponsor creates a compact
            console.log('\n📝 Step 2: Creating compact for registration...');
            const nonce = BigInt(Date.now()) + 1n; // Use timestamp for unique nonce
            const compact = sponsorClient.sponsor
                .compact()
                .arbiter(arbiterAccount.address)
                .sponsor(sponsorAccount.address)
                .nonce(nonce)
                .expires(FIXED_EXPIRY)
                .lockTag(lockTag)
                .token(nativeToken)
                .amount(depositAmount)
                .build();
            expect(compact.typedData).toBeDefined();
            expect(compact.hash).toBeDefined();
            console.log('  ✓ Compact created');
            console.log('    Hash:', compact.hash);
            console.log('    Nonce:', nonce.toString());
            // Step 3: Sponsor registers the compact hash on-chain
            console.log('\n📋 Step 3: Registering compact hash on-chain...');
            // Compute the hash for registration
            // This is NOT the EIP-712 hash - it's a simpler hash that includes arbiter and witness
            // Based on The Compact's Register.t.sol test implementation
            const { keccak256, toHex, encodeAbiParameters } = await import('viem');
            // CompactWithWitness typestring (includes mandate/witness)
            const mandateTypeString = 'Mandate(uint256 witnessArgument)';
            const mandateTypehash = keccak256(toHex(mandateTypeString));
            const compactWithWitnessTypeString = 'Compact(address arbiter,address sponsor,uint256 nonce,uint256 expires,bytes12 lockTag,address token,uint256 amount,Mandate mandate)Mandate(uint256 witnessArgument)';
            const compactWithWitnessTypehash = keccak256(toHex(compactWithWitnessTypeString));
            console.log('  ⓘ CompactWithWitness typehash:', compactWithWitnessTypehash);
            // Compute witness hash: keccak256(abi.encode(MANDATE_TYPEHASH, witnessArgument))
            // For no witness, use witnessArgument = 0
            const witnessHash = keccak256(encodeAbiParameters([
                { name: 'typehash', type: 'bytes32' },
                { name: 'witnessArgument', type: 'uint256' },
            ], [mandateTypehash, 0n]));
            console.log('  ⓘ Witness hash:', witnessHash);
            // Compute registration hash: keccak256(abi.encode(typehash, arbiter, sponsor, nonce, expires, lockTag, token, amount, witness))
            const registrationHash = keccak256(encodeAbiParameters([
                { name: 'typehash', type: 'bytes32' },
                { name: 'arbiter', type: 'address' },
                { name: 'sponsor', type: 'address' },
                { name: 'nonce', type: 'uint256' },
                { name: 'expires', type: 'uint256' },
                { name: 'lockTag', type: 'bytes12' },
                { name: 'token', type: 'address' },
                { name: 'amount', type: 'uint256' },
                { name: 'witness', type: 'bytes32' },
            ], [
                compactWithWitnessTypehash,
                arbiterAccount.address,
                sponsorAccount.address,
                nonce,
                FIXED_EXPIRY,
                lockTag,
                nativeToken,
                depositAmount,
                witnessHash, // Use computed witness hash
            ]));
            console.log('  ⓘ Registration hash:', registrationHash);
            const registerTxHash = await sponsorClient.sponsor.register({
                claimHash: registrationHash,
                typehash: compactWithWitnessTypehash,
            });
            console.log('  ✓ Claim hash registered');
            console.log('    Registration tx:', registerTxHash);
            // Wait for registration transaction
            const registerReceipt = await mainnetPublicClient.waitForTransactionReceipt({
                hash: registerTxHash,
            });
            expect(registerReceipt.status).toBe('success');
            console.log('  ✓ Registration confirmed in block:', registerReceipt.blockNumber.toString());
            // Step 4: Build claim from registered compact
            console.log('\n🎯 Step 4: Building claim from registered compact...');
            const recipient1Amount = parseEther('0.3');
            const recipient2Amount = parseEther('0.2');
            // Build claim manually (not using fromCompact since we're using registration)
            const claim = arbiterClient.arbiter
                .singleClaimBuilder()
                .sponsor(sponsorAccount.address)
                .sponsorSignature('') // Empty string for registered claims (not '0x')
                .nonce(nonce) // Same nonce as compact
                .expires(FIXED_EXPIRY) // Same expiry as compact
                .id(lockId)
                .lockTag(lockTag) // Must set lockTag before adding claimants
                .allocatedAmount(depositAmount)
                .addTransfer({
                recipient: recipient1Account.address,
                amount: recipient1Amount,
            })
                .addTransfer({
                recipient: recipient2Account.address,
                amount: recipient2Amount,
            })
                .build();
            // Set witness to match the registered hash
            claim.struct.witness = witnessHash;
            claim.struct.witnessTypestring = 'uint256 witnessArgument';
            // Sign the claim with the allocator
            // AlwaysOKAllocator implements IERC1271 and accepts any signature
            const claimDigest = claim.hash;
            const allocatorSignature = await mainnetWalletClient.signMessage({
                account: allocatorAccount,
                message: { raw: claimDigest },
            });
            // Update claim with allocator signature
            claim.struct.allocatorData = allocatorSignature;
            expect(claim.struct).toBeDefined();
            console.log('  ✓ Claim built');
            console.log('    Claim hash:', claim.hash);
            console.log('    Transfers: 2');
            console.log('  ⓘ Claim fields for hash:');
            console.log('    sponsor:', claim.struct.sponsor);
            console.log('    nonce:', claim.struct.nonce.toString());
            console.log('    expires:', claim.struct.expires.toString());
            console.log('    witness:', claim.struct.witness);
            console.log('    id:', claim.struct.id.toString());
            console.log('    allocatedAmount:', claim.struct.allocatedAmount.toString());
            // Get initial ERC6909 balances before claim (should be 0)
            const recipient1InitialBalance = await sponsorClient.view.balanceOf({
                account: recipient1Account.address,
                id: lockId,
            });
            const recipient2InitialBalance = await sponsorClient.view.balanceOf({
                account: recipient2Account.address,
                id: lockId,
            });
            // Step 5: Submit claim on-chain (arbiter submits the claim)
            console.log('\n🚀 Step 5: Submitting claim on-chain...');
            console.log('  ⓘ Submitting claim from arbiter:', arbiterAccount.address);
            console.log('  ⓘ Using registered hash instead of signature');
            const claimResult = await arbiterClient.arbiter.claim(claim.struct);
            expect(claimResult.txHash).toMatch(/^0x[0-9a-f]{64}$/);
            expect(claimResult.claimHash).toMatch(/^0x[0-9a-f]{64}$/);
            console.log('  ✓ Claim submitted');
            console.log('    Tx hash:', claimResult.txHash);
            console.log('    Claim hash (content hash):', claimResult.claimHash);
            console.log('    Claim hash (EIP-712 hash):', claim.hash);
            // Wait for transaction confirmation
            const receipt = await mainnetPublicClient.waitForTransactionReceipt({
                hash: claimResult.txHash,
            });
            console.log('  ✓ Transaction mined in block:', receipt.blockNumber.toString());
            console.log('    Transaction status:', receipt.status);
            console.log('    Gas used:', receipt.gasUsed.toString());
            console.log('    Logs count:', receipt.logs.length);
            // Log detailed receipt info
            if (receipt.status === 'reverted') {
                console.log('\n  ⚠️  Transaction reverted!');
                console.log('    Transaction hash:', claimResult.txHash);
                console.log('    Receipt:', JSON.stringify(receipt, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2));
            }
            // Step 6: Verify results
            console.log('\n✅ Step 6: Verifying results...');
            // AlwaysOKAllocator should accept all claims
            expect(receipt.status).toBe('success');
            console.log('  ✓ Claim accepted by AlwaysOKAllocator!');
            // Check sponsor's lock balance decreased
            const sponsorBalanceAfterClaim = await sponsorClient.view.balanceOf({
                account: sponsorAccount.address,
                id: lockId,
            });
            const expectedBalanceAfterClaim = balanceAfterDeposit - depositAmount;
            expect(sponsorBalanceAfterClaim).toBe(expectedBalanceAfterClaim);
            console.log('  ✓ Sponsor lock balance decreased by:', depositAmount.toString(), 'wei');
            // Check recipients received ERC6909 tokens in The Compact
            const recipient1FinalBalance = await sponsorClient.view.balanceOf({
                account: recipient1Account.address,
                id: lockId,
            });
            const recipient2FinalBalance = await sponsorClient.view.balanceOf({
                account: recipient2Account.address,
                id: lockId,
            });
            const recipient1Increase = recipient1FinalBalance - recipient1InitialBalance;
            const recipient2Increase = recipient2FinalBalance - recipient2InitialBalance;
            expect(recipient1Increase).toBe(recipient1Amount);
            expect(recipient2Increase).toBe(recipient2Amount);
            console.log('  ✓ Recipient 1 received ERC6909:', recipient1Increase.toString(), 'wei');
            console.log('  ✓ Recipient 2 received ERC6909:', recipient2Increase.toString(), 'wei');
            console.log('\n🎉 Protocol flow with claim hash registration test passed!');
            console.log('   SDK successfully demonstrated complete registration-based claim flow with internal transfers');
        }, 120000); // 2 minute timeout
        it('should complete full flow: deposit → compact → claim submission', async () => {
            console.log('\n🔄 Starting complete protocol flow test...');
            console.log('ⓘ  Note: This test uses sponsor signatures for compact authorization.');
            console.log('ⓘ  Using AlwaysOKAllocator which accepts all claims.');
            // Setup sponsor client for deposits
            const sponsorClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
                walletClient: mainnetWalletClient,
            });
            // Setup arbiter client for claim submission
            const arbiterClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
                walletClient: arbiterWalletClient,
            });
            // Step 1: Deposit funds as sponsor
            console.log('\n📥 Step 1: Depositing funds...');
            const depositAmount = parseEther('1.0');
            const lockTag = encodeLockTag({
                allocatorId: TEST_ALLOCATOR.allocatorId,
                scope: Scope.ChainSpecific,
                resetPeriod: ResetPeriod.OneDay,
            });
            const nativeToken = zeroAddress;
            const lockId = encodeLockId(lockTag, nativeToken);
            // Get balance before deposit
            const balanceBeforeDeposit = await sponsorClient.view.balanceOf({
                account: sponsorAccount.address,
                id: lockId,
            });
            console.log('  ⓘ Balance before deposit:', balanceBeforeDeposit.toString());
            const depositResult = await sponsorClient.sponsor.depositNative({
                lockTag,
                recipient: sponsorAccount.address,
                value: depositAmount,
            });
            expect(depositResult.id).toBe(lockId);
            console.log('  ✓ Deposited:', depositAmount.toString(), 'wei');
            console.log('  ✓ Lock ID:', lockId.toString());
            // Verify balance increased by deposit amount
            const balanceAfterDeposit = await sponsorClient.view.balanceOf({
                account: sponsorAccount.address,
                id: lockId,
            });
            expect(balanceAfterDeposit).toBeGreaterThanOrEqual(balanceBeforeDeposit + depositAmount);
            console.log('  ✓ Sponsor balance verified:', balanceAfterDeposit.toString());
            // Step 2: Sponsor creates and signs compact
            console.log('\n📝 Step 2: Creating and signing compact...');
            const nonce = BigInt(Date.now()) + 2n; // Use timestamp for unique nonce
            const compact = sponsorClient.sponsor
                .compact()
                .arbiter(arbiterAccount.address)
                .sponsor(sponsorAccount.address)
                .nonce(nonce)
                .expires(FIXED_EXPIRY)
                .lockTag(lockTag)
                .token(nativeToken)
                .amount(depositAmount)
                .build();
            expect(compact.typedData).toBeDefined();
            console.log('  ✓ Compact created');
            console.log('    Arbiter:', compact.struct.arbiter);
            console.log('    Amount:', compact.struct.amount.toString());
            // Sponsor signs the compact
            const signature = await mainnetWalletClient.signTypedData({
                account: sponsorAccount,
                ...compact.typedData,
            });
            expect(signature).toMatch(/^0x[0-9a-f]+$/);
            console.log('  ✓ Compact signed by sponsor');
            console.log('    Signature:', signature.slice(0, 20) + '...');
            // Step 3: Build claim from compact
            console.log('\n🎯 Step 3: Building claim from compact...');
            const recipient1Amount = parseEther('0.6');
            const recipient2Amount = parseEther('0.4');
            const claimBuilder = arbiterClient.arbiter
                .singleClaimBuilder()
                .fromCompact({
                compact: compact.struct,
                signature,
                id: lockId,
            })
                .allocatedAmount(depositAmount) // Only allocate the newly deposited amount
                .addTransfer({
                recipient: recipient1Account.address,
                amount: recipient1Amount,
            })
                .addTransfer({
                recipient: recipient2Account.address,
                amount: recipient2Amount,
            });
            const claim = claimBuilder.build();
            // Sign the claim with the allocator
            // AlwaysOKAllocator implements IERC1271 and accepts any signature
            const claimDigest = claim.hash;
            const allocatorSignature = await mainnetWalletClient.signMessage({
                account: allocatorAccount,
                message: { raw: claimDigest },
            });
            // Update claim with allocator signature
            claim.struct.allocatorData = allocatorSignature;
            expect(claim.struct).toBeDefined();
            expect(claim.struct.claimants.length).toBe(2);
            console.log('  ✓ Claim built with', claim.struct.claimants.length, 'claimants');
            console.log('    Recipient 1 amount:', recipient1Amount.toString());
            console.log('    Recipient 2 amount:', recipient2Amount.toString());
            console.log('  ⓘ Claim details:');
            console.log('    Sponsor:', claim.struct.sponsor);
            console.log('    Nonce:', claim.struct.nonce.toString());
            console.log('    Expires:', claim.struct.expires.toString());
            console.log('    Allocated amount:', claim.struct.allocatedAmount.toString());
            // Get initial ERC6909 balances before claim (should be 0)
            const recipient1InitialBalance = await sponsorClient.view.balanceOf({
                account: recipient1Account.address,
                id: lockId,
            });
            const recipient2InitialBalance = await sponsorClient.view.balanceOf({
                account: recipient2Account.address,
                id: lockId,
            });
            // Step 4: Submit claim on-chain (arbiter submits the claim)
            console.log('\n🚀 Step 4: Submitting claim on-chain...');
            console.log('  ⓘ Arbiter account address:', arbiterAccount.address);
            console.log('  ⓘ Sponsor account address:', sponsorAccount.address);
            console.log('  ⓘ Arbiter wallet client account:', arbiterWalletClient.account?.address);
            const claimResult = await arbiterClient.arbiter.claim(claim.struct);
            expect(claimResult.txHash).toMatch(/^0x[0-9a-f]{64}$/);
            expect(claimResult.claimHash).toMatch(/^0x[0-9a-f]{64}$/);
            console.log('  ✓ Claim submitted');
            console.log('    Tx hash:', claimResult.txHash);
            console.log('    Claim hash:', claimResult.claimHash);
            // Wait for transaction confirmation
            const receipt = await mainnetPublicClient.waitForTransactionReceipt({
                hash: claimResult.txHash,
            });
            console.log('  ✓ Transaction mined in block:', receipt.blockNumber.toString());
            console.log('    Transaction status:', receipt.status);
            console.log('    Gas used:', receipt.gasUsed.toString());
            console.log('    Logs count:', receipt.logs.length);
            // Log detailed receipt info
            if (receipt.status === 'reverted') {
                console.log('\n  ⚠️  Transaction reverted!');
                console.log('    Transaction hash:', claimResult.txHash);
                console.log('    Receipt:', JSON.stringify(receipt, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2));
            }
            // Step 5: Verify results
            console.log('\n✅ Step 5: Verifying results...');
            // AlwaysOKAllocator should accept all claims
            expect(receipt.status).toBe('success');
            console.log('  ✓ Claim accepted by AlwaysOKAllocator!');
            // Check sponsor's lock balance decreased by the claimed amount
            const sponsorBalanceAfterClaim = await sponsorClient.view.balanceOf({
                account: sponsorAccount.address,
                id: lockId,
            });
            const expectedBalanceAfterClaim = balanceAfterDeposit - depositAmount;
            expect(sponsorBalanceAfterClaim).toBe(expectedBalanceAfterClaim);
            console.log('  ✓ Sponsor lock balance decreased by:', depositAmount.toString(), 'wei');
            // Check recipients received ERC6909 tokens in The Compact
            const recipient1FinalBalance = await sponsorClient.view.balanceOf({
                account: recipient1Account.address,
                id: lockId,
            });
            const recipient2FinalBalance = await sponsorClient.view.balanceOf({
                account: recipient2Account.address,
                id: lockId,
            });
            const recipient1Increase = recipient1FinalBalance - recipient1InitialBalance;
            const recipient2Increase = recipient2FinalBalance - recipient2InitialBalance;
            expect(recipient1Increase).toBe(recipient1Amount);
            expect(recipient2Increase).toBe(recipient2Amount);
            console.log('  ✓ Recipient 1 received ERC6909:', recipient1Increase.toString(), 'wei');
            console.log('  ✓ Recipient 2 received ERC6909:', recipient2Increase.toString(), 'wei');
            console.log('\n🎉 Complete protocol flow test passed!');
            console.log('   SDK successfully demonstrated signature-based claim flow with internal transfers');
        }, 60000); // 60 second timeout for this comprehensive test
        it('should handle transfers, conversions, and withdrawals in a single claim', async () => {
            console.log('\n🔄 Starting comprehensive claim component types test...');
            console.log('ⓘ  This test demonstrates all three claim component types:');
            console.log('   - Transfer: same lock tag (ERC6909 → ERC6909)');
            console.log('   - Convert: different lock tag (ERC6909 → different ERC6909)');
            console.log('   - Withdraw: extract underlying tokens (ERC6909 → native ETH)');
            // Setup clients
            const sponsorClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
                walletClient: mainnetWalletClient,
            });
            const arbiterClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
                walletClient: arbiterWalletClient,
            });
            const nativeToken = '0x0000000000000000000000000000000000000000';
            // Step 1: Create two different lock tags for testing conversions
            const sourceLockTag = encodeLockTag({
                allocatorId: TEST_ALLOCATOR.allocatorId,
                scope: Scope.ChainSpecific,
                resetPeriod: ResetPeriod.OneDay,
            });
            const targetLockTag = encodeLockTag({
                allocatorId: TEST_ALLOCATOR.allocatorId,
                scope: Scope.ChainSpecific,
                resetPeriod: ResetPeriod.SevenDaysAndOneHour, // Different reset period
            });
            console.log('\n📥 Step 1: Depositing funds with source lock tag...');
            const depositAmount = parseEther('1.5');
            const depositResult = await sponsorClient.sponsor.depositNative({
                lockTag: sourceLockTag,
                value: depositAmount,
                recipient: sponsorAccount.address,
            });
            const sourceLockId = depositResult.id;
            console.log('  ✓ Deposited:', depositAmount.toString(), 'wei');
            console.log('  ✓ Source lock ID:', sourceLockId.toString());
            // Step 2: Create and sign compact
            console.log('\n📝 Step 2: Creating and signing compact...');
            const nonce = BigInt(Date.now()) + 10n;
            const compact = sponsorClient.sponsor
                .compact()
                .arbiter(arbiterAccount.address)
                .sponsor(sponsorAccount.address)
                .nonce(nonce)
                .expires(FIXED_EXPIRY)
                .lockTag(sourceLockTag)
                .token(nativeToken)
                .amount(depositAmount)
                .build();
            const signature = await mainnetWalletClient.signTypedData({
                account: sponsorAccount,
                ...compact.typedData,
            });
            console.log('  ✓ Compact created and signed');
            // Step 3: Build claim with all three component types
            console.log('\n🎯 Step 3: Building claim with all component types...');
            const transferAmount = parseEther('0.5'); // Transfer to recipient1 with same lock tag
            const convertAmount = parseEther('0.5'); // Convert to recipient2 with different lock tag
            const withdrawAmount = parseEther('0.5'); // Withdraw to recipient3 as native ETH
            // Use fixed addresses like the Solidity tests (these won't have contracts deployed)
            const withdrawRecipient = {
                address: '0x3333333333333333333333333333333333333333',
            };
            const claimBuilder = arbiterClient.arbiter
                .singleClaimBuilder()
                .fromCompact({
                compact: compact.struct,
                signature,
                id: sourceLockId,
            })
                .allocatedAmount(depositAmount)
                .addTransfer({
                recipient: recipient1Account.address,
                amount: transferAmount,
            })
                .addConvert({
                recipient: recipient2Account.address,
                amount: convertAmount,
                targetLockTag,
            })
                .addWithdraw({
                recipient: withdrawRecipient.address, // Withdraw native ETH to fresh account
                amount: withdrawAmount,
            });
            const claim = claimBuilder.build();
            // Sign with allocator
            const allocatorSignature = await mainnetWalletClient.signMessage({
                account: allocatorAccount,
                message: { raw: claim.hash },
            });
            claim.struct.allocatorData = allocatorSignature;
            console.log('  ✓ Claim built with 3 claimants:');
            console.log('    - Transfer:', transferAmount.toString(), 'wei to', recipient1Account.address);
            console.log('    - Convert:', convertAmount.toString(), 'wei to', recipient2Account.address);
            console.log('    - Withdraw:', withdrawAmount.toString(), 'wei to', withdrawRecipient.address);
            // Get initial balances
            const recipient1InitialERC6909 = await sponsorClient.view.balanceOf({
                account: recipient1Account.address,
                id: sourceLockId,
            });
            const targetLockId = encodeLockId(targetLockTag, nativeToken);
            const recipient2InitialERC6909 = await sponsorClient.view.balanceOf({
                account: recipient2Account.address,
                id: targetLockId,
            });
            const withdrawRecipientInitialNative = await mainnetPublicClient.getBalance({
                address: withdrawRecipient.address,
            });
            const compactInitialBalance = await mainnetPublicClient.getBalance({
                address: CHAINS.mainnet.compactAddress,
            });
            // Step 4: Submit claim
            console.log('\n🚀 Step 4: Submitting claim...');
            const claimResult = await arbiterClient.arbiter.claim(claim.struct);
            console.log('  ✓ Claim submitted');
            console.log('    Tx hash:', claimResult.txHash);
            const receipt = await mainnetPublicClient.waitForTransactionReceipt({
                hash: claimResult.txHash,
            });
            console.log('  ✓ Transaction mined');
            console.log('    Status:', receipt.status);
            console.log('    Gas used:', receipt.gasUsed.toString());
            // Step 5: Verify all three component types worked correctly
            console.log('\n✅ Step 5: Verifying all component types...');
            // Verify transfer: recipient1 should have ERC6909 tokens with source lock tag
            const recipient1FinalERC6909 = await sponsorClient.view.balanceOf({
                account: recipient1Account.address,
                id: sourceLockId,
            });
            const recipient1Increase = recipient1FinalERC6909 - recipient1InitialERC6909;
            expect(recipient1Increase).toBe(transferAmount);
            console.log('  ✓ Transfer verified: recipient1 received', recipient1Increase.toString(), 'wei of ERC6909 (source lock)');
            // Verify conversion: recipient2 should have ERC6909 tokens with target lock tag
            const recipient2FinalERC6909 = await sponsorClient.view.balanceOf({
                account: recipient2Account.address,
                id: targetLockId,
            });
            const recipient2Increase = recipient2FinalERC6909 - recipient2InitialERC6909;
            expect(recipient2Increase).toBe(convertAmount);
            console.log('  ✓ Convert verified: recipient2 received', recipient2Increase.toString(), 'wei of ERC6909 (target lock)');
            // Verify withdrawal: withdrawRecipient should have received native ETH
            const withdrawRecipientFinalNative = await mainnetPublicClient.getBalance({
                address: withdrawRecipient.address,
            });
            const withdrawRecipientIncrease = withdrawRecipientFinalNative - withdrawRecipientInitialNative;
            expect(withdrawRecipientIncrease).toBe(withdrawAmount);
            console.log('  ✓ Withdraw verified: withdrawal recipient received', withdrawRecipientIncrease.toString(), 'wei of native ETH');
            // Verify Compact contract sent out the withdrawal
            const compactFinalBalance = await mainnetPublicClient.getBalance({
                address: CHAINS.mainnet.compactAddress,
            });
            const compactBalanceChange = compactFinalBalance - compactInitialBalance;
            expect(compactBalanceChange).toBe(-withdrawAmount);
            console.log('  ✓ Compact contract balance decreased by', (-compactBalanceChange).toString(), 'wei');
            console.log('\n🎉 Comprehensive claim component types test passed!');
            console.log('   SDK successfully demonstrated all three claim component types in a single claim');
        }, 60000);
        it('should handle batch compact with different reset periods', async () => {
            console.log('\n🔄 Starting batch compact test with different reset periods...');
            console.log('ⓘ  This test demonstrates:');
            console.log('   - Multiple resource locks with different reset periods');
            console.log('   - Batch compact covering multiple locks');
            console.log('   - Batch claim processing all locks in one transaction');
            // Setup clients
            const sponsorClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
                walletClient: mainnetWalletClient,
            });
            const arbiterClient = createCompactClient({
                chainId: CHAINS.mainnet.id,
                address: CHAINS.mainnet.compactAddress,
                publicClient: mainnetPublicClient,
                walletClient: arbiterWalletClient,
            });
            const nativeToken = '0x0000000000000000000000000000000000000000';
            // Step 1: Create two lock tags with different reset periods
            const lockTag1 = encodeLockTag({
                allocatorId: TEST_ALLOCATOR.allocatorId,
                scope: Scope.ChainSpecific,
                resetPeriod: ResetPeriod.OneDay,
            });
            const lockTag2 = encodeLockTag({
                allocatorId: TEST_ALLOCATOR.allocatorId,
                scope: Scope.ChainSpecific,
                resetPeriod: ResetPeriod.SevenDaysAndOneHour,
            });
            console.log('\n📥 Step 1: Depositing to two different locks...');
            const amount1 = parseEther('1.0');
            const amount2 = parseEther('0.5');
            const deposit1 = await sponsorClient.sponsor.depositNative({
                lockTag: lockTag1,
                value: amount1,
                recipient: sponsorAccount.address,
            });
            const lockId1 = deposit1.id;
            const deposit2 = await sponsorClient.sponsor.depositNative({
                lockTag: lockTag2,
                value: amount2,
                recipient: sponsorAccount.address,
            });
            const lockId2 = deposit2.id;
            console.log('  ✓ Deposited to lock 1:', amount1.toString(), 'wei (OneDay)');
            console.log('    Lock ID:', lockId1.toString());
            console.log('  ✓ Deposited to lock 2:', amount2.toString(), 'wei (SevenDaysAndOneHour)');
            console.log('    Lock ID:', lockId2.toString());
            // Step 2: Create and sign batch compact
            console.log('\n📝 Step 2: Creating batch compact...');
            const nonce = BigInt(Date.now()) + 20n;
            const batchCompact = sponsorClient.sponsor
                .batchCompact()
                .arbiter(arbiterAccount.address)
                .sponsor(sponsorAccount.address)
                .nonce(nonce)
                .expires(FIXED_EXPIRY)
                .addLock({
                lockTag: lockTag1,
                token: nativeToken,
                amount: amount1,
            })
                .addLock({
                lockTag: lockTag2,
                token: nativeToken,
                amount: amount2,
            })
                .build();
            const signature = await mainnetWalletClient.signTypedData({
                account: sponsorAccount,
                ...batchCompact.typedData,
            });
            console.log('  ✓ Batch compact created and signed');
            console.log('    Covering 2 locks with different reset periods');
            // Step 3: Build batch claim with different component types for each lock
            console.log('\n🎯 Step 3: Building batch claim...');
            // Recipients
            const recipient1 = {
                address: '0x1111111111111111111111111111111111111111',
            };
            const recipient2 = {
                address: '0x2222222222222222222222222222222222222222',
            };
            const batchClaim = arbiterClient.arbiter
                .batchClaimBuilder()
                .sponsor(batchCompact.struct.sponsor)
                .nonce(batchCompact.struct.nonce)
                .expires(batchCompact.struct.expires)
                .sponsorSignature(signature)
                // Lock 1: split between transfer and withdrawal
                .addClaim()
                .id(lockId1)
                .allocatedAmount(amount1)
                .addPortion(lockTag1, {
                kind: 'transfer',
                recipient: recipient1.address,
                amount: parseEther('0.7'),
            })
                .addPortion(lockTag1, {
                kind: 'withdraw',
                recipient: recipient1.address,
                amount: parseEther('0.3'),
            })
                .done()
                // Lock 2: all transferred
                .addClaim()
                .id(lockId2)
                .allocatedAmount(amount2)
                .addPortion(lockTag2, {
                kind: 'transfer',
                recipient: recipient2.address,
                amount: amount2,
            })
                .done()
                .build();
            // Sign with allocator
            const allocatorSignature = await mainnetWalletClient.signMessage({
                account: allocatorAccount,
                message: { raw: batchClaim.hash },
            });
            batchClaim.struct.allocatorData = allocatorSignature;
            console.log('  ✓ Batch claim built:');
            console.log('    Lock 1: 0.7 ETH transfer + 0.3 ETH withdrawal');
            console.log('    Lock 2: 0.5 ETH transfer');
            // Get initial balances
            const recipient1InitialERC6909Lock1 = await sponsorClient.view.balanceOf({
                account: recipient1.address,
                id: lockId1,
            });
            const recipient1InitialNative = await mainnetPublicClient.getBalance({
                address: recipient1.address,
            });
            const recipient2InitialERC6909Lock2 = await sponsorClient.view.balanceOf({
                account: recipient2.address,
                id: lockId2,
            });
            // Step 4: Submit batch claim
            console.log('\n🚀 Step 4: Submitting batch claim...');
            const claimResult = await arbiterClient.arbiter.batchClaim(batchClaim.struct);
            console.log('  ✓ Batch claim submitted');
            console.log('    Tx hash:', claimResult.txHash);
            const receipt = await mainnetPublicClient.waitForTransactionReceipt({
                hash: claimResult.txHash,
            });
            console.log('  ✓ Transaction mined');
            console.log('    Status:', receipt.status);
            console.log('    Gas used:', receipt.gasUsed.toString());
            // Step 5: Verify all claims
            console.log('\n✅ Step 5: Verifying batch claim results...');
            // Verify lock 1 transfer
            const recipient1FinalERC6909Lock1 = await sponsorClient.view.balanceOf({
                account: recipient1.address,
                id: lockId1,
            });
            const recipient1ERC6909Increase = recipient1FinalERC6909Lock1 - recipient1InitialERC6909Lock1;
            expect(recipient1ERC6909Increase).toBe(parseEther('0.7'));
            console.log('  ✓ Lock 1 transfer verified:', recipient1ERC6909Increase.toString(), 'wei ERC6909');
            // Verify lock 1 withdrawal
            const recipient1FinalNative = await mainnetPublicClient.getBalance({
                address: recipient1.address,
            });
            const recipient1NativeIncrease = recipient1FinalNative - recipient1InitialNative;
            expect(recipient1NativeIncrease).toBe(parseEther('0.3'));
            console.log('  ✓ Lock 1 withdrawal verified:', recipient1NativeIncrease.toString(), 'wei native ETH');
            // Verify lock 2 transfer
            const recipient2FinalERC6909Lock2 = await sponsorClient.view.balanceOf({
                account: recipient2.address,
                id: lockId2,
            });
            const recipient2ERC6909Increase = recipient2FinalERC6909Lock2 - recipient2InitialERC6909Lock2;
            expect(recipient2ERC6909Increase).toBe(amount2);
            console.log('  ✓ Lock 2 transfer verified:', recipient2ERC6909Increase.toString(), 'wei ERC6909');
            console.log('\n🎉 Batch compact test passed!');
            console.log('   SDK successfully processed multiple locks with different reset periods in a single batch claim');
        }, 60000);
        // TODO: Add multichain compact test
        // This would require setting up Unichain public/wallet clients in the test environment
        // Skipping for now as it requires additional infrastructure setup
    });
});
//# sourceMappingURL=e2e.test.js.map