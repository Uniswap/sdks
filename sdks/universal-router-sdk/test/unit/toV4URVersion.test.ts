import { expect } from 'chai'
import { URVersion } from '@uniswap/v4-sdk'
import { toV4URVersion } from '../../src/utils/toV4URVersion'
import { UniversalRouterVersion } from '../../src/utils/constants'

describe('toV4URVersion', () => {
  it('maps each UR version to the matching v4-sdk URVersion', () => {
    expect(toV4URVersion(UniversalRouterVersion.V2_0)).to.equal(URVersion.V2_0)
    expect(toV4URVersion(UniversalRouterVersion.V2_1_1)).to.equal(URVersion.V2_1_1)
    expect(toV4URVersion(UniversalRouterVersion.V2_2_0)).to.equal(URVersion.V2_2_0)
  })

  it('defaults to V2_0 when version is undefined', () => {
    expect(toV4URVersion(undefined)).to.equal(URVersion.V2_0)
  })

  it('throws for UR versions with no v4-sdk equivalent', () => {
    // v4 actions do not exist pre-V2, so V1_2 has no URVersion
    expect(() => toV4URVersion(UniversalRouterVersion.V1_2)).to.throw('No v4-sdk URVersion mapping')
  })

  it('throws for an unknown version value', () => {
    expect(() => toV4URVersion('9.9.9' as UniversalRouterVersion)).to.throw('No v4-sdk URVersion mapping')
  })

  // contract: every UR version whose string also exists in URVersion must resolve to it.
  // guards both enums staying in sync as new contract versions land.
  it('resolves every UR version that shares a string with URVersion', () => {
    const urVersionValues = new Set<string>(Object.values(URVersion))
    for (const version of Object.values(UniversalRouterVersion)) {
      if (urVersionValues.has(version)) {
        expect(toV4URVersion(version)).to.equal(version)
      } else {
        expect(() => toV4URVersion(version)).to.throw('No v4-sdk URVersion mapping')
      }
    }
  })
})
