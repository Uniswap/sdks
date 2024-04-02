import { BaseProvider } from "@ethersproject/providers";
import { ethers } from "ethers";

import {
  OrderType,
  PERMIT2_MAPPING,
  REACTOR_ADDRESS_MAPPING,
  UNISWAPX_ORDER_QUOTER_MAPPING,
} from "../constants";
import {
  OrderQuoter__factory,
  OrderQuoter as OrderQuoterContract,
  RelayOrderReactor,
  RelayOrderReactor__factory,
} from "../contracts";
import { MissingConfiguration } from "../errors";
import {
  Order,
  RelayOrder,
  ResolvedRelayFee,
  TokenAmount,
  UniswapXOrder,
} from "../order";
import { parseExclusiveFillerData, ValidationType } from "../order/validation";

import { NonceManager } from "./NonceManager";
import {
  MulticallResult,
  multicallSameContractManyFunctions,
} from "./multicall";

export enum OrderValidation {
  Expired,
  NonceUsed,
  InsufficientFunds,
  InvalidSignature,
  InvalidOrderFields,
  UnknownError,
  ValidationFailed,
  ExclusivityPeriod,
  InvalidCosignature,
  OK,
}

export interface ResolvedUniswapXOrder {
  input: TokenAmount;
  outputs: TokenAmount[];
}

export interface UniswapXOrderQuote {
  validation: OrderValidation;
  // not specified if validation is not OK
  quote: ResolvedUniswapXOrder | undefined;
}

export interface ResolvedRelayOrder {
  fee: ResolvedRelayFee;
}

export interface RelayOrderQuote {
  validation: OrderValidation;
  // not specified if validation is not OK
  quote: ResolvedRelayOrder | undefined;
}

const BASIC_ERROR = "0x08c379a0";

const KNOWN_ERRORS: { [key: string]: OrderValidation } = {
  "8baa579f": OrderValidation.InvalidSignature,
  "815e1d64": OrderValidation.InvalidSignature,
  "756688fe": OrderValidation.NonceUsed,
  // invalid dutch decay time
  "302e5b7c": OrderValidation.InvalidOrderFields,
  // invalid dutch decay time
  "773a6187": OrderValidation.InvalidOrderFields,
  // invalid reactor address
  "4ddf4a64": OrderValidation.InvalidOrderFields,
  // both input and output decay
  d303758b: OrderValidation.InvalidOrderFields,
  // Incorrect amounts
  "7c1f8113": OrderValidation.InvalidOrderFields,
  // invalid dutch decay time
  "43133453": OrderValidation.InvalidOrderFields,
  "48fee69c": OrderValidation.InvalidOrderFields,
  "70f65caa": OrderValidation.Expired,
  ee3b3d4b: OrderValidation.NonceUsed,
  "0a0b0d79": OrderValidation.ValidationFailed,
  b9ec1e96: OrderValidation.ExclusivityPeriod,
  "062dec56": OrderValidation.ExclusivityPeriod,
  "75c1bb14": OrderValidation.ExclusivityPeriod,
  // invalid cosigner output
  a305df82: OrderValidation.InvalidOrderFields,
  // invalid cosigner input
  ac9143e7: OrderValidation.InvalidOrderFields,
  // duplicate fee output
  fff08303: OrderValidation.InvalidOrderFields,
  // invalid cosignature
  d7815be1: OrderValidation.InvalidCosignature,
  TRANSFER_FROM_FAILED: OrderValidation.InsufficientFunds,
  // invalid fee escalation amounts
  d856fc5a: OrderValidation.InvalidOrderFields,
  // Signature expired
  cd21db4f: OrderValidation.Expired,
};

export interface SignedUniswapXOrder {
  order: UniswapXOrder;
  signature: string;
}

export interface SignedRelayOrder {
  order: RelayOrder;
  signature: string;
}

export interface SignedOrder {
  order: Order;
  signature: string;
}

interface OrderQuoter<TOrder, TQuote> {
  quote(order: TOrder): Promise<TQuote>;
  quoteBatch(orders: TOrder[]): Promise<TQuote[]>;
  orderQuoterAddress: string;
}

// Offchain orders have one quirk
// all reactors check expiry before anything else, so old but already filled orders will return as expired
// so this function takes orders in expired state and double checks them
async function checkTerminalStates(
  nonceManager: NonceManager,
  orders: (SignedUniswapXOrder | SignedRelayOrder)[],
  validations: OrderValidation[]
): Promise<OrderValidation[]> {
  return await Promise.all(
    validations.map(async (validation, i) => {
      const order = orders[i];
      if (
        validation === OrderValidation.Expired ||
        order.order.info.deadline < Math.floor(new Date().getTime() / 1000)
      ) {
        const maker = order.order.getSigner(order.signature);
        const cancelled = await nonceManager.isUsed(
          maker,
          order.order.info.nonce
        );
        return cancelled ? OrderValidation.NonceUsed : OrderValidation.Expired;
      } else {
        return validation;
      }
    })
  );
}

/**
 * UniswapX order quoter
 */
export class UniswapXOrderQuoter
  implements OrderQuoter<SignedUniswapXOrder, UniswapXOrderQuote>
{
  protected quoter: OrderQuoterContract;

  constructor(
    protected provider: BaseProvider,
    protected chainId: number,
    orderQuoterAddress?: string
  ) {
    if (orderQuoterAddress) {
      this.quoter = OrderQuoter__factory.connect(orderQuoterAddress, provider);
    } else if (UNISWAPX_ORDER_QUOTER_MAPPING[chainId]) {
      this.quoter = OrderQuoter__factory.connect(
        UNISWAPX_ORDER_QUOTER_MAPPING[chainId],
        this.provider
      );
    } else {
      throw new MissingConfiguration("quoter", chainId.toString());
    }
  }

  async quote(order: SignedUniswapXOrder): Promise<UniswapXOrderQuote> {
    return (await this.quoteBatch([order]))[0];
  }

  async quoteBatch(
    orders: SignedUniswapXOrder[]
  ): Promise<UniswapXOrderQuote[]> {
    const results = await this.getMulticallResults("quote", orders);
    const validations = await this.getValidations(orders, results);

    const quotes: (ResolvedUniswapXOrder | undefined)[] = results.map(
      ({ success, returnData }) => {
        if (!success) {
          return undefined;
        }

        return this.quoter.interface.decodeFunctionResult("quote", returnData)
          .result;
      }
    );

    return validations.map((validation, i) => {
      return {
        validation,
        quote: quotes[i],
      };
    });
  }

  private async getValidations(
    orders: SignedUniswapXOrder[],
    results: MulticallResult[]
  ): Promise<OrderValidation[]> {
    const validations = results.map((result, idx) => {
      if (result.success) {
        return OrderValidation.OK;
      } else {
        let returnData = result.returnData;

        // Parse traditional string error messages
        if (returnData.startsWith(BASIC_ERROR)) {
          returnData = new ethers.utils.AbiCoder().decode(
            ["string"],
            "0x" + returnData.slice(10)
          )[0];
        }

        for (const key of Object.keys(KNOWN_ERRORS)) {
          if (returnData.includes(key)) {
            if (key === "0a0b0d79") {
              const fillerValidation = parseExclusiveFillerData(
                orders[idx].order.info.additionalValidationData
              );
              if (
                fillerValidation.type === ValidationType.ExclusiveFiller &&
                fillerValidation.data.filler !== ethers.constants.AddressZero
              ) {
                return OrderValidation.ExclusivityPeriod;
              }
              return OrderValidation.ValidationFailed;
            }
            return KNOWN_ERRORS[key];
          }
        }
        return OrderValidation.UnknownError;
      }
    });

    return await checkTerminalStates(
      new NonceManager(
        this.provider,
        this.chainId,
        PERMIT2_MAPPING[this.chainId]
      ),
      orders,
      validations
    );
  }

  /// Get the results of a multicall for a given function
  private async getMulticallResults(
    functionName: string,
    orders: SignedOrder[]
  ): Promise<MulticallResult[]> {
    const calls = orders.map((order) => {
      return [order.order.serialize(), order.signature];
    });

    return await multicallSameContractManyFunctions(this.provider, {
      address: this.quoter.address,
      contractInterface: this.quoter.interface,
      functionName: functionName,
      functionParams: calls,
    });
  }

  get orderQuoterAddress(): string {
    return this.quoter.address;
  }
}

/**
 * Relay order quoter
 */
export class RelayOrderQuoter
  implements OrderQuoter<SignedRelayOrder, RelayOrderQuote>
{
  protected quoter: RelayOrderReactor;
  private quoteFunctionSelector = "0x3f62192e"; // function execute((bytes, bytes))

  constructor(
    protected provider: BaseProvider,
    protected chainId: number,
    reactorAddress?: string
  ) {
    if (reactorAddress) {
      this.quoter = RelayOrderReactor__factory.connect(
        reactorAddress,
        provider
      );
    } else if (REACTOR_ADDRESS_MAPPING[chainId][OrderType.Relay]) {
      this.quoter = RelayOrderReactor__factory.connect(
        REACTOR_ADDRESS_MAPPING[chainId][OrderType.Relay]!,
        this.provider
      );
    } else {
      throw new MissingConfiguration("quoter", chainId.toString());
    }
  }

  async quote(order: SignedRelayOrder): Promise<RelayOrderQuote> {
    return (await this.quoteBatch([order]))[0];
  }

  async quoteBatch(orders: SignedRelayOrder[]): Promise<RelayOrderQuote[]> {
    const results = await this.getMulticallResults(
      this.quoteFunctionSelector,
      orders
    );
    const validations = await this.getValidations(orders, results);

    const quotes: (ResolvedRelayOrder | undefined)[] = results.map(
      // no return data
      ({ success }, idx) => {
        if (!success) {
          return undefined;
        }

        // TODO:
        return orders[idx].order.resolve({
          timestamp: Math.floor(new Date().getTime() / 1000),
        });
      }
    );

    return validations.map((validation, i) => {
      return {
        validation,
        quote: quotes[i],
      };
    });
  }

  /// Get the results of a multicall for a given function
  private async getMulticallResults(
    functionName: string,
    orders: SignedRelayOrder[]
  ): Promise<MulticallResult[]> {
    const calls = orders.map((order) => {
      return [
        {
          order: order.order.serialize(),
          sig: order.signature,
        },
      ];
    });

    return await multicallSameContractManyFunctions(this.provider, {
      address: this.quoter.address,
      contractInterface: this.quoter.interface,
      functionName: functionName,
      functionParams: calls,
    });
  }

  private async getValidations(
    orders: SignedRelayOrder[],
    results: MulticallResult[]
  ): Promise<OrderValidation[]> {
    const validations = results.map((result) => {
      if (result.success) {
        return OrderValidation.OK;
      } else {
        let returnData = result.returnData;

        // Parse traditional string error messages
        if (returnData.startsWith(BASIC_ERROR)) {
          returnData = new ethers.utils.AbiCoder().decode(
            ["string"],
            "0x" + returnData.slice(10)
          )[0];
        }

        for (const key of Object.keys(KNOWN_ERRORS)) {
          if (returnData.includes(key)) {
            return KNOWN_ERRORS[key];
          }
        }
        return OrderValidation.UnknownError;
      }
    });

    return await checkTerminalStates(
      new NonceManager(
        this.provider,
        this.chainId,
        PERMIT2_MAPPING[this.chainId]
      ),
      orders,
      validations
    );
  }

  get orderQuoterAddress(): string {
    return this.quoter.address;
  }
}
