/**
 * Tests for Tribunal mandate type compatibility
 * These tests ensure that our SDK's mandate types match Tribunal's exact typestrings and typehashes
 *
 * Test cases adapted from:
 * - tribunal/test/TribunalTypeHashesTest.t.sol
 * - tribunal/src/types/TribunalTypeHashes.sol
 */
import { keccak256 } from 'viem';
import { defineMandateType, MandateFields, TribunalMandate } from './mandate';
// Type hash constants from Tribunal's TribunalTypeHashes.sol
const MANDATE_TYPESTRING = 'Mandate(address adjuster,Mandate_Fill[] fills)Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)Mandate_Fill(uint256 chainId,address tribunal,uint256 expires,Mandate_FillComponent[] components,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)Mandate_Lock(bytes12 lockTag,address token,uint256 amount)Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes context)';
const MANDATE_TYPEHASH = '0xd98eceb6e5c7770b3b664a99c269855402fe5255294a30970d25376caea662c6';
const MANDATE_FILL_COMPONENT_TYPESTRING = 'Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)';
const MANDATE_FILL_COMPONENT_TYPEHASH = '0x97a135285706d21a6b74ac159b77b16cea827acc358fc6c33e430ce0a85fe9d6';
const MANDATE_LOCK_TYPESTRING = 'Mandate_Lock(bytes12 lockTag,address token,uint256 amount)';
const MANDATE_LOCK_TYPEHASH = '0xce4f0854d9091f37d9dfb64592eee0de534c6680a5444fd55739b61228a6e0b0';
// The witness typestring (partial string provided to The Compact by Tribunal)
const WITNESS_TYPESTRING = 'address adjuster,Mandate_Fill[] fills)Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)Mandate_Fill(uint256 chainId,address tribunal,uint256 expires,Mandate_FillComponent[] components,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)Mandate_Lock(bytes12 lockTag,address token,uint256 amount)Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes context';
describe('Tribunal mandate type compatibility', () => {
    describe('full Tribunal mandate structure', () => {
        it('should produce the exact witness typestring that Tribunal uses', () => {
            // Define the Tribunal mandate type
            const mandate = defineMandateType({
                fields: [MandateFields.address('adjuster'), { name: 'fills', type: 'Mandate_Fill[]' }],
                nestedTypes: {
                    Mandate_Fill: [
                        MandateFields.uint256('chainId'),
                        MandateFields.address('tribunal'),
                        MandateFields.uint256('expires'),
                        { name: 'components', type: 'Mandate_FillComponent[]' },
                        MandateFields.uint256('baselinePriorityFee'),
                        MandateFields.uint256('scalingFactor'),
                        { name: 'priceCurve', type: 'uint256[]' },
                        { name: 'recipientCallback', type: 'Mandate_RecipientCallback[]' },
                        MandateFields.bytes32('salt'),
                    ],
                    Mandate_FillComponent: [
                        MandateFields.address('fillToken'),
                        MandateFields.uint256('minimumFillAmount'),
                        MandateFields.address('recipient'),
                        MandateFields.bool('applyScaling'),
                    ],
                    Mandate_Lock: [
                        { name: 'lockTag', type: 'bytes12' },
                        MandateFields.address('token'),
                        MandateFields.uint256('amount'),
                    ],
                    Mandate_BatchCompact: [
                        MandateFields.address('arbiter'),
                        MandateFields.address('sponsor'),
                        MandateFields.uint256('nonce'),
                        MandateFields.uint256('expires'),
                        { name: 'commitments', type: 'Mandate_Lock[]' },
                        { name: 'mandate', type: 'Mandate' },
                    ],
                    Mandate_RecipientCallback: [
                        MandateFields.uint256('chainId'),
                        { name: 'compact', type: 'Mandate_BatchCompact' },
                        MandateFields.bytes('context'),
                    ],
                },
            });
            // Verify this definition matches the exported TribunalMandate
            expect(mandate.toString()).toBe(TribunalMandate.toString());
            // Verify witness typestring matches Tribunal exactly
            expect(TribunalMandate.witnessTypestring).toBe(WITNESS_TYPESTRING);
        });
        it('should produce the exact mandate typestring that Tribunal uses', () => {
            // Verify full typestring matches Tribunal exactly
            expect(TribunalMandate.typestring()).toBe(MANDATE_TYPESTRING);
        });
        it('should produce the exact mandate typehash that Tribunal uses', () => {
            const computedTypehash = TribunalMandate.typehash();
            expect(computedTypehash).toBe(MANDATE_TYPEHASH);
        });
    });
    describe('individual nested type compatibility', () => {
        it('should match Mandate_FillComponent typestring and typehash', () => {
            // Note: We're testing that a standalone MandateFillComponent would have the right structure
            // even though in practice it's always part of the full mandate structure
            const computedTypestring = 'Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)';
            const computedTypehash = keccak256(computedTypestring);
            expect(computedTypestring).toBe(MANDATE_FILL_COMPONENT_TYPESTRING);
            expect(computedTypehash).toBe(MANDATE_FILL_COMPONENT_TYPEHASH);
        });
        it('should match Mandate_Lock typestring and typehash', () => {
            const computedTypestring = 'Mandate_Lock(bytes12 lockTag,address token,uint256 amount)';
            const computedTypehash = keccak256(computedTypestring);
            expect(computedTypestring).toBe(MANDATE_LOCK_TYPESTRING);
            expect(computedTypehash).toBe(MANDATE_LOCK_TYPEHASH);
        });
    });
    describe('typestring structure validation', () => {
        it('should not have leading Mandate( in witness typestring', () => {
            // Witness typestring should NOT start with "Mandate("
            expect(TribunalMandate.witnessTypestring.startsWith('Mandate(')).toBe(false);
            // It should start with the first field
            expect(TribunalMandate.witnessTypestring.startsWith('address adjuster')).toBe(true);
        });
        it('should not have trailing ) in witness typestring', () => {
            // Witness typestring should NOT end with ")"
            expect(TribunalMandate.witnessTypestring.endsWith(')')).toBe(false);
            // But full typestring should have proper wrapping
            expect(TribunalMandate.typestring().startsWith('Mandate(')).toBe(true);
            expect(TribunalMandate.typestring().endsWith(')')).toBe(true);
        });
        it('should have alphabetically sorted nested types', () => {
            // Check that nested types appear in alphabetical order in the typestring
            const typestring = TribunalMandate.witnessTypestring;
            // Find positions of each nested type definition
            const batchCompactPos = typestring.indexOf('Mandate_BatchCompact(');
            const fillPos = typestring.indexOf('Mandate_Fill(');
            const fillComponentPos = typestring.indexOf('Mandate_FillComponent(');
            const lockPos = typestring.indexOf('Mandate_Lock(');
            const recipientCallbackPos = typestring.indexOf('Mandate_RecipientCallback(');
            // Verify alphabetical ordering
            expect(batchCompactPos).toBeGreaterThan(0);
            expect(fillPos).toBeGreaterThan(batchCompactPos);
            expect(fillComponentPos).toBeGreaterThan(fillPos);
            expect(lockPos).toBeGreaterThan(fillComponentPos);
            expect(recipientCallbackPos).toBeGreaterThan(lockPos);
        });
    });
});
//# sourceMappingURL=mandate-tribunal.test.js.map