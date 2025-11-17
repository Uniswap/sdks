"use strict";
/**
 * Mandate type definitions and witness hashing utilities
 * Handles the complex EIP-712 witness mechanism for Compacts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MandateFields = void 0;
exports.defineMandateType = defineMandateType;
exports.simpleMandate = simpleMandate;
const tslib_1 = require("tslib");
const viem_1 = require("viem");
const tiny_invariant_1 = tslib_1.__importDefault(require("tiny-invariant"));
/**
 * Define a mandate type with proper witness typestring generation
 *
 * The witness typestring is a special format used by The Compact:
 * - It contains the arguments inside the Mandate struct
 * - Plus any nested struct definitions
 * - WITHOUT the final closing parenthesis
 * - Nested struct names must start with "Mandate" for proper EIP-712 ordering
 *
 * @param config - The mandate type configuration
 * @returns A MandateType instance
 */
function defineMandateType(config) {
    const { fields, nestedTypes } = config;
    // Validate fields
    (0, tiny_invariant_1.default)(fields.length > 0, 'Mandate must have at least one field');
    // Validate nested type names start with "Mandate"
    if (nestedTypes) {
        for (const typeName of Object.keys(nestedTypes)) {
            (0, tiny_invariant_1.default)(typeName.startsWith('Mandate'), `Nested type "${typeName}" must start with "Mandate"`);
        }
    }
    // Build witness typestring
    // Format: "field1Type field1Name,field2Type field2Name,...[NestedType(field1Type field1Name,...)]"
    // WITHOUT the final closing parenthesis
    const witnessTypestring = buildWitnessTypestring(fields, nestedTypes);
    // Precompute type hashes for nested types (EIP-712 struct hashing)
    const typeHashes = new Map();
    if (nestedTypes) {
        for (const [typeName, typeFields] of Object.entries(nestedTypes)) {
            const typestring = buildFullTypestring(typeName, typeFields, nestedTypes);
            typeHashes.set(typeName, (0, viem_1.keccak256)(typestring));
        }
    }
    return {
        name: 'Mandate',
        fields,
        nestedTypes,
        witnessTypestring,
        typestring() {
            // The full EIP-712 typestring is Mandate(...witnessTypestring)
            return `Mandate(${witnessTypestring})`;
        },
        typehash() {
            return (0, viem_1.keccak256)(this.typestring());
        },
        encode(value) {
            // Check if any field is an array or a custom type
            // Note: Check for arrays BEFORE checking isPrimitiveType, since isPrimitiveType
            // strips array suffix and would return true for "uint256[]"
            const hasComplexTypes = fields.some(f => {
                if (f.type.endsWith('[]'))
                    return true; // Any array needs EIP-712 encoding
                const baseType = f.type.replace(/\[\]$/, '');
                return !isPrimitiveType(baseType); // Custom types need EIP-712 encoding
            });
            // For mandates with nested types or arrays, we need EIP-712 struct encoding
            if ((nestedTypes && Object.keys(nestedTypes).length > 0) || hasComplexTypes) {
                return encodeStructValue(fields, value, nestedTypes || {}, typeHashes);
            }
            // For simple mandates with only primitive types, use direct ABI encoding
            const values = fields.map((field) => {
                const val = value[field.name];
                (0, tiny_invariant_1.default)(val !== undefined, `Missing field: ${field.name}`);
                return val;
            });
            const params = fields.map((f) => ({ name: f.name, type: f.type }));
            return viem_1.encodeAbiParameters(params, values);
        },
        hash(value) {
            const encoded = this.encode(value);
            return (0, viem_1.keccak256)(encoded);
        },
    };
}
/**
 * Check if a type is a primitive Solidity type
 */
function isPrimitiveType(type) {
    const baseType = type.replace(/\[\]$/, ''); // Remove array suffix
    return (baseType.startsWith('uint') ||
        baseType.startsWith('int') ||
        baseType.startsWith('bytes') ||
        baseType === 'address' ||
        baseType === 'bool' ||
        baseType === 'string');
}
/**
 * Build the full EIP-712 typestring for a nested type
 * @param typeName - The name of the type
 * @param fields - The fields of the type
 * @param nestedTypes - All nested types for recursive resolution
 * @returns The full typestring (e.g., "Mandate_Fill(uint256 chainId,...)")
 */
function buildFullTypestring(typeName, fields, nestedTypes) {
    // Build main type definition
    const mainFieldsStr = fields.map((f) => `${f.type} ${f.name}`).join(',');
    let result = `${typeName}(${mainFieldsStr})`;
    // Collect all referenced custom types recursively
    const referencedTypes = new Set();
    const collectReferencedTypes = (currentFields) => {
        for (const field of currentFields) {
            const baseType = field.type.replace(/\[\]$/, '');
            if (!isPrimitiveType(baseType) && baseType !== 'Mandate' && nestedTypes[baseType]) {
                if (!referencedTypes.has(baseType)) {
                    referencedTypes.add(baseType);
                    collectReferencedTypes(nestedTypes[baseType]);
                }
            }
        }
    };
    collectReferencedTypes(fields);
    // Append referenced types in alphabetical order
    if (referencedTypes.size > 0) {
        const sortedTypes = Array.from(referencedTypes).sort();
        for (const refType of sortedTypes) {
            const refFields = nestedTypes[refType];
            const refFieldsStr = refFields.map((f) => `${f.type} ${f.name}`).join(',');
            result += `${refType}(${refFieldsStr})`;
        }
    }
    return result;
}
/**
 * Encode a struct value according to EIP-712 rules
 * @param fields - The fields of the struct
 * @param value - The value to encode
 * @param nestedTypes - All nested type definitions
 * @param typeHashes - Precomputed type hashes
 * @returns The encoded struct value
 */
function encodeStructValue(fields, value, nestedTypes, typeHashes) {
    const encodedValues = [];
    for (const field of fields) {
        const fieldValue = value[field.name];
        (0, tiny_invariant_1.default)(fieldValue !== undefined, `Missing field: ${field.name}`);
        const isArray = field.type.endsWith('[]');
        const baseType = field.type.replace(/\[\]$/, '');
        if (isArray && isPrimitiveType(baseType)) {
            // Array of primitives: encode array directly, then hash
            const encoded = (0, viem_1.encodeAbiParameters)([{ name: field.name, type: field.type }], [fieldValue]);
            encodedValues.push((0, viem_1.keccak256)(encoded));
        }
        else if (isArray && nestedTypes[baseType]) {
            // Array of structs: hash each struct, concatenate, then hash
            const structHashes = [];
            for (const item of fieldValue) {
                const itemEncoded = encodeStructValue(nestedTypes[baseType], item, nestedTypes, typeHashes);
                const typeHash = typeHashes.get(baseType);
                // EIP-712: hashStruct(s) = keccak256(typeHash || encodeData(s))
                const structHash = (0, viem_1.keccak256)((0, viem_1.concat)([typeHash, itemEncoded]));
                structHashes.push(structHash);
            }
            // Hash the concatenation of all struct hashes
            const concatenated = (0, viem_1.concat)(structHashes);
            encodedValues.push((0, viem_1.keccak256)(concatenated));
        }
        else if (nestedTypes[baseType]) {
            // Single nested struct: encode recursively and hash with typehash
            const itemEncoded = encodeStructValue(nestedTypes[baseType], fieldValue, nestedTypes, typeHashes);
            const typeHash = typeHashes.get(baseType);
            // EIP-712: hashStruct(s) = keccak256(typeHash || encodeData(s))
            const structHash = (0, viem_1.keccak256)((0, viem_1.concat)([typeHash, itemEncoded]));
            encodedValues.push(structHash);
        }
        else if (isPrimitiveType(baseType)) {
            // Primitive type (non-array): direct ABI encoding
            const encoded = (0, viem_1.encodeAbiParameters)([{ name: field.name, type: field.type }], [fieldValue]);
            encodedValues.push(encoded);
        }
        else {
            throw new Error(`Unsupported type: ${field.type}`);
        }
    }
    // Concatenate all encoded values (each is bytes32)
    return (0, viem_1.concat)(encodedValues);
}
/**
 * Build the witness typestring from fields and nested types
 * @param fields - The mandate fields
 * @param nestedTypes - Optional nested type definitions
 * @returns The witness typestring
 */
function buildWitnessTypestring(fields, nestedTypes) {
    // Build main fields string
    const fieldsStr = fields.map((f) => `${f.type} ${f.name}`).join(',');
    // If no nested types, return just the fields (no closing paren)
    if (!nestedTypes || Object.keys(nestedTypes).length === 0) {
        return fieldsStr;
    }
    // Build nested types string
    // Format: TypeName(field1Type field1Name,field2Type field2Name)
    const nestedStrs = Object.entries(nestedTypes)
        .sort(([a], [b]) => a.localeCompare(b)) // Sort alphabetically for consistency
        .map(([typeName, typeFields]) => {
        const nestedFieldsStr = typeFields.map((f) => `${f.type} ${f.name}`).join(',');
        return `${typeName}(${nestedFieldsStr})`;
    });
    // Combine: fields, then nested types, WITHOUT the final closing parenthesis
    const result = `${fieldsStr})${nestedStrs.join('')}`;
    return result.slice(0, -1); // Remove final closing paren per The Compact spec
}
/**
 * Helper to create a simple mandate with no nested types
 * @param fields - The mandate fields
 * @returns A MandateType instance
 */
function simpleMandate(fields) {
    return defineMandateType({ fields });
}
/**
 * Common mandate field types for convenience
 */
exports.MandateFields = {
    /**
     * Create a bytes32 field
     */
    bytes32(name) {
        return { name, type: 'bytes32' };
    },
    /**
     * Create a uint256 field
     */
    uint256(name) {
        return { name, type: 'uint256' };
    },
    /**
     * Create an address field
     */
    address(name) {
        return { name, type: 'address' };
    },
    /**
     * Create a bool field
     */
    bool(name) {
        return { name, type: 'bool' };
    },
    /**
     * Create a bytes field
     */
    bytes(name) {
        return { name, type: 'bytes' };
    },
    /**
     * Create a string field
     */
    string(name) {
        return { name, type: 'string' };
    },
};
//# sourceMappingURL=mandate.js.map