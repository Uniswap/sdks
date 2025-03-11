import { ChainId } from '@uniswap/sdk-core'

import { ModeType, SMART_WALLET_ADDRESSES } from './constants';
import { SmartWallet } from './smartWallet'
import { Call } from './types'

const EXECUTE_SELECTOR = "0xe9ae5c53" as `0x${string}`

describe('SmartWallet', () => {
  describe('encodeExecute', () => {
    it('encodes batch calls correctly', () => {
      const calls: Call[] = [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x1234',
          value: 0n
        },
        {
          to: '0x2222222222222222222222222222222222222222',
          data: '0x5678',
          value: 1n
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
          value: 0n
        }
      ]
      
      const result = SmartWallet.encodeCalls(calls, { revertOnFailure: true })
      expect(result).toBeDefined()
      expect(result.calldata).toBeDefined()
      expect(result.value).toBeDefined()
    })

    it('throws an error if the mode is not supported', () => {
      // mock getModeFromOptions
      jest.spyOn(SmartWallet, 'getModeFromOptions').mockReturnValue(ModeType.BATCHED_CALL_SUPPORTS_OPDATA)
      const calls: Call[] = [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x1234',
          value: 0n
        }
      ]
      expect(() => SmartWallet.encodeCalls(calls)).toThrow()

      jest.restoreAllMocks()
    })
  })

  describe('createExecute', () => {
    it('creates an execute call for specific chain', () => {
      const methodParams = {
        calldata: EXECUTE_SELECTOR,
        value: 0n
      }
      
      const call = SmartWallet.createExecute(methodParams, ChainId.MAINNET)
      
      // Verify the result
      expect(call).toBeDefined()
      expect(call.to).toBe(SMART_WALLET_ADDRESSES[ChainId.MAINNET])
      expect(call.data).toBe(EXECUTE_SELECTOR)
      expect(call.value).toBe(0n)
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
