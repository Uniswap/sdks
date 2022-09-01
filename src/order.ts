import { SignatureLike } from '@ethersproject/bytes';

export interface IOrder {
  /**
   * Returns the abi encoded order
   */
  serialize(): string;

  /**
   * Returns the msg digest that is signed over for order validation and token
   * release
   */
  digest(): string;

  verifySignature(signature: SignatureLike): boolean;
}
