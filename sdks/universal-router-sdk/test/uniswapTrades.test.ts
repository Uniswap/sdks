import { expect } from 'chai'
import JSBI from 'jsbi'
import { BigNumber, ethers, utils, Wallet } from 'ethers'
import { expandTo18Decimals } from '../src/utils/numbers'
import { SwapRouter, UniswapTrade, FlatFeeOptions } from '../src'
import { MixedRouteTrade, MixedRouteSDK } from '@uniswap/router-sdk'
import { Trade as V2Trade, Pair, Route as RouteV2 } from '@uniswap/v2-sdk'
import {
  Trade as V3Trade,
  Route as V3Route,
  Pool as V3Pool,
  Position,
  FeeOptions,
  encodeSqrtRatioX96,
  nearestUsableTick,
  TickMath,
  FeeAmount,
} from '@uniswap/v3-sdk'
import { Pool as V4Pool, Route as V4Route, Trade as V4Trade, Position as V4Position } from '@uniswap/v4-sdk'
import { generatePermitSignature, toInputPermit, makePermit, generateEip2098PermitSignature } from './utils/permit2'
import {
  CHAIN_TO_ADDRESSES_MAP,
  ChainId,
  CurrencyAmount,
  Ether,
  Percent,
  SupportedChainsType,
  Token,
  TradeType,
} from '@uniswap/sdk-core'
import { registerFixture } from './forge/writeInterop'
import { buildTrade, getUniswapPools, swapOptions, ETHER, DAI, USDC, WETH } from './utils/uniswapData'
import { hexToDecimalString } from './utils/hexToDecimalString'
import {
  FORGE_PERMIT2_ADDRESS,
  FORGE_ROUTER_ADDRESS,
  TEST_FEE_RECIPIENT_ADDRESS,
  TEST_RECIPIENT_ADDRESS,
} from './utils/addresses'
import {
  PartialClassicQuote,
  PoolType,
  RouterTradeAdapter,
  V2PoolInRoute,
  V3PoolInRoute,
} from '../src/utils/routerTradeAdapter'
import {
  E_ETH_ADDRESS,
  ETH_ADDRESS,
  ZERO_ADDRESS,
  UNIVERSAL_ROUTER_ADDRESS,
  UniversalRouterVersion,
} from '../src/utils/constants'

const FORK_BLOCK = 16075500

// note: these tests aren't testing much but registering calldata to interop file
// for use in forge fork tests
describe('Uniswap', () => {
  const wallet = new Wallet(utils.zeroPad('0x1234', 32))
  let WETH_USDC_V2: Pair
  let USDC_DAI_V2: Pair
  let WETH_USDC_V3: V3Pool
  let WETH_USDC_V3_LOW_FEE: V3Pool
  let USDC_DAI_V3: V3Pool
  let ETH_USDC_V4: V4Pool
  let WETH_USDC_V4: V4Pool
  let USDC_DAI_V4: V4Pool

  before(async () => {
    ;({ WETH_USDC_V2, USDC_DAI_V2, WETH_USDC_V3, USDC_DAI_V3, WETH_USDC_V3_LOW_FEE } = await getUniswapPools(
      FORK_BLOCK
    ))

    let liquidity = JSBI.BigInt(utils.parseEther('1000000').toString())
    let tickSpacing = 60
    let tickProviderMock = [
      {
        index: nearestUsableTick(TickMath.MIN_TICK, tickSpacing),
        liquidityNet: liquidity,
        liquidityGross: liquidity,
      },
      {
        index: nearestUsableTick(TickMath.MAX_TICK, tickSpacing),
        liquidityNet: JSBI.multiply(liquidity, JSBI.BigInt('-1')),
        liquidityGross: liquidity,
      },
    ]

    WETH_USDC_V4 = new V4Pool(
      WETH,
      USDC,
      3_000,
      tickSpacing,
      ZERO_ADDRESS,
      encodeSqrtRatioX96(1, 1),
      liquidity,
      0,
      tickProviderMock
    )

    ETH_USDC_V4 = new V4Pool(
      ETHER,
      USDC,
      3_000,
      tickSpacing,
      ZERO_ADDRESS,
      encodeSqrtRatioX96(1, 1),
      liquidity,
      0,
      tickProviderMock
    )

    USDC_DAI_V4 = new V4Pool(
      DAI,
      USDC,
      3_000,
      tickSpacing,
      ZERO_ADDRESS,
      encodeSqrtRatioX96(1, 1),
      liquidity,
      0,
      tickProviderMock
    )
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
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_1_ETH_FOR_USDC', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(inputEther)
    })

    it('encodes a single exactInput ETH->USDC swap, with a fee', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const feeOptions: FeeOptions = { fee: new Percent(5, 100), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ fee: feeOptions })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_1_ETH_FOR_USDC_WITH_FEE', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(inputEther)
    })

    it('encodes an exactInput ETH->USDC->DAI swap', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2, USDC_DAI_V2], ETHER, DAI),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_1_ETH_FOR_USDC_2_HOP', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(inputEther)
    })

    it('encodes an exactInput ETH->USDC->DAI swap, with a fee', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2, USDC_DAI_V2], ETHER, DAI),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const feeOptions: FeeOptions = { fee: new Percent(5, 100), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ fee: feeOptions })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_1_ETH_FOR_USDC_2_HOP_WITH_FEE', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(inputEther)
    })

    it('encodes a single exactInput USDC->ETH swap', async () => {
      const inputUSDC = utils.parseUnits('1000', 6).toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], USDC, ETHER),
        CurrencyAmount.fromRawAmount(USDC, inputUSDC),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_1000_USDC_FOR_ETH', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq('0')
    })

    it('encodes a single exactInput USDC->ETH swap, with WETH fee', async () => {
      const inputUSDC = utils.parseUnits('1000', 6).toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], USDC, ETHER),
        CurrencyAmount.fromRawAmount(USDC, inputUSDC),
        TradeType.EXACT_INPUT
      )
      const feeOptions: FeeOptions = { fee: new Percent(5, 100), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ fee: feeOptions })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_1000_USDC_FOR_ETH_WITH_WETH_FEE', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq('0')
    })

    it('encodes a single exactInput USDC->ETH swap with permit', async () => {
      const inputUSDC = utils.parseUnits('1000', 6).toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], USDC, ETHER),
        CurrencyAmount.fromRawAmount(USDC, inputUSDC),
        TradeType.EXACT_INPUT
      )
      const permit = makePermit(USDC.address, inputUSDC, undefined, FORGE_ROUTER_ADDRESS)
      const signature = await generatePermitSignature(permit, wallet, trade.route.chainId, FORGE_PERMIT2_ADDRESS)
      const opts = swapOptions({ inputTokenPermit: toInputPermit(signature, permit) })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_1000_USDC_FOR_ETH_PERMIT', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq('0')
    })

    it('encodes a single exactInput USDC->ETH swap with EIP-2098 permit', async () => {
      const inputUSDC = utils.parseUnits('1000', 6).toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], USDC, ETHER),
        CurrencyAmount.fromRawAmount(USDC, inputUSDC),
        TradeType.EXACT_INPUT
      )
      const permit = makePermit(USDC.address, inputUSDC, undefined, FORGE_ROUTER_ADDRESS)
      const signature = await generateEip2098PermitSignature(permit, wallet, trade.route.chainId)
      const opts = swapOptions({ inputTokenPermit: toInputPermit(signature, permit) })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_1000_USDC_FOR_ETH_2098_PERMIT', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq('0')
    })

    it('encodes a single exactInput USDC->ETH swap with permit with v recovery id', async () => {
      const inputUSDC = utils.parseUnits('1000', 6).toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], USDC, ETHER),
        CurrencyAmount.fromRawAmount(USDC, inputUSDC),
        TradeType.EXACT_INPUT
      )
      const permit = makePermit(USDC.address, inputUSDC, undefined, FORGE_ROUTER_ADDRESS)
      const originalSignature = await generatePermitSignature(
        permit,
        wallet,
        trade.route.chainId,
        FORGE_PERMIT2_ADDRESS
      )
      const { recoveryParam } = utils.splitSignature(originalSignature)
      // slice off current v
      let signature = originalSignature.substring(0, originalSignature.length - 2)
      // append recoveryParam as v
      signature += BigNumber.from(recoveryParam).toHexString().slice(2)
      // assert ethers sanitization technique works
      expect(utils.joinSignature(utils.splitSignature(signature))).to.eq(originalSignature)
      const opts = swapOptions({ inputTokenPermit: toInputPermit(signature, permit) })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_1000_USDC_FOR_ETH_PERMIT_V_RECOVERY_PARAM', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq('0')
    })

    it('encodes an exactInput DAI->USDC->ETH swap', async () => {
      const inputDAI = utils.parseEther('10').toString()
      const trade = new V2Trade(
        new RouteV2([USDC_DAI_V2, WETH_USDC_V2], DAI, ETHER),
        CurrencyAmount.fromRawAmount(DAI, inputDAI),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_10_DAI_FOR_ETH_2_HOP', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq('0')
    })

    it('encodes a single exactOutput ETH->USDC swap', async () => {
      const outputUSDC = utils.parseUnits('1000', 6).toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], ETHER, USDC),
        CurrencyAmount.fromRawAmount(USDC, outputUSDC),
        TradeType.EXACT_OUTPUT
      )
      const routerTrade = buildTrade([trade])
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_ETH_FOR_1000_USDC', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.not.equal('0')
    })

    it('encodes a single exactOutput ETH->USDC swap, with a fee', async () => {
      // We must adjust the output amount for the 5% output fee
      const outputUSDC = utils.parseUnits('1000', 6)
      const adjustedOutputUSDC = outputUSDC
        .mul(10000)
        .div(10000 - 500)
        .toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], ETHER, USDC),
        CurrencyAmount.fromRawAmount(USDC, adjustedOutputUSDC),
        TradeType.EXACT_OUTPUT
      )
      const feeOptions: FeeOptions = { fee: new Percent(5, 100), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ fee: feeOptions })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_ETH_FOR_1000_USDC_WITH_FEE', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.not.equal('0')
    })

    it('encodes a single exactOutput ETH->USDC swap, with a flat fee', async () => {
      const outputUSDC = utils.parseUnits('1050', 6).toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], ETHER, USDC),
        CurrencyAmount.fromRawAmount(USDC, outputUSDC),
        TradeType.EXACT_OUTPUT
      )
      const feeOptions: FlatFeeOptions = { amount: utils.parseUnits('50', 6), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ flatFee: feeOptions })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_ETH_FOR_1000_USDC_WITH_FLAT_FEE', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.not.equal('0')
    })

    it('encodes a single exactOutput USDC->ETH swap, with a flat fee', async () => {
      const outputUSDC = utils.parseUnits('15', 18).toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], USDC, ETHER),
        CurrencyAmount.fromRawAmount(ETHER, outputUSDC),
        TradeType.EXACT_OUTPUT
      )
      const feeOptions: FlatFeeOptions = { amount: utils.parseUnits('5', 18), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ flatFee: feeOptions })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_USCD_FOR_10_ETH_WITH_FLAT_FEE', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.equal('0')
    })

    it('encodes a single exactOutput USDC->ETH swap', async () => {
      const outputETH = utils.parseEther('1').toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], USDC, ETHER),
        CurrencyAmount.fromRawAmount(ETHER, outputETH),
        TradeType.EXACT_OUTPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V2_USDC_FOR_1_ETH', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq('0')
    })
  })

  describe('v3', () => {
    it('encodes a single exactInput ETH->USDC swap', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = await V3Trade.fromRoute(
        new V3Route([WETH_USDC_V3], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_1_ETH_FOR_USDC', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(inputEther)
    })

    it('encodes a single exactInput ETH->USDC swap, with a fee', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = await V3Trade.fromRoute(
        new V3Route([WETH_USDC_V3], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const feeOptions: FeeOptions = { fee: new Percent(5, 100), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ fee: feeOptions })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_1_ETH_FOR_USDC_WITH_FEE', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(inputEther)
    })

    it('encodes a single exactInput ETH->USDC swap, with a flat fee', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = await V3Trade.fromRoute(
        new V3Route([WETH_USDC_V3], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const feeOptions: FlatFeeOptions = { amount: utils.parseUnits('50', 6), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ flatFee: feeOptions })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_1_ETH_FOR_USDC_WITH_FLAT_FEE', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(inputEther)
    })

    it('encodes a single exactInput USDC->ETH swap', async () => {
      const inputUSDC = utils.parseUnits('1000', 6).toString()
      const trade = await V3Trade.fromRoute(
        new V3Route([WETH_USDC_V3], USDC, ETHER),
        CurrencyAmount.fromRawAmount(USDC, inputUSDC),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_1000_USDC_FOR_ETH', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq('0')
    })

    it('encodes a single exactInput USDC->ETH swap, with WETH fee', async () => {
      const inputUSDC = utils.parseUnits('1000', 6).toString()
      const trade = await V3Trade.fromRoute(
        new V3Route([WETH_USDC_V3], USDC, ETHER),
        CurrencyAmount.fromRawAmount(USDC, inputUSDC),
        TradeType.EXACT_INPUT
      )
      const feeOptions: FeeOptions = { fee: new Percent(5, 100), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ fee: feeOptions })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_1000_USDC_FOR_ETH_WITH_WETH_FEE', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq('0')
    })

    it('encodes a single exactInput USDC->ETH swap with permit', async () => {
      const inputUSDC = utils.parseUnits('1000', 6).toString()
      const trade = await V3Trade.fromRoute(
        new V3Route([WETH_USDC_V3], USDC, ETHER),
        CurrencyAmount.fromRawAmount(USDC, inputUSDC),
        TradeType.EXACT_INPUT
      )
      const permit = makePermit(USDC.address, inputUSDC, undefined, FORGE_ROUTER_ADDRESS)
      const signature = await generatePermitSignature(
        permit,
        wallet,
        trade.swaps[0].route.chainId,
        FORGE_PERMIT2_ADDRESS
      )
      const opts = swapOptions({ inputTokenPermit: toInputPermit(signature, permit) })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_1000_USDC_FOR_ETH_PERMIT', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq('0')
    })

    it('encodes a single exactInput ETH->USDC->DAI swap', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = await V3Trade.fromRoute(
        new V3Route([WETH_USDC_V3, USDC_DAI_V3], ETHER, DAI),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_1_ETH_FOR_DAI_2_HOP', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(inputEther)
    })

    it('encodes a single exactInput ETH->USDC->DAI swap in safemode, sends too much ETH', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = await V3Trade.fromRoute(
        new V3Route([WETH_USDC_V3, USDC_DAI_V3], ETHER, DAI),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({ safeMode: true })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_ETH_FOR_DAI_SAFE_MODE', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(inputEther)
    })

    it('encodes a single exactOutput ETH->USDC swap', async () => {
      const outputUSDC = utils.parseUnits('1000', 6).toString()
      const trade = await V3Trade.fromRoute(
        new V3Route([WETH_USDC_V3], ETHER, USDC),
        CurrencyAmount.fromRawAmount(USDC, outputUSDC),
        TradeType.EXACT_OUTPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_ETH_FOR_1000_USDC', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.not.equal('0')
    })

    it('encodes a single exactOutput USDC->ETH swap', async () => {
      const outputEther = utils.parseEther('1').toString()
      const trade = await V3Trade.fromRoute(
        new V3Route([WETH_USDC_V3], USDC, ETHER),
        CurrencyAmount.fromRawAmount(ETHER, outputEther),
        TradeType.EXACT_OUTPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_USDC_FOR_1_ETH', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq('0')
    })

    it('encodes an exactOutput ETH->USDC->DAI swap', async () => {
      const outputDai = utils.parseEther('1000').toString()
      const trade = await V3Trade.fromRoute(
        new V3Route([WETH_USDC_V3, USDC_DAI_V3], ETHER, DAI),
        CurrencyAmount.fromRawAmount(DAI, outputDai),
        TradeType.EXACT_OUTPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_ETH_FOR_1000_DAI_2_HOP', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.not.equal('0')
    })

    it('encodes an exactOutput DAI->USDC->ETH swap', async () => {
      const outputEther = utils.parseEther('1').toString()
      const trade = await V3Trade.fromRoute(
        new V3Route([USDC_DAI_V3, WETH_USDC_V3], DAI, ETHER),
        CurrencyAmount.fromRawAmount(ETHER, outputEther),
        TradeType.EXACT_OUTPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_DAI_FOR_1_ETH_2_HOP', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.equal('0')
    })

    it('encodes an exactOutput DAI->USDC->ETH swap, with WETH fee', async () => {
      // "exact output" of 1ETH. We must adjust for a 5% fee
      const outputEther = utils.parseEther('1')
      const adjustedOutputEther = outputEther
        .mul(10000)
        .div(10000 - 500)
        .toString()
      const trade = await V3Trade.fromRoute(
        new V3Route([USDC_DAI_V3, WETH_USDC_V3], DAI, ETHER),
        CurrencyAmount.fromRawAmount(ETHER, adjustedOutputEther),
        TradeType.EXACT_OUTPUT
      )

      const feeOptions: FeeOptions = { fee: new Percent(5, 100), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ fee: feeOptions })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V3_DAI_FOR_1_ETH_2_HOP_WITH_WETH_FEE', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.equal('0')
    })
  })

  describe('v4', () => {
    it('encodes a single exactInput ETH->USDC swap', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = await V4Trade.fromRoute(
        new V4Route([ETH_USDC_V4], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V4_1_ETH_FOR_USDC', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(inputEther)
    })

    // this test needs v4-sdk 1.6.3 to merge
    // it('encodes a single exactInput ETH->USDC swap, via WETH', async () => {
    //   const inputEther = utils.parseEther('1').toString()
    //   const trade = await V4Trade.fromRoute(
    //     new V4Route([WETH_USDC_V4], ETHER, USDC),
    //     CurrencyAmount.fromRawAmount(ETHER, inputEther),
    //     TradeType.EXACT_INPUT
    //   )
    //   const opts = swapOptions({})
    //   const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
    //   registerFixture('_UNISWAP_V4_1_ETH_FOR_USDC_WITH_WRAP', methodParameters)
    //   expect(hexToDecimalString(methodParameters.value)).to.eq(inputEther)
    // })

    it('encodes a single exactInput ETH->USDC swap, with a fee', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = await V4Trade.fromRoute(
        new V4Route([ETH_USDC_V4], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const feeOptions: FeeOptions = { fee: new Percent(5, 100), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ fee: feeOptions })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V4_1_ETH_FOR_USDC_WITH_FEE', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(inputEther)
    })

    it('encodes a single exactInput ETH->USDC swap, with a flat fee', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = await V4Trade.fromRoute(
        new V4Route([ETH_USDC_V4], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const feeOptions: FlatFeeOptions = { amount: utils.parseUnits('50', 6), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ flatFee: feeOptions })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V4_1_ETH_FOR_USDC_WITH_FLAT_FEE', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(inputEther)
    })

    it('encodes a single exactInput USDC->ETH swap', async () => {
      const inputUSDC = utils.parseUnits('1000', 6).toString()
      const trade = await V4Trade.fromRoute(
        new V4Route([ETH_USDC_V4], USDC, ETHER),
        CurrencyAmount.fromRawAmount(USDC, inputUSDC),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V4_1000_USDC_FOR_ETH', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq('0')
    })

    it('encodes a single exactInput ETH->USDC->DAI swap', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = await V4Trade.fromRoute(
        new V4Route([ETH_USDC_V4, USDC_DAI_V4], ETHER, DAI),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({ safeMode: true })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V4_ETH_FOR_DAI', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(inputEther)
    })

    it('encodes an exactOutput DAI->USDC->ETH swap', async () => {
      const outputEther = utils.parseEther('1').toString()
      const trade = await V4Trade.fromRoute(
        new V4Route([USDC_DAI_V4, ETH_USDC_V4], DAI, ETHER),
        CurrencyAmount.fromRawAmount(ETHER, outputEther),
        TradeType.EXACT_OUTPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_V4_DAI_FOR_1_ETH_2_HOP', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.equal('0')
    })

    it.skip('encodes an exactOutput DAI->USDC->ETH swap, with WETH fee', async () => {
      // "exact output" of 1ETH. We must adjust for a 5% fee
      // v4-sdk 1.6.3 needed
      const outputEther = utils.parseEther('1')
      const adjustedOutputEther = outputEther
        .mul(10000)
        .div(10000 - 500)
        .toString()
      const trade = await V4Trade.fromRoute(
        new V4Route([USDC_DAI_V4, WETH_USDC_V4], DAI, ETHER),
        CurrencyAmount.fromRawAmount(ETHER, adjustedOutputEther),
        TradeType.EXACT_OUTPUT
      )
      const feeOptions: FeeOptions = { fee: new Percent(5, 100), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ fee: feeOptions })
      buildTrade([trade])
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      // registerFixture('_UNISWAP_V4_DAI_FOR_1_ETH_2_HOP_WITH_WETH_FEE', methodParameters)
      // expect(hexToDecimalString(methodParameters.value)).to.equal('0')
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
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_MIXED_1_ETH_FOR_DAI', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(inputEther)
    })

    it('encodes a mixed exactInput v2ETH->v3USDC->DAI swap', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = await MixedRouteTrade.fromRoute(
        new MixedRouteSDK([WETH_USDC_V2, USDC_DAI_V3], ETHER, DAI),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_MIXED_1_ETH_FOR_DAI_V2_FIRST', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(inputEther)
    })

    it('encodes a mixed exactInput v2ETH->v2USDC->DAI swap', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = await MixedRouteTrade.fromRoute(
        new MixedRouteSDK([WETH_USDC_V2, USDC_DAI_V2], ETHER, DAI),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_MIXED_1_ETH_FOR_DAI_V2_ONLY', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(inputEther)
    })

    it('encodes a mixed exactInput v3ETH->v3USDC->DAI swap', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = await MixedRouteTrade.fromRoute(
        new MixedRouteSDK([WETH_USDC_V3, USDC_DAI_V3], ETHER, DAI),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_MIXED_1_ETH_FOR_DAI_V3_ONLY', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(inputEther)
    })

    it('encodes a mixed exactInput v2DAI->v3USDC->ETH swap', async () => {
      const inputDai = utils.parseEther('1000').toString()
      const trade = await MixedRouteTrade.fromRoute(
        new MixedRouteSDK([USDC_DAI_V2, WETH_USDC_V3], DAI, ETHER),
        CurrencyAmount.fromRawAmount(DAI, inputDai),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      registerFixture('_UNISWAP_MIXED_DAI_FOR_ETH', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq('0')
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
        new V3Route([WETH_USDC_V3], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([v2Trade, v3Trade]), opts)
      registerFixture('_UNISWAP_SPLIT_TWO_ROUTES_ETH_TO_USDC', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(JSBI.multiply(inputEther, JSBI.BigInt(2)).toString())
    })

    it('encodes a split exactInput with 3 routes v3ETH->v3USDC & v2ETH->v2USDC swap', async () => {
      const inputEther = expandTo18Decimals(1)
      const v2Trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const v3Trade1 = await V3Trade.fromRoute(
        new V3Route([WETH_USDC_V3], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const v3Trade2 = await V3Trade.fromRoute(
        new V3Route([WETH_USDC_V3_LOW_FEE], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )

      const opts = swapOptions({})
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([v2Trade, v3Trade1, v3Trade2]), opts)
      registerFixture('_UNISWAP_SPLIT_TWO_ROUTES_ETH_TO_USDC', methodParameters)
      registerFixture('_UNISWAP_SPLIT_THREE_ROUTES_ETH_TO_USDC', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq(JSBI.multiply(inputEther, JSBI.BigInt(3)).toString())
    })
  })

  describe('fees', () => {
    it('throws if instantiated with a proportional fee and a flat fee', async () => {
      const outputUSDC = utils.parseUnits('1050', 6).toString()
      const trade = new V2Trade(
        new RouteV2([WETH_USDC_V2], ETHER, USDC),
        CurrencyAmount.fromRawAmount(USDC, outputUSDC),
        TradeType.EXACT_OUTPUT
      )
      const proportionalFee: FeeOptions = { fee: new Percent(5, 100), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const feeOptions: FlatFeeOptions = { amount: utils.parseUnits('50', 6), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ fee: proportionalFee, flatFee: feeOptions })
      expect(function () {
        SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      }).to.throw('Only one fee option permitted')
    })

    it('throws if flat fee amount is larger than minimumAmountOut', async () => {
      const inputEther = utils.parseEther('1').toString()
      const trade = await V3Trade.fromRoute(
        new V3Route([WETH_USDC_V3], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, inputEther),
        TradeType.EXACT_INPUT
      )
      const feeOptions: FlatFeeOptions = { amount: utils.parseUnits('5000', 6), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ flatFee: feeOptions })
      expect(function () {
        SwapRouter.swapCallParameters(buildTrade([trade]), opts)
      }).to.throw('Flat fee amount greater than minimumAmountOut')
    })
  })

  const mockV2PoolInRoute = (
    pair: Pair,
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    amountOut: string
  ): V2PoolInRoute => {
    // get token0 and token1
    const token0 = tokenIn.sortsBefore(tokenOut) ? tokenIn : tokenOut
    const token1 = tokenIn.sortsBefore(tokenOut) ? tokenOut : tokenIn

    return {
      type: PoolType.V2Pool,
      tokenIn: {
        address: tokenIn.address,
        chainId: 1,
        symbol: tokenIn.symbol!,
        decimals: String(tokenIn.decimals),
      },
      tokenOut: {
        address: tokenOut.address,
        chainId: 1,
        symbol: tokenOut.symbol!,
        decimals: String(tokenOut.decimals),
      },
      reserve0: {
        token: {
          address: token0.address,
          chainId: 1,
          symbol: token0.symbol!,
          decimals: String(token0.decimals),
        },
        quotient: pair.reserve0.quotient.toString(),
      },
      reserve1: {
        token: {
          address: token1.address,
          chainId: 1,
          symbol: token1.symbol!,
          decimals: String(token1.decimals),
        },
        quotient: pair.reserve1.quotient.toString(),
      },
      amountIn,
      amountOut,
    }
  }

  const mockV3PoolInRoute = (
    pool: V3Pool,
    tokenIn: Token,
    tokenOut: Token,
    amountIn: string,
    amountOut: string
  ): V3PoolInRoute => {
    return {
      type: PoolType.V3Pool,
      tokenIn: {
        address: tokenIn.address,
        chainId: 1,
        symbol: tokenIn.symbol!,
        decimals: String(tokenIn.decimals),
      },
      tokenOut: {
        address: tokenOut.address,
        chainId: 1,
        symbol: tokenOut.symbol!,
        decimals: String(tokenOut.decimals),
      },
      sqrtRatioX96: pool.sqrtRatioX96.toString(),
      liquidity: pool.liquidity.toString(),
      tickCurrent: pool.tickCurrent.toString(),
      fee: pool.fee.toString(),
      amountIn,
      amountOut,
    }
  }

  for (let tradeType of [TradeType.EXACT_INPUT, TradeType.EXACT_OUTPUT]) {
    describe('RouterTradeAdapter ' + tradeType, () => {
      const getAmountToken = (tokenIn: Token | Ether, tokenOut: Token | Ether, tradeType: TradeType): Token | Ether => {
        return tradeType === TradeType.EXACT_INPUT ? tokenIn : tokenOut
      }
      const getAmount = (
        tokenIn: Token | Ether,
        tokenOut: Token | Ether,
        amount: string,
        tradeType: TradeType
      ): CurrencyAmount<Token | Ether> => {
        return tradeType === TradeType.EXACT_INPUT
          ? CurrencyAmount.fromRawAmount(tokenIn, amount)
          : CurrencyAmount.fromRawAmount(tokenOut, amount)
      }

      function compareUniswapTrades(left: UniswapTrade, right: UniswapTrade): void {}

      it('v2 - erc20 <> erc20', async () => {
        const [tokenIn, tokenOut] = [DAI, USDC]
        const inputAmount = ethers.utils
          .parseUnits('1000', getAmountToken(tokenIn, tokenOut, tradeType).decimals)
          .toString()
        const rawInputAmount = getAmount(tokenIn, tokenOut, inputAmount, tradeType)

        const opts = swapOptions({})
        // amount should always be interms of output token
        const trade = new V2Trade(new RouteV2([USDC_DAI_V2], DAI, USDC), rawInputAmount, tradeType)

        const classicQuote: PartialClassicQuote = {
          tokenIn: DAI.address,
          tokenOut: USDC.address,
          tradeType,
          route: [
            [
              mockV2PoolInRoute(
                USDC_DAI_V2,
                tokenIn,
                tokenOut,
                trade.inputAmount.quotient.toString(),
                trade.outputAmount.quotient.toString()
              ),
            ],
          ],
        }
        const routerTrade = RouterTradeAdapter.fromClassicQuote(classicQuote)

        compareUniswapTrades(new UniswapTrade(buildTrade([trade]), opts), new UniswapTrade(routerTrade, opts))
      })

      it('v3 - erc20 <> erc20', async () => {
        const [tokenIn, tokenOut] = [DAI, USDC]
        const inputAmount = ethers.utils
          .parseUnits('1000', getAmountToken(tokenIn, tokenOut, tradeType).decimals)
          .toString()
        const rawInputAmount = getAmount(tokenIn, tokenOut, inputAmount, tradeType)

        const opts = swapOptions({})
        const trade = await V3Trade.fromRoute(new V3Route([USDC_DAI_V3], tokenIn, tokenOut), rawInputAmount, tradeType)

        const classicQuote: PartialClassicQuote = {
          tokenIn: DAI.address,
          tokenOut: USDC.address,
          tradeType,
          route: [
            [
              mockV3PoolInRoute(
                USDC_DAI_V3,
                tokenIn,
                tokenOut,
                trade.inputAmount.quotient.toString(),
                trade.outputAmount.quotient.toString()
              ),
            ],
          ],
        }
        const routerTrade = RouterTradeAdapter.fromClassicQuote(classicQuote)

        compareUniswapTrades(new UniswapTrade(buildTrade([trade]), opts), new UniswapTrade(routerTrade, opts))
      })

      it('v2 - handles weth input properly', async () => {
        const [tokenIn, tokenOut] = [WETH, USDC]
        const inputAmount = ethers.utils
          .parseUnits('1', getAmountToken(tokenIn, tokenOut, tradeType).decimals)
          .toString()
        const rawInputAmount = getAmount(tokenIn, tokenOut, inputAmount, tradeType)

        const opts = swapOptions({})
        const trade = new V2Trade(new RouteV2([WETH_USDC_V2], tokenIn, tokenOut), rawInputAmount, tradeType)

        const classicQuote: PartialClassicQuote = {
          tokenIn: WETH.address,
          tokenOut: USDC.address,
          tradeType,
          route: [
            [
              mockV2PoolInRoute(
                WETH_USDC_V2,
                WETH,
                USDC,
                trade.inputAmount.quotient.toString(),
                trade.outputAmount.quotient.toString()
              ),
            ],
          ],
        }
        const routerTrade = RouterTradeAdapter.fromClassicQuote(classicQuote)

        compareUniswapTrades(new UniswapTrade(buildTrade([trade]), opts), new UniswapTrade(routerTrade, opts))
      })

      it('v3 - handles weth input properly', async () => {
        const [tokenIn, tokenOut] = [WETH, USDC]
        const inputAmount = ethers.utils
          .parseUnits('1', getAmountToken(tokenIn, tokenOut, tradeType).decimals)
          .toString()
        const rawInputAmount = getAmount(tokenIn, tokenOut, inputAmount, tradeType)

        const opts = swapOptions({})
        const trade = await V3Trade.fromRoute(new V3Route([WETH_USDC_V3], WETH, USDC), rawInputAmount, tradeType)

        const classicQuote: PartialClassicQuote = {
          tokenIn: WETH.address,
          tokenOut: USDC.address,
          tradeType,
          route: [
            [
              mockV3PoolInRoute(
                WETH_USDC_V3,
                WETH,
                USDC,
                trade.inputAmount.quotient.toString(),
                trade.outputAmount.quotient.toString()
              ),
            ],
          ],
        }
        const routerTrade = RouterTradeAdapter.fromClassicQuote(classicQuote)

        compareUniswapTrades(new UniswapTrade(buildTrade([trade]), opts), new UniswapTrade(routerTrade, opts))
      })

      it('v2 - handles eth input properly', async () => {
        const [tokenIn, tokenOut] = [Ether.onChain(1), USDC]
        const inputAmount = ethers.utils
          .parseUnits('1', getAmountToken(tokenIn, tokenOut, tradeType).decimals)
          .toString()
        const rawInputAmount = getAmount(tokenIn, tokenOut, inputAmount, tradeType)

        const opts = swapOptions({})
        const trade = new V2Trade(new RouteV2([WETH_USDC_V2], Ether.onChain(1), USDC), rawInputAmount, tradeType)

        const classicQuote: PartialClassicQuote = {
          tokenIn: ETH_ADDRESS,
          tokenOut: USDC.address,
          tradeType,
          route: [
            [
              // WETH here since all pairs use WETH
              mockV2PoolInRoute(
                WETH_USDC_V2,
                WETH,
                USDC,
                trade.inputAmount.quotient.toString(),
                trade.outputAmount.quotient.toString()
              ),
            ],
          ],
        }
        const routerTrade = RouterTradeAdapter.fromClassicQuote(classicQuote)

        compareUniswapTrades(new UniswapTrade(buildTrade([trade]), opts), new UniswapTrade(routerTrade, opts))
      })

      it('v2 - handles eth input properly - 0xeeee...eeee address', async () => {
        const [tokenIn, tokenOut] = [Ether.onChain(1), USDC]
        const inputAmount = ethers.utils
          .parseUnits('1', getAmountToken(tokenIn, tokenOut, tradeType).decimals)
          .toString()
        const rawInputAmount = getAmount(tokenIn, tokenOut, inputAmount, tradeType)

        const opts = swapOptions({})
        const trade = new V2Trade(new RouteV2([WETH_USDC_V2], Ether.onChain(1), USDC), rawInputAmount, tradeType)

        const classicQuote: PartialClassicQuote = {
          tokenIn: E_ETH_ADDRESS,
          tokenOut: USDC.address,
          tradeType,
          route: [
            [
              // WETH here since all pairs use WETH
              mockV2PoolInRoute(
                WETH_USDC_V2,
                WETH,
                USDC,
                trade.inputAmount.quotient.toString(),
                trade.outputAmount.quotient.toString()
              ),
            ],
          ],
        }
        const routerTrade = RouterTradeAdapter.fromClassicQuote(classicQuote)

        compareUniswapTrades(new UniswapTrade(buildTrade([trade]), opts), new UniswapTrade(routerTrade, opts))
      })

      it('v3 - handles eth input properly', async () => {
        const [tokenIn, tokenOut] = [Ether.onChain(1), USDC]
        const inputAmount = ethers.utils
          .parseUnits('1', getAmountToken(tokenIn, tokenOut, tradeType).decimals)
          .toString()
        const rawInputAmount = getAmount(tokenIn, tokenOut, inputAmount, tradeType)

        const opts = swapOptions({})
        const trade = await V3Trade.fromRoute(
          new V3Route([WETH_USDC_V3], Ether.onChain(1), USDC),
          rawInputAmount,
          tradeType
        )

        const classicQuote: PartialClassicQuote = {
          tokenIn: ETH_ADDRESS,
          tokenOut: USDC.address,
          tradeType,
          route: [
            [
              // WETH here since all pools use WETH
              mockV3PoolInRoute(
                WETH_USDC_V3,
                WETH,
                USDC,
                trade.inputAmount.quotient.toString(),
                trade.outputAmount.quotient.toString()
              ),
            ],
          ],
        }
        const routerTrade = RouterTradeAdapter.fromClassicQuote(classicQuote)

        compareUniswapTrades(new UniswapTrade(buildTrade([trade]), opts), new UniswapTrade(routerTrade, opts))
      })

      it('v2 - handles eth output properly', async () => {
        const [tokenIn, tokenOut] = [USDC, Ether.onChain(1)]
        const inputAmount = ethers.utils
          .parseUnits('1', getAmountToken(tokenIn, tokenOut, tradeType).decimals)
          .toString()
        const rawInputAmount = getAmount(tokenIn, tokenOut, inputAmount, tradeType)

        const opts = swapOptions({})
        const trade = new V2Trade(new RouteV2([WETH_USDC_V2], tokenIn, tokenOut), rawInputAmount, tradeType)

        const classicQuote: PartialClassicQuote = {
          tokenIn: USDC.address,
          tokenOut: ETH_ADDRESS,
          tradeType,
          route: [
            [
              // WETH here since all pairs use WETH
              mockV2PoolInRoute(
                WETH_USDC_V2,
                USDC,
                WETH,
                trade.inputAmount.quotient.toString(),
                trade.outputAmount.quotient.toString()
              ),
            ],
          ],
        }
        const routerTrade = RouterTradeAdapter.fromClassicQuote(classicQuote)

        compareUniswapTrades(new UniswapTrade(buildTrade([trade]), opts), new UniswapTrade(routerTrade, opts))
      })

      it('v3 - handles eth output properly', async () => {
        const [tokenIn, tokenOut] = [USDC, Ether.onChain(1)]
        const inputAmount = ethers.utils
          .parseUnits('1', getAmountToken(tokenIn, tokenOut, tradeType).decimals)
          .toString()
        const rawInputAmount = getAmount(tokenIn, tokenOut, inputAmount, tradeType)

        const opts = swapOptions({})
        const trade = await V3Trade.fromRoute(new V3Route([WETH_USDC_V3], tokenIn, tokenOut), rawInputAmount, tradeType)

        const classicQuote: PartialClassicQuote = {
          tokenIn: USDC.address,
          tokenOut: ETH_ADDRESS,
          tradeType,
          route: [
            [
              // WETH here since all pairs use WETH
              mockV3PoolInRoute(
                WETH_USDC_V3,
                USDC,
                WETH,
                trade.inputAmount.quotient.toString(),
                trade.outputAmount.quotient.toString()
              ),
            ],
          ],
        }
        const routerTrade = RouterTradeAdapter.fromClassicQuote(classicQuote)

        compareUniswapTrades(new UniswapTrade(buildTrade([trade]), opts), new UniswapTrade(routerTrade, opts))
      })

      it('v3 - multi pool erc20 <> erc20', async () => {
        const [tokenIn, tokenOut] = [DAI, WETH]
        const inputAmount = ethers.utils
          .parseUnits('1', getAmountToken(tokenIn, tokenOut, tradeType).decimals)
          .toString()
        const rawInputAmount = getAmount(tokenIn, tokenOut, inputAmount, tradeType)

        const opts = swapOptions({})
        const trade = await V3Trade.fromRoute(
          new V3Route([USDC_DAI_V3, WETH_USDC_V3], tokenIn, tokenOut),
          rawInputAmount,
          tradeType
        )

        const classicQuote: PartialClassicQuote = {
          tokenIn: DAI.address,
          tokenOut: USDC.address,
          tradeType,
          route: [
            [
              mockV3PoolInRoute(
                USDC_DAI_V3,
                DAI,
                USDC,
                trade.inputAmount.quotient.toString(),
                trade.outputAmount.quotient.toString()
              ),
              mockV3PoolInRoute(
                WETH_USDC_V3,
                USDC,
                WETH,
                trade.inputAmount.quotient.toString(),
                trade.outputAmount.quotient.toString()
              ),
            ],
          ],
        }
        const routerTrade = RouterTradeAdapter.fromClassicQuote(classicQuote)

        compareUniswapTrades(new UniswapTrade(buildTrade([trade]), opts), new UniswapTrade(routerTrade, opts))
      })

      // Mixed routes are only supported for exact input
      if (tradeType === TradeType.EXACT_INPUT) {
        it('v2/v3 - mixed route erc20 <> erc20', async () => {
          const [tokenIn, tokenOut] = [DAI, WETH]
          const inputAmount = ethers.utils
            .parseUnits('1', getAmountToken(tokenIn, tokenOut, tradeType).decimals)
            .toString()
          const rawInputAmount = getAmount(tokenIn, tokenOut, inputAmount, tradeType)

          const opts = swapOptions({})
          const trade = await MixedRouteTrade.fromRoute(
            new MixedRouteSDK([USDC_DAI_V3, WETH_USDC_V2], tokenIn, tokenOut),
            rawInputAmount,
            tradeType
          )

          const classicQuote: PartialClassicQuote = {
            tokenIn: DAI.address,
            tokenOut: USDC.address,
            tradeType,
            route: [
              [
                mockV3PoolInRoute(
                  USDC_DAI_V3,
                  DAI,
                  USDC,
                  trade.inputAmount.quotient.toString(),
                  trade.outputAmount.quotient.toString()
                ),
                mockV2PoolInRoute(
                  WETH_USDC_V2,
                  USDC,
                  WETH,
                  trade.inputAmount.quotient.toString(),
                  trade.outputAmount.quotient.toString()
                ),
              ],
            ],
          }
          const routerTrade = RouterTradeAdapter.fromClassicQuote(classicQuote)

          compareUniswapTrades(new UniswapTrade(buildTrade([trade]), opts), new UniswapTrade(routerTrade, opts))
        })
      }

      it('v3 - handles split routes properly', async () => {
        const [tokenIn, tokenOut] = [WETH, USDC]
        const inputAmount = ethers.utils
          .parseUnits('1', getAmountToken(tokenIn, tokenOut, tradeType).decimals)
          .toString()
        const rawInputAmount = getAmount(tokenIn, tokenOut, inputAmount, tradeType)

        const opts = swapOptions({})
        const trade1 = await V3Trade.fromRoute(
          new V3Route([WETH_USDC_V3], tokenIn, tokenOut),
          rawInputAmount.divide(2),
          tradeType
        )
        const trade2 = await V3Trade.fromRoute(
          new V3Route([WETH_USDC_V3_LOW_FEE], tokenIn, tokenOut),
          rawInputAmount.divide(2),
          tradeType
        )

        const splitRouteInputAmounts = [trade1.inputAmount.quotient.toString(), trade2.inputAmount.quotient.toString()]
        const splitRouteOutputAmounts = [
          trade1.outputAmount.quotient.toString(),
          trade2.outputAmount.quotient.toString(),
        ]

        const classicQuote: PartialClassicQuote = {
          tokenIn: WETH.address,
          tokenOut: USDC.address,
          tradeType,
          route: [
            [mockV3PoolInRoute(WETH_USDC_V3, WETH, USDC, splitRouteInputAmounts[0], splitRouteOutputAmounts[0])],
            [
              mockV3PoolInRoute(
                WETH_USDC_V3_LOW_FEE,
                WETH,
                USDC,
                splitRouteInputAmounts[1],
                splitRouteOutputAmounts[1]
              ),
            ],
          ],
        }
        const routerTrade = RouterTradeAdapter.fromClassicQuote(classicQuote)

        compareUniswapTrades(new UniswapTrade(buildTrade([trade1, trade2]), opts), new UniswapTrade(routerTrade, opts))
      })
    })
  }

  describe('RouterTradeAdapter handles malformed classic quote', () => {
    it('throws on missing route', async () => {
      const classicQuote: any = {
        tokenIn: WETH.address,
        tokenOut: USDC.address,
        tradeType: TradeType.EXACT_INPUT,
      }
      expect(() => RouterTradeAdapter.fromClassicQuote(classicQuote)).to.throw('Expected route to be present')
    })
    it('throws on no route', async () => {
      const classicQuote: any = {
        tokenIn: WETH.address,
        tokenOut: USDC.address,
        tradeType: TradeType.EXACT_INPUT,
        route: [],
      }
      expect(() => RouterTradeAdapter.fromClassicQuote(classicQuote)).to.throw(
        'Expected there to be at least one route'
      )
    })
    it('throws on route with no pools', async () => {
      const classicQuote: any = {
        tokenIn: WETH.address,
        tokenOut: USDC.address,
        tradeType: TradeType.EXACT_INPUT,
        route: [[]],
      }
      expect(() => RouterTradeAdapter.fromClassicQuote(classicQuote)).to.throw(
        'Expected all routes to have at least one pool'
      )
    })
    it('throws on quote missing tokenIn/Out', async () => {
      const classicQuote: any = {
        tokenIn: WETH.address,
        tokenOut: USDC.address,
        tradeType: TradeType.EXACT_INPUT,
        route: [
          [
            {
              ...mockV2PoolInRoute(USDC_DAI_V2, DAI, USDC, '1000', '1000'),
              tokenIn: undefined,
            },
          ],
        ],
      }
      expect(() => RouterTradeAdapter.fromClassicQuote(classicQuote)).to.throw(
        'Expected both tokenIn and tokenOut to be present'
      )
    })
    it('throws on route with mismatched token chainIds', async () => {
      const classicQuote: PartialClassicQuote = {
        tokenIn: DAI.address,
        tokenOut: USDC.address,
        tradeType: TradeType.EXACT_INPUT,
        route: [
          [
            {
              ...mockV2PoolInRoute(USDC_DAI_V2, DAI, USDC, '1000', '1000'),
              tokenIn: {
                address: DAI.address,
                // Different chainId
                chainId: 2,
                symbol: DAI.symbol!,
                decimals: String(DAI.decimals),
              },
            },
          ],
        ],
      }
      expect(() => RouterTradeAdapter.fromClassicQuote(classicQuote)).to.throw(
        'Expected tokenIn and tokenOut to be have same chainId'
      )
    })
    it('throws on route with missing amountIn/Out', async () => {
      const classicQuote: any = {
        tokenIn: WETH.address,
        tokenOut: USDC.address,
        tradeType: TradeType.EXACT_INPUT,
        route: [
          [
            {
              ...mockV2PoolInRoute(USDC_DAI_V2, DAI, USDC, '1000', '1000'),
              amountIn: undefined,
            },
          ],
        ],
      }
      expect(() => RouterTradeAdapter.fromClassicQuote(classicQuote)).to.throw(
        'Expected both raw amountIn and raw amountOut to be present'
      )
    })
  })

  describe('migrate', () => {
    // Test tokens on sepolia
    const chainId: SupportedChainsType = ChainId.SEPOLIA
    const TOKEN0 = new Token(ChainId.SEPOLIA, '0x0000000000000000000000000000000000000001', 18, 'T0', 'Token0')
    const TOKEN1 = new Token(ChainId.SEPOLIA, '0x0000000000000000000000000000000000000002', 18, 'T1', 'Token1')
    it('encodes a migration', async () => {
      const opts = Object.assign({
        inputPosition: new Position({
          pool: new V3Pool(TOKEN0, TOKEN1, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 0, 0, []),
          liquidity: 1,
          tickLower: -10,
          tickUpper: 10,
        }),
        outputPosition: new V4Position({
          pool: new V4Pool(
            TOKEN0,
            TOKEN1,
            FeeAmount.LOW,
            10,
            '0x0000000000000000000000000000000000000000',
            encodeSqrtRatioX96(1, 1),
            0,
            0
          ),
          liquidity: 1,
          tickLower: -10,
          tickUpper: 10,
        }),
        v3RemoveLiquidityOptions: {
          tokenId: 1,
          liquidityPercentage: new Percent(100, 100),
          slippageTolerance: new Percent(5, 100),
          deadline: 1,
          burnToken: true,
          collectOptions: {
            expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(TOKEN0, 0),
            expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(TOKEN1, 0),
            recipient: CHAIN_TO_ADDRESSES_MAP[chainId].v4PositionManagerAddress,
          },
          permit: {
            v: 0,
            r: '0x0000000000000000000000000000000000000000000000000000000000000001',
            s: '0x0000000000000000000000000000000000000000000000000000000000000002',
            deadline: 1,
            spender: UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_0, chainId),
          },
        },
        v4AddLiquidityOptions: {
          deadline: 1,
          migrate: true,
          slippageTolerance: new Percent(5, 100),
          recipient: TEST_RECIPIENT_ADDRESS,
        },
      })
      const methodParameters = SwapRouter.migrateV3ToV4CallParameters(opts)
      registerFixture('MIGRATE_WITH_PERMIT', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq('0')
    })

    it('encodes a migration if no v3 permit', async () => {
      const opts = Object.assign({
        inputPosition: new Position({
          pool: new V3Pool(TOKEN0, TOKEN1, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 0, 0, []),
          liquidity: 1,
          tickLower: -10,
          tickUpper: 10,
        }),
        outputPosition: new V4Position({
          pool: new V4Pool(
            TOKEN0,
            TOKEN1,
            FeeAmount.LOW,
            10,
            '0x0000000000000000000000000000000000000000',
            encodeSqrtRatioX96(1, 1),
            0,
            0
          ),
          liquidity: 1,
          tickLower: -10,
          tickUpper: 10,
        }),
        v3RemoveLiquidityOptions: {
          tokenId: 1,
          liquidityPercentage: new Percent(100, 100),
          slippageTolerance: new Percent(5, 100),
          deadline: 1,
          burnToken: true,
          collectOptions: {
            expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(TOKEN0, 0),
            expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(TOKEN1, 0),
            recipient: CHAIN_TO_ADDRESSES_MAP[chainId].v4PositionManagerAddress,
          },
        },
        v4AddLiquidityOptions: {
          deadline: 1,
          migrate: true,
          slippageTolerance: new Percent(5, 100),
          recipient: TEST_RECIPIENT_ADDRESS,
        },
      })
      const methodParameters = SwapRouter.migrateV3ToV4CallParameters(opts)
      registerFixture('MIGRATE_WITHOUT_PERMIT', methodParameters)
      expect(hexToDecimalString(methodParameters.value)).to.eq('0')
    })

    it('throws if token0s are different', async () => {
      const opts = Object.assign({
        inputPosition: new Position({
          pool: new V3Pool(USDC, DAI, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 0, 0, []),
          liquidity: 1,
          tickLower: -10,
          tickUpper: 10,
        }),
        outputPosition: new V4Position({
          pool: new V4Pool(
            WETH,
            USDC,
            FeeAmount.LOW,
            10,
            '0x0000000000000000000000000000000000000000',
            encodeSqrtRatioX96(1, 1),
            0,
            0
          ),
          liquidity: 1,
          tickLower: -10,
          tickUpper: 10,
        }),
        v3RemoveLiquidityOptions: {
          tokenId: 1,
          liquidityPercentage: new Percent(100, 100),
          slippageTolerance: new Percent(5, 100),
          deadline: 1,
          burnToken: true,
          collectOptions: {
            expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(USDC, 0),
            expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(DAI, 0),
            recipient: TEST_RECIPIENT_ADDRESS,
          },
        },
        v4AddLiquidityOptions: {
          deadline: 1,
          mirgate: true,
          slippageTolerance: new Percent(5, 100),
          recipient: TEST_RECIPIENT_ADDRESS,
        },
      })
      expect(() => SwapRouter.migrateV3ToV4CallParameters(opts)).to.throw('TOKEN0_MISMATCH')
    })

    it('throws if token1s are different', async () => {
      const opts = Object.assign({
        inputPosition: new Position({
          pool: new V3Pool(DAI, USDC, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 0, 0, []),
          liquidity: 1,
          tickLower: -10,
          tickUpper: 10,
        }),
        outputPosition: new V4Position({
          pool: new V4Pool(
            DAI,
            WETH,
            FeeAmount.LOW,
            10,
            '0x0000000000000000000000000000000000000000',
            encodeSqrtRatioX96(1, 1),
            0,
            0
          ),
          liquidity: 1,
          tickLower: -10,
          tickUpper: 10,
        }),
        v3RemoveLiquidityOptions: {
          tokenId: 1,
          liquidityPercentage: new Percent(100, 100),
          slippageTolerance: new Percent(5, 100),
          deadline: 1,
          burnToken: true,
          collectOptions: {
            expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(USDC, 0),
            expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(DAI, 0),
            recipient: TEST_RECIPIENT_ADDRESS,
          },
        },
        v4AddLiquidityOptions: {
          deadline: 1,
          mirgate: true,
          slippageTolerance: new Percent(5, 100),
          recipient: TEST_RECIPIENT_ADDRESS,
        },
      })
      expect(() => SwapRouter.migrateV3ToV4CallParameters(opts)).to.throw('TOKEN1_MISMATCH')
    })

    it('throws if not migrating 100%', async () => {
      const opts = Object.assign({
        inputPosition: new Position({
          pool: new V3Pool(USDC, DAI, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 0, 0, []),
          liquidity: 1,
          tickLower: -10,
          tickUpper: 10,
        }),
        outputPosition: new V4Position({
          pool: new V4Pool(
            USDC,
            DAI,
            FeeAmount.LOW,
            10,
            '0x0000000000000000000000000000000000000000',
            encodeSqrtRatioX96(1, 1),
            0,
            0
          ),
          liquidity: 1,
          tickLower: -10,
          tickUpper: 10,
        }),
        v3RemoveLiquidityOptions: {
          tokenId: 1,
          liquidityPercentage: new Percent(90),
          slippageTolerance: new Percent(5, 100),
          deadline: 1,
          burnToken: true,
          collectOptions: {
            expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(USDC, 0),
            expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(DAI, 0),
            recipient: TEST_RECIPIENT_ADDRESS,
          },
        },
        v4AddLiquidityOptions: {
          deadline: 1,
          mirgate: true,
          slippageTolerance: new Percent(5, 100),
          recipient: TEST_RECIPIENT_ADDRESS,
        },
      })
      expect(() => SwapRouter.migrateV3ToV4CallParameters(opts)).to.throw('FULL_REMOVAL_REQUIRED')
    })

    it('burn required for v3', async () => {
      const opts = Object.assign({
        inputPosition: new Position({
          pool: new V3Pool(USDC, DAI, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 0, 0, []),
          liquidity: 1,
          tickLower: -10,
          tickUpper: 10,
        }),
        outputPosition: new V4Position({
          pool: new V4Pool(
            USDC,
            DAI,
            FeeAmount.LOW,
            10,
            '0x0000000000000000000000000000000000000000',
            encodeSqrtRatioX96(1, 1),
            0,
            0
          ),
          liquidity: 1,
          tickLower: -10,
          tickUpper: 10,
        }),
        v3RemoveLiquidityOptions: {
          tokenId: 1,
          liquidityPercentage: new Percent(100, 100),
          slippageTolerance: new Percent(5, 100),
          deadline: 1,
          collectOptions: {
            expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(USDC, 0),
            expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(DAI, 0),
            recipient: TEST_RECIPIENT_ADDRESS,
          },
        },
        v4AddLiquidityOptions: {
          deadline: 1,
          mirgate: true,
          slippageTolerance: new Percent(5, 100),
          recipient: TEST_RECIPIENT_ADDRESS,
        },
      })
      expect(() => SwapRouter.migrateV3ToV4CallParameters(opts)).to.throw('BURN_TOKEN_REQUIRED')
    })

    it('throws if not minting when migrating', async () => {
      const opts = Object.assign({
        inputPosition: new Position({
          pool: new V3Pool(TOKEN0, TOKEN1, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 0, 0, []),
          liquidity: 1,
          tickLower: -10,
          tickUpper: 10,
        }),
        outputPosition: new V4Position({
          pool: new V4Pool(
            TOKEN0,
            TOKEN1,
            FeeAmount.LOW,
            10,
            '0x0000000000000000000000000000000000000000',
            encodeSqrtRatioX96(1, 1),
            0,
            0
          ),
          liquidity: 1,
          tickLower: -10,
          tickUpper: 10,
        }),
        v3RemoveLiquidityOptions: {
          tokenId: 1,
          liquidityPercentage: new Percent(100, 100),
          slippageTolerance: new Percent(5, 100),
          deadline: 1,
          burnToken: true,
          collectOptions: {
            expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(USDC, 0),
            expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(DAI, 0),
            recipient: CHAIN_TO_ADDRESSES_MAP[chainId].v4PositionManagerAddress,
          },
        },
        v4AddLiquidityOptions: {
          tokenId: 1,
          deadline: 1,
          slippageTolerance: new Percent(5, 100),
          sqrtPriceX96: encodeSqrtRatioX96(1, 1),
        },
      })
      expect(() => SwapRouter.migrateV3ToV4CallParameters(opts)).to.throw('MINT_REQUIRED')
    })

    it('throws if migrating flag not set', async () => {
      const opts = Object.assign({
        inputPosition: new Position({
          pool: new V3Pool(TOKEN0, TOKEN1, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 0, 0, []),
          liquidity: 1,
          tickLower: -10,
          tickUpper: 10,
        }),
        outputPosition: new V4Position({
          pool: new V4Pool(
            TOKEN0,
            TOKEN1,
            FeeAmount.LOW,
            10,
            '0x0000000000000000000000000000000000000000',
            encodeSqrtRatioX96(1, 1),
            0,
            0
          ),
          liquidity: 1,
          tickLower: -10,
          tickUpper: 10,
        }),
        v3RemoveLiquidityOptions: {
          tokenId: 1,
          liquidityPercentage: new Percent(100, 100),
          slippageTolerance: new Percent(5, 100),
          deadline: 1,
          burnToken: true,
          collectOptions: {
            expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(USDC, 0),
            expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(DAI, 0),
            recipient: CHAIN_TO_ADDRESSES_MAP[chainId].v4PositionManagerAddress,
          },
        },
        v4AddLiquidityOptions: {
          deadline: 1,
          migrate: false,
          slippageTolerance: new Percent(5, 100),
          recipient: TEST_RECIPIENT_ADDRESS,
        },
      })
      expect(() => SwapRouter.migrateV3ToV4CallParameters(opts)).to.throw('MIGRATE_REQUIRED')
    })

    it('throws if not permitting the Universal router', async () => {
      const opts = Object.assign({
        inputPosition: new Position({
          pool: new V3Pool(TOKEN0, TOKEN1, FeeAmount.LOW, encodeSqrtRatioX96(1, 1), 0, 0, []),
          liquidity: 1,
          tickLower: -10,
          tickUpper: 10,
        }),
        outputPosition: new V4Position({
          pool: new V4Pool(
            TOKEN0,
            TOKEN1,
            FeeAmount.LOW,
            10,
            '0x0000000000000000000000000000000000000000',
            encodeSqrtRatioX96(1, 1),
            0,
            0
          ),
          liquidity: 1,
          tickLower: -10,
          tickUpper: 10,
        }),
        v3RemoveLiquidityOptions: {
          tokenId: 1,
          liquidityPercentage: new Percent(100, 100),
          slippageTolerance: new Percent(5, 100),
          deadline: 1,
          burnToken: true,
          collectOptions: {
            expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(USDC, 0),
            expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(DAI, 0),
            recipient: CHAIN_TO_ADDRESSES_MAP[chainId].v4PositionManagerAddress,
          },
          permit: {
            v: 0,
            r: '0x0000000000000000000000000000000000000000000000000000000000000001',
            s: '0x0000000000000000000000000000000000000000000000000000000000000002',
            deadline: 1,
            spender: TEST_RECIPIENT_ADDRESS,
          },
        },
        v4AddLiquidityOptions: {
          deadline: 1,
          migrate: true,
          slippageTolerance: new Percent(5, 100),
          recipient: TEST_RECIPIENT_ADDRESS,
        },
      })
      expect(() => SwapRouter.migrateV3ToV4CallParameters(opts)).to.throw('INVALID_SPENDER')
    })
  })
})
