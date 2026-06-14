import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { defaultAbiCoder } from '@ethersproject/abi'
import { Trade as V3Trade, Pool as V3Pool, Route as V3Route } from '@uniswap/v3-sdk'
import { Pool as V4Pool, Route as V4Route, Trade as V4Trade } from '@uniswap/v4-sdk'
import { Currency, CurrencyAmount, Token, TradeType, Percent } from '@uniswap/sdk-core'
import { Trade as RouterTrade } from '@uniswap/router-sdk'
import { SwapRouter } from '../../src/swapRouter'
import { UniswapTrade, SwapOptions, TokenTransferMode } from '../../src/entities/actions/uniswap'
import { CommandType } from '../../src/utils/routerCommands'
import { ETH_ADDRESS } from '../../src/utils/constants'
import { ETHER, WETH, USDC, makeV3Pool, makeV4Pool, parseCommands } from '../utils/uniswapData'

const TEST_RECIPIENT = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

// V4 planner action ids needed to locate SETTLE params inside a V4_SWAP command
const V4_ACTION_SETTLE = 0x0b

// scale from a 6-decimal native-ERC20 (e.g. Arc USDC) to 18-decimal native units
const SCALE_6_TO_18 = BigNumber.from(10).pow(12)

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

function buildV4Trade(
  pool: V4Pool,
  inputCurrency: Currency,
  outputCurrency: Currency,
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

function nativeErc20SwapOptions(overrides: Partial<SwapOptions> = {}): SwapOptions {
  return {
    slippageTolerance: new Percent(5, 100),
    recipient: TEST_RECIPIENT,
    nativeErc20Input: true,
    ...overrides,
  }
}

// decode the (recipient, amountIn/Out, amountOutMin/InMax, path, payerIsUser) tuple of a V3 swap command
function decodeV3SwapCommand(input: string) {
  return defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], input)
}

// decode the (token, recipient, amountMin) tuple of a SWEEP command
function decodeSweepCommand(input: string) {
  return defaultAbiCoder.decode(['address', 'address', 'uint256'], input)
}

// locate and decode the (currency, amount, payerIsUser) SETTLE params inside a V4_SWAP command input
function decodeV4Settle(input: string) {
  const [actions, params] = defaultAbiCoder.decode(['bytes', 'bytes[]'], input)
  const actionsHex = (actions as string).slice(2)
  for (let i = 0; i * 2 < actionsHex.length; i++) {
    if (parseInt(actionsHex.slice(i * 2, i * 2 + 2), 16) === V4_ACTION_SETTLE) {
      return defaultAbiCoder.decode(['address', 'uint256', 'bool'], (params as string[])[i])
    }
  }
  throw new Error('No SETTLE action found in V4_SWAP command')
}

describe('nativeErc20Input', () => {
  let USDC_DAI_V3: V3Pool
  let USDC_DAI_V4: V4Pool
  let WETH_USDC_V3: V3Pool

  // a USDC-shaped 6-decimal token standing in for a native-ERC20 gas token predeploy (e.g. Arc USDC);
  // the flag is caller-asserted, so the encoding is chain-agnostic
  const DAI = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI', 'dai')
  const TOKEN_20_DECIMALS = new Token(1, '0x1111111111111111111111111111111111111111', 20, 'T20', 'Twenty')

  before(() => {
    USDC_DAI_V3 = makeV3Pool(USDC, DAI)
    USDC_DAI_V4 = makeV4Pool(USDC, DAI)
    WETH_USDC_V3 = makeV3Pool(WETH, USDC)
  })

  describe('UniswapTrade validation', () => {
    it('forces payerIsUser to false', () => {
      const trade = buildV3Trade(USDC_DAI_V3, USDC, DAI, '1000000', '1000000000000000000')
      const uniTrade = new UniswapTrade(trade, nativeErc20SwapOptions())
      expect(uniTrade.payerIsUser).to.equal(false)
    })

    it('throws when input currency is native', () => {
      const ethUsdcPool = makeV4Pool(ETHER, USDC)
      const trade = buildV4Trade(ethUsdcPool, ETHER, USDC, '1000000000000000000', '1000000')
      expect(() => new UniswapTrade(trade, nativeErc20SwapOptions())).to.throw(
        'nativeErc20Input requires an ERC20 input token'
      )
    })

    it('throws with ApproveProxy token transfer mode', () => {
      const trade = buildV3Trade(USDC_DAI_V3, USDC, DAI, '1000000', '1000000000000000000')
      expect(
        () =>
          new UniswapTrade(
            trade,
            nativeErc20SwapOptions({ tokenTransferMode: TokenTransferMode.ApproveProxy, chainId: 1 })
          )
      ).to.throw('nativeErc20Input is not supported with ApproveProxy')
    })

    it('throws when an inputTokenPermit is provided', () => {
      const trade = buildV3Trade(USDC_DAI_V3, USDC, DAI, '1000000', '1000000000000000000')
      const opts = nativeErc20SwapOptions({
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
      expect(() => new UniswapTrade(trade, opts)).to.throw('nativeErc20Input does not use Permit2')
    })

    it('throws when the V4 route is quoted against a native pathInput', () => {
      const ethUsdcPool = makeV4Pool(ETHER, USDC)
      const trade = buildV4Trade(ethUsdcPool, WETH, USDC, '1000000000000000000', '1000000')
      expect(() => new UniswapTrade(trade, nativeErc20SwapOptions())).to.throw(
        'nativeErc20Input requires routes quoted against the ERC20 input'
      )
    })
  })

  describe('SwapRouter.swapCallParameters', () => {
    it('attaches msg.value scaled from 6 to 18 decimals for an exactIn V3 swap', () => {
      const inputAmount = '1000000' // 1 USDC (6 decimals)
      const trade = buildV3Trade(USDC_DAI_V3, USDC, DAI, inputAmount, '1000000000000000000')
      const { calldata, value } = SwapRouter.swapCallParameters(trade, nativeErc20SwapOptions())

      // exactIn: maximumAmountIn is the input amount itself
      expect(BigNumber.from(value).toString()).to.equal(BigNumber.from(inputAmount).mul(SCALE_6_TO_18).toString())

      // exactly one V3 swap command: no WRAP_ETH, no PERMIT2_PERMIT, no Permit2 pull
      const { commandTypes, inputs } = parseCommands(calldata)
      expect(commandTypes).to.deep.equal([CommandType.V3_SWAP_EXACT_IN])

      // the router pays the pool from its own msg.value-funded balance
      const swap = decodeV3SwapCommand(inputs[0])
      expect(swap[4]).to.equal(false) // payerIsUser
    })

    it('sweeps unused input back to the recipient for an exactOut V3 swap', () => {
      const trade = buildV3Trade(USDC_DAI_V3, USDC, DAI, '1000000', '1000000000000000000', TradeType.EXACT_OUTPUT)
      const opts = nativeErc20SwapOptions()
      const { calldata, value } = SwapRouter.swapCallParameters(trade, opts)

      const { commandTypes, inputs } = parseCommands(calldata)
      expect(commandTypes).to.deep.equal([CommandType.V3_SWAP_EXACT_OUT, CommandType.SWEEP])

      // value covers the slippage-padded maximum input, scaled to native units
      const swap = decodeV3SwapCommand(inputs[0])
      const amountInMax = swap[2] as BigNumber
      expect(BigNumber.from(value).toString()).to.equal(amountInMax.mul(SCALE_6_TO_18).toString())
      expect(swap[4]).to.equal(false) // payerIsUser

      // the surplus is returned as native (18 decimals): an ERC20 sweep would floor
      // to the token's decimals and strand dust in the router
      const sweep = decodeSweepCommand(inputs[1])
      expect((sweep[0] as string).toLowerCase()).to.equal(ETH_ADDRESS.toLowerCase())
      expect((sweep[1] as string).toLowerCase()).to.equal(TEST_RECIPIENT)
    })

    it('settles a V4 swap from the router balance (payerIsUser = false)', () => {
      const inputAmount = '1000000'
      const trade = buildV4Trade(USDC_DAI_V4, USDC, DAI, inputAmount, '1000000000000000000')
      const { calldata, value } = SwapRouter.swapCallParameters(trade, nativeErc20SwapOptions())

      expect(BigNumber.from(value).toString()).to.equal(BigNumber.from(inputAmount).mul(SCALE_6_TO_18).toString())

      const { commandTypes, inputs } = parseCommands(calldata)
      expect(commandTypes).to.deep.equal([CommandType.V4_SWAP])

      const settle = decodeV4Settle(inputs[0])
      expect((settle[0] as string).toLowerCase()).to.equal(USDC.address.toLowerCase())
      expect(settle[2]).to.equal(false) // payerIsUser
    })

    it('uses a scale factor of 1 for an 18-decimal native-ERC20 (Celo-style)', () => {
      const inputAmount = '1000000000000000000' // 1 token (18 decimals)
      const trade = buildV3Trade(WETH_USDC_V3, WETH, USDC, inputAmount, '1000000')
      const { value } = SwapRouter.swapCallParameters(trade, nativeErc20SwapOptions())

      expect(BigNumber.from(value).toString()).to.equal(inputAmount)
    })

    it('throws for input tokens with more than 18 decimals', () => {
      const pool = makeV3Pool(TOKEN_20_DECIMALS, USDC)
      const trade = buildV3Trade(pool, TOKEN_20_DECIMALS, USDC, '100000000000000000000', '1000000')
      expect(() => SwapRouter.swapCallParameters(trade, nativeErc20SwapOptions())).to.throw(
        'NATIVE_ERC20_INPUT_DECIMALS'
      )
    })

    it('leaves behavior unchanged when the flag is not set', () => {
      const trade = buildV3Trade(USDC_DAI_V3, USDC, DAI, '1000000', '1000000000000000000')
      const uniTrade = new UniswapTrade(trade, nativeErc20SwapOptions({ nativeErc20Input: undefined }))
      expect(uniTrade.payerIsUser).to.equal(true)

      const { calldata, value } = SwapRouter.swapCallParameters(
        trade,
        nativeErc20SwapOptions({ nativeErc20Input: undefined })
      )
      expect(value).to.equal('0x00')

      const swap = decodeV3SwapCommand(parseCommands(calldata).inputs[0])
      expect(swap[4]).to.equal(true) // payerIsUser: pulled from the user via Permit2
    })
  })
})
