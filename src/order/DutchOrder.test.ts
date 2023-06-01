import { BigNumber, ethers } from "ethers";

import { DutchOrder, DutchOrderInfo } from "./DutchOrder";

describe("DutchOrder", () => {
  const getOrderInfo = (data: Partial<DutchOrderInfo>): DutchOrderInfo => {
    return Object.assign(
      {
        deadline: Math.floor(new Date().getTime() / 1000) + 1000,
        reactor: "0x0000000000000000000000000000000000000000",
        offerer: "0x0000000000000000000000000000000000000000",
        nonce: BigNumber.from(10),
        validationContract: ethers.constants.AddressZero,
        validationData: "0x",
        exclusiveFiller: ethers.constants.AddressZero,
        exclusivityOverrideBps: BigNumber.from(0),
        startTime: Math.floor(new Date().getTime() / 1000),
        endTime: Math.floor(new Date().getTime() / 1000) + 1000,
        input: {
          token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          startAmount: BigNumber.from("1000000"),
          endAmount: BigNumber.from("1000000"),
        },
        outputs: [
          {
            token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            startAmount: BigNumber.from("1000000000000000000"),
            endAmount: BigNumber.from("900000000000000000"),
            recipient: "0x0000000000000000000000000000000000000000",
          },
        ],
      },
      data
    );
  };

  it("parses a serialized order", () => {
    const orderInfo = getOrderInfo({});
    const order = new DutchOrder(orderInfo, 1);
    const serialized = order.serialize();
    const parsed = DutchOrder.parse(serialized, 1);
    expect(parsed.info).toEqual(orderInfo);
  });

  it("valid signature over info", async () => {
    const order = new DutchOrder(getOrderInfo({}), 1);
    const wallet = ethers.Wallet.createRandom();

    const { domain, types, values } = order.permitData();
    const signature = await wallet._signTypedData(domain, types, values);
    expect(order.getSigner(signature)).toEqual(await wallet.getAddress());
  });

  describe("resolve", () => {
    it("resolves before startTime", () => {
      const order = new DutchOrder(getOrderInfo({}), 1);
      const resolved = order.resolve({ timestamp: order.info.startTime - 100 });
      expect(resolved.input.token).toEqual(order.info.input.token);
      expect(resolved.input.amount).toEqual(order.info.input.startAmount);

      expect(resolved.outputs.length).toEqual(1);
      expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
      expect(resolved.outputs[0].amount).toEqual(
        order.info.outputs[0].startAmount
      );
    });

    it("resolves at startTime", () => {
      const order = new DutchOrder(getOrderInfo({}), 1);
      const resolved = order.resolve({ timestamp: order.info.startTime });
      expect(resolved.input.token).toEqual(order.info.input.token);
      expect(resolved.input.amount).toEqual(order.info.input.startAmount);

      expect(resolved.outputs.length).toEqual(1);
      expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
      expect(resolved.outputs[0].amount).toEqual(
        order.info.outputs[0].startAmount
      );
    });

    it("resolves at endTime", () => {
      const order = new DutchOrder(getOrderInfo({}), 1);
      const resolved = order.resolve({
        timestamp: order.info.endTime,
      });
      expect(resolved.input.token).toEqual(order.info.input.token);
      expect(resolved.input.amount).toEqual(order.info.input.endAmount);

      expect(resolved.outputs.length).toEqual(1);
      expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
      expect(resolved.outputs[0].amount).toEqual(
        order.info.outputs[0].endAmount
      );
    });

    it("resolves after endTime", () => {
      const order = new DutchOrder(getOrderInfo({}), 1);
      const resolved = order.resolve({
        timestamp: order.info.endTime + 100,
      });
      expect(resolved.input.token).toEqual(order.info.input.token);
      expect(resolved.input.amount).toEqual(order.info.input.endAmount);

      expect(resolved.outputs.length).toEqual(1);
      expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
      expect(resolved.outputs[0].amount).toEqual(
        order.info.outputs[0].endAmount
      );
    });

    it("resolves when filler has exclusivity", () => {
      const exclusiveFiller = "0x0000000000000000000000000000000000000001";
      const order = new DutchOrder(
        getOrderInfo({
          exclusiveFiller: exclusiveFiller,
          exclusivityOverrideBps: BigNumber.from(100),
        }),
        1
      );
      const resolved = order.resolve({
        timestamp: order.info.startTime - 1,
        filler: exclusiveFiller,
      });
      expect(resolved.input.token).toEqual(order.info.input.token);
      expect(resolved.input.amount).toEqual(order.info.input.startAmount);

      expect(resolved.outputs.length).toEqual(1);
      expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
      expect(resolved.outputs[0].amount).toEqual(
        order.info.outputs[0].startAmount
      );
    });

    it("resolves when filler doesnt have exclusivity", () => {
      const nonExclusiveFiller = "0x0000000000000000000000000000000000000000";
      const exclusiveFiller = "0x0000000000000000000000000000000000000001";
      const exclusivityOverrideBps = BigNumber.from(100);
      const order = new DutchOrder(
        getOrderInfo({
          exclusiveFiller,
          exclusivityOverrideBps,
        }),
        1
      );
      const resolved = order.resolve({
        timestamp: order.info.startTime - 1,
        filler: nonExclusiveFiller,
      });
      expect(resolved.input.token).toEqual(order.info.input.token);
      expect(resolved.input.amount).toEqual(order.info.input.startAmount);

      expect(resolved.outputs.length).toEqual(1);
      expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
      expect(resolved.outputs[0].amount).toEqual(
        order.info.outputs[0].startAmount
          .mul(exclusivityOverrideBps.add(10000))
          .div(10000)
      );
    });

    it("resolves when filler doesnt have exclusivity but startTime is past", () => {
      const nonExclusiveFiller = "0x0000000000000000000000000000000000000000";
      const exclusiveFiller = "0x0000000000000000000000000000000000000001";
      const exclusivityOverrideBps = BigNumber.from(100);
      const order = new DutchOrder(
        getOrderInfo({
          exclusiveFiller,
          exclusivityOverrideBps,
        }),
        1
      );
      const resolved = order.resolve({
        timestamp: order.info.endTime,
        filler: nonExclusiveFiller,
      });
      expect(resolved.input.token).toEqual(order.info.input.token);
      expect(resolved.input.amount).toEqual(order.info.input.startAmount);

      expect(resolved.outputs.length).toEqual(1);
      expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
      expect(resolved.outputs[0].amount).toEqual(
        order.info.outputs[0].endAmount
      );
    });

    it("resolves when filler is not set but there is exclusivity", () => {
      const exclusiveFiller = "0x0000000000000000000000000000000000000001";
      const exclusivityOverrideBps = BigNumber.from(100);
      const order = new DutchOrder(
        getOrderInfo({
          exclusiveFiller,
          exclusivityOverrideBps,
        }),
        1
      );
      const resolved = order.resolve({ timestamp: order.info.startTime - 1 });
      expect(resolved.input.token).toEqual(order.info.input.token);
      expect(resolved.input.amount).toEqual(order.info.input.startAmount);

      expect(resolved.outputs.length).toEqual(1);
      expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
      expect(resolved.outputs[0].amount).toEqual(
        order.info.outputs[0].startAmount
          .mul(exclusivityOverrideBps.add(10000))
          .div(10000)
      );
    });
  });
});
