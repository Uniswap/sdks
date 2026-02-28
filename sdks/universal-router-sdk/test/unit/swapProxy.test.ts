import { expect } from 'chai'
import JSBI from 'jsbi'
import { BigNumber, utils } from 'ethers'
import { Interface } from '@ethersproject/abi'
import {
  Trade as V3Trade,
  Pool as V3Pool,
  Route as V3Route,
  FeeAmount,
  nearestUsableTick,
  TickMath,
  TICK_SPACINGS,
} from '@uniswap/v3-sdk'
import { Pool as V4Pool, Route as V4Route, Trade as V4Trade } from '@uniswap/v4-sdk'
import { CurrencyAmount, Ether, Token, TradeType, Percent } from '@uniswap/sdk-core'
import { Trade as RouterTrade } from '@uniswap/router-sdk'
import { SwapRouter } from '../../src/swapRouter'
import { UniswapTrade, SwapOptions } from '../../src/entities/actions/uniswap'
import {
  SENDER_AS_RECIPIENT,
  ZERO_ADDRESS,
  UNIVERSAL_ROUTER_ADDRESS,
  UniversalRouterVersion,
} from '../../src/utils/constants'
import { encodeSqrtRatioX96 } from '@uniswap/v3-sdk'

const ETHER = Ether.onChain(1)
const WETH = new Token(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18, 'WETH', 'Wrapped Ether')
const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD Coin')
const TEST_RECIPIENT = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

const PROXY_ABI = [
  'function execute(address router, address token, uint256 amount, bytes commands, bytes[] inputs, uint256 deadline) external payable',
]
const PROXY_INTERFACE = new Interface(PROXY_ABI)

function makeV4Pool(tokenA: any, tokenB: any, fee: FeeAmount = FeeAmount.MEDIUM): V4Pool {
  const liquidity = JSBI.BigInt(utils.parseEther('1000000').toString())
  const tickSpacing = 60
  const ticks = [
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
  return new V4Pool(tokenA, tokenB, fee, tickSpacing, ZERO_ADDRESS, encodeSqrtRatioX96(1, 1), liquidity, 0, ticks)
}

function makeV3Pool(tokenA: Token, tokenB: Token, fee: FeeAmount = FeeAmount.MEDIUM): V3Pool {
  const liquidity = JSBI.BigInt(utils.parseEther('1000000').toString())
  const tickSpacing = TICK_SPACINGS[fee]
  const ticks = [
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
  return new V3Pool(tokenA, tokenB, fee, encodeSqrtRatioX96(1, 1), liquidity, 0, ticks)
}

function buildV4Trade(
  pool: V4Pool,
  inputCurrency: any,
  outputCurrency: any,
  inputAmount: string,
  outputAmount: string,
  tradeType: TradeType = TradeType.EXACT_INPUT
): RouterTrade<any, any, TradeType> {
  const route = new V4Route([pool], inputCurrency, outputCurrency)
  const trade = V4Trade.createUncheckedTrade({
    route,
    inputAmount: CurrencyAmount.fromRawAmount(inputCurrency, inputAmount),
    outputAmount: CurrencyAmount.fromRawAmount(outputCurrency, outputAmount),
    tradeType,
  })
  return new RouterTrade({
    v2Routes: [],
    v3Routes: [],
    v4Routes: [
      {
        routev4: trade.route,
        inputAmount: trade.inputAmount,
        outputAmount: trade.outputAmount,
      },
    ],
    mixedRoutes: [],
    tradeType,
  })
}

function buildV3Trade(
  pool: V3Pool,
  inputCurrency: Token,
  outputCurrency: Token,
  inputAmount: string,
  outputAmount: string,
  tradeType: TradeType = TradeType.EXACT_INPUT
): RouterTrade<any, any, TradeType> {
  const route = new V3Route([pool], inputCurrency, outputCurrency)
  const trade = V3Trade.createUncheckedTrade({
    route,
    inputAmount: CurrencyAmount.fromRawAmount(inputCurrency, inputAmount),
    outputAmount: CurrencyAmount.fromRawAmount(outputCurrency, outputAmount),
    tradeType,
  })
  return new RouterTrade({
    v2Routes: [],
    v3Routes: [
      {
        routev3: trade.route,
        inputAmount: trade.inputAmount,
        outputAmount: trade.outputAmount,
      },
    ],
    v4Routes: [],
    mixedRoutes: [],
    tradeType,
  })
}

function proxySwapOptions(overrides: Partial<SwapOptions> = {}): SwapOptions {
  return {
    slippageTolerance: new Percent(5, 100),
    recipient: TEST_RECIPIENT,
    useProxy: true,
    chainId: 1,
    deadlineOrPreviousBlockhash: Math.floor(Date.now() / 1000) + 1800,
    ...overrides,
  }
}

describe('SwapProxy', () => {
  let WETH_USDC_V4: V4Pool
  let WETH_USDC_V3: V3Pool

  before(() => {
    WETH_USDC_V4 = makeV4Pool(WETH, USDC)
    WETH_USDC_V3 = makeV3Pool(WETH, USDC)
  })

  describe('UniswapTrade with useProxy', () => {
    it('forces payerIsUser to false', () => {
      const trade = buildV4Trade(WETH_USDC_V4, USDC, WETH, '1000000', '500000000000000000')
      const uniTrade = new UniswapTrade(trade, proxySwapOptions())
      expect(uniTrade.payerIsUser).to.equal(false)
    })

    it('throws when recipient is not provided', () => {
      const trade = buildV4Trade(WETH_USDC_V4, USDC, WETH, '1000000', '500000000000000000')
      expect(() => new UniswapTrade(trade, proxySwapOptions({ recipient: undefined }))).to.throw(
        'Explicit recipient address required'
      )
    })

    it('throws when recipient is SENDER_AS_RECIPIENT', () => {
      const trade = buildV4Trade(WETH_USDC_V4, USDC, WETH, '1000000', '500000000000000000')
      expect(() => new UniswapTrade(trade, proxySwapOptions({ recipient: SENDER_AS_RECIPIENT }))).to.throw(
        'Explicit recipient address required'
      )
    })
  })

  describe('SwapRouter.swapCallParameters with useProxy', () => {
    it('encodes calldata targeting the proxy execute function (V4 trade)', () => {
      const trade = buildV4Trade(WETH_USDC_V4, USDC, WETH, '1000000', '500000000000000000')
      const opts = proxySwapOptions()
      const { calldata, value } = SwapRouter.swapCallParameters(trade, opts)

      // Value should be 0 for ERC20 input proxy calls
      expect(value).to.equal('0x00')

      // Decode the proxy calldata
      const decoded = PROXY_INTERFACE.decodeFunctionData('execute', calldata)
      expect(decoded.router.toLowerCase()).to.equal(
        UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_0, 1).toLowerCase()
      )
      expect(decoded.token.toLowerCase()).to.equal(USDC.address.toLowerCase())
      expect(decoded.commands).to.be.a('string')
      expect(decoded.inputs.length).to.be.greaterThan(0)
    })

    it('encodes calldata targeting the proxy execute function (V3 trade)', () => {
      const trade = buildV3Trade(WETH_USDC_V3, USDC, WETH, '1000000', '500000000000000000')
      const opts = proxySwapOptions()
      const { calldata, value } = SwapRouter.swapCallParameters(trade, opts)

      expect(value).to.equal('0x00')

      const decoded = PROXY_INTERFACE.decodeFunctionData('execute', calldata)
      expect(decoded.router.toLowerCase()).to.equal(
        UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_0, 1).toLowerCase()
      )
      expect(decoded.token.toLowerCase()).to.equal(USDC.address.toLowerCase())
    })

    it('does not include PERMIT2_PERMIT command in proxy calldata', () => {
      const trade = buildV4Trade(WETH_USDC_V4, USDC, WETH, '1000000', '500000000000000000')
      const opts = proxySwapOptions()
      const { calldata } = SwapRouter.swapCallParameters(trade, opts)

      const decoded = PROXY_INTERFACE.decodeFunctionData('execute', calldata)
      const commands = decoded.commands as string
      // 0x0a = PERMIT2_PERMIT -- should not appear
      expect(commands).to.not.include('0a')
    })

    it('throws when input currency is native ETH', () => {
      const ethUsdcPool = makeV4Pool(ETHER, USDC)
      const trade = buildV4Trade(ethUsdcPool, ETHER, USDC, '1000000000000000000', '1000000')
      const opts = proxySwapOptions()
      expect(() => SwapRouter.swapCallParameters(trade, opts)).to.throw('PROXY_NATIVE_INPUT')
    })

    it('throws when chainId is missing', () => {
      const trade = buildV4Trade(WETH_USDC_V4, USDC, WETH, '1000000', '500000000000000000')
      const opts = proxySwapOptions({ chainId: undefined })
      expect(() => SwapRouter.swapCallParameters(trade, opts)).to.throw('PROXY_MISSING_CHAIN_ID')
    })

    it('throws when inputTokenPermit is provided with useProxy', () => {
      const trade = buildV4Trade(WETH_USDC_V4, USDC, WETH, '1000000', '500000000000000000')
      const opts = proxySwapOptions({
        inputTokenPermit: {
          details: {
            token: USDC.address,
            amount: BigNumber.from('1000000') as any,
            expiration: BigNumber.from(0) as any,
            nonce: BigNumber.from(0) as any,
          },
          spender: '0x0000000000000000000000000000000000000000',
          sigDeadline: BigNumber.from(0) as any,
          signature: '0x',
        },
      })
      expect(() => SwapRouter.swapCallParameters(trade, opts)).to.throw('PROXY_PERMIT_CONFLICT')
    })

    it('sets correct input amount accounting for slippage', () => {
      const inputAmount = '1000000'
      const trade = buildV4Trade(WETH_USDC_V4, USDC, WETH, inputAmount, '500000000000000000')
      const opts = proxySwapOptions({ slippageTolerance: new Percent(5, 100) })
      const { calldata } = SwapRouter.swapCallParameters(trade, opts)

      const decoded = PROXY_INTERFACE.decodeFunctionData('execute', calldata)
      const maxAmountIn = trade.maximumAmountIn(opts.slippageTolerance)
      expect(decoded.amount.toString()).to.equal(maxAmountIn.quotient.toString())
    })

    it('uses correct UR address for specified urVersion', () => {
      const trade = buildV4Trade(WETH_USDC_V4, USDC, WETH, '1000000', '500000000000000000')
      const opts = proxySwapOptions()
      const { calldata } = SwapRouter.swapCallParameters(trade, opts)

      const decoded = PROXY_INTERFACE.decodeFunctionData('execute', calldata)
      expect(decoded.router.toLowerCase()).to.equal(
        UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_0, 1).toLowerCase()
      )
    })

    it('returns normal UR calldata when useProxy is false', () => {
      const trade = buildV4Trade(WETH_USDC_V4, USDC, WETH, '1000000', '500000000000000000')
      const opts: SwapOptions = {
        slippageTolerance: new Percent(5, 100),
        recipient: TEST_RECIPIENT,
        deadlineOrPreviousBlockhash: Math.floor(Date.now() / 1000) + 1800,
      }
      const { calldata } = SwapRouter.swapCallParameters(trade, opts)

      // Should decode as UR execute, not proxy execute
      const decoded = SwapRouter.INTERFACE.decodeFunctionData('execute(bytes,bytes[],uint256)', calldata)
      expect(decoded.commands).to.be.a('string')
    })
  })
})
