import { SignatureLike } from "@ethersproject/bytes";
import { PermitTransferFromData } from "@uniswap/permit2-sdk";
import { BigNumber } from "ethers";

export type IOrder = {
  // TODO: maybe add generic types for more order-type specific info
  info: OrderInfo;

  // expose the chainid
  chainId: number;

  // TODO: maybe add generic order info getters, i.e.
  // affectedTokens, validTimes, max amounts?
  // not yet sure what is useful / generic here

  /**
   * Returns the abi encoded order
   * @return The abi encoded serialized order which can be submitted on-chain
   */
  serialize(): string;

  /**
   * Recovers the given signature, returning the address which created it
   *  * @param signature The signature to recover
   *  * @returns address The address which created the signature
   */
  getSigner(signature: SignatureLike): string;

  /**
   * Returns the data for generating the maker EIP-712 permit signature
   * @return The data for generating the maker EIP-712 permit signature
   */
  permitData(): PermitTransferFromData;

  /**
   * Returns the order hash
   * @return The order hash which is used as a key on-chain
   */
  hash(): string;
};

export type TokenAmount = {
  readonly token: string;
  readonly amount: BigNumber;
};

export type OrderInfo = {
  reactor: string;
  offerer: string;
  nonce: BigNumber;
  deadline: number;
};
