"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const NonceManager_1 = require("./NonceManager");
describe("NonceManager", () => {
    describe("buildNonce", () => {
        it("0, 0", () => {
            expect((0, NonceManager_1.buildNonce)(ethers_1.BigNumber.from(0), 0)).toEqual(ethers_1.BigNumber.from(0));
        });
        it("0, 1", () => {
            expect((0, NonceManager_1.buildNonce)(ethers_1.BigNumber.from(0), 1)).toEqual(ethers_1.BigNumber.from(1));
        });
        it("0, 12", () => {
            expect((0, NonceManager_1.buildNonce)(ethers_1.BigNumber.from(0), 12)).toEqual(ethers_1.BigNumber.from(12));
        });
        it("1, 0", () => {
            expect((0, NonceManager_1.buildNonce)(ethers_1.BigNumber.from(1), 0)).toEqual(ethers_1.BigNumber.from(256));
        });
        it("1, 1", () => {
            expect((0, NonceManager_1.buildNonce)(ethers_1.BigNumber.from(1), 1)).toEqual(ethers_1.BigNumber.from(257));
        });
        it("4, 1", () => {
            expect((0, NonceManager_1.buildNonce)(ethers_1.BigNumber.from(4), 1)).toEqual(ethers_1.BigNumber.from(1025));
        });
        it("8, 1", () => {
            expect((0, NonceManager_1.buildNonce)(ethers_1.BigNumber.from(8), 1)).toEqual(ethers_1.BigNumber.from(2049));
        });
    });
    describe("setBit", () => {
        it("0, 0", () => {
            expect((0, NonceManager_1.setBit)(ethers_1.BigNumber.from(0), 0)).toEqual(ethers_1.BigNumber.from(1));
        });
        it("0, 1", () => {
            expect((0, NonceManager_1.setBit)(ethers_1.BigNumber.from(0), 1)).toEqual(ethers_1.BigNumber.from(2));
        });
        it("0, 8", () => {
            expect((0, NonceManager_1.setBit)(ethers_1.BigNumber.from(0), 8)).toEqual(ethers_1.BigNumber.from(256));
        });
        it("1, 0", () => {
            expect((0, NonceManager_1.setBit)(ethers_1.BigNumber.from(1), 0)).toEqual(ethers_1.BigNumber.from(1));
        });
        it("1, 1", () => {
            expect((0, NonceManager_1.setBit)(ethers_1.BigNumber.from(1), 1)).toEqual(ethers_1.BigNumber.from(3));
        });
        it("16756735, 12", () => {
            expect((0, NonceManager_1.setBit)(ethers_1.BigNumber.from(16756735), 12)).toEqual(ethers_1.BigNumber.from(16760831));
        });
    });
    describe("getFirstUnsetBit", () => {
        it("0", () => {
            expect((0, NonceManager_1.getFirstUnsetBit)(ethers_1.BigNumber.from(0))).toEqual(0);
        });
        it("1", () => {
            expect((0, NonceManager_1.getFirstUnsetBit)(ethers_1.BigNumber.from(1))).toEqual(1);
        });
        it("2", () => {
            expect((0, NonceManager_1.getFirstUnsetBit)(ethers_1.BigNumber.from(2))).toEqual(0);
        });
        it("128", () => {
            expect((0, NonceManager_1.getFirstUnsetBit)(ethers_1.BigNumber.from(128))).toEqual(0);
        });
        it("127", () => {
            expect((0, NonceManager_1.getFirstUnsetBit)(ethers_1.BigNumber.from(127))).toEqual(7);
        });
        it("MaxUint256", () => {
            expect((0, NonceManager_1.getFirstUnsetBit)(ethers_1.ethers.constants.MaxUint256)).toEqual(-1);
        });
        it("16756735", () => {
            expect((0, NonceManager_1.getFirstUnsetBit)(ethers_1.BigNumber.from(16756735))).toEqual(12);
        });
    });
    describe("getCancelSingleParams", () => {
        it("0", () => {
            expect((0, NonceManager_1.getCancelSingleParams)(ethers_1.BigNumber.from(0)).word.toString()).toEqual("0");
            expect((0, NonceManager_1.getCancelSingleParams)(ethers_1.BigNumber.from(0)).mask.toString()).toEqual("1");
        });
        it("1", () => {
            expect((0, NonceManager_1.getCancelSingleParams)(ethers_1.BigNumber.from(1)).word.toString()).toEqual("0");
            expect((0, NonceManager_1.getCancelSingleParams)(ethers_1.BigNumber.from(1)).mask.toString()).toEqual("2");
        });
        it("2", () => {
            expect((0, NonceManager_1.getCancelSingleParams)(ethers_1.BigNumber.from(2)).word.toString()).toEqual("0");
            expect((0, NonceManager_1.getCancelSingleParams)(ethers_1.BigNumber.from(2)).mask.toString()).toEqual("4");
        });
        it("3", () => {
            expect((0, NonceManager_1.getCancelSingleParams)(ethers_1.BigNumber.from(3)).word.toString()).toEqual("0");
            expect((0, NonceManager_1.getCancelSingleParams)(ethers_1.BigNumber.from(3)).mask.toString()).toEqual("8");
        });
        it("255", () => {
            expect((0, NonceManager_1.getCancelSingleParams)(ethers_1.BigNumber.from(256)).word.toString()).toEqual("1");
            expect((0, NonceManager_1.getCancelSingleParams)(ethers_1.BigNumber.from(256)).mask.toString()).toEqual("1");
        });
        it("257", () => {
            expect((0, NonceManager_1.getCancelSingleParams)(ethers_1.BigNumber.from(257)).word.toString()).toEqual("1");
            expect((0, NonceManager_1.getCancelSingleParams)(ethers_1.BigNumber.from(257)).mask.toString()).toEqual("2");
        });
    });
    describe("getCancelMultipleParams", () => {
        it("0, 1", () => {
            expect((0, NonceManager_1.getCancelMultipleParams)([ethers_1.BigNumber.from(0), ethers_1.BigNumber.from(1)]).length).toEqual(1);
            expect((0, NonceManager_1.getCancelMultipleParams)([
                ethers_1.BigNumber.from(0),
                ethers_1.BigNumber.from(1),
            ])[0].word.toString()).toEqual("0");
            expect((0, NonceManager_1.getCancelMultipleParams)([
                ethers_1.BigNumber.from(0),
                ethers_1.BigNumber.from(1),
            ])[0].mask.toString()).toEqual("3");
        });
        it("0, 256", () => {
            expect((0, NonceManager_1.getCancelMultipleParams)([ethers_1.BigNumber.from(0), ethers_1.BigNumber.from(256)]).length).toEqual(2);
            expect((0, NonceManager_1.getCancelMultipleParams)([
                ethers_1.BigNumber.from(0),
                ethers_1.BigNumber.from(256),
            ])[0].word.toString()).toEqual("0");
            expect((0, NonceManager_1.getCancelMultipleParams)([
                ethers_1.BigNumber.from(0),
                ethers_1.BigNumber.from(256),
            ])[1].word.toString()).toEqual("1");
            expect((0, NonceManager_1.getCancelMultipleParams)([
                ethers_1.BigNumber.from(0),
                ethers_1.BigNumber.from(256),
            ])[0].mask.toString()).toEqual("1");
            expect((0, NonceManager_1.getCancelMultipleParams)([
                ethers_1.BigNumber.from(0),
                ethers_1.BigNumber.from(256),
            ])[1].mask.toString()).toEqual("1");
        });
    });
});
//# sourceMappingURL=NonceManager.test.js.map