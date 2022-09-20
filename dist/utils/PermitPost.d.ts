import { BigNumber, TypedDataDomain, TypedDataField } from 'ethers';
export declare enum TokenType {
    ERC20 = 0,
    ERC721 = 1,
    ERC1155 = 2
}
export declare enum SigType {
    Unordered = 0,
    Ordered = 1
}
declare type TokenDetails = {
    readonly tokenType: TokenType;
    readonly token: string;
    readonly maxAmount: BigNumber;
    readonly id: BigNumber;
};
export declare type PermitInfo = {
    readonly sigType: SigType;
    readonly tokens: readonly TokenDetails[];
    readonly spender: string;
    readonly deadline: number;
    readonly witness: string;
    readonly nonce: BigNumber;
};
export declare type PermitData = {
    domain: TypedDataDomain;
    types: Record<string, TypedDataField[]>;
    values: PermitInfo;
};
export declare class PermitPost {
    private readonly chainId;
    private readonly permitPostAddress;
    constructor(chainId: number, address?: string);
    getPermitData(info: PermitInfo): PermitData;
    getPermitDigest(info: PermitInfo): string;
    get domain(): TypedDataDomain;
    get types(): Record<string, TypedDataField[]>;
}
export {};
