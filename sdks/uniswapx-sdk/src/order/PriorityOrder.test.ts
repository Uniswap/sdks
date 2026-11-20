import { BigNumber, ethers } from "ethers";

import {
  CosignedPriorityOrder,
  CosignedPriorityOrderInfo,
  OrderNotFillable,
  //UnsignedPriorityOrder,
  //UnsignedPriorityOrderInfo,
} from "./PriorityOrder";

const BLOCK = BigNumber.from(100);

const NOW = Math.floor(new Date().getTime() / 1000);
const RAW_AMOUNT = BigNumber.from("1000000");
const INPUT_TOKEN = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const OUTPUT_TOKEN = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

describe("PriorityOrder", () => {
  const getFullOrderInfo = (
    data: Partial<CosignedPriorityOrderInfo>
  ): CosignedPriorityOrderInfo => {
    return Object.assign(
      {
        deadline: NOW + 1000,
        reactor: ethers.constants.AddressZero,
        swapper: ethers.constants.AddressZero,
        nonce: BigNumber.from(10),
        additionalValidationContract: ethers.constants.AddressZero,
        additionalValidationData: "0x",
        cosigner: ethers.constants.AddressZero,
        auctionStartBlock: BLOCK,
        baselinePriorityFeeWei: BigNumber.from(0),
        input: {
          token: INPUT_TOKEN,
          amount: RAW_AMOUNT,
          mpsPerPriorityFeeWei: BigNumber.from(0),
        },
        outputs: [
          {
            token: OUTPUT_TOKEN,
            amount: RAW_AMOUNT,
            mpsPerPriorityFeeWei: BigNumber.from(10),
            recipient: ethers.constants.AddressZero,
          },
        ],
        cosignerData: {
          auctionTargetBlock: BLOCK.sub(2),
        },
        cosignature: "0x",
      },
      data
    );
  };

  it("parses a serialized order", () => {
    const orderInfo = getFullOrderInfo({});
    const order = new CosignedPriorityOrder(orderInfo, 1);
    const serialized = order.serialize();
    const parsed = CosignedPriorityOrder.parse(serialized, 1);
    expect(parsed.info).toEqual(orderInfo);
  });

  it("valid signature over order", async () => {
    const fullOrderInfo = getFullOrderInfo({});
    const order = new CosignedPriorityOrder(fullOrderInfo, 1);
    const wallet = ethers.Wallet.createRandom();

    const { domain, types, values } = order.permitData();
    const signature = await wallet._signTypedData(domain, types, values);
    expect(order.getSigner(signature)).toEqual(await wallet.getAddress());
  });

  describe("resolve", () => {
    it("throws when resolving before auctionStartBlock and no cosigner is set (no override applies)", () => {
      // Default fixture has cosigner = AddressZero, so per PriorityOrderReactor.sol
      // the cosigned auctionTargetBlock never overrides auctionStartBlock, and the
      // only relevant check is against the signed auctionStartBlock itself.
      let order = new CosignedPriorityOrder(getFullOrderInfo({}), 1);
      expect(() =>
        order.resolve({
          priorityFee: BigNumber.from(1),
          currentBlock: BLOCK.sub(10),
        })
      ).toThrowError(new OrderNotFillable("Start block in the future"));

      order = new CosignedPriorityOrder(
        getFullOrderInfo({
          cosignerData: {
            auctionTargetBlock: BigNumber.from(0),
          },
        }),
        1
      );

      expect(() =>
        order.resolve({
          priorityFee: BigNumber.from(1),
          currentBlock: BLOCK.sub(1),
        })
      ).toThrowError(new OrderNotFillable("Start block in the future"));
    });

    it("applies the cosigned auctionTargetBlock override when a cosigner is set and target < start (matches PriorityOrderReactor.sol)", () => {
      // cosigner set, target (BLOCK - 30) < start (BLOCK), current (BLOCK - 20) is
      // between target and start: the reactor overrides auctionStartBlock with the
      // cosigned target and fills; the un-overridden SDK used to throw here.
      const order = new CosignedPriorityOrder(
        getFullOrderInfo({
          cosigner: "0x0000000000000000000000000000000000000001",
          cosignerData: { auctionTargetBlock: BLOCK.sub(30) },
        }),
        1
      );

      const resolved = order.resolve({
        priorityFee: BigNumber.from(1),
        currentBlock: BLOCK.sub(20),
      });
      expect(resolved.input.token).toEqual(order.info.input.token);
    });

    it("does not apply the override when the cosigned target is not before auctionStartBlock", () => {
      // cosigner set, but target (BLOCK + 50) is NOT before start (BLOCK), so no
      // override applies per the reactor; current (BLOCK - 1) is before the
      // (un-overridden) start, so it must still throw.
      const order = new CosignedPriorityOrder(
        getFullOrderInfo({
          cosigner: "0x0000000000000000000000000000000000000001",
          cosignerData: { auctionTargetBlock: BLOCK.add(50) },
        }),
        1
      );

      expect(() =>
        order.resolve({
          priorityFee: BigNumber.from(1),
          currentBlock: BLOCK.sub(1),
        })
      ).toThrowError(new OrderNotFillable("Start block in the future"));
    });

    it("resolves at currentBlock", () => {
      const order = new CosignedPriorityOrder(getFullOrderInfo({}), 1);
      const resolved = order.resolve({
        priorityFee: BigNumber.from(1),
        currentBlock: BLOCK,
      });
      expect(resolved.input.token).toEqual(order.info.input.token);
      expect(resolved.input.amount).toEqual(order.info.input.amount);
      expect(resolved.outputs[0].token).toEqual(order.info.outputs[0].token);
      expect(resolved.outputs[0].amount).toEqual(
        order.info.outputs[0].amount.add(1)
      );
    });
  });

  describe("recoverCosigner", () => {
    it("recovers the cosigner from a raw ecrecover-style signature (matches CosignerLib.sol)", async () => {
      const wallet = ethers.Wallet.createRandom();
      const orderInfo = getFullOrderInfo({
        cosigner: await wallet.getAddress(),
      });
      const order = new CosignedPriorityOrder(orderInfo, 1);
      const fullOrderHash = order.cosignatureHash(orderInfo.cosignerData);

      // Cosignatures are verified on-chain via raw `ecrecover` (CosignerLib.sol),
      // not EIP-191 `personal_sign` — sign with signDigest to match the reactor.
      const cosignature = ethers.utils.joinSignature(
        wallet._signingKey().signDigest(fullOrderHash)
      );

      const signedOrder = new CosignedPriorityOrder(
        { ...orderInfo, cosignature },
        1
      );

      expect(signedOrder.recoverCosigner()).toEqual(await wallet.getAddress());
    });
  });
});
