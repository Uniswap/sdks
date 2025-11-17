/**
 * Error types for The Compact
 */
/**
 * Create a CompactError
 */
export function createCompactError(kind, message, data, rawData) {
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
export function isCompactError(error) {
    return error && error.name === 'CompactError' && 'kind' in error;
}
//# sourceMappingURL=types.js.map