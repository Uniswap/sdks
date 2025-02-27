"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const DutchOrder_1 = require("../order/DutchOrder");
const validation_1 = require("../order/validation");
const DutchOrderBuilder_1 = require("./DutchOrderBuilder");
describe("DutchOrderBuilder", () => {
    let builder;
    beforeEach(() => {
        builder = new DutchOrderBuilder_1.DutchOrderBuilder(1);
    });
    it("Builds a valid order", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        const order = builder
            .deadline(deadline)
            .decayEndTime(deadline)
            .decayStartTime(deadline - 100)
            .swapper("0x0000000000000000000000000000000000000001")
            .nonce(ethers_1.BigNumber.from(100))
            .input({
            token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            startAmount: ethers_1.BigNumber.from("1000000"),
            endAmount: ethers_1.BigNumber.from("1000000"),
        })
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            startAmount: ethers_1.BigNumber.from("1000000000000000000"),
            endAmount: ethers_1.BigNumber.from("900000000000000000"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build();
        expect(order.info.decayStartTime).toEqual(deadline - 100);
        expect(order.info.outputs.length).toEqual(1);
    });
    it("Builds a valid order with validation", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        const fillerAddress = "0x1111111111111111111111111111111111111111";
        const additionalValidationContract = "0x2222222222222222222222222222222222222222";
        const timestamp = Math.floor(Date.now() / 1000) + 100;
        const validationInfo = (0, validation_1.encodeExclusiveFillerData)(fillerAddress, timestamp, 1, additionalValidationContract);
        const order = builder
            .deadline(deadline)
            .decayEndTime(deadline)
            .decayStartTime(deadline - 100)
            .swapper("0x0000000000000000000000000000000000000001")
            .nonce(ethers_1.BigNumber.from(100))
            .input({
            token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            startAmount: ethers_1.BigNumber.from("1000000"),
            endAmount: ethers_1.BigNumber.from("1000000"),
        })
            .validation(validationInfo)
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            startAmount: ethers_1.BigNumber.from("1000000000000000000"),
            endAmount: ethers_1.BigNumber.from("900000000000000000"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build();
        expect(order.info.decayStartTime).toEqual(deadline - 100);
        expect(order.info.outputs.length).toEqual(1);
        expect(order.validation).toEqual({
            type: validation_1.ValidationType.ExclusiveFiller,
            data: {
                filler: fillerAddress,
                lastExclusiveTimestamp: timestamp,
            },
        });
    });
    it("Regenerates builder from order", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        const fillerAddress = "0x1111111111111111111111111111111111111111";
        const additionalValidationContract = "0x2222222222222222222222222222222222222222";
        const timestamp = Math.floor(Date.now() / 1000) + 100;
        const validationInfo = (0, validation_1.encodeExclusiveFillerData)(fillerAddress, timestamp, 1, additionalValidationContract);
        const order = builder
            .deadline(deadline)
            .decayEndTime(deadline)
            .decayStartTime(deadline - 100)
            .swapper("0x0000000000000000000000000000000000000001")
            .nonce(ethers_1.BigNumber.from(100))
            .input({
            token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            startAmount: ethers_1.BigNumber.from("1000000"),
            endAmount: ethers_1.BigNumber.from("1000000"),
        })
            .validation(validationInfo)
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            startAmount: ethers_1.BigNumber.from("1000000000000000000"),
            endAmount: ethers_1.BigNumber.from("900000000000000000"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build();
        const regenerated = DutchOrderBuilder_1.DutchOrderBuilder.fromOrder(order).build();
        expect(regenerated.toJSON()).toMatchObject(order.toJSON());
    });
    it("Regenerates builder from order json", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        const fillerAddress = "0x1111111111111111111111111111111111111111";
        const additionalValidationContract = "0x2222222222222222222222222222222222222222";
        const timestamp = Math.floor(Date.now() / 1000) + 100;
        const validationInfo = (0, validation_1.encodeExclusiveFillerData)(fillerAddress, timestamp, 1, additionalValidationContract);
        const order = builder
            .deadline(deadline)
            .decayEndTime(deadline)
            .decayStartTime(deadline - 100)
            .swapper("0x0000000000000000000000000000000000000001")
            .nonce(ethers_1.BigNumber.from(100))
            .input({
            token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            startAmount: ethers_1.BigNumber.from("1000000"),
            endAmount: ethers_1.BigNumber.from("1000000"),
        })
            .validation(validationInfo)
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            startAmount: ethers_1.BigNumber.from("1000000000000000000"),
            endAmount: ethers_1.BigNumber.from("900000000000000000"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build();
        const json = order.toJSON();
        const regenerated = DutchOrderBuilder_1.DutchOrderBuilder.fromOrder(DutchOrder_1.DutchOrder.fromJSON(json, 1)).build();
        expect(regenerated.toJSON()).toMatchObject(order.toJSON());
    });
    it("Regenerates builder allows modification", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        const fillerAddress = "0x1111111111111111111111111111111111111111";
        const additionalValidationContract = "0x2222222222222222222222222222222222222222";
        const timestamp = Math.floor(Date.now() / 1000) + 100;
        const validationInfo = (0, validation_1.encodeExclusiveFillerData)(fillerAddress, timestamp, 1, additionalValidationContract);
        const order = builder
            .deadline(deadline)
            .decayEndTime(deadline)
            .decayStartTime(deadline - 100)
            .swapper("0x0000000000000000000000000000000000000001")
            .nonce(ethers_1.BigNumber.from(100))
            .input({
            token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            startAmount: ethers_1.BigNumber.from("1000000"),
            endAmount: ethers_1.BigNumber.from("1000000"),
        })
            .validation(validationInfo)
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            startAmount: ethers_1.BigNumber.from("1000000000000000000"),
            endAmount: ethers_1.BigNumber.from("900000000000000000"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build();
        const regenerated = DutchOrderBuilder_1.DutchOrderBuilder.fromOrder(order)
            .decayStartTime(order.info.decayStartTime + 1)
            .build();
        expect(regenerated.info.decayStartTime).toEqual(order.info.decayStartTime + 1);
    });
    it("Builds a valid order with multiple outputs", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        const order = builder
            .deadline(deadline)
            .decayEndTime(deadline)
            .decayStartTime(deadline - 100)
            .swapper("0x0000000000000000000000000000000000000000")
            .nonce(ethers_1.BigNumber.from(100))
            .input({
            token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            startAmount: ethers_1.BigNumber.from("1000000"),
            endAmount: ethers_1.BigNumber.from("1000000"),
        })
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            startAmount: ethers_1.BigNumber.from("1000000000000000000"),
            endAmount: ethers_1.BigNumber.from("900000000000000000"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            startAmount: ethers_1.BigNumber.from("1000000000000000000"),
            endAmount: ethers_1.BigNumber.from("900000000000000000"),
            recipient: "0x0000000000000000000000000000000000000001",
        })
            .build();
        expect(order.info.decayStartTime).toEqual(deadline - 100);
        expect(order.info.outputs.length).toEqual(2);
    });
    it("startAmount <= endAmount", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() => builder
            .deadline(deadline)
            .decayEndTime(deadline)
            .decayStartTime(deadline - 100)
            .swapper("0x0000000000000000000000000000000000000001")
            .nonce(ethers_1.BigNumber.from(100))
            .input({
            token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            startAmount: ethers_1.BigNumber.from("1000000"),
            endAmount: ethers_1.BigNumber.from("1000000"),
        })
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            startAmount: ethers_1.BigNumber.from("100"),
            endAmount: ethers_1.BigNumber.from("110"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build()).toThrow("startAmount must be greater than endAmount: 100");
    });
    it("Deadline already passed", () => {
        const expiredDeadline = 1234;
        expect(() => builder.deadline(expiredDeadline)).not.toThrow();
        expect(() => builder
            .deadline(expiredDeadline)
            .decayEndTime(expiredDeadline)
            .decayStartTime(expiredDeadline - 100)
            .swapper("0x0000000000000000000000000000000000000001")
            .nonce(ethers_1.BigNumber.from(100))
            .input({
            token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            startAmount: ethers_1.BigNumber.from("1000000"),
            endAmount: ethers_1.BigNumber.from("1000000"),
        })
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            startAmount: ethers_1.BigNumber.from("100"),
            endAmount: ethers_1.BigNumber.from("90"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build()).toThrow(`Deadline must be in the future: ${expiredDeadline}`);
    });
    it("Start time must be before deadline", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        const order = builder
            .deadline(deadline)
            .decayStartTime(deadline + 1)
            .decayEndTime(deadline + 1)
            .swapper("0x0000000000000000000000000000000000000000")
            .nonce(ethers_1.BigNumber.from(100))
            .input({
            token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            startAmount: ethers_1.BigNumber.from("1000000"),
            endAmount: ethers_1.BigNumber.from("1200000"),
        })
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            startAmount: ethers_1.BigNumber.from("1000000000000000000"),
            endAmount: ethers_1.BigNumber.from("900000000000000000"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            startAmount: ethers_1.BigNumber.from("1000000000000000000"),
            endAmount: ethers_1.BigNumber.from("900000000000000000"),
            recipient: "0x0000000000000000000000000000000000000001",
        });
        expect(() => order.build()).toThrow(`decayStartTime must be before or same as deadline: ${deadline + 1}`);
    });
    it("Does not throw before an order has not been finished building", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() => builder.deadline(deadline).decayStartTime(deadline + 1)).not.toThrowError();
    });
    it("Unknown chainId", () => {
        const chainId = 99999999;
        expect(() => new DutchOrderBuilder_1.DutchOrderBuilder(chainId)).toThrow(`Missing configuration for reactor: ${chainId}`);
    });
    it("Must set swapper", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() => builder
            .deadline(deadline)
            .decayEndTime(deadline)
            .decayStartTime(deadline - 100)
            .nonce(ethers_1.BigNumber.from(100))
            .input({
            token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            startAmount: ethers_1.BigNumber.from("1000000"),
            endAmount: ethers_1.BigNumber.from("1000000"),
        })
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            startAmount: ethers_1.BigNumber.from("1000000000000000000"),
            endAmount: ethers_1.BigNumber.from("900000000000000000"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build()).toThrow("Invariant failed: swapper not set");
    });
    it("Must set deadline or decayEndTime", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() => builder
            .decayStartTime(deadline - 100)
            .swapper("0x0000000000000000000000000000000000000000")
            .nonce(ethers_1.BigNumber.from(100))
            .input({
            token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            startAmount: ethers_1.BigNumber.from("1000000"),
            endAmount: ethers_1.BigNumber.from("1000000"),
        })
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            startAmount: ethers_1.BigNumber.from("1000000000000000000"),
            endAmount: ethers_1.BigNumber.from("900000000000000000"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build()).toThrow("Invariant failed: decayEndTime not set");
    });
    it("decayEndTime defaults to deadline", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        const order = builder
            .decayStartTime(deadline - 100)
            .deadline(deadline)
            .swapper("0x0000000000000000000000000000000000000000")
            .nonce(ethers_1.BigNumber.from(100))
            .input({
            token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            startAmount: ethers_1.BigNumber.from("1000000"),
            endAmount: ethers_1.BigNumber.from("1000000"),
        })
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            startAmount: ethers_1.BigNumber.from("1000000000000000000"),
            endAmount: ethers_1.BigNumber.from("900000000000000000"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build();
        expect(order.info.decayEndTime).toEqual(deadline);
    });
    it("decayEndTime after deadline", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() => builder
            .decayStartTime(deadline - 100)
            .decayEndTime(deadline + 1)
            .deadline(deadline)
            .swapper("0x0000000000000000000000000000000000000000")
            .nonce(ethers_1.BigNumber.from(100))
            .input({
            token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            startAmount: ethers_1.BigNumber.from("1000000"),
            endAmount: ethers_1.BigNumber.from("1000000"),
        })
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            startAmount: ethers_1.BigNumber.from("1000000000000000000"),
            endAmount: ethers_1.BigNumber.from("900000000000000000"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build()).toThrow(`Invariant failed: decayEndTime must be before or same as deadline: ${deadline + 1}`);
    });
    it("deadline defaults to decayEndTime", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        const order = builder
            .decayStartTime(deadline - 100)
            .decayEndTime(deadline)
            .swapper("0x0000000000000000000000000000000000000000")
            .nonce(ethers_1.BigNumber.from(100))
            .input({
            token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            startAmount: ethers_1.BigNumber.from("1000000"),
            endAmount: ethers_1.BigNumber.from("1000000"),
        })
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            startAmount: ethers_1.BigNumber.from("1000000000000000000"),
            endAmount: ethers_1.BigNumber.from("900000000000000000"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build();
        expect(order.info.deadline).toEqual(deadline);
    });
    it("Must set nonce", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() => builder
            .deadline(deadline)
            .decayStartTime(deadline - 100)
            .swapper("0x0000000000000000000000000000000000000000")
            .input({
            token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            startAmount: ethers_1.BigNumber.from("1000000"),
            endAmount: ethers_1.BigNumber.from("1000000"),
        })
            .output({
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            startAmount: ethers_1.BigNumber.from("1000000000000000000"),
            endAmount: ethers_1.BigNumber.from("900000000000000000"),
            recipient: "0x0000000000000000000000000000000000000000",
        })
            .build()).toThrow("Invariant failed: nonce not set");
    });
});
//# sourceMappingURL=DutchOrderBuilder.test.js.map