/**
 * ABI definition for Flashtestation contract events
 */
export const flashtestationAbi = [
  {
    type: 'event',
    name: 'BlockBuilderProofVerified',
    inputs: [
      {
        indexed: true,
        name: 'blockBuilder',
        type: 'address',
      },
      {
        indexed: true,
        name: 'blockHash',
        type: 'bytes32',
      },
      {
        indexed: false,
        name: 'chainId',
        type: 'uint8',
      },
      {
        indexed: false,
        name: 'txHash',
        type: 'bytes32',
      },
      {
        indexed: false,
        name: 'proof',
        type: 'string',
      },
    ],
  },
] as const;
