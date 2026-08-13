/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Forge-generated ABI bindings for the margin trading periphery.
 * Pinned to v4-periphery commit 3d03ca50ced55e3940909680e45d25024bcfbcfd
 * (https://github.com/Uniswap/v4-periphery/commit/3d03ca50ced55e3940909680e45d25024bcfbcfd)
 *
 * Regenerate with `bun run regenerate:abis`; CI verifies the bindings against a fresh build of
 * the pinned commit via `bun run check:abis`. LENDING_ADAPTER_ABI is the venue-agnostic surface:
 * the compiled ILendingAdapter interface plus the ownership functions and shared errors selected
 * from the compiled MorphoLendingAdapter ABI (identical across venues; the check gate proves the
 * per-venue ABIs against their own contracts).
 */
import { type Abi } from 'viem'

/** The v4-periphery source this file was generated from. */
export const V4_PERIPHERY_PIN = {
  repository: 'Uniswap/v4-periphery',
  commit: '3d03ca50ced55e3940909680e45d25024bcfbcfd',
} as const

/** src/MarginRouter.sol:MarginRouter */
export const MARGIN_ROUTER_ABI = [
  {
    type: 'constructor',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'poolManager_',
      },
      {
        type: 'address',
        name: 'permit2_',
      },
      {
        type: 'address',
        name: 'weth9_',
      },
      {
        type: 'address',
        name: 'accountImplementation',
      },
      {
        type: 'address',
        name: 'governance_',
      },
    ],
  },
  {
    type: 'receive',
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'WETH9',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'acceptGovernance',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'accountImplementation',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'accountOf',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'owner',
      },
      {
        type: 'uint256',
        name: 'subId',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'addCollateral',
    stateMutability: 'payable',
    inputs: [
      {
        type: 'tuple',
        name: 'params',
        components: [
          {
            type: 'address',
            name: 'adapter',
          },
          {
            type: 'tuple',
            name: 'market',
            components: [
              {
                type: 'address',
                name: 'collateral',
              },
              {
                type: 'address',
                name: 'debt',
              },
            ],
          },
          {
            type: 'uint256',
            name: 'amount',
          },
          {
            type: 'uint256',
            name: 'subId',
          },
          {
            type: 'uint256',
            name: 'deadline',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'address',
        name: 'account',
      },
    ],
  },
  {
    type: 'function',
    name: 'createAccount',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'owner',
      },
      {
        type: 'uint256',
        name: 'subId',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'decreasePosition',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'tuple',
        name: 'params',
        components: [
          {
            type: 'address',
            name: 'adapter',
          },
          {
            type: 'tuple',
            name: 'market',
            components: [
              {
                type: 'address',
                name: 'collateral',
              },
              {
                type: 'address',
                name: 'debt',
              },
            ],
          },
          {
            type: 'uint256',
            name: 'debtToRepay',
          },
          {
            type: 'uint128',
            name: 'maxCollateralIn',
          },
          {
            type: 'address',
            name: 'universalRouter',
          },
          {
            type: 'bytes',
            name: 'routeCommands',
          },
          {
            type: 'bytes[]',
            name: 'routeInputs',
          },
          {
            type: 'uint256',
            name: 'maxLtvAfter',
          },
          {
            type: 'uint256',
            name: 'subId',
          },
          {
            type: 'uint256',
            name: 'deadline',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'address',
        name: 'account',
      },
    ],
  },
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      {
        type: 'bytes',
        name: 'unlockData',
      },
      {
        type: 'uint256',
        name: 'deadline',
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'governance',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'increasePosition',
    stateMutability: 'payable',
    inputs: [
      {
        type: 'tuple',
        name: 'params',
        components: [
          {
            type: 'address',
            name: 'adapter',
          },
          {
            type: 'tuple',
            name: 'market',
            components: [
              {
                type: 'address',
                name: 'collateral',
              },
              {
                type: 'address',
                name: 'debt',
              },
            ],
          },
          {
            type: 'uint256',
            name: 'equity',
          },
          {
            type: 'uint128',
            name: 'collateralToBuy',
          },
          {
            type: 'uint128',
            name: 'maxDebtIn',
          },
          {
            type: 'address',
            name: 'universalRouter',
          },
          {
            type: 'bytes',
            name: 'routeCommands',
          },
          {
            type: 'bytes[]',
            name: 'routeInputs',
          },
          {
            type: 'uint256',
            name: 'maxLtvAfter',
          },
          {
            type: 'uint256',
            name: 'subId',
          },
          {
            type: 'uint256',
            name: 'deadline',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'address',
        name: 'account',
      },
    ],
  },
  {
    type: 'function',
    name: 'isAdapterAllowed',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'adapter',
      },
    ],
    outputs: [
      {
        type: 'bool',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'manager',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'msgSender',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'multicall',
    stateMutability: 'payable',
    inputs: [
      {
        type: 'bytes[]',
        name: 'data',
      },
    ],
    outputs: [
      {
        type: 'bytes[]',
        name: 'results',
      },
    ],
  },
  {
    type: 'function',
    name: 'pendingGovernance',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'permit',
    stateMutability: 'payable',
    inputs: [
      {
        type: 'address',
        name: 'owner',
      },
      {
        type: 'tuple',
        name: 'permitSingle',
        components: [
          {
            type: 'tuple',
            name: 'details',
            components: [
              {
                type: 'address',
                name: 'token',
              },
              {
                type: 'uint160',
                name: 'amount',
              },
              {
                type: 'uint48',
                name: 'expiration',
              },
              {
                type: 'uint48',
                name: 'nonce',
              },
            ],
          },
          {
            type: 'address',
            name: 'spender',
          },
          {
            type: 'uint256',
            name: 'sigDeadline',
          },
        ],
      },
      {
        type: 'bytes',
        name: 'signature',
      },
    ],
    outputs: [
      {
        type: 'bytes',
        name: 'err',
      },
    ],
  },
  {
    type: 'function',
    name: 'permit2',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'permitBatch',
    stateMutability: 'payable',
    inputs: [
      {
        type: 'address',
        name: 'owner',
      },
      {
        type: 'tuple',
        name: '_permitBatch',
        components: [
          {
            type: 'tuple[]',
            name: 'details',
            components: [
              {
                type: 'address',
                name: 'token',
              },
              {
                type: 'uint160',
                name: 'amount',
              },
              {
                type: 'uint48',
                name: 'expiration',
              },
              {
                type: 'uint48',
                name: 'nonce',
              },
            ],
          },
          {
            type: 'address',
            name: 'spender',
          },
          {
            type: 'uint256',
            name: 'sigDeadline',
          },
        ],
      },
      {
        type: 'bytes',
        name: 'signature',
      },
    ],
    outputs: [
      {
        type: 'bytes',
        name: 'err',
      },
    ],
  },
  {
    type: 'function',
    name: 'poolManager',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'setAdapterAllowed',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'adapter',
      },
      {
        type: 'bool',
        name: 'allowed',
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'transferGovernance',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'newGovernance',
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'unlockCallback',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'bytes',
        name: 'data',
      },
    ],
    outputs: [
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'event',
    name: 'AccountCreated',
    anonymous: false,
    inputs: [
      {
        type: 'address',
        name: 'owner',
        indexed: true,
      },
      {
        type: 'address',
        name: 'account',
        indexed: true,
      },
      {
        type: 'uint256',
        name: 'subId',
        indexed: false,
      },
    ],
  },
  {
    type: 'event',
    name: 'AdapterAllowed',
    anonymous: false,
    inputs: [
      {
        type: 'address',
        name: 'adapter',
        indexed: true,
      },
      {
        type: 'bool',
        name: 'allowed',
        indexed: false,
      },
    ],
  },
  {
    type: 'event',
    name: 'CollateralAdded',
    anonymous: false,
    inputs: [
      {
        type: 'address',
        name: 'owner',
        indexed: true,
      },
      {
        type: 'address',
        name: 'account',
        indexed: true,
      },
      {
        type: 'address',
        name: 'collateral',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'amount',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'collateralTotal',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'debtTotal',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'currentLtv',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'healthFactorWad',
        indexed: false,
      },
    ],
  },
  {
    type: 'event',
    name: 'GovernanceTransferStarted',
    anonymous: false,
    inputs: [
      {
        type: 'address',
        name: 'currentGovernance',
        indexed: true,
      },
      {
        type: 'address',
        name: 'pendingGovernance',
        indexed: true,
      },
    ],
  },
  {
    type: 'event',
    name: 'GovernanceTransferred',
    anonymous: false,
    inputs: [
      {
        type: 'address',
        name: 'previousGovernance',
        indexed: true,
      },
      {
        type: 'address',
        name: 'newGovernance',
        indexed: true,
      },
    ],
  },
  {
    type: 'event',
    name: 'PositionDecreased',
    anonymous: false,
    inputs: [
      {
        type: 'address',
        name: 'owner',
        indexed: true,
      },
      {
        type: 'address',
        name: 'account',
        indexed: true,
      },
      {
        type: 'address',
        name: 'collateral',
        indexed: false,
      },
      {
        type: 'address',
        name: 'debt',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'debtRepaid',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'collateralWithdrawn',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'collateralReturned',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'collateralTotal',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'debtTotal',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'currentLtv',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'healthFactorWad',
        indexed: false,
      },
    ],
  },
  {
    type: 'event',
    name: 'PositionIncreased',
    anonymous: false,
    inputs: [
      {
        type: 'address',
        name: 'owner',
        indexed: true,
      },
      {
        type: 'address',
        name: 'account',
        indexed: true,
      },
      {
        type: 'address',
        name: 'collateral',
        indexed: false,
      },
      {
        type: 'address',
        name: 'debt',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'equity',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'collateralBought',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'debtDrawn',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'collateralTotal',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'debtTotal',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'currentLtv',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'maxLtv',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'healthFactorWad',
        indexed: false,
      },
    ],
  },
  {
    type: 'event',
    name: 'PositionUpdated',
    anonymous: false,
    inputs: [
      {
        type: 'address',
        name: 'owner',
        indexed: true,
      },
      {
        type: 'address',
        name: 'account',
        indexed: true,
      },
      {
        type: 'address',
        name: 'collateral',
        indexed: false,
      },
      {
        type: 'address',
        name: 'debt',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'collateralTotal',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'debtTotal',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'currentLtv',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'maxLtv',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'healthFactorWad',
        indexed: false,
      },
    ],
  },
  {
    type: 'error',
    name: 'AdapterNotAllowed',
    inputs: [
      {
        type: 'address',
        name: 'adapter',
      },
    ],
  },
  {
    type: 'error',
    name: 'AddressEmptyCode',
    inputs: [
      {
        type: 'address',
        name: 'target',
      },
    ],
  },
  {
    type: 'error',
    name: 'AddressInsufficientBalance',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
    ],
  },
  {
    type: 'error',
    name: 'ContractLocked',
    inputs: [],
  },
  {
    type: 'error',
    name: 'DeadlinePassed',
    inputs: [
      {
        type: 'uint256',
        name: 'deadline',
      },
    ],
  },
  {
    type: 'error',
    name: 'DeltaNotNegative',
    inputs: [
      {
        type: 'address',
        name: 'currency',
      },
    ],
  },
  {
    type: 'error',
    name: 'DeltaNotPositive',
    inputs: [
      {
        type: 'address',
        name: 'currency',
      },
    ],
  },
  {
    type: 'error',
    name: 'FailedInnerCall',
    inputs: [],
  },
  {
    type: 'error',
    name: 'IncompleteFill',
    inputs: [
      {
        type: 'uint256',
        name: 'requested',
      },
      {
        type: 'uint256',
        name: 'received',
      },
    ],
  },
  {
    type: 'error',
    name: 'IneffectiveLtvBound',
    inputs: [
      {
        type: 'uint256',
        name: 'maxLtvAfter',
      },
    ],
  },
  {
    type: 'error',
    name: 'InputLengthMismatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InsufficientBalance',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidBips',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidEthSender',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidHopPriceLength',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NativeCollateralMismatch',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NoActiveAccount',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotOwner',
    inputs: [
      {
        type: 'address',
        name: 'caller',
      },
    ],
  },
  {
    type: 'error',
    name: 'NotPendingOwner',
    inputs: [
      {
        type: 'address',
        name: 'caller',
      },
    ],
  },
  {
    type: 'error',
    name: 'NotPoolManager',
    inputs: [],
  },
  {
    type: 'error',
    name: 'PositionUnhealthy',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SafeERC20FailedOperation',
    inputs: [
      {
        type: 'address',
        name: 'token',
      },
    ],
  },
  {
    type: 'error',
    name: 'SlippageBoundRequired',
    inputs: [],
  },
  {
    type: 'error',
    name: 'UniversalRouterNotSet',
    inputs: [],
  },
  {
    type: 'error',
    name: 'UnsupportedAction',
    inputs: [
      {
        type: 'uint256',
        name: 'action',
      },
    ],
  },
  {
    type: 'error',
    name: 'V4ExactOutputUnfilled',
    inputs: [
      {
        type: 'uint256',
        name: 'amountOutRequested',
      },
      {
        type: 'uint256',
        name: 'amountOutReceived',
      },
    ],
  },
  {
    type: 'error',
    name: 'V4TooLittleReceived',
    inputs: [
      {
        type: 'uint256',
        name: 'minAmountOutReceived',
      },
      {
        type: 'uint256',
        name: 'amountReceived',
      },
    ],
  },
  {
    type: 'error',
    name: 'V4TooLittleReceivedPerHop',
    inputs: [
      {
        type: 'uint256',
        name: 'hopIndex',
      },
      {
        type: 'uint256',
        name: 'minPrice',
      },
      {
        type: 'uint256',
        name: 'price',
      },
    ],
  },
  {
    type: 'error',
    name: 'V4TooLittleReceivedPerHopSingle',
    inputs: [
      {
        type: 'uint256',
        name: 'minPrice',
      },
      {
        type: 'uint256',
        name: 'price',
      },
    ],
  },
  {
    type: 'error',
    name: 'V4TooMuchRequested',
    inputs: [
      {
        type: 'uint256',
        name: 'maxAmountInRequested',
      },
      {
        type: 'uint256',
        name: 'amountRequested',
      },
    ],
  },
  {
    type: 'error',
    name: 'V4TooMuchRequestedPerHop',
    inputs: [
      {
        type: 'uint256',
        name: 'hopIndex',
      },
      {
        type: 'uint256',
        name: 'minPrice',
      },
      {
        type: 'uint256',
        name: 'price',
      },
    ],
  },
  {
    type: 'error',
    name: 'V4TooMuchRequestedPerHopSingle',
    inputs: [
      {
        type: 'uint256',
        name: 'minPrice',
      },
      {
        type: 'uint256',
        name: 'price',
      },
    ],
  },
  {
    type: 'error',
    name: 'ZeroAddress',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ZeroAmount',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ZeroOwner',
    inputs: [],
  },
] as const satisfies Abi

/** src/MarginAccount.sol:MarginAccount */
export const MARGIN_ACCOUNT_ABI = [
  {
    type: 'receive',
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'borrow',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'adapter',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
      {
        type: 'address',
        name: 'to',
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: 'borrowed',
      },
    ],
  },
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      {
        type: 'address',
        name: 'adapter',
      },
      {
        type: 'bytes',
        name: 'adapterCall',
      },
    ],
    outputs: [
      {
        type: 'bytes',
        name: 'result',
      },
    ],
  },
  {
    type: 'function',
    name: 'manager',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: 'managerAddr',
      },
    ],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: 'ownerAddr',
      },
    ],
  },
  {
    type: 'function',
    name: 'repay',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'adapter',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: 'repaid',
      },
    ],
  },
  {
    type: 'function',
    name: 'supplyCollateral',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'adapter',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'sweep',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'currency',
      },
      {
        type: 'uint256',
        name: 'amount',
      },
      {
        type: 'address',
        name: 'to',
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdrawCollateral',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'adapter',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
      {
        type: 'address',
        name: 'to',
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: 'withdrawn',
      },
    ],
  },
  {
    type: 'event',
    name: 'Borrowed',
    anonymous: false,
    inputs: [
      {
        type: 'address',
        name: 'caller',
        indexed: true,
      },
      {
        type: 'address',
        name: 'adapter',
        indexed: true,
      },
      {
        type: 'address',
        name: 'debt',
        indexed: true,
      },
      {
        type: 'uint256',
        name: 'amount',
        indexed: false,
      },
      {
        type: 'address',
        name: 'to',
        indexed: false,
      },
    ],
  },
  {
    type: 'event',
    name: 'CollateralSupplied',
    anonymous: false,
    inputs: [
      {
        type: 'address',
        name: 'caller',
        indexed: true,
      },
      {
        type: 'address',
        name: 'adapter',
        indexed: true,
      },
      {
        type: 'address',
        name: 'collateral',
        indexed: true,
      },
      {
        type: 'uint256',
        name: 'amount',
        indexed: false,
      },
    ],
  },
  {
    type: 'event',
    name: 'CollateralWithdrawn',
    anonymous: false,
    inputs: [
      {
        type: 'address',
        name: 'caller',
        indexed: true,
      },
      {
        type: 'address',
        name: 'adapter',
        indexed: true,
      },
      {
        type: 'address',
        name: 'collateral',
        indexed: true,
      },
      {
        type: 'uint256',
        name: 'amount',
        indexed: false,
      },
      {
        type: 'address',
        name: 'to',
        indexed: false,
      },
    ],
  },
  {
    type: 'event',
    name: 'Executed',
    anonymous: false,
    inputs: [
      {
        type: 'address',
        name: 'caller',
        indexed: true,
      },
      {
        type: 'address',
        name: 'adapter',
        indexed: true,
      },
      {
        type: 'address',
        name: 'target',
        indexed: false,
      },
    ],
  },
  {
    type: 'event',
    name: 'Repaid',
    anonymous: false,
    inputs: [
      {
        type: 'address',
        name: 'caller',
        indexed: true,
      },
      {
        type: 'address',
        name: 'adapter',
        indexed: true,
      },
      {
        type: 'address',
        name: 'debt',
        indexed: true,
      },
      {
        type: 'uint256',
        name: 'amount',
        indexed: false,
      },
    ],
  },
  {
    type: 'event',
    name: 'Swept',
    anonymous: false,
    inputs: [
      {
        type: 'address',
        name: 'caller',
        indexed: true,
      },
      {
        type: 'address',
        name: 'currency',
        indexed: true,
      },
      {
        type: 'uint256',
        name: 'amount',
        indexed: false,
      },
      {
        type: 'address',
        name: 'to',
        indexed: false,
      },
    ],
  },
  {
    type: 'error',
    name: 'AddressEmptyCode',
    inputs: [
      {
        type: 'address',
        name: 'target',
      },
    ],
  },
  {
    type: 'error',
    name: 'AddressInsufficientBalance',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
    ],
  },
  {
    type: 'error',
    name: 'FailedInnerCall',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotAuthorized',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ReceiverNotAllowed',
    inputs: [
      {
        type: 'address',
        name: 'to',
      },
    ],
  },
  {
    type: 'error',
    name: 'SafeERC20FailedOperation',
    inputs: [
      {
        type: 'address',
        name: 'token',
      },
    ],
  },
] as const satisfies Abi

/** src/MorphoLendingAdapter.sol:MorphoLendingAdapter */
export const MORPHO_LENDING_ADAPTER_ABI = [
  {
    type: 'constructor',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'morpho_',
      },
      {
        type: 'address',
        name: 'owner_',
      },
    ],
  },
  {
    type: 'function',
    name: 'acceptOwnership',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'currentLtvWad',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'describePosition',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'tuple',
        name: 'data',
        components: [
          {
            type: 'uint256',
            name: 'collateralAmount',
          },
          {
            type: 'uint256',
            name: 'debtAmount',
          },
          {
            type: 'uint256',
            name: 'maxLtv',
          },
          {
            type: 'uint256',
            name: 'currentLtv',
          },
          {
            type: 'uint256',
            name: 'healthFactorWad',
          },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeBorrow',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeEnableCollateral',
    stateMutability: 'pure',
    inputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'tuple',
        name: '',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeRepay',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeSupplyCollateral',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeWithdrawCollateral',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
      {
        type: 'address',
        name: 'receiver',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'isSupportedMarket',
    stateMutability: 'view',
    inputs: [
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'bool',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'lendingProtocol',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'maxLtvWad',
    stateMutability: 'view',
    inputs: [
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'morpho',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'pendingOwner',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'positionOf',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: 'collateralAmount',
      },
      {
        type: 'uint256',
        name: 'debtAmount',
      },
    ],
  },
  {
    type: 'function',
    name: 'resolveAmount',
    stateMutability: 'view',
    inputs: [
      {
        type: 'bytes',
        name: 'context',
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
  },
  {
    type: 'function',
    name: 'setMarket',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'tuple',
        name: 'marketParams',
        components: [
          {
            type: 'address',
            name: 'loanToken',
          },
          {
            type: 'address',
            name: 'collateralToken',
          },
          {
            type: 'address',
            name: 'oracle',
          },
          {
            type: 'address',
            name: 'irm',
          },
          {
            type: 'uint256',
            name: 'lltv',
          },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'transferOwnership',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'newOwner',
      },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'MarketSet',
    anonymous: false,
    inputs: [
      {
        type: 'bytes32',
        name: 'id',
        indexed: true,
      },
      {
        type: 'address',
        name: 'collateral',
        indexed: true,
      },
      {
        type: 'address',
        name: 'debt',
        indexed: true,
      },
      {
        type: 'address',
        name: 'oracle',
        indexed: false,
      },
      {
        type: 'address',
        name: 'irm',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'lltv',
        indexed: false,
      },
    ],
  },
  {
    type: 'error',
    name: 'MarketNotSupported',
    inputs: [
      {
        type: 'address',
        name: 'collateral',
      },
      {
        type: 'address',
        name: 'debt',
      },
    ],
  },
  {
    type: 'error',
    name: 'MathOverflowedMulDiv',
    inputs: [],
  },
  {
    type: 'error',
    name: 'MorphoMarketNotCreated',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotOwner',
    inputs: [
      {
        type: 'address',
        name: 'caller',
      },
    ],
  },
  {
    type: 'error',
    name: 'NotPendingOwner',
    inputs: [
      {
        type: 'address',
        name: 'caller',
      },
    ],
  },
  {
    type: 'error',
    name: 'ZeroAddress',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ZeroOwner',
    inputs: [],
  },
] as const satisfies Abi

/** src/AaveLendingAdapter.sol:AaveLendingAdapter */
export const AAVE_LENDING_ADAPTER_ABI = [
  {
    type: 'constructor',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'provider',
      },
      {
        type: 'address',
        name: 'owner_',
      },
    ],
  },
  {
    type: 'function',
    name: 'acceptOwnership',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'addressesProvider',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'currentLtvWad',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'dataProvider',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'describePosition',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'tuple',
        name: 'data',
        components: [
          {
            type: 'uint256',
            name: 'collateralAmount',
          },
          {
            type: 'uint256',
            name: 'debtAmount',
          },
          {
            type: 'uint256',
            name: 'maxLtv',
          },
          {
            type: 'uint256',
            name: 'currentLtv',
          },
          {
            type: 'uint256',
            name: 'healthFactorWad',
          },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeBorrow',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeEnableCollateral',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeRepay',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeSupplyCollateral',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeWithdrawCollateral',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
      {
        type: 'address',
        name: 'receiver',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'isSupportedMarket',
    stateMutability: 'view',
    inputs: [
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'bool',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'lendingProtocol',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'maxLtvWad',
    stateMutability: 'view',
    inputs: [
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'pendingOwner',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'pool',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'positionOf',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: 'collateralAmount',
      },
      {
        type: 'uint256',
        name: 'debtAmount',
      },
    ],
  },
  {
    type: 'function',
    name: 'resolveAmount',
    stateMutability: 'view',
    inputs: [
      {
        type: 'bytes',
        name: 'context',
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
  },
  {
    type: 'function',
    name: 'setMarket',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'collateral',
      },
      {
        type: 'address',
        name: 'debt',
      },
      {
        type: 'bool',
        name: 'allowed',
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'transferOwnership',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'newOwner',
      },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'MarketSet',
    anonymous: false,
    inputs: [
      {
        type: 'address',
        name: 'collateral',
        indexed: true,
      },
      {
        type: 'address',
        name: 'debt',
        indexed: true,
      },
      {
        type: 'bool',
        name: 'allowed',
        indexed: false,
      },
    ],
  },
  {
    type: 'error',
    name: 'AccountMismatch',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'address',
        name: 'caller',
      },
    ],
  },
  {
    type: 'error',
    name: 'MarketNotSupported',
    inputs: [
      {
        type: 'address',
        name: 'collateral',
      },
      {
        type: 'address',
        name: 'debt',
      },
    ],
  },
  {
    type: 'error',
    name: 'NotOwner',
    inputs: [
      {
        type: 'address',
        name: 'caller',
      },
    ],
  },
  {
    type: 'error',
    name: 'NotPendingOwner',
    inputs: [
      {
        type: 'address',
        name: 'caller',
      },
    ],
  },
  {
    type: 'error',
    name: 'ZeroAddress',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ZeroOwner',
    inputs: [],
  },
] as const satisfies Abi

/** src/AaveV4LendingAdapter.sol:AaveV4LendingAdapter */
export const AAVE_V4_LENDING_ADAPTER_ABI = [
  {
    type: 'constructor',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'spoke_',
      },
      {
        type: 'address',
        name: 'owner_',
      },
    ],
  },
  {
    type: 'function',
    name: 'acceptOwnership',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'currentLtvWad',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'describePosition',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'tuple',
        name: 'data',
        components: [
          {
            type: 'uint256',
            name: 'collateralAmount',
          },
          {
            type: 'uint256',
            name: 'debtAmount',
          },
          {
            type: 'uint256',
            name: 'maxLtv',
          },
          {
            type: 'uint256',
            name: 'currentLtv',
          },
          {
            type: 'uint256',
            name: 'healthFactorWad',
          },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeBorrow',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeEnableCollateral',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeRepay',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeSupplyCollateral',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeWithdrawCollateral',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
      {
        type: 'address',
        name: '',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'isSupportedMarket',
    stateMutability: 'view',
    inputs: [
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'bool',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'lendingProtocol',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'maxLtvWad',
    stateMutability: 'view',
    inputs: [
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'pendingOwner',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'positionOf',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: 'collateralAmount',
      },
      {
        type: 'uint256',
        name: 'debtAmount',
      },
    ],
  },
  {
    type: 'function',
    name: 'resolveAmount',
    stateMutability: 'view',
    inputs: [
      {
        type: 'bytes',
        name: 'context',
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
  },
  {
    type: 'function',
    name: 'setMarket',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'collateral',
      },
      {
        type: 'address',
        name: 'debt',
      },
      {
        type: 'uint256',
        name: 'collateralReserveId',
      },
      {
        type: 'uint256',
        name: 'debtReserveId',
      },
      {
        type: 'bool',
        name: 'allowed',
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'spoke',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'transferOwnership',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'newOwner',
      },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'MarketSet',
    anonymous: false,
    inputs: [
      {
        type: 'address',
        name: 'collateral',
        indexed: true,
      },
      {
        type: 'address',
        name: 'debt',
        indexed: true,
      },
      {
        type: 'uint256',
        name: 'collateralReserveId',
        indexed: false,
      },
      {
        type: 'uint256',
        name: 'debtReserveId',
        indexed: false,
      },
      {
        type: 'bool',
        name: 'allowed',
        indexed: false,
      },
    ],
  },
  {
    type: 'error',
    name: 'AccountMismatch',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'address',
        name: 'caller',
      },
    ],
  },
  {
    type: 'error',
    name: 'HubMismatch',
    inputs: [
      {
        type: 'address',
        name: 'collateralHub',
      },
      {
        type: 'address',
        name: 'debtHub',
      },
    ],
  },
  {
    type: 'error',
    name: 'MarketNotSupported',
    inputs: [
      {
        type: 'address',
        name: 'collateral',
      },
      {
        type: 'address',
        name: 'debt',
      },
    ],
  },
  {
    type: 'error',
    name: 'MathOverflowedMulDiv',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotOwner',
    inputs: [
      {
        type: 'address',
        name: 'caller',
      },
    ],
  },
  {
    type: 'error',
    name: 'NotPendingOwner',
    inputs: [
      {
        type: 'address',
        name: 'caller',
      },
    ],
  },
  {
    type: 'error',
    name: 'ReserveMismatch',
    inputs: [
      {
        type: 'uint256',
        name: 'reserveId',
      },
      {
        type: 'address',
        name: 'actualUnderlying',
      },
      {
        type: 'address',
        name: 'expectedUnderlying',
      },
    ],
  },
  {
    type: 'error',
    name: 'ZeroAddress',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ZeroOwner',
    inputs: [],
  },
] as const satisfies Abi

/** src/CompoundV3LendingAdapter.sol:CompoundV3LendingAdapter */
export const COMPOUND_V3_LENDING_ADAPTER_ABI = [
  {
    type: 'constructor',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'comet_',
      },
      {
        type: 'address',
        name: 'owner_',
      },
    ],
  },
  {
    type: 'function',
    name: 'acceptOwnership',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'baseScale',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'uint256',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'baseToken',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'baseTokenPriceFeed',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'comet',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'currentLtvWad',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'describePosition',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'tuple',
        name: 'data',
        components: [
          {
            type: 'uint256',
            name: 'collateralAmount',
          },
          {
            type: 'uint256',
            name: 'debtAmount',
          },
          {
            type: 'uint256',
            name: 'maxLtv',
          },
          {
            type: 'uint256',
            name: 'currentLtv',
          },
          {
            type: 'uint256',
            name: 'healthFactorWad',
          },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeBorrow',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeEnableCollateral',
    stateMutability: 'pure',
    inputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'tuple',
        name: '',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeRepay',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeSupplyCollateral',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeWithdrawCollateral',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
      {
        type: 'address',
        name: 'receiver',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: '',
      },
      {
        type: 'uint256',
        name: '',
      },
      {
        type: 'bytes',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'isSupportedMarket',
    stateMutability: 'view',
    inputs: [
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'bool',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'lendingProtocol',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'maxLtvWad',
    stateMutability: 'view',
    inputs: [
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'pendingOwner',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'positionOf',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: 'collateralAmount',
      },
      {
        type: 'uint256',
        name: 'debtAmount',
      },
    ],
  },
  {
    type: 'function',
    name: 'resolveAmount',
    stateMutability: 'view',
    inputs: [
      {
        type: 'bytes',
        name: 'context',
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
  },
  {
    type: 'function',
    name: 'setMarket',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'collateral',
      },
      {
        type: 'address',
        name: 'debt',
      },
      {
        type: 'bool',
        name: 'allowed',
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'transferOwnership',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'newOwner',
      },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'MarketSet',
    anonymous: false,
    inputs: [
      {
        type: 'address',
        name: 'collateral',
        indexed: true,
      },
      {
        type: 'address',
        name: 'debt',
        indexed: true,
      },
      {
        type: 'bool',
        name: 'allowed',
        indexed: false,
      },
    ],
  },
  {
    type: 'error',
    name: 'AccountMismatch',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'address',
        name: 'caller',
      },
    ],
  },
  {
    type: 'error',
    name: 'DebtNotBaseToken',
    inputs: [
      {
        type: 'address',
        name: 'debt',
      },
      {
        type: 'address',
        name: 'baseToken',
      },
    ],
  },
  {
    type: 'error',
    name: 'MarketNotSupported',
    inputs: [
      {
        type: 'address',
        name: 'collateral',
      },
      {
        type: 'address',
        name: 'debt',
      },
    ],
  },
  {
    type: 'error',
    name: 'MathOverflowedMulDiv',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotOwner',
    inputs: [
      {
        type: 'address',
        name: 'caller',
      },
    ],
  },
  {
    type: 'error',
    name: 'NotPendingOwner',
    inputs: [
      {
        type: 'address',
        name: 'caller',
      },
    ],
  },
  {
    type: 'error',
    name: 'ZeroAddress',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ZeroOwner',
    inputs: [],
  },
] as const satisfies Abi

/** src/interfaces/ILendingAdapter.sol:ILendingAdapter */
export const ILENDING_ADAPTER_ABI = [
  {
    type: 'function',
    name: 'currentLtvWad',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'describePosition',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'tuple',
        name: 'data',
        components: [
          {
            type: 'uint256',
            name: 'collateralAmount',
          },
          {
            type: 'uint256',
            name: 'debtAmount',
          },
          {
            type: 'uint256',
            name: 'maxLtv',
          },
          {
            type: 'uint256',
            name: 'currentLtv',
          },
          {
            type: 'uint256',
            name: 'healthFactorWad',
          },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeBorrow',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: 'target',
      },
      {
        type: 'uint256',
        name: 'value',
      },
      {
        type: 'bytes',
        name: 'callData',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeEnableCollateral',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'address',
        name: 'target',
      },
      {
        type: 'uint256',
        name: 'value',
      },
      {
        type: 'bytes',
        name: 'callData',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeRepay',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: 'target',
      },
      {
        type: 'uint256',
        name: 'value',
      },
      {
        type: 'bytes',
        name: 'callData',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeSupplyCollateral',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: 'target',
      },
      {
        type: 'uint256',
        name: 'value',
      },
      {
        type: 'bytes',
        name: 'callData',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeWithdrawCollateral',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
      {
        type: 'address',
        name: 'receiver',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: 'target',
      },
      {
        type: 'uint256',
        name: 'value',
      },
      {
        type: 'bytes',
        name: 'callData',
      },
    ],
  },
  {
    type: 'function',
    name: 'isSupportedMarket',
    stateMutability: 'view',
    inputs: [
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'bool',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'lendingProtocol',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'maxLtvWad',
    stateMutability: 'view',
    inputs: [
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'positionOf',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: 'collateralAmount',
      },
      {
        type: 'uint256',
        name: 'debtAmount',
      },
    ],
  },
] as const satisfies Abi

/** (assembled, see header) */
export const LENDING_ADAPTER_ABI = [
  {
    type: 'function',
    name: 'currentLtvWad',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'describePosition',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'tuple',
        name: 'data',
        components: [
          {
            type: 'uint256',
            name: 'collateralAmount',
          },
          {
            type: 'uint256',
            name: 'debtAmount',
          },
          {
            type: 'uint256',
            name: 'maxLtv',
          },
          {
            type: 'uint256',
            name: 'currentLtv',
          },
          {
            type: 'uint256',
            name: 'healthFactorWad',
          },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeBorrow',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: 'target',
      },
      {
        type: 'uint256',
        name: 'value',
      },
      {
        type: 'bytes',
        name: 'callData',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeEnableCollateral',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'address',
        name: 'target',
      },
      {
        type: 'uint256',
        name: 'value',
      },
      {
        type: 'bytes',
        name: 'callData',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeRepay',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: 'target',
      },
      {
        type: 'uint256',
        name: 'value',
      },
      {
        type: 'bytes',
        name: 'callData',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeSupplyCollateral',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: 'target',
      },
      {
        type: 'uint256',
        name: 'value',
      },
      {
        type: 'bytes',
        name: 'callData',
      },
    ],
  },
  {
    type: 'function',
    name: 'encodeWithdrawCollateral',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
      {
        type: 'uint256',
        name: 'amount',
      },
      {
        type: 'address',
        name: 'receiver',
      },
    ],
    outputs: [
      {
        type: 'address',
        name: 'target',
      },
      {
        type: 'uint256',
        name: 'value',
      },
      {
        type: 'bytes',
        name: 'callData',
      },
    ],
  },
  {
    type: 'function',
    name: 'isSupportedMarket',
    stateMutability: 'view',
    inputs: [
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'bool',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'lendingProtocol',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'maxLtvWad',
    stateMutability: 'view',
    inputs: [
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'positionOf',
    stateMutability: 'view',
    inputs: [
      {
        type: 'address',
        name: 'account',
      },
      {
        type: 'tuple',
        name: 'market',
        components: [
          {
            type: 'address',
            name: 'collateral',
          },
          {
            type: 'address',
            name: 'debt',
          },
        ],
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: 'collateralAmount',
      },
      {
        type: 'uint256',
        name: 'debtAmount',
      },
    ],
  },
  {
    type: 'function',
    name: 'acceptOwnership',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'pendingOwner',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        type: 'address',
        name: '',
      },
    ],
  },
  {
    type: 'function',
    name: 'resolveAmount',
    stateMutability: 'view',
    inputs: [
      {
        type: 'bytes',
        name: 'context',
      },
    ],
    outputs: [
      {
        type: 'uint256',
        name: 'amount',
      },
    ],
  },
  {
    type: 'function',
    name: 'transferOwnership',
    stateMutability: 'nonpayable',
    inputs: [
      {
        type: 'address',
        name: 'newOwner',
      },
    ],
    outputs: [],
  },
  {
    type: 'error',
    name: 'MarketNotSupported',
    inputs: [
      {
        type: 'address',
        name: 'collateral',
      },
      {
        type: 'address',
        name: 'debt',
      },
    ],
  },
  {
    type: 'error',
    name: 'NotOwner',
    inputs: [
      {
        type: 'address',
        name: 'caller',
      },
    ],
  },
  {
    type: 'error',
    name: 'NotPendingOwner',
    inputs: [
      {
        type: 'address',
        name: 'caller',
      },
    ],
  },
  {
    type: 'error',
    name: 'ZeroOwner',
    inputs: [],
  },
] as const satisfies Abi
