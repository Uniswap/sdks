import type { Address } from 'viem'

import type { CurrencyRef } from '../types'

/**
 * Type guard that narrows a CurrencyRef to the literal 'native' string.
 */
export function isNative(c: CurrencyRef): c is 'native' {
  return c === 'native'
}

/**
 * Converts a CurrencyRef to a graph node address.
 * 'native' is normalized to the wrappedNative address; all addresses are lowercased.
 */
export function toGraphNode(c: CurrencyRef, wrappedNative: Address): Address {
  return (c === 'native' ? wrappedNative : c).toLowerCase() as Address
}

/**
 * Sorts two addresses in stable, case-insensitive order.
 * Returns the lower numeric value first (when compared as lowercased hex).
 */
export function sortAddresses(a: Address, b: Address): [Address, Address] {
  const aLower = a.toLowerCase()
  const bLower = b.toLowerCase()
  return aLower < bLower ? [a, b] : [b, a]
}

/**
 * Checks if two CurrencyRefs refer to the exact same token.
 */
export function sameToken(a: CurrencyRef, b: CurrencyRef): boolean {
  if (a === 'native') return b === 'native'
  if (b === 'native') return false
  return a.toLowerCase() === b.toLowerCase()
}

/**
 * Checks if two CurrencyRefs are in the same token family.
 * 'native' and the wrappedNative address belong to the same family;
 * two concrete addresses are in the same family if they refer to the same token.
 */
export function sameFamily(a: CurrencyRef, b: CurrencyRef, wrappedNative: Address): boolean {
  // Convert both to graph node form (normalize 'native' to wrappedNative, lowercase all)
  const aNode = toGraphNode(a, wrappedNative)
  const bNode = toGraphNode(b, wrappedNative)
  return aNode === bNode
}
