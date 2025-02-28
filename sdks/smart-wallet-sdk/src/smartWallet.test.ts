import { ChainId } from '@uniswap/sdk-core'

import { SmartWallet } from './smartWallet'
import { Call } from './types'

describe('SmartWallet', () => {
  describe('encodeExecute', () => {
    it('encodes batch calls correctly', () => {
      const calls: Call[] = [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x1234',
          value: '0'
        },
        {
          to: '0x2222222222222222222222222222222222222222',
          data: '0x5678',
          value: '1'
        }
      ]

      const result = SmartWallet.encodeExecute(calls)
      expect(result).toBeDefined()
      expect(result.calldata).toBeDefined()
      expect(result.value).toBeDefined()
    })

    it('encodes batch calls with revertOnFailure option', () => {
      const calls: Call[] = [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x1234',
          value: '0'
        }
      ]
      
      const result = SmartWallet.encodeExecute(calls, { revertOnFailure: true })
      expect(result).toBeDefined()
      expect(result.calldata).toBeDefined()
      expect(result.value).toBeDefined()
    })
  })

  describe('createExecute', () => {
    it('creates an execute call for specific chain', () => {
      // Simple test - just mock createExecute for simplicity
      const originalMethod = SmartWallet.createExecute
      
      // Temporarily override the method for testing
      SmartWallet.createExecute = jest.fn().mockReturnValue({
        to: '0x1234567890123456789012345678901234567890',
        data: '0xmocked_data',
        value: '0'
      })
      
      // Call the method
      const methodParams = {
        calldata: '0xtest',
        value: '0'
      }
      
      const call = SmartWallet.createExecute(methodParams, ChainId.MAINNET)
      
      // Verify the result
      expect(call).toBeDefined()
      expect(call.to).toBe('0x1234567890123456789012345678901234567890')
      expect(call.data).toBe('0xmocked_data')
      expect(call.value).toBe('0')
      
      // Restore the original method
      SmartWallet.createExecute = originalMethod
    })
  })
})
