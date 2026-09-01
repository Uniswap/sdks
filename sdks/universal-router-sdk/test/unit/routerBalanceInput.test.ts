import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { defaultAbiCoder } from '@ethersproject/abi'
import { Trade as V3Trade, Pool as V3Pool, Route as V3Route } from '@uniswap/v3-sdk'
import { Pool as V4Pool, Route as V4Route, Trade as V4Trade } from '@uniswap/v4-sdk'
import { Trade as V2Trade, Route as V2Route, Pair } from '@uniswap/v2-sdk'
import { CurrencyAmount, Token, TradeType, Percent } from '@uniswap/sdk-core'
import { Trade as RouterTrade } from '@uniswap/router-sdk'
import { SwapRouter } from '../../src/swapRouter'
import { UniswapTrade, SwapOptions, TokenTransferMode } from '../../src/entities/actions/uniswap'
import { CommandType } from '../../src/utils/routerCommands'
import {
  CONTRACT_BALANCE,
  SENDER_AS_RECIPIENT,
  UNIVERSAL_ROUTER_ADDRESS,
  UniversalRouterVersion,
} from '../../src/utils/constants'
import { ETHER, WETH, USDC, DAI, makeV3Pool, makeV4Pool, parseCommands } from '../utils/uniswapData'

const TEST_RECIPIENT = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const V4_ACTION_SWAP_EXACT_IN = 0x07
const V4_ACTION_SETTLE = 0x0b
const MAINNET = 1

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
    v3Routes: [{ routev3: trade.route, inputAmount: trade.inputAmount, outputAmount: trade.outputAmount }],
    v4Routes: [],
    mixedRoutes: [],
    tradeType,
  })
}

function balanceInputOptions(overrides: Partial<SwapOptions> = {}): SwapOptions {
  return {
    slippageTolerance: new Percent(50, 10_000),
    recipient: TEST_RECIPIENT,
    chainId: MAINNET,
    routerBalanceInput: {},
    ...overrides,
  }
}

describe('routerBalanceInput', () => {
  const usdcWethPool = makeV3Pool(USDC, WETH)
  const usdcTrade = () => buildV3Trade(usdcWethPool, USDC, WETH, '1000000000', '500000000000000000')

  describe('UniswapTrade validation', () => {
    it('forces payerIsUser to false', () => {
      const uniswapTrade = new UniswapTrade(usdcTrade(), balanceInputOptions())
      expect(uniswapTrade.payerIsUser).to.equal(false)
    })

    it('throws without an explicit recipient', () => {
      expect(() => new UniswapTrade(usdcTrade(), balanceInputOptions({ recipient: undefined }))).to.throw(
        /Explicit recipient address required with routerBalanceInput/
      )
    })

    it('throws when the recipient is the msg.sender sentinel', () => {
      expect(() => new UniswapTrade(usdcTrade(), balanceInputOptions({ recipient: SENDER_AS_RECIPIENT }))).to.throw(
        /Explicit recipient address required with routerBalanceInput/
      )
    })

    it('throws when the recipient is the router sentinel (address(2)) or the zero address', () => {
      // address(2) makes a native-out unwrap skip its transfer: execute() succeeds with the
      // ETH stranded in the permissionless router; address(0) burns.
      expect(
        () =>
          new UniswapTrade(
            usdcTrade(),
            balanceInputOptions({ recipient: '0x0000000000000000000000000000000000000002' })
          )
      ).to.throw(/recipient cannot be a UR sentinel or the zero address/)
      expect(
        () =>
          new UniswapTrade(
            usdcTrade(),
            balanceInputOptions({ recipient: '0x0000000000000000000000000000000000000000' })
          )
      ).to.throw(/recipient cannot be a UR sentinel or the zero address/)
    })

    it('throws on a native input whose route does not wrap (pure-native v4)', () => {
      const nativeV4Pool = makeV4Pool(ETHER, USDC)
      const v4Route = new V4Route([nativeV4Pool], ETHER, USDC)
      const v4Trade = V4Trade.createUncheckedTrade({
        route: v4Route,
        inputAmount: CurrencyAmount.fromRawAmount(ETHER, '1000000000000000000'),
        outputAmount: CurrencyAmount.fromRawAmount(USDC, '2000000000'),
        tradeType: TradeType.EXACT_INPUT,
      })
      const nativeTrade = new RouterTrade({
        v2Routes: [],
        v3Routes: [],
        v4Routes: [{ routev4: v4Trade.route, inputAmount: v4Trade.inputAmount, outputAmount: v4Trade.outputAmount }],
        mixedRoutes: [],
        tradeType: TradeType.EXACT_INPUT,
      })
      expect(() => new UniswapTrade(nativeTrade, balanceInputOptions())).to.throw(
        /routerBalanceInput with a native input requires a route that wraps to WETH/
      )
    })

    it('accepts a native input whose route wraps to WETH', () => {
      const nativeTrade = new RouterTrade({
        v2Routes: [],
        v3Routes: [
          {
            routev3: new V3Route([makeV3Pool(WETH, USDC)], ETHER, USDC),
            inputAmount: CurrencyAmount.fromRawAmount(ETHER, '1000000000000000000'),
            outputAmount: CurrencyAmount.fromRawAmount(USDC, '2000000000'),
          },
        ],
        v4Routes: [],
        mixedRoutes: [],
        tradeType: TradeType.EXACT_INPUT,
      })
      expect(() => new UniswapTrade(nativeTrade, balanceInputOptions())).to.not.throw()
    })

    it('throws on EXACT_OUTPUT', () => {
      const exactOut = buildV3Trade(
        usdcWethPool,
        USDC,
        WETH,
        '1000000000',
        '500000000000000000',
        TradeType.EXACT_OUTPUT
      )
      expect(() => new UniswapTrade(exactOut, balanceInputOptions())).to.throw(
        /routerBalanceInput requires TradeType.EXACT_INPUT/
      )
    })

    it('throws on split routes, which cannot share one CONTRACT_BALANCE', () => {
      const v3 = V3Trade.createUncheckedTrade({
        route: new V3Route([usdcWethPool], USDC, WETH),
        inputAmount: CurrencyAmount.fromRawAmount(USDC, '500000000'),
        outputAmount: CurrencyAmount.fromRawAmount(WETH, '250000000000000000'),
        tradeType: TradeType.EXACT_INPUT,
      })
      const pair = new Pair(
        CurrencyAmount.fromRawAmount(USDC, '1000000000000'),
        CurrencyAmount.fromRawAmount(WETH, '1000000000000000000')
      )
      const v2 = new V2Trade(
        new V2Route([pair], USDC, WETH),
        CurrencyAmount.fromRawAmount(USDC, '500000000'),
        TradeType.EXACT_INPUT
      )
      const split = new RouterTrade({
        v2Routes: [{ routev2: v2.route, inputAmount: v2.inputAmount, outputAmount: v2.outputAmount }],
        v3Routes: [{ routev3: v3.route, inputAmount: v3.inputAmount, outputAmount: v3.outputAmount }],
        v4Routes: [],
        mixedRoutes: [],
        tradeType: TradeType.EXACT_INPUT,
      })
      expect(() => new UniswapTrade(split, balanceInputOptions())).to.throw(
        /routerBalanceInput does not support split routes/
      )
    })

    it('throws when an inputTokenPermit is provided', () => {
      const opts = balanceInputOptions({ inputTokenPermit: {} as any })
      expect(() => new UniswapTrade(usdcTrade(), opts)).to.throw(/does not use Permit2/)
    })

    it('throws with ApproveProxy token transfer mode', () => {
      const opts = balanceInputOptions({ tokenTransferMode: TokenTransferMode.ApproveProxy })
      expect(() => new UniswapTrade(usdcTrade(), opts)).to.throw(/not supported with ApproveProxy/)
    })

    it('throws when a minimumAmount is set without a chainId', () => {
      const opts = balanceInputOptions({ chainId: undefined, routerBalanceInput: { minimumAmount: '1' } })
      expect(() => new UniswapTrade(usdcTrade(), opts)).to.throw(/requires chainId/)
    })
  })

  describe('SwapRouter.swapCallParameters', () => {
    it('encodes the first hop as CONTRACT_BALANCE for a V3 swap', () => {
      const { calldata, value } = SwapRouter.swapCallParameters(usdcTrade(), balanceInputOptions())
      expect(value).to.equal('0x00')

      const { commandTypes, inputs } = parseCommands(calldata)
      expect(commandTypes).to.deep.equal([CommandType.V3_SWAP_EXACT_IN])

      const [recipient, amountIn, , , payerIsUser] = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool'],
        inputs[0]
      )
      expect(BigNumber.from(amountIn).eq(CONTRACT_BALANCE)).to.equal(true)
      expect(payerIsUser).to.equal(false)
      expect(recipient.toLowerCase()).to.equal(TEST_RECIPIENT)
    })

    it('keeps the quoted amountIn when routerBalanceInput is absent', () => {
      const opts = balanceInputOptions()
      delete opts.routerBalanceInput
      const { calldata } = SwapRouter.swapCallParameters(usdcTrade(), opts)
      const { inputs } = parseCommands(calldata)
      const [, amountIn, , , payerIsUser] = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'bytes', 'bool'],
        inputs[0]
      )
      expect(BigNumber.from(amountIn).eq(CONTRACT_BALANCE)).to.equal(false)
      expect(payerIsUser).to.equal(true)
    })

    it('still enforces the trade-level minimum output', () => {
      const trade = usdcTrade()
      const { calldata } = SwapRouter.swapCallParameters(trade, balanceInputOptions())
      const { inputs } = parseCommands(calldata)
      const [, , amountOutMin] = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], inputs[0])
      const expected = trade.minimumAmountOut(new Percent(50, 10_000)).quotient.toString()
      expect(BigNumber.from(amountOutMin).toString()).to.equal(expected)
      expect(BigNumber.from(amountOutMin).gt(0)).to.equal(true)
    })

    it('prepends BALANCE_CHECK_ERC20 against the real router address when a minimum is set', () => {
      const opts = balanceInputOptions({ routerBalanceInput: { minimumAmount: '999000000' } })
      const { calldata } = SwapRouter.swapCallParameters(usdcTrade(), opts)

      const { commandTypes, inputs } = parseCommands(calldata)
      expect(commandTypes[0]).to.equal(CommandType.BALANCE_CHECK_ERC20)

      const [owner, token, minBalance] = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[0])
      // owner is read verbatim by the router, so it must not be a sentinel
      expect(owner.toLowerCase()).to.equal(UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_0, MAINNET).toLowerCase())
      expect(token.toLowerCase()).to.equal(USDC.address.toLowerCase())
      expect(BigNumber.from(minBalance).toString()).to.equal('999000000')
    })

    it('omits the balance check when no minimum is set', () => {
      const { calldata } = SwapRouter.swapCallParameters(usdcTrade(), balanceInputOptions())
      const { commandTypes } = parseCommands(calldata)
      expect(commandTypes).to.not.include(CommandType.BALANCE_CHECK_ERC20)
    })

    it('settles CONTRACT_BALANCE and swaps the open delta for a pure V4 route', () => {
      const pool = makeV4Pool(USDC, WETH)
      const v4 = V4Trade.createUncheckedTrade({
        route: new V4Route([pool], USDC, WETH),
        inputAmount: CurrencyAmount.fromRawAmount(USDC, '1000000000'),
        outputAmount: CurrencyAmount.fromRawAmount(WETH, '500000000000000000'),
        tradeType: TradeType.EXACT_INPUT,
      })
      const trade = new RouterTrade({
        v2Routes: [],
        v3Routes: [],
        v4Routes: [{ routev4: v4.route, inputAmount: v4.inputAmount, outputAmount: v4.outputAmount }],
        mixedRoutes: [],
        tradeType: TradeType.EXACT_INPUT,
      })

      const { calldata } = SwapRouter.swapCallParameters(trade, balanceInputOptions())
      const { commandTypes, inputs } = parseCommands(calldata)
      expect(commandTypes).to.deep.equal([CommandType.V4_SWAP])

      const [actions, params] = defaultAbiCoder.decode(['bytes', 'bytes[]'], inputs[0])
      const actionIds = Array.from(Buffer.from(actions.slice(2), 'hex'))
      // SETTLE must precede the swap: the swap consumes the delta the settle opened
      expect(actionIds[0]).to.equal(V4_ACTION_SETTLE)
      expect(actionIds[1]).to.equal(V4_ACTION_SWAP_EXACT_IN)

      const [, settleAmount, settlePayerIsUser] = defaultAbiCoder.decode(['address', 'uint256', 'bool'], params[0])
      expect(BigNumber.from(settleAmount).eq(CONTRACT_BALANCE)).to.equal(true)
      expect(settlePayerIsUser).to.equal(false)
    })

    it('encodes the first hop as CONTRACT_BALANCE for a V2 swap', () => {
      const pair = new Pair(
        CurrencyAmount.fromRawAmount(USDC, '1000000000000'),
        CurrencyAmount.fromRawAmount(DAI, '1000000000000000000000000')
      )
      const v2 = new V2Trade(
        new V2Route([pair], USDC, DAI),
        CurrencyAmount.fromRawAmount(USDC, '1000000000'),
        TradeType.EXACT_INPUT
      )
      const trade = new RouterTrade({
        v2Routes: [{ routev2: v2.route, inputAmount: v2.inputAmount, outputAmount: v2.outputAmount }],
        v3Routes: [],
        v4Routes: [],
        mixedRoutes: [],
        tradeType: TradeType.EXACT_INPUT,
      })
      const { calldata } = SwapRouter.swapCallParameters(trade, balanceInputOptions())
      const { commandTypes, inputs } = parseCommands(calldata)
      expect(commandTypes).to.deep.equal([CommandType.V2_SWAP_EXACT_IN])

      const [, amountIn, , , payerIsUser] = defaultAbiCoder.decode(
        ['address', 'uint256', 'uint256', 'address[]', 'bool'],
        inputs[0]
      )
      expect(BigNumber.from(amountIn).eq(CONTRACT_BALANCE)).to.equal(true)
      expect(payerIsUser).to.equal(false)
    })
  })

  describe('native input (msg.value + full wrap)', () => {
    const nativeTrade = () =>
      new RouterTrade({
        v2Routes: [],
        v3Routes: [
          {
            routev3: new V3Route([makeV3Pool(WETH, USDC)], ETHER, USDC),
            inputAmount: CurrencyAmount.fromRawAmount(ETHER, '1000000000000000000'),
            outputAmount: CurrencyAmount.fromRawAmount(USDC, '2000000000'),
          },
        ],
        v4Routes: [],
        mixedRoutes: [],
        tradeType: TradeType.EXACT_INPUT,
      })

    it('wraps CONTRACT_BALANCE, swaps it, and sweeps ETH dust to the recipient with zero encoded value', () => {
      const result = SwapRouter.swapCallParameters(nativeTrade(), balanceInputOptions())
      const { commandTypes, inputs } = parseCommands(result.calldata)

      expect(BigNumber.from(result.value).toString()).to.equal('0')
      // a high-impact fixture also gets the partial-fill WETH refund (UNWRAP_WETH) before the sweep
      expect(commandTypes.slice(0, 2)).to.deep.equal([CommandType.WRAP_ETH, CommandType.V3_SWAP_EXACT_IN])
      expect(commandTypes[commandTypes.length - 1]).to.equal(CommandType.SWEEP)

      const wrap = defaultAbiCoder.decode(['address', 'uint256'], inputs[0])
      expect(wrap[1].toString()).to.equal(CONTRACT_BALANCE.toString())

      const swap = defaultAbiCoder.decode(['address', 'uint256', 'uint256', 'bytes', 'bool'], inputs[1])
      expect(swap[1].toString()).to.equal(CONTRACT_BALANCE.toString())
      expect(swap[4]).to.equal(false)

      const dustSweep = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[inputs.length - 1])
      expect(dustSweep[1].toLowerCase()).to.equal(TEST_RECIPIENT.toLowerCase())
      expect(dustSweep[2].toString()).to.equal('0')
    })

    it('asserts the WETH floor after the wrap when a minimumAmount is set', () => {
      const result = SwapRouter.swapCallParameters(
        nativeTrade(),
        balanceInputOptions({ routerBalanceInput: { minimumAmount: '990000000000000000' } })
      )
      const { commandTypes, inputs } = parseCommands(result.calldata)

      expect(commandTypes[0]).to.equal(CommandType.WRAP_ETH)
      expect(commandTypes[1]).to.equal(CommandType.BALANCE_CHECK_ERC20)

      const check = defaultAbiCoder.decode(['address', 'address', 'uint256'], inputs[1])
      expect(check[0].toLowerCase()).to.equal(
        UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_0, MAINNET).toLowerCase()
      )
      expect(check[1].toLowerCase()).to.equal(WETH.address.toLowerCase())
      expect(check[2].toString()).to.equal('990000000000000000')
    })
  })
})
