"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chains_1 = require("./chains");
describe('chains config', () => {
    describe('defaultDeployments', () => {
        it('should include Ethereum mainnet', () => {
            const mainnet = chains_1.defaultDeployments.find((d) => d.chainId === 1);
            expect(mainnet).toBeDefined();
            expect(mainnet?.address).toBe('0x00000000000000171ede64904551eeDF3C6C9788');
        });
        it('should include Base', () => {
            const base = chains_1.defaultDeployments.find((d) => d.chainId === 8453);
            expect(base).toBeDefined();
            expect(base?.address).toBe('0x00000000000000171ede64904551eeDF3C6C9788');
        });
        it('should include Unichain', () => {
            const unichain = chains_1.defaultDeployments.find((d) => d.chainId === 130);
            expect(unichain).toBeDefined();
            expect(unichain?.address).toBe('0x00000000000000171ede64904551eeDF3C6C9788');
        });
    });
    describe('getDefaultAddress', () => {
        it('should return address for supported chains', () => {
            expect((0, chains_1.getDefaultAddress)(1)).toBe('0x00000000000000171ede64904551eeDF3C6C9788');
            expect((0, chains_1.getDefaultAddress)(8453)).toBe('0x00000000000000171ede64904551eeDF3C6C9788');
        });
        it('should return undefined for unsupported chains', () => {
            expect((0, chains_1.getDefaultAddress)(999)).toBeUndefined();
        });
    });
    describe('hasDefaultDeployment', () => {
        it('should return true for supported chains', () => {
            expect((0, chains_1.hasDefaultDeployment)(1)).toBe(true);
            expect((0, chains_1.hasDefaultDeployment)(8453)).toBe(true);
        });
        it('should return false for unsupported chains', () => {
            expect((0, chains_1.hasDefaultDeployment)(999)).toBe(false);
        });
    });
});
//# sourceMappingURL=chains.test.js.map