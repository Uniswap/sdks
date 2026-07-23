import { type Abi } from 'viem'

/**
 * Minimal, exact ABIs for the margin stack. Each is `as const satisfies Abi` so viem/wagmi infer
 * argument and return types. Function and struct layouts were verified against the deployed
 * mainnet contracts (each entry point selector confirmed via an expired-deadline `DeadlinePassed`
 * revert; every read called live).
 */

const MARKET_COMPONENTS = [
  { name: 'collateral', type: 'address' },
  { name: 'debt', type: 'address' },
] as const

const POOL_KEY_COMPONENTS = [
  { name: 'currency0', type: 'address' },
  { name: 'currency1', type: 'address' },
  { name: 'fee', type: 'uint24' },
  { name: 'tickSpacing', type: 'int24' },
  { name: 'hooks', type: 'address' },
] as const

export const MARGIN_ROUTER_ABI = [
  // -------------------------------------------------------------------------
  // Position entry points
  // -------------------------------------------------------------------------
  {
    type: 'function',
    name: 'increasePosition',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'adapter', type: 'address' },
          { name: 'market', type: 'tuple', components: MARKET_COMPONENTS },
          { name: 'poolKey', type: 'tuple', components: POOL_KEY_COMPONENTS },
          { name: 'equity', type: 'uint256' },
          { name: 'collateralToBuy', type: 'uint128' },
          { name: 'maxDebtIn', type: 'uint128' },
          { name: 'minHopPriceX36', type: 'uint256' },
          { name: 'maxLtvAfter', type: 'uint256' },
          { name: 'subId', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
    ],
    outputs: [{ name: 'account', type: 'address' }],
  },
  {
    type: 'function',
    name: 'decreasePosition',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'adapter', type: 'address' },
          { name: 'market', type: 'tuple', components: MARKET_COMPONENTS },
          { name: 'poolKey', type: 'tuple', components: POOL_KEY_COMPONENTS },
          { name: 'debtToRepay', type: 'uint256' },
          { name: 'maxCollateralIn', type: 'uint128' },
          { name: 'minHopPriceX36', type: 'uint256' },
          { name: 'maxLtvAfter', type: 'uint256' },
          { name: 'subId', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
    ],
    outputs: [{ name: 'account', type: 'address' }],
  },
  {
    type: 'function',
    name: 'addCollateral',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'adapter', type: 'address' },
          { name: 'market', type: 'tuple', components: MARKET_COMPONENTS },
          { name: 'amount', type: 'uint256' },
          { name: 'subId', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
    ],
    outputs: [{ name: 'account', type: 'address' }],
  },
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: 'unlockData', type: 'bytes' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
  // -------------------------------------------------------------------------
  // Accounts
  // -------------------------------------------------------------------------
  {
    type: 'function',
    name: 'accountOf',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'subId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'createAccount',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'subId', type: 'uint256' },
    ],
    outputs: [{ name: 'account', type: 'address' }],
  },
  {
    type: 'function',
    name: 'accountImplementation',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'manager',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  // -------------------------------------------------------------------------
  // Governance
  // -------------------------------------------------------------------------
  {
    type: 'function',
    name: 'governance',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'pendingGovernance',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'isAdapterAllowed',
    stateMutability: 'view',
    inputs: [{ name: 'adapter', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'setAdapterAllowed',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'adapter', type: 'address' },
      { name: 'allowed', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'transferGovernance',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'newGovernance', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'acceptGovernance',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  // -------------------------------------------------------------------------
  // Batching & Permit2 forwarding (inherited Multicall_v4 / Permit2Forwarder)
  // -------------------------------------------------------------------------
  {
    type: 'function',
    name: 'multicall',
    stateMutability: 'payable',
    inputs: [{ name: 'data', type: 'bytes[]' }],
    outputs: [{ name: 'results', type: 'bytes[]' }],
  },
  {
    type: 'function',
    name: 'permit',
    stateMutability: 'payable',
    inputs: [
      { name: 'owner', type: 'address' },
      {
        name: 'permitSingle',
        type: 'tuple',
        components: [
          {
            name: 'details',
            type: 'tuple',
            components: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint160' },
              { name: 'expiration', type: 'uint48' },
              { name: 'nonce', type: 'uint48' },
            ],
          },
          { name: 'spender', type: 'address' },
          { name: 'sigDeadline', type: 'uint256' },
        ],
      },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [{ name: 'err', type: 'bytes' }],
  },
  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------
  {
    type: 'event',
    name: 'PositionIncreased',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'account', type: 'address', indexed: true },
      { name: 'collateral', type: 'address', indexed: false },
      { name: 'debt', type: 'address', indexed: false },
      { name: 'equity', type: 'uint256', indexed: false },
      { name: 'collateralBought', type: 'uint256', indexed: false },
      { name: 'debtDrawn', type: 'uint256', indexed: false },
      { name: 'collateralTotal', type: 'uint256', indexed: false },
      { name: 'debtTotal', type: 'uint256', indexed: false },
      { name: 'currentLtv', type: 'uint256', indexed: false },
      { name: 'maxLtv', type: 'uint256', indexed: false },
      { name: 'healthFactorWad', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PositionDecreased',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'account', type: 'address', indexed: true },
      { name: 'collateral', type: 'address', indexed: false },
      { name: 'debt', type: 'address', indexed: false },
      { name: 'debtRepaid', type: 'uint256', indexed: false },
      { name: 'collateralWithdrawn', type: 'uint256', indexed: false },
      { name: 'collateralReturned', type: 'uint256', indexed: false },
      { name: 'collateralTotal', type: 'uint256', indexed: false },
      { name: 'debtTotal', type: 'uint256', indexed: false },
      { name: 'currentLtv', type: 'uint256', indexed: false },
      { name: 'healthFactorWad', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CollateralAdded',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'account', type: 'address', indexed: true },
      { name: 'collateral', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'collateralTotal', type: 'uint256', indexed: false },
      { name: 'debtTotal', type: 'uint256', indexed: false },
      { name: 'currentLtv', type: 'uint256', indexed: false },
      { name: 'healthFactorWad', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AccountCreated',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'account', type: 'address', indexed: true },
      { name: 'subId', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AdapterAllowed',
    inputs: [
      { name: 'adapter', type: 'address', indexed: true },
      { name: 'allowed', type: 'bool', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'GovernanceTransferStarted',
    inputs: [
      { name: 'currentGovernance', type: 'address', indexed: true },
      { name: 'pendingGovernance', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'GovernanceTransferred',
    inputs: [
      { name: 'previousGovernance', type: 'address', indexed: true },
      { name: 'newGovernance', type: 'address', indexed: true },
    ],
  },
  // -------------------------------------------------------------------------
  // Errors
  // -------------------------------------------------------------------------
  { type: 'error', name: 'DeadlinePassed', inputs: [{ name: 'deadline', type: 'uint256' }] },
  { type: 'error', name: 'SlippageBoundRequired', inputs: [] },
  { type: 'error', name: 'PositionUnhealthy', inputs: [] },
  { type: 'error', name: 'AdapterNotAllowed', inputs: [{ name: 'adapter', type: 'address' }] },
  { type: 'error', name: 'NativeCollateralMismatch', inputs: [] },
  {
    type: 'error',
    name: 'IncompleteFill',
    inputs: [
      { name: 'requested', type: 'uint256' },
      { name: 'received', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'NoActiveAccount', inputs: [] },
  { type: 'error', name: 'MarketSwapMismatch', inputs: [] },
  { type: 'error', name: 'UnsupportedAction', inputs: [{ name: 'action', type: 'uint256' }] },
  {
    type: 'error',
    name: 'V4TooLittleReceived',
    inputs: [
      { name: 'minAmountOutReceived', type: 'uint256' },
      { name: 'amountReceived', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'V4TooMuchRequested',
    inputs: [
      { name: 'maxAmountInRequested', type: 'uint256' },
      { name: 'amountRequested', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'V4TooMuchRequestedPerHopSingle',
    inputs: [
      { name: 'minPrice', type: 'uint256' },
      { name: 'priceX36', type: 'uint256' },
    ],
  },
] as const satisfies Abi

/**
 * The venue-agnostic `ILendingAdapter` read surface plus the shared two-step ownership handoff.
 * Identical across the Morpho Blue, Aave v3, and Aave v4 adapters — only the adapter address (and
 * the `setMarket` governance signature, see the per-venue ABIs) changes.
 */
export const LENDING_ADAPTER_ABI = [
  {
    type: 'function',
    name: 'lendingProtocol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'isSupportedMarket',
    stateMutability: 'view',
    inputs: [{ name: 'market', type: 'tuple', components: MARKET_COMPONENTS }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'positionOf',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'market', type: 'tuple', components: MARKET_COMPONENTS },
    ],
    outputs: [
      { name: 'collateralAmount', type: 'uint256' },
      { name: 'debtAmount', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'maxLtvWad',
    stateMutability: 'view',
    inputs: [{ name: 'market', type: 'tuple', components: MARKET_COMPONENTS }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'currentLtvWad',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'market', type: 'tuple', components: MARKET_COMPONENTS },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'describePosition',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'market', type: 'tuple', components: MARKET_COMPONENTS },
    ],
    outputs: [
      {
        name: 'data',
        type: 'tuple',
        components: [
          { name: 'collateralAmount', type: 'uint256' },
          { name: 'debtAmount', type: 'uint256' },
          { name: 'maxLtv', type: 'uint256' },
          { name: 'currentLtv', type: 'uint256' },
          { name: 'healthFactorWad', type: 'uint256' },
        ],
      },
    ],
  },
  // encode* views: the (target, value, callData) the account executes. Useful for building the
  // owner escape-hatch `MarginAccount.execute(adapter, callData)` without protocol-specific code.
  {
    type: 'function',
    name: 'encodeSupplyCollateral',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'market', type: 'tuple', components: MARKET_COMPONENTS },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'callData', type: 'bytes' },
    ],
  },
  {
    type: 'function',
    name: 'encodeWithdrawCollateral',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'market', type: 'tuple', components: MARKET_COMPONENTS },
      { name: 'amount', type: 'uint256' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'callData', type: 'bytes' },
    ],
  },
  {
    type: 'function',
    name: 'encodeBorrow',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'market', type: 'tuple', components: MARKET_COMPONENTS },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'callData', type: 'bytes' },
    ],
  },
  {
    type: 'function',
    name: 'encodeRepay',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'market', type: 'tuple', components: MARKET_COMPONENTS },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'callData', type: 'bytes' },
    ],
  },
  // Two-step ownership (OwnableAdapter / Owner type)
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'pendingOwner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'transferOwnership',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'newOwner', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'acceptOwnership',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'error',
    name: 'MarketNotSupported',
    inputs: [
      { name: 'collateral', type: 'address' },
      { name: 'debt', type: 'address' },
    ],
  },
  { type: 'error', name: 'NotOwner', inputs: [{ name: 'caller', type: 'address' }] },
  { type: 'error', name: 'ZeroOwner', inputs: [] },
  { type: 'error', name: 'NotPendingOwner', inputs: [{ name: 'caller', type: 'address' }] },
] as const satisfies Abi

/** MorphoLendingAdapter extras: Morpho Blue `MarketParams`-keyed market curation. */
export const MORPHO_LENDING_ADAPTER_ABI = [
  ...LENDING_ADAPTER_ABI,
  {
    type: 'function',
    name: 'setMarket',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'marketParams',
        type: 'tuple',
        components: [
          { name: 'loanToken', type: 'address' },
          { name: 'collateralToken', type: 'address' },
          { name: 'oracle', type: 'address' },
          { name: 'irm', type: 'address' },
          { name: 'lltv', type: 'uint256' },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'MarketSet',
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true },
      { name: 'collateral', type: 'address', indexed: true },
      { name: 'debt', type: 'address', indexed: true },
      { name: 'oracle', type: 'address', indexed: false },
      { name: 'irm', type: 'address', indexed: false },
      { name: 'lltv', type: 'uint256', indexed: false },
    ],
  },
  { type: 'error', name: 'MorphoMarketNotCreated', inputs: [] },
] as const satisfies Abi

/** AaveLendingAdapter (Aave v3) extras: pair-allowlist market curation. */
export const AAVE_LENDING_ADAPTER_ABI = [
  ...LENDING_ADAPTER_ABI,
  {
    type: 'function',
    name: 'setMarket',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'collateral', type: 'address' },
      { name: 'debt', type: 'address' },
      { name: 'allowed', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'MarketSet',
    inputs: [
      { name: 'collateral', type: 'address', indexed: true },
      { name: 'debt', type: 'address', indexed: true },
      { name: 'allowed', type: 'bool', indexed: false },
    ],
  },
] as const satisfies Abi

/** AaveV4LendingAdapter extras: per-Spoke reserveId-routed market curation. */
export const AAVE_V4_LENDING_ADAPTER_ABI = [
  ...LENDING_ADAPTER_ABI,
  {
    type: 'function',
    name: 'setMarket',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'collateral', type: 'address' },
      { name: 'debt', type: 'address' },
      { name: 'collateralReserveId', type: 'uint256' },
      { name: 'debtReserveId', type: 'uint256' },
      { name: 'allowed', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'MarketSet',
    inputs: [
      { name: 'collateral', type: 'address', indexed: true },
      { name: 'debt', type: 'address', indexed: true },
      { name: 'collateralReserveId', type: 'uint256', indexed: false },
      { name: 'debtReserveId', type: 'uint256', indexed: false },
      { name: 'allowed', type: 'bool', indexed: false },
    ],
  },
  {
    type: 'error',
    name: 'ReserveMismatch',
    inputs: [
      { name: 'reserveId', type: 'uint256' },
      { name: 'expected', type: 'address' },
      { name: 'actual', type: 'address' },
    ],
  },
  {
    type: 'error',
    name: 'HubMismatch',
    inputs: [
      { name: 'collateralHub', type: 'address' },
      { name: 'debtHub', type: 'address' },
    ],
  },
] as const satisfies Abi

/** The per-user MarginAccount clone (fund-moving primitives + owner escape hatch). */
export const MARGIN_ACCOUNT_ABI = [
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'manager',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'supplyCollateral',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'adapter', type: 'address' },
      { name: 'market', type: 'tuple', components: MARKET_COMPONENTS },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'supplied', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'withdrawCollateral',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'adapter', type: 'address' },
      { name: 'market', type: 'tuple', components: MARKET_COMPONENTS },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ name: 'withdrawn', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'borrow',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'adapter', type: 'address' },
      { name: 'market', type: 'tuple', components: MARKET_COMPONENTS },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ name: 'borrowed', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'repay',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'adapter', type: 'address' },
      { name: 'market', type: 'tuple', components: MARKET_COMPONENTS },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'repaid', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'sweep',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'currency', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: 'adapter', type: 'address' },
      { name: 'adapterCall', type: 'bytes' },
    ],
    outputs: [{ name: 'result', type: 'bytes' }],
  },
  {
    type: 'event',
    name: 'CollateralSupplied',
    inputs: [
      { name: 'caller', type: 'address', indexed: true },
      { name: 'adapter', type: 'address', indexed: true },
      { name: 'collateral', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CollateralWithdrawn',
    inputs: [
      { name: 'caller', type: 'address', indexed: true },
      { name: 'adapter', type: 'address', indexed: true },
      { name: 'collateral', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'to', type: 'address', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Borrowed',
    inputs: [
      { name: 'caller', type: 'address', indexed: true },
      { name: 'adapter', type: 'address', indexed: true },
      { name: 'debt', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'to', type: 'address', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Repaid',
    inputs: [
      { name: 'caller', type: 'address', indexed: true },
      { name: 'adapter', type: 'address', indexed: true },
      { name: 'debt', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Swept',
    inputs: [
      { name: 'caller', type: 'address', indexed: true },
      { name: 'currency', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'to', type: 'address', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Executed',
    inputs: [
      { name: 'caller', type: 'address', indexed: true },
      { name: 'adapter', type: 'address', indexed: true },
      { name: 'target', type: 'address', indexed: false },
    ],
  },
  { type: 'error', name: 'NotAuthorized', inputs: [] },
  { type: 'error', name: 'ReceiverNotAllowed', inputs: [{ name: 'to', type: 'address' }] },
] as const satisfies Abi

/** Minimal Permit2 AllowanceTransfer surface used by the equity-funding flow. */
export const PERMIT2_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
] as const satisfies Abi
