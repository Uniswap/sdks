import type { Currency } from '@uniswap/sdk-core'
import { type Address, getAddress, zeroAddress } from 'viem'

/** Case-insensitive address equality (both sides may be checksummed or lower-cased). */
export function eqAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** True when two currencies are the same logical asset, treating native ETH and its WETH as one. */
export function sameCurrency(a: Currency, b: Currency): boolean {
  return a.wrapped.equals(b.wrapped)
}

/** Address a currency presents in a v4 PoolKey: `address(0)` for native, else its checksummed wrapped token. */
export function v4Address(c: Currency): Address {
  return c.isNative ? zeroAddress : getAddress(c.wrapped.address)
}

/** Whether a leg currency corresponds to a v4 PoolKey currency address, honoring native/WETH duality. */
export function matchesV4Currency(c: Currency, addr: Address, weth: Address): boolean {
  if (eqAddress(v4Address(c), addr)) return true
  // native/WETH interop: a native-denominated pool (addr 0x0) accepts WETH, and a WETH pool accepts native.
  if (eqAddress(addr, zeroAddress) && !c.isNative && eqAddress(c.wrapped.address, weth)) return true
  if (eqAddress(addr, weth) && c.isNative) return true
  return false
}

/**
 * The v4 PoolKey currency addresses a currency can legitimately appear under. Native and WETH are
 * interchangeable in v4 (a native-denominated pool uses `address(0)`, a WETH pool uses the WETH
 * token), so a WETH or native side expands to BOTH representations; any other token is just itself.
 */
export function v4Representations(c: Currency, weth: Address): Address[] {
  if (c.isNative) return [zeroAddress, getAddress(weth)]
  if (eqAddress(c.wrapped.address, weth)) return [getAddress(weth), zeroAddress]
  return [getAddress(c.wrapped.address)]
}
