import { BigNumber, constants } from "ethers";

import {
  DutchOrderBuilder,
  RelayOrderBuilder,
  V2DutchOrderBuilder,
} from "../builder";
import { OrderType } from "../constants";
import {
  CosignedV2DutchOrder,
  DutchOrder,
  RelayOrder,
  UnsignedV2DutchOrder,
} from "../order";

import { RelayOrderParser, UniswapXOrderParser } from "./order";

describe("order utils", () => {
  let dutchOrder: DutchOrder;
  let dutchOrderExactOut: DutchOrder;
  let cosignedV2DutchOrder: CosignedV2DutchOrder;
  let unsignedV2DutchOrder: UnsignedV2DutchOrder;
  let limitOrder: DutchOrder;
  let relayOrder: RelayOrder;
  let chainId: number;

  const uniswapXOrderParser = new UniswapXOrderParser();
  const relayOrderParser = new RelayOrderParser();

  beforeAll(() => {
    chainId = 1;
    const dutchBuilder = new DutchOrderBuilder(chainId);
    const deadline = Math.floor(Date.now() / 1000) + 1000;
    const input = {
      token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      startAmount: BigNumber.from("1000000"),
      endAmount: BigNumber.from("1000000"),
    };
    dutchOrder = dutchBuilder
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline - 100)
      .swapper("0x0000000000000000000000000000000000000001")
      .nonce(BigNumber.from(100))
      .input(input)
      .output({
        token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("900000000000000000"),
        recipient: "0x0000000000000000000000000000000000000000",
      })
      .build();
    const dutchBuilderExactOut = new DutchOrderBuilder(chainId);
    dutchOrderExactOut = dutchBuilderExactOut
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline - 100)
      .swapper("0x0000000000000000000000000000000000000001")
      .nonce(BigNumber.from(100))
      .input({
        token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        startAmount: BigNumber.from("900000"),
        endAmount: BigNumber.from("1000000"),
      })
      .output({
        token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("1000000000000000000"),
        recipient: "0x0000000000000000000000000000000000000000",
      })
      .build();
    const limitBuilder = new DutchOrderBuilder(chainId);
    limitOrder = limitBuilder
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline - 100)
      .swapper("0x0000000000000000000000000000000000000001")
      .nonce(BigNumber.from(100))
      .input(input)
      .output({
        token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("1000000000000000000"),
        recipient: "0x0000000000000000000000000000000000000000",
      })
      .build();
    const relayBuilder = new RelayOrderBuilder(chainId);
    relayOrder = relayBuilder
      .deadline(deadline)
      .swapper("0x0000000000000000000000000000000000000001")
      .nonce(BigNumber.from(100))
      .universalRouterCalldata("0x")
      .input({
        token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        amount: BigNumber.from("1000000"),
        recipient: "0x0000000000000000000000000000000000000000",
      })
      .fee({
        token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1000000"),
        startTime: deadline - 100,
        endTime: deadline,
      })
      .build();

    const v2Builder = new V2DutchOrderBuilder(chainId)
      .cosigner("0xe463635f6e73C1E595554C3ae216472D0fb929a9")
      .deadline(deadline)
      .decayEndTime(deadline)
      .decayStartTime(deadline - 100)
      .swapper(constants.AddressZero)
      .nonce(BigNumber.from(100))
      .input({
        token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        startAmount: BigNumber.from("1000000"),
        endAmount: BigNumber.from("1000000"),
      })
      .output({
        token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        startAmount: BigNumber.from("1000000000000000000"),
        endAmount: BigNumber.from("1000000000000000000"),
        recipient: "0x0000000000000000000000000000000000000000",
      })
      .outputOverrides([BigNumber.from("100000000000000000000")]);

    unsignedV2DutchOrder = v2Builder.buildPartial();

    cosignedV2DutchOrder = v2Builder
      .cosignature(
        "0x65c6470fea0e1ca7d204b6904d0c1b0b640d7e6dcd4be3065497756e163c0399288c3eea0fba9b31ed00f34ccffe389ec3027bcd764df9fa853eeae8f68c9beb1b"
      )
      .build();
  });

  describe("parseOrder", () => {
    it("parses DutchOrder with single output", () => {
      const encodedOrder = dutchOrder.serialize();
      expect(uniswapXOrderParser.parseOrder(encodedOrder, chainId)).toEqual(
        dutchOrder
      );
    });

    it("parses CosignedV2DutchOrder", () => {
      const encodedOrder = cosignedV2DutchOrder.serialize();
      expect(uniswapXOrderParser.parseOrder(encodedOrder, chainId)).toEqual(
        cosignedV2DutchOrder
      );
    });

    it("parses CosignedV2DutchOrder 2", () => {
      const FROM_ADDRESS = "0xabCd111111111111111111111111111111111111";
      const USDC_MAINNET_CHECKSUMMED_ADDRESS =
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

      const TIMESTAMP_SECONDS = 1660562791;
      const WETH_MAINNET_CHECKSUMMED_ADDRESS =
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

      const ENCODED_DUTCH_V2_ORDER = new V2DutchOrderBuilder(
        1,
        "0x3867393cC6EA7b0414C2c3e1D9fe7cEa987Fd066"
      )
        .decayStartTime(TIMESTAMP_SECONDS)
        .decayEndTime(TIMESTAMP_SECONDS)
        .input({
          token: WETH_MAINNET_CHECKSUMMED_ADDRESS,
          startAmount: BigNumber.from(10).pow(18).mul(2),
          endAmount: BigNumber.from(10).pow(18),
        })
        .output({
          token: USDC_MAINNET_CHECKSUMMED_ADDRESS,
          startAmount: BigNumber.from(10).pow(6).mul(3),
          endAmount: BigNumber.from(10).pow(6).mul(2),
          recipient: FROM_ADDRESS,
        })
        .nonce(BigNumber.from(1))
        .deadline(Math.floor(Date.now() / 1000 + 600))
        .swapper(FROM_ADDRESS)
        .inputOverride(BigNumber.from(10).pow(18).mul(2))
        .outputOverrides([BigNumber.from(10).pow(6).mul(3)])
        .exclusivityOverrideBps(BigNumber.from(0))
        .cosigner("0x0000000000000000000000000000000000000000")
        .cosignature(
          "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
        )
        .cosignerData({
          decayStartTime: TIMESTAMP_SECONDS,
          decayEndTime: TIMESTAMP_SECONDS,
          exclusiveFiller: "0x0000000000000000000000000000000000000000",
          exclusivityOverrideBps: BigNumber.from(0),
          inputOverride: BigNumber.from(10).pow(18).mul(2),
          outputOverrides: [BigNumber.from(10).pow(6).mul(3)],
        })
        .build()
        .serialize();

      //Missing configuration for reactor: 0xabcd111111111111111111111111111111111111 (swapper)
      expect(uniswapXOrderParser.parseOrder(ENCODED_DUTCH_V2_ORDER, 1)).toEqual(
        CosignedV2DutchOrder.parse(ENCODED_DUTCH_V2_ORDER, 1)
      );
    });

    it("parses DutchOrder with multiple outputs", () => {
      dutchOrder.info.outputs.push({
        token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        startAmount: BigNumber.from("100000000000000000"),
        endAmount: BigNumber.from("90000000000000000"),
        recipient: "0x0000000000000000000000000000000000000123",
      });
      const encodedOrder = dutchOrder.serialize();
      expect(uniswapXOrderParser.parseOrder(encodedOrder, chainId)).toEqual(
        dutchOrder
      );
    });

    it("parses RelayOrder", () => {
      const encodedOrder = relayOrder.serialize();
      expect(relayOrderParser.parseOrder(encodedOrder, chainId)).toEqual(
        relayOrder
      );
    });

    it("parses RelayOrder with universalRouterCalldata", () => {
      relayOrder.info.universalRouterCalldata =
        "0x0000000000000000000000000000000000000123";
      const encodedOrder = relayOrder.serialize();
      expect(relayOrderParser.parseOrder(encodedOrder, chainId)).toEqual(
        relayOrder
      );
    });

    it("parses CosignedV2DutchOrder", () => {
      const encodedOrder = cosignedV2DutchOrder.serialize();
      expect(uniswapXOrderParser.parseOrder(encodedOrder, chainId)).toEqual(
        cosignedV2DutchOrder
      );
    });

    it("parses UnsignedV2DutchOrder", () => {
      const encodedOrder = unsignedV2DutchOrder.serialize();
      expect(
        uniswapXOrderParser.parseOrder(encodedOrder, chainId)
      ).toMatchObject(unsignedV2DutchOrder);
    });
  });

  describe("getOrderType", () => {
    it("parses DutchOrder type", () => {
      expect(uniswapXOrderParser.getOrderType(dutchOrder)).toEqual(
        OrderType.Dutch
      );
    });
    it("parses DutchOrder exact out type", () => {
      expect(uniswapXOrderParser.getOrderType(dutchOrderExactOut)).toEqual(
        OrderType.Dutch
      );
    });
    it("parses LimitOrder type", () => {
      expect(uniswapXOrderParser.getOrderType(limitOrder)).toEqual(
        OrderType.Limit
      );
    });
    it("parses RelayOrder type", () => {
      expect(relayOrderParser.getOrderType(relayOrder)).toEqual(
        OrderType.Relay
      );
    });
    it("parses CosignedV2DutchOrder type", () => {
      expect(uniswapXOrderParser.getOrderType(cosignedV2DutchOrder)).toEqual(
        OrderType.Dutch_V2
      );
    });
    it("parses UnsignedV2DutchOrder type", () => {
      expect(uniswapXOrderParser.getOrderType(unsignedV2DutchOrder)).toEqual(
        OrderType.Dutch_V2
      );
    });
  });

  describe("getOrderTypeFromEncoded", () => {
    it("parses DutchOrder type", () => {
      expect(
        uniswapXOrderParser.getOrderTypeFromEncoded(
          dutchOrder.serialize(),
          chainId
        )
      ).toEqual(OrderType.Dutch);
    });
    it("parses DutchOrder exact out type", () => {
      expect(
        uniswapXOrderParser.getOrderTypeFromEncoded(
          dutchOrderExactOut.serialize(),
          chainId
        )
      ).toEqual(OrderType.Dutch);
    });
    it("parses LimitOrder type", () => {
      expect(
        uniswapXOrderParser.getOrderTypeFromEncoded(
          limitOrder.serialize(),
          chainId
        )
      ).toEqual(OrderType.Limit);
    });
    it("parses RelayOrder type", () => {
      expect(
        relayOrderParser.getOrderTypeFromEncoded(
          relayOrder.serialize(),
          chainId
        )
      ).toEqual(OrderType.Relay);
    });
    it("parses UnsignedV2DutchOrder type", () => {
      expect(
        uniswapXOrderParser.getOrderTypeFromEncoded(
          unsignedV2DutchOrder.serialize(),
          chainId
        )
      ).toEqual(OrderType.Dutch_V2);
    });
    it("parses CosignedV2DutchOrder type", () => {
      expect(
        uniswapXOrderParser.getOrderTypeFromEncoded(
          cosignedV2DutchOrder.serialize(),
          chainId
        )
      ).toEqual(OrderType.Dutch_V2);
    });
  });
});
