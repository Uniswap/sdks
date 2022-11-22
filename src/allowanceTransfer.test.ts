import { AllowanceTransfer } from './allowanceTransfer'
import { MaxOrderedNonce, MaxAllowanceTransferAmount, MaxAllowanceExpiration, MaxSigDeadline } from './constants'

describe('AllowanceTransfer', () => {
  describe('Max values', () => {
    it('max nonce', () => {
      expect(() =>
        AllowanceTransfer.hash(
          {
            details: {
              token: '0x0000000000000000000000000000000000000000',
              amount: '0',
              expiration: '0',
              nonce: MaxOrderedNonce.add(1).toString(),
            },
            spender: '0x0000000000000000000000000000000000000000',
            sigDeadline: '0',
          },
          '0x0000000000000000000000000000000000000000',
          1
        )
      ).toThrow('NONCE_OUT_OF_RANGE')
    })

    it('max amount', () => {
      expect(() =>
        AllowanceTransfer.hash(
          {
            details: {
              token: '0x0000000000000000000000000000000000000000',
              amount: MaxAllowanceTransferAmount.add(1).toString(),
              expiration: '0',
              nonce: 0,
            },
            spender: '0x0000000000000000000000000000000000000000',
            sigDeadline: '0',
          },
          '0x0000000000000000000000000000000000000000',
          1
        )
      ).toThrow('AMOUNT_OUT_OF_RANGE')
    })

    it('max expiration', () => {
      expect(() =>
        AllowanceTransfer.hash(
          {
            details: {
              token: '0x0000000000000000000000000000000000000000',
              amount: '0',
              expiration: MaxAllowanceExpiration.add(1).toString(),
              nonce: 0,
            },
            spender: '0x0000000000000000000000000000000000000000',
            sigDeadline: '0',
          },
          '0x0000000000000000000000000000000000000000',
          1
        )
      ).toThrow('EXPIRATION_OUT_OF_RANGE')
    })

    it('max sigDeadline', () => {
      expect(() =>
        AllowanceTransfer.hash(
          {
            details: {
              token: '0x0000000000000000000000000000000000000000',
              amount: '0',
              expiration: '0',
              nonce: 0,
            },
            spender: '0x0000000000000000000000000000000000000000',
            sigDeadline: MaxSigDeadline.add(1).toString(),
          },
          '0x0000000000000000000000000000000000000000',
          1
        )
      ).toThrow('SIG_DEADLINE_OUT_OF_RANGE')
    })
  })

  it('non-batch', () => {
    expect(
      AllowanceTransfer.hash(
        {
          details: {
            token: '0x0000000000000000000000000000000000000000',
            amount: '0',
            expiration: '0',
            nonce: 0,
          },
          spender: '0x0000000000000000000000000000000000000000',
          sigDeadline: '0',
        },
        '0x0000000000000000000000000000000000000000',
        1
      )
    ).toBe('0xd47437bffdbc4d123a2165feb6ca646b8700c038622ce304f84e9048bc744f36')
  })

  it('batch', () => {
    expect(
      AllowanceTransfer.hash(
        {
          details: [
            {
              token: '0x0000000000000000000000000000000000000000',
              amount: '0',
              expiration: '0',
              nonce: 0,
            },
          ],
          spender: '0x0000000000000000000000000000000000000000',
          sigDeadline: '0',
        },
        '0x0000000000000000000000000000000000000000',
        1
      )
    ).toBe('0x49642ada5f77eb9458f8265eb01fed2684c2f25d50534fea3efdf2cf395deb2f')
  })
})
