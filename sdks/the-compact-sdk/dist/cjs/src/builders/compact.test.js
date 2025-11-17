"use strict";
/**
 * Tests for Compact builders
 */
Object.defineProperty(exports, "__esModule", { value: true });
const compact_1 = require("./compact");
const mandate_1 = require("./mandate");
// Create a simple mandate type for testing
const SimpleMandateType = (0, mandate_1.simpleMandate)([{ name: 'fillerAddress', type: 'address' }]);
describe('Compact Builders', () => {
    const domain = {
        name: 'The Compact',
        version: '1',
        chainId: 1,
        verifyingContract: '0x00000000000000171ede64904551eeDF3C6C9788',
    };
    const arbiterAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    const sponsorAddress = '0x1234567890123456789012345678901234567890';
    const tokenAddress = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
    const lockTag = '0x000000000000000000000001';
    describe('CompactBuilder factory', () => {
        it('should create a SingleCompactBuilder', () => {
            const builder = compact_1.CompactBuilder.single(domain);
            expect(builder).toBeInstanceOf(compact_1.SingleCompactBuilder);
        });
        it('should create a BatchCompactBuilder', () => {
            const builder = compact_1.CompactBuilder.batch(domain);
            expect(builder).toBeInstanceOf(compact_1.BatchCompactBuilder);
        });
        it('should create a MultichainCompactBuilder', () => {
            const builder = compact_1.CompactBuilder.multichain(domain);
            expect(builder).toBeInstanceOf(compact_1.MultichainCompactBuilder);
        });
    });
    describe('SingleCompactBuilder', () => {
        it('should build a compact with all fields', () => {
            const expires = BigInt(Date.now() + 3600000);
            const result = compact_1.CompactBuilder.single(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(expires)
                .lockTag(lockTag)
                .token(tokenAddress)
                .amount(1000000n)
                .build();
            expect(result.struct.arbiter).toBe(arbiterAddress);
            expect(result.struct.sponsor).toBe(sponsorAddress);
            expect(result.struct.nonce).toBe(1n);
            expect(result.struct.expires).toBe(expires);
            expect(result.struct.lockTag).toBe(lockTag);
            expect(result.struct.token).toBe(tokenAddress);
            expect(result.struct.amount).toBe(1000000n);
            expect(result.hash).toMatch(/^0x[0-9a-f]{64}$/);
            expect(result.typedData.primaryType).toBe('Compact');
        });
        it('should support expiresAt alias', () => {
            const expires = BigInt(Date.now() + 3600000);
            const result = compact_1.CompactBuilder.single(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expiresAt(expires)
                .lockTag(lockTag)
                .token(tokenAddress)
                .amount(1000000n)
                .build();
            expect(result.struct.expires).toBe(expires);
        });
        it('should support expiresIn with seconds', () => {
            const beforeTimestamp = BigInt(Math.floor(Date.now() / 1000));
            const result = compact_1.CompactBuilder.single(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expiresIn(3600)
                .lockTag(lockTag)
                .token(tokenAddress)
                .amount(1000000n)
                .build();
            const afterTimestamp = BigInt(Math.floor(Date.now() / 1000));
            // Should be approximately now + 3600 seconds
            expect(result.struct.expires >= beforeTimestamp + 3600n).toBe(true);
            expect(result.struct.expires <= afterTimestamp + 3600n).toBe(true);
        });
        it('should support expiresIn with duration string "15s"', () => {
            const result = compact_1.CompactBuilder.single(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expiresIn('15s')
                .lockTag(lockTag)
                .token(tokenAddress)
                .amount(1000000n)
                .build();
            const now = BigInt(Math.floor(Date.now() / 1000));
            expect(result.struct.expires >= now).toBe(true);
            expect(result.struct.expires <= now + 30n).toBe(true); // Within 30s
        });
        it('should support expiresIn with duration string "5m"', () => {
            const result = compact_1.CompactBuilder.single(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expiresIn('5m')
                .lockTag(lockTag)
                .token(tokenAddress)
                .amount(1000000n)
                .build();
            const now = BigInt(Math.floor(Date.now() / 1000));
            expect(result.struct.expires >= now + 300n - 5n).toBe(true);
            expect(result.struct.expires <= now + 300n + 5n).toBe(true);
        });
        it('should support expiresIn with duration string "2h"', () => {
            const result = compact_1.CompactBuilder.single(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expiresIn('2h')
                .lockTag(lockTag)
                .token(tokenAddress)
                .amount(1000000n)
                .build();
            const now = BigInt(Math.floor(Date.now() / 1000));
            expect(result.struct.expires >= now + 7200n - 5n).toBe(true);
            expect(result.struct.expires <= now + 7200n + 5n).toBe(true);
        });
        it('should support expiresIn with duration string "1d"', () => {
            const result = compact_1.CompactBuilder.single(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expiresIn('1d')
                .lockTag(lockTag)
                .token(tokenAddress)
                .amount(1000000n)
                .build();
            const now = BigInt(Math.floor(Date.now() / 1000));
            expect(result.struct.expires >= now + 86400n - 5n).toBe(true);
            expect(result.struct.expires <= now + 86400n + 5n).toBe(true);
        });
        it('should throw for invalid duration format', () => {
            expect(() => compact_1.CompactBuilder.single(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expiresIn('invalid')
                .lockTag(lockTag)
                .token(tokenAddress)
                .amount(1000000n)
                .build()).toThrow();
        });
        it('should build a compact with witness', () => {
            const mandateType = SimpleMandateType;
            const mandate = {
                fillerAddress: '0x9876543210987654321098765432109876543210',
            };
            const result = compact_1.CompactBuilder.single(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(BigInt(Date.now() + 3600000))
                .lockTag(lockTag)
                .token(tokenAddress)
                .amount(1000000n)
                .witness(mandateType, mandate)
                .build();
            expect(result.mandate).toEqual(mandate);
            expect(result.mandateType).toBe(mandateType);
            expect(result.typedData.types.Mandate).toBeDefined();
            expect(result.typedData.message.mandate).toEqual(mandate);
        });
        it('should generate valid EIP-712 typed data', () => {
            const result = compact_1.CompactBuilder.single(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(BigInt(Date.now() + 3600000))
                .lockTag(lockTag)
                .token(tokenAddress)
                .amount(1000000n)
                .build();
            expect(result.typedData.domain).toEqual(domain);
            expect(result.typedData.types.Compact).toEqual([
                { name: 'arbiter', type: 'address' },
                { name: 'sponsor', type: 'address' },
                { name: 'nonce', type: 'uint256' },
                { name: 'expires', type: 'uint256' },
                { name: 'lockTag', type: 'bytes12' },
                { name: 'token', type: 'address' },
                { name: 'amount', type: 'uint256' },
            ]);
            expect(result.typedData.message).toEqual(result.struct);
        });
        it('should throw if arbiter is missing', () => {
            expect(() => compact_1.CompactBuilder.single(domain)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(BigInt(Date.now() + 3600000))
                .lockTag(lockTag)
                .token(tokenAddress)
                .amount(1000000n)
                .build()).toThrow('arbiter is required');
        });
        it('should throw if sponsor is missing', () => {
            expect(() => compact_1.CompactBuilder.single(domain)
                .arbiter(arbiterAddress)
                .nonce(1n)
                .expires(BigInt(Date.now() + 3600000))
                .lockTag(lockTag)
                .token(tokenAddress)
                .amount(1000000n)
                .build()).toThrow('sponsor is required');
        });
        it('should throw if nonce is missing', () => {
            expect(() => compact_1.CompactBuilder.single(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .expires(BigInt(Date.now() + 3600000))
                .lockTag(lockTag)
                .token(tokenAddress)
                .amount(1000000n)
                .build()).toThrow('nonce is required');
        });
        it('should throw if expires is missing', () => {
            expect(() => compact_1.CompactBuilder.single(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .lockTag(lockTag)
                .token(tokenAddress)
                .amount(1000000n)
                .build()).toThrow('expires is required');
        });
        it('should throw if lockTag is missing', () => {
            expect(() => compact_1.CompactBuilder.single(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(BigInt(Date.now() + 3600000))
                .token(tokenAddress)
                .amount(1000000n)
                .build()).toThrow('lockTag is required');
        });
        it('should throw if token is missing', () => {
            expect(() => compact_1.CompactBuilder.single(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(BigInt(Date.now() + 3600000))
                .lockTag(lockTag)
                .amount(1000000n)
                .build()).toThrow('token is required');
        });
        it('should throw if amount is missing', () => {
            expect(() => compact_1.CompactBuilder.single(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(BigInt(Date.now() + 3600000))
                .lockTag(lockTag)
                .token(tokenAddress)
                .build()).toThrow('amount is required');
        });
    });
    describe('BatchCompactBuilder', () => {
        it('should build a batch compact with multiple commitments', () => {
            const expires = BigInt(Date.now() + 3600000);
            const result = compact_1.CompactBuilder.batch(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(expires)
                .addLock({ lockTag, token: tokenAddress, amount: 1000000n })
                .addLock({ lockTag: '0x000000000000000000000002', token: tokenAddress, amount: 2000000n })
                .build();
            expect(result.struct.arbiter).toBe(arbiterAddress);
            expect(result.struct.sponsor).toBe(sponsorAddress);
            expect(result.struct.nonce).toBe(1n);
            expect(result.struct.expires).toBe(expires);
            expect(result.struct.commitments.length).toBe(2);
            expect(result.struct.commitments[0].lockTag).toBe(lockTag);
            expect(result.struct.commitments[1].amount).toBe(2000000n);
            expect(result.hash).toMatch(/^0x[0-9a-f]{64}$/);
            expect(result.typedData.primaryType).toBe('BatchCompact');
        });
        it('should support addCommitment alias', () => {
            const expires = BigInt(Date.now() + 3600000);
            const result = compact_1.CompactBuilder.batch(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(expires)
                .addCommitment({ lockTag, token: tokenAddress, amount: 1000000n })
                .build();
            expect(result.struct.commitments.length).toBe(1);
        });
        it('should support expiresAt and expiresIn', () => {
            const expires = BigInt(Date.now() + 3600000);
            const result1 = compact_1.CompactBuilder.batch(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expiresAt(expires)
                .addLock({ lockTag, token: tokenAddress, amount: 1000000n })
                .build();
            expect(result1.struct.expires).toBe(expires);
            const result2 = compact_1.CompactBuilder.batch(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expiresIn('10m')
                .addLock({ lockTag, token: tokenAddress, amount: 1000000n })
                .build();
            const now = BigInt(Math.floor(Date.now() / 1000));
            expect(result2.struct.expires >= now + 600n - 5n).toBe(true);
            expect(result2.struct.expires <= now + 600n + 5n).toBe(true);
        });
        it('should build a batch compact with witness', () => {
            const mandateType = SimpleMandateType;
            const mandate = {
                fillerAddress: '0x9876543210987654321098765432109876543210',
            };
            const result = compact_1.CompactBuilder.batch(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(BigInt(Date.now() + 3600000))
                .addLock({ lockTag, token: tokenAddress, amount: 1000000n })
                .witness(mandateType, mandate)
                .build();
            expect(result.mandate).toEqual(mandate);
            expect(result.mandateType).toBe(mandateType);
            expect(result.typedData.types.Mandate).toBeDefined();
            expect(result.typedData.message.mandate).toEqual(mandate);
        });
        it('should generate valid EIP-712 typed data', () => {
            const result = compact_1.CompactBuilder.batch(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(BigInt(Date.now() + 3600000))
                .addLock({ lockTag, token: tokenAddress, amount: 1000000n })
                .build();
            expect(result.typedData.domain).toEqual(domain);
            expect(result.typedData.types.BatchCompact).toEqual([
                { name: 'arbiter', type: 'address' },
                { name: 'sponsor', type: 'address' },
                { name: 'nonce', type: 'uint256' },
                { name: 'expires', type: 'uint256' },
                { name: 'commitments', type: 'Lock[]' },
            ]);
            expect(result.typedData.types.Lock).toEqual([
                { name: 'lockTag', type: 'bytes12' },
                { name: 'token', type: 'address' },
                { name: 'amount', type: 'uint256' },
            ]);
        });
        it('should throw if arbiter is missing', () => {
            expect(() => compact_1.CompactBuilder.batch(domain)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(BigInt(Date.now() + 3600000))
                .addLock({ lockTag, token: tokenAddress, amount: 1000000n })
                .build()).toThrow('arbiter is required');
        });
        it('should throw if sponsor is missing', () => {
            expect(() => compact_1.CompactBuilder.batch(domain)
                .arbiter(arbiterAddress)
                .nonce(1n)
                .expires(BigInt(Date.now() + 3600000))
                .addLock({ lockTag, token: tokenAddress, amount: 1000000n })
                .build()).toThrow('sponsor is required');
        });
        it('should throw if nonce is missing', () => {
            expect(() => compact_1.CompactBuilder.batch(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .expires(BigInt(Date.now() + 3600000))
                .addLock({ lockTag, token: tokenAddress, amount: 1000000n })
                .build()).toThrow('nonce is required');
        });
        it('should throw if expires is missing', () => {
            expect(() => compact_1.CompactBuilder.batch(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .addLock({ lockTag, token: tokenAddress, amount: 1000000n })
                .build()).toThrow('expires is required');
        });
        it('should throw if no commitments are added', () => {
            expect(() => compact_1.CompactBuilder.batch(domain)
                .arbiter(arbiterAddress)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(BigInt(Date.now() + 3600000))
                .build()).toThrow('at least one commitment is required');
        });
    });
    describe('MultichainCompactBuilder', () => {
        it('should build a multichain compact with elements', () => {
            const expires = BigInt(Date.now() + 3600000);
            const mandateType = SimpleMandateType;
            const mandate1 = { fillerAddress: '0x9876543210987654321098765432109876543210' };
            const mandate2 = { fillerAddress: '0xfedcbafedcbafedcbafedcbafedcbafedcbafedd' };
            const result = compact_1.CompactBuilder.multichain(domain)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(expires)
                .addElement()
                .arbiter(arbiterAddress)
                .chainId(1n)
                .addCommitment({ lockTag, token: tokenAddress, amount: 1000000n })
                .witness(mandateType, mandate1)
                .done()
                .addElement()
                .arbiter(arbiterAddress)
                .chainId(137n)
                .addCommitment({ lockTag, token: tokenAddress, amount: 2000000n })
                .witness(mandateType, mandate2)
                .done()
                .build();
            expect(result.struct.sponsor).toBe(sponsorAddress);
            expect(result.struct.nonce).toBe(1n);
            expect(result.struct.expires).toBe(expires);
            expect(result.struct.elements.length).toBe(2);
            expect(result.struct.elements[0].arbiter).toBe(arbiterAddress);
            expect(result.struct.elements[0].chainId).toBe(1n);
            expect(result.struct.elements[1].chainId).toBe(137n);
            expect(result.hash).toMatch(/^0x[0-9a-f]{64}$/);
            expect(result.typedData.primaryType).toBe('MultichainCompact');
        });
        it('should support expiresAt and expiresIn', () => {
            const expires = BigInt(Date.now() + 3600000);
            const mandateType = SimpleMandateType;
            const mandate = { fillerAddress: '0x9876543210987654321098765432109876543210' };
            const result1 = compact_1.CompactBuilder.multichain(domain)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expiresAt(expires)
                .addElement()
                .arbiter(arbiterAddress)
                .chainId(1n)
                .addCommitment({ lockTag, token: tokenAddress, amount: 1000000n })
                .witness(mandateType, mandate)
                .done()
                .build();
            expect(result1.struct.expires).toBe(expires);
            const result2 = compact_1.CompactBuilder.multichain(domain)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expiresIn('30m')
                .addElement()
                .arbiter(arbiterAddress)
                .chainId(1n)
                .addCommitment({ lockTag, token: tokenAddress, amount: 1000000n })
                .witness(mandateType, mandate)
                .done()
                .build();
            const now = BigInt(Math.floor(Date.now() / 1000));
            expect(result2.struct.expires >= now + 1800n - 5n).toBe(true);
            expect(result2.struct.expires <= now + 1800n + 5n).toBe(true);
        });
        it('should generate valid EIP-712 typed data', () => {
            const mandateType = SimpleMandateType;
            const mandate = { fillerAddress: '0x9876543210987654321098765432109876543210' };
            const result = compact_1.CompactBuilder.multichain(domain)
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
            expect(result.typedData.domain).toEqual(domain);
            expect(result.typedData.types.MultichainCompact).toEqual([
                { name: 'sponsor', type: 'address' },
                { name: 'nonce', type: 'uint256' },
                { name: 'expires', type: 'uint256' },
                { name: 'elements', type: 'Element[]' },
            ]);
            expect(result.typedData.types.Element).toEqual([
                { name: 'arbiter', type: 'address' },
                { name: 'chainId', type: 'uint256' },
                { name: 'commitments', type: 'Lock[]' },
                { name: 'mandate', type: 'Mandate' },
            ]);
            expect(result.typedData.types.Lock).toEqual([
                { name: 'lockTag', type: 'bytes12' },
                { name: 'token', type: 'address' },
                { name: 'amount', type: 'uint256' },
            ]);
        });
        it('should throw if sponsor is missing', () => {
            const mandateType = SimpleMandateType;
            const mandate = { fillerAddress: '0x9876543210987654321098765432109876543210' };
            expect(() => compact_1.CompactBuilder.multichain(domain)
                .nonce(1n)
                .expires(BigInt(Date.now() + 3600000))
                .addElement()
                .arbiter(arbiterAddress)
                .chainId(1n)
                .addCommitment({ lockTag, token: tokenAddress, amount: 1000000n })
                .witness(mandateType, mandate)
                .done()
                .build()).toThrow('sponsor is required');
        });
        it('should throw if nonce is missing', () => {
            const mandateType = SimpleMandateType;
            const mandate = { fillerAddress: '0x9876543210987654321098765432109876543210' };
            expect(() => compact_1.CompactBuilder.multichain(domain)
                .sponsor(sponsorAddress)
                .expires(BigInt(Date.now() + 3600000))
                .addElement()
                .arbiter(arbiterAddress)
                .chainId(1n)
                .addCommitment({ lockTag, token: tokenAddress, amount: 1000000n })
                .witness(mandateType, mandate)
                .done()
                .build()).toThrow('nonce is required');
        });
        it('should throw if expires is missing', () => {
            const mandateType = SimpleMandateType;
            const mandate = { fillerAddress: '0x9876543210987654321098765432109876543210' };
            expect(() => compact_1.CompactBuilder.multichain(domain)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .addElement()
                .arbiter(arbiterAddress)
                .chainId(1n)
                .addCommitment({ lockTag, token: tokenAddress, amount: 1000000n })
                .witness(mandateType, mandate)
                .done()
                .build()).toThrow('expires is required');
        });
        it('should throw if no elements are added', () => {
            expect(() => compact_1.CompactBuilder.multichain(domain)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(BigInt(Date.now() + 3600000))
                .build()).toThrow('at least one element is required');
        });
        it('should throw if element is incomplete when calling done()', () => {
            expect(() => compact_1.CompactBuilder.multichain(domain)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(BigInt(Date.now() + 3600000))
                .addElement()
                .arbiter(arbiterAddress)
                .done()).toThrow();
        });
        it('should throw if element arbiter is missing', () => {
            const mandateType = SimpleMandateType;
            const mandate = { fillerAddress: '0x9876543210987654321098765432109876543210' };
            expect(() => compact_1.CompactBuilder.multichain(domain)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(BigInt(Date.now() + 3600000))
                .addElement()
                .chainId(1n)
                .addCommitment({ lockTag, token: tokenAddress, amount: 1000000n })
                .witness(mandateType, mandate)
                .done()
                .build()).toThrow('arbiter is required');
        });
        it('should throw if element chainId is missing', () => {
            const mandateType = SimpleMandateType;
            const mandate = { fillerAddress: '0x9876543210987654321098765432109876543210' };
            expect(() => compact_1.CompactBuilder.multichain(domain)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(BigInt(Date.now() + 3600000))
                .addElement()
                .arbiter(arbiterAddress)
                .addCommitment({ lockTag, token: tokenAddress, amount: 1000000n })
                .witness(mandateType, mandate)
                .done()
                .build()).toThrow('chainId is required');
        });
        it('should throw if element has no commitments', () => {
            const mandateType = SimpleMandateType;
            const mandate = { fillerAddress: '0x9876543210987654321098765432109876543210' };
            expect(() => compact_1.CompactBuilder.multichain(domain)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(BigInt(Date.now() + 3600000))
                .addElement()
                .arbiter(arbiterAddress)
                .chainId(1n)
                .witness(mandateType, mandate)
                .done()
                .build()).toThrow('at least one commitment is required');
        });
        it('should throw if element has no witness', () => {
            expect(() => compact_1.CompactBuilder.multichain(domain)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expires(BigInt(Date.now() + 3600000))
                .addElement()
                .arbiter(arbiterAddress)
                .chainId(1n)
                .addCommitment({ lockTag, token: tokenAddress, amount: 1000000n })
                .done()
                .build()).toThrow('witness is required for multichain elements');
        });
    });
    describe('complex compact examples', () => {
        it('should build a multichain swap with multiple chains', () => {
            const expires = BigInt(Date.now() + 3600000);
            const mandateType = SimpleMandateType;
            const mandate1 = { fillerAddress: '0x9876543210987654321098765432109876543210' };
            const mandate2 = { fillerAddress: '0xfedcbafedcbafedcbafedcbafedcbafedcbafedd' };
            const result = compact_1.CompactBuilder.multichain(domain)
                .sponsor(sponsorAddress)
                .nonce(1n)
                .expiresIn('1h')
                .addElement()
                .arbiter(arbiterAddress)
                .chainId(1n) // Mainnet
                .addCommitment({ lockTag, token: tokenAddress, amount: 1000000n })
                .witness(mandateType, mandate1)
                .done()
                .addElement()
                .arbiter(arbiterAddress)
                .chainId(137n) // Polygon
                .addCommitment({ lockTag, token: tokenAddress, amount: 2000000n })
                .addCommitment({
                lockTag: '0x000000000000000000000002',
                token: tokenAddress,
                amount: 3000000n,
            })
                .witness(mandateType, mandate2)
                .done()
                .build();
            expect(result.struct.elements.length).toBe(2);
            expect(result.struct.elements[0].chainId).toBe(1n);
            expect(result.struct.elements[0].commitments.length).toBe(1);
            expect(result.struct.elements[1].chainId).toBe(137n);
            expect(result.struct.elements[1].commitments.length).toBe(2);
        });
    });
});
//# sourceMappingURL=compact.test.js.map