import { keccak256, keccak256Concat } from '../../src/crypto/hash';

describe('Hash utilities', () => {
  describe('keccak256', () => {
    it('should hash known test vectors correctly', () => {
      // Test vector 1: Empty string
      expect(keccak256('')).toBe('0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');

      // Test vector 2: "hello" string
      expect(keccak256('hello')).toBe('0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8');

      // Test vector 3: "Hello, World!" string
      expect(keccak256('Hello, World!')).toBe('0xacaf3289d7b601cbd114fb36c4d29c85bbfd5e133f14cb355c3fd8d99367964f');
    });

    it('should handle hex string input', () => {
      // Test with hex string (0x prefixed)
      const hexInput = '0x48656c6c6f'; // "Hello" in hex
      const stringInput = 'Hello';

      expect(keccak256(hexInput)).toBe(keccak256(stringInput));
    });

    it('should handle hex string input without 0x prefix', () => {
      // Test with hex string (no 0x prefix)
      const hexInput = '48656c6c6f'; // "Hello" in hex
      const stringInput = 'Hello';

      expect(keccak256(hexInput)).toBe(keccak256(stringInput));
    });

    it('should handle Uint8Array input', () => {
      const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      const stringInput = 'Hello';

      expect(keccak256(bytes)).toBe(keccak256(stringInput));
    });

    it('should return hex string with 0x prefix', () => {
      const result = keccak256('test');
      expect(result).toMatch(/^0x[0-9a-f]{64}$/);
      expect(result.length).toBe(66); // 0x + 64 hex chars
    });
  });

  describe('keccak256Concat', () => {
    it('should concatenate hex strings and hash correctly', () => {
      const hex1 = '0x48656c6c6f'; // "Hello"
      const hex2 = '0x576f726c64'; // "World"
      const concatenated = '48656c6c6f576f726c64'; // "HelloWorld"

      const result1 = keccak256Concat(hex1, hex2);
      const result2 = keccak256(concatenated);

      expect(result1).toBe(result2);
    });

    it('should handle multiple hex strings', () => {
      const hex1 = '0x48656c6c6f'; // "Hello"
      const hex2 = '576f726c64'; // "World" (no 0x prefix)
      const hex3 = '0x21'; // "!"

      const result = keccak256Concat(hex1, hex2, hex3);
      const expected = keccak256('48656c6c6f576f726c6421');

      expect(result).toBe(expected);
    });

    it('should handle empty hex strings', () => {
      const result = keccak256Concat('', '0x48656c6c6f', '');
      const expected = keccak256('48656c6c6f');

      expect(result).toBe(expected);
    });
  });
});