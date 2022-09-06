import { BigNumber, ethers, TypedDataDomain, TypedDataField } from 'ethers';

import { PERMIT_POST_MAPPING } from '../constants';
import { MissingConfiguration } from '../errors';

const DOMAIN_NAME = 'PermitPost';
const DOMAIN_VERSION = '1';

export enum TokenType {
  ERC20,
  ERC721,
  ERC1155,
}

export enum SigType {
  Unordered,
  Ordered,
}

type TokenDetails = {
  readonly tokenType: TokenType;
  readonly token: string;
  readonly maxAmount: BigNumber;
  readonly id: BigNumber;
};

export type PermitInfo = {
  readonly sigType: SigType;
  readonly tokens: readonly TokenDetails[];
  readonly spender: string;
  readonly deadline: number;
  readonly witness: string;
  readonly nonce: BigNumber;
};

export type PermitData = {
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
  values: PermitInfo;
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

  getPermitData(info: PermitInfo): PermitData {
    return {
      domain: this.domain,
      types: this.types,
      values: info,
    };
  }

  getPermitDigest(info: PermitInfo): string {
    return ethers.utils._TypedDataEncoder.hash(this.domain, this.types, info);
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
