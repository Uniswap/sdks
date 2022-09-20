import { BigNumber } from 'ethers';
import { BaseProvider } from '@ethersproject/providers';
/**
 * Helper to track PermitPost nonces for addresses
 */
export declare class NonceManager {
    private provider;
    private permitPost;
    private currentWord;
    private currentBitmap;
    constructor(provider: BaseProvider, chainId: number, permitPostAddress?: string);
    /**
     * Finds the next unused nonce and returns it
     * Marks the nonce as used so it won't be returned again from this instance
     * NOTE: if any nonce usages are in-flight and created outside of this instance,
     * this function will not know about them and will return duplicates
     */
    useNonce(address: string): Promise<BigNumber>;
    isUsed(address: string, nonce: BigNumber): Promise<boolean>;
    private getNextOpenWord;
}
interface SplitNonce {
    word: BigNumber;
    bitPos: BigNumber;
}
export declare function splitNonce(nonce: BigNumber): SplitNonce;
export declare function buildNonce(word: BigNumber, bitPos: number): BigNumber;
export declare function getFirstUnsetBit(bitmap: BigNumber): number;
export declare function setBit(bitmap: BigNumber, bitPos: number): BigNumber;
export {};
