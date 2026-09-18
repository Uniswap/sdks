import { expect } from 'chai'
import {
  UniversalRouterVersion,
  UNIVERSAL_ROUTER_ADDRESS,
  UNIVERSAL_ROUTER_CREATION_BLOCK,
  WETH_ADDRESS,
  SWAP_PROXY_ADDRESS,
  CHAIN_CONFIGS,
} from '../../src/utils/constants'

describe('Universal Router Constants', () => {
  // only the chain numbers that have a router deployed
  const chainIds = Object.keys(CHAIN_CONFIGS).map(Number)
  const versions = Object.keys(CHAIN_CONFIGS[1].routerConfigs) as unknown as UniversalRouterVersion[]
  // chains whose only pre-2.1.2 router is V2_1_1 (no V1_2, no V2_0)
  const v211OnlyChainIds = [5042, 4663]
  // MegaETH skipped 2.1.1 entirely: 2.0 -> 2.1.2
  const MEGAETH_CHAIN_ID = 4326
  const INK_CHAIN_ID = 57073

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

      // Ink (57073) has no V1_2
      expect(() => UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V1_2, 57073)).to.throw(
        'Universal Router version 1.2 not deployed on chain 57073'
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

    it('should throw for Ink (57073) V2_1_1, which is not deployed there', () => {
      expect(() => UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_1_1, 57073)).to.throw(
        'Universal Router version 2.1.1 not deployed on chain 57073'
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

      // Ink (57073) has no V1_2
      expect(() => UNIVERSAL_ROUTER_CREATION_BLOCK(UniversalRouterVersion.V1_2, 57073)).to.throw(
        'Universal Router version 1.2 not deployed on chain 57073'
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

    it('should throw for Ink (57073) V2_1_1 creation block, which is not deployed there', () => {
      expect(() => UNIVERSAL_ROUTER_CREATION_BLOCK(UniversalRouterVersion.V2_1_1, 57073)).to.throw(
        'Universal Router version 2.1.1 not deployed on chain 57073'
      )
    })
  })

  describe('V2_1_2', () => {
    it('is deployed on every chain that has V2_1_1, plus MegaETH and Ink', () => {
      const with211 = chainIds.filter((id) => CHAIN_CONFIGS[id].routerConfigs[UniversalRouterVersion.V2_1_1])
      const with212 = chainIds.filter((id) => CHAIN_CONFIGS[id].routerConfigs[UniversalRouterVersion.V2_1_2])
      expect(with212).to.have.lengthOf(24)
      // every 2.1.1 chain got 2.1.2. MegaETH never had a 2.1.1, and Ink's was an
      // alias to v2.2.0 that has since been removed, so both have 2.1.2 without 2.1.1.
      expect(with211.filter((id) => !with212.includes(id))).to.deep.equal([])
      expect(with212.filter((id) => !with211.includes(id))).to.deep.equal([MEGAETH_CHAIN_ID, INK_CHAIN_ID])
    })

    it('has no V2_1_1 on MegaETH to fall back to', () => {
      expect(() => UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_1_1, MEGAETH_CHAIN_ID)).to.throw(
        `Universal Router version 2.1.1 not deployed on chain ${MEGAETH_CHAIN_ID}`
      )
    })

    it('was deployed after V2_1_1 on every chain that had it', () => {
      chainIds.forEach((chainId) => {
        if (!CHAIN_CONFIGS[chainId].routerConfigs[UniversalRouterVersion.V2_1_2]) return
        if (!CHAIN_CONFIGS[chainId].routerConfigs[UniversalRouterVersion.V2_1_1]) return
        expect(UNIVERSAL_ROUTER_CREATION_BLOCK(UniversalRouterVersion.V2_1_2, chainId)).to.be.greaterThan(
          UNIVERSAL_ROUTER_CREATION_BLOCK(UniversalRouterVersion.V2_1_1, chainId)
        )
      })
    })

    it('returns the deployed V2_1_2 address on mainnet and sepolia', () => {
      expect(UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_1_2, 1)).to.equal(
        '0x23617e59A5925b2A4Bf75d73ff6711cD0b29De85'
      )
      expect(UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_1_2, 11155111)).to.equal(
        '0x7E4f6c5e954Da5c61B3423D81E2277431Ac043f3'
      )
    })

    // unlike 2.1.1, Ink has a standalone 2.1.2 router rather than an alias
    it('is a standalone deployment on Ink (57073), not aliased to V2_2_0', () => {
      expect(UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_1_2, 57073)).to.equal(
        '0x661E93cca42AfacB172121EF892830cA3b70F08d'
      )
      expect(UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_1_2, 57073)).to.not.equal(
        UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_2_0, 57073)
      )
    })

    it('is deployed on arc and robinhood, which previously had only V2_1_1', () => {
      expect(UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_1_2, 5042)).to.equal(
        '0x8702463e73f74d0b6765aBceb314Ef07aCb92650'
      )
      expect(UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_1_2, 4663)).to.equal(
        '0x204FAca1764B154221e35c0d20aBb3c525710498'
      )
    })
  })

  describe('SWAP_PROXY_ADDRESS', () => {
    it('should return the Ink SwapProxy address', () => {
      expect(SWAP_PROXY_ADDRESS(57073)).to.equal('0x0000000085E102724e78eCd2F45DC9cA239Affad')
    })

    it('should throw for an unsupported chain', () => {
      expect(() => SWAP_PROXY_ADDRESS(999999)).to.throw('SwapProxy not deployed on chain 999999')
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
