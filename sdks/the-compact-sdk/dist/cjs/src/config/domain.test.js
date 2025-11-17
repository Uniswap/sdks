"use strict";
/**
 * Tests for EIP-712 domain configuration
 */
Object.defineProperty(exports, "__esModule", { value: true });
const domain_1 = require("./domain");
describe('createDomain', () => {
    it('should create a valid domain object', () => {
        const domain = (0, domain_1.createDomain)({
            chainId: 1,
            contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
        });
        expect(domain).toEqual({
            name: 'The Compact',
            version: '1',
            chainId: 1,
            verifyingContract: '0x00000000000000171ede64904551eeDF3C6C9788',
        });
    });
    it('should create domains with different chain IDs', () => {
        const domain1 = (0, domain_1.createDomain)({
            chainId: 1,
            contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
        });
        const domain2 = (0, domain_1.createDomain)({
            chainId: 137,
            contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
        });
        expect(domain1.chainId).toBe(1);
        expect(domain2.chainId).toBe(137);
    });
    it('should create domains with different contract addresses', () => {
        const domain1 = (0, domain_1.createDomain)({
            chainId: 1,
            contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
        });
        const domain2 = (0, domain_1.createDomain)({
            chainId: 1,
            contractAddress: '0x1111111111111111111111111111111111111111',
        });
        expect(domain1.verifyingContract).toBe('0x00000000000000171ede64904551eeDF3C6C9788');
        expect(domain2.verifyingContract).toBe('0x1111111111111111111111111111111111111111');
    });
});
describe('getDomainSeparator', () => {
    it('should produce the correct hash for mainnet', () => {
        const domain = (0, domain_1.createDomain)({
            chainId: 1,
            contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
        });
        const separator = (0, domain_1.getDomainSeparator)(domain);
        expect(separator).toBe('0x4ac11bdf0eb5972bae47825af851d20c342d88f466669ec58827be03650df019');
    });
    it('should produce the correct hash for base', () => {
        const domain = (0, domain_1.createDomain)({
            chainId: 8453,
            contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
        });
        const separator = (0, domain_1.getDomainSeparator)(domain);
        expect(separator).toBe('0xf789cd452b2f29c8246379d5e071e2ac39d194045691ef1f9dddfa1f276d905a');
    });
    it('should produce different hashes for different chain IDs', () => {
        const domain1 = (0, domain_1.createDomain)({
            chainId: 1,
            contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
        });
        const domain2 = (0, domain_1.createDomain)({
            chainId: 137,
            contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
        });
        const separator1 = (0, domain_1.getDomainSeparator)(domain1);
        const separator2 = (0, domain_1.getDomainSeparator)(domain2);
        expect(separator1).not.toBe(separator2);
    });
    it('should produce different hashes for different contract addresses', () => {
        const domain1 = (0, domain_1.createDomain)({
            chainId: 1,
            contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
        });
        const domain2 = (0, domain_1.createDomain)({
            chainId: 1,
            contractAddress: '0x1111111111111111111111111111111111111111',
        });
        const separator1 = (0, domain_1.getDomainSeparator)(domain1);
        const separator2 = (0, domain_1.getDomainSeparator)(domain2);
        expect(separator1).not.toBe(separator2);
    });
    it('should produce the same hash for the same domain', () => {
        const domain = (0, domain_1.createDomain)({
            chainId: 1,
            contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
        });
        const separator1 = (0, domain_1.getDomainSeparator)(domain);
        const separator2 = (0, domain_1.getDomainSeparator)(domain);
        expect(separator1).toBe(separator2);
    });
    it('should follow EIP-712 domain separator specification', () => {
        const domain = (0, domain_1.createDomain)({
            chainId: 42161, // Arbitrum
            contractAddress: '0x00000000000000171ede64904551eeDF3C6C9788',
        });
        const separator = (0, domain_1.getDomainSeparator)(domain);
        // The separator should be deterministic and unique per domain
        expect(separator).toBe('0xab8806a0244da8971031f23596e36722df1c75f6fd1b3715f84fa3d2904cc77b');
        expect(typeof separator).toBe('string');
        expect(separator.startsWith('0x')).toBe(true);
        expect(separator.length).toBe(66); // '0x' + 64 hex chars
    });
});
//# sourceMappingURL=domain.test.js.map