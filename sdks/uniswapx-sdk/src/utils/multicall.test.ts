import { Interface } from "@ethersproject/abi";
import { StaticJsonRpcProvider } from "@ethersproject/providers";
import { ethers } from "ethers";

import multicall2Abi from "../../abis/multicall2.json";
import { BlockOverrides } from "../order";

import { multicallOrdersPreservingOrder } from "./multicall";

const multicall2Interface = new Interface(multicall2Abi);
// Stand-in for the real quoter: one string param per order so each call can be
// traced back to the order that produced it
const quoterInterface = new Interface([
  "function quote(string id) returns (string)",
]);
const QUOTER_ADDRESS = "0x0000000000000000000000000000000000000001";

type TestOrder = {
  id: string;
  order: { blockOverrides: BlockOverrides };
};

// A Dutch/Relay-shaped order: never carries block overrides
const plain = (id: string): TestOrder => ({
  id,
  order: { blockOverrides: undefined },
});

// A Priority/Hybrid-shaped order: always carries block overrides
const overridden = (id: string, blockNumber: string): TestOrder => ({
  id,
  order: { blockOverrides: { number: blockNumber } },
});

type SentCall = {
  ids: string[];
  blockOverrides: BlockOverrides;
};

// Fake provider that decodes each eth_call back into the order ids it covers and
// echoes each id straight back as that call's returnData
function mockProvider(sent: SentCall[]): StaticJsonRpcProvider {
  return {
    // ethers rejects anything without this when connecting the Multicall2 contract
    _isProvider: true,
    getNetwork: async () => ({ chainId: 1 }),
    // non-empty so multicall takes the deployed Multicall2 path, whose calldata
    // is decodable here (the deployless path wraps calls in constructor args)
    getCode: async () => "0xdeadbeef",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    send: async (method: string, params: any[]) => {
      expect(method).toEqual("eth_call");
      const [, calls] = multicall2Interface.decodeFunctionData(
        "tryAggregate",
        params[0].data
      );
      const ids: string[] = calls.map(
        (call: { callData: string }) =>
          quoterInterface.decodeFunctionData("quote", call.callData)[0]
      );
      sent.push({ ids, blockOverrides: params[3] });

      return multicall2Interface.encodeFunctionResult("tryAggregate", [
        ids.map((id) => [
          true,
          ethers.utils.defaultAbiCoder.encode(["string"], [id]),
        ]),
      ]);
    },
  } as unknown as StaticJsonRpcProvider;
}

async function quoteIds(
  orders: TestOrder[],
  sent: SentCall[] = []
): Promise<string[]> {
  const results = await multicallOrdersPreservingOrder(
    mockProvider(sent),
    {
      address: QUOTER_ADDRESS,
      contractInterface: quoterInterface,
      functionName: "quote",
    },
    orders,
    (order) => [order.id]
  );

  return results.map(
    (result) =>
      ethers.utils.defaultAbiCoder.decode(["string"], result.returnData)[0]
  );
}

describe("multicallOrdersPreservingOrder", () => {
  describe("results line up with the input orders", () => {
    // Orders carrying block overrides are dispatched on separate eth_calls, so
    // any batch that interleaves the two kinds used to come back permuted
    const cases: { name: string; orders: TestOrder[] }[] = [
      { name: "empty batch", orders: [] },
      { name: "single plain order", orders: [plain("a")] },
      { name: "single overridden order", orders: [overridden("a", "0x64")] },
      { name: "all plain", orders: [plain("a"), plain("b"), plain("c")] },
      {
        name: "all overridden",
        orders: [
          overridden("a", "0x64"),
          overridden("b", "0x65"),
          overridden("c", "0x66"),
        ],
      },
      {
        name: "overridden first",
        orders: [overridden("a", "0x64"), plain("b")],
      },
      {
        name: "plain first",
        orders: [plain("a"), overridden("b", "0x64")],
      },
      {
        name: "overridden last of many",
        orders: [plain("a"), plain("b"), overridden("c", "0x64")],
      },
      {
        name: "overridden first of many",
        orders: [overridden("a", "0x64"), plain("b"), plain("c")],
      },
      {
        name: "overridden sandwiched",
        orders: [plain("a"), overridden("b", "0x64"), plain("c")],
      },
      {
        name: "interleaved",
        orders: [
          plain("a"),
          overridden("b", "0x64"),
          plain("c"),
          overridden("d", "0x65"),
          plain("e"),
        ],
      },
    ];

    for (const { name, orders } of cases) {
      it(name, async () => {
        expect(await quoteIds(orders)).toEqual(orders.map((o) => o.id));
      });
    }
  });

  it("quotes each overridden order at its own block", async () => {
    const sent: SentCall[] = [];
    await quoteIds(
      [plain("a"), overridden("b", "0x64"), overridden("c", "0x65")],
      sent
    );

    expect(
      sent.map(({ ids, blockOverrides }) => ({ ids, blockOverrides })).sort(
        (l, r) => l.ids[0].localeCompare(r.ids[0])
      )
    ).toEqual([
      { ids: ["a"], blockOverrides: undefined },
      { ids: ["b"], blockOverrides: { number: "0x64" } },
      { ids: ["c"], blockOverrides: { number: "0x65" } },
    ]);
  });

  it("batches every order without overrides into a single call", async () => {
    const sent: SentCall[] = [];
    await quoteIds([plain("a"), overridden("b", "0x64"), plain("c")], sent);

    expect(sent).toHaveLength(2);
    expect(sent.filter((call) => !call.blockOverrides)).toEqual([
      { ids: ["a", "c"], blockOverrides: undefined },
    ]);
  });

  it("skips the batched call when every order carries an override", async () => {
    const sent: SentCall[] = [];
    await quoteIds([overridden("a", "0x64"), overridden("b", "0x65")], sent);

    expect(sent).toHaveLength(2);
    expect(sent.every((call) => call.ids.length === 1)).toEqual(true);
  });

  it("makes no calls for an empty batch", async () => {
    const sent: SentCall[] = [];
    expect(await quoteIds([], sent)).toEqual([]);
    expect(sent).toHaveLength(0);
  });
});
