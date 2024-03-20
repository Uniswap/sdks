import { BigNumber, ethers } from "ethers";

import {
  CosignedV2DutchOrder,
  CosignedV2DutchOrderInfo,
  UnsignedV2DutchOrder,
  UnsignedV2DutchOrderInfo,
} from "./V2DutchOrder";

const NOW = Math.floor(new Date().getTime() / 1000);
const RAW_AMOUNT = BigNumber.from("1000000");
const INPUT_TOKEN = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const OUTPUT_TOKEN = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const COSIGNER_DATA = {
  decayStartTime: NOW,
  decayEndTime: NOW + 1000,
  exclusiveFiller: ethers.constants.AddressZero,
  exclusivityOverrideBps: BigNumber.from(0),
  inputOverride: RAW_AMOUNT,
  outputOverrides: [RAW_AMOUNT.mul(102).div(100)],
};

describe("V2DutchOrder", () => {
  const getFullOrderInfo = (
    data: Partial<CosignedV2DutchOrderInfo>
  ): CosignedV2DutchOrderInfo => {
    return Object.assign(
      {
        deadline: NOW + 1000,
        reactor: ethers.constants.AddressZero,
        swapper: ethers.constants.AddressZero,
        nonce: BigNumber.from(10),
        additionalValidationContract: ethers.constants.AddressZero,
        additionalValidationData: "0x",
        cosigner: ethers.constants.AddressZero,
        cosignerData: COSIGNER_DATA,
        input: {
          token: INPUT_TOKEN,
          startAmount: RAW_AMOUNT,
          endAmount: RAW_AMOUNT,
        },
        outputs: [
          {
            token: OUTPUT_TOKEN,
            startAmount: RAW_AMOUNT,
            endAmount: RAW_AMOUNT.mul(90).div(100),
            recipient: ethers.constants.AddressZero,
          },
        ],
        cosignature: "0x",
      },
      data
    );
  };

  const getOrderInfo = (
    data: Partial<UnsignedV2DutchOrderInfo>
  ): UnsignedV2DutchOrderInfo => {
    return Object.assign(
      {
        deadline: NOW + 1000,
        reactor: ethers.constants.AddressZero,
        swapper: ethers.constants.AddressZero,
        nonce: BigNumber.from(10),
        additionalValidationContract: ethers.constants.AddressZero,
        additionalValidationData: "0x",
        cosigner: ethers.constants.AddressZero,
        cosignerData: undefined,
        input: {
          token: INPUT_TOKEN,
          startAmount: RAW_AMOUNT,
          endAmount: RAW_AMOUNT,
        },
        outputs: [
          {
            token: OUTPUT_TOKEN,
            startAmount: RAW_AMOUNT,
            endAmount: RAW_AMOUNT.mul(90).div(100),
            recipient: ethers.constants.AddressZero,
          },
        ],
        cosignature: undefined,
      },
      data
    );
  };

  it("parses a serialized order", () => {
    const orderInfo = getFullOrderInfo({});
    const order = new CosignedV2DutchOrder(orderInfo, 1);
    const serialized = order.serialize();
    const parsed = CosignedV2DutchOrder.parse(serialized, 1);
    expect(parsed.info).toEqual(orderInfo);
  });

  it("parses the inner v2 order with no cosignerOverrides", () => {
    const orderInfoJSON = {
      ...getOrderInfo({}),
      nonce: "10",
      input: {
        token: INPUT_TOKEN,
        startAmount: "1000000",
        endAmount: "1000000",
      },
      outputs: [
        {
          token: OUTPUT_TOKEN,
          startAmount: "1000000",
          endAmount: "900000",
          recipient: ethers.constants.AddressZero,
        },
      ],
      cosignerData: undefined,
    };
    const order = UnsignedV2DutchOrder.fromJSON(orderInfoJSON, 1);
    expect(order.info.input.startAmount).toEqual(BigNumber.from("1000000"));
    expect(order.info.outputs[0].startAmount).toEqual(
      BigNumber.from("1000000")
    );
  });

  it("valid signature over inner order", async () => {
    const fullOrderInfo = getFullOrderInfo({});
    const order = new UnsignedV2DutchOrder(fullOrderInfo, 1);
    const wallet = ethers.Wallet.createRandom();

    const { domain, types, values } = order.permitData();
    const signature = await wallet._signTypedData(domain, types, values);
    expect(order.getSigner(signature)).toEqual(await wallet.getAddress());
    const fullOrder = CosignedV2DutchOrder.fromUnsignedOrder(
      order,
      fullOrderInfo.cosignerData,
      fullOrderInfo.cosignature
    );
    expect(fullOrder.getSigner(signature)).toEqual(await wallet.getAddress());
  });

  it("validates cosignature over (hash || cosignerData)", async () => {
    const wallet = ethers.Wallet.createRandom();
    const orderInfo = getFullOrderInfo({
      cosigner: await wallet.getAddress(),
    });
    const order = new UnsignedV2DutchOrder(orderInfo, 1);
    const fullOrderHash = order.cosignatureHash(orderInfo.cosignerData);
    const cosignature = await wallet.signMessage(fullOrderHash);
    const signedOrder = CosignedV2DutchOrder.fromUnsignedOrder(
      order,
      COSIGNER_DATA,
      cosignature
    );

    expect(signedOrder.recoverCosigner()).toEqual(await wallet.getAddress());
  });

  describe("resolve", () => {
    it("resolves before decayStartTime", () => {
      const order = new CosignedV2DutchOrder(getFullOrderInfo({}), 1);
      const resolved = order.resolve({
        timestamp: order.info.cosignerData.decayStartTime - 100,
      });
      expect(resolved.input.token).toEqual(order.info.input.token);
      expect(resolved.input.amount).toEqual(
        order.info.cosignerData.inputOverride
      );
      expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
      expect(resolved.outputs[0].amount).toEqual(
        order.info.cosignerData.outputOverrides[0]
      );
    });

    it("resolves with original value when overrides == 0", () => {
      const order = new CosignedV2DutchOrder(
        getFullOrderInfo({
          cosignerData: {
            decayStartTime: Math.floor(new Date().getTime() / 1000),
            decayEndTime: Math.floor(new Date().getTime() / 1000) + 1000,
            exclusiveFiller: ethers.constants.AddressZero,
            exclusivityOverrideBps: BigNumber.from(0),
            inputOverride: BigNumber.from(0),
            outputOverrides: [BigNumber.from(0)],
          },
        }),
        1
      );
      const resolved = order.resolve({
        timestamp: order.info.cosignerData!.decayStartTime - 100,
      });
      expect(resolved.input.token).toEqual(order.info.input.token);
      expect(resolved.input.amount).toEqual(order.info.input.startAmount);
      expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
      expect(resolved.outputs[0].amount).toEqual(
        order.info.outputs[0].startAmount
      );
    });

    it("resolves at decayStartTime", () => {
      const order = new CosignedV2DutchOrder(getFullOrderInfo({}), 1);
      const resolved = order.resolve({
        timestamp: order.info.cosignerData.decayStartTime,
      });
      expect(resolved.input.token).toEqual(order.info.input.token);
      expect(resolved.input.amount).toEqual(
        order.info.cosignerData.inputOverride
      );

      expect(resolved.outputs.length).toEqual(1);
      expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
      expect(resolved.outputs[0].amount).toEqual(
        order.info.cosignerData.outputOverrides[0]
      );
    });

    it("resolves at decayEndTime", () => {
      const order = new CosignedV2DutchOrder(getFullOrderInfo({}), 1);
      const resolved = order.resolve({
        timestamp: order.info.cosignerData.decayEndTime,
      });
      expect(resolved.input.token).toEqual(order.info.input.token);
      expect(resolved.input.amount).toEqual(
        order.info.cosignerData.inputOverride
      );

      expect(resolved.outputs.length).toEqual(1);
      expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
      expect(resolved.outputs[0].amount).toEqual(
        order.info.outputs[0].endAmount
      );
    });

    it("resolves after decayEndTime", () => {
      const order = new CosignedV2DutchOrder(getFullOrderInfo({}), 1);
      const resolved = order.resolve({
        timestamp: order.info.cosignerData.decayEndTime + 100,
      });
      expect(resolved.input.token).toEqual(order.info.input.token);
      expect(resolved.input.amount).toEqual(
        order.info.cosignerData.inputOverride
      );

      expect(resolved.outputs.length).toEqual(1);
      expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
      expect(resolved.outputs[0].amount).toEqual(
        order.info.outputs[0].endAmount
      );
    });

    it("resolves when filler has exclusivity", () => {
      const exclusiveFiller = "0x0000000000000000000000000000000000000001";
      const order = new CosignedV2DutchOrder(
        getFullOrderInfo({
          cosignerData: {
            exclusiveFiller: exclusiveFiller,
            exclusivityOverrideBps: BigNumber.from(0),
            decayStartTime: Math.floor(new Date().getTime() / 1000),
            decayEndTime: Math.floor(new Date().getTime() / 1000) + 1000,
            inputOverride: RAW_AMOUNT,
            outputOverrides: [RAW_AMOUNT.mul(102).div(100)],
          },
        }),
        1
      );
      const resolved = order.resolve({
        timestamp: order.info.cosignerData.decayStartTime - 1,
        filler: exclusiveFiller,
      });
      expect(resolved.input.token).toEqual(order.info.input.token);
      expect(resolved.input.amount).toEqual(
        order.info.cosignerData.inputOverride
      );

      expect(resolved.outputs.length).toEqual(1);
      expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
      expect(resolved.outputs[0].amount).toEqual(
        order.info.cosignerData.outputOverrides[0]
      );
    });

    it("resolves when filler doesnt have exclusivity", () => {
      const nonExclusiveFiller = ethers.constants.AddressZero;
      const exclusiveFiller = "0x0000000000000000000000000000000000000001";
      const order = new CosignedV2DutchOrder(
        getFullOrderInfo({
          cosignerData: {
            exclusiveFiller,
            exclusivityOverrideBps: BigNumber.from(0),
            decayStartTime: Math.floor(new Date().getTime() / 1000),
            decayEndTime: Math.floor(new Date().getTime() / 1000) + 1000,
            inputOverride: RAW_AMOUNT,
            outputOverrides: [RAW_AMOUNT.mul(102).div(100)],
          },
        }),
        1
      );

      const resolved = order.resolve({
        timestamp: order.info.cosignerData.decayStartTime - 1,
        filler: nonExclusiveFiller,
      });
      expect(resolved.input.token).toEqual(order.info.input.token);
      expect(resolved.input.amount).toEqual(
        order.info.cosignerData.inputOverride
      );

      expect(resolved.outputs.length).toEqual(1);
      expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
      expect(resolved.outputs[0].amount).toEqual(
        order.info.cosignerData.outputOverrides[0]
      );
    });

    it("resolves when filler doesnt have exclusivity but decayStartTime is past", () => {
      const nonExclusiveFiller = ethers.constants.AddressZero;
      const exclusiveFiller = "0x0000000000000000000000000000000000000001";
      const order = new CosignedV2DutchOrder(
        getFullOrderInfo({
          cosignerData: {
            exclusiveFiller,
            exclusivityOverrideBps: BigNumber.from(0),
            decayStartTime: Math.floor(new Date().getTime() / 1000),
            decayEndTime: Math.floor(new Date().getTime() / 1000) + 1000,
            inputOverride: RAW_AMOUNT,
            outputOverrides: [RAW_AMOUNT.mul(102).div(100)],
          },
        }),
        1
      );
      const resolved = order.resolve({
        timestamp: order.info.cosignerData.decayEndTime,
        filler: nonExclusiveFiller,
      });
      expect(resolved.input.token).toEqual(order.info.input.token);
      expect(resolved.input.amount).toEqual(
        order.info.cosignerData.inputOverride
      );

      expect(resolved.outputs.length).toEqual(1);
      expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
      expect(resolved.outputs[0].amount).toEqual(
        order.info.outputs[0].endAmount
      );
    });

    it("resolves when filler is not set but there is exclusivity", () => {
      const exclusiveFiller = "0x0000000000000000000000000000000000000001";
      const order = new CosignedV2DutchOrder(
        getFullOrderInfo({
          cosignerData: {
            exclusiveFiller,
            exclusivityOverrideBps: BigNumber.from(0),
            decayStartTime: Math.floor(new Date().getTime() / 1000),
            decayEndTime: Math.floor(new Date().getTime() / 1000) + 1000,
            inputOverride: RAW_AMOUNT,
            outputOverrides: [RAW_AMOUNT.mul(102).div(100)],
          },
        }),
        1
      );
      const resolved = order.resolve({
        timestamp: order.info.cosignerData.decayStartTime - 1,
      });
      expect(resolved.input.token).toEqual(order.info.input.token);
      expect(resolved.input.amount).toEqual(
        order.info.cosignerData.inputOverride
      );

      expect(resolved.outputs.length).toEqual(1);
      expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
      expect(resolved.outputs[0].amount).toEqual(
        order.info.cosignerData.outputOverrides[0]
      );
    });
  });
});
