import { BigNumber, BigNumberish } from '@ethersproject/bignumber'
import { Provider } from '@ethersproject/providers'
import { Contract } from '@ethersproject/contracts'
import invariant from 'tiny-invariant'
import Permit2Abi from '../../abis/Permit2.json'
import { PermitTransferFrom, PermitBatchTransferFrom } from '../signatureTransfer'

export interface NonceValidationResult {
  isUsed: boolean
  isExpired: boolean
  isValid: boolean
}

export class SignatureProvider {
  private permit2: Contract

  constructor(private provider: Provider, private permit2Address: string) {
    this.permit2 = new Contract(this.permit2Address, Permit2Abi, this.provider)
  }

  /**
   * Check if a nonce has been used for signature transfers
   * @param owner The owner address
   * @param nonce The nonce to check
   * @returns true if the nonce has been used, false otherwise
   */
  async isNonceUsed(owner: string, nonce: BigNumberish): Promise<boolean> {
    const { wordPos, bitPos } = SignatureProvider.getNoncePositions(nonce)
    
    const bitmap = await this.permit2.nonceBitmap(owner, wordPos)
    return SignatureProvider.isBitSet(bitmap, bitPos)
  }

  /**
   * Check if a permit has expired based on its deadline
   * @param deadline The deadline timestamp
   * @returns true if the permit has expired, false otherwise
   */
  async isExpired(deadline: BigNumberish): Promise<boolean> {
    const currentTimestamp = await this.getCurrentTimestamp()
    return BigNumber.from(deadline).lt(currentTimestamp)
  }

  /**
   * Check if a permit is valid (not expired and nonce not used)
   * @param permit The permit data to validate
   * @returns true if the permit is valid, false otherwise
   */
  async isPermitValid(
    permit: PermitTransferFrom | PermitBatchTransferFrom
  ): Promise<boolean> {
    return (await this.validatePermit(permit)).isValid
  }

  /**
   * Get detailed validation results for a permit
   * @param permit The permit data to validate
   * @returns Object containing validation results
   */
  async validatePermit(
    permit: PermitTransferFrom | PermitBatchTransferFrom
  ): Promise<NonceValidationResult> {
    const [isExpiredResult, isNonceUsedResult] = await Promise.all([
      this.isExpired(permit.deadline),
      this.isNonceUsed(permit.spender, permit.nonce)
    ])

    return {
      isUsed: isNonceUsedResult,
      isExpired: isExpiredResult,
      isValid: !isExpiredResult && !isNonceUsedResult
    }
  }

  /**
   * Get the current nonce bitmap for an owner at a specific word position
   * @param owner The owner address
   * @param wordPos The word position in the bitmap
   * @returns The bitmap as a BigNumber
   */
  async getNonceBitmap(owner: string, wordPos: BigNumberish): Promise<BigNumber> {
    return await this.permit2.nonceBitmap(owner, wordPos)
  }

  /**
   * Check if a specific bit is set in the nonce bitmap
   * @param bitmap The bitmap to check
   * @param bitPos The bit position (0-255)
   * @returns true if the bit is set, false otherwise
   */
  static isBitSet(bitmap: BigNumber, bitPos: number): boolean {
    invariant(bitPos >= 0 && bitPos <= 255, 'BIT_POSITION_OUT_OF_RANGE')
    const mask = BigNumber.from(1).shl(bitPos)
    return bitmap.and(mask).gt(0)
  }

  /**
   * Get the word position and bit position for a given nonce
   * @param nonce The nonce to analyze
   * @returns Object containing wordPos and bitPos
   */
  static getNoncePositions(nonce: BigNumberish): { wordPos: BigNumber; bitPos: number } {
    const nonceBN = BigNumber.from(nonce)
    return {
      wordPos: nonceBN.shr(8),
      bitPos: nonceBN.and(255).toNumber()
    }
  }

  /**
   * Batch check multiple nonces for the same owner
   * @param owner The owner address
   * @param nonces Array of nonces to check
   * @returns Array of boolean results indicating if each nonce is used
   */
  async batchCheckNonces(owner: string, nonces: BigNumberish[]): Promise<boolean[]> {
    // Group nonces by word position to minimize contract calls
    const nonceGroups = new Map<string, number[]>()
    
    nonces.forEach((nonce, index) => {
      const { wordPos } = SignatureProvider.getNoncePositions(nonce)
      const wordPosKey = wordPos.toString()
      
      if (!nonceGroups.has(wordPosKey)) {
        nonceGroups.set(wordPosKey, [])
      }
      nonceGroups.get(wordPosKey)!.push(index)
    })

    // Fetch all required bitmaps
    const bitmapPromises = Array.from(nonceGroups.keys()).map(async (wordPosKey) => {
      const wordPos = BigNumber.from(wordPosKey)
      const bitmap = await this.getNonceBitmap(owner, wordPos)
      return { wordPos, bitmap }
    })

    const bitmaps = await Promise.all(bitmapPromises)
    const bitmapMap = new Map(bitmaps.map(({ wordPos, bitmap }) => [wordPos.toString(), bitmap]))

    // Check each nonce
    return nonces.map((nonce) => {
      const { wordPos, bitPos } = SignatureProvider.getNoncePositions(nonce)
      const bitmap = bitmapMap.get(wordPos.toString())!
      return SignatureProvider.isBitSet(bitmap, bitPos)
    })
  }

  /**
   * Get the current block timestamp
   * @returns Current block timestamp
   */
  async getCurrentTimestamp(): Promise<number> {
    const currentBlock = await this.provider.getBlock('latest')
    return currentBlock.timestamp
  }
}
