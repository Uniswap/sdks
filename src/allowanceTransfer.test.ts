import { AllowanceTransfer } from './allowanceTransfer'

describe('AllowanceTransfer', () => {
  it('non-batch', () => {
    expect(
      AllowanceTransfer.hash({
        token: '0x0000000000000000000000000000000000000000',
        spender: '0x0000000000000000000000000000000000000000',
        amount: '0',
        expiration: '0',
        nonce: 0,
        sigDeadline: '0',
      })
    ).toBe('0x49d81e6c4373102e4abdcc6a3e96fd8362cc7e795446625c6921cb87569cb359')
  })

  it('batch', () => {
    expect(
      AllowanceTransfer.hash({
        tokens: ['0x0000000000000000000000000000000000000000'],
        spender: '0x0000000000000000000000000000000000000000',
        amounts: ['0'],
        expirations: ['0'],
        nonce: 0,
        sigDeadline: '0',
      })
    ).toBe('0xba397a908f5c5869fea18c7d09cf717825fc6ee512dd41f2e5d9f84188036649')
  })
})
