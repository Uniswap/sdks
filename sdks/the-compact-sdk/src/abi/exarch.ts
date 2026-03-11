/**
 * Exarch contract ABI for direct contract interaction
 *
 * Based on IExarch.sol interface
 */

export const exarchAbi = [
  // ======== Events ========
  {
    type: 'event',
    name: 'BidPlaced',
    inputs: [
      { name: 'claimHash', type: 'bytes32', indexed: true },
      { name: 'bidder', type: 'address', indexed: true },
      { name: 'claimant', type: 'bytes32', indexed: false },
      { name: 'bondAmount', type: 'uint256', indexed: false },
      { name: 'bidExpiry', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BidFilled',
    inputs: [
      { name: 'claimHash', type: 'bytes32', indexed: false },
      { name: 'claimant', type: 'bytes32', indexed: true },
      { name: 'aggregateBond', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BondForfeited',
    inputs: [
      { name: 'claimHash', type: 'bytes32', indexed: false },
      { name: 'claimant', type: 'bytes32', indexed: true },
      { name: 'bondAmount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BidRescinded',
    inputs: [
      { name: 'claimHash', type: 'bytes32', indexed: false },
      { name: 'claimant', type: 'bytes32', indexed: true },
      { name: 'refundAmount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Cancel',
    inputs: [
      { name: 'claimHash', type: 'bytes32', indexed: false },
      { name: 'sponsor', type: 'address', indexed: true },
      { name: 'aggregateBond', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Fill',
    inputs: [
      { name: 'claimHash', type: 'bytes32', indexed: false },
      { name: 'executionHash', type: 'bytes32', indexed: false },
      { name: 'filler', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'Dispatch',
    inputs: [
      { name: 'claimHash', type: 'bytes32', indexed: false },
      { name: 'target', type: 'address', indexed: true },
      { name: 'chainId', type: 'uint256', indexed: false },
    ],
  },

  // ======== Errors ========
  { type: 'error', name: 'InvalidBondAmount', inputs: [] },
  { type: 'error', name: 'BidWindowActive', inputs: [] },
  { type: 'error', name: 'BidWindowExpired', inputs: [] },
  { type: 'error', name: 'AlreadyFilled', inputs: [] },
  { type: 'error', name: 'AlreadyCancelled', inputs: [] },
  { type: 'error', name: 'Expired', inputs: [] },
  { type: 'error', name: 'NotActiveBidder', inputs: [] },
  { type: 'error', name: 'NotLegate', inputs: [] },
  { type: 'error', name: 'NotSponsor', inputs: [] },
  { type: 'error', name: 'NotClaimant', inputs: [] },
  { type: 'error', name: 'InvalidProof', inputs: [] },
  { type: 'error', name: 'NoBidActive', inputs: [] },
  { type: 'error', name: 'InvalidChainId', inputs: [] },
  { type: 'error', name: 'InvalidExarch', inputs: [] },
  { type: 'error', name: 'InvalidAdjustment', inputs: [] },
  { type: 'error', name: 'ValidityConditionsNotMet', inputs: [] },
  { type: 'error', name: 'InvalidFillHashArguments', inputs: [] },
  { type: 'error', name: 'InvalidRecipientCallback', inputs: [] },
  { type: 'error', name: 'InvalidDispatchCallback', inputs: [] },
  { type: 'error', name: 'InvalidExarchCallback', inputs: [] },
  { type: 'error', name: 'InvalidArbiter', inputs: [{ name: 'arbiter', type: 'address' }] },
  { type: 'error', name: 'NotExecuted', inputs: [] },
  { type: 'error', name: 'InvalidGasPrice', inputs: [] },
  { type: 'error', name: 'NotRegistered', inputs: [] },
  { type: 'error', name: 'InvalidRegistration', inputs: [] },

  // ======== Bidding Functions ========
  {
    type: 'function',
    name: 'placeBid',
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
      { name: 'legate', type: 'address' },
      {
        name: 'fillParams',
        type: 'tuple',
        components: [
          { name: 'chainId', type: 'uint256' },
          { name: 'exarch', type: 'address' },
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
          { name: 'bondAmount', type: 'uint256' },
          { name: 'earnestAmount', type: 'uint256' },
          { name: 'holdPeriod', type: 'uint256' },
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
      { name: 'fillHashes', type: 'bytes32[]' },
      {
        name: 'adjustment',
        type: 'tuple',
        components: [
          { name: 'adjuster', type: 'address' },
          { name: 'fillIndex', type: 'uint256' },
          { name: 'targetBlock', type: 'uint256' },
          { name: 'supplementalPriceCurve', type: 'uint256[]' },
          { name: 'validityConditions', type: 'bytes32' },
          { name: 'nonce', type: 'uint256' },
          { name: 'adjustmentAuthorization', type: 'bytes' },
        ],
      },
      { name: 'claimant', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'registerAndPlaceBid',
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
      { name: 'legate', type: 'address' },
      {
        name: 'fillParams',
        type: 'tuple',
        components: [
          { name: 'chainId', type: 'uint256' },
          { name: 'exarch', type: 'address' },
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
          { name: 'bondAmount', type: 'uint256' },
          { name: 'earnestAmount', type: 'uint256' },
          { name: 'holdPeriod', type: 'uint256' },
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
      { name: 'fillHashes', type: 'bytes32[]' },
      {
        name: 'adjustment',
        type: 'tuple',
        components: [
          { name: 'adjuster', type: 'address' },
          { name: 'fillIndex', type: 'uint256' },
          { name: 'targetBlock', type: 'uint256' },
          { name: 'supplementalPriceCurve', type: 'uint256[]' },
          { name: 'validityConditions', type: 'bytes32' },
          { name: 'nonce', type: 'uint256' },
          { name: 'adjustmentAuthorization', type: 'bytes' },
        ],
      },
      { name: 'claimant', type: 'bytes32' },
      { name: 'sponsorSignature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'registerViaPermit2AndPlaceBid',
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
      { name: 'legate', type: 'address' },
      {
        name: 'fillParams',
        type: 'tuple',
        components: [
          { name: 'chainId', type: 'uint256' },
          { name: 'exarch', type: 'address' },
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
          { name: 'bondAmount', type: 'uint256' },
          { name: 'earnestAmount', type: 'uint256' },
          { name: 'holdPeriod', type: 'uint256' },
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
      { name: 'fillHashes', type: 'bytes32[]' },
      {
        name: 'adjustment',
        type: 'tuple',
        components: [
          { name: 'adjuster', type: 'address' },
          { name: 'fillIndex', type: 'uint256' },
          { name: 'targetBlock', type: 'uint256' },
          { name: 'supplementalPriceCurve', type: 'uint256[]' },
          { name: 'validityConditions', type: 'bytes32' },
          { name: 'nonce', type: 'uint256' },
          { name: 'adjustmentAuthorization', type: 'bytes' },
        ],
      },
      { name: 'claimant', type: 'bytes32' },
      {
        name: 'permit2Args',
        type: 'tuple',
        components: [
          {
            name: 'permitted',
            type: 'tuple[]',
            components: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
          {
            name: 'details',
            type: 'tuple',
            components: [
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
              { name: 'lockTag', type: 'bytes12' },
            ],
          },
          { name: 'signature', type: 'bytes' },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'settleBid',
    stateMutability: 'nonpayable',
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
      { name: 'adjuster', type: 'address' },
      { name: 'legate', type: 'address' },
      {
        name: 'fillParams',
        type: 'tuple',
        components: [
          { name: 'chainId', type: 'uint256' },
          { name: 'exarch', type: 'address' },
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
          { name: 'bondAmount', type: 'uint256' },
          { name: 'earnestAmount', type: 'uint256' },
          { name: 'holdPeriod', type: 'uint256' },
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
      { name: 'fillHashes', type: 'bytes32[]' },
      { name: 'executionHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'rescindBid',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'claimHash', type: 'bytes32' }],
    outputs: [],
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
    outputs: [],
  },

  // ======== Fill Functions ========
  {
    type: 'function',
    name: 'fill',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'fillInstructions',
        type: 'tuple[]',
        components: [
          { name: 'fillToken', type: 'address' },
          { name: 'fillAmount', type: 'uint256' },
          { name: 'recipient', type: 'address' },
        ],
      },
      { name: 'claimHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'executionHash', type: 'bytes32' }],
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
      { name: 'mandateHash', type: 'bytes32' },
      {
        name: 'fillInstructions',
        type: 'tuple[]',
        components: [
          { name: 'fillToken', type: 'address' },
          { name: 'fillAmount', type: 'uint256' },
          { name: 'recipient', type: 'address' },
        ],
      },
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
      { name: 'executionHash', type: 'bytes32' },
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
      { name: 'executionHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'claimHash', type: 'bytes32' }],
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
      { name: 'mandateHash', type: 'bytes32' },
      {
        name: 'fillParams',
        type: 'tuple',
        components: [
          { name: 'chainId', type: 'uint256' },
          { name: 'exarch', type: 'address' },
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
          { name: 'bondAmount', type: 'uint256' },
          { name: 'earnestAmount', type: 'uint256' },
          { name: 'holdPeriod', type: 'uint256' },
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
          { name: 'nonce', type: 'uint256' },
          { name: 'adjustmentAuthorization', type: 'bytes' },
        ],
      },
      { name: 'claimant', type: 'bytes32' },
    ],
    outputs: [
      { name: 'claimHash', type: 'bytes32' },
      { name: 'fillAmounts', type: 'uint256[]' },
      { name: 'claimAmounts', type: 'uint256[]' },
    ],
  },
  {
    type: 'function',
    name: 'claimAndFillViaPermit2',
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
      { name: 'mandateHash', type: 'bytes32' },
      {
        name: 'fillParams',
        type: 'tuple',
        components: [
          { name: 'chainId', type: 'uint256' },
          { name: 'exarch', type: 'address' },
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
          { name: 'bondAmount', type: 'uint256' },
          { name: 'earnestAmount', type: 'uint256' },
          { name: 'holdPeriod', type: 'uint256' },
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
          { name: 'nonce', type: 'uint256' },
          { name: 'adjustmentAuthorization', type: 'bytes' },
        ],
      },
      { name: 'claimant', type: 'bytes32' },
      {
        name: 'permit2Args',
        type: 'tuple',
        components: [
          {
            name: 'permitted',
            type: 'tuple[]',
            components: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
          {
            name: 'details',
            type: 'tuple',
            components: [
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
              { name: 'lockTag', type: 'bytes12' },
            ],
          },
          { name: 'signature', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'claimHash', type: 'bytes32' },
      { name: 'fillAmounts', type: 'uint256[]' },
      { name: 'claimAmounts', type: 'uint256[]' },
    ],
  },

  // ======== View Functions ========
  {
    type: 'function',
    name: 'getAuctionState',
    stateMutability: 'view',
    inputs: [{ name: 'claimHash', type: 'bytes32' }],
    outputs: [
      { name: 'bidder', type: 'address' },
      { name: 'bond', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
      { name: 'claimant', type: 'bytes32' },
      { name: 'isFilled', type: 'bool' },
      { name: 'cancelled', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'canPlaceBid',
    stateMutability: 'view',
    inputs: [{ name: 'claimHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getBidState',
    stateMutability: 'view',
    inputs: [{ name: 'claimHash', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'claimant', type: 'bytes32' },
          { name: 'scalingFactor', type: 'uint256' },
          { name: 'packedData', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'executed',
    stateMutability: 'view',
    inputs: [{ name: 'executionHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isNonceConsumed',
    stateMutability: 'view',
    inputs: [
      { name: 'adjuster', type: 'address' },
      { name: 'nonce', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const
