import { expect } from 'chai'
import JSBI from 'jsbi'
import { ethers, utils, Wallet } from 'ethers'
import { expandTo18Decimals } from '../src/utils/expandTo18Decimals'
import { SwapRouter } from '../src'
import { MixedRouteTrade, MixedRouteSDK, Trade as RouterTrade } from '@uniswap/router-sdk'
import { Trade as V2Trade, Pair, Route as RouteV2 } from '@uniswap/v2-sdk'
import { Trade as V3Trade, Route as RouteV3, Pool, FeeAmount } from '@uniswap/v3-sdk'
import { SwapOptions } from '../src'
import { PermitSingle } from '@uniswap/permit2-sdk'
import { generatePermitSignature, toInputPermit } from './utils/permit2'
import { ROUTER_ADDRESS } from './utils/addresses'
import { CurrencyAmount, TradeType, Ether, Token, Percent, Currency } from '@uniswap/sdk-core'
import { registerFixture } from './forge/writeInterop'
import { getPair, getPool } from './utils/uniswapData'

const ETHER = Ether.onChain(1)
const RECIPIENT = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const WETH = new Token(1, '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', 18, 'WETH', 'Wrapped Ether')
const DAI = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI', 'dai')
const USDC = new Token(1, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 6, 'USDC', 'USD Coin')
const FEE_AMOUNT = FeeAmount.MEDIUM
const FORK_BLOCK = 15947700

// live values from the fork block
// note: these tests aren't testing much but registering calldata to interop file
// for use in forge fork tests
describe('Uniswap', () => {
  const wallet = new Wallet(utils.zeroPad('0x1234', 32))
  let WETH_USDC_V2: Pair
  let USDC_DAI_V2: Pair
  let WETH_USDC_V3: Pool
  let WETH_USDC_V3_LOW_FEE: Pool
  let USDC_DAI_V3: Pool

  before(async () => {
    WETH_USDC_V2 = await getPair(WETH, USDC, FORK_BLOCK)
    USDC_DAI_V2 = await getPair(USDC, DAI, FORK_BLOCK)

    WETH_USDC_V3 = await getPool(WETH, USDC, FEE_AMOUNT, FORK_BLOCK)
    WETH_USDC_V3_LOW_FEE = await getPool(WETH, USDC, FeeAmount.LOW, FORK_BLOCK)
    USDC_DAI_V3 = await getPool(USDC, DAI, FEE_AMOUNT, FORK_BLOCK)
  })

  describe('v2', () => {
    it('encodes a single exactInput ETH->USDC swap', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_1_ETH_FOR_USDC', methodParameters)
      expect(methodParameters.value).to.eq(inputEther)
    })

    it('encodes an exactInput ETH->USDC->DAI swap', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2, USDC_DAI_V2], ETHER, DAI),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_1_ETH_FOR_USDC_2_HOP', methodParameters)
      expect(methodParameters.value).to.eq(inputEther)
    })

    it('encodes a single exactInput USDC->ETH swap', async () => {
      const inputUSDC = utils.parseUnits('1000', 6).toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], USDC, ETHER),
        CurrencyAmount.fromRawAmount(USDC, inputUSDC),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_1000_USDC_FOR_ETH', methodParameters)
      expect(methodParameters.value).to.eq('0')
    })

    it('encodes a single exactInput USDC->ETH swap with permit', async () => {
      const inputUSDC = utils.parseUnits('1000', 6).toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], USDC, ETHER),
        CurrencyAmount.fromRawAmount(USDC, inputUSDC),
        TradeType.EXACT_INPUT
      )
      const permit = makePermit(USDC.address, inputUSDC)
      const signature = await generatePermitSignature(permit, wallet, trade.route.chainId)
      const opts = swapOptions({ inputTokenPermit: toInputPermit(signature, permit) })
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_1000_USDC_FOR_ETH_PERMIT', methodParameters)
      expect(methodParameters.value).to.eq('0')
    })

    it('encodes an exactInput DAI->USDC->ETH swap', async () => {
      const inputDAI = utils.parseEther('10').toString()
      const trade = new V2Trade(
        new RouteV2([USDC_DAI_V2, WETH_USDC_V2], DAI, ETHER),
        CurrencyAmount.fromRawAmount(DAI, inputDAI),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_10_DAI_FOR_ETH_2_HOP', methodParameters)
      expect(methodParameters.value).to.eq('0')
    })

    it('encodes a single exactOutput ETH->USDC swap', async () => {
      const outputUSDC = utils.parseUnits('1000', 6).toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], ETHER, USDC),
        CurrencyAmount.fromRawAmount(USDC, outputUSDC),
        TradeType.EXACT_OUTPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_ETH_FOR_1000_USDC', methodParameters)
      expect(methodParameters.value).to.not.equal('0')
    })

    it('encodes a single exactOutput USDC->ETH swap', async () => {
      const outputETH = utils.parseEther('1').toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], USDC, ETHER),
        CurrencyAmount.fromRawAmount(ETHER, outputETH),
        TradeType.EXACT_OUTPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_USDC_FOR_1_ETH', methodParameters)
      expect(methodParameters.value).to.eq('0')
    })
  })

  describe('v3', () => {
    it('encodes a single exactInput ETH->USDC swap', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = await V3Trade.fromRoute(
        new RouteV3([WETH_USDC_V3], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_1_ETH_FOR_USDC', methodParameters)
      expect(methodParameters.value).to.eq(inputEther)
    })

    it('encodes a single exactInput USDC->ETH swap', async () => {
      const inputUSDC = utils.parseUnits('1000', 6).toString()
      const trade = await V3Trade.fromRoute(
        new RouteV3([WETH_USDC_V3], USDC, ETHER),
        CurrencyAmount.fromRawAmount(USDC, inputUSDC),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_1000_USDC_FOR_ETH', methodParameters)
      expect(methodParameters.value).to.eq('0')
    })

    it('encodes a single exactInput USDC->ETH swap with permit', async () => {
      const inputUSDC = utils.parseUnits('1000', 6).toString()
      const trade = await V3Trade.fromRoute(
        new RouteV3([WETH_USDC_V3], USDC, ETHER),
        CurrencyAmount.fromRawAmount(USDC, inputUSDC),
        TradeType.EXACT_INPUT
      )
      const permit = makePermit(USDC.address, inputUSDC)
      const signature = await generatePermitSignature(permit, wallet, trade.swaps[0].route.chainId)
      const opts = swapOptions({ inputTokenPermit: toInputPermit(signature, permit) })
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_1000_USDC_FOR_ETH_PERMIT', methodParameters)
      expect(methodParameters.value).to.eq('0')
    })

    it('encodes a single exactInput ETH->USDC->DAI swap', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = await V3Trade.fromRoute(
        new RouteV3([WETH_USDC_V3, USDC_DAI_V3], ETHER, DAI),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_1_ETH_FOR_DAI_2_HOP', methodParameters)
      expect(methodParameters.value).to.eq(inputEther)
    })

    it('encodes a single exactOutput ETH->USDC swap', async () => {
      const outputUSDC = utils.parseUnits('1000', 6).toString()
      const trade = await V3Trade.fromRoute(
        new RouteV3([WETH_USDC_V3], ETHER, USDC),
        CurrencyAmount.fromRawAmount(USDC, outputUSDC),
        TradeType.EXACT_OUTPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_ETH_FOR_1000_USDC', methodParameters)
      expect(methodParameters.value).to.not.equal('0')
    })

    it('encodes a single exactOutput USDC->ETH swap', async () => {
      const outputEther = utils.parseEther('1').toString()
      const trade = await V3Trade.fromRoute(
        new RouteV3([WETH_USDC_V3], USDC, ETHER),
        CurrencyAmount.fromRawAmount(ETHER, outputEther),
        TradeType.EXACT_OUTPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_USDC_FOR_1_ETH', methodParameters)
      expect(methodParameters.value).to.eq('0')
    })

    it('encodes an exactOutput ETH->USDC->DAI swap', async () => {
      const outputDai = utils.parseEther('1000').toString()
      const trade = await V3Trade.fromRoute(
        new RouteV3([WETH_USDC_V3, USDC_DAI_V3], ETHER, DAI),
        CurrencyAmount.fromRawAmount(DAI, outputDai),
        TradeType.EXACT_OUTPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_ETH_FOR_1000_DAI_2_HOP', methodParameters)
      expect(methodParameters.value).to.not.equal('0')
    })

    it('encodes an exactOutput DAI->USDC->ETH swap', async () => {
      const outputEther = utils.parseEther('1').toString()
      const trade = await V3Trade.fromRoute(
        new RouteV3([USDC_DAI_V3, WETH_USDC_V3], DAI, ETHER),
        CurrencyAmount.fromRawAmount(ETHER, outputEther),
        TradeType.EXACT_OUTPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_DAI_FOR_1_ETH_2_HOP', methodParameters)
      expect(methodParameters.value).to.equal('0')
    })
  })

  describe('mixed (interleaved)', async () => {
    it('encodes a mixed exactInput v3ETH->v2USDC->DAI swap', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = await MixedRouteTrade.fromRoute(
        new MixedRouteSDK([WETH_USDC_V3, USDC_DAI_V2], ETHER, DAI),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_MIXED_1_ETH_FOR_DAI', methodParameters)
      expect(methodParameters.value).to.eq(inputEther)
    })

    it('encodes a mixed exactInput v2ETH->v3USDC->DAI swap', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = await MixedRouteTrade.fromRoute(
        new MixedRouteSDK([WETH_USDC_V2, USDC_DAI_V3], ETHER, DAI),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_MIXED_1_ETH_FOR_DAI_V2_FIRST', methodParameters)
      expect(methodParameters.value).to.eq(inputEther)
    })

    it('encodes a mixed exactInput v2ETH->v2USDC->DAI swap', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = await MixedRouteTrade.fromRoute(
        new MixedRouteSDK([WETH_USDC_V2, USDC_DAI_V2], ETHER, DAI),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_MIXED_1_ETH_FOR_DAI_V2_ONLY', methodParameters)
      expect(methodParameters.value).to.eq(inputEther)
    })

    it('encodes a mixed exactInput v3ETH->v3USDC->DAI swap', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = await MixedRouteTrade.fromRoute(
        new MixedRouteSDK([WETH_USDC_V3, USDC_DAI_V3], ETHER, DAI),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_MIXED_1_ETH_FOR_DAI_V3_ONLY', methodParameters)
      expect(methodParameters.value).to.eq(inputEther)
    })

    it('encodes a mixed exactInput v2DAI->v3USDC->ETH swap', async () => {
      const inputDai = utils.parseEther('1000').toString()
      const trade = await MixedRouteTrade.fromRoute(
        new MixedRouteSDK([USDC_DAI_V2, WETH_USDC_V3], DAI, ETHER),
        CurrencyAmount.fromRawAmount(DAI, inputDai),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_MIXED_DAI_FOR_ETH', methodParameters)
      expect(methodParameters.value).to.eq('0')
    })
  })

  describe('multi-route', async () => {
    it('encodes a split exactInput with 2 routes v3ETH->v3USDC & v2ETH->v2USDC swap', async () => {
      const inputEther = expandTo18Decimals(1)
      const v2Trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const v3Trade = await V3Trade.fromRoute(
        new RouteV3([WETH_USDC_V3], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([v2Trade, v3Trade]), opts)
      registerFixture('_UNISWAP_SPLIT_TWO_ROUTES_ETH_TO_USDC', methodParameters)
      expect(methodParameters.value).to.eq(JSBI.multiply(inputEther, JSBI.BigInt(2)).toString())
    })

    it('encodes a split exactInput with 3 routes v3ETH->v3USDC & v2ETH->v2USDC swap', async () => {
      const inputEther = expandTo18Decimals(1)
      const v2Trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const v3Trade1 = await V3Trade.fromRoute(
        new RouteV3([WETH_USDC_V3], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const v3Trade2 = await V3Trade.fromRoute(
        new RouteV3([WETH_USDC_V3_LOW_FEE], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )

      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapERC20CallParameters(buildTrade([v2Trade, v3Trade1, v3Trade2]), opts)
      registerFixture('_UNISWAP_SPLIT_THREE_ROUTES_ETH_TO_USDC', methodParameters)
      expect(methodParameters.value).to.eq(JSBI.multiply(inputEther, JSBI.BigInt(3)).toString())
    })
  })
})

// use some sane defaults
function swapOptions(options: Partial<SwapOptions>): SwapOptions {
  return Object.assign(options, {
    slippageTolerance: new Percent(5, 100),
    recipient: RECIPIENT,
  })
}

function makePermit(
  token: string,
  amount: string = ethers.constants.MaxUint256.toString(),
  nonce: string = '0'
): PermitSingle {
  return {
    details: {
      token,
      amount,
      expiration: Math.floor(new Date().getTime() / 1000 + 1000).toString(),
      nonce,
    },
    spender: ROUTER_ADDRESS,
    sigDeadline: Math.floor(new Date().getTime() / 1000 + 1000).toString(),
  }
}

// alternative constructor to create from protocol-specific sdks
function buildTrade(
  trades: (
    | V2Trade<Currency, Currency, TradeType>
    | V3Trade<Currency, Currency, TradeType>
    | MixedRouteTrade<Currency, Currency, TradeType>
  )[]
): RouterTrade<Currency, Currency, TradeType> {
  return new RouterTrade({
    v2Routes: trades
      .filter((trade) => trade instanceof V2Trade)
      .map((trade) => ({
        routev2: trade.route as RouteV2<Currency, Currency>,
        inputAmount: trade.inputAmount,
        outputAmount: trade.outputAmount,
      })),
    v3Routes: trades
      .filter((trade) => trade instanceof V3Trade)
      .map((trade) => ({
        routev3: trade.route as RouteV3<Currency, Currency>,
        inputAmount: trade.inputAmount,
        outputAmount: trade.outputAmount,
      })),
    mixedRoutes: trades
      .filter((trade) => trade instanceof MixedRouteTrade)
      .map((trade) => ({
        mixedRoute: trade.route as MixedRouteSDK<Currency, Currency>,
        inputAmount: trade.inputAmount,
        outputAmount: trade.outputAmount,
      })),
    tradeType: trades[0].tradeType,
  })
}
