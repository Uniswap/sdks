import { expect } from 'chai'
import {
  UniversalRouterVersion,
  UNIVERSAL_ROUTER_ADDRESS,
  UNIVERSAL_ROUTER_CREATION_BLOCK,
  CHAIN_CONFIGS,
} from '../../src/utils/constants'

describe('Universal Router Constants', () => {
  // only the chain numbers that have a router deployed
  const chainIds = Object.keys(CHAIN_CONFIGS).map(Number)
  const versions = Object.keys(CHAIN_CONFIGS[1].routerConfigs) as unknown as UniversalRouterVersion[]

  describe('UNIVERSAL_ROUTER_ADDRESS', () => {
    versions.forEach((version) => {
      chainIds.forEach((chainId) => {
        it(`should return a valid address for version ${UniversalRouterVersion[version]} on chain ${chainId}`, () => {
          const address = UNIVERSAL_ROUTER_ADDRESS(version, chainId)
          expect(address).to.be.a('string')
          expect(address).to.match(/^0x[a-fA-F0-9]{40}$/)
          expect(address).to.equal(UNIVERSAL_ROUTER_ADDRESS(version, chainId))
        })
      })
    })

    it('should throw an error for an unsupported chain', () => {
      expect(() => UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V1_2, 999999)).to.throw(
        'Universal Router not deployed on chain 999999'
      )
    })
  })

  describe('UNIVERSAL_ROUTER_CREATION_BLOCK', () => {
    versions.forEach((version) => {
      chainIds.forEach((chainId) => {
        it(`should return a valid block number for version ${UniversalRouterVersion[version]} on chain ${chainId}`, () => {
          const blockNumber = UNIVERSAL_ROUTER_CREATION_BLOCK(version, chainId)
          expect(blockNumber).to.be.a('number')
          expect(blockNumber).to.be.greaterThan(0)
          expect(blockNumber).to.equal(UNIVERSAL_ROUTER_CREATION_BLOCK(version, chainId))
        })
      })
    })

    it('should throw an error for an unsupported chain', () => {
      expect(() => UNIVERSAL_ROUTER_CREATION_BLOCK(UniversalRouterVersion.V1_2, 999999)).to.throw(
        'Universal Router not deployed on chain 999999'
      )
    })
  })
})
