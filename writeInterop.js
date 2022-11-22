const fs = require('fs')
const { AllowanceTransfer, SignatureTransfer } = require('./dist')

const PERMIT2_ADDRESS = '0x2ff894211e6ee99fc02564e96b519c2f61ffc00e'
const TOKEN_ADDRESS = '0xcc2eb538c1652934ab91be26dadd0ce81d8d5945'
const SPENDER_ADDRESS = '0x0000000000000000000000000000000000000001'
const EXPIRATION = '10000000000000'
const AMOUNT = '1000000000000000000'
const chainId = 31337

const interop = {
  _PERMIT_HASH: AllowanceTransfer.hash(
    {
      details: {
        token: TOKEN_ADDRESS,
        amount: AMOUNT,
        expiration: EXPIRATION,
        nonce: 0,
      },
      spender: SPENDER_ADDRESS,
      sigDeadline: EXPIRATION,
    },
    PERMIT2_ADDRESS,
    chainId
  ),

  _PERMIT_BATCH_HASH: AllowanceTransfer.hash(
    {
      details: [
        {
          token: TOKEN_ADDRESS,
          amount: AMOUNT,
          expiration: EXPIRATION,
          nonce: 0,
        },
      ],
      spender: SPENDER_ADDRESS,
      sigDeadline: EXPIRATION,
    },
    PERMIT2_ADDRESS,
    chainId
  ),

  _PERMIT_TRANSFER: SignatureTransfer.hash(
    {
      permitted: {
        token: TOKEN_ADDRESS,
        amount: AMOUNT,
      },
      spender: SPENDER_ADDRESS,
      nonce: '0',
      deadline: EXPIRATION,
    },
    PERMIT2_ADDRESS,
    chainId
  ),

  _PERMIT_TRANSFER_BATCH: SignatureTransfer.hash(
    {
      permitted: [
        {
          token: TOKEN_ADDRESS,
          amount: AMOUNT,
        },
      ],
      spender: SPENDER_ADDRESS,
      nonce: '0',
      deadline: EXPIRATION,
    },
    PERMIT2_ADDRESS,
    chainId
  ),

  _PERMIT_TRANSFER_WITNESS: SignatureTransfer.hash(
    {
      permitted: {
        token: TOKEN_ADDRESS,
        amount: AMOUNT,
      },
      spender: SPENDER_ADDRESS,
      nonce: '0',
      deadline: EXPIRATION,
    },
    PERMIT2_ADDRESS,
    chainId,
    {
      witnessTypeName: 'MockWitness',
      witnessType: [{ name: 'mock', type: 'uint256' }],
      witness: { mock: '0' },
    }
  ),
}

fs.writeFileSync('./test/interop.json', JSON.stringify(interop))
