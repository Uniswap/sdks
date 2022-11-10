const fs = require('fs')
const { MaxUint256 } = require('@ethersproject/constants');
const { AllowanceTransfer, SignatureTransfer } = require('./dist')

const PERMIT2_ADDRESS = '0x847466bddf372df320fb52a20b7c2523773034d7';
const TOKEN_ADDRESS = '0x0000000000000000000000000000000000000002';
const SPENDER_ADDRESS = '0x0000000000000000000000000000000000000001';
const EXPIRATION = '10000000000000';
const chainId = 31337;

const interop = {
  _PERMIT_HASH: AllowanceTransfer.hash({
    details: {
      token: TOKEN_ADDRESS,
      amount: '0',
      expiration: EXPIRATION,
      nonce: 0,
    },
    spender: SPENDER_ADDRESS,
    sigDeadline: EXPIRATION
  }, PERMIT2_ADDRESS, chainId),
}

fs.writeFileSync('./test/interop.json', JSON.stringify(interop))
