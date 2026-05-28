import { URVersion } from '@uniswap/v4-sdk'
import { UniversalRouterVersion } from './constants'

// the one sanctioned bridge to v4-sdk's URVersion — UniversalRouterVersion and URVersion share string values,
// so resolve by value: new versions map without code changes, as long as both enums stay in sync.
const URVERSION_VALUES = new Set<string>(Object.values(URVersion))

export function toV4URVersion(version?: UniversalRouterVersion): URVersion {
  if (version === undefined) return URVersion.V2_0
  if (!URVERSION_VALUES.has(version)) {
    throw new Error(`No v4-sdk URVersion mapping for UniversalRouterVersion: ${version}`)
  }
  return version as unknown as URVersion
}
