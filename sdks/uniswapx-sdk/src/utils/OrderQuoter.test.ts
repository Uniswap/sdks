import { Interface } from "@ethersproject/abi";
import { StaticJsonRpcProvider } from "@ethersproject/providers";
import { BigNumber, ethers } from "ethers";

import multicall2Abi from "../../abis/multicall2.json";
import { DutchOrderBuilder } from "../builder/DutchOrderBuilder";
import { OrderQuoter__factory, Permit2__factory } from "../contracts";

import { OrderValidation, SignedUniswapXOrder } from "./OrderQuoter";
import { OrderValidator } from "./OrderValidator";

const CHAIN_ID = 1;
const multicall2Interface = new Interface(multicall2Abi);
const permit2Interface = Permit2__factory.createInterface();
const quoterInterface = OrderQuoter__factory.createInterface();

// Revert payloads as the real contracts ABI-encode them, built from the Permit2 ABI the
// package ships rather than from hand-written selector strings
const INVALID_CONTRACT_SIGNATURE = permit2Interface.encodeErrorResult(
  "InvalidContractSignature"
);
const INVALID_SIGNATURE_LENGTH = permit2Interface.encodeErrorResult(
  "InvalidSignatureLength"
);
// A real Permit2 error that has no KNOWN_ERRORS mapping
const INSUFFICIENT_ALLOWANCE = permit2Interface.encodeErrorResult(
  "InsufficientAllowance",
  [1000]
);
// Error(string) as solmate's SafeTransferLib reverts with it
const TRANSFER_FROM_FAILED = ethers.utils.hexConcat([
  ethers.utils.id("Error(string)").slice(0, 10),
  ethers.utils.defaultAbiCoder.encode(["string"], ["TRANSFER_FROM_FAILED"]),
]);

type CallResult = { success: boolean; returnData: string };

// Fake provider answering the quoter multicall with one canned result per order
function fakeProvider(results: CallResult[]): StaticJsonRpcProvider {
  return {
    _isProvider: true,
    getNetwork: async () => ({ chainId: CHAIN_ID }),
    // non-empty so multicall goes through the deployed Multicall2 path
    getCode: async () => "0xdeadbeef",
    send: async (method: string) => {
      expect(method).toEqual("eth_call");
      return multicall2Interface.encodeFunctionResult("tryAggregate", [
        results.map(({ success, returnData }) => [success, returnData]),
      ]);
    },
  } as unknown as StaticJsonRpcProvider;
}

function signedOrder(): SignedUniswapXOrder {
  const deadline = Math.floor(Date.now() / 1000) + 1000;
  const order = new DutchOrderBuilder(CHAIN_ID)
    .deadline(deadline)
    .decayEndTime(deadline)
    .decayStartTime(deadline - 100)
    .swapper("0x0000000000000000000000000000000000000001")
    .nonce(BigNumber.from(100))
    .input({
      token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      startAmount: BigNumber.from("1000000"),
      endAmount: BigNumber.from("1000000"),
    })
    .output({
      token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      startAmount: BigNumber.from("1000000000000000000"),
      endAmount: BigNumber.from("900000000000000000"),
      recipient: "0x0000000000000000000000000000000000000000",
    })
    .build();
  return { order, signature: "0x" + "11".repeat(65) };
}

function successfulQuote(signed: SignedUniswapXOrder): string {
  const { info } = signed.order;
  return quoterInterface.encodeFunctionResult("quote", [
    {
      info: {
        reactor: info.reactor,
        swapper: info.swapper,
        nonce: info.nonce,
        deadline: info.deadline,
        additionalValidationContract: ethers.constants.AddressZero,
        additionalValidationData: "0x",
      },
      input: {
        token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        amount: 1000000,
        maxAmount: 1000000,
      },
      outputs: [
        {
          token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
          amount: 950000000000000,
          recipient: "0x0000000000000000000000000000000000000002",
        },
      ],
      sig: signed.signature,
      hash: ethers.constants.HashZero,
    },
  ]);
}

function validatorFor(results: CallResult[]): OrderValidator {
  return new OrderValidator(fakeProvider(results), CHAIN_ID);
}

describe("OrderValidator", () => {
  describe("Permit2 signature reverts", () => {
    it("maps InvalidContractSignature to InvalidSignature", async () => {
      const validator = validatorFor([
        { success: false, returnData: INVALID_CONTRACT_SIGNATURE },
      ]);
      expect(await validator.validate(signedOrder())).toEqual(
        OrderValidation.InvalidSignature
      );
    });

    it("maps InvalidSignatureLength to InvalidSignature", async () => {
      const validator = validatorFor([
        { success: false, returnData: INVALID_SIGNATURE_LENGTH },
      ]);
      expect(await validator.validate(signedOrder())).toEqual(
        OrderValidation.InvalidSignature
      );
    });
  });

  it("still reports an unmapped revert as UnknownError", async () => {
    const validator = validatorFor([
      { success: false, returnData: INSUFFICIENT_ALLOWANCE },
    ]);
    expect(await validator.validate(signedOrder())).toEqual(
      OrderValidation.UnknownError
    );
  });
});

describe("UniswapXOrderQuoter validationErrorData", () => {
  it("exposes the raw revert data of an unknown revert", async () => {
    const validator = validatorFor([
      { success: false, returnData: INSUFFICIENT_ALLOWANCE },
    ]);
    const result = await validator.quote(signedOrder());

    expect(result.validation).toEqual(OrderValidation.UnknownError);
    expect(result.quote).toBeUndefined();
    // selector of InsufficientAllowance(uint256) followed by the uint256 1000;
    // written out by hand so the assertion does not depend on the encoder above
    expect(result.validationErrorData).toEqual(
      "0xf96fb071" +
        "00000000000000000000000000000000000000000000000000000000000003e8"
    );
  });

  it("exposes revert data undecoded for Error(string) reverts", async () => {
    const validator = validatorFor([
      { success: false, returnData: TRANSFER_FROM_FAILED },
    ]);
    const result = await validator.quote(signedOrder());

    expect(result.validation).toEqual(OrderValidation.InsufficientFunds);
    expect(result.validationErrorData).toEqual(TRANSFER_FROM_FAILED);
    expect(result.validationErrorData?.startsWith("0x08c379a0")).toBe(true);
  });

  it("omits the field when the quote succeeds", async () => {
    const signed = signedOrder();
    const validator = validatorFor([
      { success: true, returnData: successfulQuote(signed) },
    ]);
    const result = await validator.quote(signed);

    expect(result.validation).toEqual(OrderValidation.OK);
    expect(result.quote).toBeDefined();
    expect("validationErrorData" in result).toBe(false);
  });

  it("attributes revert data to the right order in a batch", async () => {
    const ok = signedOrder();
    const validator = validatorFor([
      { success: true, returnData: successfulQuote(ok) },
      { success: false, returnData: INVALID_CONTRACT_SIGNATURE },
      { success: false, returnData: INSUFFICIENT_ALLOWANCE },
    ]);

    const quotes = await validator.quoteBatch([
      ok,
      signedOrder(),
      signedOrder(),
    ]);

    expect(quotes.map((q) => q.validation)).toEqual([
      OrderValidation.OK,
      OrderValidation.InvalidSignature,
      OrderValidation.UnknownError,
    ]);
    expect(quotes.map((q) => q.validationErrorData)).toEqual([
      undefined,
      "0xb0669cbc",
      INSUFFICIENT_ALLOWANCE,
    ]);
    expect(
      await validator.validateBatch([ok, signedOrder(), signedOrder()])
    ).toEqual([
      OrderValidation.OK,
      OrderValidation.InvalidSignature,
      OrderValidation.UnknownError,
    ]);
  });
});
