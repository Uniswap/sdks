import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { UnwrapWETH } from '../src/entities/protocols/unwrapWETH'
import { SwapRouter, PERMIT2_ADDRESS, ROUTER_AS_RECIPIENT, WETH_ADDRESS } from '../src'
import { utils, Wallet } from 'ethers'
import { LooksRareData, LooksRareTrade } from '../src/entities/protocols/looksRare'
import { looksRareOrders, createLooksRareOrders } from './orders/looksRare'
import { SeaportTrade } from '../src/entities/protocols/seaport'
import { seaportData2Covens, seaportValue } from './orders/seaport'
import { TokenType } from '../src/entities/NFTTrade'
import { Trade as V2Trade, Route as RouteV2, Pair } from '@uniswap/v2-sdk'
import { Trade as V3Trade, Route as RouteV3, Pool } from '@uniswap/v3-sdk'
import { generatePermitSignature, makePermit } from './utils/permit2'

import { UniswapTrade } from '../src'
import { CurrencyAmount, TradeType } from '@uniswap/sdk-core'
import { registerFixture } from './forge/writeInterop'
import { buildTrade, getUniswapPools, swapOptions, DAI, ETHER, WETH, USDC } from './utils/uniswapData'
import {
  FORGE_PERMIT2_ADDRESS,
  FORGE_ROUTER_ADDRESS,
  FORGE_SENDER_ADDRESS,
  TEST_RECIPIENT_ADDRESS,
} from './utils/addresses'

describe('SwapRouter.swapCallParameters', () => {
  const wallet = new Wallet(utils.zeroPad('0x1234', 32))

  describe('erc20 --> nft', async () => {
    const { makerOrder, takerOrder } = createLooksRareOrders(looksRareOrders[0], FORGE_ROUTER_ADDRESS)
    const { makerOrder: recentMakerOrder, takerOrder: recentTakerOrder } = createLooksRareOrders(
      looksRareOrders[3],
      FORGE_ROUTER_ADDRESS
    )
    const recentLooksRareData: LooksRareData = {
      makerOrder: recentMakerOrder,
      takerOrder: recentTakerOrder,
      recipient: TEST_RECIPIENT_ADDRESS,
      tokenType: TokenType.ERC721,
    }
    const looksRareData: LooksRareData = {
      makerOrder: makerOrder,
      takerOrder: takerOrder,
      recipient: TEST_RECIPIENT_ADDRESS,
      tokenType: TokenType.ERC721,
    }
    const invalidLooksRareMaker = { ...makerOrder, tokenId: 1 }
    const invalidLooksRareData = { ...looksRareData, makerOrder: invalidLooksRareMaker }
    const seaportTrade = new SeaportTrade([seaportData2Covens])

    let WETH_USDC_V3: Pool
    let USDC_DAI_V2: Pair
    let WETH_USDC_V2: Pair

    beforeEach(async () => {
      ;({ WETH_USDC_V3, USDC_DAI_V2, WETH_USDC_V2 } = await getUniswapPools(15360000))
    })

    it('erc20 -> 1 looksrare nft', async () => {
      const outputEther = makerOrder.price.toString()
      const erc20Trade = buildTrade([
        await V3Trade.fromRoute(
          new RouteV3([WETH_USDC_V3], USDC, ETHER),
          CurrencyAmount.fromRawAmount(ETHER, outputEther),
          TradeType.EXACT_OUTPUT
        ),
      ])
      const opts = swapOptions({ recipient: ROUTER_AS_RECIPIENT })
      const uniswapTrade = new UniswapTrade(erc20Trade, opts)
      const looksRareTrade = new LooksRareTrade([looksRareData])

      const methodParameters = SwapRouter.swapCallParameters([uniswapTrade, looksRareTrade], {
        sender: FORGE_SENDER_ADDRESS,
      })
      registerFixture('_ERC20_FOR_1_LOOKSRARE_NFT', methodParameters)
      expect(methodParameters.value).to.eq('0')
    })

    it('weth -> 1 looksrare nft with Permit', async () => {
      const recentlooksRareTrade = new LooksRareTrade([recentLooksRareData])

      const outputEther = recentMakerOrder.price.toString()
      const permit2Data = makePermit(WETH_ADDRESS(1), outputEther, '0', FORGE_ROUTER_ADDRESS)
      const signature = await generatePermitSignature(permit2Data, wallet, 1, FORGE_PERMIT2_ADDRESS)
      const UnwrapWETHData = {
        ...permit2Data,
        signature,
      }
      const UnwrapWETHCommand = new UnwrapWETH(outputEther, 1, UnwrapWETHData, FORGE_ROUTER_ADDRESS)

      const methodParameters = SwapRouter.swapCallParameters([UnwrapWETHCommand, recentlooksRareTrade], {
        sender: FORGE_ROUTER_ADDRESS,
      })
      registerFixture('_PERMIT_AND_WETH_FOR_1_LOOKSRARE_NFT', methodParameters)
      expect(methodParameters.value).to.eq('0')
    })

    it('weth -> 1 looksrare nft without Permit', async () => {
      const recentlooksRareTrade = new LooksRareTrade([recentLooksRareData])

      const outputEther = recentMakerOrder.price.toString()
      const UnwrapWETHCommand = new UnwrapWETH(outputEther, 1, undefined, FORGE_ROUTER_ADDRESS)

      const methodParameters = SwapRouter.swapCallParameters([UnwrapWETHCommand, recentlooksRareTrade], {
        sender: FORGE_SENDER_ADDRESS,
      })
      registerFixture('_WETH_FOR_1_LOOKSRARE_NFT', methodParameters)
      expect(methodParameters.value).to.eq('0')
    })

    it('erc20 + eth -> 1 looksrare nft', async () => {
      const looksRarePriceUSDC = CurrencyAmount.fromRawAmount(WETH, makerOrder.price.toString())
      const partialLooksRarePriceUSDC = (await WETH_USDC_V3.getOutputAmount(looksRarePriceUSDC))[0]
      const erc20Trade = buildTrade([
        await V3Trade.fromRoute(
          new RouteV3([WETH_USDC_V3], USDC, ETHER),
          partialLooksRarePriceUSDC, // do not send enough erc20 to cover entire cost
          TradeType.EXACT_INPUT
        ),
      ])
      const opts = swapOptions({ recipient: ROUTER_AS_RECIPIENT })
      const uniswapTrade = new UniswapTrade(erc20Trade, opts)
      const looksRareTrade = new LooksRareTrade([looksRareData])

      const methodParameters = SwapRouter.swapCallParameters([uniswapTrade, looksRareTrade], {
        sender: FORGE_SENDER_ADDRESS,
      })
      registerFixture('_ERC20_AND_ETH_FOR_1_LOOKSRARE_NFT', methodParameters)
      expect(methodParameters.value).to.not.eq('0')
    })

    it('erc20 -> 1 looksRare nft & 2 seaport nfts', async () => {
      const outputEther = BigNumber.from(makerOrder.price).add(seaportValue).toString()
      const erc20Trade = buildTrade([
        await V3Trade.fromRoute(
          new RouteV3([WETH_USDC_V3], USDC, ETHER),
          CurrencyAmount.fromRawAmount(ETHER, outputEther),
          TradeType.EXACT_OUTPUT
        ),
      ])
      const opts = swapOptions({ recipient: ROUTER_AS_RECIPIENT })
      const uniswapTrade = new UniswapTrade(erc20Trade, opts)
      const looksRareTrade = new LooksRareTrade([looksRareData])

      const methodParameters = SwapRouter.swapCallParameters([uniswapTrade, looksRareTrade, seaportTrade], {
        sender: FORGE_SENDER_ADDRESS,
      })
      registerFixture('_ERC20_FOR_1_LOOKSRARE_NFT_2_SEAPORT_NFTS', methodParameters)
      expect(methodParameters.value).to.eq('0')
    })

    it('erc20 + eth -> 1 looksRare nft & 2 seaport nfts', async () => {
      const outputEther = BigNumber.from(makerOrder.price).toString()
      const erc20Trade = buildTrade([
        await V3Trade.fromRoute(
          new RouteV3([WETH_USDC_V3], USDC, ETHER),
          CurrencyAmount.fromRawAmount(ETHER, outputEther),
          TradeType.EXACT_OUTPUT
        ),
      ])
      const opts = swapOptions({ recipient: ROUTER_AS_RECIPIENT })
      const uniswapTrade = new UniswapTrade(erc20Trade, opts)
      const looksRareTrade = new LooksRareTrade([looksRareData])

      const methodParameters = SwapRouter.swapCallParameters([uniswapTrade, looksRareTrade, seaportTrade], {
        sender: FORGE_SENDER_ADDRESS,
      })
      registerFixture('_ERC20_AND_ETH_FOR_1_LOOKSRARE_NFT_2_SEAPORT_NFTS', methodParameters)
      expect(methodParameters.value).to.eq('53000000000000000000')
    })

    it('2 erc20s -> 1 NFT', async () => {
      const outputEther = BigNumber.from(makerOrder.price)
      const erc20Trade1 = buildTrade([
        await V3Trade.fromRoute(
          new RouteV3([WETH_USDC_V3], USDC, ETHER),
          CurrencyAmount.fromRawAmount(ETHER, outputEther.div(2).toString()),
          TradeType.EXACT_OUTPUT
        ),
      ])
      const erc20Trade2 = buildTrade([
        new V2Trade(
          new RouteV2([USDC_DAI_V2, WETH_USDC_V2], DAI, ETHER),
          CurrencyAmount.fromRawAmount(ETHER, outputEther.div(2).toString()),
          TradeType.EXACT_OUTPUT
        ),
      ])
      const opts = swapOptions({ recipient: ROUTER_AS_RECIPIENT })
      const uniswapTrade1 = new UniswapTrade(erc20Trade1, opts)
      const uniswapTrade2 = new UniswapTrade(erc20Trade2, opts)
      const looksRareTrade = new LooksRareTrade([looksRareData])

      const methodParameters = SwapRouter.swapCallParameters([uniswapTrade1, uniswapTrade2, looksRareTrade], {
        sender: FORGE_SENDER_ADDRESS,
      })
      registerFixture('_2_ERC20s_FOR_1_NFT', methodParameters)
      expect(methodParameters.value).to.eq('0')
    })

    it('erc20 -> 1 invalid NFT', async () => {
      const outputEther = BigNumber.from(makerOrder.price).toString()
      const erc20Trade = buildTrade([
        await V3Trade.fromRoute(
          new RouteV3([WETH_USDC_V3], USDC, ETHER),
          CurrencyAmount.fromRawAmount(ETHER, outputEther),
          TradeType.EXACT_OUTPUT
        ),
      ])
      const opts = swapOptions({ recipient: ROUTER_AS_RECIPIENT })
      const uniswapTrade = new UniswapTrade(erc20Trade, opts)
      const looksRareTrade = new LooksRareTrade([invalidLooksRareData])

      const methodParameters = SwapRouter.swapCallParameters([uniswapTrade, looksRareTrade], {
        sender: FORGE_SENDER_ADDRESS,
      })
      registerFixture('_ERC20_FOR_1_INVALID_NFT', methodParameters)
      expect(methodParameters.value).to.eq('0')
    })

    it('erc20 -> 3 NFTs partial fill', async () => {
      const outputEther = BigNumber.from(makerOrder.price).add(seaportValue).toString()
      const erc20Trade = buildTrade([
        await V3Trade.fromRoute(
          new RouteV3([WETH_USDC_V3], USDC, ETHER),
          CurrencyAmount.fromRawAmount(ETHER, outputEther),
          TradeType.EXACT_OUTPUT
        ),
      ])
      const opts = swapOptions({ recipient: ROUTER_AS_RECIPIENT })
      const uniswapTrade = new UniswapTrade(erc20Trade, opts)
      const looksRareTrade = new LooksRareTrade([invalidLooksRareData])

      const methodParameters = SwapRouter.swapCallParameters([uniswapTrade, looksRareTrade, seaportTrade], {
        sender: FORGE_SENDER_ADDRESS,
      })
      registerFixture('_ERC20_FOR_NFTS_PARTIAL_FILL', methodParameters)
      expect(methodParameters.value).to.eq('0')
    })
  })
})
