"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const viem_1 = require("viem");
const mandate_1 = require("./mandate");
describe('mandate', () => {
    describe('defineMandateType', () => {
        it('should define a custom mandate type', () => {
            const Mandate = (0, mandate_1.defineMandateType)({
                fields: [mandate_1.MandateFields.bytes32('orderId'), mandate_1.MandateFields.uint256('minFill'), mandate_1.MandateFields.bool('bossMode')],
            });
            expect(Mandate.name).toBe('Mandate');
            expect(Mandate.fields).toContainEqual(mandate_1.MandateFields.bytes32('orderId'));
            expect(Mandate.fields).toContainEqual(mandate_1.MandateFields.uint256('minFill'));
            expect(Mandate.fields).toContainEqual(mandate_1.MandateFields.bool('bossMode'));
            expect(Mandate.witnessTypestring).toBe('bytes32 orderId,uint256 minFill,bool bossMode');
        });
        it('should encode and hash mandate values', () => {
            const Mandate = (0, mandate_1.simpleMandate)([mandate_1.MandateFields.bytes32('orderId'), mandate_1.MandateFields.uint256('minFill')]);
            const orderId = '0x0000000000000000000000000000000000000000000000000000000987654321';
            const minFill = 1000n;
            const hash = Mandate.hash({ orderId, minFill });
            expect(hash).toEqual((0, viem_1.keccak256)((0, viem_1.concat)([orderId, (0, viem_1.encodeAbiParameters)([{ name: 'minFill', type: 'uint256' }], [minFill])])));
        });
        it('should throw for nested types not starting with Mandate', () => {
            expect(() => (0, mandate_1.defineMandateType)({
                fields: [mandate_1.MandateFields.bytes32('data')],
                nestedTypes: {
                    Schmandate: [mandate_1.MandateFields.uint256('value')],
                },
            })).toThrow();
        });
    });
    describe('nested mandate types', () => {
        it('should handle simple nested structure', () => {
            // Simple nested mandate:
            // Mandate(uint256 amount,Mandate_Info data)Mandate_Info(address token,uint256 value)
            const Mandate = (0, mandate_1.defineMandateType)({
                fields: [mandate_1.MandateFields.uint256('amount'), { name: 'data', type: 'Mandate_Info' }],
                nestedTypes: {
                    Mandate_Info: [mandate_1.MandateFields.address('token'), mandate_1.MandateFields.uint256('value')],
                },
            });
            expect(Mandate.witnessTypestring).toBe('uint256 amount,Mandate_Info data)Mandate_Info(address token,uint256 value');
        });
        it('should handle arrays in nested structures', () => {
            // Mandate with array of nested type:
            // Mandate(address owner,Mandate_Item[] items)Mandate_Item(uint256 id,uint256 quantity)
            const Mandate = (0, mandate_1.defineMandateType)({
                fields: [mandate_1.MandateFields.address('owner'), { name: 'items', type: 'Mandate_Item[]' }],
                nestedTypes: {
                    Mandate_Item: [mandate_1.MandateFields.uint256('id'), mandate_1.MandateFields.uint256('quantity')],
                },
            });
            expect(Mandate.witnessTypestring).toBe('address owner,Mandate_Item[] items)Mandate_Item(uint256 id,uint256 quantity');
        });
        it('should handle multiple nested types in alphabetical order', () => {
            // Multiple nested types:
            // Mandate(address owner,Mandate_Token tokenData)
            // Mandate_Token(address token,Mandate_Amount amount)
            // Mandate_Amount(uint256 value,uint256 decimals)
            const Mandate = (0, mandate_1.defineMandateType)({
                fields: [mandate_1.MandateFields.address('owner'), { name: 'tokenData', type: 'Mandate_Token' }],
                nestedTypes: {
                    Mandate_Token: [mandate_1.MandateFields.address('token'), { name: 'amount', type: 'Mandate_Amount' }],
                    Mandate_Amount: [mandate_1.MandateFields.uint256('value'), mandate_1.MandateFields.uint256('decimals')],
                },
            });
            expect(Mandate.witnessTypestring).toBe('address owner,Mandate_Token tokenData)Mandate_Amount(uint256 value,uint256 decimals)Mandate_Token(address token,Mandate_Amount amount');
        });
        it('should handle deeply nested structure with recursive references', () => {
            // Mandate with recursive nested types:
            // Mandate(address owner,Mandate_Data data)
            // Mandate_Compact(address sponsor,uint256 nonce,Mandate mandate)
            // Mandate_Data(uint256 value,Mandate_Compact[] compacts)
            const Mandate = (0, mandate_1.defineMandateType)({
                fields: [mandate_1.MandateFields.address('owner'), { name: 'data', type: 'Mandate_Data' }],
                nestedTypes: {
                    Mandate_Data: [mandate_1.MandateFields.uint256('value'), { name: 'compacts', type: 'Mandate_Compact[]' }],
                    Mandate_Compact: [
                        mandate_1.MandateFields.address('sponsor'),
                        mandate_1.MandateFields.uint256('nonce'),
                        { name: 'mandate', type: 'Mandate' },
                    ],
                },
            });
            expect(Mandate.witnessTypestring).toBe('address owner,Mandate_Data data)Mandate_Compact(address sponsor,uint256 nonce,Mandate mandate)Mandate_Data(uint256 value,Mandate_Compact[] compacts');
        });
        it('should handle full Tribunal mandate types', () => {
            // Full Tribunal mandate structure:
            // Mandate(address adjuster,Mandate_Fill[] fills)
            // Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)
            // Mandate_Fill(uint256 chainId,address tribunal,uint256 expires,Mandate_FillComponent[] components,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)
            // Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)
            // Mandate_Lock(bytes12 lockTag,address token,uint256 amount)
            // Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes context)
            const Mandate = (0, mandate_1.defineMandateType)({
                fields: [mandate_1.MandateFields.address('adjuster'), { name: 'fills', type: 'Mandate_Fill[]' }],
                nestedTypes: {
                    Mandate_Fill: [
                        mandate_1.MandateFields.uint256('chainId'),
                        mandate_1.MandateFields.address('tribunal'),
                        mandate_1.MandateFields.uint256('expires'),
                        { name: 'components', type: 'Mandate_FillComponent[]' },
                        mandate_1.MandateFields.uint256('baselinePriorityFee'),
                        mandate_1.MandateFields.bytes32('salt'),
                    ],
                    Mandate_FillComponent: [
                        mandate_1.MandateFields.address('fillToken'),
                        mandate_1.MandateFields.uint256('minimumFillAmount'),
                        mandate_1.MandateFields.address('recipient'),
                        mandate_1.MandateFields.bool('applyScaling'),
                    ],
                    Mandate_Lock: [
                        { name: 'lockTag', type: 'bytes12' },
                        mandate_1.MandateFields.address('token'),
                        mandate_1.MandateFields.uint256('amount'),
                    ],
                    Mandate_BatchCompact: [
                        mandate_1.MandateFields.address('arbiter'),
                        mandate_1.MandateFields.address('sponsor'),
                        mandate_1.MandateFields.uint256('nonce'),
                        mandate_1.MandateFields.uint256('expires'),
                        { name: 'commitments', type: 'Mandate_Lock[]' },
                        { name: 'mandate', type: 'Mandate' },
                    ],
                    Mandate_RecipientCallback: [
                        mandate_1.MandateFields.uint256('chainId'),
                        { name: 'compact', type: 'Mandate_BatchCompact' },
                        mandate_1.MandateFields.bytes('context'),
                    ],
                },
            });
            // Verify the typestring fragment is generated correctly:
            // - all types are sorted alphabetically (per EIP-712 spec)
            // - no leading `Mandate(` or trailing `)` (The Compact injects this typestring fragment into the `Mandate(...)` wrapper)
            const expectedTypestring = 'address adjuster,Mandate_Fill[] fills)' +
                'Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)' +
                'Mandate_Fill(uint256 chainId,address tribunal,uint256 expires,Mandate_FillComponent[] components,uint256 baselinePriorityFee,bytes32 salt)' +
                'Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)' +
                'Mandate_Lock(bytes12 lockTag,address token,uint256 amount)' +
                'Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes context';
            expect(Mandate.witnessTypestring).toBe(expectedTypestring);
        });
        it('should generate correct typestring for complex nested structures', () => {
            // Test typestring generation with nested structure
            // Mandates with nested types are primarily for witness typestring generation
            // The encode() method only works with primitive field types
            const Mandate = (0, mandate_1.defineMandateType)({
                fields: [mandate_1.MandateFields.address('owner'), { name: 'data', type: 'Mandate_Data' }],
                nestedTypes: {
                    Mandate_Data: [mandate_1.MandateFields.address('token'), mandate_1.MandateFields.uint256('amount')],
                },
            });
            // Should generate the correct witness typestring
            expect(Mandate.witnessTypestring).toBe('address owner,Mandate_Data data)Mandate_Data(address token,uint256 amount');
            // Verify fields are accessible
            expect(Mandate.fields).toHaveLength(2);
            expect(Mandate.fields[0]).toEqual({ name: 'owner', type: 'address' });
            expect(Mandate.fields[1]).toEqual({ name: 'data', type: 'Mandate_Data' });
            expect(Mandate.nestedTypes).toHaveProperty('Mandate_Data');
        });
        it('should handle bytes types in nested structures', () => {
            // Test with bytes (dynamic) vs bytes32 (fixed)
            const Mandate = (0, mandate_1.defineMandateType)({
                fields: [mandate_1.MandateFields.address('signer'), { name: 'callback', type: 'Mandate_Callback' }],
                nestedTypes: {
                    Mandate_Callback: [mandate_1.MandateFields.uint256('chainId'), mandate_1.MandateFields.bytes('context')],
                },
            });
            expect(Mandate.witnessTypestring).toBe('address signer,Mandate_Callback callback)Mandate_Callback(uint256 chainId,bytes context');
        });
        it('should match Tribunal witness typestring exactly', () => {
            // This validates our SDK can generate the exact typestring that Tribunal uses
            // Source: https://github.com/Uniswap/tribunal/blob/main/src/types/TribunalTypeHashes.sol#L138-139
            const Mandate = (0, mandate_1.defineMandateType)({
                fields: [mandate_1.MandateFields.address('adjuster'), { name: 'fills', type: 'Mandate_Fill[]' }],
                nestedTypes: {
                    Mandate_Fill: [
                        mandate_1.MandateFields.uint256('chainId'),
                        mandate_1.MandateFields.address('tribunal'),
                        mandate_1.MandateFields.uint256('expires'),
                        { name: 'components', type: 'Mandate_FillComponent[]' },
                        mandate_1.MandateFields.uint256('baselinePriorityFee'),
                        mandate_1.MandateFields.uint256('scalingFactor'),
                        { name: 'priceCurve', type: 'uint256[]' },
                        { name: 'recipientCallback', type: 'Mandate_RecipientCallback[]' },
                        mandate_1.MandateFields.bytes32('salt'),
                    ],
                    Mandate_FillComponent: [
                        mandate_1.MandateFields.address('fillToken'),
                        mandate_1.MandateFields.uint256('minimumFillAmount'),
                        mandate_1.MandateFields.address('recipient'),
                        mandate_1.MandateFields.bool('applyScaling'),
                    ],
                    Mandate_Lock: [
                        { name: 'lockTag', type: 'bytes12' },
                        mandate_1.MandateFields.address('token'),
                        mandate_1.MandateFields.uint256('amount'),
                    ],
                    Mandate_BatchCompact: [
                        mandate_1.MandateFields.address('arbiter'),
                        mandate_1.MandateFields.address('sponsor'),
                        mandate_1.MandateFields.uint256('nonce'),
                        mandate_1.MandateFields.uint256('expires'),
                        { name: 'commitments', type: 'Mandate_Lock[]' },
                        { name: 'mandate', type: 'Mandate' },
                    ],
                    Mandate_RecipientCallback: [
                        mandate_1.MandateFields.uint256('chainId'),
                        { name: 'compact', type: 'Mandate_BatchCompact' },
                        mandate_1.MandateFields.bytes('context'),
                    ],
                },
            });
            const expectedTypestring = 'address adjuster,Mandate_Fill[] fills)' +
                'Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)' +
                'Mandate_Fill(uint256 chainId,address tribunal,uint256 expires,Mandate_FillComponent[] components,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)' +
                'Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)' +
                'Mandate_Lock(bytes12 lockTag,address token,uint256 amount)' +
                'Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes context';
            expect(Mandate.witnessTypestring).toBe(expectedTypestring);
        });
    });
    describe('hash computation', () => {
        it('should compute consistent hashes for simple mandates', () => {
            const Mandate = (0, mandate_1.simpleMandate)([mandate_1.MandateFields.uint256('witnessArgument')]);
            const witnessArgument = 123456789n;
            const hash1 = Mandate.hash({ witnessArgument });
            const hash2 = Mandate.hash({ witnessArgument });
            // Hashes should be deterministic
            expect(hash1).toEqual(hash2);
            expect(hash1.startsWith('0x')).toBe(true);
            expect(hash1.length).toBe(66); // bytes32
        });
        it('should compute different hashes for different values', () => {
            const Mandate = (0, mandate_1.simpleMandate)([mandate_1.MandateFields.uint256('witnessArgument')]);
            const hash1 = Mandate.hash({ witnessArgument: 123n });
            const hash2 = Mandate.hash({ witnessArgument: 456n });
            expect(hash1).not.toEqual(hash2);
        });
        it('should encode and hash the simple Compact witness type', () => {
            // This matches The Compact's basic witness: Mandate(uint256 witnessArgument)
            const Mandate = (0, mandate_1.simpleMandate)([mandate_1.MandateFields.uint256('witnessArgument')]);
            const witnessValue = { witnessArgument: 987654321n };
            const encoded = Mandate.encode(witnessValue);
            const hash = Mandate.hash(witnessValue);
            expect(encoded).toBeDefined();
            expect(hash).toBeDefined();
            expect(hash).toEqual((0, viem_1.keccak256)(encoded));
        });
        it('should encode complex nested structures with arrays', () => {
            const Mandate = (0, mandate_1.defineMandateType)({
                fields: [mandate_1.MandateFields.address('owner'), { name: 'items', type: 'Mandate_Item[]' }],
                nestedTypes: {
                    Mandate_Item: [mandate_1.MandateFields.uint256('id'), mandate_1.MandateFields.uint256('amount')],
                },
            });
            const witnessValue = {
                owner: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
                items: [
                    { id: 1n, amount: 100n },
                    { id: 2n, amount: 200n },
                ],
            };
            const encoded = Mandate.encode(witnessValue);
            const hash = Mandate.hash(witnessValue);
            // Manually compute expected encoding to validate EIP-712 compliance
            // Per EIP-712: hashStruct(s) = keccak256(typeHash || encodeData(s))
            const itemTypestring = 'Mandate_Item(uint256 id,uint256 amount)';
            const itemTypehash = (0, viem_1.keccak256)(itemTypestring);
            // Encode first item: abi.encode(1, 100)
            const item1Encoded = (0, viem_1.encodeAbiParameters)([
                { name: 'id', type: 'uint256' },
                { name: 'amount', type: 'uint256' },
            ], [1n, 100n]);
            const item1Hash = (0, viem_1.keccak256)((0, viem_1.concat)([itemTypehash, item1Encoded]));
            // Encode second item: abi.encode(2, 200)
            const item2Encoded = (0, viem_1.encodeAbiParameters)([
                { name: 'id', type: 'uint256' },
                { name: 'amount', type: 'uint256' },
            ], [2n, 200n]);
            const item2Hash = (0, viem_1.keccak256)((0, viem_1.concat)([itemTypehash, item2Encoded]));
            // Array of structs: keccak256(hash1 || hash2)
            const arrayHash = (0, viem_1.keccak256)((0, viem_1.concat)([item1Hash, item2Hash]));
            // Final encoding: owner || arrayHash
            const expectedEncoded = (0, viem_1.concat)([
                (0, viem_1.encodeAbiParameters)([{ name: 'owner', type: 'address' }], [witnessValue.owner]),
                arrayHash,
            ]);
            expect(encoded).toEqual(expectedEncoded);
            expect(hash).toEqual((0, viem_1.keccak256)(encoded));
        });
        it('should handle deeply nested structures with multiple levels', () => {
            // Test with recursive nested types
            const Mandate = (0, mandate_1.defineMandateType)({
                fields: [mandate_1.MandateFields.address('signer'), { name: 'data', type: 'Mandate_Data' }],
                nestedTypes: {
                    Mandate_Data: [mandate_1.MandateFields.uint256('value'), { name: 'meta', type: 'Mandate_Meta' }],
                    Mandate_Meta: [mandate_1.MandateFields.address('token'), mandate_1.MandateFields.uint256('amount')],
                },
            });
            const witnessValue = {
                signer: '0x1111111111111111111111111111111111111111',
                data: {
                    value: 999n,
                    meta: {
                        token: '0x2222222222222222222222222222222222222222',
                        amount: 888n,
                    },
                },
            };
            const encoded = Mandate.encode(witnessValue);
            const hash = Mandate.hash(witnessValue);
            // Manually compute expected encoding to validate EIP-712 compliance
            // Step 1: Encode Mandate_Meta (innermost struct)
            const metaTypestring = 'Mandate_Meta(address token,uint256 amount)';
            expect(Mandate.witnessTypestring).toMatch(metaTypestring.slice(0, -1));
            const metaTypehash = (0, viem_1.keccak256)(metaTypestring);
            const metaEncoded = (0, viem_1.encodeAbiParameters)([
                { name: 'token', type: 'address' },
                { name: 'amount', type: 'uint256' },
            ], [witnessValue.data.meta.token, witnessValue.data.meta.amount]);
            const metaHash = (0, viem_1.keccak256)((0, viem_1.concat)([metaTypehash, metaEncoded]));
            // Step 2: Encode Mandate_Data (includes metaHash)
            const dataTypestring = 'Mandate_Data(uint256 value,Mandate_Meta meta)Mandate_Meta(address token,uint256 amount)';
            const dataTypehash = (0, viem_1.keccak256)(dataTypestring);
            const dataEncoded = (0, viem_1.concat)([
                (0, viem_1.encodeAbiParameters)([{ name: 'value', type: 'uint256' }], [witnessValue.data.value]),
                metaHash,
            ]);
            const dataHash = (0, viem_1.keccak256)((0, viem_1.concat)([dataTypehash, dataEncoded]));
            // Step 3: Encode Mandate (includes dataHash)
            const expectedEncoded = (0, viem_1.concat)([
                (0, viem_1.encodeAbiParameters)([{ name: 'signer', type: 'address' }], [witnessValue.signer]),
                dataHash,
            ]);
            expect(encoded).toEqual(expectedEncoded);
            expect(hash).toEqual((0, viem_1.keccak256)(encoded));
        });
        it('should match EIP-712 encoding for arrays of primitives', () => {
            // Test that arrays of primitives are hashed correctly
            const Mandate = (0, mandate_1.defineMandateType)({
                fields: [mandate_1.MandateFields.address('sender'), { name: 'values', type: 'uint256[]' }],
            });
            const witnessValue = {
                sender: '0x3333333333333333333333333333333333333333',
                values: [111n, 222n, 333n],
            };
            const encoded = Mandate.encode(witnessValue);
            // Arrays of primitives are hashed per EIP-712: keccak256(abi.encode(array))
            const valuesEncoded = (0, viem_1.encodeAbiParameters)([{ name: 'values', type: 'uint256[]' }], [witnessValue.values]);
            const valuesHash = (0, viem_1.keccak256)(valuesEncoded);
            const expectedEncoded = (0, viem_1.concat)([
                (0, viem_1.encodeAbiParameters)([{ name: 'sender', type: 'address' }], [witnessValue.sender]),
                valuesHash,
            ]);
            expect(encoded).toEqual(expectedEncoded);
        });
    });
    describe('typestring and typehash helpers', () => {
        it('should generate full typestring with Mandate wrapper', () => {
            const Mandate = (0, mandate_1.simpleMandate)([mandate_1.MandateFields.uint256('witnessArgument')]);
            const typestring = Mandate.typestring();
            expect(typestring).toBe('Mandate(uint256 witnessArgument)');
        });
        it('should generate full typestring for complex nested mandates', () => {
            const Mandate = (0, mandate_1.defineMandateType)({
                fields: [mandate_1.MandateFields.address('owner'), { name: 'data', type: 'Mandate_Data' }],
                nestedTypes: {
                    Mandate_Data: [mandate_1.MandateFields.uint256('value'), mandate_1.MandateFields.address('token')],
                },
            });
            const typestring = Mandate.typestring();
            // Should be Mandate(...witnessTypestring)
            expect(typestring).toBe('Mandate(address owner,Mandate_Data data)Mandate_Data(uint256 value,address token)');
        });
        it('should generate typehash matching keccak256 of typestring', () => {
            const Mandate = (0, mandate_1.simpleMandate)([mandate_1.MandateFields.uint256('witnessArgument')]);
            const typehash = Mandate.typehash();
            const expectedTypehash = (0, viem_1.keccak256)('Mandate(uint256 witnessArgument)');
            expect(typehash).toBe(expectedTypehash);
        });
        it('should generate Tribunal-compatible typehash', () => {
            // Validate against Tribunal's MANDATE_TYPEHASH constant
            const Mandate = (0, mandate_1.defineMandateType)({
                fields: [mandate_1.MandateFields.address('adjuster'), { name: 'fills', type: 'Mandate_Fill[]' }],
                nestedTypes: {
                    Mandate_Fill: [
                        mandate_1.MandateFields.uint256('chainId'),
                        mandate_1.MandateFields.address('tribunal'),
                        mandate_1.MandateFields.uint256('expires'),
                        { name: 'components', type: 'Mandate_FillComponent[]' },
                        mandate_1.MandateFields.uint256('baselinePriorityFee'),
                        mandate_1.MandateFields.uint256('scalingFactor'),
                        { name: 'priceCurve', type: 'uint256[]' },
                        { name: 'recipientCallback', type: 'Mandate_RecipientCallback[]' },
                        mandate_1.MandateFields.bytes32('salt'),
                    ],
                    Mandate_FillComponent: [
                        mandate_1.MandateFields.address('fillToken'),
                        mandate_1.MandateFields.uint256('minimumFillAmount'),
                        mandate_1.MandateFields.address('recipient'),
                        mandate_1.MandateFields.bool('applyScaling'),
                    ],
                    Mandate_Lock: [
                        { name: 'lockTag', type: 'bytes12' },
                        mandate_1.MandateFields.address('token'),
                        mandate_1.MandateFields.uint256('amount'),
                    ],
                    Mandate_BatchCompact: [
                        mandate_1.MandateFields.address('arbiter'),
                        mandate_1.MandateFields.address('sponsor'),
                        mandate_1.MandateFields.uint256('nonce'),
                        mandate_1.MandateFields.uint256('expires'),
                        { name: 'commitments', type: 'Mandate_Lock[]' },
                        { name: 'mandate', type: 'Mandate' },
                    ],
                    Mandate_RecipientCallback: [
                        mandate_1.MandateFields.uint256('chainId'),
                        { name: 'compact', type: 'Mandate_BatchCompact' },
                        mandate_1.MandateFields.bytes('context'),
                    ],
                },
            });
            // Expected typehash from Tribunal contract
            const expectedMandateTypehash = '0xd98eceb6e5c7770b3b664a99c269855402fe5255294a30970d25376caea662c6';
            expect(Mandate.typehash()).toBe(expectedMandateTypehash);
        });
    });
    describe('Tribunal typehash validation', () => {
        it('should generate correct typehash for Tribunal Mandate', () => {
            // Validate against Tribunal's MANDATE_TYPEHASH
            // Source: https://github.com/Uniswap/tribunal/blob/main/src/types/TribunalTypeHashes.sol
            const Mandate = (0, mandate_1.defineMandateType)({
                fields: [mandate_1.MandateFields.address('adjuster'), { name: 'fills', type: 'Mandate_Fill[]' }],
                nestedTypes: {
                    Mandate_Fill: [
                        mandate_1.MandateFields.uint256('chainId'),
                        mandate_1.MandateFields.address('tribunal'),
                        mandate_1.MandateFields.uint256('expires'),
                        { name: 'components', type: 'Mandate_FillComponent[]' },
                        mandate_1.MandateFields.uint256('baselinePriorityFee'),
                        mandate_1.MandateFields.uint256('scalingFactor'),
                        { name: 'priceCurve', type: 'uint256[]' },
                        { name: 'recipientCallback', type: 'Mandate_RecipientCallback[]' },
                        mandate_1.MandateFields.bytes32('salt'),
                    ],
                    Mandate_FillComponent: [
                        mandate_1.MandateFields.address('fillToken'),
                        mandate_1.MandateFields.uint256('minimumFillAmount'),
                        mandate_1.MandateFields.address('recipient'),
                        mandate_1.MandateFields.bool('applyScaling'),
                    ],
                    Mandate_Lock: [
                        { name: 'lockTag', type: 'bytes12' },
                        mandate_1.MandateFields.address('token'),
                        mandate_1.MandateFields.uint256('amount'),
                    ],
                    Mandate_BatchCompact: [
                        mandate_1.MandateFields.address('arbiter'),
                        mandate_1.MandateFields.address('sponsor'),
                        mandate_1.MandateFields.uint256('nonce'),
                        mandate_1.MandateFields.uint256('expires'),
                        { name: 'commitments', type: 'Mandate_Lock[]' },
                        { name: 'mandate', type: 'Mandate' },
                    ],
                    Mandate_RecipientCallback: [
                        mandate_1.MandateFields.uint256('chainId'),
                        { name: 'compact', type: 'Mandate_BatchCompact' },
                        mandate_1.MandateFields.bytes('context'),
                    ],
                },
            });
            // Expected typehash from Tribunal contract
            const expectedTypehash = '0xd98eceb6e5c7770b3b664a99c269855402fe5255294a30970d25376caea662c6';
            const mandateFillTypestring = 'Mandate(address adjuster,Mandate_Fill[] fills)' +
                'Mandate_BatchCompact(address arbiter,address sponsor,uint256 nonce,uint256 expires,Mandate_Lock[] commitments,Mandate mandate)' +
                'Mandate_Fill(uint256 chainId,address tribunal,uint256 expires,Mandate_FillComponent[] components,uint256 baselinePriorityFee,uint256 scalingFactor,uint256[] priceCurve,Mandate_RecipientCallback[] recipientCallback,bytes32 salt)' +
                'Mandate_FillComponent(address fillToken,uint256 minimumFillAmount,address recipient,bool applyScaling)' +
                'Mandate_Lock(bytes12 lockTag,address token,uint256 amount)' +
                'Mandate_RecipientCallback(uint256 chainId,Mandate_BatchCompact compact,bytes context)';
            expect(Mandate.typehash()).toBe(expectedTypehash);
            expect(Mandate.typestring()).toEqual(mandateFillTypestring);
            expect(Mandate.witnessTypestring).toEqual(mandateFillTypestring.slice('Mandate('.length, -1));
        });
    });
    describe('Tribunal mandate encoding validation', () => {
        it('should encode mandate matching Tribunal test case', () => {
            // Reproduce the test case from TribunalBasicTest.t.sol test_DeriveMandateHash
            // This validates our encoding matches Tribunal's deriveMandateHash function
            const Mandate = (0, mandate_1.defineMandateType)({
                fields: [mandate_1.MandateFields.address('adjuster'), { name: 'fills', type: 'Mandate_Fill[]' }],
                nestedTypes: {
                    Mandate_Fill: [
                        mandate_1.MandateFields.uint256('chainId'),
                        mandate_1.MandateFields.address('tribunal'),
                        mandate_1.MandateFields.uint256('expires'),
                        { name: 'components', type: 'Mandate_FillComponent[]' },
                        mandate_1.MandateFields.uint256('baselinePriorityFee'),
                        mandate_1.MandateFields.uint256('scalingFactor'),
                        { name: 'priceCurve', type: 'uint256[]' },
                        { name: 'recipientCallback', type: 'Mandate_RecipientCallback[]' },
                        mandate_1.MandateFields.bytes32('salt'),
                    ],
                    Mandate_FillComponent: [
                        mandate_1.MandateFields.address('fillToken'),
                        mandate_1.MandateFields.uint256('minimumFillAmount'),
                        mandate_1.MandateFields.address('recipient'),
                        mandate_1.MandateFields.bool('applyScaling'),
                    ],
                    Mandate_RecipientCallback: [
                        mandate_1.MandateFields.uint256('chainId'),
                        { name: 'compact', type: 'Mandate_BatchCompact' },
                        mandate_1.MandateFields.bytes('context'),
                    ],
                    Mandate_BatchCompact: [
                        mandate_1.MandateFields.address('arbiter'),
                        mandate_1.MandateFields.address('sponsor'),
                        mandate_1.MandateFields.uint256('nonce'),
                        mandate_1.MandateFields.uint256('expires'),
                        { name: 'commitments', type: 'Mandate_Lock[]' },
                        { name: 'mandate', type: 'Mandate' },
                    ],
                    Mandate_Lock: [
                        { name: 'lockTag', type: 'bytes12' },
                        mandate_1.MandateFields.address('token'),
                        mandate_1.MandateFields.uint256('amount'),
                    ],
                },
            });
            // Test data matching Tribunal's test case
            const adjuster = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
            const witnessValue = {
                adjuster,
                fills: [
                    {
                        chainId: 1n,
                        tribunal: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
                        expires: 1703116800n,
                        components: [
                            {
                                fillToken: '0x000000000000000000000000000000000000dead',
                                minimumFillAmount: 1000000000000000000n, // 1 ether
                                recipient: '0x000000000000000000000000000000000000cafe',
                                applyScaling: true,
                            },
                        ],
                        baselinePriorityFee: 100n,
                        scalingFactor: 1000000000000000000n, // 1e18
                        priceCurve: [],
                        recipientCallback: [],
                        salt: '0x0000000000000000000000000000000000000000000000000000000000000001',
                    },
                ],
            };
            const encoded = Mandate.encode(witnessValue);
            const hash = Mandate.hash(witnessValue);
            // Verify encoding is valid (should be bytes32 * 2 = address + fillsHash)
            expect(encoded).toEqual('0x000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266a1645b0f8a53506f3892756697cdf6020c84da13b4d5b08e07aea6902d7d3aa7');
            expect(hash).toEqual((0, viem_1.keccak256)(encoded));
        });
    });
});
//# sourceMappingURL=mandate.test.js.map