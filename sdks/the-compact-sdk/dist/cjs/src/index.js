"use strict";
/**
 * The Compact SDK
 * A TypeScript SDK for building and interacting with The Compact v1
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSION = void 0;
const tslib_1 = require("tslib");
exports.VERSION = '0.1.0';
// Export config
tslib_1.__exportStar(require("./config"), exports);
// Export types
tslib_1.__exportStar(require("./types"), exports);
// Export encoding utilities
tslib_1.__exportStar(require("./encoding"), exports);
// Export builders
tslib_1.__exportStar(require("./builders"), exports);
// Export client
tslib_1.__exportStar(require("./client"), exports);
// Export ABIs
tslib_1.__exportStar(require("./abi"), exports);
// Export errors
tslib_1.__exportStar(require("./errors"), exports);
//# sourceMappingURL=index.js.map