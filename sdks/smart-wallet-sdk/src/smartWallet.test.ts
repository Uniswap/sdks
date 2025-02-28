import { ChainId } from '@uniswap/sdk-core'
import { SmartWallet } from './smartWallet'
import { CallPlanner } from './utils/callPlanner'
import { Call, AdvancedCall } from './types'

describe('SmartWallet', () => {
  describe('encode', () => {
    it('encodes batch calls correctly', () => {
      const calls: Call[] = [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x1234',
          value: '0x0'
        },
        {
          to: '0x2222222222222222222222222222222222222222',
          data: '0x5678',
          value: '0x1'
        }
      ]

      const result = SmartWallet.encode(calls, ChainId.MAINNET)
      expect(result).toBeDefined()
      expect(result.calldata).toBeDefined()
      expect(result.value).toBeDefined()
    })
  })

  describe('encodeAdvanced', () => {
    it('encodes advanced calls with partial failure options', () => {
      const calls: AdvancedCall[] = [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x1234',
          value: '0x0',
          revertOnFailure: true
        },
        {
          to: '0x2222222222222222222222222222222222222222',
          data: '0x5678',
          value: '0x1',
          revertOnFailure: false
        }
      ]

      const result = SmartWallet.encodeAdvanced(calls, ChainId.MAINNET)
      expect(result).toBeDefined()
      expect(result.calldata).toBeDefined()
      expect(result.value).toBeDefined()
    })
  })

  describe('encodePlan', () => {
    it('encodes a plan correctly', () => {
      const planner = SmartWallet.createCallPlan()
      const result = SmartWallet.encodePlan(planner, '0x10', ChainId.MAINNET)
      
      expect(result).toBeDefined()
      expect(result.calldata).toBeDefined()
      expect(result.value).toBe('0x10')
    })
  })

  describe('createCallPlan', () => {
    it('creates a new call plan', () => {
      const planner = SmartWallet.createCallPlan()
      expect(planner).toBeInstanceOf(CallPlanner)
    })
  })

  describe('createAuthorize', () => {
    it('creates an authorize call', () => {
      const operator = '0x1111111111111111111111111111111111111111'
      const call = SmartWallet.createAuthorize(operator, ChainId.MAINNET)
      
      expect(call).toBeDefined()
      expect(call.to).toBeDefined()
      expect(call.data).toBeDefined()
      expect(call.value).toBe('0x0')
    })
  })

  describe('createRevoke', () => {
    it('creates a revoke call', () => {
      const operator = '0x1111111111111111111111111111111111111111'
      const call = SmartWallet.createRevoke(operator, ChainId.MAINNET)
      
      expect(call).toBeDefined()
      expect(call.to).toBeDefined()
      expect(call.data).toBeDefined()
      expect(call.value).toBe('0x0')
    })
  })

  describe('createExecute', () => {
    it('creates an execute call', () => {
      const innerCall: Call = {
        to: '0x1111111111111111111111111111111111111111',
        data: '0x1234',
        value: '0x0'
      }
      
      const call = SmartWallet.createExecute(innerCall, {}, ChainId.MAINNET)
      
      expect(call).toBeDefined()
      expect(call.to).toBeDefined()
      expect(call.data).toBeDefined()
      expect(call.value).toBe('0x0')
    })

    it('creates an execute call with revertOnFailure option', () => {
      const innerCall: Call = {
        to: '0x1111111111111111111111111111111111111111',
        data: '0x1234',
        value: '0x0'
      }
      
      const call = SmartWallet.createExecute(innerCall, { revertOnFailure: false }, ChainId.MAINNET)
      
      expect(call).toBeDefined()
      expect(call.to).toBeDefined()
      expect(call.data).toBeDefined()
      expect(call.value).toBe('0x0')
    })
  })
})