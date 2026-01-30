import { expect } from 'chai'
import { BigNumber } from 'ethers'
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
})
