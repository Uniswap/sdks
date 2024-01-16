import { BigNumber, ethers } from "ethers";

import { V2DutchOrder, V2DutchOrderInfo } from "./V2DutchOrder";

const RAW_AMOUNT = BigNumber.from("1000000");
const INPUT_TOKEN = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const OUTPUT_TOKEN = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

describe("V2DutchOrder", () => {
  const getOrderInfo = (data: Partial<V2DutchOrderInfo>): V2DutchOrderInfo => {
    return Object.assign(
      {
        deadline: Math.floor(new Date().getTime() / 1000) + 1000,
        reactor: ethers.constants.AddressZero,
        swapper: ethers.constants.AddressZero,
        nonce: BigNumber.from(10),
        additionalValidationContract: ethers.constants.AddressZero,
        additionalValidationData: "0x",
        cosigner: ethers.constants.AddressZero,
        cosignerData: {
          decayStartTime: Math.floor(new Date().getTime() / 1000),
          decayEndTime: Math.floor(new Date().getTime() / 1000) + 1000,
          exclusiveFiller: ethers.constants.AddressZero,
          inputOverride: RAW_AMOUNT,
          outputOverrides: [RAW_AMOUNT.mul(102).div(100)],
        },
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

  it("parses a serialized order", () => {
    const orderInfo = getOrderInfo({});
    const order = new V2DutchOrder(orderInfo, 1);
    const serialized = order.serialize();
    const parsed = V2DutchOrder.parse(serialized, 1);
    expect(parsed.info).toEqual(orderInfo);
  });

  it("valid signature over inner order", async () => {
    const order = new V2DutchOrder(getOrderInfo({}), 1);
    const wallet = ethers.Wallet.createRandom();

    const { domain, types, values } = order.permitData();
    const signature = await wallet._signTypedData(domain, types, values);
    expect(order.getSigner(signature)).toEqual(await wallet.getAddress());
  });

  it("validates cosignature over (hash || cosignerData)", async () => {
    const wallet = ethers.Wallet.createRandom();
    const order = new V2DutchOrder(
      getOrderInfo({
        cosigner: await wallet.getAddress(),
      }),
      1
    );
    const fullOrderHash = order.hashFullOrder();
    const cosignature = await wallet.signMessage(fullOrderHash);
    expect(order.recoverCosigner(fullOrderHash, cosignature)).toEqual(
      await wallet.getAddress()
    );
  });

  describe("resolve", () => {
    it("resolves before decayStartTime", () => {
      const order = new V2DutchOrder(getOrderInfo({}), 1);
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
      const order = new V2DutchOrder(
        getOrderInfo({
          cosignerData: {
            decayStartTime: Math.floor(new Date().getTime() / 1000),
            decayEndTime: Math.floor(new Date().getTime() / 1000) + 1000,
            exclusiveFiller: ethers.constants.AddressZero,
            inputOverride: BigNumber.from(0),
            outputOverrides: [BigNumber.from(0)],
          },
        }),
        1
      );
      const resolved = order.resolve({
        timestamp: order.info.cosignerData.decayStartTime - 100,
      });
      expect(resolved.input.token).toEqual(order.info.input.token);
      expect(resolved.input.amount).toEqual(order.info.input.startAmount);
      expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
      expect(resolved.outputs[0].amount).toEqual(
        order.info.outputs[0].startAmount
      );
    });

    it("resolves at decayStartTime", () => {
      const order = new V2DutchOrder(getOrderInfo({}), 1);
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
      const order = new V2DutchOrder(getOrderInfo({}), 1);
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
      const order = new V2DutchOrder(getOrderInfo({}), 1);
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
      const order = new V2DutchOrder(
        getOrderInfo({
          cosignerData: {
            exclusiveFiller: exclusiveFiller,
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
      const order = new V2DutchOrder(
        getOrderInfo({
          cosignerData: {
            exclusiveFiller,
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
      const order = new V2DutchOrder(
        getOrderInfo({
          cosignerData: {
            exclusiveFiller,
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
      const order = new V2DutchOrder(
        getOrderInfo({
          cosignerData: {
            exclusiveFiller,
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
