import { BaseProvider } from "@ethersproject/providers";
import { BigNumber } from "ethers";
/**
 * Helper to track Permit2 nonces for addresses
 */
export declare class NonceManager {
    private provider;
    private permit2;
    private currentWord;
    private currentBitmap;
    constructor(provider: BaseProvider, chainId: number, permit2Address?: string);
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
interface CancelParams {
    word: BigNumber;
    mask: BigNumber;
}
export declare function getCancelSingleParams(nonceToCancel: BigNumber): CancelParams;
export declare function getCancelMultipleParams(noncesToCancel: BigNumber[]): CancelParams[];
export {};
