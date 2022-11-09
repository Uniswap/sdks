import { TypedDataDomain, TypedDataField } from '@ethersproject/abstract-signer'
import { _TypedDataEncoder } from '@ethersproject/hash'
import { permit2Domain } from './domain'

export interface PermitDetails {
  token: string
  amount: string
  expiration: string
  nonce: number
}

export interface PermitSingle {
  details: PermitDetails
  spender: string
  sigDeadline: string
}

export interface PermitBatch {
  details: PermitDetails[]
  spender: string
  sigDeadline: string
}

export type PermitSingleData = {
  domain: TypedDataDomain
  types: Record<string, TypedDataField[]>
  values: PermitSingle
}

export type PermitBatchData = {
  domain: TypedDataDomain
  types: Record<string, TypedDataField[]>
  values: PermitBatch
}

const PERMIT_DETAILS = [
  { name: 'token', type: 'address' },
  { name: 'amount', type: 'uint160' },
  { name: 'expiration', type: 'uint64' },
  { name: 'nonce', type: 'uint32' },
]

const PERMIT_TYPES = {
  PermitSingle: [
    { name: 'details', type: 'PermitDetails' },
    { name: 'spender', type: 'address' },
    { name: 'sigDeadline', type: 'uint256' },
  ],
  PermitDetails: PERMIT_DETAILS,
}

const PERMIT_BATCH_TYPES = {
  PermitBatch: [
    { name: 'details', type: 'PermitDetails[]' },
    { name: 'spender', type: 'address' },
    { name: 'sigDeadline', type: 'uint256' },
  ],
  PermitDetails: PERMIT_DETAILS,
}

function isPermit(permit: PermitSingle | PermitBatch): permit is PermitSingle {
  return !Array.isArray(permit.details)
}

export abstract class AllowanceTransfer {
  /**
   * Cannot be constructed.
   */
  private constructor() {}

  // return the data to be sent in a eth_signTypedData RPC call
  // for signing the given permit data
  public static getPermitData(
    permit: PermitSingle | PermitBatch,
    permit2Address: string,
    chainId: number
  ): PermitSingleData | PermitBatchData {
    const domain = permit2Domain(permit2Address, chainId)
    if (isPermit(permit)) {
      return {
        domain,
        types: PERMIT_TYPES,
        values: permit,
      }
    } else {
      return {
        domain,
        types: PERMIT_BATCH_TYPES,
        values: permit,
      }
    }
  }

  public static hash(permit: PermitSingle | PermitBatch, permit2Address: string, chainId: number): string {
    const { domain, types, values } = AllowanceTransfer.getPermitData(permit, permit2Address, chainId)
    return _TypedDataEncoder.hash(domain, types, values)
  }
}
