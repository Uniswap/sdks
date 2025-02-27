"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const V3DutchOrder_1 = require("../order/V3DutchOrder");
const validation_1 = require("../order/validation");
const V3DutchOrderBuilder_1 = require("./V3DutchOrderBuilder");
const INPUT_TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const OUTPUT_TOKEN = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const INPUT_START_AMOUNT = ethers_1.BigNumber.from("1000000");
const OUTPUT_START_AMOUNT = ethers_1.BigNumber.from("1000000000000000000");
describe("V3DutchOrderBuilder", () => {
    let builder;
    beforeEach(() => {
        builder = new V3DutchOrderBuilder_1.V3DutchOrderBuilder(1, ethers_1.constants.AddressZero);
    });
    it("Build a valid order", () => {
        const deadline = Date.now() + 1000;
        const order = builder
            .cosigner(ethers_1.constants.AddressZero)
            .cosignature("0x")
            .decayStartBlock(212121)
            .startingBaseFee(ethers_1.BigNumber.from(0))
            .input({
            token: INPUT_TOKEN,
            startAmount: INPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [],
                relativeAmounts: [],
            },
            maxAmount: INPUT_START_AMOUNT.add(1),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .output({
            token: OUTPUT_TOKEN,
            startAmount: OUTPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [4],
                relativeAmounts: [BigInt(4)],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: OUTPUT_START_AMOUNT.sub(4),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(ethers_1.constants.AddressZero)
            .nonce(ethers_1.BigNumber.from(100))
            .build();
        expect(order.info.cosignerData.decayStartBlock).toEqual(212121);
        expect(order.info.outputs.length).toEqual(1);
    });
    //TODO: Add tests that uses the validation contract once it is implemented
    it("Build a valid order with multiple outputs", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        const order = builder
            .cosigner(ethers_1.constants.AddressZero)
            .cosignature("0x")
            .deadline(deadline)
            .decayStartBlock(212121)
            .swapper(ethers_1.constants.AddressZero)
            .nonce(ethers_1.BigNumber.from(100))
            .startingBaseFee(ethers_1.BigNumber.from(0))
            .input({
            token: INPUT_TOKEN,
            startAmount: INPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [],
                relativeAmounts: [],
            },
            maxAmount: INPUT_START_AMOUNT.add(1),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .output({
            token: OUTPUT_TOKEN,
            startAmount: OUTPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [4],
                relativeAmounts: [BigInt(4)],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: OUTPUT_START_AMOUNT.sub(4),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .output({
            token: OUTPUT_TOKEN,
            startAmount: OUTPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [17],
                relativeAmounts: [BigInt(17)],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: OUTPUT_START_AMOUNT.sub(17),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT.mul(101).div(100), OUTPUT_START_AMOUNT])
            .build();
        expect(order.info.outputs.length).toEqual(2);
        expect(order.info.cosignerData.decayStartBlock).toEqual(212121);
    });
    it("Throw if cosigner is not set", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() => builder
            .cosignature("0x")
            .decayStartBlock(212121)
            .startingBaseFee(ethers_1.BigNumber.from(0))
            .input({
            token: INPUT_TOKEN,
            startAmount: INPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [],
                relativeAmounts: [],
            },
            maxAmount: INPUT_START_AMOUNT.add(1),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .output({
            token: OUTPUT_TOKEN,
            startAmount: OUTPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [4],
                relativeAmounts: [BigInt(4)],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: OUTPUT_START_AMOUNT.sub(4),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(ethers_1.constants.AddressZero)
            .nonce(ethers_1.BigNumber.from(100))
            .build()).toThrow("Invariant failed: cosigner not set");
    });
    it("Throw if relativeBlocks and relativeAmounts length mismatch in output", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() => builder
            .cosignature("0x")
            .cosigner(ethers_1.constants.AddressZero)
            .decayStartBlock(212121)
            .startingBaseFee(ethers_1.BigNumber.from(0))
            .input({
            token: INPUT_TOKEN,
            startAmount: INPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [1],
                relativeAmounts: [BigInt(1)],
            },
            maxAmount: INPUT_START_AMOUNT.add(1),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .output({
            token: OUTPUT_TOKEN,
            startAmount: OUTPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [4, 5],
                relativeAmounts: [BigInt(4)],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: OUTPUT_START_AMOUNT.sub(4),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(ethers_1.constants.AddressZero)
            .nonce(ethers_1.BigNumber.from(100))
            .build()).toThrow("Invariant failed: relativeBlocks and relativeAmounts length mismatch");
    });
    it("Throw if relativeBlocks and relativeAmounts length mismatch in input", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() => builder
            .cosignature("0x")
            .cosigner(ethers_1.constants.AddressZero)
            .decayStartBlock(212121)
            .startingBaseFee(ethers_1.BigNumber.from(0))
            .input({
            token: INPUT_TOKEN,
            startAmount: INPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [1],
                relativeAmounts: [BigInt(0), BigInt(1)],
            },
            maxAmount: INPUT_START_AMOUNT.add(1),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .output({
            token: OUTPUT_TOKEN,
            startAmount: OUTPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [4],
                relativeAmounts: [BigInt(4)],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: OUTPUT_START_AMOUNT.sub(4),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .inputOverride(ethers_1.BigNumber.from(0))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(ethers_1.constants.AddressZero)
            .nonce(ethers_1.BigNumber.from(100))
            .build()).toThrow("Invariant failed: relativeBlocks and relativeAmounts length mismatch");
    });
    it("Throw if relativeBlocks is not strictly increasing in input", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() => builder
            .cosignature("0x")
            .cosigner(ethers_1.constants.AddressZero)
            .decayStartBlock(212121)
            .startingBaseFee(ethers_1.BigNumber.from(0))
            .input({
            token: INPUT_TOKEN,
            startAmount: INPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [1, 2, 1],
                relativeAmounts: [BigInt(1), BigInt(2), BigInt(3)],
            },
            maxAmount: INPUT_START_AMOUNT.add(1),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .output({
            token: OUTPUT_TOKEN,
            startAmount: OUTPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [],
                relativeAmounts: [],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: OUTPUT_START_AMOUNT,
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .inputOverride(ethers_1.BigNumber.from(0))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .nonce(ethers_1.BigNumber.from(100))
            .swapper(ethers_1.constants.AddressZero)
            .build()).toThrow("Invariant failed: relativeBlocks not strictly increasing");
    });
    it("Throw if relativeBlocks is not strictly increasing in output", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() => builder
            .cosignature("0x")
            .cosigner(ethers_1.constants.AddressZero)
            .decayStartBlock(212121)
            .startingBaseFee(ethers_1.BigNumber.from(0))
            .input({
            token: INPUT_TOKEN,
            startAmount: INPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [],
                relativeAmounts: [],
            },
            maxAmount: INPUT_START_AMOUNT.add(1),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .output({
            token: OUTPUT_TOKEN,
            startAmount: OUTPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [5, 5],
                relativeAmounts: [BigInt(4), BigInt(22)],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: OUTPUT_START_AMOUNT.sub(5),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .nonce(ethers_1.BigNumber.from(100))
            .swapper(ethers_1.constants.AddressZero)
            .build()).toThrow("Invariant failed: relativeBlocks not strictly increasing");
    });
    it("Throw if swapper is not set", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() => builder
            .cosignature("0x")
            .cosigner(ethers_1.constants.AddressZero)
            .decayStartBlock(212121)
            .startingBaseFee(ethers_1.BigNumber.from(0))
            .input({
            token: INPUT_TOKEN,
            startAmount: INPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [],
                relativeAmounts: [],
            },
            maxAmount: INPUT_START_AMOUNT.add(1),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .output({
            token: OUTPUT_TOKEN,
            startAmount: OUTPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [4],
                relativeAmounts: [BigInt(4)],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: OUTPUT_START_AMOUNT.sub(4),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .nonce(ethers_1.BigNumber.from(100))
            .build()).toThrow("Invariant failed: swapper not set");
    });
    it("Deadline not set", () => {
        expect(() => builder
            .cosigner(ethers_1.constants.AddressZero)
            .cosignature("0x")
            .decayStartBlock(212121)
            .startingBaseFee(ethers_1.BigNumber.from(0))
            .input({
            token: INPUT_TOKEN,
            startAmount: INPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [],
                relativeAmounts: [],
            },
            maxAmount: INPUT_START_AMOUNT.add(1),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .output({
            token: OUTPUT_TOKEN,
            startAmount: OUTPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [4],
                relativeAmounts: [BigInt(4)],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: OUTPUT_START_AMOUNT.sub(4),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .swapper(ethers_1.constants.AddressZero)
            .nonce(ethers_1.BigNumber.from(100))
            .build()).toThrow("Invariant failed: deadline not set");
    });
    it("Nonce not set", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() => builder
            .cosignature("0x")
            .cosigner(ethers_1.constants.AddressZero)
            .decayStartBlock(212121)
            .startingBaseFee(ethers_1.BigNumber.from(0))
            .input({
            token: INPUT_TOKEN,
            startAmount: INPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [],
                relativeAmounts: [],
            },
            maxAmount: INPUT_START_AMOUNT.add(1),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .output({
            token: OUTPUT_TOKEN,
            startAmount: OUTPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [4],
                relativeAmounts: [BigInt(4)],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: OUTPUT_START_AMOUNT.sub(4),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(ethers_1.constants.AddressZero)
            // omitting nonce
            .build()).toThrow("Invariant failed: nonce not set");
    });
    it("Throw if startingBaseFee not set", () => {
        const deadline = Date.now() + 1000;
        expect(() => builder
            .cosigner(ethers_1.constants.AddressZero)
            .cosignature("0x")
            .decayStartBlock(212121)
            .input({
            token: INPUT_TOKEN,
            startAmount: INPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [],
                relativeAmounts: [],
            },
            maxAmount: INPUT_START_AMOUNT.add(1),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .output({
            token: OUTPUT_TOKEN,
            startAmount: OUTPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [4],
                relativeAmounts: [BigInt(4)],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: OUTPUT_START_AMOUNT.sub(4),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(ethers_1.constants.AddressZero)
            .nonce(ethers_1.BigNumber.from(100))
            .build()).toThrow("Invariant failed: startingBaseFee not set");
    });
    it("Throw if input is not set", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() => builder
            .cosignature("0x")
            .cosigner(ethers_1.constants.AddressZero)
            .decayStartBlock(212121)
            .startingBaseFee(ethers_1.BigNumber.from(0))
            // omitting input
            .output({
            token: OUTPUT_TOKEN,
            startAmount: OUTPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [4],
                relativeAmounts: [BigInt(4)],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: OUTPUT_START_AMOUNT.sub(4),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(ethers_1.constants.AddressZero)
            .nonce(ethers_1.BigNumber.from(100))
            .build()).toThrow("Invariant failed: input not set");
    });
    it("Throw if output is not set", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() => builder
            .cosignature("0x")
            .cosigner(ethers_1.constants.AddressZero)
            .decayStartBlock(212121)
            .startingBaseFee(ethers_1.BigNumber.from(0))
            .input({
            token: INPUT_TOKEN,
            startAmount: INPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [],
                relativeAmounts: [],
            },
            maxAmount: INPUT_START_AMOUNT.add(1),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            // omitting output
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(ethers_1.constants.AddressZero)
            .nonce(ethers_1.BigNumber.from(100))
            .build()).toThrow("Invariant failed: outputs not set");
    });
    it("Throw if inputOverride larger than input", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() => builder
            .cosignature("0x")
            .cosigner(ethers_1.constants.AddressZero)
            .decayStartBlock(212121)
            .startingBaseFee(ethers_1.BigNumber.from(0))
            .input({
            token: INPUT_TOKEN,
            startAmount: INPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [],
                relativeAmounts: [],
            },
            maxAmount: INPUT_START_AMOUNT.add(1),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .output({
            token: OUTPUT_TOKEN,
            startAmount: OUTPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [4],
                relativeAmounts: [BigInt(4)],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: OUTPUT_START_AMOUNT.sub(4),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .inputOverride(INPUT_START_AMOUNT.add(1))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(ethers_1.constants.AddressZero)
            .nonce(ethers_1.BigNumber.from(100))
            .build()).toThrow("Invariant failed: inputOverride larger than original input");
    });
    it("Throw if outputOverride smaller than output", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() => builder
            .cosignature("0x")
            .cosigner(ethers_1.constants.AddressZero)
            .decayStartBlock(212121)
            .startingBaseFee(ethers_1.BigNumber.from(0))
            .input({
            token: INPUT_TOKEN,
            startAmount: INPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [],
                relativeAmounts: [],
            },
            maxAmount: INPUT_START_AMOUNT.add(1),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .output({
            token: OUTPUT_TOKEN,
            startAmount: OUTPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [4],
                relativeAmounts: [BigInt(4)],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: OUTPUT_START_AMOUNT.sub(4),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT.sub(2121)])
            .deadline(deadline)
            .swapper(ethers_1.constants.AddressZero)
            .nonce(ethers_1.BigNumber.from(100))
            .build()).toThrow("Invariant failed: outputOverride smaller than original output");
    });
    it("Do not enforce endAmount < startAmount for V3", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() => builder
            .cosignature("0x")
            .cosigner(ethers_1.constants.AddressZero)
            .decayStartBlock(212121)
            .startingBaseFee(ethers_1.BigNumber.from(0))
            .input({
            token: INPUT_TOKEN,
            startAmount: INPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [],
                relativeAmounts: [],
            },
            maxAmount: INPUT_START_AMOUNT,
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .output({
            token: OUTPUT_TOKEN,
            startAmount: OUTPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [4],
                relativeAmounts: [BigInt(-4)],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: OUTPUT_START_AMOUNT.add(4),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .deadline(deadline)
            .outputOverrides([OUTPUT_START_AMOUNT])
            .swapper(ethers_1.constants.AddressZero)
            .nonce(ethers_1.BigNumber.from(100))
            .build()).not.toThrow();
    });
    it("Throw if deadline already passed", () => {
        const deadline = 2121;
        expect(() => builder
            .cosignature("0x")
            .cosigner(ethers_1.constants.AddressZero)
            .decayStartBlock(212121)
            .startingBaseFee(ethers_1.BigNumber.from(0))
            .input({
            token: INPUT_TOKEN,
            startAmount: INPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [],
                relativeAmounts: [],
            },
            maxAmount: INPUT_START_AMOUNT.add(1),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .output({
            token: OUTPUT_TOKEN,
            startAmount: OUTPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [4],
                relativeAmounts: [BigInt(4)],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: OUTPUT_START_AMOUNT.sub(4),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(ethers_1.constants.AddressZero)
            .nonce(ethers_1.BigNumber.from(100))
            .build()).toThrow("Invariant failed: Deadline must be in the future: 2121");
    });
    it("Does not throw before an order has not been finished building", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() => builder.deadline(deadline).decayStartBlock(21212121212121)).not.toThrowError();
    });
    it("Unknown chainId", () => {
        const chainId = 99999999;
        expect(() => new V3DutchOrderBuilder_1.V3DutchOrderBuilder(chainId)).toThrow(`Missing configuration for reactor: ${chainId}`);
    });
    it("Regenerate builder from order JSON", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        const fillerAddress = "0x1111111111111111111111111111111111111111";
        const additionalValidationContract = "0x2222222222222222222222222222222222222222";
        const timestamp = Math.floor(Date.now() / 1000) + 100;
        const validationInfo = (0, validation_1.encodeExclusiveFillerData)(fillerAddress, timestamp, 1, additionalValidationContract);
        const order = builder
            .cosigner(ethers_1.constants.AddressZero)
            .cosignature("0x")
            .decayStartBlock(212121)
            .startingBaseFee(ethers_1.BigNumber.from(0))
            .input({
            token: INPUT_TOKEN,
            startAmount: INPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [],
                relativeAmounts: [],
            },
            maxAmount: INPUT_START_AMOUNT.add(1),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .output({
            token: OUTPUT_TOKEN,
            startAmount: OUTPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [4],
                relativeAmounts: [BigInt(4)],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: OUTPUT_START_AMOUNT.sub(4),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(ethers_1.constants.AddressZero)
            .nonce(ethers_1.BigNumber.from(100))
            .validation(validationInfo)
            .build();
        const json = order.toJSON();
        const jsonToOrder = V3DutchOrder_1.CosignedV3DutchOrder.fromJSON(json, 1);
        const regeneratedBuilder = V3DutchOrderBuilder_1.V3DutchOrderBuilder.fromOrder(jsonToOrder);
        const regeneratedOrder = regeneratedBuilder.build();
        expect(regeneratedOrder.toJSON()).toMatchObject(order.toJSON());
    });
    it("Regenerate builder and modify", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        const fillerAddress = "0x1111111111111111111111111111111111111111";
        const additionalValidationContract = "0x2222222222222222222222222222222222222222";
        const timestamp = Math.floor(Date.now() / 1000) + 100;
        const validationInfo = (0, validation_1.encodeExclusiveFillerData)(fillerAddress, timestamp, 1, additionalValidationContract);
        const order = builder
            .cosigner(ethers_1.constants.AddressZero)
            .cosignature("0x")
            .decayStartBlock(212121)
            .startingBaseFee(ethers_1.BigNumber.from(0))
            .input({
            token: INPUT_TOKEN,
            startAmount: INPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [],
                relativeAmounts: [],
            },
            maxAmount: INPUT_START_AMOUNT.add(1),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .output({
            token: OUTPUT_TOKEN,
            startAmount: OUTPUT_START_AMOUNT,
            curve: {
                relativeBlocks: [4],
                relativeAmounts: [BigInt(4)],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: OUTPUT_START_AMOUNT.sub(4),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(ethers_1.constants.AddressZero)
            .nonce(ethers_1.BigNumber.from(100))
            .validation(validationInfo)
            .build();
        const regeneratedBuilder = V3DutchOrderBuilder_1.V3DutchOrderBuilder.fromOrder(order);
        regeneratedBuilder.decayStartBlock(214221422142);
        const regeneratedOrder = regeneratedBuilder.build();
        expect(regeneratedOrder.info.cosignerData.decayStartBlock).toEqual(214221422142);
    });
    describe("Partial order tests", () => {
        it("Test valid order with buildPartial", () => {
            const order = builder
                .cosigner(ethers_1.constants.AddressZero)
                .startingBaseFee(ethers_1.BigNumber.from(0))
                .input({
                token: INPUT_TOKEN,
                startAmount: INPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [],
                    relativeAmounts: [],
                },
                maxAmount: INPUT_START_AMOUNT.add(1),
                adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
            })
                .output({
                token: OUTPUT_TOKEN,
                startAmount: OUTPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigInt(4)],
                },
                recipient: ethers_1.constants.AddressZero,
                minAmount: OUTPUT_START_AMOUNT.sub(4),
                adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
            })
                .swapper(ethers_1.constants.AddressZero)
                .nonce(ethers_1.BigNumber.from(100))
                .deadline(Math.floor(Date.now() / 1000) + 1000)
                .buildPartial();
            expect(order.info.outputs.length).toEqual(1);
            expect(order.chainId).toBeDefined();
            expect(order.info.reactor).toBeDefined();
        });
        it("Test invalid order with buildPartial", () => {
            expect(() => builder
                .cosigner(ethers_1.constants.AddressZero)
                .startingBaseFee(ethers_1.BigNumber.from(0))
                .input({
                token: INPUT_TOKEN,
                startAmount: INPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [],
                    relativeAmounts: [],
                },
                maxAmount: INPUT_START_AMOUNT.add(1),
                adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
            })
                .output({
                token: OUTPUT_TOKEN,
                startAmount: OUTPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigInt(4)],
                },
                recipient: ethers_1.constants.AddressZero,
                minAmount: OUTPUT_START_AMOUNT.sub(4),
                adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
            })
                // omitting swapper
                .deadline(Math.floor(Date.now() / 1000) + 1000)
                .nonce(ethers_1.BigNumber.from(100))
                .buildPartial()).toThrow("Invariant failed: swapper not set");
        });
        it("Test maxAmountOut", () => {
            const startAmount = INPUT_START_AMOUNT;
            const relativeAmounts = [BigInt(0), BigInt(3), BigInt(-2), BigInt(-4), BigInt(-3)];
            const maxout = V3DutchOrderBuilder_1.V3DutchOrderBuilder.getMaxAmountOut(startAmount, relativeAmounts);
            expect(maxout).toEqual(startAmount.add(4));
        });
        it("Test maxAmountOut with empty curve", () => {
            const startAmount = INPUT_START_AMOUNT;
            const relativeAmounts = [];
            const maxout = V3DutchOrderBuilder_1.V3DutchOrderBuilder.getMaxAmountOut(startAmount, relativeAmounts);
            expect(maxout).toEqual(startAmount);
        });
        it("Test maxAmountOut with negative relativeAmounts", () => {
            const startAmount = INPUT_START_AMOUNT;
            const relativeAmounts = [BigInt(-1), BigInt(-2), BigInt(-3)];
            const maxout = V3DutchOrderBuilder_1.V3DutchOrderBuilder.getMaxAmountOut(startAmount, relativeAmounts);
            expect(maxout).toEqual(startAmount.add(3));
        });
        it("Test maxAmountOut with entirely positive relativeAmounts", () => {
            const startAmount = INPUT_START_AMOUNT;
            const relativeAmounts = [BigInt(1), BigInt(2), BigInt(3)];
            const maxout = V3DutchOrderBuilder_1.V3DutchOrderBuilder.getMaxAmountOut(startAmount, relativeAmounts);
            expect(maxout).toEqual(startAmount);
        });
        it("Test minAmountOut", () => {
            const startAmount = OUTPUT_START_AMOUNT;
            const relativeAmounts = [BigInt(0), BigInt(3), BigInt(-2), BigInt(-4), BigInt(-3)];
            const minout = V3DutchOrderBuilder_1.V3DutchOrderBuilder.getMinAmountOut(startAmount, relativeAmounts);
            expect(minout).toEqual(startAmount.sub(3));
        });
        it("Test minAmountOut with empty curve", () => {
            const startAmount = OUTPUT_START_AMOUNT;
            const relativeAmounts = [];
            const minout = V3DutchOrderBuilder_1.V3DutchOrderBuilder.getMinAmountOut(startAmount, relativeAmounts);
            expect(minout).toEqual(startAmount);
        });
        it("Test minAmountOut with negative relativeAmounts", () => {
            const startAmount = OUTPUT_START_AMOUNT;
            const relativeAmounts = [BigInt(-1), BigInt(-2), BigInt(-3)];
            const minout = V3DutchOrderBuilder_1.V3DutchOrderBuilder.getMinAmountOut(startAmount, relativeAmounts);
            expect(minout).toEqual(startAmount);
        });
        it("Test minAmountOut with entirely positive relativeAmounts", () => {
            const startAmount = OUTPUT_START_AMOUNT;
            const relativeAmounts = [BigInt(1), BigInt(2), BigInt(3)];
            const minout = V3DutchOrderBuilder_1.V3DutchOrderBuilder.getMinAmountOut(startAmount, relativeAmounts);
            expect(minout).toEqual(startAmount.sub(3));
        });
    });
    describe("fromOrder", () => {
        let builder;
        beforeEach(() => {
            builder = new V3DutchOrderBuilder_1.V3DutchOrderBuilder(1, ethers_1.constants.AddressZero);
        });
        it("should create a V3DutchOrderBuilder from an UnsignedV3DutchOrder", () => {
            const order = builder
                .cosigner(ethers_1.constants.AddressZero)
                .startingBaseFee(ethers_1.BigNumber.from(0))
                .input({
                token: INPUT_TOKEN,
                startAmount: INPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [],
                    relativeAmounts: [],
                },
                maxAmount: INPUT_START_AMOUNT.add(1),
                adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
            })
                .output({
                token: OUTPUT_TOKEN,
                startAmount: OUTPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigInt(4)],
                },
                recipient: ethers_1.constants.AddressZero,
                minAmount: OUTPUT_START_AMOUNT.sub(4),
                adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
            })
                .swapper(ethers_1.constants.AddressZero)
                .nonce(ethers_1.BigNumber.from(100))
                .deadline(Math.floor(Date.now() / 1000) + 1000)
                .buildPartial();
            const created_builder = V3DutchOrderBuilder_1.V3DutchOrderBuilder.fromOrder(order);
            const created_order = created_builder.buildPartial();
            expect(created_order.chainId).toEqual(1);
            expect(created_order.info.input.token).toEqual(INPUT_TOKEN);
            expect(created_order.info.outputs.length).toEqual(1);
        });
        it("should create a V3DutchOrderBuilder from a CosignedV3DutchOrder", () => {
            const deadline = Date.now() + 1000;
            const order = builder
                .cosigner(ethers_1.constants.AddressZero)
                .cosignature("0x")
                .decayStartBlock(212121)
                .startingBaseFee(ethers_1.BigNumber.from(0))
                .input({
                token: INPUT_TOKEN,
                startAmount: INPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [],
                    relativeAmounts: [],
                },
                maxAmount: INPUT_START_AMOUNT.add(1),
                adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
            })
                .output({
                token: OUTPUT_TOKEN,
                startAmount: OUTPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigInt(4)],
                },
                recipient: ethers_1.constants.AddressZero,
                minAmount: OUTPUT_START_AMOUNT.sub(4),
                adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
            })
                .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
                .outputOverrides([OUTPUT_START_AMOUNT])
                .deadline(deadline)
                .swapper(ethers_1.constants.AddressZero)
                .nonce(ethers_1.BigNumber.from(100))
                .build();
            const created_builder = V3DutchOrderBuilder_1.V3DutchOrderBuilder.fromOrder(order);
            const created_order = created_builder.build();
            expect(created_order.chainId).toEqual(1);
            expect(created_order.info.input.token).toEqual(INPUT_TOKEN);
            expect(created_order.info.outputs.length).toEqual(1);
            expect(created_order.info.cosignerData.decayStartBlock).toEqual(212121);
        });
    });
});
//# sourceMappingURL=V3DutchOrderBuilder.test.js.map