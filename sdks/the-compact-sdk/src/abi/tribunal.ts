/**
 * Tribunal Contract ABI
 *
 * Based on: tribunal/src/interfaces/ITribunal.sol
 */

/**
 * ITribunal ABI for interacting with the Tribunal contract
 */
export const ITribunalABI = [
  // ======== Events ========
  {
    type: 'event',
    name: 'Fill',
    inputs: [
      { name: 'sponsor', type: 'address', indexed: true },
      { name: 'claimant', type: 'bytes32', indexed: true },
      { name: 'claimHash', type: 'bytes32', indexed: false },
      {
        name: 'fillRecipients',
        type: 'tuple[]',
        indexed: false,
        components: [
          { name: 'fillAmount', type: 'uint256' },
          { name: 'recipient', type: 'address' },
        ],
      },
      { name: 'claimAmounts', type: 'uint256[]', indexed: false },
      { name: 'targetBlock', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'FillWithClaim',
    inputs: [
      { name: 'sponsor', type: 'address', indexed: true },
      { name: 'claimant', type: 'bytes32', indexed: true },
      { name: 'claimHash', type: 'bytes32', indexed: false },
      {
        name: 'fillRecipients',
        type: 'tuple[]',
        indexed: false,
        components: [
          { name: 'fillAmount', type: 'uint256' },
          { name: 'recipient', type: 'address' },
        ],
      },
      { name: 'claimAmounts', type: 'uint256[]', indexed: false },
      { name: 'targetBlock', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Cancel',
    inputs: [
      { name: 'sponsor', type: 'address', indexed: true },
      { name: 'claimHash', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Dispatch',
    inputs: [
      { name: 'dispatchTarget', type: 'address', indexed: true },
      { name: 'chainId', type: 'uint256', indexed: true },
      { name: 'claimant', type: 'bytes32', indexed: true },
      { name: 'claimHash', type: 'bytes32', indexed: false },
    ],
  },

  // ======== Custom Errors ========
  { type: 'error', name: 'InvalidGasPrice', inputs: [] },
  { type: 'error', name: 'AlreadyFilled', inputs: [] },
  { type: 'error', name: 'InvalidTargetBlockDesignation', inputs: [] },
  {
    type: 'error',
    name: 'InvalidTargetBlock',
    inputs: [
      { name: 'blockNumber', type: 'uint256' },
      { name: 'targetBlockNumber', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'NotSponsor', inputs: [] },
  { type: 'error', name: 'ReentrancyGuard', inputs: [] },
  { type: 'error', name: 'InvalidRecipientCallbackLength', inputs: [] },
  { type: 'error', name: 'ValidityConditionsNotMet', inputs: [] },
  { type: 'error', name: 'InvalidFillBlock', inputs: [] },
  { type: 'error', name: 'InvalidAdjustment', inputs: [] },
  { type: 'error', name: 'InvalidFillHashArguments', inputs: [] },
  { type: 'error', name: 'InvalidRecipientCallback', inputs: [] },
  { type: 'error', name: 'InvalidChainId', inputs: [] },
  { type: 'error', name: 'InvalidCommitmentsArray', inputs: [] },
  { type: 'error', name: 'InvalidDispatchCallback', inputs: [] },
  { type: 'error', name: 'DispatchNotAvailable', inputs: [] },

  // ======== Core Functions ========
  {
    type: 'function',
    name: 'fill',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'compact',
        type: 'tuple',
        components: [
          { name: 'arbiter', type: 'address' },
          { name: 'sponsor', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expires', type: 'uint256' },
          {
            name: 'commitments',
            type: 'tuple[]',
            components: [
              { name: 'lockTag', type: 'bytes12' },
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
        ],
      },
      {
        name: 'mandate',
        type: 'tuple',
        components: [
          { name: 'chainId', type: 'uint256' },
          { name: 'tribunal', type: 'address' },
          { name: 'expires', type: 'uint256' },
          {
            name: 'components',
            type: 'tuple[]',
            components: [
              { name: 'fillToken', type: 'address' },
              { name: 'minimumFillAmount', type: 'uint256' },
              { name: 'recipient', type: 'address' },
              { name: 'applyScaling', type: 'bool' },
            ],
          },
          { name: 'baselinePriorityFee', type: 'uint256' },
          { name: 'scalingFactor', type: 'uint256' },
          { name: 'priceCurve', type: 'uint256[]' },
          {
            name: 'recipientCallback',
            type: 'tuple[]',
            components: [
              { name: 'chainId', type: 'uint256' },
              {
                name: 'compact',
                type: 'tuple',
                components: [
                  { name: 'arbiter', type: 'address' },
                  { name: 'sponsor', type: 'address' },
                  { name: 'nonce', type: 'uint256' },
                  { name: 'expires', type: 'uint256' },
                  {
                    name: 'commitments',
                    type: 'tuple[]',
                    components: [
                      { name: 'lockTag', type: 'bytes12' },
                      { name: 'token', type: 'address' },
                      { name: 'amount', type: 'uint256' },
                    ],
                  },
                ],
              },
              { name: 'mandateHash', type: 'bytes32' },
              { name: 'context', type: 'bytes' },
            ],
          },
          { name: 'salt', type: 'bytes32' },
        ],
      },
      {
        name: 'adjustment',
        type: 'tuple',
        components: [
          { name: 'adjuster', type: 'address' },
          { name: 'fillIndex', type: 'uint256' },
          { name: 'targetBlock', type: 'uint256' },
          { name: 'supplementalPriceCurve', type: 'uint256[]' },
          { name: 'validityConditions', type: 'bytes32' },
          { name: 'adjustmentAuthorization', type: 'bytes' },
        ],
      },
      { name: 'fillHashes', type: 'bytes32[]' },
      { name: 'claimant', type: 'bytes32' },
      { name: 'fillBlock', type: 'uint256' },
    ],
    outputs: [
      { name: 'claimHash', type: 'bytes32' },
      { name: 'mandateHash', type: 'bytes32' },
      { name: 'fillAmounts', type: 'uint256[]' },
      { name: 'claimAmounts', type: 'uint256[]' },
    ],
  },
  {
    type: 'function',
    name: 'fillAndDispatch',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'compact',
        type: 'tuple',
        components: [
          { name: 'arbiter', type: 'address' },
          { name: 'sponsor', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expires', type: 'uint256' },
          {
            name: 'commitments',
            type: 'tuple[]',
            components: [
              { name: 'lockTag', type: 'bytes12' },
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
        ],
      },
      {
        name: 'mandate',
        type: 'tuple',
        components: [
          { name: 'chainId', type: 'uint256' },
          { name: 'tribunal', type: 'address' },
          { name: 'expires', type: 'uint256' },
          {
            name: 'components',
            type: 'tuple[]',
            components: [
              { name: 'fillToken', type: 'address' },
              { name: 'minimumFillAmount', type: 'uint256' },
              { name: 'recipient', type: 'address' },
              { name: 'applyScaling', type: 'bool' },
            ],
          },
          { name: 'baselinePriorityFee', type: 'uint256' },
          { name: 'scalingFactor', type: 'uint256' },
          { name: 'priceCurve', type: 'uint256[]' },
          {
            name: 'recipientCallback',
            type: 'tuple[]',
            components: [
              { name: 'chainId', type: 'uint256' },
              {
                name: 'compact',
                type: 'tuple',
                components: [
                  { name: 'arbiter', type: 'address' },
                  { name: 'sponsor', type: 'address' },
                  { name: 'nonce', type: 'uint256' },
                  { name: 'expires', type: 'uint256' },
                  {
                    name: 'commitments',
                    type: 'tuple[]',
                    components: [
                      { name: 'lockTag', type: 'bytes12' },
                      { name: 'token', type: 'address' },
                      { name: 'amount', type: 'uint256' },
                    ],
                  },
                ],
              },
              { name: 'mandateHash', type: 'bytes32' },
              { name: 'context', type: 'bytes' },
            ],
          },
          { name: 'salt', type: 'bytes32' },
        ],
      },
      {
        name: 'adjustment',
        type: 'tuple',
        components: [
          { name: 'adjuster', type: 'address' },
          { name: 'fillIndex', type: 'uint256' },
          { name: 'targetBlock', type: 'uint256' },
          { name: 'supplementalPriceCurve', type: 'uint256[]' },
          { name: 'validityConditions', type: 'bytes32' },
          { name: 'adjustmentAuthorization', type: 'bytes' },
        ],
      },
      { name: 'fillHashes', type: 'bytes32[]' },
      { name: 'claimant', type: 'bytes32' },
      { name: 'fillBlock', type: 'uint256' },
      {
        name: 'dispatchParameters',
        type: 'tuple',
        components: [
          { name: 'chainId', type: 'uint256' },
          { name: 'target', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'context', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'claimHash', type: 'bytes32' },
      { name: 'mandateHash', type: 'bytes32' },
      { name: 'fillAmounts', type: 'uint256[]' },
      { name: 'claimAmounts', type: 'uint256[]' },
    ],
  },
  {
    type: 'function',
    name: 'claimAndFill',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'claim',
        type: 'tuple',
        components: [
          {
            name: 'compact',
            type: 'tuple',
            components: [
              { name: 'arbiter', type: 'address' },
              { name: 'sponsor', type: 'address' },
              { name: 'nonce', type: 'uint256' },
              { name: 'expires', type: 'uint256' },
              {
                name: 'commitments',
                type: 'tuple[]',
                components: [
                  { name: 'lockTag', type: 'bytes12' },
                  { name: 'token', type: 'address' },
                  { name: 'amount', type: 'uint256' },
                ],
              },
            ],
          },
          { name: 'sponsorSignature', type: 'bytes' },
          { name: 'allocatorSignature', type: 'bytes' },
        ],
      },
      {
        name: 'mandate',
        type: 'tuple',
        components: [
          { name: 'chainId', type: 'uint256' },
          { name: 'tribunal', type: 'address' },
          { name: 'expires', type: 'uint256' },
          {
            name: 'components',
            type: 'tuple[]',
            components: [
              { name: 'fillToken', type: 'address' },
              { name: 'minimumFillAmount', type: 'uint256' },
              { name: 'recipient', type: 'address' },
              { name: 'applyScaling', type: 'bool' },
            ],
          },
          { name: 'baselinePriorityFee', type: 'uint256' },
          { name: 'scalingFactor', type: 'uint256' },
          { name: 'priceCurve', type: 'uint256[]' },
          {
            name: 'recipientCallback',
            type: 'tuple[]',
            components: [
              { name: 'chainId', type: 'uint256' },
              {
                name: 'compact',
                type: 'tuple',
                components: [
                  { name: 'arbiter', type: 'address' },
                  { name: 'sponsor', type: 'address' },
                  { name: 'nonce', type: 'uint256' },
                  { name: 'expires', type: 'uint256' },
                  {
                    name: 'commitments',
                    type: 'tuple[]',
                    components: [
                      { name: 'lockTag', type: 'bytes12' },
                      { name: 'token', type: 'address' },
                      { name: 'amount', type: 'uint256' },
                    ],
                  },
                ],
              },
              { name: 'mandateHash', type: 'bytes32' },
              { name: 'context', type: 'bytes' },
            ],
          },
          { name: 'salt', type: 'bytes32' },
        ],
      },
      {
        name: 'adjustment',
        type: 'tuple',
        components: [
          { name: 'adjuster', type: 'address' },
          { name: 'fillIndex', type: 'uint256' },
          { name: 'targetBlock', type: 'uint256' },
          { name: 'supplementalPriceCurve', type: 'uint256[]' },
          { name: 'validityConditions', type: 'bytes32' },
          { name: 'adjustmentAuthorization', type: 'bytes' },
        ],
      },
      { name: 'fillHashes', type: 'bytes32[]' },
      { name: 'claimant', type: 'bytes32' },
      { name: 'fillBlock', type: 'uint256' },
    ],
    outputs: [
      { name: 'claimHash', type: 'bytes32' },
      { name: 'mandateHash', type: 'bytes32' },
      { name: 'fillAmounts', type: 'uint256[]' },
      { name: 'claimAmounts', type: 'uint256[]' },
    ],
  },
  {
    type: 'function',
    name: 'dispatch',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'compact',
        type: 'tuple',
        components: [
          { name: 'arbiter', type: 'address' },
          { name: 'sponsor', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expires', type: 'uint256' },
          {
            name: 'commitments',
            type: 'tuple[]',
            components: [
              { name: 'lockTag', type: 'bytes12' },
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
        ],
      },
      { name: 'mandateHash', type: 'bytes32' },
      {
        name: 'dispatchParams',
        type: 'tuple',
        components: [
          { name: 'chainId', type: 'uint256' },
          { name: 'target', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'context', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'claimHash', type: 'bytes32' },
      { name: 'claimAmounts', type: 'uint256[]' },
    ],
  },
  {
    type: 'function',
    name: 'settleOrRegister',
    stateMutability: 'payable',
    inputs: [
      { name: 'sourceClaimHash', type: 'bytes32' },
      {
        name: 'compact',
        type: 'tuple',
        components: [
          { name: 'arbiter', type: 'address' },
          { name: 'sponsor', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expires', type: 'uint256' },
          {
            name: 'commitments',
            type: 'tuple[]',
            components: [
              { name: 'lockTag', type: 'bytes12' },
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
        ],
      },
      { name: 'mandateHash', type: 'bytes32' },
      { name: 'recipient', type: 'address' },
      { name: 'context', type: 'bytes' },
    ],
    outputs: [{ name: 'registeredClaimHash', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'cancel',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'compact',
        type: 'tuple',
        components: [
          { name: 'arbiter', type: 'address' },
          { name: 'sponsor', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expires', type: 'uint256' },
          {
            name: 'commitments',
            type: 'tuple[]',
            components: [
              { name: 'lockTag', type: 'bytes12' },
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
        ],
      },
      { name: 'mandateHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'claimHash', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'cancelAndDispatch',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'compact',
        type: 'tuple',
        components: [
          { name: 'arbiter', type: 'address' },
          { name: 'sponsor', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expires', type: 'uint256' },
          {
            name: 'commitments',
            type: 'tuple[]',
            components: [
              { name: 'lockTag', type: 'bytes12' },
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
        ],
      },
      { name: 'mandateHash', type: 'bytes32' },
      {
        name: 'dispatch',
        type: 'tuple',
        components: [
          { name: 'chainId', type: 'uint256' },
          { name: 'target', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'context', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: 'claimHash', type: 'bytes32' }],
  },

  // ======== View Functions ========
  {
    type: 'function',
    name: 'name',
    stateMutability: 'pure',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'filled',
    stateMutability: 'view',
    inputs: [{ name: 'claimHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'claimReductionScalingFactor',
    stateMutability: 'view',
    inputs: [{ name: 'claimHash', type: 'bytes32' }],
    outputs: [{ name: 'scalingFactor', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getDispositionDetails',
    stateMutability: 'view',
    inputs: [{ name: 'claimHashes', type: 'bytes32[]' }],
    outputs: [
      {
        name: 'details',
        type: 'tuple[]',
        components: [
          { name: 'claimant', type: 'bytes32' },
          { name: 'scalingFactor', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getCompactWitnessDetails',
    stateMutability: 'pure',
    inputs: [],
    outputs: [
      { name: 'witnessTypeString', type: 'string' },
      {
        name: 'details',
        type: 'tuple[]',
        components: [
          { name: 'offset', type: 'uint256' },
          { name: 'length', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'reentrancyGuardStatus',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'lockHolder', type: 'address' }],
  },
  {
    type: 'function',
    name: 'extsload',
    stateMutability: 'view',
    inputs: [{ name: 'slot', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'extsload',
    stateMutability: 'view',
    inputs: [{ name: 'slots', type: 'bytes32[]' }],
    outputs: [{ name: '', type: 'bytes32[]' }],
  },

  // ======== Hash Derivation Functions ========
  {
    type: 'function',
    name: 'deriveMandateHash',
    stateMutability: 'view',
    inputs: [
      {
        name: 'mandate',
        type: 'tuple',
        components: [
          { name: 'adjuster', type: 'address' },
          {
            name: 'fills',
            type: 'tuple[]',
            components: [
              { name: 'chainId', type: 'uint256' },
              { name: 'tribunal', type: 'address' },
              { name: 'expires', type: 'uint256' },
              {
                name: 'components',
                type: 'tuple[]',
                components: [
                  { name: 'fillToken', type: 'address' },
                  { name: 'minimumFillAmount', type: 'uint256' },
                  { name: 'recipient', type: 'address' },
                  { name: 'applyScaling', type: 'bool' },
                ],
              },
              { name: 'baselinePriorityFee', type: 'uint256' },
              { name: 'scalingFactor', type: 'uint256' },
              { name: 'priceCurve', type: 'uint256[]' },
              {
                name: 'recipientCallback',
                type: 'tuple[]',
                components: [
                  { name: 'chainId', type: 'uint256' },
                  {
                    name: 'compact',
                    type: 'tuple',
                    components: [
                      { name: 'arbiter', type: 'address' },
                      { name: 'sponsor', type: 'address' },
                      { name: 'nonce', type: 'uint256' },
                      { name: 'expires', type: 'uint256' },
                      {
                        name: 'commitments',
                        type: 'tuple[]',
                        components: [
                          { name: 'lockTag', type: 'bytes12' },
                          { name: 'token', type: 'address' },
                          { name: 'amount', type: 'uint256' },
                        ],
                      },
                    ],
                  },
                  { name: 'mandateHash', type: 'bytes32' },
                  { name: 'context', type: 'bytes' },
                ],
              },
              { name: 'salt', type: 'bytes32' },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'deriveFillsHash',
    stateMutability: 'view',
    inputs: [
      {
        name: 'fills',
        type: 'tuple[]',
        components: [
          { name: 'chainId', type: 'uint256' },
          { name: 'tribunal', type: 'address' },
          { name: 'expires', type: 'uint256' },
          {
            name: 'components',
            type: 'tuple[]',
            components: [
              { name: 'fillToken', type: 'address' },
              { name: 'minimumFillAmount', type: 'uint256' },
              { name: 'recipient', type: 'address' },
              { name: 'applyScaling', type: 'bool' },
            ],
          },
          { name: 'baselinePriorityFee', type: 'uint256' },
          { name: 'scalingFactor', type: 'uint256' },
          { name: 'priceCurve', type: 'uint256[]' },
          {
            name: 'recipientCallback',
            type: 'tuple[]',
            components: [
              { name: 'chainId', type: 'uint256' },
              {
                name: 'compact',
                type: 'tuple',
                components: [
                  { name: 'arbiter', type: 'address' },
                  { name: 'sponsor', type: 'address' },
                  { name: 'nonce', type: 'uint256' },
                  { name: 'expires', type: 'uint256' },
                  {
                    name: 'commitments',
                    type: 'tuple[]',
                    components: [
                      { name: 'lockTag', type: 'bytes12' },
                      { name: 'token', type: 'address' },
                      { name: 'amount', type: 'uint256' },
                    ],
                  },
                ],
              },
              { name: 'mandateHash', type: 'bytes32' },
              { name: 'context', type: 'bytes' },
            ],
          },
          { name: 'salt', type: 'bytes32' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'deriveFillHash',
    stateMutability: 'view',
    inputs: [
      {
        name: 'targetFill',
        type: 'tuple',
        components: [
          { name: 'chainId', type: 'uint256' },
          { name: 'tribunal', type: 'address' },
          { name: 'expires', type: 'uint256' },
          {
            name: 'components',
            type: 'tuple[]',
            components: [
              { name: 'fillToken', type: 'address' },
              { name: 'minimumFillAmount', type: 'uint256' },
              { name: 'recipient', type: 'address' },
              { name: 'applyScaling', type: 'bool' },
            ],
          },
          { name: 'baselinePriorityFee', type: 'uint256' },
          { name: 'scalingFactor', type: 'uint256' },
          { name: 'priceCurve', type: 'uint256[]' },
          {
            name: 'recipientCallback',
            type: 'tuple[]',
            components: [
              { name: 'chainId', type: 'uint256' },
              {
                name: 'compact',
                type: 'tuple',
                components: [
                  { name: 'arbiter', type: 'address' },
                  { name: 'sponsor', type: 'address' },
                  { name: 'nonce', type: 'uint256' },
                  { name: 'expires', type: 'uint256' },
                  {
                    name: 'commitments',
                    type: 'tuple[]',
                    components: [
                      { name: 'lockTag', type: 'bytes12' },
                      { name: 'token', type: 'address' },
                      { name: 'amount', type: 'uint256' },
                    ],
                  },
                ],
              },
              { name: 'mandateHash', type: 'bytes32' },
              { name: 'context', type: 'bytes' },
            ],
          },
          { name: 'salt', type: 'bytes32' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'deriveFillComponentHash',
    stateMutability: 'pure',
    inputs: [
      {
        name: 'component',
        type: 'tuple',
        components: [
          { name: 'fillToken', type: 'address' },
          { name: 'minimumFillAmount', type: 'uint256' },
          { name: 'recipient', type: 'address' },
          { name: 'applyScaling', type: 'bool' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'deriveFillComponentsHash',
    stateMutability: 'pure',
    inputs: [
      {
        name: 'components',
        type: 'tuple[]',
        components: [
          { name: 'fillToken', type: 'address' },
          { name: 'minimumFillAmount', type: 'uint256' },
          { name: 'recipient', type: 'address' },
          { name: 'applyScaling', type: 'bool' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'deriveRecipientCallbackHash',
    stateMutability: 'pure',
    inputs: [
      {
        name: 'recipientCallback',
        type: 'tuple[]',
        components: [
          { name: 'chainId', type: 'uint256' },
          {
            name: 'compact',
            type: 'tuple',
            components: [
              { name: 'arbiter', type: 'address' },
              { name: 'sponsor', type: 'address' },
              { name: 'nonce', type: 'uint256' },
              { name: 'expires', type: 'uint256' },
              {
                name: 'commitments',
                type: 'tuple[]',
                components: [
                  { name: 'lockTag', type: 'bytes12' },
                  { name: 'token', type: 'address' },
                  { name: 'amount', type: 'uint256' },
                ],
              },
            ],
          },
          { name: 'mandateHash', type: 'bytes32' },
          { name: 'context', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'deriveClaimHash',
    stateMutability: 'pure',
    inputs: [
      {
        name: 'compact',
        type: 'tuple',
        components: [
          { name: 'arbiter', type: 'address' },
          { name: 'sponsor', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expires', type: 'uint256' },
          {
            name: 'commitments',
            type: 'tuple[]',
            components: [
              { name: 'lockTag', type: 'bytes12' },
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
        ],
      },
      { name: 'mandateHash', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'deriveAmounts',
    stateMutability: 'view',
    inputs: [
      {
        name: 'maximumClaimAmounts',
        type: 'tuple[]',
        components: [
          { name: 'lockTag', type: 'bytes12' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
      { name: 'priceCurve', type: 'uint256[]' },
      { name: 'targetBlock', type: 'uint256' },
      { name: 'fillBlock', type: 'uint256' },
      { name: 'minimumFillAmount', type: 'uint256' },
      { name: 'baselinePriorityFee', type: 'uint256' },
      { name: 'scalingFactor', type: 'uint256' },
    ],
    outputs: [
      { name: 'fillAmount', type: 'uint256' },
      { name: 'claimAmounts', type: 'uint256[]' },
    ],
  },
  {
    type: 'function',
    name: 'deriveAmountsFromComponents',
    stateMutability: 'view',
    inputs: [
      {
        name: 'maximumClaimAmounts',
        type: 'tuple[]',
        components: [
          { name: 'lockTag', type: 'bytes12' },
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
      },
      {
        name: 'components',
        type: 'tuple[]',
        components: [
          { name: 'fillToken', type: 'address' },
          { name: 'minimumFillAmount', type: 'uint256' },
          { name: 'recipient', type: 'address' },
          { name: 'applyScaling', type: 'bool' },
        ],
      },
      { name: 'priceCurve', type: 'uint256[]' },
      { name: 'targetBlock', type: 'uint256' },
      { name: 'fillBlock', type: 'uint256' },
      { name: 'baselinePriorityFee', type: 'uint256' },
      { name: 'scalingFactor', type: 'uint256' },
    ],
    outputs: [
      { name: 'fillAmounts', type: 'uint256[]' },
      { name: 'claimAmounts', type: 'uint256[]' },
    ],
  },

  // ======== Receive ========
  { type: 'receive', stateMutability: 'payable' },
] as const
