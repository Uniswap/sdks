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
  {
    type: 'function',
    name: 'getWorkloadMetadata',
    inputs: [
      {
        name: 'workloadId',
        type: 'bytes32',
        internalType: 'WorkloadId',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct IBlockBuilderPolicy.WorkloadMetadata',
        components: [
          {
            name: 'commitHash',
            type: 'string',
            internalType: 'string',
          },
          {
            name: 'sourceLocators',
            type: 'string[]',
            internalType: 'string[]',
          },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const
