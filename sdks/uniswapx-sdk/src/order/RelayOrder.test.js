"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const RelayOrder_1 = require("./RelayOrder");
describe("RelayOrder", () => {
    const getOrderInfo = (data) => {
        const feeStartTime = Math.floor(new Date().getTime() / 1000);
        const feeEndTime = Math.floor(new Date().getTime() / 1000) + 1000;
        return Object.assign({
            deadline: feeEndTime,
            reactor: "0x0000000000000000000000000000000000000000",
            swapper: "0x0000000000000000000000000000000000000000",
            nonce: ethers_1.BigNumber.from(10),
            universalRouterCalldata: "0x",
            input: {
                token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                amount: ethers_1.BigNumber.from("1000000"),
                recipient: "0x0000000000000000000000000000000000000000",
            },
            fee: {
                token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                startAmount: ethers_1.BigNumber.from("1000000"),
                endAmount: ethers_1.BigNumber.from("1000000"),
                startTime: feeStartTime,
                endTime: feeEndTime,
            },
        }, data);
    };
    it("parses a serialized order", () => {
        const orderInfo = getOrderInfo({});
        const order = new RelayOrder_1.RelayOrder(orderInfo, 1);
        const serialized = order.serialize();
        const parsed = RelayOrder_1.RelayOrder.parse(serialized, 1);
        expect(parsed.info).toEqual(orderInfo);
    });
    it("valid signature over info", async () => {
        const order = new RelayOrder_1.RelayOrder(getOrderInfo({}), 1);
        const wallet = ethers_1.ethers.Wallet.createRandom();
        const { domain, types, values } = order.permitData();
        const signature = await wallet._signTypedData(domain, types, values);
        expect(order.getSigner(signature)).toEqual(await wallet.getAddress());
    });
    describe("resolve", () => {
        it("resolves before decayStartTime", () => {
            const order = new RelayOrder_1.RelayOrder(getOrderInfo({}), 1);
            const resolved = order.resolve({
                timestamp: order.info.fee.startTime - 100,
            });
            expect(resolved.fee.amount).toEqual(order.info.fee.startAmount);
        });
        it("resolves at decayStartTime", () => {
            const order = new RelayOrder_1.RelayOrder(getOrderInfo({}), 1);
            const resolved = order.resolve({ timestamp: order.info.fee.startTime });
            expect(resolved.fee.amount).toEqual(order.info.fee.startAmount);
        });
        it("resolves at decayEndTime", () => {
            const order = new RelayOrder_1.RelayOrder(getOrderInfo({}), 1);
            const resolved = order.resolve({
                timestamp: order.info.fee.endTime,
            });
            expect(resolved.fee.amount).toEqual(order.info.fee.endAmount);
        });
        it("resolves after decayEndTime", () => {
            const order = new RelayOrder_1.RelayOrder(getOrderInfo({}), 1);
            const resolved = order.resolve({
                timestamp: order.info.fee.endTime + 100,
            });
            expect(resolved.fee.amount).toEqual(order.info.fee.endAmount);
        });
    });
});
//# sourceMappingURL=RelayOrder.test.js.map