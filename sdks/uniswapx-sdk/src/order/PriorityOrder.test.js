"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const PriorityOrder_1 = require("./PriorityOrder");
const BLOCK = ethers_1.BigNumber.from(100);
const NOW = Math.floor(new Date().getTime() / 1000);
const RAW_AMOUNT = ethers_1.BigNumber.from("1000000");
const INPUT_TOKEN = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const OUTPUT_TOKEN = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
describe("PriorityOrder", () => {
    const getFullOrderInfo = (data) => {
        return Object.assign({
            deadline: NOW + 1000,
            reactor: ethers_1.ethers.constants.AddressZero,
            swapper: ethers_1.ethers.constants.AddressZero,
            nonce: ethers_1.BigNumber.from(10),
            additionalValidationContract: ethers_1.ethers.constants.AddressZero,
            additionalValidationData: "0x",
            cosigner: ethers_1.ethers.constants.AddressZero,
            auctionStartBlock: BLOCK,
            baselinePriorityFeeWei: ethers_1.BigNumber.from(0),
            input: {
                token: INPUT_TOKEN,
                amount: RAW_AMOUNT,
                mpsPerPriorityFeeWei: ethers_1.BigNumber.from(0),
            },
            outputs: [
                {
                    token: OUTPUT_TOKEN,
                    amount: RAW_AMOUNT,
                    mpsPerPriorityFeeWei: ethers_1.BigNumber.from(10),
                    recipient: ethers_1.ethers.constants.AddressZero,
                },
            ],
            cosignerData: {
                auctionTargetBlock: BLOCK.sub(2),
            },
            cosignature: "0x",
        }, data);
    };
    it("parses a serialized order", () => {
        const orderInfo = getFullOrderInfo({});
        const order = new PriorityOrder_1.CosignedPriorityOrder(orderInfo, 1);
        const serialized = order.serialize();
        const parsed = PriorityOrder_1.CosignedPriorityOrder.parse(serialized, 1);
        expect(parsed.info).toEqual(orderInfo);
    });
    it("valid signature over order", async () => {
        const fullOrderInfo = getFullOrderInfo({});
        const order = new PriorityOrder_1.CosignedPriorityOrder(fullOrderInfo, 1);
        const wallet = ethers_1.ethers.Wallet.createRandom();
        const { domain, types, values } = order.permitData();
        const signature = await wallet._signTypedData(domain, types, values);
        expect(order.getSigner(signature)).toEqual(await wallet.getAddress());
    });
    describe("resolve", () => {
        it("throws when resolving if current block < auctionTargetBlock", () => {
            let order = new PriorityOrder_1.CosignedPriorityOrder(getFullOrderInfo({}), 1);
            expect(() => order.resolve({
                priorityFee: ethers_1.BigNumber.from(1),
                currentBlock: BLOCK.sub(10),
            })).toThrowError(new PriorityOrder_1.OrderNotFillable("Target block in the future"));
            order = new PriorityOrder_1.CosignedPriorityOrder(getFullOrderInfo({
                cosignerData: {
                    auctionTargetBlock: ethers_1.BigNumber.from(0),
                },
            }), 1);
            expect(() => order.resolve({
                priorityFee: ethers_1.BigNumber.from(1),
                currentBlock: BLOCK.sub(1),
            })).toThrowError(new PriorityOrder_1.OrderNotFillable("Start block in the future"));
        });
        it("resolves at currentBlock", () => {
            const order = new PriorityOrder_1.CosignedPriorityOrder(getFullOrderInfo({}), 1);
            const resolved = order.resolve({
                priorityFee: ethers_1.BigNumber.from(1),
                currentBlock: BLOCK,
            });
            expect(resolved.input.token).toEqual(order.info.input.token);
            expect(resolved.input.amount).toEqual(order.info.input.amount);
            expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
            expect(resolved.outputs[0].amount).toEqual(order.info.outputs[0].amount.add(1));
        });
    });
});
//# sourceMappingURL=PriorityOrder.test.js.map