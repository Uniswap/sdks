"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const builder_1 = require("../builder");
const constants_1 = require("../constants");
const order_1 = require("../order");
const order_2 = require("./order");
describe("order utils", () => {
    let dutchOrder;
    let dutchOrderExactOut;
    let cosignedV2DutchOrder;
    let unsignedV2DutchOrder;
    let unsignedV3DutchOrder;
    let cosignedV3DutchOrder;
    let unsignedPriorityOrder;
    let cosignedPriorityOrder;
    let limitOrder;
    let relayOrder;
    let chainId;
    let priorityChainId;
    let blockBasedChainId;
    const uniswapXOrderParser = new order_2.UniswapXOrderParser();
    const relayOrderParser = new order_2.RelayOrderParser();
    beforeAll(() => {
        chainId = 1;
        priorityChainId = 8453;
        blockBasedChainId = 42161;
        const dutchBuilder = new builder_1.DutchOrderBuilder(chainId);
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        const input = {
            token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            startAmount: ethers_1.BigNumber.from("1000000"),
            endAmount: ethers_1.BigNumber.from("1000000"),
        };
        dutchOrder = dutchBuilder
            .deadline(deadline)
            .decayEndTime(deadline)
            .decayStartTime(deadline - 100)
            .swapper("0x0000000000000000000000000000000000000001")
            .nonce(ethers_1.BigNumber.from(100))
            .input(input)
            .output({
            token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            startAmount: ethers_1.BigNumber.from("1000000000000000000"),
            endAmount: ethers_1.BigNumber.from("900000000000000000"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build();
        const dutchBuilderExactOut = new builder_1.DutchOrderBuilder(chainId);
        dutchOrderExactOut = dutchBuilderExactOut
            .deadline(deadline)
            .decayEndTime(deadline)
            .decayStartTime(deadline - 100)
            .swapper("0x0000000000000000000000000000000000000001")
            .nonce(ethers_1.BigNumber.from(100))
            .input({
            token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            startAmount: ethers_1.BigNumber.from("900000"),
            endAmount: ethers_1.BigNumber.from("1000000"),
        })
            .output({
            token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            startAmount: ethers_1.BigNumber.from("1000000000000000000"),
            endAmount: ethers_1.BigNumber.from("1000000000000000000"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build();
        const limitBuilder = new builder_1.DutchOrderBuilder(chainId);
        limitOrder = limitBuilder
            .deadline(deadline)
            .decayEndTime(deadline)
            .decayStartTime(deadline - 100)
            .swapper("0x0000000000000000000000000000000000000001")
            .nonce(ethers_1.BigNumber.from(100))
            .input(input)
            .output({
            token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            startAmount: ethers_1.BigNumber.from("1000000000000000000"),
            endAmount: ethers_1.BigNumber.from("1000000000000000000"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build();
        const relayBuilder = new builder_1.RelayOrderBuilder(chainId);
        relayOrder = relayBuilder
            .deadline(deadline)
            .swapper("0x0000000000000000000000000000000000000001")
            .nonce(ethers_1.BigNumber.from(100))
            .universalRouterCalldata("0x")
            .input({
            token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            amount: ethers_1.BigNumber.from("1000000"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .fee({
            token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            startAmount: ethers_1.BigNumber.from("1000000"),
            endAmount: ethers_1.BigNumber.from("1000000"),
            startTime: deadline - 100,
            endTime: deadline,
        })
            .build();
        const v2Builder = new builder_1.V2DutchOrderBuilder(chainId)
            .cosigner("0xe463635f6e73C1E595554C3ae216472D0fb929a9")
            .deadline(deadline)
            .decayEndTime(deadline)
            .decayStartTime(deadline - 100)
            .swapper(ethers_1.constants.AddressZero)
            .nonce(ethers_1.BigNumber.from(100))
            .input({
            token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            startAmount: ethers_1.BigNumber.from("1000000"),
            endAmount: ethers_1.BigNumber.from("1000000"),
        })
            .output({
            token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            startAmount: ethers_1.BigNumber.from("1000000000000000000"),
            endAmount: ethers_1.BigNumber.from("1000000000000000000"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .outputOverrides([ethers_1.BigNumber.from("100000000000000000000")]);
        unsignedV2DutchOrder = v2Builder.buildPartial();
        cosignedV2DutchOrder = v2Builder
            .cosignature("0x65c6470fea0e1ca7d204b6904d0c1b0b640d7e6dcd4be3065497756e163c0399288c3eea0fba9b31ed00f34ccffe389ec3027bcd764df9fa853eeae8f68c9beb1b")
            .build();
        const priorityBuilder = new builder_1.PriorityOrderBuilder(priorityChainId)
            .cosigner("0xe463635f6e73C1E595554C3ae216472D0fb929a9")
            .deadline(deadline)
            .swapper(ethers_1.constants.AddressZero)
            .nonce(ethers_1.BigNumber.from(100))
            .auctionStartBlock(ethers_1.BigNumber.from(123))
            .baselinePriorityFeeWei(ethers_1.BigNumber.from(0))
            .input({
            token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            amount: ethers_1.BigNumber.from("1000000"),
            mpsPerPriorityFeeWei: ethers_1.BigNumber.from(0),
        })
            .output({
            token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            amount: ethers_1.BigNumber.from("1000000000000000000"),
            mpsPerPriorityFeeWei: ethers_1.BigNumber.from(1),
            recipient: "0x0000000000000000000000000000000000000000",
        });
        unsignedPriorityOrder = priorityBuilder.buildPartial();
        cosignedPriorityOrder = priorityBuilder
            .cosignerData({
            auctionTargetBlock: ethers_1.BigNumber.from(123),
        })
            .cosignature("0x65c6470fea0e1ca7d204b6904d0c1b0b640d7e6dcd4be3065497756e163c0399288c3eea0fba9b31ed00f34ccffe389ec3027bcd764df9fa853eeae8f68c9beb1b")
            .build();
        const v3Builder = new builder_1.V3DutchOrderBuilder(blockBasedChainId)
            .cosigner("0xf4c37D77623D476F52225df3Bbe8a874209a1149")
            .deadline(deadline)
            .swapper(ethers_1.constants.AddressZero)
            .nonce(ethers_1.BigNumber.from(100))
            .startingBaseFee(ethers_1.BigNumber.from(0))
            .input({
            token: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
            startAmount: ethers_1.BigNumber.from("1000000"),
            curve: {
                relativeBlocks: [],
                relativeAmounts: [],
            },
            maxAmount: ethers_1.BigNumber.from("1000000"),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        })
            .output({
            token: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
            startAmount: ethers_1.BigNumber.from("1000000"),
            curve: {
                relativeBlocks: [4],
                relativeAmounts: [BigInt(4)],
            },
            recipient: ethers_1.constants.AddressZero,
            minAmount: ethers_1.BigNumber.from("1000000").sub(4),
            adjustmentPerGweiBaseFee: ethers_1.BigNumber.from(0),
        });
        unsignedV3DutchOrder = v3Builder.buildPartial();
        cosignedV3DutchOrder = v3Builder
            .cosignerData({
            decayStartBlock: 100,
            exclusiveFiller: ethers_1.constants.AddressZero,
            exclusivityOverrideBps: ethers_1.BigNumber.from(0),
            inputOverride: ethers_1.BigNumber.from(0),
            outputOverrides: [ethers_1.BigNumber.from(0)],
        })
            .cosignature("0x88a3d425308d71431b514826cbf9c74f713b57946b0a29f7d7e094ccf0ab562e270216a537b59210f1b5c87f5cc5662cd87dea5df7e699d92b061191bd2499c71b")
            .build();
    });
    describe("parseOrder", () => {
        it("parses DutchOrder with single output", () => {
            const encodedOrder = dutchOrder.serialize();
            expect(uniswapXOrderParser.parseOrder(encodedOrder, chainId)).toEqual(dutchOrder);
        });
        it("parses CosignedV2DutchOrder", () => {
            const encodedOrder = cosignedV2DutchOrder.serialize();
            expect(uniswapXOrderParser.parseOrder(encodedOrder, chainId)).toEqual(cosignedV2DutchOrder);
        });
        it("parses CosignedV2DutchOrder 2", () => {
            const FROM_ADDRESS = "0xabCd111111111111111111111111111111111111";
            const USDC_MAINNET_CHECKSUMMED_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
            const TIMESTAMP_SECONDS = 1660562791;
            const WETH_MAINNET_CHECKSUMMED_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
            const ENCODED_DUTCH_V2_ORDER = new builder_1.V2DutchOrderBuilder(1, "0x00000011F84B9aa48e5f8aA8B9897600006289Be")
                .decayStartTime(TIMESTAMP_SECONDS)
                .decayEndTime(TIMESTAMP_SECONDS)
                .input({
                token: WETH_MAINNET_CHECKSUMMED_ADDRESS,
                startAmount: ethers_1.BigNumber.from(10).pow(18).mul(2),
                endAmount: ethers_1.BigNumber.from(10).pow(18),
            })
                .output({
                token: USDC_MAINNET_CHECKSUMMED_ADDRESS,
                startAmount: ethers_1.BigNumber.from(10).pow(6).mul(3),
                endAmount: ethers_1.BigNumber.from(10).pow(6).mul(2),
                recipient: FROM_ADDRESS,
            })
                .nonce(ethers_1.BigNumber.from(1))
                .deadline(Math.floor(Date.now() / 1000 + 600))
                .swapper(FROM_ADDRESS)
                .inputOverride(ethers_1.BigNumber.from(10).pow(18).mul(2))
                .outputOverrides([ethers_1.BigNumber.from(10).pow(6).mul(3)])
                .exclusivityOverrideBps(ethers_1.BigNumber.from(0))
                .cosigner("0x0000000000000000000000000000000000000000")
                .cosignature("0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000")
                .cosignerData({
                decayStartTime: TIMESTAMP_SECONDS,
                decayEndTime: TIMESTAMP_SECONDS,
                exclusiveFiller: "0x0000000000000000000000000000000000000000",
                exclusivityOverrideBps: ethers_1.BigNumber.from(0),
                inputOverride: ethers_1.BigNumber.from(10).pow(18).mul(2),
                outputOverrides: [ethers_1.BigNumber.from(10).pow(6).mul(3)],
            })
                .build()
                .serialize();
            //Missing configuration for reactor: 0xabcd111111111111111111111111111111111111 (swapper)
            expect(uniswapXOrderParser.parseOrder(ENCODED_DUTCH_V2_ORDER, 1)).toEqual(order_1.CosignedV2DutchOrder.parse(ENCODED_DUTCH_V2_ORDER, 1));
        });
        it("parses DutchOrder with multiple outputs", () => {
            dutchOrder.info.outputs.push({
                token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                startAmount: ethers_1.BigNumber.from("100000000000000000"),
                endAmount: ethers_1.BigNumber.from("90000000000000000"),
                recipient: "0x0000000000000000000000000000000000000123",
            });
            const encodedOrder = dutchOrder.serialize();
            expect(uniswapXOrderParser.parseOrder(encodedOrder, chainId)).toEqual(dutchOrder);
        });
        it("parses RelayOrder", () => {
            const encodedOrder = relayOrder.serialize();
            expect(relayOrderParser.parseOrder(encodedOrder, chainId)).toEqual(relayOrder);
        });
        it("parses RelayOrder with universalRouterCalldata", () => {
            relayOrder.info.universalRouterCalldata =
                "0x0000000000000000000000000000000000000123";
            const encodedOrder = relayOrder.serialize();
            expect(relayOrderParser.parseOrder(encodedOrder, chainId)).toEqual(relayOrder);
        });
        it("parses CosignedV2DutchOrder", () => {
            const encodedOrder = cosignedV2DutchOrder.serialize();
            expect(uniswapXOrderParser.parseOrder(encodedOrder, chainId)).toEqual(cosignedV2DutchOrder);
        });
        it("parses UnsignedV2DutchOrder", () => {
            const encodedOrder = unsignedV2DutchOrder.serialize();
            expect(uniswapXOrderParser.parseOrder(encodedOrder, chainId)).toMatchObject(unsignedV2DutchOrder);
        });
        it("parses CosignedPriorityOrder", () => {
            const encodedOrder = cosignedPriorityOrder.serialize();
            expect(uniswapXOrderParser.parseOrder(encodedOrder, priorityChainId)).toEqual(cosignedPriorityOrder);
        });
        it("parses UnsignedPriorityOrder", () => {
            const encodedOrder = unsignedPriorityOrder.serialize();
            expect(uniswapXOrderParser.parseOrder(encodedOrder, priorityChainId)).toMatchObject(unsignedPriorityOrder);
        });
    });
    describe("getOrderType", () => {
        it("parses DutchOrder type", () => {
            expect(uniswapXOrderParser.getOrderType(dutchOrder)).toEqual(constants_1.OrderType.Dutch);
        });
        it("parses DutchOrder exact out type", () => {
            expect(uniswapXOrderParser.getOrderType(dutchOrderExactOut)).toEqual(constants_1.OrderType.Dutch);
        });
        it("parses LimitOrder type", () => {
            expect(uniswapXOrderParser.getOrderType(limitOrder)).toEqual(constants_1.OrderType.Limit);
        });
        it("parses RelayOrder type", () => {
            expect(relayOrderParser.getOrderType(relayOrder)).toEqual(constants_1.OrderType.Relay);
        });
        it("parses CosignedV2DutchOrder type", () => {
            expect(uniswapXOrderParser.getOrderType(cosignedV2DutchOrder)).toEqual(constants_1.OrderType.Dutch_V2);
        });
        it("parses UnsignedV2DutchOrder type", () => {
            expect(uniswapXOrderParser.getOrderType(unsignedV2DutchOrder)).toEqual(constants_1.OrderType.Dutch_V2);
        });
        it("parses CosignedPriorityOrder type", () => {
            expect(uniswapXOrderParser.getOrderType(cosignedPriorityOrder)).toEqual(constants_1.OrderType.Priority);
        });
        it("parses UnsignedPriorityOrder type", () => {
            expect(uniswapXOrderParser.getOrderType(unsignedPriorityOrder)).toEqual(constants_1.OrderType.Priority);
        });
        it("parses UnsignedV3DutchOrder type", () => {
            expect(uniswapXOrderParser.getOrderType(unsignedV3DutchOrder)).toEqual(constants_1.OrderType.Dutch_V3);
        });
        it("parses CosignedV3DutchOrder type", () => {
            expect(uniswapXOrderParser.getOrderType(cosignedV3DutchOrder)).toEqual(constants_1.OrderType.Dutch_V3);
        });
    });
    describe("getOrderTypeFromEncoded", () => {
        it("parses DutchOrder type", () => {
            expect(uniswapXOrderParser.getOrderTypeFromEncoded(dutchOrder.serialize(), chainId)).toEqual(constants_1.OrderType.Dutch);
        });
        it("parses DutchOrder exact out type", () => {
            expect(uniswapXOrderParser.getOrderTypeFromEncoded(dutchOrderExactOut.serialize(), chainId)).toEqual(constants_1.OrderType.Dutch);
        });
        it("parses LimitOrder type", () => {
            expect(uniswapXOrderParser.getOrderTypeFromEncoded(limitOrder.serialize(), chainId)).toEqual(constants_1.OrderType.Limit);
        });
        it("parses RelayOrder type", () => {
            expect(relayOrderParser.getOrderTypeFromEncoded(relayOrder.serialize(), chainId)).toEqual(constants_1.OrderType.Relay);
        });
        it("parses UnsignedV2DutchOrder type", () => {
            expect(uniswapXOrderParser.getOrderTypeFromEncoded(unsignedV2DutchOrder.serialize(), chainId)).toEqual(constants_1.OrderType.Dutch_V2);
        });
        it("parses CosignedV2DutchOrder type", () => {
            expect(uniswapXOrderParser.getOrderTypeFromEncoded(cosignedV2DutchOrder.serialize(), chainId)).toEqual(constants_1.OrderType.Dutch_V2);
        });
        it("parses UnsignedV3DutchOrder type", () => {
            expect(uniswapXOrderParser.getOrderTypeFromEncoded(unsignedV3DutchOrder.serialize(), blockBasedChainId)).toEqual(constants_1.OrderType.Dutch_V3);
        });
        it("parses CosignedV3DutchOrder type", () => {
            expect(uniswapXOrderParser.getOrderTypeFromEncoded(cosignedV3DutchOrder.serialize(), blockBasedChainId)).toEqual(constants_1.OrderType.Dutch_V3);
        });
        it("parses UnsignedPriorityOrder type", () => {
            expect(uniswapXOrderParser.getOrderTypeFromEncoded(unsignedPriorityOrder.serialize(), priorityChainId)).toEqual(constants_1.OrderType.Priority);
        });
        it("parses CosignedPriorityOrder type", () => {
            expect(uniswapXOrderParser.getOrderTypeFromEncoded(cosignedPriorityOrder.serialize(), priorityChainId)).toEqual(constants_1.OrderType.Priority);
        });
    });
});
//# sourceMappingURL=order.test.js.map