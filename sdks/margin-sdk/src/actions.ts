import { type AbiParameter } from 'viem'

/**
 * Action opcodes an `execute` plan can dispatch, and the ABI shape of each action's parameter
 * blob. The router's interpreter is the inherited V4Router set (swap / settle / take) plus
 * `SWEEP`/`WRAP`/`UNWRAP` (intercepted by MarginRouter with PositionManager-identical semantics)
 * plus the margin opcodes at `0x30`+ (`0x1c`–`0x2f` is reserved for future core v4 actions).
 * Opcodes the router does not handle revert `UnsupportedAction`.
 */

/** v4 routing actions the MarginRouter interpreter supports (subset of v4-periphery `Actions`). */
export enum V4RouterAction {
  SWAP_EXACT_IN_SINGLE = 0x06,
  SWAP_EXACT_IN = 0x07,
  SWAP_EXACT_OUT_SINGLE = 0x08,
  SWAP_EXACT_OUT = 0x09,
  SETTLE = 0x0b,
  SETTLE_ALL = 0x0c,
  TAKE = 0x0e,
  TAKE_ALL = 0x0f,
  TAKE_PORTION = 0x10,
  SWEEP = 0x14,
  WRAP = 0x15,
  UNWRAP = 0x16,
}

/** Margin actions (v4-periphery `MarginActions`), occupying the distinct `0x30` opcode range. */
export enum MarginAction {
  /** Supply collateral from the active account. Allowlist-gated (exposure-increasing). */
  ACCOUNT_SUPPLY_COLLATERAL = 0x30,
  /** Withdraw collateral from the active account's lending position. Never allowlist-gated. */
  ACCOUNT_WITHDRAW_COLLATERAL = 0x31,
  /** Borrow debt against the active account. Allowlist-gated (exposure-increasing). */
  ACCOUNT_BORROW = 0x32,
  /** Repay the active account's debt. Never allowlist-gated. */
  ACCOUNT_REPAY = 0x33,
  /** Sweep a token balance out of the active account. Never allowlist-gated. */
  ACCOUNT_SWEEP = 0x34,
  /** Assert the active account's LTV does not exceed a bound (`PositionUnhealthy` otherwise). */
  ASSERT_HEALTH = 0x35,
  /** Assert an exact-output swap delivered the full amount (`IncompleteFill` otherwise). */
  ASSERT_FILL = 0x36,
  /** Bind the active account (derived from the authenticated caller + subId, never calldata). */
  SET_ACCOUNT = 0x37,
  /** Move a token into the active account (Permit2 pull or router balance). Zero amount reverts. */
  PULL_TO_ACCOUNT = 0x38,
}

export type PlanAction = V4RouterAction | MarginAction

const MARKET = {
  type: 'tuple',
  components: [
    { name: 'collateral', type: 'address' },
    { name: 'debt', type: 'address' },
  ],
} as const

const POOL_KEY = {
  type: 'tuple',
  components: [
    { name: 'currency0', type: 'address' },
    { name: 'currency1', type: 'address' },
    { name: 'fee', type: 'uint24' },
    { name: 'tickSpacing', type: 'int24' },
    { name: 'hooks', type: 'address' },
  ],
} as const

const PATH_KEY_COMPONENTS = [
  { name: 'intermediateCurrency', type: 'address' },
  { name: 'fee', type: 'uint24' },
  { name: 'tickSpacing', type: 'int24' },
  { name: 'hooks', type: 'address' },
  { name: 'hookData', type: 'bytes' },
] as const

/**
 * ABI parameters for each action's encoded blob, exactly as the router decodes them
 * (v4-periphery `CalldataDecoder` for the routing set, `MarginCalldataDecoder` for the margin
 * set). Cross-checked against `cast abi-encode` vectors in planner.test.ts.
 */
export const ACTION_ABI: Record<PlanAction, readonly AbiParameter[]> = {
  [V4RouterAction.SWAP_EXACT_IN_SINGLE]: [
    {
      type: 'tuple',
      components: [
        { name: 'poolKey', ...POOL_KEY },
        { name: 'zeroForOne', type: 'bool' },
        { name: 'amountIn', type: 'uint128' },
        { name: 'amountOutMinimum', type: 'uint128' },
        { name: 'minHopPriceX36', type: 'uint256' },
        { name: 'hookData', type: 'bytes' },
      ],
    },
  ],
  [V4RouterAction.SWAP_EXACT_IN]: [
    {
      type: 'tuple',
      components: [
        { name: 'currencyIn', type: 'address' },
        { name: 'path', type: 'tuple[]', components: PATH_KEY_COMPONENTS },
        { name: 'minHopPriceX36', type: 'uint256[]' },
        { name: 'amountIn', type: 'uint128' },
        { name: 'amountOutMinimum', type: 'uint128' },
      ],
    },
  ],
  [V4RouterAction.SWAP_EXACT_OUT_SINGLE]: [
    {
      type: 'tuple',
      components: [
        { name: 'poolKey', ...POOL_KEY },
        { name: 'zeroForOne', type: 'bool' },
        { name: 'amountOut', type: 'uint128' },
        { name: 'amountInMaximum', type: 'uint128' },
        { name: 'minHopPriceX36', type: 'uint256' },
        { name: 'hookData', type: 'bytes' },
      ],
    },
  ],
  [V4RouterAction.SWAP_EXACT_OUT]: [
    {
      type: 'tuple',
      components: [
        { name: 'currencyOut', type: 'address' },
        { name: 'path', type: 'tuple[]', components: PATH_KEY_COMPONENTS },
        { name: 'minHopPriceX36', type: 'uint256[]' },
        { name: 'amountOut', type: 'uint128' },
        { name: 'amountInMaximum', type: 'uint128' },
      ],
    },
  ],
  [V4RouterAction.SETTLE]: [
    { name: 'currency', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'payerIsUser', type: 'bool' },
  ],
  [V4RouterAction.SETTLE_ALL]: [
    { name: 'currency', type: 'address' },
    { name: 'maxAmount', type: 'uint256' },
  ],
  [V4RouterAction.TAKE]: [
    { name: 'currency', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  [V4RouterAction.TAKE_ALL]: [
    { name: 'currency', type: 'address' },
    { name: 'minAmount', type: 'uint256' },
  ],
  [V4RouterAction.TAKE_PORTION]: [
    { name: 'currency', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'bips', type: 'uint256' },
  ],
  [V4RouterAction.SWEEP]: [
    { name: 'currency', type: 'address' },
    { name: 'to', type: 'address' },
  ],
  [V4RouterAction.WRAP]: [{ name: 'amount', type: 'uint256' }],
  [V4RouterAction.UNWRAP]: [{ name: 'amount', type: 'uint256' }],
  [MarginAction.ACCOUNT_SUPPLY_COLLATERAL]: [
    { name: 'adapter', type: 'address' },
    { name: 'market', ...MARKET },
    { name: 'amount', type: 'uint256' },
  ],
  [MarginAction.ACCOUNT_WITHDRAW_COLLATERAL]: [
    { name: 'adapter', type: 'address' },
    { name: 'market', ...MARKET },
    { name: 'amount', type: 'uint256' },
    { name: 'to', type: 'address' },
  ],
  [MarginAction.ACCOUNT_BORROW]: [
    { name: 'adapter', type: 'address' },
    { name: 'market', ...MARKET },
    { name: 'amount', type: 'uint256' },
    { name: 'to', type: 'address' },
  ],
  [MarginAction.ACCOUNT_REPAY]: [
    { name: 'adapter', type: 'address' },
    { name: 'market', ...MARKET },
    { name: 'amount', type: 'uint256' },
  ],
  [MarginAction.ACCOUNT_SWEEP]: [
    { name: 'currency', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'to', type: 'address' },
  ],
  [MarginAction.ASSERT_HEALTH]: [
    { name: 'adapter', type: 'address' },
    { name: 'market', ...MARKET },
    { name: 'maxLtv', type: 'uint256' },
  ],
  [MarginAction.ASSERT_FILL]: [
    { name: 'currency', type: 'address' },
    { name: 'minAmount', type: 'uint256' },
  ],
  [MarginAction.SET_ACCOUNT]: [{ name: 'subId', type: 'uint256' }],
  [MarginAction.PULL_TO_ACCOUNT]: [
    { name: 'currency', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'payerIsUser', type: 'bool' },
  ],
}

/** The margin actions that operate on the active account (require a preceding `SET_ACCOUNT`). */
export const ACCOUNT_SCOPED_ACTIONS: ReadonlySet<number> = new Set([
  MarginAction.ACCOUNT_SUPPLY_COLLATERAL,
  MarginAction.ACCOUNT_WITHDRAW_COLLATERAL,
  MarginAction.ACCOUNT_BORROW,
  MarginAction.ACCOUNT_REPAY,
  MarginAction.ACCOUNT_SWEEP,
  MarginAction.ASSERT_HEALTH,
  MarginAction.PULL_TO_ACCOUNT,
])
