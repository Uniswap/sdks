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
    ).toBe('0x498cf7b0570b217737fa643377c86eb1e3541c51f0fe6a98065cde301a8b7958')
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
    ).toBe('0x98d27bdcf39d9b7d7fe3b4b55f1f166e712a5de1f79b2e2950434603ab0745bf')
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
    ).toBe('0x8a96f17df860a21985a0d54b81b07c5a914328bd63f6704e5bfb816a37602cdc')
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
    ).toBe('0x2b89ead0969fc66abf885ea6014be7855f80af8cdf25ea902cb8d7644052b555')
  })
})
