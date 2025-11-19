"use strict";
/**
 * Error types for The Compact
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCompactError = createCompactError;
exports.isCompactError = isCompactError;
/**
 * Create a CompactError
 */
function createCompactError(kind, message, data, rawData) {
    const error = new Error(message || kind);
    error.kind = kind;
    error.data = data;
    error.rawData = rawData;
    error.name = 'CompactError';
    return error;
}
/**
 * Check if an error is a CompactError
 */
function isCompactError(error) {
    return error && error.name === 'CompactError' && 'kind' in error;
}
//# sourceMappingURL=types.js.map