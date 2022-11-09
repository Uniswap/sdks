import { AllowanceTransfer } from './allowanceTransfer'

describe('AllowanceTransfer', () => {
  it('non-batch', () => {
    expect(
      AllowanceTransfer.hash({
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
      ),
    ).toBe('0x18d57865d2758c0e50c5f2492ba3717e4ad0dd2cf1f4d785946fa7cf4a28b398')
  })

  it('batch', () => {
    expect(
      AllowanceTransfer.hash({
        details: [{
          token: '0x0000000000000000000000000000000000000000',
          amount: '0',
          expiration: '0',
          nonce: 0,
        }],
        spender: '0x0000000000000000000000000000000000000000',
        sigDeadline: '0',
      },
      '0x0000000000000000000000000000000000000000',
      1
      )
    ).toBe('0x04eb5aea3274b591e2461c5fd2b98ec76f3074185afbf70af94fddcb3d86ec14')
  })
})
