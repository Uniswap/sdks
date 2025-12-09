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
  HYBRID_PERMIT2_ORDER_TYPE,
} from "./hashing";
import {
  BlockOverridesV4,
  HybridOrder,
  HybridOrderJSON,
  HybridOrderResolutionOptions,
} from "./types";

const ZERO_ADDRESS = ethers.constants.AddressZero;
const WAD = ethers.constants.WeiPerEther;
const MAX_UINT_240 = BigNumber.from(1).shl(240).sub(1);
const MAX_UINT_16 = 65535; // 2^16 - 1, max duration that fits in 16 bits
const PRICE_CURVE_DURATION_SHIFT = 240;

// Permit2 constants matching contract
const PERMIT_TRANSFER_FROM_WITNESS_TYPEHASH_STUB =
  "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,";
const TOKEN_PERMISSIONS_TYPEHASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("TokenPermissions(address token,uint256 amount)")
);

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

export class HybridOrderClass {
  public readonly resolver: string;
  public readonly permit2Address: string;

  constructor(
    public readonly order: HybridOrder,
    public readonly chainId: number,
    resolver: string,
    _permit2Address?: string
  ) {
    this.resolver = resolver;
    this.permit2Address = getPermit2(chainId, _permit2Address);
  }

  public get info() {
    return this.order.info;
  }

  /**
   * Encode a price curve element from duration and scaling factor
   * @param duration The duration in blocks for this curve segment
   * @param scalingFactor The scaling factor (as a BigNumber, typically with 18 decimals)
   * @returns The encoded price curve element
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
   * @param value The encoded price curve element
   * @returns Object containing duration (in blocks) and scalingFactor
   */
  static decodePriceCurveElement(value: BigNumber): {
    duration: number;
    scalingFactor: BigNumber;
  } {
    return decodePriceCurveElement(value);
  }

  static fromJSON(
    json: HybridOrderJSON,
    chainId: number,
    resolver: string,
    _permit2Address?: string
  ): HybridOrderClass {
    return new HybridOrderClass(
      {
        info: {
          reactor: json.info.reactor,
          swapper: json.info.swapper,
          nonce: BigNumber.from(json.info.nonce),
          deadline: json.info.deadline,
          preExecutionHook: json.info.preExecutionHook,
          preExecutionHookData: json.info.preExecutionHookData,
          postExecutionHook: json.info.postExecutionHook,
          postExecutionHookData: json.info.postExecutionHookData,
          auctionResolver: json.info.auctionResolver,
        },
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
        baselinePriorityFeeWei: BigNumber.from(json.baselinePriorityFeeWei),
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
    return hashHybridOrder(this.order);
  }

  serialize(): string {
    const abiCoder = new ethers.utils.AbiCoder();
    const orderData = abiCoder.encode(HYBRID_ORDER_ABI, [
      [
        [
          this.order.info.reactor,
          this.order.info.swapper,
          this.order.info.nonce,
          this.order.info.deadline,
          this.order.info.preExecutionHook,
          this.order.info.preExecutionHookData,
          this.order.info.postExecutionHook,
          this.order.info.postExecutionHookData,
          this.order.info.auctionResolver,
        ],
        this.order.cosigner,
        [this.order.input.token, this.order.input.maxAmount],
        this.order.outputs.map((output) => [
          output.token,
          output.minAmount,
          output.recipient,
        ]),
        this.order.auctionStartBlock,
        this.order.baselinePriorityFeeWei,
        this.order.scalingFactor,
        this.order.priceCurve,
        [
          this.order.cosignerData.auctionTargetBlock,
          this.order.cosignerData.supplementalPriceCurve,
        ],
        this.order.cosignature,
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

  /**
   * Get the EIP-712 signing hash for Permit2 that matches the contract's custom hash.
   * This should be used instead of permitData() when signing, as the contract uses
   * a gas-optimized hash that doesn't match standard EIP-712.
   * @param permit2DomainSeparator The Permit2 contract's domain separator
   * @returns The hash to sign
   */
  getPermitSigningHash(permit2DomainSeparator: string): string {
    // Build the full type hash: stub + witness type string
    const typeHash = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(
        PERMIT_TRANSFER_FROM_WITNESS_TYPEHASH_STUB + HYBRID_PERMIT2_ORDER_TYPE
      )
    );

    // Hash token permissions
    const tokenPermissionsHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["bytes32", "address", "uint256"],
        [
          TOKEN_PERMISSIONS_TYPEHASH,
          this.order.input.token,
          this.order.input.maxAmount,
        ]
      )
    );

    // Build struct hash using the custom order hash
    const structHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["bytes32", "bytes32", "address", "uint256", "uint256", "bytes32"],
        [
          typeHash,
          tokenPermissionsHash,
          this.order.info.preExecutionHook, // spender
          this.order.info.nonce,
          this.order.info.deadline,
          this.hash(), // Custom order hash
        ]
      )
    );

    // Build final EIP-712 hash
    return ethers.utils.keccak256(
      ethers.utils.solidityPack(
        ["string", "bytes32", "bytes32"],
        ["\x19\x01", permit2DomainSeparator, structHash]
      )
    );
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

  private toPermit(): PermitTransferFrom {
    return {
      permitted: {
        token: this.order.input.token,
        amount: this.order.input.maxAmount,
      },
      spender: this.order.info.preExecutionHook,
      nonce: this.order.info.nonce,
      deadline: this.order.info.deadline,
    };
  }

  private witness(): Witness {
    return {
      witness: {
        info: this.order.info,
        cosigner: this.order.cosigner,
        input: this.order.input,
        outputs: this.order.outputs,
        auctionStartBlock: this.order.auctionStartBlock,
        baselinePriorityFee: this.order.baselinePriorityFeeWei,
        scalingFactor: this.order.scalingFactor,
        priceCurve: this.order.priceCurve,
      },
      witnessTypeName: "HybridOrder",
      witnessType: HYBRID_ORDER_TYPES,
    };
  }

  get blockOverrides(): BlockOverridesV4 {
    const block =
      !this.order.cosignerData.auctionTargetBlock.isZero()
        ? this.order.cosignerData.auctionTargetBlock
        : this.order.auctionStartBlock;

    if (block.isZero()) {
      return undefined;
    }

    return {
      number: hexStripZeros(block.toHexString()),
    };
  }

  resolve(options: HybridOrderResolutionOptions): ResolvedUniswapXOrder {
    let auctionTargetBlock = this.order.auctionStartBlock;
    let effectivePriceCurve = this.order.priceCurve.map((value) =>
      BigNumber.from(value)
    );

    if (this.order.cosigner !== ZERO_ADDRESS) {
      const recovered = this.recoverCosigner();
      if (
        ethers.utils.getAddress(recovered) !==
        ethers.utils.getAddress(this.order.cosigner)
      ) {
        throw new HybridOrderCosignatureError("Invalid cosignature");
      }

      if (!this.order.cosignerData.auctionTargetBlock.isZero()) {
        auctionTargetBlock = this.order.cosignerData.auctionTargetBlock;
      }

      if (this.order.cosignerData.supplementalPriceCurve.length > 0) {
        effectivePriceCurve = applySupplementalPriceCurve(
          effectivePriceCurve,
          this.order.cosignerData.supplementalPriceCurve
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
      this.order,
      effectivePriceCurve,
      auctionTargetBlock,
      options.currentBlock
    );

    const priorityFeeAboveBaseline =
      options.priorityFeeWei.gt(this.order.baselinePriorityFeeWei)
        ? options.priorityFeeWei.sub(this.order.baselinePriorityFeeWei)
        : BigNumber.from(0);

    const useExactIn =
      this.order.scalingFactor.gt(BASE_SCALING_FACTOR) ||
      (this.order.scalingFactor.eq(BASE_SCALING_FACTOR) &&
        currentScalingFactor.gte(BASE_SCALING_FACTOR));

    if (useExactIn) {
      const scalingMultiplier = currentScalingFactor.add(
        this.order.scalingFactor.sub(BASE_SCALING_FACTOR).mul(
          priorityFeeAboveBaseline
        )
      );
      return {
        input: {
          token: this.order.input.token,
          amount: this.order.input.maxAmount,
        },
        outputs: scaleOutputs(this.order.outputs, scalingMultiplier),
      };
    }

    const scalingMultiplier = currentScalingFactor.sub(
      BASE_SCALING_FACTOR.sub(this.order.scalingFactor).mul(
        priorityFeeAboveBaseline
      )
    );

    return {
      input: scaleInput(this.order.input, scalingMultiplier),
      outputs: this.order.outputs.map((output) => ({
        token: output.token,
        amount: output.minAmount,
      })),
    };
  }

  toJSON(): HybridOrderJSON & {
    chainId: number;
    resolver: string;
    permit2Address: string;
  } {
    return {
      chainId: this.chainId,
      resolver: this.resolver,
      permit2Address: this.permit2Address,
      info: {
        reactor: this.order.info.reactor,
        swapper: this.order.info.swapper,
        nonce: this.order.info.nonce.toString(),
        deadline: this.order.info.deadline,
        preExecutionHook: this.order.info.preExecutionHook,
        preExecutionHookData: this.order.info.preExecutionHookData,
        postExecutionHook: this.order.info.postExecutionHook,
        postExecutionHookData: this.order.info.postExecutionHookData,
        auctionResolver: this.order.info.auctionResolver,
      },
      cosigner: this.order.cosigner,
      input: {
        token: this.order.input.token,
        maxAmount: this.order.input.maxAmount.toString(),
      },
      outputs: this.order.outputs.map((output) => ({
        token: output.token,
        minAmount: output.minAmount.toString(),
        recipient: output.recipient,
      })),
      auctionStartBlock: this.order.auctionStartBlock.toString(),
      baselinePriorityFeeWei: this.order.baselinePriorityFeeWei.toString(),
      scalingFactor: this.order.scalingFactor.toString(),
      priceCurve: this.order.priceCurve.map((value) => value.toString()),
      cosignerData: {
        auctionTargetBlock:
          this.order.cosignerData.auctionTargetBlock.toString(),
        supplementalPriceCurve:
          this.order.cosignerData.supplementalPriceCurve.map((value) =>
            value.toString()
          ),
      },
      cosignature: this.order.cosignature,
    };
  }

  cosignatureHash(): string {
    return hashHybridCosignerData(
      this.hash(),
      this.order.cosignerData,
      this.chainId
    );
  }

  recoverCosigner(): string {
    return ethers.utils.recoverAddress(
      this.cosignatureHash(),
      this.order.cosignature
    );
  }
}

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
  order: HybridOrder,
  priceCurve: BigNumber[],
  targetBlock: BigNumber,
  fillBlock: BigNumber
): BigNumber {
  if (targetBlock.isZero()) {
    if (priceCurve.length !== 0) {
      throw new HybridOrderPriceCurveError(
        "Invalid target block designation"
      );
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
        if (
          !sharesScalingDirection(lastZeroDurationScaling, scalingFactor)
        ) {
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
  outputs: HybridOrder["outputs"],
  scalingMultiplier: BigNumber
): TokenAmount[] {
  return outputs.map((output) => ({
    token: output.token,
    amount: mulWadUp(output.minAmount, scalingMultiplier),
  }));
}

function scaleInput(
  input: HybridOrder["input"],
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

