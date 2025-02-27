import { Provider } from "@ethersproject/providers";
import { ChainId } from "@uniswap/sdk-core";

import { PERMISSIONED_TOKENS } from "../constants";
import { DSTokenInterface, DSTokenInterface__factory, Proxy__factory } from "../contracts";

export class PermissionedTokenValidator {

    /**
     * Checks if a token is a permissioned token
     * @param tokenAddress The address of the token
     * @returns True if the token is a permissioned token, false otherwise
     */
    static isPermissionedToken(tokenAddress: string, chainId: ChainId): boolean {
        return PERMISSIONED_TOKENS.some(token => token.address.toLowerCase() === tokenAddress.toLowerCase() && token.chainId === chainId);
    }

  /**
   * Checks if a transfer would be allowed for a permissioned token
   * @param provider The provider to use for the view call
   * @param tokenAddress The address of the permissioned token
   * @param from The sender's address
   * @param to The recipient's address 
   * @param value The amount to transfer (in base units)
   * @returns True if the token is not a permissioned token or the transfer is 
   * allowed, false otherwise
   * @throws Will throw an exception if there is an error with the provider
   */
  static async preTransferCheck(
    provider: Provider,
    tokenAddress: string,
    from: string,
    to: string,
    value: string
  ): Promise<boolean> {
    const token = PERMISSIONED_TOKENS.find(
      token => token.address.toLowerCase() === tokenAddress.toLowerCase()
    );
    // If the token is not in the list, we don't need to check anything
    if (!token) {
      return true;
    }

    let tokenContract: DSTokenInterface;
    
    if (token.usesProxy) {
      const proxyContract = Proxy__factory.connect(tokenAddress, provider);
      const targetAddress = await proxyContract.target();
      tokenContract = DSTokenInterface__factory.connect(targetAddress, provider);
    } else {
      tokenContract = DSTokenInterface__factory.connect(tokenAddress, provider);
    }
    
    const [code, _reason] = await tokenContract.preTransferCheck(from, to, value);
    
    return code.toNumber() === 0;
  }
} 