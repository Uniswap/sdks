import { SignatureLike } from '@ethersproject/bytes';
import { BigNumber } from 'ethers';
import { PermitData } from '../utils';
export declare type IOrder = {
    info: OrderInfo;
    /**
     * Returns the abi encoded order
     * @return The abi encoded serialized order which can be submitted on-chain
     */
    serialize(): string;
    /**
     * Recovers the given signature, returning the address which created it
     *  * @param signature The signature to recover
     *  * @returns address The address which created the signature
     */
    getSigner(signature: SignatureLike): string;
    /**
     * Returns the data for generating the maker EIP-712 permit signature
     * @return The data for generating the maker EIP-712 permit signature
     */
    permitData(): PermitData;
    /**
     * Returns the order hash
     * @return The order hash which is used as a key on-chain
     */
    hash(): string;
};
export declare type TokenAmount = {
    readonly token: string;
    readonly amount: BigNumber;
};
export declare type OrderInfo = {
    reactor: string;
    nonce: BigNumber;
    deadline: number;
};
