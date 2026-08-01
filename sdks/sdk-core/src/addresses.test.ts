import {
  CHAIN_TO_ADDRESSES_MAP,
  SWAP_ROUTER_02_ADDRESSES,
  V3_MIGRATOR_ADDRESSES,
  V3_CORE_FACTORY_ADDRESSES,
  MULTICALL_ADDRESSES,
  QUOTER_ADDRESSES,
  TICK_LENS_ADDRESSES,
  NONFUNGIBLE_POSITION_MANAGER_ADDRESSES,
} from './addresses'
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

    it('should return the correct address for celo alfajores', () => {
      const address = SWAP_ROUTER_02_ADDRESSES(ChainId.CELO_ALFAJORES)
      expect(address).toEqual('0x8C456F41A3883bA0ba99f810F7A2Da54D9Ea3EF0')
    })
  })

  describe('celo alfajores addresses', () => {
    it('should use distinct addresses from celo mainnet', () => {
      const celoAddresses = CHAIN_TO_ADDRESSES_MAP[ChainId.CELO]
      const alfajoresAddresses = CHAIN_TO_ADDRESSES_MAP[ChainId.CELO_ALFAJORES]
      expect(alfajoresAddresses).not.toBe(celoAddresses)
    })

    it('should have different factory address from celo mainnet', () => {
      expect(CHAIN_TO_ADDRESSES_MAP[ChainId.CELO_ALFAJORES].v3CoreFactoryAddress).not.toEqual(
        CHAIN_TO_ADDRESSES_MAP[ChainId.CELO].v3CoreFactoryAddress
      )
    })

    it('should have the correct factory address', () => {
      expect(V3_CORE_FACTORY_ADDRESSES[ChainId.CELO_ALFAJORES]).toEqual('0x229Fd76DA9062C1a10eb4193768E192bdEA99572')
    })

    it('should have the correct multicall address', () => {
      expect(MULTICALL_ADDRESSES[ChainId.CELO_ALFAJORES]).toEqual('0x692A12C7C167c44e54c3d381CA3EE91F058Dc404')
    })

    it('should have the correct quoter address', () => {
      expect(QUOTER_ADDRESSES[ChainId.CELO_ALFAJORES]).toEqual('0x3c1FCF8D6f3A579E98F4AE75EB0adA6de70f5673')
    })

    it('should have the correct tick lens address', () => {
      expect(TICK_LENS_ADDRESSES[ChainId.CELO_ALFAJORES]).toEqual('0xFdACaEfB0f85C9BE9d319023453cC85C812d7e1E')
    })

    it('should have the correct nonfungible position manager address', () => {
      expect(NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[ChainId.CELO_ALFAJORES]).toEqual(
        '0x0eC9d3C06Bc0A472A80085244d897bb604548824'
      )
    })

    it('should have the correct v3 migrator address', () => {
      expect(V3_MIGRATOR_ADDRESSES[ChainId.CELO_ALFAJORES]).toEqual('0x245d3F47F55c532dbE9340368855Be631B162cfd')
    })
  })

  describe('optimism v3 migrator', () => {
    it('should not have a v3 migrator address', () => {
      expect(CHAIN_TO_ADDRESSES_MAP[ChainId.OPTIMISM].v3MigratorAddress).toBeUndefined()
    })

    it('should not be present in V3_MIGRATOR_ADDRESSES', () => {
      expect(V3_MIGRATOR_ADDRESSES[ChainId.OPTIMISM]).toBeUndefined()
    })
  })
})
