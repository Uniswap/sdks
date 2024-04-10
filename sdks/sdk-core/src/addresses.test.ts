import { SWAP_ROUTER_02_ADDRESSES } from './addresses'
import { ChainId } from './chains'

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
  })
})
