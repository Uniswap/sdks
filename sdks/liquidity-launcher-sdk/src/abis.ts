import { type Abi } from 'viem'

/**
 * Minimal, exact ABIs for the launch stack. Each is `as const satisfies Abi` so viem/wagmi infer
 * argument and return types. Only the functions the SDK needs are included.
 */

/**
 * LiquidityLauncher. Tracks the tip of liquidity-launcher#227 (`fix: remove sweepNative and the
 * batch native invariant`, itself stacked on #223 `UniversalRouterStrategy`), which is what the
 * current chain-4663 launcher was deployed from.
 *
 * Every entry point is `payable`: `multicall` self-`delegatecall`s, so `msg.value` is inherited by
 * every frame and a non-payable callee would revert on solc's `callvalue` check inside a
 * value-carrying batch. Selectors are unchanged — `payable` is not part of a selector — but viem and
 * ethers refuse to attach `value` to a `nonpayable` entry, so this is what makes a native-carrying
 * launch expressible at all.
 *
 * Note there is deliberately no `sweepNative`: #223 added it and #227 removed it again (it was
 * unauthenticated and reachable mid-batch, so a contract gaining execution inside the transaction
 * could divert the launcher's un-forwarded native). #227 dropped the `NativeNotSwept` multicall
 * guard with it. The rule for callers is now that the `nativeAmount`s forwarded across a batch must
 * add up to `msg.value`: there is no refund path, and any excess is stranded in the launcher.
 */
export const LIQUIDITY_LAUNCHER_ABI = [
  {
    type: 'event',
    name: 'TokenCreated',
    inputs: [{ name: 'tokenAddress', type: 'address', indexed: true }],
  },
  {
    type: 'event',
    name: 'TokenDistributed',
    inputs: [
      { name: 'tokenAddress', type: 'address', indexed: true },
      { name: 'strategy', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'createToken',
    stateMutability: 'payable',
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
    stateMutability: 'payable',
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
    stateMutability: 'payable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint160' },
    ],
    outputs: [],
  },
  {
    // Hands `nativeAmount` of the batch's `msg.value` to a strategy implementing `INativeStrategy`.
    // The amount is an explicit parameter rather than `msg.value` because `msg.value` is identical
    // in every delegatecall frame, so reading it would let one payment fund two hand-offs.
    type: 'function',
    name: 'distributeWithNative',
    stateMutability: 'payable',
    inputs: [
      { name: 'strategy', type: 'address' },
      { name: 'configData', type: 'bytes' },
      { name: 'salt', type: 'bytes32' },
      { name: 'nativeAmount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'multicall',
    stateMutability: 'payable',
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

/**
 * v4 View Quoter — off-chain swap quoting by revert-and-catch. `quoteExactInputSingle` is declared
 * `nonpayable` on-chain (it state-mutates then reverts internally), so it must be executed as an
 * `eth_call` simulation, never submitted as a transaction.
 */
export const V4_QUOTER_ABI = [
  {
    type: 'function',
    name: 'quoteExactInputSingle',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          {
            name: 'poolKey',
            type: 'tuple',
            components: [
              { name: 'currency0', type: 'address' },
              { name: 'currency1', type: 'address' },
              { name: 'fee', type: 'uint24' },
              { name: 'tickSpacing', type: 'int24' },
              { name: 'hooks', type: 'address' },
            ],
          },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'exactAmount', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const satisfies Abi

// The v4 PoolKey struct, as it appears in launch-stack event payloads.
const POOL_KEY_COMPONENTS = [
  { name: 'currency0', type: 'address' },
  { name: 'currency1', type: 'address' },
  { name: 'fee', type: 'uint24' },
  { name: 'tickSpacing', type: 'int24' },
  { name: 'hooks', type: 'address' },
] as const

/**
 * InstantLaunchStrategy — launch event plus the immutable views that identify a deployment variant
 * (`beneficiaryVault() == address(0)` ⇔ creator fees off). One ABI serves every instance; consult
 * the `INSTANT_LAUNCH_DEPLOYMENTS` registry for the deployed addresses.
 */
export const INSTANT_LAUNCH_STRATEGY_ABI = [
  {
    // Emitted once per launch. `finalPositionRecipient` is the instance's FeeSplitter — the
    // permanent custodian of the launch LP position.
    type: 'event',
    name: 'TokenLaunched',
    inputs: [
      { name: 'poolId', type: 'bytes32', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'finalPositionRecipient', type: 'address', indexed: true },
      { name: 'key', type: 'tuple', components: POOL_KEY_COMPONENTS, indexed: false },
    ],
  },
  {
    // IStrategy event, emitted alongside TokenLaunched in the same launch transaction.
    type: 'event',
    name: 'DistributionInitialized',
    inputs: [
      { name: 'distributor', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'totalSupply', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'launcher',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'feeSplitter',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    // address(0) on a fees-off instance (beneficiary registration skipped for its launches).
    type: 'function',
    name: 'beneficiaryVault',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    // The aligned tick the launch pool opens at (a constructor immutable, may differ per deploy).
    type: 'function',
    name: 'initialTick',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'int24' }],
  },
] as const satisfies Abi

/**
 * FeeSplitter — immutable-configuration custodian of the launch LP positions; permissionlessly
 * collects their fees and pushes the configured splits. One instance per strategy variant.
 */
export const FEE_SPLITTER_ABI = [
  {
    // The accrual event: full realized fees per position per collect. The vault leg of each event,
    // floored per the immutable bps, is the creator's accumulation (see `creatorFeesAccumulated`).
    type: 'event',
    name: 'FeesCollected',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'nativeAmount', type: 'uint256', indexed: false },
      { name: 'tokenAmount', type: 'uint256', indexed: false },
    ],
  },
  {
    // One per nonzero split leg per currency; carries no tokenId (within a transaction, a
    // FeesCollected's forwarded legs follow it in log order until the next FeesCollected).
    type: 'event',
    name: 'FeesForwarded',
    inputs: [
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'currency', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    // Permissionless: collects each position's accrued fees and pushes the splits.
    type: 'function',
    name: 'collectFees',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenIds', type: 'uint256[]' }],
    outputs: [],
  },
  {
    // The immutable split table: per recipient, independent bps of both currency sides (each side
    // sums to 10,000) and whether the recipient is notified via callback.
    type: 'function',
    name: 'getSplits',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'recipient', type: 'address' },
          { name: 'nativeBps', type: 'uint16' },
          { name: 'tokenBps', type: 'uint16' },
          { name: 'useCallback', type: 'bool' },
        ],
      },
    ],
  },
] as const satisfies Abi

/**
 * UERC20BeneficiaryVault (and its BeneficiaryVault base) — a transferable ERC721 claim on each
 * registered position's creator fee share. Registration mints the ERC721 `Transfer` (from zero);
 * claims pay the current NFT holder and emit `Claimed`.
 */
export const BENEFICIARY_VAULT_ABI = [
  {
    // ERC721 Transfer: mint (from == 0) is the launch's beneficiary registration; later transfers
    // move the fee claim. The token id equals the LP position's tokenId.
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'id', type: 'uint256', indexed: true },
    ],
  },
  {
    // Payout of a position's attributed amounts (carries no recipient — join the Transfer history).
    type: 'event',
    name: 'Claimed',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'currency0Amount', type: 'uint256', indexed: false },
      { name: 'currency1Amount', type: 'uint256', indexed: false },
      { name: 'poolKey', type: 'tuple', components: POOL_KEY_COMPONENTS, indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'minCurrency0Amount', type: 'uint256' },
      { name: 'minCurrency1Amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    // The amounts attributed to a position and available to claim.
    type: 'function',
    name: 'amounts',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'currency0Amount', type: 'uint128' },
      { name: 'currency1Amount', type: 'uint128' },
    ],
  },
  {
    // The current beneficiary (fee-claim holder) of a registered position.
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const satisfies Abi

/**
 * CompoundingClaimRecipient — the autocompound recipient of every FeeSplitter. `claim` pays the
 * caller and reverts unless the caller increases the same position's liquidity within the same
 * transaction, so each `Claimed` event proves a compounding.
 */
export const COMPOUNDING_CLAIM_RECIPIENT_ABI = [
  {
    type: 'event',
    name: 'Claimed',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'currency0Amount', type: 'uint256', indexed: false },
      { name: 'currency1Amount', type: 'uint256', indexed: false },
      { name: 'poolKey', type: 'tuple', components: POOL_KEY_COMPONENTS, indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'minCurrency0Amount', type: 'uint256' },
      { name: 'minCurrency1Amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'amounts',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'currency0Amount', type: 'uint128' },
      { name: 'currency1Amount', type: 'uint128' },
    ],
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
