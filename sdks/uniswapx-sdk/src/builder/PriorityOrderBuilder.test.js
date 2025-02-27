"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const order_1 = require("../order");
const PriorityOrderBuilder_1 = require("./PriorityOrderBuilder");
const BLOCK = ethers_1.BigNumber.from(100);
const AMOUNT = ethers_1.BigNumber.from("1000000");
describe("PriorityOrderBuilder", () => {
    let builder;
    let order;
    beforeEach(() => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        builder = new PriorityOrderBuilder_1.PriorityOrderBuilder(1);
        order = builder
            .deadline(deadline)
            .swapper("0x0000000000000000000000000000000000000001")
            .nonce(ethers_1.BigNumber.from(100))
            .auctionStartBlock(BLOCK)
            .baselinePriorityFeeWei(ethers_1.BigNumber.from(0))
            .cosigner(ethers_1.constants.AddressZero)
            .input({
            token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            amount: AMOUNT,
            mpsPerPriorityFeeWei: ethers_1.BigNumber.from(0),
        })
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            amount: AMOUNT,
            mpsPerPriorityFeeWei: ethers_1.BigNumber.from(1),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .auctionTargetBlock(BLOCK.sub(2))
            .cosignature("0x")
            .build();
    });
    it("Builds a valid order", () => {
        expect(order.info.auctionStartBlock).toEqual(BLOCK);
        expect(order.info.cosignerData.auctionTargetBlock).toEqual(BLOCK.sub(2));
        expect(order.info.input.amount).toEqual(AMOUNT);
        expect(order.info.input.mpsPerPriorityFeeWei).toEqual(ethers_1.BigNumber.from(0));
        expect(order.info.outputs.length).toEqual(1);
        expect(order.info.outputs[0].amount).toEqual(AMOUNT);
        expect(order.info.outputs[0].mpsPerPriorityFeeWei).toEqual(ethers_1.BigNumber.from(1));
    });
    it("Regenerates builder from order", () => {
        const regenerated = PriorityOrderBuilder_1.PriorityOrderBuilder.fromOrder(order).build();
        expect(regenerated.toJSON()).toMatchObject(order.toJSON());
    });
    it("Regenerates builder from order json", () => {
        const json = order.toJSON();
        const regenerated = PriorityOrderBuilder_1.PriorityOrderBuilder.fromOrder(order_1.CosignedPriorityOrder.fromJSON(json, 1)).build();
        expect(regenerated.toJSON()).toMatchObject(order.toJSON());
    });
    it("Regenerates builder allows modification", () => {
        const regenerated = PriorityOrderBuilder_1.PriorityOrderBuilder.fromOrder(order)
            .auctionStartBlock(BLOCK.add(1))
            .build();
        expect(regenerated.info.auctionStartBlock).toEqual(order.info.auctionStartBlock.add(1));
    });
    it("Builds a valid order with multiple outputs", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        builder = new PriorityOrderBuilder_1.PriorityOrderBuilder(1);
        order = builder
            .deadline(deadline)
            .swapper("0x0000000000000000000000000000000000000001")
            .nonce(ethers_1.BigNumber.from(100))
            .auctionStartBlock(BLOCK)
            .baselinePriorityFeeWei(order.info.baselinePriorityFeeWei)
            .cosigner(order.info.cosigner)
            .cosignature(order.info.cosignature)
            .auctionTargetBlock(BLOCK.sub(2))
            .input({
            token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            amount: AMOUNT,
            mpsPerPriorityFeeWei: ethers_1.BigNumber.from(0),
        })
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            amount: AMOUNT,
            mpsPerPriorityFeeWei: ethers_1.BigNumber.from(1),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            amount: AMOUNT.div(10),
            mpsPerPriorityFeeWei: ethers_1.BigNumber.from(1),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build();
        expect(order.info.outputs.length).toEqual(2);
    });
    it("Must set input", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        builder = new PriorityOrderBuilder_1.PriorityOrderBuilder(1);
        expect(() => builder
            .deadline(deadline)
            .swapper("0x0000000000000000000000000000000000000001")
            .nonce(ethers_1.BigNumber.from(100))
            .auctionStartBlock(BLOCK)
            .baselinePriorityFeeWei(order.info.baselinePriorityFeeWei)
            .cosigner(order.info.cosigner)
            .cosignature(order.info.cosignature)
            .auctionTargetBlock(BLOCK.sub(2))
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            amount: ethers_1.BigNumber.from("100"),
            mpsPerPriorityFeeWei: ethers_1.BigNumber.from(1),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build()).toThrow("input not set");
    });
    it("Must set output(s)", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        builder = new PriorityOrderBuilder_1.PriorityOrderBuilder(1);
        expect(() => builder
            .deadline(deadline)
            .swapper("0x0000000000000000000000000000000000000001")
            .nonce(ethers_1.BigNumber.from(100))
            .auctionStartBlock(BLOCK)
            .baselinePriorityFeeWei(order.info.baselinePriorityFeeWei)
            .cosigner(order.info.cosigner)
            .cosignature(order.info.cosignature)
            .auctionTargetBlock(BLOCK.sub(2))
            .input({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            amount: ethers_1.BigNumber.from("100"),
            mpsPerPriorityFeeWei: ethers_1.BigNumber.from(1),
        })
            .build()).toThrow("outputs not set");
    });
    it("Must set auctionStartBlock", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        builder = new PriorityOrderBuilder_1.PriorityOrderBuilder(1);
        expect(() => builder
            .deadline(deadline)
            .swapper("0x0000000000000000000000000000000000000001")
            .nonce(ethers_1.BigNumber.from(100))
            .baselinePriorityFeeWei(order.info.baselinePriorityFeeWei)
            .cosigner(order.info.cosigner)
            .cosignature(order.info.cosignature)
            .auctionTargetBlock(BLOCK.sub(2))
            .input({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            amount: ethers_1.BigNumber.from("100"),
            mpsPerPriorityFeeWei: ethers_1.BigNumber.from(0),
        })
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            amount: ethers_1.BigNumber.from("100"),
            mpsPerPriorityFeeWei: ethers_1.BigNumber.from(1),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build()).toThrow("auctionStartBlock not set");
    });
    it("Must configure priority auction on either input or output", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        builder = new PriorityOrderBuilder_1.PriorityOrderBuilder(1);
        expect(() => builder
            .deadline(deadline)
            .swapper("0x0000000000000000000000000000000000000001")
            .nonce(ethers_1.BigNumber.from(100))
            .auctionStartBlock(BLOCK)
            .baselinePriorityFeeWei(order.info.baselinePriorityFeeWei)
            .cosigner(order.info.cosigner)
            .cosignature(order.info.cosignature)
            .auctionTargetBlock(BLOCK.sub(2))
            .input({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            amount: ethers_1.BigNumber.from("100"),
            mpsPerPriorityFeeWei: ethers_1.BigNumber.from(0),
        })
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            amount: ethers_1.BigNumber.from("100"),
            mpsPerPriorityFeeWei: ethers_1.BigNumber.from(0),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build()).toThrow("Priority auction not configured");
    });
    it("Cannot configure priority auction on both input and output", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        builder = new PriorityOrderBuilder_1.PriorityOrderBuilder(1);
        expect(() => builder
            .deadline(deadline)
            .swapper("0x0000000000000000000000000000000000000001")
            .nonce(ethers_1.BigNumber.from(100))
            .auctionStartBlock(BLOCK)
            .baselinePriorityFeeWei(order.info.baselinePriorityFeeWei)
            .cosigner(order.info.cosigner)
            .cosignature(order.info.cosignature)
            .auctionTargetBlock(BLOCK.sub(2))
            .input({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            amount: ethers_1.BigNumber.from("100"),
            mpsPerPriorityFeeWei: ethers_1.BigNumber.from(1),
        })
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            amount: ethers_1.BigNumber.from("100"),
            mpsPerPriorityFeeWei: ethers_1.BigNumber.from(1),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build()).toThrow("Can only configure priority auction on either input or output");
    });
});
//# sourceMappingURL=PriorityOrderBuilder.test.js.map