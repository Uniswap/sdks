import { TypedDataDomain, TypedDataField } from '@ethersproject/abstract-signer';
import { BigNumberish, BigNumber } from '@ethersproject/bignumber';
import { Provider } from '@ethersproject/providers';

interface PermitDetails {
    token: string;
    amount: BigNumberish;
    expiration: BigNumberish;
    nonce: BigNumberish;
}
interface PermitSingle {
    details: PermitDetails;
    spender: string;
    sigDeadline: BigNumberish;
}
interface PermitBatch {
    details: PermitDetails[];
    spender: string;
    sigDeadline: BigNumberish;
}
type PermitSingleData = {
    domain: TypedDataDomain;
    types: Record<string, TypedDataField[]>;
    values: PermitSingle;
};
type PermitBatchData = {
    domain: TypedDataDomain;
    types: Record<string, TypedDataField[]>;
    values: PermitBatch;
};
declare abstract class AllowanceTransfer {
    /**
     * Cannot be constructed.
     */
    private constructor();
    static getPermitData(permit: PermitSingle | PermitBatch, permit2Address: string, chainId: number): PermitSingleData | PermitBatchData;
    static hash(permit: PermitSingle | PermitBatch, permit2Address: string, chainId: number): string;
}

interface Witness {
    witness: any;
    witnessTypeName: string;
    witnessType: Record<string, TypedDataField[]>;
}
interface TokenPermissions {
    token: string;
    amount: BigNumberish;
}
interface PermitTransferFrom {
    permitted: TokenPermissions;
    spender: string;
    nonce: BigNumberish;
    deadline: BigNumberish;
}
interface PermitBatchTransferFrom {
    permitted: TokenPermissions[];
    spender: string;
    nonce: BigNumberish;
    deadline: BigNumberish;
}
type PermitTransferFromData = {
    domain: TypedDataDomain;
    types: Record<string, TypedDataField[]>;
    values: PermitTransferFrom;
};
type PermitBatchTransferFromData = {
    domain: TypedDataDomain;
    types: Record<string, TypedDataField[]>;
    values: PermitBatchTransferFrom;
};
declare abstract class SignatureTransfer {
    /**
     * Cannot be constructed.
     */
    private constructor();
    static getPermitData(permit: PermitTransferFrom | PermitBatchTransferFrom, permit2Address: string, chainId: number, witness?: Witness): PermitTransferFromData | PermitBatchTransferFromData;
    static hash(permit: PermitTransferFrom | PermitBatchTransferFrom, permit2Address: string, chainId: number, witness?: Witness): string;
}

interface AllowanceData {
    amount: BigNumber;
    nonce: number;
    expiration: number;
}
declare class AllowanceProvider {
    private provider;
    private permit2Address;
    private permit2;
    constructor(provider: Provider, permit2Address: string);
    getAllowanceData(token: string, owner: string, spender: string): Promise<AllowanceData>;
    getAllowance(token: string, owner: string, spender: string): Promise<BigNumber>;
    getNonce(token: string, owner: string, spender: string): Promise<number>;
    getExpiration(token: string, owner: string, spender: string): Promise<number>;
}

interface NonceValidationResult {
    isUsed: boolean;
    isExpired: boolean;
    isValid: boolean;
}
declare class SignatureProvider {
    private provider;
    private permit2Address;
    private permit2;
    constructor(provider: Provider, permit2Address: string);
    /**
     * Check if a nonce has been used for signature transfers
     * @param owner The owner address
     * @param nonce The nonce to check
     * @returns true if the nonce has been used, false otherwise
     */
    isNonceUsed(owner: string, nonce: BigNumberish): Promise<boolean>;
    /**
     * Check if a permit has expired based on its deadline
     * @param deadline The deadline timestamp
     * @returns true if the permit has expired, false otherwise
     */
    isExpired(deadline: BigNumberish): Promise<boolean>;
    /**
     * Check if a permit is valid (not expired and nonce not used)
     * @param permit The permit data to validate
     * @returns true if the permit is valid, false otherwise
     */
    isPermitValid(permit: PermitTransferFrom | PermitBatchTransferFrom): Promise<boolean>;
    /**
     * Get detailed validation results for a permit
     * @param permit The permit data to validate
     * @returns Object containing validation results
     */
    validatePermit(permit: PermitTransferFrom | PermitBatchTransferFrom): Promise<NonceValidationResult>;
    /**
     * Get the current nonce bitmap for an owner at a specific word position
     * @param owner The owner address
     * @param wordPos The word position in the bitmap
     * @returns The bitmap as a BigNumber
     */
    getNonceBitmap(owner: string, wordPos: BigNumberish): Promise<BigNumber>;
    /**
     * Check if a specific bit is set in the nonce bitmap
     * @param bitmap The bitmap to check
     * @param bitPos The bit position (0-255)
     * @returns true if the bit is set, false otherwise
     */
    static isBitSet(bitmap: BigNumber, bitPos: number): boolean;
    /**
     * Get the word position and bit position for a given nonce
     * @param nonce The nonce to analyze
     * @returns Object containing wordPos and bitPos
     */
    static getNoncePositions(nonce: BigNumberish): {
        wordPos: BigNumber;
        bitPos: number;
    };
    /**
     * Batch check multiple nonces for the same owner
     * @param owner The owner address
     * @param nonces Array of nonces to check
     * @returns Array of boolean results indicating if each nonce is used
     */
    batchCheckNonces(owner: string, nonces: BigNumberish[]): Promise<boolean[]>;
    /**
     * Get the current block timestamp
     * @returns Current block timestamp
     */
    getCurrentTimestamp(): Promise<number>;
}

declare const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
declare function permit2Address(chainId?: number): string;
declare const MaxUint48: BigNumber;
declare const MaxUint160: BigNumber;
declare const MaxUint256: BigNumber;
declare const MaxAllowanceTransferAmount: BigNumber;
declare const MaxAllowanceExpiration: BigNumber;
declare const MaxOrderedNonce: BigNumber;
declare const MaxSignatureTransferAmount: BigNumber;
declare const MaxUnorderedNonce: BigNumber;
declare const MaxSigDeadline: BigNumber;
declare const InstantExpiration: BigNumber;

export { type AllowanceData, AllowanceProvider, AllowanceTransfer, InstantExpiration, MaxAllowanceExpiration, MaxAllowanceTransferAmount, MaxOrderedNonce, MaxSigDeadline, MaxSignatureTransferAmount, MaxUint160, MaxUint256, MaxUint48, MaxUnorderedNonce, type NonceValidationResult, PERMIT2_ADDRESS, type PermitBatch, type PermitBatchData, type PermitBatchTransferFrom, type PermitBatchTransferFromData, type PermitDetails, type PermitSingle, type PermitSingleData, type PermitTransferFrom, type PermitTransferFromData, SignatureProvider, SignatureTransfer, type TokenPermissions, type Witness, permit2Address };
