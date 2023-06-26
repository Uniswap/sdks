import { SignatureLike } from "@ethersproject/bytes";
import { PermitTransferFromData } from "@uniswap/permit2-sdk";
import { BigNumber } from "ethers";

import { ResolvedOrder } from "../utils/OrderQuoter";

import { CustomOrderValidation, parseValidation } from "./validation";

export abstract class Order {
  // TODO: maybe add generic types for more order-type specific info
  abstract info: OrderInfo;

  // expose the chainid
  abstract chainId: number;

  // TODO: maybe add generic order info getters, i.e.
  // affectedTokens, validTimes, max amounts?
  // not yet sure what is useful / generic here

  /**
   * Returns the abi encoded order
   * @return The abi encoded serialized order which can be submitted on-chain
   */
  abstract serialize(): string;

  /**
   * Recovers the given signature, returning the address which created it
   *  * @param signature The signature to recover
   *  * @returns address The address which created the signature
   */
  abstract getSigner(signature: SignatureLike): string;

  /**
   * Returns the data for generating the maker EIP-712 permit signature
   * @return The data for generating the maker EIP-712 permit signature
   */
  abstract permitData(): PermitTransferFromData;

  /**
   * Returns the order hash
   * @return The order hash which is used as a key on-chain
   */
  abstract hash(): string;

  /**
   * Returns the resolved order with the given options
   * @return The resolved order
   */
  abstract resolve(options: OrderResolutionOptions): ResolvedOrder;

  /**
   * Returns the parsed validation
   * @return The parsed validation data for the order
   */
  get validation(): CustomOrderValidation {
    return parseValidation(this.info);
  }
}

export type TokenAmount = {
  readonly token: string;
  readonly amount: BigNumber;
};

export type OrderInfo = {
  reactor: string;
  swapper: string;
  nonce: BigNumber;
  deadline: number;
  additionalValidationContract: string;
  additionalValidationData: string;
};

// options to resolve an order
export type OrderResolutionOptions = {
  timestamp: number;
  filler?: string;
};
