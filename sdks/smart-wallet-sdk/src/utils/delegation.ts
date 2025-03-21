import { Address, TransactionEIP7702 } from 'viem'
import { recoverAuthorizationAddress, SignedAuthorization, SignedAuthorizationList } from 'viem/experimental'

import { DELEGATION_MAGIC_PREFIX } from '../constants'

export type RecoveredAuthorizationMap = Record<Address, SignedAuthorization>

export class Delegation {
    /**
     * Recovers the signers of each authorization within the list sent in the transaction
     * @dev this can also return just the contractAddress each signer is delegated to
     * @param transaction : TransactionEIP7702
     * @returns : Promise<RecoveredAuthorizationMap>
     */
    public static parseAuthorizationListFromTransaction(transaction: TransactionEIP7702): Promise<RecoveredAuthorizationMap> {
        return this.parseAuthorizationList(transaction.authorizationList)
    }

    /**
     * Recovers the signers of each authorization in the list
     * @param authorizationList : SignedAuthorizationList
     * @returns : Promise<RecoveredAuthorizationMap>
     */
    public static async parseAuthorizationList(authorizationList: SignedAuthorizationList): Promise<RecoveredAuthorizationMap> {
        // recover each authorization
        const result: RecoveredAuthorizationMap = {}
        for (const authorization of authorizationList) {
            const signer = await recoverAuthorizationAddress({ authorization })
            result[signer] = authorization
        }
        return result
    }

    /// Parses a delegation from an address's code
    /// @dev will throw if the code is not a valid delegation per EIP7702 spec
    public static parseFromCode(code: `0x${string}`): Address {
        if(code.length !== 48) {
          throw new Error(`Invalid delegation length: ${code.length}`)
        }
        // parse out magic prefix which is 4 bytes
        const magicPrefix = code.slice(0, 8)
        if(magicPrefix !== DELEGATION_MAGIC_PREFIX) {
          throw new Error(`Invalid delegation magic prefix: ${magicPrefix}`)
        }
        const delegation = code.slice(8)
        return `0x${delegation}` as Address
    }
}
