import { expect } from 'chai'
import { BigNumber, utils, Wallet } from 'ethers'
import { hexToDecimalString } from './utils/hexToDecimalString'
import { expandTo18DecimalsBN } from '../src/utils/expandTo18Decimals'
import { SwapRouter } from '../src/swapRouter'
import { TokenType } from '../src/entities/NFTTrade'
import { FoundationTrade, FoundationData } from '../src/entities/protocols/foundation'
import { SeaportTrade } from '../src/entities/protocols/seaport'
import { seaportDataETH, seaportDataERC20 } from './orders/seaport'
import { NFTXTrade, NFTXData } from '../src/entities/protocols/nftx'
import { NFT20Trade, NFT20Data } from '../src/entities/protocols/nft20'
import { looksRareOrders, createLooksRareOrders } from './orders/looksRare'
import { x2y2Orders } from './orders/x2y2'
import { LooksRareData, LooksRareTrade } from '../src/entities/protocols/looksRare'
import { SudoswapTrade, SudoswapData } from '../src/entities/protocols/sudoswap'
import { CryptopunkTrade, CryptopunkData } from '../src/entities/protocols/cryptopunk'
import { X2Y2Data, X2Y2Trade } from '../src/entities/protocols/x2y2'
import { registerFixture } from './forge/writeInterop'
import { seaportV1_4DataETH } from './orders/seaportV1_4'
import { FORGE_PERMIT2_ADDRESS, FORGE_ROUTER_ADDRESS, TEST_RECIPIENT_ADDRESS } from './utils/addresses'
import { ETH_ADDRESS, WETH_ADDRESS } from '../src/utils/constants'
import { generatePermitSignature, makePermit } from './utils/permit2'

describe('SwapRouter', () => {
  const wallet = new Wallet(utils.zeroPad('0x1234', 32))

  describe('#swapNFTCallParameters', () => {
    it('returns hex number value in Method Parameters', async () => {
      const foundationData: FoundationData = {
        referrer: '0x459e213D8B5E79d706aB22b945e3aF983d51BC4C',
        tokenAddress: '0xEf96021Af16BD04918b0d87cE045d7984ad6c38c',
        tokenId: 32,
        price: expandTo18DecimalsBN(0.01),
        recipient: TEST_RECIPIENT_ADDRESS,
      }

      const foundationTrade = new FoundationTrade([foundationData])
      const methodParameters = SwapRouter.swapNFTCallParameters([foundationTrade])
      expect(methodParameters.value).to.eq('0x2386f26fc10000')
    })
  })

  describe('Foundation', () => {
    // buyItem from block 15725945
    const foundationData: FoundationData = {
      referrer: '0x459e213D8B5E79d706aB22b945e3aF983d51BC4C',
      tokenAddress: '0xEf96021Af16BD04918b0d87cE045d7984ad6c38c',
      tokenId: 32,
      price: expandTo18DecimalsBN(0.01),
      recipient: TEST_RECIPIENT_ADDRESS,
    }

    it('encodes a single foundation trade', async () => {
      const foundationTrade = new FoundationTrade([foundationData])
      const methodParameters = SwapRouter.swapNFTCallParameters([foundationTrade])
      const methodParametersV2 = SwapRouter.swapCallParameters(foundationTrade)
      registerFixture('_FOUNDATION_BUY_ITEM', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(foundationData.price.toString())
      expect(methodParameters.calldata).to.eq(methodParametersV2.calldata)
      expect(methodParameters.value).to.eq(hexToDecimalString(methodParametersV2.value))
    })
  })

  describe('NFTX', () => {
    // buyItems from block 15360000
    const nftxPurchase2Covens: NFTXData = {
      recipient: TEST_RECIPIENT_ADDRESS,
      vaultAddress: '0xd89b16331f39ab3878daf395052851d3ac8cf3cd',
      vaultId: 333,
      tokenAddress: '0x5180db8f5c931aae63c74266b211f580155ecac8',
      tokenIds: [584, 3033],
      value: expandTo18DecimalsBN(1),
    }

    it('encodes buying two NFTs from a single NFTX vault', async () => {
      const nftxTrade = new NFTXTrade([nftxPurchase2Covens])
      const methodParameters = SwapRouter.swapNFTCallParameters([nftxTrade])
      const methodParametersV2 = SwapRouter.swapCallParameters(nftxTrade)
      registerFixture('_NFTX_BUY_ITEMS', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(expandTo18DecimalsBN(1).toString())
      expect(methodParameters.calldata).to.eq(methodParametersV2.calldata)
      expect(methodParameters.value).to.eq(hexToDecimalString(methodParametersV2.value))
    })
  })

  describe('LooksRare', () => {
    const recipient = TEST_RECIPIENT_ADDRESS

    // buyItems from block 15360000
    const { makerOrder: makerOrder721, takerOrder: takerOrder721 } = createLooksRareOrders(
      looksRareOrders[0],
      FORGE_ROUTER_ADDRESS
    )
    const { makerOrder: makerOrder1155, takerOrder: takerOrder1155 } = createLooksRareOrders(
      looksRareOrders[2],
      FORGE_ROUTER_ADDRESS
    )

    const looksRareData721: LooksRareData = {
      makerOrder: makerOrder721,
      takerOrder: takerOrder721,
      recipient,
      tokenType: TokenType.ERC721,
    }

    const looksRareData1155: LooksRareData = {
      makerOrder: makerOrder1155,
      takerOrder: takerOrder1155,
      recipient,
      tokenType: TokenType.ERC1155,
    }

    it('encodes buying one ERC721 from LooksRare', async () => {
      const looksRareTrade = new LooksRareTrade([looksRareData721])
      const methodParameters = SwapRouter.swapNFTCallParameters([looksRareTrade])
      const methodParametersV2 = SwapRouter.swapCallParameters(looksRareTrade)
      registerFixture('_LOOKSRARE_BUY_ITEM_721', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(makerOrder721.price)
      expect(methodParameters.calldata).to.eq(methodParametersV2.calldata)
      expect(methodParameters.value).to.eq(hexToDecimalString(methodParametersV2.value))
    })

    it('encodes buying one ERC1155 from LooksRare', async () => {
      const looksRareTrade = new LooksRareTrade([looksRareData1155])
      const methodParameters = SwapRouter.swapNFTCallParameters([looksRareTrade])
      const methodParametersV2 = SwapRouter.swapCallParameters(looksRareTrade)
      registerFixture('_LOOKSRARE_BUY_ITEM_1155', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(makerOrder1155.price)
      expect(methodParameters.calldata).to.eq(methodParametersV2.calldata)
      expect(methodParameters.value).to.eq(hexToDecimalString(methodParametersV2.value))
    })
  })

  describe('X2Y2', () => {
    const x2y2SignedOrder721 = x2y2Orders[0]
    const x2y2SignedOrder1155 = x2y2Orders[1]
    const ENS_NFT_ADDR = '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85'
    const CAMEO_ADDRESS = '0x93317E87a3a47821803CAADC54Ae418Af80603DA'

    const x2y2_721_Data: X2Y2Data = {
      signedInput: x2y2SignedOrder721.input,
      recipient: TEST_RECIPIENT_ADDRESS,
      price: x2y2SignedOrder721.price,
      tokenId: x2y2SignedOrder721.token_id,
      tokenAddress: ENS_NFT_ADDR,
      tokenType: TokenType.ERC721,
    }

    const x2y2_1155_Data: X2Y2Data = {
      signedInput: x2y2SignedOrder1155.input,
      recipient: TEST_RECIPIENT_ADDRESS,
      price: x2y2SignedOrder1155.price,
      tokenId: x2y2SignedOrder1155.token_id,
      tokenAddress: CAMEO_ADDRESS,
      tokenType: TokenType.ERC1155,
      tokenAmount: 1,
    }

    it('encodes buying one ERC-721 from X2Y2', async () => {
      const x2y2Trade = new X2Y2Trade([x2y2_721_Data])
      const methodParameters = SwapRouter.swapNFTCallParameters([x2y2Trade])
      const methodParametersV2 = SwapRouter.swapCallParameters(x2y2Trade)
      registerFixture('_X2Y2_721_BUY_ITEM', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(x2y2SignedOrder721.price)
      expect(methodParameters.calldata).to.eq(methodParametersV2.calldata)
      expect(methodParameters.value).to.eq(hexToDecimalString(methodParametersV2.value))
    })
    it('encodes buying one ERC-1155 from X2Y2', async () => {
      const x2y2Trade = new X2Y2Trade([x2y2_1155_Data])
      const methodParameters = SwapRouter.swapNFTCallParameters([x2y2Trade])
      const methodParametersV2 = SwapRouter.swapCallParameters(x2y2Trade)
      registerFixture('_X2Y2_1155_BUY_ITEM', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(x2y2SignedOrder1155.price)
      expect(methodParameters.calldata).to.eq(methodParametersV2.calldata)
      expect(methodParameters.value).to.eq(hexToDecimalString(methodParametersV2.value))
    })
  })

  describe('Seaport', () => {
    it('encodes buying two NFTs from Seaport with ETH', async () => {
      const seaportTrade = new SeaportTrade([seaportDataETH])
      const value = seaportTrade.getTotalPrice(ETH_ADDRESS)
      const methodParameters = SwapRouter.swapNFTCallParameters([seaportTrade])
      const methodParametersV2 = SwapRouter.swapCallParameters(seaportTrade)
      registerFixture('_SEAPORT_BUY_ITEMS_ETH', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(value.toString())
      expect(methodParameters.calldata).to.eq(methodParametersV2.calldata)
      expect(methodParameters.value).to.eq(hexToDecimalString(methodParametersV2.value))
    })

    it('encodes buying 1 NFT from Seaport with ERC20, with Permit and Approve', async () => {
      // get the basic seaport data for ERC20 trade
      let seaportData = seaportDataERC20

      // make permit
      const WETH_MAINNET = WETH_ADDRESS(1)
      const permit2Data = makePermit(WETH_MAINNET, undefined, undefined, FORGE_ROUTER_ADDRESS)
      const signature = await generatePermitSignature(permit2Data, wallet, 1, FORGE_PERMIT2_ADDRESS)
      seaportData.inputTokenProcessing = [
        {
          token: WETH_MAINNET,
          protocolApproval: true,
          permit2TransferFrom: true,
          permit2Permit: {
            ...permit2Data,
            signature,
          },
        },
      ]

      const seaportTrade = new SeaportTrade([seaportData])
      const methodParameters = SwapRouter.swapNFTCallParameters([seaportTrade])
      const methodParametersV2 = SwapRouter.swapCallParameters(seaportTrade)
      registerFixture('_SEAPORT_BUY_ITEMS_ERC20_PERMIT_AND_APPROVE', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq('0')
      expect(methodParameters.calldata).to.eq(methodParametersV2.calldata)
      expect(methodParameters.value).to.eq(hexToDecimalString(methodParametersV2.value))
    })

    it('encodes buying 1 NFT from Seaport with ERC20, with Permit', async () => {
      // get the basic seaport data for ERC20 trade
      let seaportData = seaportDataERC20

      // add permit and transfer
      const WETH_MAINNET = WETH_ADDRESS(1)
      const permit2Data = makePermit(WETH_MAINNET, undefined, undefined, FORGE_ROUTER_ADDRESS)
      const signature = await generatePermitSignature(permit2Data, wallet, 1, FORGE_PERMIT2_ADDRESS)
      seaportData.inputTokenProcessing = [
        {
          token: WETH_MAINNET,
          protocolApproval: false, // no approval
          permit2TransferFrom: true,
          permit2Permit: {
            ...permit2Data,
            signature,
          },
        },
      ]

      const seaportTrade = new SeaportTrade([seaportData])
      const methodParameters = SwapRouter.swapNFTCallParameters([seaportTrade])
      const methodParametersV2 = SwapRouter.swapCallParameters(seaportTrade)
      registerFixture('_SEAPORT_BUY_ITEMS_ERC20_PERMIT_NO_APPROVE', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq('0')
      expect(methodParameters.calldata).to.eq(methodParametersV2.calldata)
      expect(methodParameters.value).to.eq(hexToDecimalString(methodParametersV2.value))
    })
  })

  describe('SeaportV1_4', () => {
    it('encodes buying two NFTs from Seaport v1.4 with ETH', async () => {
      const seaportV1_4Trade = new SeaportTrade([seaportV1_4DataETH])
      const value = seaportV1_4Trade.getTotalPrice(ETH_ADDRESS)
      const methodParameters = SwapRouter.swapNFTCallParameters([seaportV1_4Trade])
      const methodParametersV2 = SwapRouter.swapCallParameters(seaportV1_4Trade)
      registerFixture('_SEAPORT_V1_4_BUY_ITEMS_ETH', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(value.toString())
      expect(methodParameters.calldata).to.eq(methodParametersV2.calldata)
      expect(methodParameters.value).to.eq(hexToDecimalString(methodParametersV2.value))
    })
  })

  describe('Cryptopunk', () => {
    // buyItem from block 15725945
    const cryptopunk: CryptopunkData = {
      tokenId: 2976,
      recipient: TEST_RECIPIENT_ADDRESS,
      value: BigNumber.from('76950000000000000000'),
    }

    it('encodes a single cryptopunk trade', async () => {
      const cryptopunkTrade = new CryptopunkTrade([cryptopunk])
      const methodParameters = SwapRouter.swapNFTCallParameters([cryptopunkTrade])
      const methodParametersV2 = SwapRouter.swapCallParameters(cryptopunkTrade)
      registerFixture('_CRYPTOPUNK_BUY_ITEM', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(cryptopunk.value.toString())
      expect(methodParameters.calldata).to.eq(methodParametersV2.calldata)
      expect(methodParameters.value).to.eq(hexToDecimalString(methodParametersV2.value))
    })
  })

  describe('nft20', () => {
    // buyItem from block 15770228
    const nft20Data: NFT20Data = {
      tokenIds: [129, 193, 278],
      tokenAddress: '0x6d05064fe99e40f1c3464e7310a23ffaded56e20',
      tokenAmounts: [1, 1, 1],
      recipient: TEST_RECIPIENT_ADDRESS,
      fee: 0,
      isV3: false,
      value: BigNumber.from('20583701229648230'),
    }

    it('encodes an NFT20 trade with three items', async () => {
      const nft20Trade = new NFT20Trade([nft20Data])
      const methodParameters = SwapRouter.swapNFTCallParameters([nft20Trade])
      const methodParametersV2 = SwapRouter.swapCallParameters(nft20Trade)
      registerFixture('_NFT20_BUY_ITEM', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(nft20Data.value.toString())
      expect(methodParameters.calldata).to.eq(methodParametersV2.calldata)
      expect(methodParameters.value).to.eq(hexToDecimalString(methodParametersV2.value))
    })
  })

  describe('sudoswap', () => {
    // buyItem from block 15770228
    const sudoswapData: SudoswapData = {
      swaps: [
        {
          swapInfo: {
            pair: '0x339e7004372e04b1d59443f0ddc075efd9d80360',
            nftIds: [80, 35, 93],
          },
          tokenAddress: '0xfa9937555dc20a020a161232de4d2b109c62aa9c',
          maxCost: '73337152777777783',
        },
      ],
      nftRecipient: TEST_RECIPIENT_ADDRESS,
      ethRecipient: TEST_RECIPIENT_ADDRESS,
      deadline: '2000000000',
    }

    it('encodes an Sudoswap trade with three items', async () => {
      const sudoswapTrade = new SudoswapTrade([sudoswapData])
      const methodParameters = SwapRouter.swapNFTCallParameters([sudoswapTrade])
      const methodParametersV2 = SwapRouter.swapCallParameters(sudoswapTrade)
      registerFixture('_SUDOSWAP_BUY_ITEM', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(sudoswapData.swaps[0].maxCost.toString())
      expect(methodParameters.calldata).to.eq(methodParametersV2.calldata)
      expect(methodParameters.value).to.eq(hexToDecimalString(methodParametersV2.value))
    })
  })

  describe('Partial Fill', () => {
    // buyItems from block 15360000
    const nftxPurchase2Covens: NFTXData = {
      recipient: TEST_RECIPIENT_ADDRESS,
      vaultAddress: '0xd89b16331f39ab3878daf395052851d3ac8cf3cd',
      vaultId: 333,
      tokenAddress: '0x5180db8f5c931aae63c74266b211f580155ecac8',
      tokenIds: [584, 303], // invalid tokenIds
      value: expandTo18DecimalsBN(1),
    }

    it('encodes partial fill for multiple trades between protocols', async () => {
      const nftxTrade = new NFTXTrade([nftxPurchase2Covens])
      const seaportTrade = new SeaportTrade([seaportDataETH])
      const seaportValue = seaportTrade.getTotalPrice(ETH_ADDRESS)
      const methodParameters = SwapRouter.swapNFTCallParameters([nftxTrade, seaportTrade])
      const methodParametersV2 = SwapRouter.swapCallParameters([nftxTrade, seaportTrade])
      registerFixture('_PARTIAL_FILL', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(expandTo18DecimalsBN(1).add(seaportValue).toString())
      expect(methodParameters.calldata).to.eq(methodParametersV2.calldata)
      expect(methodParameters.value).to.eq(hexToDecimalString(methodParametersV2.value))
    })

    it('encodes partial fill for multiple swaps within the same protocol', async () => {
      // buyItem from block 15725945
      const foundationData1: FoundationData = {
        referrer: '0x459e213D8B5E79d706aB22b945e3aF983d51BC4C',
        tokenAddress: '0xEf96021Af16BD04918b0d87cE045d7984ad6c38c',
        tokenId: 32,
        price: expandTo18DecimalsBN(0.01),
        recipient: TEST_RECIPIENT_ADDRESS,
      }

      // buyItem from block 15725945
      const foundationData2: FoundationData = {
        referrer: '0x459e213D8B5E79d706aB22b945e3aF983d51BC4C',
        tokenAddress: '0xEf96021Af16BD04918b0d87cE045d7984ad6c38c',
        tokenId: 100, // invalid not for sale
        price: expandTo18DecimalsBN(0.01),
        recipient: TEST_RECIPIENT_ADDRESS,
      }

      const value = BigNumber.from(foundationData1.price).add(foundationData2.price)

      const foundationTrade = new FoundationTrade([foundationData1, foundationData2])
      const methodParameters = SwapRouter.swapNFTCallParameters([foundationTrade])
      const methodParametersV2 = SwapRouter.swapCallParameters(foundationTrade)
      registerFixture('_PARTIAL_FILL_WITHIN_PROTOCOL', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(value.toString())
      expect(methodParameters.calldata).to.eq(methodParametersV2.calldata)
      expect(methodParameters.value).to.eq(hexToDecimalString(methodParametersV2.value))
    })
  })
})
