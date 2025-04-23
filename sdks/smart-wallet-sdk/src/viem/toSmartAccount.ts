import { Address, BaseError, decodeAbiParameters, decodeFunctionData, PrivateKeyAccount, TypedData, TypedDataDefinition } from 'viem';
import { entryPoint08Abi, entryPoint08Address, getUserOperationTypedData, SmartAccount, SmartAccountImplementation, toSmartAccount } from 'viem/account-abstraction'

import abi from '../../abis/MinimalDelegationEntry.json';
import { SmartWallet } from '../smartWallet';
import { BATCHED_CALL_ABI_PARAMS } from '../utils/batchedCallPlanner';

export type ToUniswapSmartAccountParameters = {
    client: UniswapSmartAccountImplementation['client']
    implementation?: Address | undefined
    getNonce?: SmartAccountImplementation['getNonce'] | undefined
    owner: PrivateKeyAccount
}

export type UniswapSmartAccountImplementation = SmartAccountImplementation<
    typeof entryPoint08Abi,
    '0.8',
    { abi: typeof abi; owner: PrivateKeyAccount },
    true
    >

export type ToSimple7702SmartAccountReturnType = SmartAccount<UniswapSmartAccountImplementation>

export async function toUniswapSmartAccount(
    parameters: ToUniswapSmartAccountParameters
): Promise<ToSimple7702SmartAccountReturnType> {
    const {
        client,
        implementation = '0x85479d2AebeFf8445769a265763666c0d3dDC508', // TODO update with new one
        getNonce,
        owner,
      } = parameters
    
      const entryPoint = {
        abi: entryPoint08Abi,
        address: entryPoint08Address,
        version: '0.8',
      } as const

      return toSmartAccount({
        authorization: { account: owner, address: implementation },
        abi,
        client,
        extend: { abi, owner }, // not removing abi from here as this will be a breaking change
        entryPoint,
        getNonce,
    
        async decodeCalls(data: `0x${string}`) {
          const result = decodeFunctionData({
            abi: abi,
            data: data,
          })

          if(!result.args) {
            throw new BaseError(`unable to decode function args for "${result.functionName}"`)
          }
    
          if (result.functionName === 'execute') {
            const decoded = decodeAbiParameters(BATCHED_CALL_ABI_PARAMS, result.args[0] as `0x${string}`)[0]
            return decoded.calls
          }
          throw new BaseError(`unable to decode calls for "${result.functionName}"`)
        },
    
        async encodeCalls(calls) {
            return SmartWallet.encodeBatchedCall(calls, {
                shouldRevert: true,
            }).calldata;
        },
    
        async getAddress() {
          return owner.address
        },
    
        async getFactoryArgs() {
          return { factory: '0x7702', factoryData: '0x' }
        },
    
        async getStubSignature() {
          return '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c'
        },
    
        async signMessage(parameters) {
          const { message } = parameters
          return await owner.signMessage({ message })
        },
    
        async signTypedData(parameters) {
          const { domain, types, primaryType, message } =
            parameters as TypedDataDefinition<TypedData, string>
          return await owner.signTypedData({
            domain,
            message,
            primaryType,
            types,
          })
        },
    
        async signUserOperation(parameters) {
          const { chainId = client.chain!.id, ...userOperation } = parameters
    
          const address = await this.getAddress()
          const typedData = getUserOperationTypedData({
            chainId,
            entryPointAddress: entryPoint.address,
            userOperation: {
              ...userOperation,
              sender: address,
            },
          })
          return await owner.signTypedData(typedData)
        },
      })
}
