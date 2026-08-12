import { expect } from 'chai'
import JSBI from 'jsbi'
import { BigNumber, utils } from 'ethers'
import { CurrencyAmount, Ether, Percent, Token, TradeType } from '@uniswap/sdk-core'
import { FeeOptions, encodeSqrtRatioX96, nearestUsableTick, TickMath, FeeAmount } from '@uniswap/v3-sdk'
import { Pool as V4Pool, Route as V4Route, Trade as V4Trade } from '@uniswap/v4-sdk'
import { UniversalRouterVersion } from '../../src/utils/constants'
import { encodeFeeBips, encodeFee1e18 } from '../../src/utils/numbers'
import { RoutePlanner, CommandType } from '../../src/utils/routerCommands'
import { CommandParser } from '../../src/utils/commandParser'
import { SwapRouter, UniswapTrade, FlatFeeOptions, MAX_FEE_RECIPIENTS } from '../../src'
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
      const opts = swapOptions({ fee: feeOptions, urVersion: UniversalRouterVersion.V2_0 })
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
      const opts = swapOptions({ fee: feeOptions, urVersion: UniversalRouterVersion.V2_1_1 })
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
      const opts = swapOptions({ fee: feeOptions, urVersion: UniversalRouterVersion.V2_1_1 })
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
      const opts = swapOptions({ flatFee: feeOptions, urVersion: UniversalRouterVersion.V2_1_1 })
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
      const opts = swapOptions({ fee: feeOptions, urVersion: UniversalRouterVersion.V2_1_1 })
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

  describe('UniswapTrade.encode multiple fee recipients', () => {
    // deliberately not in ascending order, so an implementation that sorted or deduped would fail
    const RECIPIENT_A = '0xcccccccccccccccccccccccccccccccccccccccc'
    const RECIPIENT_B = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1'
    const RECIPIENT_C = '0xdddddddddddddddddddddddddddddddddddddddd'
    const RECIPIENT_D = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2'

    const FEE_A: FeeOptions = { fee: new Percent(25, 10_000), recipient: RECIPIENT_A } // 0.25%
    const FEE_B: FeeOptions = { fee: new Percent(50, 10_000), recipient: RECIPIENT_B } // 0.50%
    const FEE_C: FeeOptions = { fee: new Percent(75, 10_000), recipient: RECIPIENT_C } // 0.75%
    const FEE_D: FeeOptions = { fee: new Percent(100, 10_000), recipient: RECIPIENT_D } // 1.00%

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

    async function exactInputTrade(): Promise<V4Trade<Ether, Token, TradeType.EXACT_INPUT>> {
      return V4Trade.fromRoute(
        new V4Route([ETH_USDC_V4], ETHER, USDC),
        CurrencyAmount.fromRawAmount(ETHER, utils.parseEther('1').toString()),
        TradeType.EXACT_INPUT
      )
    }

    async function exactOutputTrade(): Promise<V4Trade<Ether, Token, TradeType.EXACT_OUTPUT>> {
      return V4Trade.fromRoute(
        new V4Route([ETH_USDC_V4], ETHER, USDC),
        CurrencyAmount.fromRawAmount(USDC, utils.parseUnits('1000', 6).toString()),
        TradeType.EXACT_OUTPUT
      )
    }

    function feeCommands(calldata: string) {
      return CommandParser.parseCalldata(calldata).commands.filter(
        (cmd) => cmd.commandName === 'PAY_PORTION' || cmd.commandName === 'PAY_PORTION_FULL_PRECISION'
      )
    }

    function commandNames(calldata: string): string[] {
      return CommandParser.parseCalldata(calldata).commands.map((cmd) => cmd.commandName)
    }

    function sweepFloor(calldata: string): BigNumber {
      const sweepCmd = CommandParser.parseCalldata(calldata).commands.find((cmd) => cmd.commandName === 'SWEEP')
      expect(sweepCmd, 'expected a SWEEP command').to.not.be.undefined
      return BigNumber.from(sweepCmd!.params[2].value)
    }

    describe('one recipient is unchanged', () => {
      it('a one-element array encodes byte-identically to the bare FeeOptions (V2_1_1)', async () => {
        const trade = buildTrade([await exactInputTrade()])
        const single = SwapRouter.swapCallParameters(
          trade,
          swapOptions({ fee: FEE_A, urVersion: UniversalRouterVersion.V2_1_1 })
        )
        const asArray = SwapRouter.swapCallParameters(
          trade,
          swapOptions({ fee: [FEE_A], urVersion: UniversalRouterVersion.V2_1_1 })
        )

        expect(asArray.calldata).to.equal(single.calldata)
        expect(asArray.value).to.equal(single.value)
        expect(feeCommands(asArray.calldata)).to.have.length(1)
      })

      it('a one-element array encodes byte-identically to the bare FeeOptions (V2_0 bips)', async () => {
        const trade = buildTrade([await exactInputTrade()])
        const single = SwapRouter.swapCallParameters(
          trade,
          swapOptions({ fee: FEE_A, urVersion: UniversalRouterVersion.V2_0 })
        )
        const asArray = SwapRouter.swapCallParameters(
          trade,
          swapOptions({ fee: [FEE_A], urVersion: UniversalRouterVersion.V2_0 })
        )

        expect(asArray.calldata).to.equal(single.calldata)
        expect(feeCommands(asArray.calldata)[0].commandName).to.equal('PAY_PORTION')
      })

      it('a one-element array encodes byte-identically on exact output, where the fee is deducted', async () => {
        const trade = buildTrade([await exactOutputTrade()])
        const single = SwapRouter.swapCallParameters(
          trade,
          swapOptions({ fee: FEE_A, urVersion: UniversalRouterVersion.V2_1_1 })
        )
        const asArray = SwapRouter.swapCallParameters(
          trade,
          swapOptions({ fee: [FEE_A], urVersion: UniversalRouterVersion.V2_1_1 })
        )

        expect(asArray.calldata).to.equal(single.calldata)
        expect(sweepFloor(asArray.calldata).toString()).to.equal(sweepFloor(single.calldata).toString())
      })
    })

    describe('command emission', () => {
      it('emits one PAY_PORTION_FULL_PRECISION per recipient for two recipients', async () => {
        const fees = [FEE_A, FEE_B]
        const methodParameters = SwapRouter.swapCallParameters(
          buildTrade([await exactInputTrade()]),
          swapOptions({ fee: fees, urVersion: UniversalRouterVersion.V2_1_1 })
        )

        const cmds = feeCommands(methodParameters.calldata)
        expect(cmds).to.have.length(2)
        expect(cmds.map((cmd) => cmd.commandName)).to.deep.equal([
          'PAY_PORTION_FULL_PRECISION',
          'PAY_PORTION_FULL_PRECISION',
        ])
        expect(cmds.map((cmd) => (cmd.params[1].value as string).toLowerCase())).to.deep.equal(
          fees.map((fee) => fee.recipient.toLowerCase())
        )
        expect(cmds.map((cmd) => BigNumber.from(cmd.params[2].value).toString())).to.deep.equal(
          fees.map((fee) => BigNumber.from(encodeFee1e18(fee.fee)).toString())
        )
      })

      it('emits one PAY_PORTION per recipient for four recipients on V2_0 (bips)', async () => {
        const fees = [FEE_A, FEE_B, FEE_C, FEE_D]
        const methodParameters = SwapRouter.swapCallParameters(
          buildTrade([await exactInputTrade()]),
          swapOptions({ fee: fees, urVersion: UniversalRouterVersion.V2_0 })
        )

        const cmds = feeCommands(methodParameters.calldata)
        expect(cmds).to.have.length(MAX_FEE_RECIPIENTS)
        expect(cmds.map((cmd) => cmd.commandName)).to.deep.equal(new Array(4).fill('PAY_PORTION'))
        expect(cmds.map((cmd) => BigNumber.from(cmd.params[2].value).toNumber())).to.deep.equal(
          fees.map((fee) => BigNumber.from(encodeFeeBips(fee.fee)).toNumber())
        )
      })

      it('preserves the caller ordering rather than sorting or deduping recipients', async () => {
        const fees = [FEE_C, FEE_A, FEE_D, FEE_B]
        const methodParameters = SwapRouter.swapCallParameters(
          buildTrade([await exactInputTrade()]),
          swapOptions({ fee: fees, urVersion: UniversalRouterVersion.V2_1_1 })
        )

        expect(
          feeCommands(methodParameters.calldata).map((cmd) => (cmd.params[1].value as string).toLowerCase())
        ).to.deep.equal([RECIPIENT_C, RECIPIENT_A, RECIPIENT_D, RECIPIENT_B])
      })

      it('emits every fee command before the settlement command', async () => {
        const methodParameters = SwapRouter.swapCallParameters(
          buildTrade([await exactInputTrade()]),
          swapOptions({ fee: [FEE_A, FEE_B, FEE_C], urVersion: UniversalRouterVersion.V2_1_1 })
        )

        const names = commandNames(methodParameters.calldata)
        const lastFeeIndex = names.lastIndexOf('PAY_PORTION_FULL_PRECISION')
        const sweepIndex = names.indexOf('SWEEP')
        expect(lastFeeIndex).to.be.greaterThan(-1)
        expect(sweepIndex).to.be.greaterThan(lastFeeIndex)
      })
    })

    describe('summed fee deduction', () => {
      it('subtracts the sum of every recipient from the exact-output sweep floor', async () => {
        const fees = [FEE_A, FEE_B, FEE_C, FEE_D]
        const trade = buildTrade([await exactOutputTrade()])
        const opts = swapOptions({ fee: fees, urVersion: UniversalRouterVersion.V2_1_1 })
        const methodParameters = SwapRouter.swapCallParameters(trade, opts)

        const grossMinimumOut = BigNumber.from(trade.minimumAmountOut(opts.slippageTolerance).quotient.toString())
        const expectedDeduction = fees.reduce(
          (acc, fee) =>
            acc.add(grossMinimumOut.mul(BigNumber.from(encodeFee1e18(fee.fee))).div(BigNumber.from(10).pow(18))),
          BigNumber.from(0)
        )

        expect(sweepFloor(methodParameters.calldata).toString()).to.equal(
          grossMinimumOut.sub(expectedDeduction).toString()
        )
      })

      it('deducts strictly more for four recipients than for the first one alone', async () => {
        const trade = buildTrade([await exactOutputTrade()])
        const oneOpts = swapOptions({ fee: [FEE_A], urVersion: UniversalRouterVersion.V2_1_1 })
        const fourOpts = swapOptions({ fee: [FEE_A, FEE_B, FEE_C, FEE_D], urVersion: UniversalRouterVersion.V2_1_1 })

        const oneFloor = sweepFloor(SwapRouter.swapCallParameters(trade, oneOpts).calldata)
        const fourFloor = sweepFloor(SwapRouter.swapCallParameters(trade, fourOpts).calldata)

        expect(fourFloor.lt(oneFloor)).to.be.true
      })

      it('never under-estimates what the sequential on-chain PAY_PORTIONs actually take', async () => {
        // Each PAY_PORTION reads the router's *current* balance, so the portions compound downward.
        // The SDK sums every portion against the gross amount, which must therefore be an upper bound
        // — an under-estimate would leave a sweep floor the router cannot meet.
        const fees = [FEE_A, FEE_B, FEE_C, FEE_D]
        const trade = buildTrade([await exactOutputTrade()])
        const opts = swapOptions({ fee: fees, urVersion: UniversalRouterVersion.V2_1_1 })
        const methodParameters = SwapRouter.swapCallParameters(trade, opts)

        const grossMinimumOut = BigNumber.from(trade.minimumAmountOut(opts.slippageTolerance).quotient.toString())
        const sdkDeduction = grossMinimumOut.sub(sweepFloor(methodParameters.calldata))

        let balance = grossMinimumOut
        let actuallyPaid = BigNumber.from(0)
        for (const fee of fees) {
          const paid = balance.mul(BigNumber.from(encodeFee1e18(fee.fee))).div(BigNumber.from(10).pow(18))
          actuallyPaid = actuallyPaid.add(paid)
          balance = balance.sub(paid)
        }

        expect(sdkDeduction.gte(actuallyPaid), 'sdk deduction must not under-estimate the on-chain total').to.be.true
      })

      it('leaves the exact-input sweep floor at the gross minimum, as with a single fee', async () => {
        const trade = buildTrade([await exactInputTrade()])
        const opts = swapOptions({ fee: [FEE_A, FEE_B, FEE_C, FEE_D], urVersion: UniversalRouterVersion.V2_1_1 })
        const methodParameters = SwapRouter.swapCallParameters(trade, opts)

        expect(sweepFloor(methodParameters.calldata).toString()).to.equal(
          trade.minimumAmountOut(opts.slippageTolerance).quotient.toString()
        )
      })

      it('rejects portions that together exceed the exact-output minimum', async () => {
        const trade = buildTrade([await exactOutputTrade()])
        const halves: FeeOptions[] = [
          { fee: new Percent(60, 100), recipient: RECIPIENT_A },
          { fee: new Percent(60, 100), recipient: RECIPIENT_B },
        ]

        expect(() =>
          SwapRouter.swapCallParameters(trade, swapOptions({ fee: halves, urVersion: UniversalRouterVersion.V2_1_1 }))
        ).to.throw('Fee amount greater than minimumAmountOut')
      })
    })

    describe('validation', () => {
      it(`rejects more than ${MAX_FEE_RECIPIENTS} recipients`, async () => {
        const trade = buildTrade([await exactInputTrade()])
        const fees = [
          FEE_A,
          FEE_B,
          FEE_C,
          FEE_D,
          { fee: new Percent(1, 10_000), recipient: TEST_FEE_RECIPIENT_ADDRESS },
        ]

        expect(
          () => new UniswapTrade(trade, swapOptions({ fee: fees, urVersion: UniversalRouterVersion.V2_1_1 }))
        ).to.throw(`At most ${MAX_FEE_RECIPIENTS} fee recipients permitted`)
      })

      it(`accepts exactly ${MAX_FEE_RECIPIENTS} recipients`, async () => {
        const trade = buildTrade([await exactInputTrade()])
        const fees = [FEE_A, FEE_B, FEE_C, FEE_D]

        expect(
          () => new UniswapTrade(trade, swapOptions({ fee: fees, urVersion: UniversalRouterVersion.V2_1_1 }))
        ).to.not.throw()
      })

      it('rejects an empty fee array', async () => {
        const trade = buildTrade([await exactInputTrade()])

        expect(() => new UniswapTrade(trade, swapOptions({ fee: [] }))).to.throw('At least one fee recipient required')
      })

      it('still rejects a fee array combined with a flat fee', async () => {
        const trade = buildTrade([await exactInputTrade()])
        const flatFee: FlatFeeOptions = { amount: utils.parseUnits('50', 6), recipient: TEST_FEE_RECIPIENT_ADDRESS }

        expect(() => new UniswapTrade(trade, swapOptions({ fee: [FEE_A], flatFee }))).to.throw(
          'Only one fee option permitted'
        )
      })

      it('rejects fractional bips on a pre-V2_1_1 router for any recipient in the array', async () => {
        const trade = buildTrade([await exactInputTrade()])
        const fees: FeeOptions[] = [FEE_A, { fee: new Percent(1, 3), recipient: RECIPIENT_B }]

        expect(() =>
          SwapRouter.swapCallParameters(trade, swapOptions({ fee: fees, urVersion: UniversalRouterVersion.V2_0 }))
        ).to.throw('Fractional fee bips require Universal Router version V2_1_1 or higher')
      })
    })
  })
})
