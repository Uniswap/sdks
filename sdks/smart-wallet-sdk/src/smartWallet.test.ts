import { ChainId } from '@uniswap/sdk-core'
import { concatHex, decodeAbiParameters, decodeFunctionData, encodeAbiParameters } from 'viem';

import abi from "../abis/MinimalDelegationEntry.json"

import { EXECUTE_USER_OP_SELECTOR, ModeType, SMART_WALLET_ADDRESSES } from './constants';
import { SmartWallet } from './smartWallet'
import { BatchedCall, Call } from './types'
import { BATCHED_CALL_ABI_PARAMS } from './utils/batchedCallPlanner';

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

      const result = SmartWallet.encodeBatchedCall(calls, { revertOnFailure: false })
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
        expect((decoded.args[0] as BatchedCall).revertOnFailure).toBe(false)
      }
    })
  })

  describe('encodeBatchedCallUserOp', () => {
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

      const result = SmartWallet.encodeBatchedCallUserOp(calls, { revertOnFailure: false })
      expect(result).toBeDefined()
      expect(result.calldata).toBeDefined()
      // expect first 4 bytes to be the selector
      expect(result.calldata.slice(0, 10)).toBe(EXECUTE_USER_OP_SELECTOR)
      // decode the rest to be batchedCall
      const decoded = decodeAbiParameters(BATCHED_CALL_ABI_PARAMS, `0x${result.calldata.slice(10)}`)
      expect(decoded).toBeDefined()
      expect(decoded.length).toBe(1)
      expect(decoded[0]).toBeDefined()
      if(decoded[0]) {
        expect(decoded[0].calls).toBeDefined()
        expect(decoded[0].calls.length).toBe(2)
        expect(decoded[0].revertOnFailure).toBe(false)
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

    it('encodes batch calls with revertOnFailure option', () => {
      const calls: Call[] = [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x1234',
          value: 0n
        }
      ]
      
      const result = SmartWallet.encodeERC7821BatchedCall(calls, { revertOnFailure: true })
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
    for(const revertOnFailure of [true, false]) {
      it(`returns the correct mode type for revertOnFailure: ${revertOnFailure}`, () => {
        if(revertOnFailure) {
          expect(SmartWallet.getModeFromOptions({ revertOnFailure })).toBe(ModeType.BATCHED_CALL)
        } else {
          expect(SmartWallet.getModeFromOptions({ revertOnFailure })).toBe(ModeType.BATCHED_CALL_CAN_REVERT)
        }
      })
    }
  })
})
