import { zeroAddress } from 'viem'

import { CallPlanner } from './callPlanner'


// Test constants
const TEST_ADDRESS_1 = zeroAddress
const TEST_DATA_1 = '0x123456' as `0x${string}`
const TEST_DATA_2 = '0xabcdef0123456789' as `0x${string}`
const TEST_VALUE_1 = 100n
const TEST_VALUE_2 = 200n

describe('CallPlanner', () => {
  describe('constructor', () => {
    it('should initialize with an empty array of calls', () => {
      const planner = new CallPlanner()
      expect(planner.calls).toEqual([])
    })

    it('should initialize with a provided array of calls', () => {
      const calls = [
        { to: TEST_ADDRESS_1, data: TEST_DATA_1, value: TEST_VALUE_1 },
        { to: TEST_ADDRESS_1, data: TEST_DATA_2, value: TEST_VALUE_2 }
      ]
      const planner = new CallPlanner(calls)
      expect(planner.calls).toEqual(calls)
    })
  })

  describe('value', () => {
    it('should return 0 when no calls are present', () => {
      const planner = new CallPlanner()
      expect(planner.value.toString()).toBe('0')
    })

    it('should sum the values of all calls', () => {
      const planner = new CallPlanner([
        { to: TEST_ADDRESS_1, data: TEST_DATA_1, value: TEST_VALUE_1 },
        { to: TEST_ADDRESS_1, data: TEST_DATA_2, value: TEST_VALUE_2 }
      ])
      expect(planner.value.toString()).toBe('300')
    })

    it('should handle undefined values as 0', () => {
      const planner = new CallPlanner([
        { to: TEST_ADDRESS_1, data: TEST_DATA_1, value: TEST_VALUE_1 },
        { to: TEST_ADDRESS_1, data: TEST_DATA_2, value: undefined as unknown as bigint }
      ])
      expect(planner.value.toString()).toBe('100')
    })
  })

  describe('encode', () => {
    it('should correctly abi encode the calls', () => {
      const planner = new CallPlanner([
        { to: TEST_ADDRESS_1, data: TEST_DATA_1, value: TEST_VALUE_1 }
      ])
      
      const encoded = planner.encode()
      // We're just checking that it returns a hex string and doesn't throw
      expect(encoded).toMatch(/^0x/)
      expect(typeof encoded).toBe('string')
    })

    it('should throw an error if there are no calls to encode', () => {
      const planner = new CallPlanner()
      expect(() => planner.encode()).toThrow("No calls to encode")
    })
  })

  describe('add', () => {
    it('should add a new call to the calls array', () => {
      const planner = new CallPlanner()
      planner.add(TEST_ADDRESS_1, TEST_DATA_1, TEST_VALUE_1)
      expect(planner.calls).toEqual([{ to: TEST_ADDRESS_1, data: TEST_DATA_1, value: TEST_VALUE_1 }])
    })

    it('should add a new call with bigint value', () => {
      const planner = new CallPlanner()
      planner.add(TEST_ADDRESS_1, TEST_DATA_1, 100n)
      expect(planner.calls).toEqual([{ to: TEST_ADDRESS_1, data: TEST_DATA_1, value: 100n }])
    })

    it('should return the planner instance for chaining', () => {
      const planner = new CallPlanner()
      const result = planner.add(TEST_ADDRESS_1, TEST_DATA_1, TEST_VALUE_1)
      expect(result).toBe(planner)
    })

    it('should allow chaining multiple add calls', () => {
      const planner = new CallPlanner()
      planner
        .add(TEST_ADDRESS_1, TEST_DATA_1, TEST_VALUE_1)
        .add(TEST_ADDRESS_1, TEST_DATA_2, TEST_VALUE_2)
      
      expect(planner.calls).toEqual([
        { to: TEST_ADDRESS_1, data: TEST_DATA_1, value: TEST_VALUE_1 },
        { to: TEST_ADDRESS_1, data: TEST_DATA_2, value: TEST_VALUE_2 }
      ])
    })
  })
})
