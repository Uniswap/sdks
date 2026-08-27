import { expect } from 'chai'
import JSBI from 'jsbi'
import { BigNumber, utils } from 'ethers'
import { CurrencyAmount, Ether, Percent, Token, TradeType } from '@uniswap/sdk-core'
import {
  FeeOptions,
  encodeSqrtRatioX96,
  nearestUsableTick,
  TickMath,
  FeeAmount,
  Route as V3Route,
  Trade as V3Trade,
} from '@uniswap/v3-sdk'
import { Pool as V4Pool, Route as V4Route, Trade as V4Trade } from '@uniswap/v4-sdk'
import { UniversalRouterVersion, isAtLeastV2_1_1 } from '../../src/utils/constants'
import { encodeFeeBips, encodeFee1e18 } from '../../src/utils/numbers'
import { scalePortionFees, simulatePortionFeeDeduction } from '../../src/utils/portionFees'
import { RoutePlanner, CommandType } from '../../src/utils/routerCommands'
import { CommandParser } from '../../src/utils/commandParser'
import { SwapRouter, UniswapTrade, FlatFeeOptions, MAX_FEE_RECIPIENTS } from '../../src'
import { buildTrade, swapOptions, makeV3Pool } from './uniswapData'
import { TEST_FEE_RECIPIENT_ADDRESS } from './addresses'
import { LEGACY_GOLDEN } from './goldenCalldata'
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

  describe('scalePortionFees (precise gross-output semantics)', () => {
    const A = '0x000000000000000000000000000000000000000a'
    const B = '0x000000000000000000000000000000000000000b'
    const C = '0x000000000000000000000000000000000000000c'

    function simulateSequentialPayments(gross: BigNumber, portions1e18: BigNumber[]): BigNumber[] {
      let balance = gross
      return portions1e18.map((portion) => {
        const paid = balance.mul(portion).div(BigNumber.from(10).pow(18))
        balance = balance.sub(paid)
        return paid
      })
    }

    it('two 2000-bps fees on a 100-unit output pay 20 and 20 (second encoded as 25% of remaining)', () => {
      const scaled = scalePortionFees([
        { fee: new Percent(2000, 10_000), recipient: A },
        { fee: new Percent(2000, 10_000), recipient: B },
      ])

      const encoded = scaled.map((s) => BigNumber.from(encodeFee1e18(s.scaledFee)))
      // first fee unscaled: 20%; second rescaled to 20% / 80% = 25% of the remaining balance
      expect(encoded[0].toString()).to.equal(BigNumber.from(10).pow(17).mul(2).toString())
      expect(encoded[1].toString()).to.equal(BigNumber.from(10).pow(17).mul(25).div(10).toString())

      const paid = simulateSequentialPayments(BigNumber.from(100), encoded)
      expect(paid.map((p) => p.toNumber())).to.deep.equal([20, 20])
    })

    it('5/10/5 bps fees each pay their bps of gross when applied sequentially', () => {
      const scaled = scalePortionFees([
        { fee: new Percent(5, 10_000), recipient: A },
        { fee: new Percent(10, 10_000), recipient: B },
        { fee: new Percent(5, 10_000), recipient: C },
      ])

      // scaled fractions: 5/10000, then 10/9995, then 5/9985
      expect(scaled[1].scaledFee.equalTo(new Percent(10, 9995))).to.be.true
      expect(scaled[2].scaledFee.equalTo(new Percent(5, 9985))).to.be.true

      const gross = BigNumber.from(10).pow(18) // 1e18-unit output
      const encoded = scaled.map((s) => BigNumber.from(encodeFee1e18(s.scaledFee)))
      const paid = simulateSequentialPayments(gross, encoded)

      const expected = [5, 10, 5].map((bps) => gross.mul(bps).div(10_000))
      paid.forEach((p, i) => {
        expect(expected[i].sub(p).abs().lte(2), `recipient ${i} gets its bps of gross (dust only)`).to.be.true
      })
    })

    it('throws when the fees together exceed 100% of the output', () => {
      expect(() =>
        scalePortionFees([
          { fee: new Percent(60, 100), recipient: A },
          { fee: new Percent(60, 100), recipient: B },
        ])
      ).to.throw('Portion fees together exceed 100% of the swap output')
    })

    it('a zero fee entry scales to a zero portion and pays nothing, wherever it sits', () => {
      const scaled = scalePortionFees([
        { fee: new Percent(2000, 10_000), recipient: A },
        { fee: new Percent(0, 10_000), recipient: B },
        { fee: new Percent(2000, 10_000), recipient: C },
      ])

      expect(scaled[1].scaledFee.equalTo(0)).to.be.true
      // the zero entry must not disturb the rescaling of the fees around it
      const encoded = scaled.map((s) => BigNumber.from(encodeFee1e18(s.scaledFee)))
      const paid = simulateSequentialPayments(BigNumber.from(100), encoded)
      expect(paid.map((p) => p.toNumber())).to.deep.equal([20, 0, 20])
    })

    it('a zero fee after a 100% total takes the remaining-balance-is-zero branch without throwing', () => {
      const scaled = scalePortionFees([
        { fee: new Percent(1, 1), recipient: A },
        { fee: new Percent(0, 1), recipient: B },
      ])

      expect(scaled[0].scaledFee.equalTo(new Percent(1, 1))).to.be.true
      expect(scaled[1].scaledFee.equalTo(0)).to.be.true
    })

    it('throws when a positive fee follows a 100% total', () => {
      expect(() =>
        scalePortionFees([
          { fee: new Percent(1, 1), recipient: A },
          { fee: new Percent(1, 10_000), recipient: B },
        ])
      ).to.throw('Portion fees together exceed 100% of the swap output')
    })
  })

  describe('simulatePortionFeeDeduction property fuzz (sweep floor is always meetable)', () => {
    // Deterministic PRNG (mulberry32) so failures reproduce; change the seed only on purpose.
    function mulberry32(seed: number): () => number {
      let a = seed >>> 0
      return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    }

    // On-chain semantics of the encoded fee tail: each PAY_PORTION(_FULL_PRECISION) pays
    // floor(runningBalance * encodedPortion / SCALE) out of the router's running balance.
    function onchainRemaining(startingBalance: BigNumber, fees: FeeOptions[], useFullPrecision: boolean): BigNumber {
      const scale = useFullPrecision ? BigNumber.from(10).pow(18) : BigNumber.from(10_000)
      let balance = startingBalance
      for (const { scaledFee } of scalePortionFees(fees)) {
        const encoded = BigNumber.from(useFullPrecision ? encodeFee1e18(scaledFee) : encodeFeeBips(scaledFee))
        balance = balance.sub(balance.mul(encoded).div(scale))
      }
      return balance
    }

    it('floor == remaining at an exact-gross fill, and floor <= remaining for any larger fill', () => {
      const rand = mulberry32(0xfee5)
      const recipients = [
        '0x000000000000000000000000000000000000000a',
        '0x000000000000000000000000000000000000000b',
        '0x000000000000000000000000000000000000000c',
        '0x000000000000000000000000000000000000000d',
      ]

      for (let run = 0; run < 500; run++) {
        const useFullPrecision = run % 4 !== 3 // mix in the bips (V2_0 single-fee) encoding too
        const count = useFullPrecision ? 1 + Math.floor(rand() * MAX_FEE_RECIPIENTS) : 1

        // fractional-bps fees: numerator/denominator chosen so each fee is in (0, 25%]
        const fees: FeeOptions[] = []
        for (let i = 0; i < count; i++) {
          const denominator = 10_000 + Math.floor(rand() * 9_999_999)
          const numerator = 1 + Math.floor(rand() * Math.floor(denominator / 4))
          fees.push({ fee: new Percent(numerator, denominator), recipient: recipients[i] })
        }

        // gross outputs from dust (1 wei) up to ~1e27
        const gross = BigNumber.from(Math.floor(1 + rand() * Number.MAX_SAFE_INTEGER)).mul(
          BigNumber.from(10).pow(Math.floor(rand() * 12))
        )

        const scaled = scalePortionFees(fees)
        const floor = gross.sub(simulatePortionFeeDeduction(gross, scaled, useFullPrecision))
        const label = `run ${run}: gross=${gross.toString()} fees=${fees
          .map((f) => `${f.fee.numerator.toString()}/${f.fee.denominator.toString()}`)
          .join(',')}`

        // exact-gross fill: the floor must be exactly what the encoded cascade leaves
        expect(floor.toString(), `${label} (exact fill)`).to.equal(
          onchainRemaining(gross, fees, useFullPrecision).toString()
        )
        // any over-fill (each step's remainder is nondecreasing in balance) still meets the floor
        for (const bonus of [1, 2, 7]) {
          const remaining = onchainRemaining(gross.add(bonus), fees, useFullPrecision)
          expect(remaining.gte(floor), `${label} (fill +${bonus} wei leaves ${remaining.toString()})`).to.be.true
        }
        // the deduction never exceeds the gross amount (floor never underflows)
        expect(floor.gte(0), `${label} (floor is non-negative)`).to.be.true
      }
    })

    it('known adversarial case: [216, 519, 917, 3292] bps on gross 533206710', () => {
      // Naive sum(floor(gross * f_i)) gives 263617395 but the encoded cascade pays 263617396:
      // the fixed deduction must match the cascade exactly.
      const fees: FeeOptions[] = [216, 519, 917, 3292].map((bps, i) => ({
        fee: new Percent(bps, 10_000),
        recipient: `0x000000000000000000000000000000000000000${i + 1}`,
      }))
      const gross = BigNumber.from(533206710)

      const deduction = simulatePortionFeeDeduction(gross, scalePortionFees(fees), true)
      expect(deduction.toString()).to.equal('263617396')
      expect(deduction.toString()).to.equal(gross.sub(onchainRemaining(gross, fees, true)).toString())
    })

    it('known adversarial case: 100% total on non-divisible gross 101 deducts everything', () => {
      const fees: FeeOptions[] = [
        { fee: new Percent(60, 100), recipient: '0x0000000000000000000000000000000000000001' },
        { fee: new Percent(40, 100), recipient: '0x0000000000000000000000000000000000000002' },
      ]
      const gross = BigNumber.from(101)
      expect(simulatePortionFeeDeduction(gross, scalePortionFees(fees), true).toString()).to.equal('101')
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

    // V3 USDC -> ETH trades: a native-ETH output settles via UNWRAP_WETH instead of SWEEP,
    // with the fees taken in WETH. Also the vehicle for pre-v4 router versions (V1_2).
    const WETH_USDC_V3 = makeV3Pool(WETH, USDC)

    async function ethOutExactInputTrade(): Promise<V3Trade<Token, Ether, TradeType.EXACT_INPUT>> {
      return V3Trade.fromRoute(
        new V3Route([WETH_USDC_V3], USDC, ETHER),
        CurrencyAmount.fromRawAmount(USDC, utils.parseUnits('1000', 6).toString()),
        TradeType.EXACT_INPUT
      )
    }

    async function ethOutExactOutputTrade(): Promise<V3Trade<Token, Ether, TradeType.EXACT_OUTPUT>> {
      return V3Trade.fromRoute(
        new V3Route([WETH_USDC_V3], USDC, ETHER),
        CurrencyAmount.fromRawAmount(ETHER, utils.parseEther('1').toString()),
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
        // The first fee is unscaled (nothing has been paid yet); the second is rescaled against
        // the remaining balance: 0.50% / (1 - 0.25%) = 50/9975.
        expect(cmds.map((cmd) => BigNumber.from(cmd.params[2].value).toString())).to.deep.equal([
          BigNumber.from(encodeFee1e18(FEE_A.fee)).toString(),
          BigNumber.from(10).pow(18).mul(50).div(9975).toString(),
        ])
      })

      it('rejects multiple recipients on V2_0, which lacks PAY_PORTION_FULL_PRECISION', async () => {
        const fees = [FEE_A, FEE_B, FEE_C, FEE_D]
        const trade = buildTrade([await exactInputTrade()])

        expect(() =>
          SwapRouter.swapCallParameters(trade, swapOptions({ fee: fees, urVersion: UniversalRouterVersion.V2_0 }))
        ).to.throw('Multiple fee recipients require Universal Router version V2_1_1 or higher')
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

    describe('cascade fee deduction', () => {
      // oracle for the on-chain behavior: each PAY_PORTION_FULL_PRECISION floors against the
      // router's *running* balance using the encoded portion, independent of how the SDK
      // computed its deduction
      function replayEncodedCascade(gross: BigNumber, calldata: string): BigNumber {
        let balance = gross
        for (const cmd of feeCommands(calldata)) {
          balance = balance.sub(balance.mul(BigNumber.from(cmd.params[2].value)).div(BigNumber.from(10).pow(18)))
        }
        return balance
      }

      it('sets the exact-output sweep floor to exactly what the sequential encoded portions leave', async () => {
        const fees = [FEE_A, FEE_B, FEE_C, FEE_D]
        const trade = buildTrade([await exactOutputTrade()])
        const opts = swapOptions({ fee: fees, urVersion: UniversalRouterVersion.V2_1_1 })
        const methodParameters = SwapRouter.swapCallParameters(trade, opts)

        const grossMinimumOut = BigNumber.from(trade.minimumAmountOut(opts.slippageTolerance).quotient.toString())
        expect(sweepFloor(methodParameters.calldata).toString()).to.equal(
          replayEncodedCascade(grossMinimumOut, methodParameters.calldata).toString()
        )
        // gross is 1e9; sum(floor(gross * f_i)) would be 25000000, but the encoded cascade only
        // pays 24999999 — the floor is one wei tighter than the naive sum, never looser
        expect(sweepFloor(methodParameters.calldata).toString()).to.equal('975000001')
      })

      it('keeps the exact-output sweep floor satisfiable when later rescaled portions capture earlier flooring dust', async () => {
        // [216, 519, 917, 3292] bps on gross 533206710: the sequential rescaled payments total
        // 263617396 — one wei MORE than sum(floor(gross * f_i)) = 263617395, because dust left
        // by an earlier fee's floor is captured by a later (rescaled-larger) portion. A sweep
        // floor of 533206710 - 263617395 = 269589315 would revert on-chain: exact output
        // delivers exactly the gross minimum, and only 269589314 remains after the fees.
        const fees: FeeOptions[] = [
          { fee: new Percent(216, 10_000), recipient: RECIPIENT_A },
          { fee: new Percent(519, 10_000), recipient: RECIPIENT_B },
          { fee: new Percent(917, 10_000), recipient: RECIPIENT_C },
          { fee: new Percent(3292, 10_000), recipient: RECIPIENT_D },
        ]
        const trade = buildTrade([
          await V4Trade.fromRoute(
            new V4Route([ETH_USDC_V4], ETHER, USDC),
            CurrencyAmount.fromRawAmount(USDC, '533206710'),
            TradeType.EXACT_OUTPUT
          ),
        ])
        const opts = swapOptions({ fee: fees, urVersion: UniversalRouterVersion.V2_1_1 })
        const methodParameters = SwapRouter.swapCallParameters(trade, opts)

        const grossMinimumOut = BigNumber.from(trade.minimumAmountOut(opts.slippageTolerance).quotient.toString())
        expect(grossMinimumOut.toString()).to.equal('533206710')
        expect(sweepFloor(methodParameters.calldata).toString()).to.equal(
          replayEncodedCascade(grossMinimumOut, methodParameters.calldata).toString()
        )
        expect(sweepFloor(methodParameters.calldata).toString()).to.equal('269589314')
      })

      it('deducts strictly more for four recipients than for the first one alone', async () => {
        const trade = buildTrade([await exactOutputTrade()])
        const oneOpts = swapOptions({ fee: [FEE_A], urVersion: UniversalRouterVersion.V2_1_1 })
        const fourOpts = swapOptions({ fee: [FEE_A, FEE_B, FEE_C, FEE_D], urVersion: UniversalRouterVersion.V2_1_1 })

        const oneFloor = sweepFloor(SwapRouter.swapCallParameters(trade, oneOpts).calldata)
        const fourFloor = sweepFloor(SwapRouter.swapCallParameters(trade, fourOpts).calldata)

        expect(fourFloor.lt(oneFloor)).to.be.true
      })

      it('the encoded (rescaled) portions pay each recipient their fraction of gross on-chain', async () => {
        // Each PAY_PORTION_FULL_PRECISION reads the router's *current* balance. The SDK rescales
        // fee i to f_i / (1 - sum of earlier fees), so simulating the sequential on-chain payments
        // with the *encoded* portions must give every recipient their stated fraction of gross
        // (up to flooring dust).
        const fees = [FEE_A, FEE_B, FEE_C, FEE_D]
        const trade = buildTrade([await exactOutputTrade()])
        const opts = swapOptions({ fee: fees, urVersion: UniversalRouterVersion.V2_1_1 })
        const methodParameters = SwapRouter.swapCallParameters(trade, opts)

        const grossMinimumOut = BigNumber.from(trade.minimumAmountOut(opts.slippageTolerance).quotient.toString())
        const encodedPortions = feeCommands(methodParameters.calldata).map((cmd) => BigNumber.from(cmd.params[2].value))

        let balance = grossMinimumOut
        encodedPortions.forEach((portion, i) => {
          const paid = balance.mul(portion).div(BigNumber.from(10).pow(18))
          balance = balance.sub(paid)
          const idealPaid = grossMinimumOut
            .mul(fees[i].fee.numerator.toString())
            .div(fees[i].fee.denominator.toString())
          expect(idealPaid.sub(paid).abs().lte(4), `recipient ${i} must receive its fraction of gross`).to.be.true
        })
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
        ).to.throw('Portion fees together exceed 100% of the swap output')
      })
    })

    describe('byte-identity with pre-multi-fee encoding (golden calldata from main)', () => {
      // LEGACY_GOLDEN was generated by running SwapRouter.swapCallParameters on the unmodified
      // main branch (commit 48dea05c) with these exact trades and options. Byte equality here
      // proves the single-fee paths are untouched by the multi-recipient change.
      const FEE_5_PCT: FeeOptions = { fee: new Percent(5, 100), recipient: TEST_FEE_RECIPIENT_ADDRESS }

      it('single portion fee, exact input, V2_1_1 is byte-identical to main', async () => {
        const mp = SwapRouter.swapCallParameters(
          buildTrade([await exactInputTrade()]),
          swapOptions({ fee: FEE_5_PCT, urVersion: UniversalRouterVersion.V2_1_1 })
        )
        expect(mp.calldata).to.equal(LEGACY_GOLDEN.portionExactInV2_1_1.calldata)
        expect(mp.value).to.equal(LEGACY_GOLDEN.portionExactInV2_1_1.value)
      })

      it('single portion fee, exact input, V2_0 (bips) is byte-identical to main', async () => {
        const mp = SwapRouter.swapCallParameters(
          buildTrade([await exactInputTrade()]),
          swapOptions({ fee: FEE_5_PCT, urVersion: UniversalRouterVersion.V2_0 })
        )
        expect(mp.calldata).to.equal(LEGACY_GOLDEN.portionExactInV2_0.calldata)
        expect(mp.value).to.equal(LEGACY_GOLDEN.portionExactInV2_0.value)
      })

      it('single portion fee, exact output (fee deducted from sweep floor) is byte-identical to main', async () => {
        const mp = SwapRouter.swapCallParameters(
          buildTrade([await exactOutputTrade()]),
          swapOptions({ fee: FEE_5_PCT, urVersion: UniversalRouterVersion.V2_1_1 })
        )
        expect(mp.calldata).to.equal(LEGACY_GOLDEN.portionExactOutV2_1_1.calldata)
        expect(mp.value).to.equal(LEGACY_GOLDEN.portionExactOutV2_1_1.value)
      })

      it('single fractional-1e18 fee (1/3), exact output keeps the quantized deduction: byte-identical to main', async () => {
        // Percent(1, 3) is not representable in 1e18 precision, so main's deduction
        // floor(gross * floor(1e18/3) / 1e18) differs from the exact floor(gross / 3): on a
        // 3-wei gross the quantized deduction is 0 (sweep floor 3), the exact one is 1. The
        // sweep floor must track the quantized payment the encoded command actually makes.
        const trade = buildTrade([
          await V4Trade.fromRoute(
            new V4Route([ETH_USDC_V4], ETHER, USDC),
            CurrencyAmount.fromRawAmount(USDC, '3'),
            TradeType.EXACT_OUTPUT
          ),
        ])
        const mp = SwapRouter.swapCallParameters(
          trade,
          swapOptions({
            fee: { fee: new Percent(1, 3), recipient: TEST_FEE_RECIPIENT_ADDRESS },
            urVersion: UniversalRouterVersion.V2_1_1,
          })
        )
        expect(mp.calldata).to.equal(LEGACY_GOLDEN.portionThirdExactOutV2_1_1.calldata)
        expect(mp.value).to.equal(LEGACY_GOLDEN.portionThirdExactOutV2_1_1.value)
      })

      it('single flat fee, exact output is byte-identical to main', async () => {
        const flatFee: FlatFeeOptions = { amount: utils.parseUnits('50', 6), recipient: TEST_FEE_RECIPIENT_ADDRESS }
        const mp = SwapRouter.swapCallParameters(
          buildTrade([await exactOutputTrade()]),
          swapOptions({ flatFee, urVersion: UniversalRouterVersion.V2_1_1 })
        )
        expect(mp.calldata).to.equal(LEGACY_GOLDEN.flatFeeExactOutV2_1_1.calldata)
        expect(mp.value).to.equal(LEGACY_GOLDEN.flatFeeExactOutV2_1_1.value)
      })

      it('no fee, exact input is byte-identical to main', async () => {
        const mp = SwapRouter.swapCallParameters(
          buildTrade([await exactInputTrade()]),
          swapOptions({ urVersion: UniversalRouterVersion.V2_1_1 })
        )
        expect(mp.calldata).to.equal(LEGACY_GOLDEN.noFeeExactInV2_1_1.calldata)
        expect(mp.value).to.equal(LEGACY_GOLDEN.noFeeExactInV2_1_1.value)
      })
    })

    describe('100% total boundary', () => {
      const SIXTY: FeeOptions = { fee: new Percent(60, 100), recipient: RECIPIENT_A }
      const FORTY: FeeOptions = { fee: new Percent(40, 100), recipient: RECIPIENT_B }
      const FORTY_PLUS_1BPS: FeeOptions = { fee: new Percent(4001, 10_000), recipient: RECIPIENT_B }

      it('scalePortionFees encodes the last portion as the full remaining balance at exactly 100%', () => {
        const scaled = scalePortionFees([SIXTY, FORTY])
        expect(scaled[1].scaledFee.equalTo(new Percent(1, 1))).to.be.true
        expect(BigNumber.from(encodeFee1e18(scaled[1].scaledFee)).toString()).to.equal(
          BigNumber.from(10).pow(18).toString()
        )
        expect(BigNumber.from(encodeFeeBips(scaled[1].scaledFee)).toNumber()).to.equal(10_000)
      })

      it('scalePortionFees throws just over 100% (100% + 1 bps)', () => {
        expect(() => scalePortionFees([SIXTY, FORTY_PLUS_1BPS])).to.throw(
          'Portion fees together exceed 100% of the swap output'
        )
      })

      it('exact input succeeds at exactly 100%: last PAY_PORTION_FULL_PRECISION portion is 1e18', async () => {
        const methodParameters = SwapRouter.swapCallParameters(
          buildTrade([await exactInputTrade()]),
          swapOptions({ fee: [SIXTY, FORTY], urVersion: UniversalRouterVersion.V2_1_1 })
        )

        const cmds = feeCommands(methodParameters.calldata)
        expect(cmds).to.have.length(2)
        expect(BigNumber.from(cmds[1].params[2].value).toString()).to.equal(BigNumber.from(10).pow(18).toString())
      })

      it('exact output at exactly 100% deducts the full minimum: sweep floor is zero, no underflow', async () => {
        const trade = buildTrade([await exactOutputTrade()])
        const methodParameters = SwapRouter.swapCallParameters(
          trade,
          swapOptions({ fee: [SIXTY, FORTY], urVersion: UniversalRouterVersion.V2_1_1 })
        )

        expect(sweepFloor(methodParameters.calldata).toString()).to.equal('0')
      })

      it('exact output at exactly 100% sweeps floor zero even when the gross does not divide evenly', async () => {
        // 60% + 40% of gross 101: the encoded cascade pays 60 and then the full remaining 41,
        // leaving 0. Sum-of-floors would deduct only 100 and demand a floor of 1 from an empty
        // router, so every non-divisible gross at a 100% total would revert.
        const trade = buildTrade([
          await V4Trade.fromRoute(
            new V4Route([ETH_USDC_V4], ETHER, USDC),
            CurrencyAmount.fromRawAmount(USDC, '101'),
            TradeType.EXACT_OUTPUT
          ),
        ])
        const methodParameters = SwapRouter.swapCallParameters(
          trade,
          swapOptions({ fee: [SIXTY, FORTY], urVersion: UniversalRouterVersion.V2_1_1 })
        )

        expect(sweepFloor(methodParameters.calldata).toString()).to.equal('0')
      })

      it('throws the scalePortionFees error just over 100%', async () => {
        const trade = buildTrade([await exactInputTrade()])
        expect(() =>
          SwapRouter.swapCallParameters(
            trade,
            swapOptions({ fee: [SIXTY, FORTY_PLUS_1BPS], urVersion: UniversalRouterVersion.V2_1_1 })
          )
        ).to.throw('Portion fees together exceed 100% of the swap output')
      })

      it('a single 100% fee also encodes as the full balance and succeeds', async () => {
        const methodParameters = SwapRouter.swapCallParameters(
          buildTrade([await exactInputTrade()]),
          swapOptions({
            fee: [{ fee: new Percent(1, 1), recipient: RECIPIENT_A }],
            urVersion: UniversalRouterVersion.V2_1_1,
          })
        )
        const cmds = feeCommands(methodParameters.calldata)
        expect(cmds).to.have.length(1)
        expect(BigNumber.from(cmds[0].params[2].value).toString()).to.equal(BigNumber.from(10).pow(18).toString())
      })
    })

    describe('version gate is enum-based, not string ordering', () => {
      it('rejects an rc-style version string forced past the type system', async () => {
        const trade = buildTrade([await exactInputTrade()])
        // '2.1.1-rc.1' sorts >= '2.1.1' under numeric string comparison; the enum-based
        // gate must reject it as an unknown version instead.
        const rc = '2.1.1-rc.1' as UniversalRouterVersion

        // The v4 URVersion mapping rejects the unknown version before the multi-fee gate runs;
        // either way the encode must throw rather than treat the rc as >= 2.1.1.
        expect(() =>
          SwapRouter.swapCallParameters(trade, swapOptions({ fee: [FEE_A, FEE_B], urVersion: rc }))
        ).to.throw(/Multiple fee recipients require|No v4-sdk URVersion mapping/)
        expect(isAtLeastV2_1_1(rc)).to.be.false
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

      it('rejects a fractional-bips single fee on a pre-V2_1_1 router', async () => {
        const trade = buildTrade([await exactInputTrade()])
        const fees: FeeOptions[] = [{ fee: new Percent(1, 3), recipient: RECIPIENT_B }]

        expect(() =>
          SwapRouter.swapCallParameters(trade, swapOptions({ fee: fees, urVersion: UniversalRouterVersion.V2_0 }))
        ).to.throw('Fractional fee bips require Universal Router version V2_1_1 or higher')
      })

      it('rejects multiple recipients on a pre-V2_1_1 router even when every fee is whole bips', async () => {
        const trade = buildTrade([await exactInputTrade()])

        expect(() =>
          SwapRouter.swapCallParameters(
            trade,
            swapOptions({ fee: [FEE_A, FEE_B], urVersion: UniversalRouterVersion.V2_0 })
          )
        ).to.throw('Multiple fee recipients require Universal Router version V2_1_1 or higher')
      })
    })

    describe('version gate across the whole enum', () => {
      it('gates every enum member and undefined correctly', () => {
        expect(isAtLeastV2_1_1(UniversalRouterVersion.V1_2)).to.be.false
        expect(isAtLeastV2_1_1(UniversalRouterVersion.V2_0)).to.be.false
        expect(isAtLeastV2_1_1(UniversalRouterVersion.V2_1_1)).to.be.true
        expect(isAtLeastV2_1_1(UniversalRouterVersion.V2_2_0)).to.be.true
        expect(isAtLeastV2_1_1(undefined)).to.be.false
      })

      it('accepts multiple recipients on V2_2_0 with the same portions as V2_1_1', async () => {
        const trade = buildTrade([await exactInputTrade()])
        const v220 = SwapRouter.swapCallParameters(
          trade,
          swapOptions({ fee: [FEE_A, FEE_B], urVersion: UniversalRouterVersion.V2_2_0 })
        )
        const v211 = SwapRouter.swapCallParameters(
          trade,
          swapOptions({ fee: [FEE_A, FEE_B], urVersion: UniversalRouterVersion.V2_1_1 })
        )

        const portions = (calldata: string) =>
          feeCommands(calldata).map((cmd) => BigNumber.from(cmd.params[2].value).toString())
        expect(feeCommands(v220.calldata).map((cmd) => cmd.commandName)).to.deep.equal([
          'PAY_PORTION_FULL_PRECISION',
          'PAY_PORTION_FULL_PRECISION',
        ])
        expect(portions(v220.calldata)).to.deep.equal(portions(v211.calldata))
      })

      it('rejects multiple recipients on V1_2', async () => {
        // a V3 trade: V1_2 predates v4-sdk's URVersion, so a V4 trade would throw on the
        // version mapping before the fee gate is ever reached
        const trade = buildTrade([await ethOutExactInputTrade()])

        expect(() =>
          SwapRouter.swapCallParameters(
            trade,
            swapOptions({ fee: [FEE_A, FEE_B], urVersion: UniversalRouterVersion.V1_2 })
          )
        ).to.throw('Multiple fee recipients require Universal Router version V2_1_1 or higher')
      })
    })

    describe('zero-fee entries', () => {
      it('a 0% entry emits a zero-portion command for its recipient and leaves the others exact', async () => {
        const zeroFee: FeeOptions = { fee: new Percent(0, 10_000), recipient: RECIPIENT_B }
        const methodParameters = SwapRouter.swapCallParameters(
          buildTrade([await exactInputTrade()]),
          swapOptions({ fee: [FEE_A, zeroFee, FEE_C], urVersion: UniversalRouterVersion.V2_1_1 })
        )

        const cmds = feeCommands(methodParameters.calldata)
        expect(cmds).to.have.length(3)
        expect(BigNumber.from(cmds[1].params[2].value).isZero()).to.be.true
        expect((cmds[1].params[1].value as string).toLowerCase()).to.equal(RECIPIENT_B)
        // FEE_C is rescaled against a balance the zero entry did not shrink: 0.75% / (1 - 0.25%)
        expect(BigNumber.from(cmds[2].params[2].value).toString()).to.equal(
          BigNumber.from(10).pow(18).mul(75).div(9975).toString()
        )
      })
    })

    describe('duplicate recipients', () => {
      it('two entries for the same recipient each emit a command and together pay both fractions', async () => {
        const fees: FeeOptions[] = [FEE_A, { fee: new Percent(25, 10_000), recipient: RECIPIENT_A }]
        const trade = buildTrade([await exactOutputTrade()])
        const opts = swapOptions({ fee: fees, urVersion: UniversalRouterVersion.V2_1_1 })
        const methodParameters = SwapRouter.swapCallParameters(trade, opts)

        const cmds = feeCommands(methodParameters.calldata)
        expect(cmds).to.have.length(2)
        expect(cmds.map((cmd) => (cmd.params[1].value as string).toLowerCase())).to.deep.equal([
          RECIPIENT_A,
          RECIPIENT_A,
        ])

        // replay the cascade: the recipient's two payments must total 2 x 0.25% of gross (dust only)
        const gross = BigNumber.from(trade.minimumAmountOut(opts.slippageTolerance).quotient.toString())
        let balance = gross
        let totalPaid = BigNumber.from(0)
        for (const cmd of cmds) {
          const paid = balance.mul(BigNumber.from(cmd.params[2].value)).div(BigNumber.from(10).pow(18))
          balance = balance.sub(paid)
          totalPaid = totalPaid.add(paid)
        }
        const ideal = gross.mul(50).div(10_000)
        expect(ideal.sub(totalPaid).abs().lte(2)).to.be.true
      })
    })

    describe('ETH output: fees taken in WETH, settled by UNWRAP_WETH', () => {
      function unwrapFloor(calldata: string): BigNumber {
        const cmds = CommandParser.parseCalldata(calldata).commands.filter((cmd) => cmd.commandName === 'UNWRAP_WETH')
        expect(cmds, 'expected exactly one UNWRAP_WETH command').to.have.length(1)
        return BigNumber.from(cmds[0].params[1].value)
      }

      it('pays every fee in WETH and unwraps after the last fee command (exact input)', async () => {
        const methodParameters = SwapRouter.swapCallParameters(
          buildTrade([await ethOutExactInputTrade()]),
          swapOptions({ fee: [FEE_A, FEE_B, FEE_C], urVersion: UniversalRouterVersion.V2_1_1 })
        )

        const cmds = feeCommands(methodParameters.calldata)
        expect(cmds).to.have.length(3)
        for (const cmd of cmds) {
          expect((cmd.params[0].value as string).toLowerCase()).to.equal(WETH.address.toLowerCase())
        }

        const names = commandNames(methodParameters.calldata)
        expect(names).to.not.include('SWEEP')
        expect(names.indexOf('UNWRAP_WETH')).to.be.greaterThan(names.lastIndexOf('PAY_PORTION_FULL_PRECISION'))
      })

      it('derives the exact-output unwrap floor from the encoded cascade, like the sweep floor', async () => {
        const fees = [FEE_A, FEE_B, FEE_C, FEE_D]
        const trade = buildTrade([await ethOutExactOutputTrade()])
        const opts = swapOptions({ fee: fees, urVersion: UniversalRouterVersion.V2_1_1 })
        const methodParameters = SwapRouter.swapCallParameters(trade, opts)

        const gross = BigNumber.from(trade.minimumAmountOut(opts.slippageTolerance).quotient.toString())
        const expectedFloor = gross.sub(simulatePortionFeeDeduction(gross, scalePortionFees(fees), true))
        expect(unwrapFloor(methodParameters.calldata).toString()).to.equal(expectedFloor.toString())
      })
    })

    describe('transaction value', () => {
      it('multiple fee recipients do not change the ETH sent along for exact input', async () => {
        const methodParameters = SwapRouter.swapCallParameters(
          buildTrade([await exactInputTrade()]),
          swapOptions({ fee: [FEE_A, FEE_B, FEE_C, FEE_D], urVersion: UniversalRouterVersion.V2_1_1 })
        )

        expect(BigNumber.from(methodParameters.value).toString()).to.equal(utils.parseEther('1').toString())
      })

      it('exact-output value stays the maximum input for the swap, untouched by output-side fees', async () => {
        const trade = buildTrade([await exactOutputTrade()])
        const opts = swapOptions({ fee: [FEE_A, FEE_B, FEE_C, FEE_D], urVersion: UniversalRouterVersion.V2_1_1 })
        const methodParameters = SwapRouter.swapCallParameters(trade, opts)

        expect(BigNumber.from(methodParameters.value).toString()).to.equal(
          trade.maximumAmountIn(opts.slippageTolerance).quotient.toString()
        )
      })
    })
  })
})
