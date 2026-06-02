import { ChainId } from '@uniswap/sdk-core'
import { decodeAbiParameters, decodeFunctionData } from 'viem'

import abi from '../abis/MinimalDelegationEntry.json'

import { ModeType, SMART_WALLET_ADDRESSES } from './constants'
import { SmartWallet } from './smartWallet'
import { BatchedCall, Call } from './types'
import { BATCHED_CALL_ABI_PARAMS } from './utils/batchedCallPlanner'

const EXECUTE_SELECTOR = '0xe9ae5c53' as `0x${string}`
const EXECUTE_USER_OP_SELECTOR = '0x8dd7712f' as `0x${string}`

function decodeUserOpCalldata(calldata: `0x${string}`): BatchedCall {
  const argsData = `0x${calldata.slice(10)}` as `0x${string}` // slice out executeUserOp selector to get encoded data
  const decoded = decodeAbiParameters(BATCHED_CALL_ABI_PARAMS, argsData)
  return decoded[0] as BatchedCall
}

describe('SmartWallet', () => {
  describe('encodeUserOp', () => {
    it('encodes a single call with correct selector and call fields', () => {
      const calls: Call[] = [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x1234',
          value: 0n,
        },
      ]

      const result = SmartWallet.encodeUserOp(calls)

      expect(result.calldata.startsWith(EXECUTE_USER_OP_SELECTOR)).toBe(true)
      expect(result.value).toBe(0n)

      const decoded = decodeUserOpCalldata(result.calldata)
      expect(decoded.calls.length).toBe(1)
      expect(decoded.calls[0].to.toLowerCase()).toBe(calls[0].to.toLowerCase())
      expect(decoded.calls[0].data).toBe(calls[0].data)
      expect(decoded.calls[0].value).toBe(0n)
      expect(decoded.revertOnFailure).toBe(true)
    })

    it('encodes multiple calls and sums values', () => {
      const calls: Call[] = [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x1234',
          value: 100n,
        },
        {
          to: '0x2222222222222222222222222222222222222222',
          data: '0x5678',
          value: 200n,
        },
      ]

      const result = SmartWallet.encodeUserOp(calls)

      expect(result.value).toBe(300n)

      const decoded = decodeUserOpCalldata(result.calldata)
      expect(decoded.calls.length).toBe(2)
      for (let i = 0; i < calls.length; i++) {
        expect(decoded.calls[i].to.toLowerCase()).toBe(calls[i].to.toLowerCase())
        expect(decoded.calls[i].data).toBe(calls[i].data)
        expect(decoded.calls[i].value).toBe(calls[i].value)
      }
    })

    it('encodes revertOnFailure: false', () => {
      const calls: Call[] = [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x1234',
          value: 0n,
        },
      ]

      const result = SmartWallet.encodeUserOp(calls, { revertOnFailure: false })

      const decoded = decodeUserOpCalldata(result.calldata)
      expect(decoded.revertOnFailure).toBe(false)
    })

    it('excludes chainId from the encoded calldata', () => {
      const calls: Call[] = [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x1234',
          value: 50n,
          chainId: ChainId.SEPOLIA,
        },
      ]
      const callsWithoutChainId: Call[] = [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x1234',
          value: 50n,
        },
      ]

      const withChainId = SmartWallet.encodeUserOp(calls)
      const withoutChainId = SmartWallet.encodeUserOp(callsWithoutChainId)

      expect(withChainId.calldata).toBe(withoutChainId.calldata)
      expect(withChainId.value).toBe(50n)
    })
  })

  describe('encodeBatchedCall', () => {
    it('encodes batched call correctly', () => {
      const calls: Call[] = [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x1234',
          value: 0n,
          chainId: ChainId.SEPOLIA,
        },
        {
          to: '0x2222222222222222222222222222222222222222',
          data: '0x5678',
          value: 1n,
          chainId: ChainId.SEPOLIA,
        },
      ]

      const result = SmartWallet.encodeBatchedCall(calls, { revertOnFailure: false })
      // decode the calldata
      const decoded = decodeFunctionData({
        abi,
        data: result.calldata,
      })
      expect(decoded).toBeDefined()
      expect(decoded.functionName).toBe('execute')
      expect(decoded.args).toBeDefined()
      if (decoded.args) {
        expect(decoded.args.length).toBe(1)
        expect(decoded.args[0]).toBeDefined()
        expect((decoded.args[0] as BatchedCall).calls).toBeDefined()
        expect((decoded.args[0] as BatchedCall).calls.length).toBe(2)
        expect((decoded.args[0] as BatchedCall).revertOnFailure).toBe(false)
      }
    })
  })

  describe('encodeERC7821BatchedCall', () => {
    it('encodes batch calls correctly', () => {
      const calls: Call[] = [
        {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x1234',
          value: 0n,
        },
        {
          to: '0x2222222222222222222222222222222222222222',
          data: '0x5678',
          value: 1n,
        },
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
          value: 0n,
        },
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
          value: 0n,
        },
      ]
      expect(() => SmartWallet.encodeERC7821BatchedCall(calls)).toThrow()

      jest.restoreAllMocks()
    })
  })

  describe('createExecute', () => {
    it('creates an execute call for specific chain', () => {
      const methodParams = {
        calldata: EXECUTE_SELECTOR,
        value: 0n,
      }

      const call = SmartWallet.createExecute(methodParams, ChainId.SEPOLIA)

      // Verify the result
      expect(call).toBeDefined()
      expect(call.to).toBe(SMART_WALLET_ADDRESSES[ChainId.SEPOLIA])
      expect(call.data).toBe(EXECUTE_SELECTOR)
      expect(call.value).toBe(0n)
    })

    it('throws when chainId is a dangerous string like __proto__', () => {
      const methodParams = {
        calldata: EXECUTE_SELECTOR,
        value: 0n,
      }
      expect(() => SmartWallet.createExecute(methodParams, '__proto__' as unknown as ChainId)).toThrow(
        /Smart wallet not found for chainId: __proto__/i
      )
    })

    it('throws when chainId is the string "constructor"', () => {
      const methodParams = {
        calldata: EXECUTE_SELECTOR,
        value: 0n,
      }
      expect(() => SmartWallet.createExecute(methodParams, 'constructor' as unknown as ChainId)).toThrow(
        /Smart wallet not found for chainId: constructor/i
      )
    })

    it('throws for non-numeric random string chainId', () => {
      const methodParams = {
        calldata: EXECUTE_SELECTOR,
        value: 0n,
      }
      expect(() => SmartWallet.createExecute(methodParams, 'forty-two' as unknown as ChainId)).toThrow(
        /Smart wallet not found for chainId: forty-two/i
      )
    })

    it('throws for unsupported numeric chainId', () => {
      const methodParams = {
        calldata: EXECUTE_SELECTOR,
        value: 0n,
      }
      // 1337 is intentionally not present in SMART_WALLET_ADDRESSES
      expect(() => SmartWallet.createExecute(methodParams, 1337 as ChainId)).toThrow(
        /Smart wallet not found for chainId: 1337/i
      )
    })
  })

  describe('getModeFromOptions', () => {
    for (const revertOnFailure of [true, false]) {
      it(`returns the correct mode type for revertOnFailure: ${revertOnFailure}`, () => {
        if (revertOnFailure) {
          expect(SmartWallet.getModeFromOptions({ revertOnFailure })).toBe(ModeType.BATCHED_CALL)
        } else {
          expect(SmartWallet.getModeFromOptions({ revertOnFailure })).toBe(ModeType.BATCHED_CALL_CAN_REVERT)
        }
      })
    }
  })
})
