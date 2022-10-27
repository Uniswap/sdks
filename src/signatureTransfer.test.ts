import { SignatureTransfer } from './signatureTransfer'

describe('SignatureTransfer', () => {
  it('non-batch, no witness', () => {
    expect(
      SignatureTransfer.hash({
        token: '0x0000000000000000000000000000000000000000',
        spender: '0x0000000000000000000000000000000000000000',
        signedAmount: '0',
        nonce: '0',
        deadline: '0',
      })
    ).toBe('0x9ae45bb2e5692ce50d604371e4328c12717cdd474947db6f52b4a5074a651851')
  })

  it('non-batch, witness', () => {
    expect(
      SignatureTransfer.hash({
        token: '0x0000000000000000000000000000000000000000',
        spender: '0x0000000000000000000000000000000000000000',
        signedAmount: '0',
        nonce: '0',
        deadline: '0',
        witness: {
          witnessTypeName: 'MockWitness',
          witnessType: 'MockWitness(uint256 mock)',
          witness: '0x0000000000000000000000000000000000000000000000000000000000000000',
        },
      })
    ).toBe('0x2da860444ddecf3af5b79534db25eacb598a62f20707c890ef03c090b78d2a41')
  })

  it('batch, no witness', () => {
    expect(
      SignatureTransfer.hash({
        tokens: ['0x0000000000000000000000000000000000000000'],
        spender: '0x0000000000000000000000000000000000000000',
        signedAmounts: ['0'],
        nonce: '0',
        deadline: '0',
      })
    ).toBe('0xfa6df6fb8d00c661f6014da4e237f018b73fe21e3cb41fc284e4ee0d2e25cf7e')
  })

  it('batch, witness', () => {
    expect(
      SignatureTransfer.hash({
        tokens: ['0x0000000000000000000000000000000000000000'],
        spender: '0x0000000000000000000000000000000000000000',
        signedAmounts: ['0'],
        nonce: '0',
        deadline: '0',
        witness: {
          witnessTypeName: 'MockWitness',
          witnessType: 'MockWitness(uint256 mock)',
          witness: '0x0000000000000000000000000000000000000000000000000000000000000000',
        },
      })
    ).toBe('0xadcd2d4a563ecc2a46144cc1dd537d2699c87aec5a93078fa9fb83ad8662b762')
  })
})
