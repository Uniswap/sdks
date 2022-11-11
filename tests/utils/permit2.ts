import { Wallet } from 'ethers'
import { AllowanceTransfer, PermitSingle } from '@uniswap/permit2-sdk'
import { PERMIT2_ADDRESS } from '../../src/utils/constants'
import { Permit2Permit } from '../../src/utils/permit2'

/// returns signature bytes
export async function generatePermitSignature(permit: PermitSingle, signer: Wallet, chainId: number): Promise<string> {
  const { domain, types, values } = AllowanceTransfer.getPermitData(permit, PERMIT2_ADDRESS, chainId)
  return await signer._signTypedData(domain, types, values)
}

export function toInputPermit(signature: string, permit: PermitSingle): Permit2Permit {
  return {
    ...permit,
    signature,
  }
}
