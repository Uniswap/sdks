import { ethers, TypedDataDomain, TypedDataField, BigNumber } from 'ethers';
import { PERMIT_POST_MAPPING } from '../constants';

const DOMAIN_NAME = 'PermitPost';
const DOMAIN_VERSION = '1';
const UNORDERED_SIG_TYPE = 0;

export enum TokenType {
  ERC20,
  ERC721,
  ERC1155,
}

interface TokenDetails {
  tokenType: TokenType,
  token: string;
  maxAmount: BigNumber;
  id: BigNumber;
}

interface PermitInfo {
  tokens: TokenDetails[];
  spender: string;
  deadline: number;
  witness: string;
  nonce: number;
}

export class PermitPost {
  private permitPostAddress: string;

  constructor(private chainId: number, address?: string) {
    if (address) {
      this.permitPostAddress = address;
    } else if (PERMIT_POST_MAPPING[chainId]) {
      this.permitPostAddress = PERMIT_POST_MAPPING[chainId];
    } else {
      throw new Error(`No configured permitPost for chainId: ${chainId}`);
    }
  }

  getPermitDigest(info: PermitInfo): string {
    const values = Object.assign(info, { sigType: UNORDERED_SIG_TYPE });
    return ethers.utils._TypedDataEncoder.hash(this.domain, this.types, values);
  }

  get domain(): TypedDataDomain {
    return {
      name: DOMAIN_NAME,
      version: DOMAIN_VERSION,
      chainId: this.chainId,
      verifyingContract: this.permitPostAddress,
    };
  }

  get types(): Record<string, Array<TypedDataField>> {
    return {
      Permit: [
        { name: 'sigType', type: 'uint8', },
        { name: 'tokens', type: 'TokenDetails[]', },
        { name: 'spender', type: 'address', },
        { name: 'deadline', type: 'uint256', },
        { name: 'witness', type: 'bytes32', },
        { name: 'nonce', type: 'uint256', }
      ],
      TokenDetails: [
        { name: 'tokenType', type: 'uint8', },
        { name: 'token', type: 'address', },
        { name: 'maxAmount', type: 'uint256', },
        { name: 'id', type: 'uint256', },
      ],
    };
  }
}

