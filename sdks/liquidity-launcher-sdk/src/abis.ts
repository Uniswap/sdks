import { type Abi } from 'viem'

/**
 * Minimal, exact ABIs for the launch stack. Each is `as const satisfies Abi` so viem/wagmi infer
 * argument and return types. Only the functions the SDK needs are included.
 */

export const LIQUIDITY_LAUNCHER_ABI = [
  {
    type: 'function',
    name: 'createToken',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'factory', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'decimals', type: 'uint8' },
      { name: 'initialSupply', type: 'uint128' },
      { name: 'recipient', type: 'address' },
      { name: 'tokenData', type: 'bytes' },
    ],
    outputs: [{ name: 'tokenAddress', type: 'address' }],
  },
  {
    type: 'function',
    name: 'distributeToken',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      {
        name: 'distribution',
        type: 'tuple',
        components: [
          { name: 'strategy', type: 'address' },
          { name: 'amount', type: 'uint128' },
          { name: 'configData', type: 'bytes' },
        ],
      },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'depositToken',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint160' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'multicall',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'data', type: 'bytes[]' }],
    outputs: [{ name: 'results', type: 'bytes[]' }],
  },
] as const satisfies Abi

export const LBP_STRATEGY_ABI = [
  {
    // The one-shot pool-id reservation, set at `distributeToken` and cleared on the first `migrate()`.
    // Returns address(0) when the pool id is free.
    type: 'function',
    name: 'registeredPoolIds',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ name: 'initializer', type: 'address' }],
  },
  {
    type: 'function',
    name: 'initializerFactory',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    // Permissionless, one-shot success-path migration. Sweeps the raised currency out of the
    // auction (initializer) and seeds the v4 pool. Reverts until the auction is finalized &
    // graduated and its `migrationBlock` has passed.
    type: 'function',
    name: 'migrate',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'initializer', type: 'address' }],
    outputs: [],
  },
] as const satisfies Abi

/**
 * ContinuousClearingAuction instance — post-auction outcome views and the creator token-recovery
 * entrypoint. `sweepUnsoldTokens()` is callable only by `tokensRecipient()` after `endBlock`, once
 * (`sweepUnsoldTokensBlock() != 0` afterwards): on a failed (non-graduated) auction it returns the
 * full deposited supply; on a graduated one, `remainingSupply()`. There is no failure enum on-chain —
 * a failed auction is `currentBlock >= endBlock && !isGraduated()`.
 */
export const CCA_ABI = [
  {
    type: 'function',
    name: 'sweepUnsoldTokens',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isGraduated',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    // 0 until swept; set to the sweep block afterwards (one-shot latch).
    type: 'function',
    name: 'sweepUnsoldTokensBlock',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    // 0 until the raised currency is swept (the strategy's `migrate()` does this on success).
    type: 'function',
    name: 'sweepCurrencyBlock',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'currencyRaised',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'remainingSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'tokensRecipient',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'endBlock',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'claimBlock',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
  },
] as const satisfies Abi

/** ContinuousClearingAuction factory — deterministic auction (initializer) address view. */
export const CCA_FACTORY_ABI = [
  {
    type: 'function',
    name: 'getAddress',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'configData', type: 'bytes' },
      { name: 'salt', type: 'bytes32' },
      { name: 'sender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'address' }],
  },
] as const satisfies Abi

export const UERC20_FACTORY_ABI = [
  {
    type: 'function',
    name: 'getUERC20Address',
    stateMutability: 'view',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'decimals', type: 'uint8' },
      { name: 'creator', type: 'address' },
      { name: 'graffiti', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'address' }],
  },
] as const satisfies Abi

// The super-uERC20 factory folds homeChainId into the salt, so its view takes an extra homeChainId arg.
export const USUPERC20_FACTORY_ABI = [
  {
    type: 'function',
    name: 'getUSUPERC20Address',
    stateMutability: 'view',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'decimals', type: 'uint8' },
      { name: 'homeChainId', type: 'uint256' },
      { name: 'creator', type: 'address' },
      { name: 'graffiti', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'address' }],
  },
] as const satisfies Abi

/** ERC20 `approve` — used to approve Permit2 to pull an existing token. */
export const ERC20_APPROVE_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const satisfies Abi

/** Permit2 `IAllowanceTransfer` — on-chain allowance read + signature-less approve. */
export const PERMIT2_ABI = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
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
] as const satisfies Abi

/** v4 StateView — reads pool state by pool id. `sqrtPriceX96 == 0` means the pool is uninitialized. */
export const STATE_VIEW_ABI = [
  {
    type: 'function',
    name: 'getSlot0',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'protocolFee', type: 'uint24' },
      { name: 'lpFee', type: 'uint24' },
    ],
  },
] as const satisfies Abi
