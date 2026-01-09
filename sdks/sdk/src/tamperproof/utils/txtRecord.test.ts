import { vi } from 'vitest'
import { parseTxtRecord, processTxtRecordData } from './txtRecord'

describe('txtRecord utils', () => {
  describe('parseTxtRecord', () => {
    it('should parse single string TXT record', () => {
      // Create buffer with single string: "hello"
      const buffer = Buffer.concat([
        Buffer.from([5]), // length
        Buffer.from('hello'), // data
      ])

      const result = parseTxtRecord(buffer)
      expect(result).toBe('hello')
    })

    it('should parse multiple string TXT record by concatenating', () => {
      // Create buffer with multiple strings: "hello" + "world"
      const buffer = Buffer.concat([
        Buffer.from([5]), // length of "hello"
        Buffer.from('hello'),
        Buffer.from([5]), // length of "world"
        Buffer.from('world'),
      ])

      const result = parseTxtRecord(buffer)
      expect(result).toBe('helloworld') // Should concatenate without spaces
    })

    it('should handle empty strings within record', () => {
      // Create buffer: "start" + "" + "end"
      const buffer = Buffer.concat([
        Buffer.from([5]), // length of "start"
        Buffer.from('start'),
        Buffer.from([0]), // empty string
        Buffer.from([3]), // length of "end"
        Buffer.from('end'),
      ])

      const result = parseTxtRecord(buffer)
      expect(result).toBe('startend')
    })

    it('should handle empty buffer', () => {
      const buffer = Buffer.alloc(0)
      const result = parseTxtRecord(buffer)
      expect(result).toBe('')
    })

    it('should handle buffer with only empty string', () => {
      // Buffer with single empty string
      const buffer = Buffer.from([0]) // length 0, no data

      const result = parseTxtRecord(buffer)
      expect(result).toBe('')
    })

    it('should handle UTF-8 characters correctly', () => {
      const utf8String = 'héllo wørld 🌍'
      const utf8Buffer = Buffer.from(utf8String, 'utf8')

      const buffer = Buffer.concat([Buffer.from([utf8Buffer.length]), utf8Buffer])

      const result = parseTxtRecord(buffer)
      expect(result).toBe(utf8String)
    })

    it('should handle multiple UTF-8 strings', () => {
      const str1 = 'TWIST='
      const str2 = 'tëst-éndpoint'
      const str1Buffer = Buffer.from(str1, 'utf8')
      const str2Buffer = Buffer.from(str2, 'utf8')

      const buffer = Buffer.concat([
        Buffer.from([str1Buffer.length]),
        str1Buffer,
        Buffer.from([str2Buffer.length]),
        str2Buffer,
      ])

      const result = parseTxtRecord(buffer)
      expect(result).toBe('TWIST=tëst-éndpoint')
    })

    it('should throw error when length exceeds buffer size', () => {
      // Create malformed buffer: claims length 10 but only has 5 bytes
      const buffer = Buffer.concat([
        Buffer.from([10]), // claims 10 bytes
        Buffer.from('hello'), // only 5 bytes available
      ])

      expect(() => parseTxtRecord(buffer)).toThrow('Invalid TXT record format: length exceeds buffer size')
    })

    it('should throw error when length exceeds remaining buffer', () => {
      // Valid first string, invalid second string
      const buffer = Buffer.concat([
        Buffer.from([5]), // length of "hello"
        Buffer.from('hello'),
        Buffer.from([10]), // claims 10 bytes but not enough remaining
        Buffer.from('test'), // only 4 bytes
      ])

      expect(() => parseTxtRecord(buffer)).toThrow('Invalid TXT record format: length exceeds buffer size')
    })

    it('should handle maximum length strings (255 bytes)', () => {
      const maxString = 'a'.repeat(255)
      const buffer = Buffer.concat([
        Buffer.from([255]), // maximum length
        Buffer.from(maxString),
      ])

      const result = parseTxtRecord(buffer)
      expect(result).toBe(maxString)
      expect(result.length).toBe(255)
    })

    it('should handle multiple maximum length strings', () => {
      const maxString1 = 'a'.repeat(255)
      const maxString2 = 'b'.repeat(255)

      const buffer = Buffer.concat([
        Buffer.from([255]),
        Buffer.from(maxString1),
        Buffer.from([255]),
        Buffer.from(maxString2),
      ])

      const result = parseTxtRecord(buffer)
      expect(result).toBe(maxString1 + maxString2)
      expect(result.length).toBe(510)
    })

    it('should handle real-world DNS TXT record example', () => {
      // Simulate "TWIST=api/v1/keys" split across two strings
      const part1 = 'TWIST=api/v1/'
      const part2 = 'keys'

      const buffer = Buffer.concat([
        Buffer.from([part1.length]),
        Buffer.from(part1),
        Buffer.from([part2.length]),
        Buffer.from(part2),
      ])

      const result = parseTxtRecord(buffer)
      expect(result).toBe('TWIST=api/v1/keys')
    })
  })

  describe('processTxtRecordData', () => {
    it('should return string data as-is', () => {
      const data = 'TWIST=test-endpoint'
      const result = processTxtRecordData(data)
      expect(result).toBe(data)
    })

    it('should parse Buffer data using parseTxtRecord', () => {
      const buffer = Buffer.concat([
        Buffer.from([6]), // "TWIST="
        Buffer.from('TWIST='),
        Buffer.from([8]), // "endpoint"
        Buffer.from('endpoint'),
      ])

      const result = processTxtRecordData(buffer)
      expect(result).toBe('TWIST=endpoint')
    })

    it('should call toString() on unknown types', () => {
      const mockData = {
        toString: vi.fn().mockReturnValue('mocked-string'),
      }

      const result = processTxtRecordData(mockData)
      expect(result).toBe('mocked-string')
      expect(mockData.toString).toHaveBeenCalledTimes(1)
    })

    it('should handle null and undefined by calling toString', () => {
      // Test with various falsy values that have toString methods
      const testCases = [
        { value: '', expected: '' },
        { value: 0, expected: '0' },
        { value: false, expected: 'false' },
      ]

      testCases.forEach(({ value, expected }) => {
        const result = processTxtRecordData(value)
        expect(result).toBe(expected)
      })
    })

    it('should propagate parseTxtRecord errors for invalid Buffers', () => {
      const invalidBuffer = Buffer.concat([
        Buffer.from([10]), // claims 10 bytes
        Buffer.from('short'), // only 5 bytes
      ])

      expect(() => processTxtRecordData(invalidBuffer)).toThrow('Invalid TXT record format: length exceeds buffer size')
    })

    it('should handle edge case with empty Buffer', () => {
      const emptyBuffer = Buffer.alloc(0)
      const result = processTxtRecordData(emptyBuffer)
      expect(result).toBe('')
    })
  })
})
