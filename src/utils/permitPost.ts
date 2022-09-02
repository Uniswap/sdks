import { BigNumber, ethers, TypedDataDomain, TypedDataField } from 'ethers';

import { PERMIT_POST_MAPPING } from '../constants';
import { MissingConfiguration } from '../errors';

const DOMAIN_NAME = 'PermitPost';
const DOMAIN_VERSION = '1';
const UNORDERED_SIG_TYPE = 0;

export enum TokenType {
  ERC20,
  ERC721,
  ERC1155,
}

type TokenDetails = {
  readonly tokenType: TokenType;
  readonly token: string;
  readonly maxAmount: BigNumber;
  readonly id: BigNumber;
};

type PermitInfo = {
  readonly tokens: readonly TokenDetails[];
  readonly spender: string;
  readonly deadline: number;
  readonly witness: string;
  readonly nonce: BigNumber;
};

export class PermitPost {
  private readonly permitPostAddress: string;

  constructor(private readonly chainId: number, address?: string) {
    if (address) {
      this.permitPostAddress = address;
    } else if (PERMIT_POST_MAPPING[chainId]) {
      this.permitPostAddress = PERMIT_POST_MAPPING[chainId];
    } else {
      throw new MissingConfiguration(
        'permitPost with chainId',
        chainId.toString()
      );
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

  get types(): Record<string, TypedDataField[]> {
    return {
      Permit: [
        { name: 'sigType', type: 'uint8' },
        { name: 'tokens', type: 'TokenDetails[]' },
        { name: 'spender', type: 'address' },
        { name: 'deadline', type: 'uint256' },
        { name: 'witness', type: 'bytes32' },
        { name: 'nonce', type: 'uint256' },
      ],
      TokenDetails: [
        { name: 'tokenType', type: 'uint8' },
        { name: 'token', type: 'address' },
        { name: 'maxAmount', type: 'uint256' },
        { name: 'id', type: 'uint256' },
      ],
    };
  }
}
