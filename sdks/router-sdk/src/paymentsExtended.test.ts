import { Percent, Token } from '@x-swap-protocol/sdk-core'
import JSBI from 'jsbi'
import { PaymentsExtended } from './paymentsExtended'

const recipient = '0x0000000000000000000000000000000000000003'
const amount = JSBI.BigInt(123)

const feeOptions = {
  fee: new Percent(1, 1000),
  recipient: '0x0000000000000000000000000000000000000009',
}

const token = new Token(1, '0x0000000000000000000000000000000000000001', 18, 't0', 'token0')

describe('PaymentsExtended', () => {
  describe('#encodeUnwrapWETH9', () => {
    it('works without recipient', () => {
      const calldata = PaymentsExtended.encodeUnwrapWETH9(amount)
      expect(calldata).toBe('0x49616997000000000000000000000000000000000000000000000000000000000000007b')
    })

    it('works with recipient', () => {
      const calldata = PaymentsExtended.encodeUnwrapWETH9(amount, recipient)
      expect(calldata).toBe(
          '0x49404b7c000000000000000000000000000000000000000000000000000000000000007b0000000000000000000000000000000000000000000000000000000000000003'
      )
    })

    it('works with recipient and with fee', () => {
      const calldata = PaymentsExtended.encodeUnwrapWETH9(amount, recipient, feeOptions)
      expect(calldata).toBe(
          '0x9b2c0a37000000000000000000000000000000000000000000000000000000000000007b0000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000009'
      )
    })

    it('works without recipient and with fee', () => {
      const calldata = PaymentsExtended.encodeUnwrapWETH9(amount, undefined, feeOptions)
      expect(calldata).toBe(
          '0xd4ef38de000000000000000000000000000000000000000000000000000000000000007b000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000009'
      )
    })
  })

  describe('#encodeSweepToken', () => {
    it('works without recipient', () => {
      const calldata = PaymentsExtended.encodeSweepToken(token, amount)
      expect(calldata).toBe(
          '0xe90a182f0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000007b'
      )
    })

    it('works with recipient', () => {
      const calldata = PaymentsExtended.encodeSweepToken(token, amount, recipient)
      expect(calldata).toBe(
          '0xdf2ab5bb0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000007b0000000000000000000000000000000000000000000000000000000000000003'
      )
    })

    it('works with recipient and with fee', () => {
      const calldata = PaymentsExtended.encodeSweepToken(token, amount, recipient, feeOptions)
      expect(calldata).toBe(
          '0xe0e189a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000007b0000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000009'
      )
    })

    it('works without recipient and with fee', () => {
      const calldata = PaymentsExtended.encodeSweepToken(token, amount, undefined, feeOptions)
      expect(calldata).toBe(
          '0x3068c5540000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000007b000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000009'
      )
    })
  })

  it('#encodePull', () => {
    const calldata = PaymentsExtended.encodePull(token, amount)
    expect(calldata).toBe(
        '0xf2d5d56b0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000007b'
    )
  })

  it('#encodeWrapETH', () => {
    const calldata = PaymentsExtended.encodeWrapETH(amount)
    expect(calldata).toBe('0x1c58db4f000000000000000000000000000000000000000000000000000000000000007b')
  })
})
