import { BigNumber, ethers } from 'ethers';
import { BaseProvider } from '@ethersproject/providers';

import { PERMIT_POST_MAPPING } from '../constants';
import { PermitPost, PermitPost__factory } from '../contracts';
import { MissingConfiguration } from '../errors';

interface NonceData {
  word: BigNumber;
  bitmap: BigNumber;
}

/**
 * Helper to track PermitPost nonces for addresses
 */
export class NonceManager {
  private permitPost: PermitPost;
  private currentWord: Map<string, BigNumber>;
  private currentBitmap: Map<string, BigNumber>;

  constructor(
    private provider: BaseProvider,
    chainId: number,
    permitPostAddress?: string
  ) {
    if (permitPostAddress) {
      this.permitPost = PermitPost__factory.connect(
        permitPostAddress,
        provider
      );
    } else if (PERMIT_POST_MAPPING[chainId]) {
      this.permitPost = PermitPost__factory.connect(
        PERMIT_POST_MAPPING[chainId],
        this.provider
      );
    } else {
      throw new MissingConfiguration('orderQuoter', chainId.toString());
    }

    this.currentWord = new Map();
    this.currentBitmap = new Map();
  }

  /**
   * Finds the next unused nonce and returns it
   * Marks the nonce as used so it won't be returned again from this instance
   * NOTE: if any nonce usages are in-flight and created outside of this instance,
   * this function will not know about them and will return duplicates
   */
  async useNonce(address: string): Promise<BigNumber> {
    const { word, bitmap } = await this.getNextOpenWord(address);
    const bitPos = getFirstUnsetBit(bitmap);

    this.currentWord.set(address, word);
    this.currentBitmap.set(address, setBit(bitmap, bitPos));

    return buildNonce(word, bitPos);
  }

  // Returns the first word that contains empty bits
  private async getNextOpenWord(address: string): Promise<NonceData> {
    let currentWord: BigNumber =
      this.currentWord.get(address) || BigNumber.from(0);
    let bitmap =
      this.currentBitmap.get(address) ||
      (await this.permitPost.nonceBitmap(address, currentWord));

    while (bitmap.eq(ethers.constants.MaxUint256)) {
      currentWord = currentWord.add(1);
      bitmap = await this.permitPost.nonceBitmap(address, currentWord);
    }

    return {
      word: currentWord,
      bitmap: bitmap,
    };
  }
}

// Builds a permitPost nonce from the given word and bitPos
export function buildNonce(word: BigNumber, bitPos: number): BigNumber {
  // word << 8
  const shiftedWord = word.mul(256);
  return shiftedWord.add(bitPos);
}

// Returns the position of the first unset bit
// Returns -1 if all bits are set
export function getFirstUnsetBit(bitmap: BigNumber): number {
  // Optimization if switch to library w/ bitwise operators:
  // return ~bitmap + (bitmap + 1)
  // instead we have to do a loop

  for (let i = 0; i < 256; i++) {
    if (
      bitmap
        .div(BigNumber.from(2).pow(i))
        .mod(2)
        .eq(0)
    ) {
      return i;
    }
  }
  return -1;
}

// Returns the given bignumber with the given bit set
// Does nothing if the given bit is already set
export function setBit(bitmap: BigNumber, bitPos: number): BigNumber {
  // Optimization if switch to library w/ bitwise operators:
  // return bitmap & (1 << bitPos)

  const mask: BigNumber = BigNumber.from(2).pow(bitPos);
  if (
    bitmap
      .div(mask)
      .mod(2)
      .eq(1)
  ) {
    return bitmap;
  }

  return bitmap.add(mask);
}
