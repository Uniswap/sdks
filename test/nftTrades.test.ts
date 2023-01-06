import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { hexToDecimalString } from './utils/hexToDecimalString'
import { expandTo18DecimalsBN } from '../src/utils/expandTo18Decimals'
import { SwapRouter } from '../src/swapRouter'
import { TokenType } from '../src/entities/NFTTrade'
import { FoundationTrade, FoundationData } from '../src/entities/protocols/foundation'
import { SeaportTrade } from '../src/entities/protocols/seaport'
import { seaportData2Covens, seaportValue } from './orders/seaport'
import { NFTXTrade, NFTXData } from '../src/entities/protocols/nftx'
import { NFT20Trade, NFT20Data } from '../src/entities/protocols/nft20'
import { looksRareOrders } from './orders/looksRare'
import { x2y2Orders } from './orders/x2y2'
import { LooksRareData, LooksRareTrade, MakerOrder, TakerOrder } from '../src/entities/protocols/looksRare'
import { SudoswapTrade, SudoswapData } from '../src/entities/protocols/sudoswap'
import { CryptopunkTrade, CryptopunkData } from '../src/entities/protocols/cryptopunk'
import { X2Y2Data, X2Y2Trade } from '../src/entities/protocols/x2y2'
import { registerFixture } from './forge/writeInterop'

const SAMPLE_ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

// this is the address forge is deploying the router to
const ROUTER_ADDR = '0x4a873bdd49f7f9cc0a5458416a12973fab208f8d'

describe('SwapRouter', () => {
  describe('#swapNFTCallParameters', () => {
    it('returns hex number value in Method Parameters', async () => {
      const foundationData: FoundationData = {
        referrer: '0x459e213D8B5E79d706aB22b945e3aF983d51BC4C',
        tokenAddress: '0xEf96021Af16BD04918b0d87cE045d7984ad6c38c',
        tokenId: 32,
        price: expandTo18DecimalsBN(0.01),
        recipient: SAMPLE_ADDR,
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
      recipient: SAMPLE_ADDR,
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
      recipient: SAMPLE_ADDR,
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
    const recipient = SAMPLE_ADDR

    const looksRareOrder721: MakerOrder = looksRareOrders[0]
    const looksRareOrder1155: MakerOrder = looksRareOrders[2]

    // buyItems from block 15360000
    const makerOrder721: MakerOrder = looksRareOrder721
    const takerOrder721: TakerOrder = {
      minPercentageToAsk: looksRareOrder721.minPercentageToAsk,
      price: looksRareOrder721.price,
      taker: ROUTER_ADDR,
      tokenId: looksRareOrder721.tokenId,
      isOrderAsk: false,
      params: looksRareOrder721.params,
    }
    const looksRareData721: LooksRareData = {
      makerOrder: makerOrder721,
      takerOrder: takerOrder721,
      recipient,
      tokenType: TokenType.ERC721,
    }

    const makerOrder1155: MakerOrder = looksRareOrder1155
    const takerOrder1155: TakerOrder = {
      minPercentageToAsk: looksRareOrder1155.minPercentageToAsk,
      price: looksRareOrder1155.price,
      taker: ROUTER_ADDR,
      tokenId: looksRareOrder1155.tokenId,
      isOrderAsk: false,
      params: looksRareOrder1155.params,
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
      expect(hexToDecimalString(methodParameters.value)).to.eq(looksRareOrder721.price)
      expect(methodParameters.calldata).to.eq(methodParametersV2.calldata)
      expect(methodParameters.value).to.eq(hexToDecimalString(methodParametersV2.value))
    })

    it('encodes buying one ERC1155 from LooksRare', async () => {
      const looksRareTrade = new LooksRareTrade([looksRareData1155])
      const methodParameters = SwapRouter.swapNFTCallParameters([looksRareTrade])
      const methodParametersV2 = SwapRouter.swapCallParameters(looksRareTrade)
      registerFixture('_LOOKSRARE_BUY_ITEM_1155', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(looksRareOrder1155.price)
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
      recipient: SAMPLE_ADDR,
      price: x2y2SignedOrder721.price,
      tokenId: x2y2SignedOrder721.token_id,
      tokenAddress: ENS_NFT_ADDR,
      tokenType: TokenType.ERC721,
    }

    const x2y2_1155_Data: X2Y2Data = {
      signedInput: x2y2SignedOrder1155.input,
      recipient: SAMPLE_ADDR,
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
    it('encodes buying two NFTs from Seaport', async () => {
      const value = seaportValue
      const seaportTrade = new SeaportTrade([seaportData2Covens])
      const methodParameters = SwapRouter.swapNFTCallParameters([seaportTrade])
      const methodParametersV2 = SwapRouter.swapCallParameters(seaportTrade)
      registerFixture('_SEAPORT_BUY_ITEMS', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(value.toString())
      expect(methodParameters.calldata).to.eq(methodParametersV2.calldata)
      expect(methodParameters.value).to.eq(hexToDecimalString(methodParametersV2.value))
    })
  })

  describe('Cryptopunk', () => {
    // buyItem from block 15725945
    const cryptopunk: CryptopunkData = {
      tokenId: 2976,
      recipient: SAMPLE_ADDR,
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
      recipient: SAMPLE_ADDR,
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
      nftRecipient: SAMPLE_ADDR,
      ethRecipient: SAMPLE_ADDR,
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
      recipient: SAMPLE_ADDR,
      vaultAddress: '0xd89b16331f39ab3878daf395052851d3ac8cf3cd',
      vaultId: 333,
      tokenAddress: '0x5180db8f5c931aae63c74266b211f580155ecac8',
      tokenIds: [584, 303], // invalid tokenIds
      value: expandTo18DecimalsBN(1),
    }

    it('encodes partial fill for multiple trades between protocols', async () => {
      const nftxTrade = new NFTXTrade([nftxPurchase2Covens])
      const seaportTrade = new SeaportTrade([seaportData2Covens])
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
        recipient: SAMPLE_ADDR,
      }

      // buyItem from block 15725945
      const foundationData2: FoundationData = {
        referrer: '0x459e213D8B5E79d706aB22b945e3aF983d51BC4C',
        tokenAddress: '0xEf96021Af16BD04918b0d87cE045d7984ad6c38c',
        tokenId: 100, // invalid not for sale
        price: expandTo18DecimalsBN(0.01),
        recipient: SAMPLE_ADDR,
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
