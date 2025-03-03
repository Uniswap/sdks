import { ChainId } from '@uniswap/sdk-core'

import { ModeType, SMART_WALLET_ADDRESSES } from './constants';
import { SmartWallet } from './smartWallet'
import { Call } from './types'

const EXECUTE_SELECTOR = "0xe9ae5c53";

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

      const result = SmartWallet.encodeCalls(calls)
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
      
      const result = SmartWallet.encodeCalls(calls, { revertOnFailure: true })
      expect(result).toBeDefined()
      expect(result.calldata).toBeDefined()
      expect(result.value).toBeDefined()
    })
  })

  describe('createExecute', () => {
    it('creates an execute call for specific chain', () => {
      const methodParams = {
        calldata: EXECUTE_SELECTOR,
        value: '0'
      }
      
      const call = SmartWallet.createExecute(methodParams, ChainId.MAINNET)
      
      // Verify the result
      expect(call).toBeDefined()
      expect(call.to).toBe(SMART_WALLET_ADDRESSES[ChainId.MAINNET])
      expect(call.data).toBe(EXECUTE_SELECTOR)
      expect(call.value).toBe('0')
    })
  })

  describe('getModeFromOptions', () => {
    for(const canRevert of [true, false]) {
      it(`returns the correct mode type for canRevert: ${canRevert}`, () => {
        if(canRevert) {
          expect(SmartWallet.getModeFromOptions({ revertOnFailure: canRevert })).toBe(ModeType.BATCHED_CALL_CAN_REVERT)
        } else {
          expect(SmartWallet.getModeFromOptions({ revertOnFailure: canRevert })).toBe(ModeType.BATCHED_CALL)
        }
      })
    }
  })
})
