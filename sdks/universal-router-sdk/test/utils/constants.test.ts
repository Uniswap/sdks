import { expect } from 'chai'
import {
  UniversalRouterVersion,
  UNIVERSAL_ROUTER_ADDRESS,
  UNIVERSAL_ROUTER_CREATION_BLOCK,
  WETH_ADDRESS,
  CHAIN_CONFIGS,
} from '../../src/utils/constants'

describe('Universal Router Constants', () => {
  // only the chain numbers that have a router deployed
  const chainIds = Object.keys(CHAIN_CONFIGS).map(Number)
  const versions = Object.keys(CHAIN_CONFIGS[1].routerConfigs) as unknown as UniversalRouterVersion[]
  const v211OnlyChainIds = [5042, 4663]

  describe('UNIVERSAL_ROUTER_ADDRESS', () => {
    versions.forEach((version) => {
      chainIds.forEach((chainId) => {
        if (!CHAIN_CONFIGS[chainId].routerConfigs[version]) return
        it(`should return a valid address for version ${version} on chain ${chainId}`, () => {
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

    it('should throw an error for a version not deployed on an existing chain', () => {
      // Linea (59144) has no V1_2
      expect(() => UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V1_2, 59144)).to.throw(
        'Universal Router version 1.2 not deployed on chain 59144'
      )

      // MegaETH (4326) has no V1_2
      expect(() => UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V1_2, 4326)).to.throw(
        'Universal Router version 1.2 not deployed on chain 4326'
      )

      // Arc (5042) and Robinhood (4663) only have V2_1_1
      v211OnlyChainIds.forEach((chainId) => {
        expect(() => UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V1_2, chainId)).to.throw(
          `Universal Router version 1.2 not deployed on chain ${chainId}`
        )
        expect(() => UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_0, chainId)).to.throw(
          `Universal Router version 2.0 not deployed on chain ${chainId}`
        )
      })
    })

    it('should return the correct V2_1_1 address for arc and robinhood', () => {
      expect(UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_1_1, 5042)).to.equal(
        '0x4fca4a51ab4f23a7447b3284fbd7d73289a89fb1'
      )
      expect(UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_1_1, 4663)).to.equal(
        '0x8876789976decbfcbbbe364623c63652db8c0904'
      )
    })
  })

  describe('UNIVERSAL_ROUTER_CREATION_BLOCK', () => {
    versions.forEach((version) => {
      chainIds.forEach((chainId) => {
        if (!CHAIN_CONFIGS[chainId].routerConfigs[version]) return
        it(`should return a valid block number for version ${version} on chain ${chainId}`, () => {
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

    it('should throw an error for a version not deployed on an existing chain', () => {
      // Linea (59144) has no V1_2
      expect(() => UNIVERSAL_ROUTER_CREATION_BLOCK(UniversalRouterVersion.V1_2, 59144)).to.throw(
        'Universal Router version 1.2 not deployed on chain 59144'
      )

      // MegaETH (4326) has no V1_2
      expect(() => UNIVERSAL_ROUTER_CREATION_BLOCK(UniversalRouterVersion.V1_2, 4326)).to.throw(
        'Universal Router version 1.2 not deployed on chain 4326'
      )

      // Arc (5042) and Robinhood (4663) only have V2_1_1
      v211OnlyChainIds.forEach((chainId) => {
        expect(() => UNIVERSAL_ROUTER_CREATION_BLOCK(UniversalRouterVersion.V1_2, chainId)).to.throw(
          `Universal Router version 1.2 not deployed on chain ${chainId}`
        )
        expect(() => UNIVERSAL_ROUTER_CREATION_BLOCK(UniversalRouterVersion.V2_0, chainId)).to.throw(
          `Universal Router version 2.0 not deployed on chain ${chainId}`
        )
      })
    })

    it('should return the correct V2_1_1 creation block for arc and robinhood', () => {
      expect(UNIVERSAL_ROUTER_CREATION_BLOCK(UniversalRouterVersion.V2_1_1, 5042)).to.equal(1950059)
      expect(UNIVERSAL_ROUTER_CREATION_BLOCK(UniversalRouterVersion.V2_1_1, 4663)).to.equal(18127)
    })
  })

  describe('WETH_ADDRESS', () => {
    it('should throw for arc because WETH is unsupported', () => {
      expect(() => WETH_ADDRESS(5042)).to.throw('Chain 5042 does not have WETH')
    })

    it('should return Robinhood WETH', () => {
      expect(WETH_ADDRESS(4663)).to.equal('0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73')
    })
  })
})
