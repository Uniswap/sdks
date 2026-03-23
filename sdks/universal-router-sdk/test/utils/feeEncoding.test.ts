import { expect } from 'chai'
import JSBI from 'jsbi'
import { BigNumber, utils } from 'ethers'
import { CurrencyAmount, Ether, Percent, Token, TradeType } from '@uniswap/sdk-core'
import { FeeOptions, encodeSqrtRatioX96, nearestUsableTick, TickMath, FeeAmount } from '@uniswap/v3-sdk'
import { Pool as V4Pool, Route as V4Route, Trade as V4Trade, URVersion } from '@uniswap/v4-sdk'
import { encodeFeeBips, encodeFee1e18 } from '../../src/utils/numbers'
import { RoutePlanner, CommandType } from '../../src/utils/routerCommands'
import { CommandParser } from '../../src/utils/commandParser'
import { SwapRouter, UniswapTrade, FlatFeeOptions } from '../../src'
import { buildTrade, swapOptions } from './uniswapData'
import { TEST_FEE_RECIPIENT_ADDRESS } from './addresses'
import { ZERO_ADDRESS } from '../../src/utils/constants'

const ETHER = Ether.onChain(1)
const WETH = new Token(1, '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', 18, 'WETH', 'Wrapped Ether')
const USDC = new Token(1, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 6, 'USDC', 'USD Coin')

describe('Fee Encoding', () => {
  describe('encodeFeeBips', () => {
    it('encodes 5% as 500 bips', () => {
      const fee = new Percent(5, 100)
      const encoded = encodeFeeBips(fee)
      expect(BigNumber.from(encoded).toNumber()).to.equal(500)
    })

    it('encodes 1% as 100 bips', () => {
      const fee = new Percent(1, 100)
      const encoded = encodeFeeBips(fee)
      expect(BigNumber.from(encoded).toNumber()).to.equal(100)
    })

    it('encodes 0.3% as 30 bips', () => {
      const fee = new Percent(3, 1000)
      const encoded = encodeFeeBips(fee)
      expect(BigNumber.from(encoded).toNumber()).to.equal(30)
    })

    it('encodes 100% as 10000 bips', () => {
      const fee = new Percent(100, 100)
      const encoded = encodeFeeBips(fee)
      expect(BigNumber.from(encoded).toNumber()).to.equal(10000)
    })

    it('cannot represent 1/3 exactly (truncates to 3333 bips)', () => {
      const fee = new Percent(1, 3)
      const encoded = encodeFeeBips(fee)
      expect(BigNumber.from(encoded).toNumber()).to.equal(3333)
    })
  })

  describe('encodeFee1e18', () => {
    it('encodes 5% with 1e18 precision', () => {
      const fee = new Percent(5, 100)
      const encoded = encodeFee1e18(fee)
      expect(BigNumber.from(encoded).toString()).to.equal(BigNumber.from(10).pow(18).mul(5).div(100).toString())
    })

    it('encodes 1% with 1e18 precision', () => {
      const fee = new Percent(1, 100)
      const encoded = encodeFee1e18(fee)
      expect(BigNumber.from(encoded).toString()).to.equal(BigNumber.from(10).pow(16).toString())
    })

    it('encodes 0.3% with 1e18 precision', () => {
      const fee = new Percent(3, 1000)
      const encoded = encodeFee1e18(fee)
      expect(BigNumber.from(encoded).toString()).to.equal(BigNumber.from(10).pow(15).mul(3).toString())
    })

    it('can represent 1/3 with higher precision than bips', () => {
      const fee = new Percent(1, 3)
      const encoded1e18 = encodeFee1e18(fee)
      const encodedBips = encodeFeeBips(fee)

      // 1/3 in bips: 3333 out of 10000 = 0.3333
      // 1/3 in 1e18: 333333333333333333 out of 1e18 = 0.333333333333333333
      expect(BigNumber.from(encoded1e18).toString()).to.equal('333333333333333333')
      expect(BigNumber.from(encodedBips).toNumber()).to.equal(3333)
    })
  })

  describe('PAY_PORTION vs PAY_PORTION_FULL_PRECISION command encoding', () => {
    const token = '0x0000000000000000000000000000000000000001'
    const recipient = '0x0000000000000000000000000000000000000002'
    const bips = BigNumber.from(500)
    const portion1e18 = BigNumber.from(10).pow(16).mul(5) // 5% in 1e18

    it('PAY_PORTION encodes with bips parameter', () => {
      const planner = new RoutePlanner()
      planner.addCommand(CommandType.PAY_PORTION, [token, recipient, bips])

      const calldata = SwapRouter.INTERFACE.encodeFunctionData('execute(bytes,bytes[])', [
        planner.commands,
        planner.inputs,
      ])
      const parsed = CommandParser.parseCalldata(calldata)

      expect(parsed.commands).to.have.length(1)
      expect(parsed.commands[0].commandName).to.equal('PAY_PORTION')
      expect(parsed.commands[0].params[2].name).to.equal('bips')
      expect(BigNumber.from(parsed.commands[0].params[2].value).toNumber()).to.equal(500)
    })

    it('PAY_PORTION_FULL_PRECISION encodes with portion parameter', () => {
      const planner = new RoutePlanner()
      planner.addCommand(CommandType.PAY_PORTION_FULL_PRECISION, [token, recipient, portion1e18])

      const calldata = SwapRouter.INTERFACE.encodeFunctionData('execute(bytes,bytes[])', [
        planner.commands,
        planner.inputs,
      ])
      const parsed = CommandParser.parseCalldata(calldata)

      expect(parsed.commands).to.have.length(1)
      expect(parsed.commands[0].commandName).to.equal('PAY_PORTION_FULL_PRECISION')
      expect(parsed.commands[0].params[2].name).to.equal('portion')
      expect(BigNumber.from(parsed.commands[0].params[2].value).toString()).to.equal(portion1e18.toString())
    })

    it('PAY_PORTION command byte is 0x06', () => {
      const planner = new RoutePlanner()
      planner.addCommand(CommandType.PAY_PORTION, [token, recipient, bips])
      expect(planner.commands).to.equal('0x06')
    })

    it('PAY_PORTION_FULL_PRECISION command byte is 0x07', () => {
      const planner = new RoutePlanner()
      planner.addCommand(CommandType.PAY_PORTION_FULL_PRECISION, [token, recipient, portion1e18])
      expect(planner.commands).to.equal('0x07')
    })
  })

  describe('UniswapTrade.encode fee command selection', () => {
    let ETH_USDC_V4: V4Pool

    before(() => {
      const liquidity = JSBI.BigInt(utils.parseEther('1000000').toString())
      const tickSpacing = 60
      const tickProviderMock = [
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

      ETH_USDC_V4 = new V4Pool(
        ETHER,
        USDC,
        FeeAmount.MEDIUM,
        tickSpacing,
        ZERO_ADDRESS,
        encodeSqrtRatioX96(1, 1),
        liquidity,
        0,
        tickProviderMock
      )
    })

    function parseFeeCommand(methodParameters: { calldata: string }) {
      const parsed = CommandParser.parseCalldata(methodParameters.calldata)
      return parsed.commands.find(
        (cmd) =>
          cmd.commandName === 'PAY_PORTION' ||
          cmd.commandName === 'PAY_PORTION_FULL_PRECISION' ||
          cmd.commandName === 'TRANSFER'
      )
    }

    it('uses PAY_PORTION (bips) when urVersion is undefined (default)', async () => {
      const trade = await V4Trade.fromRoute(
        new V4Route([ETH_USDC_V4], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, utils.parseEther('1').toString()),
        TradeType.EXACT_INPUT
      )
      const feeOptions: FeeOptions = { fee: new Percent(5, 100), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ fee: feeOptions })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)

      const feeCmd = parseFeeCommand(methodParameters)
      expect(feeCmd).to.not.be.undefined
      expect(feeCmd!.commandName).to.equal('PAY_PORTION')
      expect(feeCmd!.params[2].name).to.equal('bips')
      expect(BigNumber.from(feeCmd!.params[2].value).toNumber()).to.equal(500)
    })

    it('uses PAY_PORTION (bips) when urVersion is V2_0', async () => {
      const trade = await V4Trade.fromRoute(
        new V4Route([ETH_USDC_V4], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, utils.parseEther('1').toString()),
        TradeType.EXACT_INPUT
      )
      const feeOptions: FeeOptions = { fee: new Percent(5, 100), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ fee: feeOptions, urVersion: URVersion.V2_0 })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)

      const feeCmd = parseFeeCommand(methodParameters)
      expect(feeCmd).to.not.be.undefined
      expect(feeCmd!.commandName).to.equal('PAY_PORTION')
      expect(feeCmd!.params[2].name).to.equal('bips')
      expect(BigNumber.from(feeCmd!.params[2].value).toNumber()).to.equal(500)
    })

    it('uses PAY_PORTION_FULL_PRECISION (1e18) when urVersion is V2_1_1', async () => {
      const trade = await V4Trade.fromRoute(
        new V4Route([ETH_USDC_V4], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, utils.parseEther('1').toString()),
        TradeType.EXACT_INPUT
      )
      const feeOptions: FeeOptions = { fee: new Percent(5, 100), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ fee: feeOptions, urVersion: URVersion.V2_1_1 })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)

      const feeCmd = parseFeeCommand(methodParameters)
      expect(feeCmd).to.not.be.undefined
      expect(feeCmd!.commandName).to.equal('PAY_PORTION_FULL_PRECISION')
      expect(feeCmd!.params[2].name).to.equal('portion')
      // 5% in 1e18 = 5 * 10^16
      expect(BigNumber.from(feeCmd!.params[2].value).toString()).to.equal(BigNumber.from(10).pow(16).mul(5).toString())
    })

    it('encodes correct fee recipient in PAY_PORTION_FULL_PRECISION', async () => {
      const trade = await V4Trade.fromRoute(
        new V4Route([ETH_USDC_V4], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, utils.parseEther('1').toString()),
        TradeType.EXACT_INPUT
      )
      const feeOptions: FeeOptions = { fee: new Percent(5, 100), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ fee: feeOptions, urVersion: URVersion.V2_1_1 })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)

      const feeCmd = parseFeeCommand(methodParameters)
      expect(feeCmd!.params[1].name).to.equal('recipient')
      expect(feeCmd!.params[1].value.toLowerCase()).to.equal(TEST_FEE_RECIPIENT_ADDRESS.toLowerCase())
    })

    it('uses TRANSFER for flat fees regardless of urVersion', async () => {
      const trade = await V4Trade.fromRoute(
        new V4Route([ETH_USDC_V4], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, utils.parseEther('1').toString()),
        TradeType.EXACT_INPUT
      )
      const feeOptions: FlatFeeOptions = { amount: utils.parseUnits('50', 6), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ flatFee: feeOptions, urVersion: URVersion.V2_1_1 })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)

      const feeCmd = parseFeeCommand(methodParameters)
      expect(feeCmd).to.not.be.undefined
      expect(feeCmd!.commandName).to.equal('TRANSFER')
    })

    it('exact output adjusts minimumAmountOut with 1e18 precision for V2_1_1', async () => {
      const outputUSDC = utils.parseUnits('1000', 6)
      // Adjust output to account for 5% fee: outputUSDC / (1 - 0.05)
      const adjustedOutput = outputUSDC
        .mul(BigNumber.from(10).pow(18))
        .div(BigNumber.from(10).pow(18).sub(BigNumber.from(10).pow(16).mul(5)))
      const trade = await V4Trade.fromRoute(
        new V4Route([ETH_USDC_V4], ETHER, USDC),
        CurrencyAmount.fromRawAmount(USDC, adjustedOutput.toString()),
        TradeType.EXACT_OUTPUT
      )
      const feeOptions: FeeOptions = { fee: new Percent(5, 100), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ fee: feeOptions, urVersion: URVersion.V2_1_1 })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)

      const feeCmd = parseFeeCommand(methodParameters)
      expect(feeCmd!.commandName).to.equal('PAY_PORTION_FULL_PRECISION')

      // Verify SWEEP follows with adjusted minimumAmountOut (after fee deduction)
      const parsed = CommandParser.parseCalldata(methodParameters.calldata)
      const sweepCmd = parsed.commands.find((cmd) => cmd.commandName === 'SWEEP')
      expect(sweepCmd).to.not.be.undefined
      const sweepMinAmount = BigNumber.from(sweepCmd!.params[2].value)
      // After 5% fee deduction from minimumAmountOut, the sweep amount should be less than the trade output
      expect(sweepMinAmount.gt(0)).to.be.true
    })

    it('exact output adjusts minimumAmountOut with bips precision for V2_0', async () => {
      const outputUSDC = utils.parseUnits('1000', 6)
      const adjustedOutput = outputUSDC.mul(10000).div(10000 - 500)
      const trade = await V4Trade.fromRoute(
        new V4Route([ETH_USDC_V4], ETHER, USDC),
        CurrencyAmount.fromRawAmount(USDC, adjustedOutput.toString()),
        TradeType.EXACT_OUTPUT
      )
      const feeOptions: FeeOptions = { fee: new Percent(5, 100), recipient: TEST_FEE_RECIPIENT_ADDRESS }
      const opts = swapOptions({ fee: feeOptions })
      const methodParameters = SwapRouter.swapCallParameters(buildTrade([trade]), opts)

      const feeCmd = parseFeeCommand(methodParameters)
      expect(feeCmd!.commandName).to.equal('PAY_PORTION')

      const parsed = CommandParser.parseCalldata(methodParameters.calldata)
      const sweepCmd = parsed.commands.find((cmd) => cmd.commandName === 'SWEEP')
      expect(sweepCmd).to.not.be.undefined
      const sweepMinAmount = BigNumber.from(sweepCmd!.params[2].value)
      expect(sweepMinAmount.gt(0)).to.be.true
    })
  })
})
