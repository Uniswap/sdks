import { ChainId } from '@uniswap/sdk-core'
import { decodeFunctionData } from 'viem';

import abi from "../abis/MinimalDelegationEntry.json"

import { ModeType, SMART_WALLET_ADDRESSES } from './constants';
import { SmartWallet } from './smartWallet'
import { BatchedCall, Call } from './types'

const EXECUTE_SELECTOR = "0xe9ae5c53" as `0x${string}`

describe('SmartWallet', () => {
  describe('encodeBatchedCall', () => {
    it('encodes batched call correctly', () => {
      const calls: Call[] = [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x1234',
          value: 0n,
          chainId: ChainId.SEPOLIA
        },
        {
          to: '0x2222222222222222222222222222222222222222',
          data: '0x5678',
          value: 1n,
          chainId: ChainId.SEPOLIA
        }
      ]

      const result = SmartWallet.encodeBatchedCall(calls, { shouldRevert: false })
      // decode the calldata
      const decoded = decodeFunctionData({
        abi,
        data: result.calldata
      })
      expect(decoded).toBeDefined()
      expect(decoded.functionName).toBe('execute')
      expect(decoded.args).toBeDefined()
      if(decoded.args) {
        expect(decoded.args.length).toBe(1)
        expect(decoded.args[0]).toBeDefined()
        expect((decoded.args[0] as BatchedCall).calls).toBeDefined()
        expect((decoded.args[0] as BatchedCall).calls.length).toBe(2)
        expect((decoded.args[0] as BatchedCall).shouldRevert).toBe(false)
      }
    })
  })

  describe('encodeERC7821BatchedCall', () => {
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

      const result = SmartWallet.encodeERC7821BatchedCall(calls)
      expect(result).toBeDefined()
      expect(result.calldata).toBeDefined()
      expect(result.value).toBeDefined()
    })

    it('encodes batch calls with shouldRevert option', () => {
      const calls: Call[] = [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x1234',
          value: 0n
        }
      ]
      
      const result = SmartWallet.encodeERC7821BatchedCall(calls, { shouldRevert: true })
      expect(result).toBeDefined()
      expect(result.calldata).toBeDefined()
      expect(result.value).toBeDefined()
    })

    it('throws an error if the mode is not supported', () => {
      // mock getModeFromOptions
      jest.spyOn(SmartWallet, 'getModeFromOptions').mockReturnValue('invalid' as ModeType)
      const calls: Call[] = [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x1234',
          value: 0n
        }
      ]
      expect(() => SmartWallet.encodeERC7821BatchedCall(calls)).toThrow()

      jest.restoreAllMocks()
    })
  })

  describe('createExecute', () => {
    it('creates an execute call for specific chain', () => {
      const methodParams = {
        calldata: EXECUTE_SELECTOR,
        value: 0n
      }
      
      const call = SmartWallet.createExecute(methodParams, ChainId.SEPOLIA)
      
      // Verify the result
      expect(call).toBeDefined()
      expect(call.to).toBe(SMART_WALLET_ADDRESSES[ChainId.SEPOLIA])
      expect(call.data).toBe(EXECUTE_SELECTOR)
      expect(call.value).toBe(0n)
    })
  })

  describe('getModeFromOptions', () => {
    for(const shouldRevert of [true, false]) {
      it(`returns the correct mode type for shouldRevert: ${shouldRevert}`, () => {
        if(shouldRevert) {
          expect(SmartWallet.getModeFromOptions({ shouldRevert })).toBe(ModeType.BATCHED_CALL)
        } else {
          expect(SmartWallet.getModeFromOptions({ shouldRevert })).toBe(ModeType.BATCHED_CALL_CAN_REVERT)
        }
      })
    }
  })
})
