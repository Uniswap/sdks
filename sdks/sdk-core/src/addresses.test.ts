import {
  CHAIN_TO_ADDRESSES_MAP,
  QUOTER_ADDRESSES,
  SWAP_ROUTER_02_ADDRESSES,
  V2_FACTORY_ADDRESSES,
  V2_ROUTER_ADDRESSES,
  V3_CORE_FACTORY_ADDRESSES,
} from './addresses'
import { ChainId } from './chains'
import { WETH9 } from './entities/weth9'

describe('addresses', () => {
  describe('swap router 02 addresses', () => {
    it('should return the correct address for base', () => {
      const address = SWAP_ROUTER_02_ADDRESSES(ChainId.BASE)
      expect(address).toEqual('0x2626664c2603336E57B271c5C0b26F421741e481')
    })

    it('should return the correct address for base goerli', () => {
      const address = SWAP_ROUTER_02_ADDRESSES(ChainId.BASE_GOERLI)
      expect(address).toEqual('0x8357227D4eDc78991Db6FDB9bD6ADE250536dE1d')
    })

    it('should return the correct address for avalanche', () => {
      const address = SWAP_ROUTER_02_ADDRESSES(ChainId.AVALANCHE)
      expect(address).toEqual('0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE')
    })

    it('should return the correct address for BNB', () => {
      const address = SWAP_ROUTER_02_ADDRESSES(ChainId.BNB)
      expect(address).toEqual('0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2')
    })

    it('should return the correct address for arbitrum goerli', () => {
      const address = SWAP_ROUTER_02_ADDRESSES(ChainId.ARBITRUM_GOERLI)
      expect(address).toEqual('0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45')
    })

    it('should return the correct address for optimism sepolia', () => {
      const address = SWAP_ROUTER_02_ADDRESSES(ChainId.OPTIMISM_SEPOLIA)
      expect(address).toEqual('0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4')
    })

    it('should return the correct address for sepolia', () => {
      const address = SWAP_ROUTER_02_ADDRESSES(ChainId.SEPOLIA)
      expect(address).toEqual('0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E')
    })

    it('should return the correct address for bast', () => {
      const address = SWAP_ROUTER_02_ADDRESSES(ChainId.BLAST)
      expect(address).toEqual('0x549FEB8c9bd4c12Ad2AB27022dA12492aC452B66')
    })

    it('should return the correct address for xlayer', () => {
      const address = SWAP_ROUTER_02_ADDRESSES(ChainId.XLAYER)
      expect(address).toEqual('0x4f0c28f5926afda16bf2506d5d9e57ea190f9bca')
    })

    it('should return the correct address for linea', () => {
      const address = SWAP_ROUTER_02_ADDRESSES(ChainId.LINEA)
      expect(address).toEqual('0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a')
    })

    it('should return the correct address for tempo', () => {
      const address = SWAP_ROUTER_02_ADDRESSES(ChainId.TEMPO)
      expect(address).toEqual('0x7e9d53081e961201837336bcd81f52ae92691a8f')
    })

    it('should return the correct address for megaeth', () => {
      const address = SWAP_ROUTER_02_ADDRESSES(ChainId.MEGAETH)
      expect(address).toEqual('0x48020de9208bafc183f5cad5118ffbe8f0f913f5')
    })

    it('should return the correct address for arc', () => {
      const address = SWAP_ROUTER_02_ADDRESSES(ChainId.ARC)
      expect(address).toEqual('0x53bf6b0684ec7ef91e1387da3d1a1769bc5a6f77')
    })

    it('should return the correct address for robinhood', () => {
      const address = SWAP_ROUTER_02_ADDRESSES(ChainId.ROBINHOOD)
      expect(address).toEqual('0xcaf681a66d020601342297493863e78c959e5cb2')
    })

    it('should return the correct address for ink', () => {
      const address = SWAP_ROUTER_02_ADDRESSES(ChainId.INK)
      expect(address).toEqual('0x177778f19e89dd1012bdbe603f144088a95c4b53')
    })
  })

  describe('elysium', () => {
    it('should return the v2 and v3 factory addresses', () => {
      expect(V2_FACTORY_ADDRESSES[ChainId.ELYSIUM]).toEqual('0xBbBcC62853a5fA27b93d6Bab3E6F7ce841E25Df2')
      expect(V3_CORE_FACTORY_ADDRESSES[ChainId.ELYSIUM]).toEqual('0x1707327F626496A7b5b3872e7E4d2879Df7d7a9f')
    })

    it('should return the v2 router, quoter and swap router 02', () => {
      expect(V2_ROUTER_ADDRESSES[ChainId.ELYSIUM]).toEqual('0xE783DE89a7F0408687f051e3E6D0BEb62719EbAd')
      expect(QUOTER_ADDRESSES[ChainId.ELYSIUM]).toEqual('0x204FAca1764B154221e35c0d20aBb3c525710498')
      expect(SWAP_ROUTER_02_ADDRESSES(ChainId.ELYSIUM)).toEqual('0x2d01411773c8C24805306E89A41F7855C3c4Fe65')
    })

    it('should return the v4 state view and quoter', () => {
      expect(CHAIN_TO_ADDRESSES_MAP[ChainId.ELYSIUM].v4StateView).toEqual('0x27eD73aE0652fdCf71d6793412A7525f32bE9dfE')
      expect(CHAIN_TO_ADDRESSES_MAP[ChainId.ELYSIUM].v4QuoterAddress).toEqual(
        '0x379F556c5a748BD7Cc9baF0F7A344094Ac1814f5'
      )
    })

    it('should wrap HYPE as WHYPE', () => {
      expect(WETH9[ChainId.ELYSIUM].address).toEqual('0xbA876237B0F021A6c6D852d6c26E107997cC5E81')
      expect(WETH9[ChainId.ELYSIUM].symbol).toEqual('WHYPE')
    })
  })
})
