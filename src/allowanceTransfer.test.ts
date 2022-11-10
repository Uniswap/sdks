import { AllowanceTransfer } from './allowanceTransfer'

describe('AllowanceTransfer', () => {
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
