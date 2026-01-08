import { hexStripZeros, SignatureLike } from "@ethersproject/bytes";
import {
  PermitTransferFrom,
  PermitTransferFromData,
  SignatureTransfer,
  Witness,
} from "@uniswap/permit2-sdk";
import { BigNumber, ethers } from "ethers";

import { BASE_SCALING_FACTOR } from "../../constants/v4";
import { getPermit2 } from "../../utils";
import { ResolvedUniswapXOrder } from "../../utils/OrderQuoter";
import { TokenAmount } from "../types";

import {
  hashHybridCosignerData,
  hashHybridOrder,
  HYBRID_ORDER_TYPES,
} from "./hashing";
import {
  BlockOverridesV4,
  CosignedHybridOrderInfo,
  CosignedHybridOrderInfoJSON,
  HybridCosignerData,
  HybridOrderResolutionOptions,
  UnsignedHybridOrderInfo,
  UnsignedHybridOrderInfoJSON,
} from "./types";

const ZERO_ADDRESS = ethers.constants.AddressZero;
const WAD = ethers.constants.WeiPerEther;
const MAX_UINT_240 = BigNumber.from(1).shl(240).sub(1);
const MAX_UINT_16 = 65535; // 2^16 - 1, max duration that fits in 16 bits
const PRICE_CURVE_DURATION_SHIFT = 240;

const HYBRID_ORDER_ABI = [
  "tuple(" +
    [
      "tuple(address,address,uint256,uint256,address,bytes,address,bytes,address)",
      "address",
      "tuple(address,uint256)",
      "tuple(address,uint256,address)[]",
      "uint256",
      "uint256",
      "uint256",
      "uint256[]",
      "tuple(uint256,uint256[])",
      "bytes",
    ].join(",") +
    ")",
];

export class OrderResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderResolutionError";
  }
}

export class HybridOrderPriceCurveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HybridOrderPriceCurveError";
  }
}

export class HybridOrderCosignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HybridOrderCosignatureError";
  }
}

/**
 * Parse a serialized HybridOrder
 */
function parseSerializedHybridOrder(encoded: string): {
  resolver: string;
  info: CosignedHybridOrderInfo;
} {
  const abiCoder = new ethers.utils.AbiCoder();

  // Step 1: Decode outer wrapper (resolver + orderData)
  const [resolver, orderData] = abiCoder.decode(
    ["address", "bytes"],
    encoded
  );

  // Step 2: Decode order structure
  const decoded = abiCoder.decode(HYBRID_ORDER_ABI, orderData);
  const [
    [
      [
        reactor,
        swapper,
        nonce,
        deadline,
        preExecutionHook,
        preExecutionHookData,
        postExecutionHook,
        postExecutionHookData,
        auctionResolver,
      ],
      cosigner,
      [inputToken, inputMaxAmount],
      outputs,
      auctionStartBlock,
      baselinePriorityFee,
      scalingFactor,
      priceCurve,
      [auctionTargetBlock, supplementalPriceCurve],
      cosignature,
    ],
  ] = decoded;

  return {
    resolver,
    info: {
      reactor,
      swapper,
      nonce,
      deadline: deadline.toNumber(),
      preExecutionHook,
      preExecutionHookData,
      postExecutionHook,
      postExecutionHookData,
      auctionResolver,
      cosigner,
      input: { token: inputToken, maxAmount: inputMaxAmount },
      outputs: outputs.map(
        ([token, minAmount, recipient]: [string, BigNumber, string]) => ({
          token,
          minAmount,
          recipient,
        })
      ),
      auctionStartBlock,
      baselinePriorityFee,
      scalingFactor,
      priceCurve: [...priceCurve],
      cosignerData: {
        auctionTargetBlock,
        supplementalPriceCurve: [...supplementalPriceCurve],
      },
      cosignature,
    },
  };
}

/**
 * Unsigned HybridOrder - base class without cosigner data
 */
export class UnsignedHybridOrder {
  public readonly permit2Address: string;

  constructor(
    public readonly info: UnsignedHybridOrderInfo,
    public readonly chainId: number,
    public readonly resolver: string,
    _permit2Address?: string
  ) {
    this.permit2Address = getPermit2(chainId, _permit2Address);
  }

  /**
   * Parse a serialized HybridOrder into an UnsignedHybridOrder
   */
  static parse(
    encoded: string,
    chainId: number,
    permit2?: string
  ): UnsignedHybridOrder {
    const { resolver, info } = parseSerializedHybridOrder(encoded);
    // Strip cosigner data for unsigned order
    const unsignedInfo: UnsignedHybridOrderInfo = {
      reactor: info.reactor,
      swapper: info.swapper,
      nonce: info.nonce,
      deadline: info.deadline,
      preExecutionHook: info.preExecutionHook,
      preExecutionHookData: info.preExecutionHookData,
      postExecutionHook: info.postExecutionHook,
      postExecutionHookData: info.postExecutionHookData,
      auctionResolver: info.auctionResolver,
      cosigner: info.cosigner,
      input: info.input,
      outputs: info.outputs,
      auctionStartBlock: info.auctionStartBlock,
      baselinePriorityFee: info.baselinePriorityFee,
      scalingFactor: info.scalingFactor,
      priceCurve: info.priceCurve,
    };
    return new UnsignedHybridOrder(unsignedInfo, chainId, resolver, permit2);
  }

  static fromJSON(
    json: UnsignedHybridOrderInfoJSON,
    chainId: number,
    resolver: string,
    _permit2Address?: string
  ): UnsignedHybridOrder {
    return new UnsignedHybridOrder(
      {
        reactor: json.reactor,
        swapper: json.swapper,
        nonce: BigNumber.from(json.nonce),
        deadline: json.deadline,
        preExecutionHook: json.preExecutionHook,
        preExecutionHookData: json.preExecutionHookData,
        postExecutionHook: json.postExecutionHook,
        postExecutionHookData: json.postExecutionHookData,
        auctionResolver: json.auctionResolver,
        cosigner: json.cosigner,
        input: {
          token: json.input.token,
          maxAmount: BigNumber.from(json.input.maxAmount),
        },
        outputs: json.outputs.map((output) => ({
          token: output.token,
          minAmount: BigNumber.from(output.minAmount),
          recipient: output.recipient,
        })),
        auctionStartBlock: BigNumber.from(json.auctionStartBlock),
        baselinePriorityFee: BigNumber.from(json.baselinePriorityFee),
        scalingFactor: BigNumber.from(json.scalingFactor),
        priceCurve: json.priceCurve.map((value) => BigNumber.from(value)),
      },
      chainId,
      resolver,
      _permit2Address
    );
  }

  /**
   * Encode a price curve element from duration and scaling factor
   */
  static encodePriceCurveElement(
    duration: number,
    scalingFactor: BigNumber
  ): BigNumber {
    if (duration < 0 || duration > MAX_UINT_16) {
      throw new HybridOrderPriceCurveError(
        `Duration must be between 0 and ${MAX_UINT_16} (fits in 16 bits)`
      );
    }
    if (scalingFactor.lt(0) || scalingFactor.gt(MAX_UINT_240)) {
      throw new HybridOrderPriceCurveError(
        "Scaling factor must be between 0 and 2^240-1"
      );
    }
    return encodePriceCurveElement(duration, scalingFactor);
  }

  /**
   * Decode a price curve element into duration and scaling factor
   */
  static decodePriceCurveElement(value: BigNumber): {
    duration: number;
    scalingFactor: BigNumber;
  } {
    return decodePriceCurveElement(value);
  }

  hash(): string {
    // For unsigned orders, we hash with empty cosigner data
    return hashHybridOrder({
      ...this.info,
      cosignerData: {
        auctionTargetBlock: BigNumber.from(0),
        supplementalPriceCurve: [],
      },
      cosignature: "0x",
    });
  }

  serialize(): string {
    const abiCoder = new ethers.utils.AbiCoder();
    const orderData = abiCoder.encode(HYBRID_ORDER_ABI, [
      [
        [
          this.info.reactor,
          this.info.swapper,
          this.info.nonce,
          this.info.deadline,
          this.info.preExecutionHook,
          this.info.preExecutionHookData,
          this.info.postExecutionHook,
          this.info.postExecutionHookData,
          this.info.auctionResolver,
        ],
        this.info.cosigner,
        [this.info.input.token, this.info.input.maxAmount],
        this.info.outputs.map((output) => [
          output.token,
          output.minAmount,
          output.recipient,
        ]),
        this.info.auctionStartBlock,
        this.info.baselinePriorityFee,
        this.info.scalingFactor,
        this.info.priceCurve,
        [BigNumber.from(0), []], // Empty cosignerData
        "0x", // Empty cosignature
      ],
    ]);
    return abiCoder.encode(["address", "bytes"], [this.resolver, orderData]);
  }

  permitData(): PermitTransferFromData {
    return SignatureTransfer.getPermitData(
      this.toPermit(),
      this.permit2Address,
      this.chainId,
      this.witness()
    ) as PermitTransferFromData;
  }

  getSigner(signature: SignatureLike): string {
    return ethers.utils.computeAddress(
      ethers.utils.recoverPublicKey(
        SignatureTransfer.hash(
          this.toPermit(),
          this.permit2Address,
          this.chainId,
          this.witness()
        ),
        signature
      )
    );
  }

  protected toPermit(): PermitTransferFrom {
    return {
      permitted: {
        token: this.info.input.token,
        amount: this.info.input.maxAmount,
      },
      spender: this.info.preExecutionHook,
      nonce: this.info.nonce,
      deadline: this.info.deadline,
    };
  }

  protected witness(): Witness {
    return {
      witness: {
        info: {
          reactor: this.info.reactor,
          swapper: this.info.swapper,
          nonce: this.info.nonce,
          deadline: this.info.deadline,
          preExecutionHook: this.info.preExecutionHook,
          preExecutionHookData: this.info.preExecutionHookData,
          postExecutionHook: this.info.postExecutionHook,
          postExecutionHookData: this.info.postExecutionHookData,
          auctionResolver: this.info.auctionResolver,
        },
        cosigner: this.info.cosigner,
        input: this.info.input,
        outputs: this.info.outputs,
        auctionStartBlock: this.info.auctionStartBlock,
        baselinePriorityFee: this.info.baselinePriorityFee,
        scalingFactor: this.info.scalingFactor,
        priceCurve: this.info.priceCurve,
      },
      witnessTypeName: "HybridOrder",
      witnessType: HYBRID_ORDER_TYPES,
    };
  }

  get blockOverrides(): BlockOverridesV4 {
    if (this.info.auctionStartBlock.isZero()) {
      return undefined;
    }
    return {
      number: hexStripZeros(this.info.auctionStartBlock.toHexString()),
    };
  }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  resolve(_options: HybridOrderResolutionOptions): ResolvedUniswapXOrder {
    throw new Error("Cannot resolve unsigned order - cosigner data required");
  }

  cosignatureHash(cosignerData: HybridCosignerData): string {
    return hashHybridCosignerData(this.hash(), cosignerData, this.chainId);
  }

  toJSON(): UnsignedHybridOrderInfoJSON & {
    chainId: number;
    resolver: string;
    permit2Address: string;
  } {
    return {
      chainId: this.chainId,
      resolver: this.resolver,
      permit2Address: this.permit2Address,
      reactor: this.info.reactor,
      swapper: this.info.swapper,
      nonce: this.info.nonce.toString(),
      deadline: this.info.deadline,
      preExecutionHook: this.info.preExecutionHook,
      preExecutionHookData: this.info.preExecutionHookData,
      postExecutionHook: this.info.postExecutionHook,
      postExecutionHookData: this.info.postExecutionHookData,
      auctionResolver: this.info.auctionResolver,
      cosigner: this.info.cosigner,
      input: {
        token: this.info.input.token,
        maxAmount: this.info.input.maxAmount.toString(),
      },
      outputs: this.info.outputs.map((output) => ({
        token: output.token,
        minAmount: output.minAmount.toString(),
        recipient: output.recipient,
      })),
      auctionStartBlock: this.info.auctionStartBlock.toString(),
      baselinePriorityFee: this.info.baselinePriorityFee.toString(),
      scalingFactor: this.info.scalingFactor.toString(),
      priceCurve: this.info.priceCurve.map((value) => value.toString()),
    };
  }
}

/**
 * Cosigned HybridOrder - includes cosigner data and signature
 */
export class CosignedHybridOrder extends UnsignedHybridOrder {
  constructor(
    public readonly info: CosignedHybridOrderInfo,
    public readonly chainId: number,
    public readonly resolver: string,
    _permit2Address?: string
  ) {
    super(info, chainId, resolver, _permit2Address);
  }

  /**
   * Parse a serialized HybridOrder into a CosignedHybridOrder
   */
  static parse(
    encoded: string,
    chainId: number,
    permit2?: string
  ): CosignedHybridOrder {
    const { resolver, info } = parseSerializedHybridOrder(encoded);
    return new CosignedHybridOrder(info, chainId, resolver, permit2);
  }

  /**
   * Create a CosignedHybridOrder from an UnsignedHybridOrder
   */
  static fromUnsignedOrder(
    order: UnsignedHybridOrder,
    cosignerData: HybridCosignerData,
    cosignature: string
  ): CosignedHybridOrder {
    return new CosignedHybridOrder(
      {
        ...order.info,
        cosignerData,
        cosignature,
      },
      order.chainId,
      order.resolver,
      order.permit2Address
    );
  }

  static fromJSON(
    json: CosignedHybridOrderInfoJSON,
    chainId: number,
    resolver: string,
    _permit2Address?: string
  ): CosignedHybridOrder {
    return new CosignedHybridOrder(
      {
        reactor: json.reactor,
        swapper: json.swapper,
        nonce: BigNumber.from(json.nonce),
        deadline: json.deadline,
        preExecutionHook: json.preExecutionHook,
        preExecutionHookData: json.preExecutionHookData,
        postExecutionHook: json.postExecutionHook,
        postExecutionHookData: json.postExecutionHookData,
        auctionResolver: json.auctionResolver,
        cosigner: json.cosigner,
        input: {
          token: json.input.token,
          maxAmount: BigNumber.from(json.input.maxAmount),
        },
        outputs: json.outputs.map((output) => ({
          token: output.token,
          minAmount: BigNumber.from(output.minAmount),
          recipient: output.recipient,
        })),
        auctionStartBlock: BigNumber.from(json.auctionStartBlock),
        baselinePriorityFee: BigNumber.from(json.baselinePriorityFee),
        scalingFactor: BigNumber.from(json.scalingFactor),
        priceCurve: json.priceCurve.map((value) => BigNumber.from(value)),
        cosignerData: {
          auctionTargetBlock: BigNumber.from(
            json.cosignerData.auctionTargetBlock
          ),
          supplementalPriceCurve: json.cosignerData.supplementalPriceCurve.map(
            (value) => BigNumber.from(value)
          ),
        },
        cosignature: json.cosignature,
      },
      chainId,
      resolver,
      _permit2Address
    );
  }

  hash(): string {
    return hashHybridOrder(this.info);
  }

  serialize(): string {
    const abiCoder = new ethers.utils.AbiCoder();
    const orderData = abiCoder.encode(HYBRID_ORDER_ABI, [
      [
        [
          this.info.reactor,
          this.info.swapper,
          this.info.nonce,
          this.info.deadline,
          this.info.preExecutionHook,
          this.info.preExecutionHookData,
          this.info.postExecutionHook,
          this.info.postExecutionHookData,
          this.info.auctionResolver,
        ],
        this.info.cosigner,
        [this.info.input.token, this.info.input.maxAmount],
        this.info.outputs.map((output) => [
          output.token,
          output.minAmount,
          output.recipient,
        ]),
        this.info.auctionStartBlock,
        this.info.baselinePriorityFee,
        this.info.scalingFactor,
        this.info.priceCurve,
        [
          this.info.cosignerData.auctionTargetBlock,
          this.info.cosignerData.supplementalPriceCurve,
        ],
        this.info.cosignature,
      ],
    ]);
    return abiCoder.encode(["address", "bytes"], [this.resolver, orderData]);
  }

  get blockOverrides(): BlockOverridesV4 {
    const block = !this.info.cosignerData.auctionTargetBlock.isZero()
      ? this.info.cosignerData.auctionTargetBlock
      : this.info.auctionStartBlock;

    if (block.isZero()) {
      return undefined;
    }

    return {
      number: hexStripZeros(block.toHexString()),
    };
  }

  resolve(options: HybridOrderResolutionOptions): ResolvedUniswapXOrder {
    let auctionTargetBlock = this.info.auctionStartBlock;
    let effectivePriceCurve = this.info.priceCurve.map((value) =>
      BigNumber.from(value)
    );

    if (this.info.cosigner !== ZERO_ADDRESS) {
      const recovered = this.recoverCosigner();
      if (
        ethers.utils.getAddress(recovered) !==
        ethers.utils.getAddress(this.info.cosigner)
      ) {
        throw new HybridOrderCosignatureError("Invalid cosignature");
      }

      if (!this.info.cosignerData.auctionTargetBlock.isZero()) {
        auctionTargetBlock = this.info.cosignerData.auctionTargetBlock;
      }

      if (this.info.cosignerData.supplementalPriceCurve.length > 0) {
        effectivePriceCurve = applySupplementalPriceCurve(
          effectivePriceCurve,
          this.info.cosignerData.supplementalPriceCurve
        );
      }
    }

    if (
      !auctionTargetBlock.isZero() &&
      options.currentBlock.lt(auctionTargetBlock)
    ) {
      throw new OrderResolutionError("Target block in the future");
    }

    const currentScalingFactor = deriveCurrentScalingFactor(
      this.info,
      effectivePriceCurve,
      auctionTargetBlock,
      options.currentBlock
    );

    const priorityFeeAboveBaseline = options.priorityFeeWei.gt(
      this.info.baselinePriorityFee
    )
      ? options.priorityFeeWei.sub(this.info.baselinePriorityFee)
      : BigNumber.from(0);

    const useExactIn =
      this.info.scalingFactor.gt(BASE_SCALING_FACTOR) ||
      (this.info.scalingFactor.eq(BASE_SCALING_FACTOR) &&
        currentScalingFactor.gte(BASE_SCALING_FACTOR));

    if (useExactIn) {
      const scalingMultiplier = currentScalingFactor.add(
        this.info.scalingFactor
          .sub(BASE_SCALING_FACTOR)
          .mul(priorityFeeAboveBaseline)
      );
      return {
        input: {
          token: this.info.input.token,
          amount: this.info.input.maxAmount,
        },
        outputs: scaleOutputs(this.info.outputs, scalingMultiplier),
      };
    }

    const scalingMultiplier = currentScalingFactor.sub(
      BASE_SCALING_FACTOR.sub(this.info.scalingFactor).mul(
        priorityFeeAboveBaseline
      )
    );

    return {
      input: scaleInput(this.info.input, scalingMultiplier),
      outputs: this.info.outputs.map((output) => ({
        token: output.token,
        amount: output.minAmount,
      })),
    };
  }

  toJSON(): CosignedHybridOrderInfoJSON & {
    chainId: number;
    resolver: string;
    permit2Address: string;
  } {
    return {
      chainId: this.chainId,
      resolver: this.resolver,
      permit2Address: this.permit2Address,
      reactor: this.info.reactor,
      swapper: this.info.swapper,
      nonce: this.info.nonce.toString(),
      deadline: this.info.deadline,
      preExecutionHook: this.info.preExecutionHook,
      preExecutionHookData: this.info.preExecutionHookData,
      postExecutionHook: this.info.postExecutionHook,
      postExecutionHookData: this.info.postExecutionHookData,
      auctionResolver: this.info.auctionResolver,
      cosigner: this.info.cosigner,
      input: {
        token: this.info.input.token,
        maxAmount: this.info.input.maxAmount.toString(),
      },
      outputs: this.info.outputs.map((output) => ({
        token: output.token,
        minAmount: output.minAmount.toString(),
        recipient: output.recipient,
      })),
      auctionStartBlock: this.info.auctionStartBlock.toString(),
      baselinePriorityFee: this.info.baselinePriorityFee.toString(),
      scalingFactor: this.info.scalingFactor.toString(),
      priceCurve: this.info.priceCurve.map((value) => value.toString()),
      cosignerData: {
        auctionTargetBlock:
          this.info.cosignerData.auctionTargetBlock.toString(),
        supplementalPriceCurve:
          this.info.cosignerData.supplementalPriceCurve.map((value) =>
            value.toString()
          ),
      },
      cosignature: this.info.cosignature,
    };
  }

  cosignatureHash(): string {
    return hashHybridCosignerData(
      this.hash(),
      this.info.cosignerData,
      this.chainId
    );
  }

  recoverCosigner(): string {
    return ethers.utils.recoverAddress(
      this.cosignatureHash(),
      this.info.cosignature
    );
  }
}


// Helper functions

function applySupplementalPriceCurve(
  priceCurve: BigNumber[],
  supplemental: BigNumber[]
): BigNumber[] {
  if (supplemental.length === 0) {
    return priceCurve.map((value) => BigNumber.from(value));
  }

  if (priceCurve.length === 0) {
    throw new HybridOrderPriceCurveError(
      "Supplemental curve provided without base curve"
    );
  }

  const combined = priceCurve.map((value) => BigNumber.from(value));
  const length = Math.min(priceCurve.length, supplemental.length);
  for (let i = 0; i < length; i++) {
    const { duration, scalingFactor } = decodePriceCurveElement(priceCurve[i]);
    const supplementalScaling = BigNumber.from(supplemental[i]);
    if (!sharesScalingDirection(scalingFactor, supplementalScaling)) {
      throw new HybridOrderPriceCurveError(
        "Supplemental scaling direction mismatch"
      );
    }
    const mergedScaling = scalingFactor
      .add(supplementalScaling)
      .sub(BASE_SCALING_FACTOR);
    if (mergedScaling.lt(0) || mergedScaling.gt(MAX_UINT_240)) {
      throw new HybridOrderPriceCurveError(
        "Supplemental scaling factor out of range"
      );
    }
    combined[i] = encodePriceCurveElement(duration, mergedScaling);
  }
  return combined;
}

function deriveCurrentScalingFactor(
  order: UnsignedHybridOrderInfo | CosignedHybridOrderInfo,
  priceCurve: BigNumber[],
  targetBlock: BigNumber,
  fillBlock: BigNumber
): BigNumber {
  if (targetBlock.isZero()) {
    if (priceCurve.length !== 0) {
      throw new HybridOrderPriceCurveError("Invalid target block designation");
    }
    return BASE_SCALING_FACTOR;
  }

  if (targetBlock.gt(fillBlock)) {
    throw new OrderResolutionError("Invalid target block");
  }

  const blocksPassed = fillBlock.sub(targetBlock).toNumber();
  const currentScalingFactor = getCalculatedScalingFactor(
    priceCurve,
    blocksPassed
  );

  if (!sharesScalingDirection(order.scalingFactor, currentScalingFactor)) {
    throw new HybridOrderPriceCurveError("Scaling direction mismatch");
  }

  return currentScalingFactor;
}

function getCalculatedScalingFactor(
  parameters: BigNumber[],
  blocksPassed: number
): BigNumber {
  if (parameters.length === 0) {
    return BASE_SCALING_FACTOR;
  }

  let blocksCounted = 0;
  let lastZeroDurationScaling: BigNumber | null = null;
  let previousDuration = 0;

  for (let i = 0; i < parameters.length; i++) {
    const { duration, scalingFactor } = decodePriceCurveElement(parameters[i]);

    if (duration === 0) {
      if (blocksPassed >= blocksCounted) {
        lastZeroDurationScaling = scalingFactor;
        if (blocksPassed === blocksCounted) {
          return scalingFactor;
        }
      }
      previousDuration = duration;
      continue;
    }

    const segmentEnd = blocksCounted + duration;
    if (blocksPassed < segmentEnd) {
      if (previousDuration === 0 && lastZeroDurationScaling) {
        if (!sharesScalingDirection(lastZeroDurationScaling, scalingFactor)) {
          throw new HybridOrderPriceCurveError(
            "Zero duration scaling mismatch"
          );
        }
        return locateCurrentAmount(
          lastZeroDurationScaling,
          scalingFactor,
          blocksCounted,
          blocksPassed,
          segmentEnd,
          lastZeroDurationScaling.gt(BASE_SCALING_FACTOR)
        );
      }

      const endScalingFactor =
        i + 1 < parameters.length
          ? decodePriceCurveElement(parameters[i + 1]).scalingFactor
          : BASE_SCALING_FACTOR;

      if (!sharesScalingDirection(scalingFactor, endScalingFactor)) {
        throw new HybridOrderPriceCurveError("Scaling direction mismatch");
      }

      return locateCurrentAmount(
        scalingFactor,
        endScalingFactor,
        blocksCounted,
        blocksPassed,
        segmentEnd,
        scalingFactor.gt(BASE_SCALING_FACTOR)
      );
    }

    blocksCounted = segmentEnd;
    previousDuration = duration;
  }

  if (blocksPassed >= blocksCounted) {
    throw new HybridOrderPriceCurveError("Price curve blocks exceeded");
  }

  throw new HybridOrderPriceCurveError("Unable to derive scaling factor");
}

function locateCurrentAmount(
  startAmount: BigNumber,
  endAmount: BigNumber,
  startBlock: number,
  currentBlock: number,
  endBlock: number,
  roundUp: boolean
): BigNumber {
  if (startAmount.eq(endAmount)) {
    return endAmount;
  }

  const duration = endBlock - startBlock;

  if (duration === 0) {
    throw new HybridOrderPriceCurveError(
      "Invalid duration: zero duration when it shouldn't be"
    );
  }
  const elapsed = currentBlock - startBlock;
  const remaining = duration - elapsed;

  const durationBN = BigNumber.from(duration);
  const elapsedBN = BigNumber.from(elapsed);
  const remainingBN = BigNumber.from(remaining);

  const totalBeforeDivision = startAmount
    .mul(remainingBN)
    .add(endAmount.mul(elapsedBN));

  if (totalBeforeDivision.isZero()) {
    return BigNumber.from(0);
  }

  if (roundUp) {
    return totalBeforeDivision.sub(1).div(durationBN).add(1);
  }

  return totalBeforeDivision.div(durationBN);
}

function scaleOutputs(
  outputs: CosignedHybridOrderInfo["outputs"],
  scalingMultiplier: BigNumber
): TokenAmount[] {
  return outputs.map((output) => ({
    token: output.token,
    amount: mulWadUp(output.minAmount, scalingMultiplier),
  }));
}

function scaleInput(
  input: CosignedHybridOrderInfo["input"],
  scalingMultiplier: BigNumber
): TokenAmount {
  return {
    token: input.token,
    amount: mulWad(input.maxAmount, scalingMultiplier),
  };
}

function mulWad(a: BigNumber, b: BigNumber): BigNumber {
  if (a.isZero() || b.isZero()) {
    return BigNumber.from(0);
  }
  return a.mul(b).div(WAD);
}

function mulWadUp(a: BigNumber, b: BigNumber): BigNumber {
  if (a.isZero() || b.isZero()) {
    return BigNumber.from(0);
  }
  return a.mul(b).add(WAD).sub(1).div(WAD);
}

function decodePriceCurveElement(value: BigNumber): {
  duration: number;
  scalingFactor: BigNumber;
} {
  const scalingFactor = value.and(MAX_UINT_240);
  const duration = value.shr(PRICE_CURVE_DURATION_SHIFT).toNumber();
  return { duration, scalingFactor };
}

function encodePriceCurveElement(
  duration: number,
  scalingFactor: BigNumber
): BigNumber {
  return BigNumber.from(duration)
    .shl(PRICE_CURVE_DURATION_SHIFT)
    .or(scalingFactor);
}

function sharesScalingDirection(a: BigNumber, b: BigNumber): boolean {
  if (a.eq(BASE_SCALING_FACTOR) || b.eq(BASE_SCALING_FACTOR)) {
    return true;
  }
  return a.gt(BASE_SCALING_FACTOR) === b.gt(BASE_SCALING_FACTOR);
}
