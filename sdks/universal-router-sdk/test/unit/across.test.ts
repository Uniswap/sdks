import { expect } from 'chai'
import { BigNumber, utils } from 'ethers'
import { AcrossV4DepositV3Params, CONTRACT_BALANCE } from '../../src/entities/actions/across'
import { RoutePlanner, CommandType } from '../../src/utils/routerCommands'

describe('Across Bridge Integration', () => {
  const WETH_MAINNET = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  const WETH_OPTIMISM = '0x4200000000000000000000000000000000000006'
  const USDC_MAINNET = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

  describe('RoutePlanner.addAcrossBridge', () => {
    it('should add bridge command to planner', () => {
      const planner = new RoutePlanner()

      const params: AcrossV4DepositV3Params = {
        depositor: '0x0000000000000000000000000000000000000001',
        recipient: '0x0000000000000000000000000000000000000001',
        inputToken: WETH_MAINNET,
        outputToken: WETH_OPTIMISM,
        inputAmount: BigNumber.from('1000000000000000000'), // 1 WETH
        outputAmount: BigNumber.from('990000000000000000'), // 0.99 WETH
        destinationChainId: 10, // Optimism
        exclusiveRelayer: '0x0000000000000000000000000000000000000000',
        quoteTimestamp: Math.floor(Date.now() / 1000),
        fillDeadline: Math.floor(Date.now() / 1000) + 3600,
        exclusivityDeadline: 0,
        message: '0x',
        useNative: false,
      }

      planner.addAcrossBridge(params)

      // Check that the command was added
      expect(planner.commands).to.include('40') // ACROSS_V4_DEPOSIT_V3 command = 0x40
      expect(planner.inputs.length).to.equal(1)
    })

    it('should encode swap + bridge with CONTRACT_BALANCE', () => {
      const planner = new RoutePlanner()

      // Simulate adding a swap command first (just for testing)
      planner.addCommand(CommandType.WRAP_ETH, [
        '0x0000000000000000000000000000000000000002', // recipient
        BigNumber.from('1000000000000000000'), // amount
      ])

      // Add bridge that uses CONTRACT_BALANCE
      const params: AcrossV4DepositV3Params = {
        depositor: '0x0000000000000000000000000000000000000001',
        recipient: '0x0000000000000000000000000000000000000001',
        inputToken: WETH_MAINNET,
        outputToken: WETH_OPTIMISM,
        inputAmount: CONTRACT_BALANCE, // Use entire contract balance
        outputAmount: BigNumber.from('990000000000000000'),
        destinationChainId: 10,
        exclusiveRelayer: '0x0000000000000000000000000000000000000000',
        quoteTimestamp: Math.floor(Date.now() / 1000),
        fillDeadline: Math.floor(Date.now() / 1000) + 3600,
        exclusivityDeadline: 0,
        message: '0x',
        useNative: false,
      }

      planner.addAcrossBridge(params)

      // Should have 2 commands: wrap + bridge
      expect(planner.commands).to.equal('0x0b40') // 0x0b = WRAP_ETH, 0x40 = ACROSS_V4_DEPOSIT_V3
      expect(planner.inputs.length).to.equal(2)
    })

    it('should support native ETH bridging with useNative flag', () => {
      const planner = new RoutePlanner()

      const params: AcrossV4DepositV3Params = {
        depositor: '0x0000000000000000000000000000000000000001',
        recipient: '0x0000000000000000000000000000000000000001',
        inputToken: WETH_MAINNET, // Must be WETH when useNative is true
        outputToken: WETH_OPTIMISM,
        inputAmount: BigNumber.from('1000000000000000000'),
        outputAmount: BigNumber.from('990000000000000000'),
        destinationChainId: 10,
        exclusiveRelayer: '0x0000000000000000000000000000000000000000',
        quoteTimestamp: Math.floor(Date.now() / 1000),
        fillDeadline: Math.floor(Date.now() / 1000) + 3600,
        exclusivityDeadline: 0,
        message: '0x',
        useNative: true, // Bridge native ETH
      }

      planner.addAcrossBridge(params)

      expect(planner.commands).to.include('40')
      expect(planner.inputs.length).to.equal(1)
    })
  })

  describe('SwapRouter integration with bridging', () => {
    it('should encode bridge commands with RoutePlanner', () => {
      // Test that bridge parameters are properly encoded in RoutePlanner
      const planner = new RoutePlanner()

      // Add a simple swap simulation first
      planner.addCommand(CommandType.WRAP_ETH, [
        '0x0000000000000000000000000000000000000002',
        BigNumber.from('1000000000000000000'),
      ])

      const bridgeParams: AcrossV4DepositV3Params = {
        depositor: '0x0000000000000000000000000000000000000001',
        recipient: '0x0000000000000000000000000000000000000001',
        inputToken: WETH_MAINNET,
        outputToken: WETH_OPTIMISM,
        inputAmount: CONTRACT_BALANCE,
        outputAmount: BigNumber.from('990000000000000000'),
        destinationChainId: 10,
        exclusiveRelayer: '0x0000000000000000000000000000000000000000',
        quoteTimestamp: Math.floor(Date.now() / 1000),
        fillDeadline: Math.floor(Date.now() / 1000) + 3600,
        exclusivityDeadline: 0,
        message: '0x',
        useNative: false,
      }

      planner.addAcrossBridge(bridgeParams)

      // Verify planner has both commands
      expect(planner.commands).to.equal('0x0b40') // 0x0b = WRAP_ETH, 0x40 = ACROSS_V4_DEPOSIT_V3
      expect(planner.inputs.length).to.equal(2)

      // Verify the bridge command input is properly encoded
      const bridgeInput = planner.inputs[1]
      expect(bridgeInput).to.be.a('string')
      expect(bridgeInput).to.match(/^0x[0-9a-f]+$/)
    })

    it('should support multiple bridges', () => {
      const planner = new RoutePlanner()

      const bridge1: AcrossV4DepositV3Params = {
        depositor: '0x0000000000000000000000000000000000000001',
        recipient: '0x0000000000000000000000000000000000000001',
        inputToken: WETH_MAINNET,
        outputToken: WETH_OPTIMISM,
        inputAmount: BigNumber.from('500000000000000000'),
        outputAmount: BigNumber.from('495000000000000000'),
        destinationChainId: 10,
        exclusiveRelayer: '0x0000000000000000000000000000000000000000',
        quoteTimestamp: Math.floor(Date.now() / 1000),
        fillDeadline: Math.floor(Date.now() / 1000) + 3600,
        exclusivityDeadline: 0,
        message: '0x',
        useNative: false,
      }

      const bridge2: AcrossV4DepositV3Params = {
        depositor: '0x0000000000000000000000000000000000000001',
        recipient: '0x0000000000000000000000000000000000000001',
        inputToken: USDC_MAINNET,
        outputToken: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', // USDC on Optimism
        inputAmount: BigNumber.from('500000000'), // 500 USDC
        outputAmount: BigNumber.from('495000000'), // 495 USDC
        destinationChainId: 10,
        exclusiveRelayer: '0x0000000000000000000000000000000000000000',
        quoteTimestamp: Math.floor(Date.now() / 1000),
        fillDeadline: Math.floor(Date.now() / 1000) + 3600,
        exclusivityDeadline: 0,
        message: '0x',
        useNative: false,
      }

      planner.addAcrossBridge(bridge1)
      planner.addAcrossBridge(bridge2)

      // Verify both bridge commands were added
      expect(planner.commands).to.equal('0x4040') // Two ACROSS_V4_DEPOSIT_V3 commands
      expect(planner.inputs.length).to.equal(2)
    })
  })
  describe('command input encoding matches the contract decoder', () => {
    // ChainedActions.sol reads the command input with
    // `abi.decode(input, (AcrossV4DepositV3Params))` — a SINGLE tuple with a
    // dynamic member (`bytes message`), so the encoding must be
    // offset-prefixed. A flat 13-value encoding of the same fields does not
    // decode (the dispatcher reverts with empty data). This decode mirrors
    // the contract exactly and is the regression test for that bug.
    const ACROSS_V4_DEPOSIT_V3_TUPLE =
      'tuple(address depositor,address recipient,address inputToken,address outputToken,uint256 inputAmount,uint256 outputAmount,uint256 destinationChainId,address exclusiveRelayer,uint32 quoteTimestamp,uint32 fillDeadline,uint32 exclusivityDeadline,bytes message,bool useNative)'

    const params: AcrossV4DepositV3Params = {
      depositor: '0x0000000000000000000000000000000000000001',
      recipient: '0x0000000000000000000000000000000000000002',
      inputToken: WETH_MAINNET,
      outputToken: WETH_OPTIMISM,
      inputAmount: CONTRACT_BALANCE,
      outputAmount: BigNumber.from('990000000000000000'),
      destinationChainId: 10,
      exclusiveRelayer: '0x0000000000000000000000000000000000000000',
      quoteTimestamp: 1700000000,
      fillDeadline: 1700003600,
      exclusivityDeadline: 0,
      message: '0x1234',
      useNative: false,
    }

    it('decodes with abi.decode(input, (AcrossV4DepositV3Params)) semantics', () => {
      const planner = new RoutePlanner()
      planner.addAcrossBridge(params)

      const [decoded] = utils.defaultAbiCoder.decode([ACROSS_V4_DEPOSIT_V3_TUPLE], planner.inputs[0])

      expect(decoded.depositor).to.equal(params.depositor)
      expect(decoded.recipient).to.equal(params.recipient)
      expect(decoded.inputToken).to.equal(params.inputToken)
      expect(decoded.outputToken).to.equal(params.outputToken)
      expect(decoded.inputAmount.toString()).to.equal(CONTRACT_BALANCE.toString())
      expect(decoded.outputAmount.toString()).to.equal('990000000000000000')
      expect(decoded.destinationChainId.toNumber()).to.equal(10)
      expect(decoded.exclusiveRelayer).to.equal(params.exclusiveRelayer)
      expect(decoded.quoteTimestamp).to.equal(params.quoteTimestamp)
      expect(decoded.fillDeadline).to.equal(params.fillDeadline)
      expect(decoded.exclusivityDeadline).to.equal(params.exclusivityDeadline)
      expect(decoded.message).to.equal(params.message)
      expect(decoded.useNative).to.equal(params.useNative)
    })

    it('is offset-prefixed (single dynamic tuple), not a flat parameter list', () => {
      const planner = new RoutePlanner()
      planner.addAcrossBridge(params)

      // Word 0 of a single dynamic-tuple encoding is the offset to the tuple
      // body (0x20). The old flat encoding put the depositor address here.
      const word0 = utils.hexDataSlice(planner.inputs[0], 0, 32)
      expect(BigNumber.from(word0).toNumber()).to.equal(32)
    })
  })
})
