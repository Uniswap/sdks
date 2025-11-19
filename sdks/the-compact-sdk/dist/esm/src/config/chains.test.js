import { defaultDeployments, getDefaultAddress, hasDefaultDeployment } from './chains';
describe('chains config', () => {
    describe('defaultDeployments', () => {
        it('should include Ethereum mainnet', () => {
            const mainnet = defaultDeployments.find((d) => d.chainId === 1);
            expect(mainnet).toBeDefined();
            expect(mainnet?.address).toBe('0x00000000000000171ede64904551eeDF3C6C9788');
        });
        it('should include Base', () => {
            const base = defaultDeployments.find((d) => d.chainId === 8453);
            expect(base).toBeDefined();
            expect(base?.address).toBe('0x00000000000000171ede64904551eeDF3C6C9788');
        });
        it('should include Unichain', () => {
            const unichain = defaultDeployments.find((d) => d.chainId === 130);
            expect(unichain).toBeDefined();
            expect(unichain?.address).toBe('0x00000000000000171ede64904551eeDF3C6C9788');
        });
    });
    describe('getDefaultAddress', () => {
        it('should return address for supported chains', () => {
            expect(getDefaultAddress(1)).toBe('0x00000000000000171ede64904551eeDF3C6C9788');
            expect(getDefaultAddress(8453)).toBe('0x00000000000000171ede64904551eeDF3C6C9788');
        });
        it('should return undefined for unsupported chains', () => {
            expect(getDefaultAddress(999)).toBeUndefined();
        });
    });
    describe('hasDefaultDeployment', () => {
        it('should return true for supported chains', () => {
            expect(hasDefaultDeployment(1)).toBe(true);
            expect(hasDefaultDeployment(8453)).toBe(true);
        });
        it('should return false for unsupported chains', () => {
            expect(hasDefaultDeployment(999)).toBe(false);
        });
    });
});
//# sourceMappingURL=chains.test.js.map