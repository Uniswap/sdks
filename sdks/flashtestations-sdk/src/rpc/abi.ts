/**
 * ABI definition for Flashtestation contract events
 */
export const flashtestationAbi = [
  {
    type: 'event',
    name: 'BlockBuilderProofVerified',
    inputs: [
      {
        indexed: false,
        name: 'caller',
        type: 'address',
      },
      {
        indexed: false,
        name: 'workloadId',
        type: 'bytes32',
      },
      {
        indexed: false,
        name: 'version',
        type: 'uint8',
      },
      {
        indexed: false,
        name: 'blockContentHash',
        type: 'bytes32',
      },
      {
        indexed: false,
        name: 'commitHash',
        type: 'string',
      },
    ],
  },
] as const;
