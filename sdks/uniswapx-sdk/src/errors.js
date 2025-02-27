"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissingConfiguration = void 0;
class MissingConfiguration extends Error {
    constructor(key, value) {
        super(`Missing configuration for ${key}: ${value}`);
        Object.setPrototypeOf(this, MissingConfiguration.prototype);
    }
}
exports.MissingConfiguration = MissingConfiguration;
//# sourceMappingURL=errors.js.map