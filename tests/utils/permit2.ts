import { ethers, Wallet, TypedDataDomain, TypedDataField } from 'ethers'
import { BigintIsh } from '@uniswap/sdk-core'
import { PERMIT2_ADDRESS } from '../../src/utils/constants'
import { PermitSingle, Permit2Permit } from '../../src/utils/permit2'

const DOMAIN_NAME = 'Permit2'

function domain(chainId: number): TypedDataDomain {
  return {
    name: DOMAIN_NAME,
    chainId,
    verifyingContract: PERMIT2_ADDRESS,
  }
}

function permitSingle(): Record<string, TypedDataField[]> {
  return {
    PermitSingle: [
      { name: 'details', type: 'PermitDetails' },
      { name: 'spender', type: 'address' },
      { name: 'sigDeadline', type: 'uint256' },
    ],
    PermitDetails: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint64' },
      { name: 'nonce', type: 'uint32' },
    ],
  }
}

/// returns signature bytes
export async function generatePermitSignature(permit: PermitSingle, signer: Wallet, chainId: number): Promise<string> {
  return await signer._signTypedData(domain(chainId), permitSingle(), permit)
}

export function toInputPermit(signature: string, permit: PermitSingle): Permit2Permit {
  return {
    ...permit,
    signature,
  }
}
