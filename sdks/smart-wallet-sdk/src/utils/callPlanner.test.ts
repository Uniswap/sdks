import { CallPlanner } from './callPlanner'

// Test constants
const TEST_ADDRESS_1 = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const TEST_ADDRESS_2 = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
const TEST_DATA_1 = '0x123456'
const TEST_DATA_2 = '0xabcdef0123456789'
const TEST_VALUE_1 = '100'
const TEST_VALUE_2 = '200'

describe('CallPlanner', () => {
  describe('constructor', () => {
    it('should initialize with an empty array of calls', () => {
      const planner = new CallPlanner()
      expect(planner.calls).toEqual([])
    })

    it('should initialize with a provided array of calls', () => {
      const calls = [
        { to: TEST_ADDRESS_1, data: TEST_DATA_1, value: TEST_VALUE_1 },
        { to: TEST_ADDRESS_2, data: TEST_DATA_2, value: TEST_VALUE_2 }
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
        { to: TEST_ADDRESS_2, data: TEST_DATA_2, value: TEST_VALUE_2 }
      ])
      expect(planner.value.toString()).toBe('300')
    })

    it('should handle undefined values as 0', () => {
      const planner = new CallPlanner([
        { to: TEST_ADDRESS_1, data: TEST_DATA_1, value: TEST_VALUE_1 },
        { to: TEST_ADDRESS_2, data: TEST_DATA_2, value: undefined as unknown as string }
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
      expect(encoded).toBe("0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000031234560000000000000000000000000000000000000000000000000000000000")
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

    it('should return the planner instance for chaining', () => {
      const planner = new CallPlanner()
      const result = planner.add(TEST_ADDRESS_1, TEST_DATA_1, TEST_VALUE_1)
      expect(result).toBe(planner)
    })

    it('should allow chaining multiple add calls', () => {
      const planner = new CallPlanner()
      planner
        .add(TEST_ADDRESS_1, TEST_DATA_1, TEST_VALUE_1)
        .add(TEST_ADDRESS_2, TEST_DATA_2, TEST_VALUE_2)
      
      expect(planner.calls).toEqual([
        { to: TEST_ADDRESS_1, data: TEST_DATA_1, value: TEST_VALUE_1 },
        { to: TEST_ADDRESS_2, data: TEST_DATA_2, value: TEST_VALUE_2 }
      ])
    })
  })
})
