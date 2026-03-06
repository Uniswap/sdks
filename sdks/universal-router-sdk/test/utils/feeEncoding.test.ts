import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { Percent } from '@uniswap/sdk-core'
import { encodeFeeBips, encodeFee1e18 } from '../../src/utils/numbers'
import { RoutePlanner, CommandType } from '../../src/utils/routerCommands'
import { CommandParser } from '../../src/utils/commandParser'
import { SwapRouter } from '../../src/swapRouter'

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
})
