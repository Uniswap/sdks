import { decodeAbiParameters } from 'viem'

import { BATCHED_CALL_ABI_PARAMS, BatchedCallPlanner } from './batchedCallPlanner'
import { CallPlanner } from './callPlanner'
import { TEST_ADDRESS_1, TEST_DATA_1, TEST_DATA_2, TEST_VALUE_1, TEST_VALUE_2 } from './testConstants'

describe('BatchedCallPlanner', () => {
  describe('constructor', () => {
    it('should initialize with the provided CallPlanner and default shouldRevert as false', () => {
      const callPlanner = new CallPlanner()
      const batchedPlanner = new BatchedCallPlanner(callPlanner)
      
      expect(batchedPlanner.callPlanner).toBe(callPlanner)
      expect(batchedPlanner.shouldRevert).toBe(false)
    })

    it('should initialize with the provided CallPlanner and shouldRevert value', () => {
      const callPlanner = new CallPlanner()
      const batchedPlanner = new BatchedCallPlanner(callPlanner, true)
      
      expect(batchedPlanner.callPlanner).toBe(callPlanner)
      expect(batchedPlanner.shouldRevert).toBe(true)
    })
  })

  describe('value', () => {
    it('should return the value from the underlying callPlanner', () => {
      const callPlanner = new CallPlanner([
        { to: TEST_ADDRESS_1, data: TEST_DATA_1, value: TEST_VALUE_1 },
        { to: TEST_ADDRESS_1, data: TEST_DATA_2, value: TEST_VALUE_2 }
      ])
      const batchedPlanner = new BatchedCallPlanner(callPlanner)
      
      expect(batchedPlanner.value.toString()).toBe('300')
    })

    it('should return 0 when no calls are present in the callPlanner', () => {
      const callPlanner = new CallPlanner()
      const batchedPlanner = new BatchedCallPlanner(callPlanner)
      
      expect(batchedPlanner.value.toString()).toBe('0')
    })
  })

  describe('add', () => {
    it('should add a new call to the underlying callPlanner', () => {
      const callPlanner = new CallPlanner()
      const batchedPlanner = new BatchedCallPlanner(callPlanner)
      
      batchedPlanner.add(TEST_ADDRESS_1, TEST_VALUE_1, TEST_DATA_1)
      
      expect(callPlanner.calls).toEqual([{ to: TEST_ADDRESS_1, data: TEST_DATA_1, value: TEST_VALUE_1 }])
    })

    it('should return the batchedPlanner instance for chaining', () => {
      const callPlanner = new CallPlanner()
      const batchedPlanner = new BatchedCallPlanner(callPlanner)
      
      const result = batchedPlanner.add(TEST_ADDRESS_1, TEST_VALUE_1, TEST_DATA_1)
      
      expect(result).toBe(batchedPlanner)
    })

    it('should allow chaining multiple add calls', () => {
      const callPlanner = new CallPlanner()
      const batchedPlanner = new BatchedCallPlanner(callPlanner)
      
      batchedPlanner
        .add(TEST_ADDRESS_1, TEST_VALUE_1, TEST_DATA_1)
        .add(TEST_ADDRESS_1, TEST_VALUE_2, TEST_DATA_2)
      
      expect(callPlanner.calls).toEqual([
        { to: TEST_ADDRESS_1, value: TEST_VALUE_1, data: TEST_DATA_1 },
        { to: TEST_ADDRESS_1, value: TEST_VALUE_2, data: TEST_DATA_2 }
      ])
    })
  })

  describe('encode', () => {
    it('should correctly abi encode the batch call with shouldRevert=false', () => {
      const callPlanner = new CallPlanner()
      callPlanner.add(TEST_ADDRESS_1, TEST_VALUE_1, TEST_DATA_1)
      
      const batchedPlanner = new BatchedCallPlanner(callPlanner, false)
      const encoded = batchedPlanner.encode()
      
      // decode the encoded data
      const decoded = decodeAbiParameters(BATCHED_CALL_ABI_PARAMS, encoded)
      expect(decoded).toEqual([{
        calls: [{ to: TEST_ADDRESS_1, value: TEST_VALUE_1, data: TEST_DATA_1 }],
        shouldRevert: false
      }])
    })

    it('should correctly abi encode the batch call with shouldRevert=true', () => {
      const callPlanner = new CallPlanner()
      callPlanner.add(TEST_ADDRESS_1, TEST_VALUE_1, TEST_DATA_1)
      
      const batchedPlanner = new BatchedCallPlanner(callPlanner, true)
      const encoded = batchedPlanner.encode()
      
      // decode the encoded data
      const decoded = decodeAbiParameters(BATCHED_CALL_ABI_PARAMS, encoded)
      expect(decoded).toEqual([{
        calls: [{ to: TEST_ADDRESS_1, value: TEST_VALUE_1, data: TEST_DATA_1 }],
        shouldRevert: true
      }])
    })

    it('should encode multiple calls correctly', () => {
      const callPlanner = new CallPlanner()
      callPlanner
        .add(TEST_ADDRESS_1, TEST_VALUE_1, TEST_DATA_1)
        .add(TEST_ADDRESS_1, TEST_VALUE_2, TEST_DATA_2)
      
      const batchedPlanner = new BatchedCallPlanner(callPlanner)
      const encoded = batchedPlanner.encode()
      
      // decode the encoded data
      const decoded = decodeAbiParameters(BATCHED_CALL_ABI_PARAMS, encoded)
      expect(decoded).toEqual([{
        calls: [
          { to: TEST_ADDRESS_1, value: TEST_VALUE_1, data: TEST_DATA_1 },
          { to: TEST_ADDRESS_1, value: TEST_VALUE_2, data: TEST_DATA_2 }
        ],
        shouldRevert: false
      }])
    })

    it('should encode an empty calls array', () => {
      const callPlanner = new CallPlanner()
      const batchedPlanner = new BatchedCallPlanner(callPlanner)
      const encoded = batchedPlanner.encode()
      
      // decode the encoded data
      const decoded = decodeAbiParameters(BATCHED_CALL_ABI_PARAMS, encoded)
      expect(decoded).toEqual([{
        calls: [],
        shouldRevert: false
      }])
    })
  })
})
