import { BigNumber, ethers } from "ethers";
import { expect } from "chai";
import { CosignedV3DutchOrder, CosignedV3DutchOrderInfo, UnsignedV3DutchOrder, UnsignedV3DutchOrderInfoJSON } from "./V3DutchOrder";

const TIME= 1725379823;
const BLOCK_NUMBER = 20671221;
const RAW_AMOUNT = BigNumber.from("1000000");
const INPUT_TOKEN = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const OUTPUT_TOKEN = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const CHAIN_ID = 1;

const COSIGNER_DATA = {
    decayStartBlock: BLOCK_NUMBER,
    exclusiveFiller: ethers.constants.AddressZero,
    exclusivityOverrideBps: BigNumber.from(0),
    inputOverride: RAW_AMOUNT,
    outputOverrides: [RAW_AMOUNT.mul(102).div(100)]
};

describe("V3DutchOrder", () => {
    it("should get block number", () => {
        expect(BLOCK_NUMBER).to.be.greaterThan(0);
    });

    const getFullOrderInfo = ( data: Partial<CosignedV3DutchOrderInfo>): CosignedV3DutchOrderInfo => {
        return Object.assign(
            {
                reactor: ethers.constants.AddressZero,
                swapper: ethers.constants.AddressZero,
                nonce: BigNumber.from(21),
                deadline: TIME + 1000,
                additionalValidationContract: ethers.constants.AddressZero,
                additionalValidationData: "0x",
                cosigner: ethers.constants.AddressZero,
                cosignerData: COSIGNER_DATA,
                input: {
                    token: INPUT_TOKEN,
                    startAmount: RAW_AMOUNT,
                    curve: {
                        relativeBlocks: [1],
                        relativeAmount: [BigNumber.from(1), BigNumber.from(2), BigNumber.from(3), BigNumber.from(4)] // 1e-18, 2e-18, 3e-18, 4e-18
                    },
                    maxAmount: RAW_AMOUNT.add(1)
                },
                outputs: [
                    {
                        token: OUTPUT_TOKEN,
                        startAmount: RAW_AMOUNT,
                        curve: {
                            relativeBlocks: [1],
                            relativeAmount: [BigNumber.from(1), BigNumber.from(2), BigNumber.from(3), BigNumber.from(4)] // 1e-18, 2e-18, 3e-18, 4e-18
                        },
                        recipient: ethers.constants.AddressZero,
                    }
                ],
                cosignature: "0x",
                },
                data
            );
    };

    it("Parses a serialized v3 order", () => {
        const orderInfo = getFullOrderInfo({});
        const order = new CosignedV3DutchOrder(orderInfo, CHAIN_ID);
        const seralized = order.serialize();
        const parsed = CosignedV3DutchOrder.parse(seralized, CHAIN_ID);
        expect(parsed.info).to.deep.eq(orderInfo);
    }
    );

    it("parses inner v3 order with no cosigner overrides", () => {
        const orderInfoJSON : UnsignedV3DutchOrderInfoJSON = {
            ...getFullOrderInfo({}),
            nonce: "21",
            input: {
                token: INPUT_TOKEN,
                startAmount: "1000000",
                curve: {
                    relativeBlocks: [1],
                    relativeAmount: [BigNumber.from(1), BigNumber.from(2), BigNumber.from(3), BigNumber.from(4)]
                },
                maxAmount: "1000001"
            },
            outputs: [
                {
                    token: OUTPUT_TOKEN,
                    startAmount: "1000000",
                    curve: {
                        relativeBlocks: [1],
                        relativeAmount: [BigNumber.from(1), BigNumber.from(2), BigNumber.from(3), BigNumber.from(4)]
                    },
                    recipient: ethers.constants.AddressZero,
                }
            ]
        };
        const order = UnsignedV3DutchOrder.fromJSON(orderInfoJSON, CHAIN_ID);
        expect(order.info.input.startAmount.toString()).to.equal("1000000");
        expect(order.info.outputs[0].startAmount.toString()).to.eq("1000000");
    });

    it("valid signature over inner order", async () => {
        const fullOrderInfo = getFullOrderInfo({});
        const order = new UnsignedV3DutchOrder(fullOrderInfo, 1);
        const wallet = ethers.Wallet.createRandom();
    
        const { domain, types, values } = order.permitData();
        const signature = await wallet._signTypedData(domain, types, values);
        expect(order.getSigner(signature)).equal(await wallet.getAddress());
        const fullOrder = CosignedV3DutchOrder.fromUnsignedOrder(
          order,
          fullOrderInfo.cosignerData,
          fullOrderInfo.cosignature
        );
        expect(fullOrder.getSigner(signature)).equal(await wallet.getAddress());
      });

      it("validates cosignature over (hash || cosignerData)", async () => {
        const wallet = ethers.Wallet.createRandom();
        const orderInfo = getFullOrderInfo({
          cosigner: await wallet.getAddress(),
        });
        const order = new UnsignedV3DutchOrder(orderInfo, 1);
        const fullOrderHash = order.cosignatureHash(orderInfo.cosignerData);
        const cosignature = await wallet.signMessage(fullOrderHash);
        const signedOrder = CosignedV3DutchOrder.fromUnsignedOrder(
          order,
          COSIGNER_DATA,
          cosignature
        );
    
        expect(signedOrder.recoverCosigner()).equal(await wallet.getAddress());
      });

    
});