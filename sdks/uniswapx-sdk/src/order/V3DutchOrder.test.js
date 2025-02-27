"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const ethers_1 = require("ethers");
const dutchBlockDecay_1 = require("../utils/dutchBlockDecay");
const V3DutchOrder_1 = require("./V3DutchOrder");
const TIME = 1725379823;
const BLOCK_NUMBER = 20671221;
const RAW_AMOUNT = ethers_1.BigNumber.from("2121000");
const INPUT_TOKEN = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const OUTPUT_TOKEN = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const CHAIN_ID = 1;
const COSIGNER_DATA_WITH_OVERRIDES = {
    decayStartBlock: BLOCK_NUMBER,
    exclusiveFiller: ethers_1.ethers.constants.AddressZero,
    exclusivityOverrideBps: ethers_1.BigNumber.from(0),
    inputOverride: RAW_AMOUNT,
    outputOverrides: [RAW_AMOUNT.mul(102).div(100)],
};
const COSIGNER_DATA_WITHOUT_OVERRIDES = {
    decayStartBlock: BLOCK_NUMBER,
    exclusiveFiller: ethers_1.ethers.constants.AddressZero,
    exclusivityOverrideBps: ethers_1.BigNumber.from(0),
    inputOverride: ethers_1.BigNumber.from(0),
    outputOverrides: [ethers_1.BigNumber.from(0)],
};
describe("V3DutchOrder", () => {
    const getFullOrderInfo = (data) => {
        return Object.assign({
            reactor: ethers_1.ethers.constants.AddressZero,
            swapper: ethers_1.ethers.constants.AddressZero,
            nonce: ethers_1.BigNumber.from(21),
            deadline: TIME + 1000,
            additionalValidationContract: ethers_1.ethers.constants.AddressZero,
            additionalValidationData: "0x",
            cosigner: ethers_1.ethers.constants.AddressZero,
            startingBaseFee: ethers_1.BigNumber.from(0),
            cosignerData: COSIGNER_DATA_WITH_OVERRIDES,
            input: {
                token: INPUT_TOKEN,
                startAmount: RAW_AMOUNT,
                curve: {
                    relativeBlocks: [],
                    relativeAmounts: [],
                },
                maxAmount: RAW_AMOUNT, //we don't want input to change, we're testing for decaying output
                adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
            },
            outputs: [
                {
                    token: OUTPUT_TOKEN,
                    startAmount: RAW_AMOUNT,
                    curve: {
                        relativeBlocks: [1, 2, 3, 4],
                        relativeAmounts: [BigInt(1), BigInt(2), BigInt(3), BigInt(4)], // 1e-18, 2e-18, 3e-18, 4e-18
                    },
                    recipient: ethers_1.ethers.constants.AddressZero,
                    minAmount: RAW_AMOUNT.sub(4),
                    adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
                },
            ],
            cosignature: "0x",
        }, data);
    };
    const getFullOrderInfoWithoutOverrides = {
        ...getFullOrderInfo({}),
        cosignerData: COSIGNER_DATA_WITHOUT_OVERRIDES,
    };
    it("Parses a serialized v3 order", () => {
        const orderInfo = getFullOrderInfo({});
        const order = new V3DutchOrder_1.CosignedV3DutchOrder(orderInfo, CHAIN_ID);
        const seralized = order.serialize();
        const parsed = V3DutchOrder_1.CosignedV3DutchOrder.parse(seralized, CHAIN_ID);
        (0, chai_1.expect)(parsed.info).to.deep.eq(orderInfo);
    });
    it("Parses a serialized v3 order with negative relativeAmounts", () => {
        const orderInfo = getFullOrderInfo({
            outputs: [
                {
                    token: OUTPUT_TOKEN,
                    startAmount: RAW_AMOUNT,
                    curve: {
                        relativeBlocks: [1, 2, 3, 4],
                        relativeAmounts: [BigInt(-1), BigInt(-2), BigInt(-3), BigInt(-4)],
                    },
                    recipient: ethers_1.ethers.constants.AddressZero,
                    minAmount: ethers_1.BigNumber.from(0),
                    adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
                },
            ],
        });
        const order = new V3DutchOrder_1.CosignedV3DutchOrder(orderInfo, CHAIN_ID);
        const seralized = order.serialize();
        const parsed = V3DutchOrder_1.CosignedV3DutchOrder.parse(seralized, CHAIN_ID);
        (0, chai_1.expect)(parsed.info).to.deep.eq(orderInfo);
    });
    it("parses inner v3 order with no cosigner overrides, both input and output curves", () => {
        const orderInfoJSON = {
            ...getFullOrderInfo({}),
            nonce: "21",
            startingBaseFee: "0",
            input: {
                token: INPUT_TOKEN,
                startAmount: "1000000",
                curve: {
                    relativeBlocks: [1, 2, 3, 4],
                    relativeAmounts: ["1", "2", "3", "4"],
                },
                maxAmount: "1000001",
                adjustmentPerGweiBaseFee: "0",
            },
            outputs: [
                {
                    token: OUTPUT_TOKEN,
                    startAmount: "1000000",
                    curve: {
                        relativeBlocks: [1, 2, 3, 4],
                        relativeAmounts: ["1", "2", "3", "4"],
                    },
                    recipient: ethers_1.ethers.constants.AddressZero,
                    minAmount: "1000000",
                    adjustmentPerGweiBaseFee: "0",
                },
            ],
        };
        const order = V3DutchOrder_1.UnsignedV3DutchOrder.fromJSON(orderInfoJSON, CHAIN_ID);
        (0, chai_1.expect)(order.info.input.startAmount.toString()).to.equal("1000000");
        (0, chai_1.expect)(order.info.outputs[0].startAmount.toString()).to.eq("1000000");
    });
    it("valid signature over inner order", async () => {
        const fullOrderInfo = getFullOrderInfo({});
        const order = new V3DutchOrder_1.UnsignedV3DutchOrder(fullOrderInfo, 1);
        const wallet = ethers_1.ethers.Wallet.createRandom();
        const { domain, types, values } = order.permitData();
        const signature = await wallet._signTypedData(domain, types, values);
        (0, chai_1.expect)(order.getSigner(signature)).equal(await wallet.getAddress());
        const fullOrder = V3DutchOrder_1.CosignedV3DutchOrder.fromUnsignedOrder(order, fullOrderInfo.cosignerData, fullOrderInfo.cosignature);
        (0, chai_1.expect)(fullOrder.getSigner(signature)).equal(await wallet.getAddress());
    });
    it("validates cosignature over (hash || cosignerData)", async () => {
        const wallet = ethers_1.ethers.Wallet.createRandom();
        const orderInfo = getFullOrderInfo({
            cosigner: await wallet.getAddress(),
        });
        const order = new V3DutchOrder_1.UnsignedV3DutchOrder(orderInfo, 1);
        const fullOrderHash = order.cosignatureHash(orderInfo.cosignerData);
        const cosignature = ethers_1.ethers.utils.joinSignature(wallet._signingKey().signDigest(fullOrderHash));
        const signedOrder = V3DutchOrder_1.CosignedV3DutchOrder.fromUnsignedOrder(order, COSIGNER_DATA_WITH_OVERRIDES, cosignature);
        (0, chai_1.expect)(signedOrder.recoverCosigner()).equal(await wallet.getAddress());
    });
    describe("resolve DutchV3 orders", () => {
        it("resolves before decayStartBlock", () => {
            const order = new V3DutchOrder_1.CosignedV3DutchOrder(getFullOrderInfo({}), CHAIN_ID);
            const resolved = order.resolve({
                currentBlock: BLOCK_NUMBER - 1, //no decay yet
            });
            (0, chai_1.expect)(resolved.input.token).eq(order.info.input.token);
            (0, chai_1.expect)(resolved.input.amount).eq(order.info.cosignerData.inputOverride);
            (0, chai_1.expect)(resolved.outputs[0].token).eq(order.info.outputs[0].token);
            (0, chai_1.expect)(resolved.outputs[0].amount).eq(order.info.cosignerData.outputOverrides[0]);
        });
        it("resolves with original value when overrides==0", () => {
            const order = new V3DutchOrder_1.CosignedV3DutchOrder(getFullOrderInfo({
                cosignerData: COSIGNER_DATA_WITHOUT_OVERRIDES,
            }), CHAIN_ID);
            const resolved = order.resolve({
                currentBlock: BLOCK_NUMBER - 1, //no decay yet
            });
            (0, chai_1.expect)(resolved.input.token).eq(order.info.input.token);
            (0, chai_1.expect)(resolved.input.amount).eq(order.info.input.startAmount);
            (0, chai_1.expect)(resolved.outputs[0].token).eq(order.info.outputs[0].token);
            (0, chai_1.expect)(resolved.outputs[0].amount).eq(order.info.outputs[0].startAmount);
        });
        it("resolves at decayStartBlock", () => {
            const order = new V3DutchOrder_1.CosignedV3DutchOrder(getFullOrderInfo({}), CHAIN_ID);
            const resolved = order.resolve({
                currentBlock: BLOCK_NUMBER,
            });
            (0, chai_1.expect)(resolved.input.token).eq(order.info.input.token);
            (0, chai_1.expect)(resolved.input.amount).eq(order.info.cosignerData.inputOverride);
            (0, chai_1.expect)(resolved.outputs.length).eq(1);
            (0, chai_1.expect)(resolved.outputs[0].token).eq(order.info.outputs[0].token);
            (0, chai_1.expect)(resolved.outputs[0].amount).eq(order.info.cosignerData.outputOverrides[0]);
        });
        it("resolves at last decay block without overrides", () => {
            const order = new V3DutchOrder_1.CosignedV3DutchOrder(getFullOrderInfoWithoutOverrides, CHAIN_ID);
            const relativeBlocks = order.info.outputs[0].curve.relativeBlocks;
            const resolved = order.resolve({
                currentBlock: BLOCK_NUMBER + relativeBlocks[relativeBlocks.length - 1],
            });
            (0, chai_1.expect)(resolved.input.token).eq(order.info.input.token);
            (0, chai_1.expect)(resolved.outputs[0].token).eq(order.info.outputs[0].token);
            const endAmount = (0, dutchBlockDecay_1.getEndAmount)({
                decayStartBlock: BLOCK_NUMBER,
                startAmount: order.info.outputs[0].startAmount,
                relativeBlocks: order.info.outputs[0].curve.relativeBlocks,
                relativeAmounts: order.info.outputs[0].curve.relativeAmounts,
            });
            (0, chai_1.expect)(resolved.outputs[0].amount.toNumber()).eq(endAmount.toNumber());
        });
        it("resolves after last decay without overrides", () => {
            const order = new V3DutchOrder_1.CosignedV3DutchOrder(getFullOrderInfoWithoutOverrides, CHAIN_ID);
            const resolved = order.resolve({
                currentBlock: BLOCK_NUMBER + 42,
            });
            (0, chai_1.expect)(resolved.input.token).eq(order.info.input.token);
            (0, chai_1.expect)(resolved.outputs[0].token).eq(order.info.outputs[0].token);
            const endAmount = (0, dutchBlockDecay_1.getEndAmount)({
                decayStartBlock: BLOCK_NUMBER,
                startAmount: order.info.outputs[0].startAmount,
                relativeBlocks: order.info.outputs[0].curve.relativeBlocks,
                relativeAmounts: order.info.outputs[0].curve.relativeAmounts,
            });
            (0, chai_1.expect)(resolved.outputs[0].amount.toNumber()).eq(endAmount.toNumber()); //deep eq on bignumber failed
        });
        //TODO: resolves for overrides
        it("resolves when filler has exclusivity: Before Decay Start", () => {
            const exclusiveFiller = ethers_1.ethers.Wallet.createRandom().address;
            const order = new V3DutchOrder_1.CosignedV3DutchOrder(getFullOrderInfo({
                cosignerData: {
                    ...COSIGNER_DATA_WITH_OVERRIDES,
                    exclusiveFiller,
                },
            }), CHAIN_ID);
            const resolved = order.resolve({
                currentBlock: BLOCK_NUMBER - 1,
                filler: exclusiveFiller,
            });
            (0, chai_1.expect)(resolved.input.token).eq(order.info.input.token);
            (0, chai_1.expect)(resolved.input.amount).eq(order.info.cosignerData.inputOverride);
            (0, chai_1.expect)(resolved.outputs.length).eq(1);
            (0, chai_1.expect)(resolved.outputs[0].token).eq(order.info.outputs[0].token);
            (0, chai_1.expect)(resolved.outputs[0].amount).eq(order.info.cosignerData.outputOverrides[0]);
        });
    });
});
//# sourceMappingURL=V3DutchOrder.test.js.map