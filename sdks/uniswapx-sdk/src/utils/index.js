"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripHexPrefix = stripHexPrefix;
exports.getPermit2 = getPermit2;
exports.getReactor = getReactor;
const tslib_1 = require("tslib");
const constants_1 = require("../constants");
const errors_1 = require("../errors");
tslib_1.__exportStar(require("./OrderValidator"), exports);
tslib_1.__exportStar(require("./NonceManager"), exports);
tslib_1.__exportStar(require("./OrderQuoter"), exports);
tslib_1.__exportStar(require("./EventWatcher"), exports);
tslib_1.__exportStar(require("./multicall"), exports);
tslib_1.__exportStar(require("./dutchDecay"), exports);
tslib_1.__exportStar(require("./order"), exports);
function stripHexPrefix(a) {
    if (a.startsWith("0x")) {
        return a.slice(2);
    }
    else {
        return a;
    }
}
function getPermit2(chainId, permit2Address) {
    if (permit2Address) {
        return permit2Address;
    }
    else if (constants_1.PERMIT2_MAPPING[chainId]) {
        return constants_1.PERMIT2_MAPPING[chainId];
    }
    else {
        throw new errors_1.MissingConfiguration("permit2", chainId.toString());
    }
}
function getReactor(chainId, orderType, reactorAddress) {
    const mappedReactorAddress = constants_1.REACTOR_ADDRESS_MAPPING[chainId]
        ? constants_1.REACTOR_ADDRESS_MAPPING[chainId][orderType]
        : undefined;
    if (reactorAddress) {
        return reactorAddress;
    }
    else if (mappedReactorAddress) {
        return mappedReactorAddress;
    }
    else {
        throw new errors_1.MissingConfiguration("reactor", chainId.toString());
    }
}
//# sourceMappingURL=index.js.map