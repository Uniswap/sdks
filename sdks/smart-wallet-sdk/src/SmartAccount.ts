import { ChainId } from '@uniswap/sdk-core'
import { 
  Address, 
  Abi,
  decodeAbiParameters,
  EntryPoint, 
  Hex, 
  PublicClient, 
  toHex,
  encodeFunctionData,
  decodeFunctionData,
  getContract,
  PrivateKeyAccount
} from 'viem'
import { getUserOperati, UserOperationonHash, toSmartAccount, getUserOperationHash, UserOperation } from 'viem/account-abstraction'

import { abi as minimalDelegationAbi } from '../abis/MinimalDelegation.json'
import { ModeType, SMART_WALLET_ADDRESSES, DELEGATION_MAGIC_PREFIX } from './constants'
import { SmartWallet } from './smartWallet'
import { Call } from './types'
import { CALL_ABI_PARAMS } from './utils/callPlanner'
import { sign } from 'viem/accounts'

// Default entry point from ERC-4337
const DEFAULT_ENTRY_POINT: Address = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'

const toUniswapSmartAccountParameters = {
  client: PublicClient,
  chainId: ChainId,
  owner: PrivateKeyAccount,
  entryPoint?: EntryPoint
}

export const toUniswapSmartAccount = (
  client: PublicClient,
  chainId: ChainId,
  owner: PrivateKeyAccount,
  entryPoint?: EntryPoint
) => {
  const contractAddress = SMART_WALLET_ADDRESSES[chainId] as Address
  
  if (!contractAddress) {
    throw new Error(`Smart wallet not found for chainId: ${chainId}`)
  }

  // Create a contract instance for decoding
  const minimalDelegation = getContract({
    address: contractAddress,
    abi: minimalDelegationAbi,
    client
  })

  // Create a smart account using viem's toSmartAccount function
  return toSmartAccount({
    client,
    entryPoint: entryPoint || {
      address: DEFAULT_ENTRY_POINT,
      version: '0.7',
      abi: [],
    },
    
    // Decode calls from calldata
    async decodeCalls(data) {
      try {
        // First, decode the execute function call
        const decodedFunction = decodeFunctionData({
          abi: minimalDelegationAbi,
          data
        })
        
        // TODO: decode

      } catch (error) {
        console.error('Error decoding calls:', error)
      }
      
      // If we can't decode or it's not an execute call, return empty array
      return []
    },
    
    // Encode calls as defined by the Smart Account contract
    async encodeCalls(calls) {
      // Convert from viem format to our internal Call format
      const convertedCalls: Call[] = calls.map(call => ({
        to: call.to,
        data: call.data || '0x',
        value: call.value || 0n
      }))
      
      // Use SmartWallet to encode calls
      const methodParams = SmartWallet.encodeCalls(convertedCalls)
      
      // Create execute calldata with mode
      const mode = ModeType.BATCHED_CALL
      return encodeFunctionData({
        abi: minimalDelegationAbi,
        functionName: 'execute',
        args: [
          mode as Hex,
          methodParams.calldata
        ]
      })
    },
    
    // Get the address of the Smart Account
    async getAddress() {
      // In a full implementation, this would be the address of the
      // delegated contract that wraps the owner
      return contractAddress
    },
    
    // Build the Factory properties for the Smart Account
    async getFactoryArgs() {
      // In a full implementation, this would return the bytecode and
      // initialization args for the minimal delegation contract
      return {
        args: [],
        bytecode: '0x' as Hex
      }
    },
    
    // Get the nonce of the Smart Account
    async getNonce() {
      try {
        return minimalDelegation.read.getNonce();
      } catch (error) {
        console.error('Error fetching nonce:', error)
        return 0n
      }
    },
    
    // Get the stub signature for User Operations
    async getStubSignature() {
      return '0x' as Hex
    },
    
    // Sign message to be verified by the Smart Account contract
    async signMessage(message) {
      throw new Error('Not implemented')
    },
    
    // Sign typed data to be verified by the Smart Account contract
    async signTypedData(typedData) {
      // In a full implementation, this would properly call the
      // owner account to sign the typed data
      return '0x' as Hex
    },
    
    // Sign a User Operation to be broadcasted via the Bundler
    async signUserOperation(parameters) {
      const { chainId = client.chain!.id, ...userOperation } = parameters
      const address = await this.getAddress()
      
      const hash = getUserOperationHash({
        chainId,
        entryPointAddress: entryPoint.address,
        entryPointVersion: entryPoint.version,
        userOperation: {
          ...(userOperation as unknown as UserOperation),
          sender: address,
        },
      })

      if (owner.type === 'address') throw new Error('owner cannot sign')
      const signature = await sign({ hash, owner })

      return wrapSignature({
        ownerIndex,
        signature,
      })
    },
    
    // Optional: User operation configuration
    userOperation: {
      async estimateGas(userOperation) {
        // Placeholder for gas estimation
        const LARGE_LIMIT = 1_000_000n
        
        return {
          callGasLimit: toHex(LARGE_LIMIT),
          preVerificationGas: toHex(LARGE_LIMIT),
          verificationGasLimit: toHex(LARGE_LIMIT)
        }
      },
    },
    
    // Owner account for signing
    source: owner,
  })
}
