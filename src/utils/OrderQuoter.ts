import { BaseProvider } from "@ethersproject/providers";
import { ethers } from "ethers";

import { ORDER_QUOTER_MAPPING } from "../constants";
import {
  ExclusiveDutchOrderReactor__factory,
  OrderQuoter__factory,
  OrderQuoter as OrderQuoterContract,
} from "../contracts";
import { MissingConfiguration } from "../errors";
import { Order, TokenAmount } from "../order";
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
  OK,
}

export interface ResolvedOrder {
  input: TokenAmount;
  outputs: TokenAmount[];
}

export interface OrderQuote {
  validation: OrderValidation;
  // not specified if validation is not OK
  quote: ResolvedOrder | undefined;
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
  TRANSFER_FROM_FAILED: OrderValidation.InsufficientFunds,
};

export interface SignedOrder {
  order: Order;
  signature: string;
}

/**
 * Order quoter
 */
export class OrderQuoter {
  private orderQuoter: OrderQuoterContract;

  constructor(
    private provider: BaseProvider,
    private chainId: number,
    orderQuoterAddress?: string
  ) {
    if (orderQuoterAddress) {
      this.orderQuoter = OrderQuoter__factory.connect(
        orderQuoterAddress,
        provider
      );
    } else if (ORDER_QUOTER_MAPPING[chainId]) {
      this.orderQuoter = OrderQuoter__factory.connect(
        ORDER_QUOTER_MAPPING[chainId],
        this.provider
      );
    } else {
      throw new MissingConfiguration("orderQuoter", chainId.toString());
    }
  }

  async quote(order: SignedOrder): Promise<OrderQuote> {
    return (await this.quoteBatch([order]))[0];
  }

  async quoteBatch(orders: SignedOrder[]): Promise<OrderQuote[]> {
    const calls = orders.map((order) => {
      return [order.order.serialize(), order.signature];
    });

    const results = await multicallSameContractManyFunctions(this.provider, {
      address: this.orderQuoter.address,
      contractInterface: this.orderQuoter.interface,
      functionName: "quote",
      functionParams: calls,
    });

    const validations = await this.getValidations(orders, results);
    const quotes: (ResolvedOrder | undefined)[] = results.map(
      ({ success, returnData }) => {
        if (!success) {
          return undefined;
        }

        return this.orderQuoter.interface.decodeFunctionResult(
          "quote",
          returnData
        ).result;
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
    orders: SignedOrder[],
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

    return await this.checkTerminalStates(orders, validations);
  }

  // The quoter contract has a quirk that make validations inaccurate:
  // - checks expiry before anything else, so old but already filled orders will return as expired
  // so this function takes orders in expired state and double checks them
  private async checkTerminalStates(
    orders: SignedOrder[],
    validations: OrderValidation[]
  ): Promise<OrderValidation[]> {
    return await Promise.all(
      validations.map(async (validation, i) => {
        const order = orders[i];
        if (
          validation === OrderValidation.Expired ||
          order.order.info.deadline < Math.floor(new Date().getTime() / 1000)
        ) {
          // all reactors have the same interface, we just use limitorder to implement the interface
          const reactor = ExclusiveDutchOrderReactor__factory.connect(
            order.order.info.reactor,
            this.provider
          );

          const nonceManager = new NonceManager(
            this.provider,
            this.chainId,
            await reactor.permit2()
          );
          const maker = order.order.getSigner(order.signature);
          const cancelled = await nonceManager.isUsed(
            maker,
            order.order.info.nonce
          );
          return cancelled
            ? OrderValidation.NonceUsed
            : OrderValidation.Expired;
        } else {
          return validation;
        }
      })
    );
  }

  get orderQuoterAddress(): string {
    return this.orderQuoter.address;
  }
}
