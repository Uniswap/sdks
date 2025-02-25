import { Provider } from "@ethersproject/providers";
import { PERMISSIONED_TOKENS } from "../constants";
import { Proxy__factory, DSTokenInterface__factory, DSTokenInterface } from "../contracts";

export class PermissionedTokenValidator {
  private provider: Provider;

  constructor(provider: Provider) {
    this.provider = provider;
  }

  /**
   * Checks if a transfer would be allowed for a permissioned token
   * @param tokenAddress The address of the permissioned token
   * @param from The sender's address
   * @param to The recipient's address 
   * @param value The amount to transfer (in base units)
   * @returns True if the token is not a permissioned token or the transfer is 
   * allowed, false otherwise
   */
  async preTransferCheck(
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
      const proxyContract = Proxy__factory.connect(tokenAddress, this.provider);
      const targetAddress = await proxyContract.target();
      tokenContract = DSTokenInterface__factory.connect(targetAddress, this.provider);
    } else {
      tokenContract = DSTokenInterface__factory.connect(tokenAddress, this.provider);
    }
    
    const [code, _reason] = await tokenContract.preTransferCheck(from, to, value);
    
    return code.toNumber() === 0;
  }
} 