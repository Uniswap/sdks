import { type Address, type Hex, concatHex, encodeAbiParameters, numberToHex } from 'viem'

import { ACCOUNT_SCOPED_ACTIONS, ACTION_ABI, MarginAction, type PlanAction, V4RouterAction } from './actions'
import { CONTRACT_BALANCE } from './constants'
import { MarginSdkError } from './errors'
import { type Market, type PathKey, type PoolKey } from './types'

/**
 * Builds the `unlockData` for `MarginRouter.execute`: an ordered plan of v4 routing and margin
 * actions run atomically in one PoolManager unlock. `finalize()` produces
 * `abi.encode(bytes actions, bytes[] params)` where `actions` is the packed opcode string and
 * `params[i]` is the ABI-encoded parameters for `actions[i]`.
 *
 * `execute` does no entry validation — the plan carries exactly the guardrails it encodes:
 * 1. Open each account-scoped section with {@link setAccount} (enforced by `finalize`).
 * 2. Encode swap bounds (`amountInMaximum` / `amountOutMinimum`), {@link assertFill} after an
 *    exact-output swap, and {@link assertHealth} per touched (account, market) — after each
 *    account section, not once at the end.
 * 3. Net the router to zero: terminate with {@link sweep} for every currency the plan may leave
 *    on the router. Residual balances are claimable by the next caller.
 * 4. Supply and borrow require an allowlisted adapter; withdraw, repay, and account-sweep do not.
 *
 * ⚠️ Signing an `execute` plan is equivalent to handing over the sub-account: a malicious plan
 * can borrow to the market maximum and direct everything to an arbitrary address with no token
 * approval required. Never execute a plan built by an untrusted party.
 */
export class MarginPlanner {
  readonly actions: PlanAction[] = []
  readonly params: Hex[] = []

  /** Appends a raw action with pre-encoded params. Prefer the typed helpers below. */
  addAction(action: PlanAction, params: Hex): this {
    if (!(action in ACTION_ABI)) {
      throw new MarginSdkError('INVALID_PLAN', `unsupported action opcode: 0x${action.toString(16)}`)
    }
    this.actions.push(action)
    this.params.push(params)
    return this
  }

  private add(action: PlanAction, values: readonly unknown[]): this {
    return this.addAction(action, encodeAbiParameters([...ACTION_ABI[action]], values))
  }

  // -------------------------------------------------------------------------
  // Margin actions
  // -------------------------------------------------------------------------

  /** Binds the active account for subsequent account-scoped actions (deploys it if needed). */
  setAccount(subId: bigint): this {
    return this.add(MarginAction.SET_ACCOUNT, [subId])
  }

  /**
   * Moves `amount` of `currency` into the active account: pulled from the caller via Permit2
   * (`payerIsUser` true) or from the router's own balance (false). A zero amount reverts onchain
   * (no `OPEN_DELTA` sentinel here); `CONTRACT_BALANCE` is honored only on the router-balance
   * path; native currency is unsupported — wrap to WETH first.
   */
  pullToAccount(currency: Address, amount: bigint, payerIsUser: boolean): this {
    if (amount === 0n) {
      throw new MarginSdkError('INVALID_AMOUNT', 'PULL_TO_ACCOUNT rejects a zero amount (no OPEN_DELTA sentinel)')
    }
    if (amount === CONTRACT_BALANCE && payerIsUser) {
      throw new MarginSdkError('INVALID_AMOUNT', 'CONTRACT_BALANCE is only honored when pulling the router balance')
    }
    return this.add(MarginAction.PULL_TO_ACCOUNT, [currency, amount, payerIsUser])
  }

  /**
   * Supplies `amount` of the market's collateral from the active account (0 == `OPEN_DELTA`, the
   * account's full collateral-token balance). Requires an allowlisted adapter.
   */
  supplyCollateral(adapter: Address, market: Market, amount: bigint): this {
    return this.add(MarginAction.ACCOUNT_SUPPLY_COLLATERAL, [adapter, market, amount])
  }

  /** Withdraws `amount` of the market's collateral from the active account's position to `to`. */
  withdrawCollateral(adapter: Address, market: Market, amount: bigint, to: Address): this {
    return this.add(MarginAction.ACCOUNT_WITHDRAW_COLLATERAL, [adapter, market, amount, to])
  }

  /** Borrows `amount` of the market's debt against the active account, delivered to `to`. */
  borrow(adapter: Address, market: Market, amount: bigint, to: Address): this {
    return this.add(MarginAction.ACCOUNT_BORROW, [adapter, market, amount, to])
  }

  /** Repays `amount` of the active account's debt (`type(uint256).max` == full repay by shares). */
  repay(adapter: Address, market: Market, amount: bigint): this {
    return this.add(MarginAction.ACCOUNT_REPAY, [adapter, market, amount])
  }

  /** Sweeps `amount` of `currency` out of the active account to `to` (manager or owner only). */
  accountSweep(currency: Address, amount: bigint, to: Address): this {
    return this.add(MarginAction.ACCOUNT_SWEEP, [currency, amount, to])
  }

  /** Asserts the active account's LTV in `market` is at most `maxLtv` (WAD; 0 skips the check). */
  assertHealth(adapter: Address, market: Market, maxLtv: bigint): this {
    return this.add(MarginAction.ASSERT_HEALTH, [adapter, market, maxLtv])
  }

  /**
   * Asserts the router holds at least `minAmount` credit of `currency` — i.e. the preceding
   * exact-output swap delivered the full requested amount (all-or-nothing on a thin pool).
   */
  assertFill(currency: Address, minAmount: bigint): this {
    return this.add(MarginAction.ASSERT_FILL, [currency, minAmount])
  }

  // -------------------------------------------------------------------------
  // v4 routing actions
  // -------------------------------------------------------------------------

  swapExactInSingle(p: {
    poolKey: PoolKey
    zeroForOne: boolean
    amountIn: bigint
    amountOutMinimum: bigint
    minHopPriceX36?: bigint
    hookData?: Hex
  }): this {
    return this.add(V4RouterAction.SWAP_EXACT_IN_SINGLE, [
      {
        poolKey: p.poolKey,
        zeroForOne: p.zeroForOne,
        amountIn: p.amountIn,
        amountOutMinimum: p.amountOutMinimum,
        minHopPriceX36: p.minHopPriceX36 ?? 0n,
        hookData: p.hookData ?? '0x',
      },
    ])
  }

  swapExactOutSingle(p: {
    poolKey: PoolKey
    zeroForOne: boolean
    amountOut: bigint
    amountInMaximum: bigint
    minHopPriceX36?: bigint
    hookData?: Hex
  }): this {
    return this.add(V4RouterAction.SWAP_EXACT_OUT_SINGLE, [
      {
        poolKey: p.poolKey,
        zeroForOne: p.zeroForOne,
        amountOut: p.amountOut,
        amountInMaximum: p.amountInMaximum,
        minHopPriceX36: p.minHopPriceX36 ?? 0n,
        hookData: p.hookData ?? '0x',
      },
    ])
  }

  swapExactIn(p: {
    currencyIn: Address
    path: PathKey[]
    amountIn: bigint
    amountOutMinimum: bigint
    /** Per-hop price bounds; defaults to a zero (disabled) entry per hop. */
    minHopPriceX36?: bigint[]
  }): this {
    return this.add(V4RouterAction.SWAP_EXACT_IN, [
      {
        currencyIn: p.currencyIn,
        path: p.path,
        minHopPriceX36: p.minHopPriceX36 ?? p.path.map(() => 0n),
        amountIn: p.amountIn,
        amountOutMinimum: p.amountOutMinimum,
      },
    ])
  }

  swapExactOut(p: {
    currencyOut: Address
    path: PathKey[]
    amountOut: bigint
    amountInMaximum: bigint
    minHopPriceX36?: bigint[]
  }): this {
    return this.add(V4RouterAction.SWAP_EXACT_OUT, [
      {
        currencyOut: p.currencyOut,
        path: p.path,
        minHopPriceX36: p.minHopPriceX36 ?? p.path.map(() => 0n),
        amountOut: p.amountOut,
        amountInMaximum: p.amountInMaximum,
      },
    ])
  }

  /** Pays `amount` of `currency` into the PoolManager (0 == `OPEN_DELTA` full debt). */
  settle(currency: Address, amount: bigint, payerIsUser: boolean): this {
    return this.add(V4RouterAction.SETTLE, [currency, amount, payerIsUser])
  }

  /** Settles the full open debt in `currency`, reverting if it exceeds `maxAmount`. */
  settleAll(currency: Address, maxAmount: bigint): this {
    return this.add(V4RouterAction.SETTLE_ALL, [currency, maxAmount])
  }

  /** Takes `amount` of `currency` from the PoolManager to `recipient` (0 == full credit). */
  take(currency: Address, recipient: Address, amount: bigint): this {
    return this.add(V4RouterAction.TAKE, [currency, recipient, amount])
  }

  /** Takes the full open credit in `currency`, reverting if it is below `minAmount`. */
  takeAll(currency: Address, minAmount: bigint): this {
    return this.add(V4RouterAction.TAKE_ALL, [currency, minAmount])
  }

  /** Takes `bips` (out of 10_000) of the full credit in `currency` to `recipient`. */
  takePortion(currency: Address, recipient: Address, bips: bigint): this {
    return this.add(V4RouterAction.TAKE_PORTION, [currency, recipient, bips])
  }

  /** Sweeps the router's entire balance of `currency` to `to` (use to net the router to zero). */
  sweep(currency: Address, to: Address): this {
    return this.add(V4RouterAction.SWEEP, [currency, to])
  }

  /** Wraps `amount` of the router's native ETH to WETH (`CONTRACT_BALANCE` == entire balance). */
  wrap(amount: bigint): this {
    return this.add(V4RouterAction.WRAP, [amount])
  }

  /** Unwraps `amount` of the router's WETH to native ETH (`CONTRACT_BALANCE` == entire balance). */
  unwrap(amount: bigint): this {
    return this.add(V4RouterAction.UNWRAP, [amount])
  }

  // -------------------------------------------------------------------------
  // Finalization
  // -------------------------------------------------------------------------

  /**
   * Encodes the plan as `execute` `unlockData`: `abi.encode(bytes actions, bytes[] params)`.
   * Rejects empty plans and plans that run an account-scoped action before any `SET_ACCOUNT`
   * (which would revert `NoActiveAccount` onchain).
   */
  finalize(): Hex {
    if (this.actions.length === 0) {
      throw new MarginSdkError('INVALID_PLAN', 'cannot finalize an empty plan')
    }
    let accountSet = false
    for (const action of this.actions) {
      if (action === MarginAction.SET_ACCOUNT) accountSet = true
      else if (!accountSet && ACCOUNT_SCOPED_ACTIONS.has(action)) {
        throw new MarginSdkError(
          'INVALID_PLAN',
          `action 0x${action.toString(16)} is account-scoped: open the section with setAccount(subId)`
        )
      }
    }
    const packedActions = concatHex(this.actions.map((a) => numberToHex(a, { size: 1 })))
    return encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [packedActions, this.params])
  }
}
