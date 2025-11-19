"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const claimants_1 = require("./claimants");
describe('claimants encoding', () => {
    const lockTag = '0x000000000000000000000001';
    const recipient = '0x1234567890123456789012345678901234567890';
    describe('buildComponent', () => {
        it('should build a transfer component', () => {
            const component = (0, claimants_1.buildComponent)(lockTag, (0, claimants_1.transfer)(recipient, 100n));
            expect(component.amount).toBe(100n);
            expect(component.claimant > 0n).toBe(true);
        });
        it('should build a convert component', () => {
            const targetLockTag = '0x000000000000000000000002';
            const component = (0, claimants_1.buildComponent)(lockTag, (0, claimants_1.convert)(recipient, 200n, targetLockTag));
            expect(component.amount).toBe(200n);
            expect(component.claimant > 0n).toBe(true);
        });
        it('should build a withdraw component', () => {
            const component = (0, claimants_1.buildComponent)(lockTag, (0, claimants_1.withdraw)(recipient, 300n));
            expect(component.amount).toBe(300n);
            expect(component.claimant > 0n).toBe(true);
        });
    });
    describe('decodeComponent', () => {
        it('should decode a transfer component', () => {
            const component = (0, claimants_1.buildComponent)(lockTag, (0, claimants_1.transfer)(recipient, 100n));
            const decoded = (0, claimants_1.decodeComponent)(component, lockTag);
            expect(decoded.kind).toBe('transfer');
            expect(decoded.recipient.toLowerCase()).toBe(recipient.toLowerCase());
            expect(decoded.amount).toBe(100n);
        });
        it('should decode a withdraw component', () => {
            const component = (0, claimants_1.buildComponent)(lockTag, (0, claimants_1.withdraw)(recipient, 300n));
            const decoded = (0, claimants_1.decodeComponent)(component);
            expect(decoded.kind).toBe('withdraw');
            expect(decoded.recipient.toLowerCase()).toBe(recipient.toLowerCase());
            expect(decoded.amount).toBe(300n);
        });
        it('should decode a convert component', () => {
            const targetLockTag = '0x000000000000000000000002';
            const component = (0, claimants_1.buildComponent)(lockTag, (0, claimants_1.convert)(recipient, 200n, targetLockTag));
            const decoded = (0, claimants_1.decodeComponent)(component, lockTag);
            expect(decoded.kind).toBe('convert');
            expect(decoded.recipient.toLowerCase()).toBe(recipient.toLowerCase());
            expect(decoded.amount).toBe(200n);
            expect(decoded.lockTag?.toLowerCase()).toBe(targetLockTag.toLowerCase());
        });
    });
});
//# sourceMappingURL=claimants.test.js.map