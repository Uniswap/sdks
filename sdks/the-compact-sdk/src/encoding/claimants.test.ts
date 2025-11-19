import { buildComponent, decodeComponent, transfer, convert, withdraw } from './claimants'

describe('claimants encoding', () => {
  const lockTag = '0x000000000000000000000001' as `0x${string}`
  const recipient = '0x1234567890123456789012345678901234567890' as `0x${string}`

  describe('buildComponent', () => {
    it('should build a transfer component', () => {
      const component = buildComponent(lockTag, transfer(recipient, 100n))

      expect(component.amount).toBe(100n)
      expect(component.claimant > 0n).toBe(true)
    })

    it('should build a convert component', () => {
      const targetLockTag = '0x000000000000000000000002' as `0x${string}`
      const component = buildComponent(lockTag, convert(recipient, 200n, targetLockTag))

      expect(component.amount).toBe(200n)
      expect(component.claimant > 0n).toBe(true)
    })

    it('should build a withdraw component', () => {
      const component = buildComponent(lockTag, withdraw(recipient, 300n))

      expect(component.amount).toBe(300n)
      expect(component.claimant > 0n).toBe(true)
    })
  })

  describe('decodeComponent', () => {
    it('should decode a transfer component', () => {
      const component = buildComponent(lockTag, transfer(recipient, 100n))
      const decoded = decodeComponent(component, lockTag)

      expect(decoded.kind).toBe('transfer')
      expect(decoded.recipient.toLowerCase()).toBe(recipient.toLowerCase())
      expect(decoded.amount).toBe(100n)
    })

    it('should decode a withdraw component', () => {
      const component = buildComponent(lockTag, withdraw(recipient, 300n))
      const decoded = decodeComponent(component)

      expect(decoded.kind).toBe('withdraw')
      expect(decoded.recipient.toLowerCase()).toBe(recipient.toLowerCase())
      expect(decoded.amount).toBe(300n)
    })

    it('should decode a convert component', () => {
      const targetLockTag = '0x000000000000000000000002' as `0x${string}`
      const component = buildComponent(lockTag, convert(recipient, 200n, targetLockTag))
      const decoded = decodeComponent(component, lockTag)

      expect(decoded.kind).toBe('convert')
      expect(decoded.recipient.toLowerCase()).toBe(recipient.toLowerCase())
      expect(decoded.amount).toBe(200n)
      expect(decoded.lockTag?.toLowerCase()).toBe(targetLockTag.toLowerCase())
    })
  })
})
