import invariant from 'tiny-invariant'
import { RoutePlanner, CommandType } from '../../utils/routerCommands'
import { Trade as V2Trade, Pair } from '@uniswap/v2-sdk'
import { Trade as V3Trade, Pool as V3Pool, encodeRouteToPath, FeeOptions } from '@uniswap/v3-sdk'
import {
  Route as V4Route,
  Trade as V4Trade,
  Pool as V4Pool,
  V4Planner,
  encodeRouteToPath as encodeV4RouteToPath,
  Actions,
} from '@uniswap/v4-sdk'
import {
  Trade as RouterTrade,
  MixedRouteTrade,
  Protocol,
  IRoute,
  RouteV2,
  RouteV3,
  MixedRouteSDK,
  MixedRoute,
  SwapOptions as RouterSwapOptions,
  getOutputOfPools,
  encodeMixedRouteToPath,
  partitionMixedRouteByProtocol,
} from '@uniswap/router-sdk'
import { Permit2Permit } from '../../utils/inputTokens'
import { getPathCurrency } from '../../utils/pathCurrency'
import { toV4URVersion } from '../../utils/toV4URVersion'
import { Currency, TradeType, Token, CurrencyAmount, Percent } from '@uniswap/sdk-core'
import { Command, RouterActionType, TradeConfig } from '../Command'
import {
  SENDER_AS_RECIPIENT,
  ROUTER_AS_RECIPIENT,
  CONTRACT_BALANCE,
  ETH_ADDRESS,
  UniversalRouterVersion,
  UNIVERSAL_ROUTER_ADDRESS,
  isAtLeastV2_1_1,
} from '../../utils/constants'
import { getCurrencyAddress } from '../../utils/getCurrencyAddress'
import { encodeFeeBips, encodeFee1e18 } from '../../utils/numbers'
import { scalePortionFees, simulatePortionFeeDeduction } from '../../utils/portionFees'
import { BigNumber, BigNumberish } from 'ethers'
import { TPool } from '@uniswap/router-sdk'

export type FlatFeeOptions = {
  amount: BigNumberish
  recipient: string
}

// A product decision (interface + partner + integrator + referrer), not a protocol limit; each recipient costs one command.
export const MAX_FEE_RECIPIENTS = 4

// the existing router permit object doesn't include enough data for permit2
// so we extend swap options with the permit2 permit
// when safe mode is enabled, the SDK will add an extra ETH sweep for security
// when useRouterBalance is enabled the SDK will use the balance in the router for the swap
export enum TokenTransferMode {
  Permit2 = 'Permit2',
  ApproveProxy = 'ApproveProxy',
}

export type RouterBalanceInput = {
  /**
   * Optional floor on the router's input-token balance, enforced by a `BALANCE_CHECK_ERC20`
   * command before any swap runs, so an under-funded router reverts up front rather than
   * swapping a short amount. Use when the funding amount is guaranteed by the caller.
   *
   * This is a distinct guarantee from `slippageTolerance`: the trade-level minimum output
   * only catches a shortfall large enough to breach it, so a wide tolerance can let an
   * under-delivery through. This bounds the input side directly.
   */
  minimumAmount?: BigNumberish
}

export type SwapOptions = Omit<RouterSwapOptions, 'inputTokenPermit' | 'fee'> & {
  /** Each entry's fee is a fraction of the GROSS output (the SDK rescales later entries); >1 entry needs urVersion >= V2_1_1, and flatFee is mutually exclusive. */
  fee?: FeeOptions | FeeOptions[]
  useRouterBalance?: boolean
  /**
   * The input Token is the chain's native gas token exposed via an ERC20 predeploy whose balance
   * mirrors the native balance (e.g. USDC on Arc). The swap is funded by attaching
   * msg.value = maximumAmountIn * 10^(18 - token.decimals) instead of pulling via Permit2:
   * the router self-funds (payerIsUser = false) and unused input is swept back to the recipient
   * on exact-output / partial-fill-risk trades. No ERC20 approval or permit is ever needed.
   * Incompatible with native input, inputTokenPermit, and TokenTransferMode.ApproveProxy.
   */
  nativeErc20Input?: boolean
  /**
   * Fund the swap from the Universal Router's own balance of the input token, spending
   * whatever it holds at execution time rather than pulling a fixed amount from a payer
   * (`payerIsUser = false`, first hop encoded as `CONTRACT_BALANCE`).
   *
   * This is for flows where the router is funded by a third party in the same transaction
   * and the delivered amount is not known when the calldata is built, e.g. a bridge filler
   * that deposits into the router and swaps atomically. Distinct from `useRouterBalance`,
   * which keeps the fixed quoted `amountIn`.
   *
   * Requires an explicit `recipient` (the caller of `execute()` is not the beneficiary)
   * and `TradeType.EXACT_INPUT` on a single (non-split) route. Supported for v2, v3, v4
   * and mixed routes. A native input is funded by attaching msg.value to `execute()`
   * (raw transfers to the router revert) and is wrapped in full via
   * `WRAP_ETH(CONTRACT_BALANCE)`, with a trailing ETH dust sweep to the recipient; it
   * requires a route that wraps, so pure-native v4 routes are unsupported.
   * Incompatible with `inputTokenPermit`, `nativeErc20Input`, and
   * `TokenTransferMode.ApproveProxy`.
   */
  routerBalanceInput?: RouterBalanceInput
  inputTokenPermit?: Permit2Permit
  flatFee?: FlatFeeOptions
  safeMode?: boolean
  urVersion?: UniversalRouterVersion // Universal Router version for encoding (defaults to V2_0 for backward compatibility)
  tokenTransferMode?: TokenTransferMode // How input tokens are transferred to the UR (defaults to Permit2). ApproveProxy uses the SwapProxy contract.
  chainId?: number // Required when tokenTransferMode is ApproveProxy, used to resolve UR address for the proxy
}

const REFUND_ETH_PRICE_IMPACT_THRESHOLD = new Percent(50, 100)

// The amount encoded for a route's FIRST hop. With routerBalanceInput the router spends
// whatever it holds at execution time, so the quoted amount is replaced by the
// CONTRACT_BALANCE sentinel; later hops already use it to chain the intermediate token.
function firstHopInputAmount(options: SwapOptions, quotedAmountIn: string): BigNumberish {
  return options.routerBalanceInput ? CONTRACT_BALANCE : quotedAmountIn
}

interface Swap<TInput extends Currency, TOutput extends Currency> {
  route: IRoute<TInput, TOutput, TPool>
  inputAmount: CurrencyAmount<TInput>
  outputAmount: CurrencyAmount<TOutput>
  minHopPriceX36?: bigint[] // Optional per-hop slippage protection (UR 2.1.1+)
}

// Wrapper for uniswap router-sdk trade entity to encode swaps for Universal Router
// also translates trade objects from previous (v2, v3) SDKs
export class UniswapTrade implements Command {
  readonly tradeType: RouterActionType = RouterActionType.UniswapTrade
  readonly payerIsUser: boolean

  constructor(public trade: RouterTrade<Currency, Currency, TradeType>, public options: SwapOptions) {
    if (Array.isArray(options.fee)) {
      // An empty array would still make the router custody the output while paying nobody.
      if (options.fee.length === 0) throw new Error('At least one fee recipient required')
      if (options.fee.length > MAX_FEE_RECIPIENTS) {
        throw new Error(`At most ${MAX_FEE_RECIPIENTS} fee recipients permitted`)
      }
    }

    if (!!options.fee && !!options.flatFee) throw new Error('Only one fee option permitted')

    if (options.nativeErc20Input) {
      // input token is the chain's native gas token exposed via an ERC20 predeploy (e.g. Arc USDC);
      // the router is funded by msg.value instead of Permit2, so it pays pools from its own balance
      if (this.trade.inputAmount.currency.isNative) throw new Error('nativeErc20Input requires an ERC20 input token')
      if (options.tokenTransferMode === TokenTransferMode.ApproveProxy) {
        throw new Error('nativeErc20Input is not supported with ApproveProxy')
      }
      if (options.inputTokenPermit) throw new Error('nativeErc20Input does not use Permit2; remove inputTokenPermit')
      if (this.inputRequiresUnwrap) {
        throw new Error(
          'nativeErc20Input requires routes quoted against the ERC20 input (native pathInput unsupported)'
        )
      }
    }

    if (options.routerBalanceInput) {
      // The router spends a balance a third party funded in the same transaction, so the
      // amount is unknown at encode time and msg.sender is the funder, not the beneficiary.
      if (!options.recipient || options.recipient === SENDER_AS_RECIPIENT) {
        throw new Error(
          'Explicit recipient address required with routerBalanceInput (SENDER_AS_RECIPIENT resolves to the caller, who is not the swapper)'
        )
      }
      // The Dispatcher maps recipient sentinels: address(2) resolves to the router itself —
      // unwrapWETH9 then skips the transfer and a native-out execute() SUCCEEDS with the
      // ETH stranded in the permissionless router — and address(0) burns. Both are
      // format-valid addresses, so upstream shape checks pass them straight through.
      if (options.recipient === ROUTER_AS_RECIPIENT || BigNumber.from(options.recipient).isZero()) {
        throw new Error('routerBalanceInput recipient cannot be a UR sentinel or the zero address')
      }
      // Native input is funded as msg.value on execute() — raw transfers to the router
      // revert (its receive() only accepts ETH from WETH) — and wrapped in full by the
      // route's WRAP_ETH. Routes that consume native directly (pure-native v4) have no
      // wrap step to size with CONTRACT_BALANCE, so they stay unsupported.
      if (this.trade.inputAmount.currency.isNative && !this.inputRequiresWrap) {
        throw new Error('routerBalanceInput with a native input requires a route that wraps to WETH')
      }
      if (this.trade.tradeType !== TradeType.EXACT_INPUT) {
        throw new Error('routerBalanceInput requires TradeType.EXACT_INPUT')
      }
      // Split routes: CONTRACT_BALANCE resolves to the router's whole balance,
      // so exactly ONE leg (the largest, encoded last) spends it; the other
      // legs keep their quoted amounts from router custody. With a native
      // input every leg must consume the wrapped token, since the single
      // WRAP_ETH funds them all.
      if (
        this.trade.swaps.length > 1 &&
        this.trade.inputAmount.currency.isNative &&
        this.trade.swaps.some((swap) => (swap.route as { pathInput?: Currency }).pathInput?.isNative)
      ) {
        throw new Error('routerBalanceInput split routes with a native input require every leg to wrap to WETH')
      }
      if (options.inputTokenPermit) {
        throw new Error('routerBalanceInput does not use Permit2; remove inputTokenPermit')
      }
      if (options.nativeErc20Input) {
        throw new Error('routerBalanceInput is not supported with nativeErc20Input')
      }
      if (options.tokenTransferMode === TokenTransferMode.ApproveProxy) {
        throw new Error('routerBalanceInput is not supported with ApproveProxy')
      }
      if (options.routerBalanceInput.minimumAmount !== undefined && !options.chainId) {
        throw new Error('routerBalanceInput.minimumAmount requires chainId to resolve the router address')
      }
    }

    if (options.tokenTransferMode === TokenTransferMode.ApproveProxy) {
      if (!options.recipient || options.recipient === SENDER_AS_RECIPIENT) {
        throw new Error(
          'Explicit recipient address required when using SwapProxy (SENDER_AS_RECIPIENT resolves to proxy)'
        )
      }
      this.payerIsUser = false
    } else if (
      this.inputRequiresWrap ||
      this.inputRequiresUnwrap ||
      this.options.useRouterBalance ||
      this.options.nativeErc20Input ||
      this.options.routerBalanceInput
    ) {
      this.payerIsUser = false
    } else {
      this.payerIsUser = true
    }
  }

  get isAllV4(): boolean {
    let result = true
    for (const swap of this.trade.swaps) {
      result = result && swap.route.protocol == Protocol.V4
    }
    return result
  }

  // this.trade.swaps is an array of swaps / trades.
  // we are iterating over one swap (trade) at a time so length is 1
  // route is either v2, v3, v4, or mixed
  // pathInput and pathOutput are the currencies of the input and output of the route
  // this.trade.inputAmount is the input currency of the trade (could be different from pathInput)
  // this.trade.outputAmount is the output currency of the trade (could be different from pathOutput)
  // each route can have multiple pools
  get inputRequiresWrap(): boolean {
    const swap = this.trade.swaps[0]
    const route = swap.route
    const firstPool = route.pools[0]

    if (firstPool instanceof V4Pool) {
      // If first pool is a v4 pool and input currency is native and the path input currency in the route is not native, we need to wrap.
      return (
        this.trade.inputAmount.currency.isNative &&
        !(this.trade.swaps[0].route as unknown as V4Route<Currency, Currency>).pathInput.isNative
      )
    }
    // If first pool is not a v4 pool and input currency is native, we need to wrap
    return this.trade.inputAmount.currency.isNative
  }

  get inputRequiresUnwrap(): boolean {
    const swap = this.trade.swaps[0]
    const route = swap.route
    const firstPool = route.pools[0]

    if (firstPool instanceof V4Pool) {
      // If the first pool is a v4 pool and input currency is not native and the path input currency is native, we need to unwrap
      return (
        !this.trade.inputAmount.currency.isNative &&
        (this.trade.swaps[0].route as unknown as V4Route<Currency, Currency>).pathInput.isNative
      )
    }
    // If the first pool is not a v4 pool, we don't need to unwrap.
    return false
  }

  get outputRequiresWrap(): boolean {
    const swap = this.trade.swaps[0]
    const lastRoute = swap.route
    const lastPool = lastRoute.pools[lastRoute.pools.length - 1]

    // if last pool is v4:
    if (lastPool instanceof V4Pool) {
      // If output currency is not native but path currency output is native, we need to wrap
      if (!this.trade.outputAmount.currency.isNative) {
        if ((lastRoute as unknown as V4Route<Currency, Currency>).pathOutput.isNative) {
          // this means path output is native and we need to wrap
          return true
        } else if (lastPool.currency1.equals(lastPool.currency0.wrapped) && lastRoute.pools.length > 1) {
          let poolBefore = lastRoute.pools[lastRoute.pools.length - 2]
          // this means last pool is eth-weth and pool before contains weth
          if (
            poolBefore instanceof V4Pool &&
            (poolBefore.currency0.equals(lastPool.currency1) || poolBefore.currency1.equals(lastPool.currency1))
          ) {
            return true
          } else if (poolBefore.token0.equals(lastPool.currency1) || poolBefore.token1.equals(lastPool.currency1)) {
            // same for v2 and v3 pools
            return true
          }
        }
      }
    }
    // if last pool is not v4:
    // we do not need to wrap because v2 and v3 pools already require wrapped tokens
    return false
  }

  get outputRequiresUnwrap(): boolean {
    const swap = this.trade.swaps[0]
    const lastRoute = swap.route
    const lastPool = lastRoute.pools[lastRoute.pools.length - 1]

    // if last pool is v4:
    if (lastPool instanceof V4Pool) {
      // If output currency is native and path currency output is not native, we need to unwrap
      if (this.trade.outputAmount.currency.isNative) {
        if (!(this.trade.swaps[0].route as unknown as V4Route<Currency, Currency>).pathOutput.isNative) {
          // this means path output is weth and we need to unwrap
          return true
        } else if (
          lastRoute.pools.length > 1 &&
          lastRoute.pools[lastRoute.pools.length - 2] instanceof V4Pool &&
          (lastRoute.pools[lastRoute.pools.length - 2] as V4Pool).currency0.isNative &&
          lastPool.currency1.equals(lastPool.currency0.wrapped)
        ) {
          // this means last pool is eth-weth and we need to unwrap
          return true
        } else {
          return false
        }
      }
    }
    // else: if path output currency is native, we need to unwrap because v2 and v3 pools already require wrapped tokens
    return this.trade.outputAmount.currency.isNative
  }

  get outputRequiresTransition(): boolean {
    return this.outputRequiresWrap || this.outputRequiresUnwrap
  }

  encode(planner: RoutePlanner, _config: TradeConfig): void {
    // Input floor first, so an under-funded router reverts before any swap runs. A native
    // balance input has no balance-check command, so its floor is asserted post-wrap as WETH.
    const balanceInputIsNative = !!this.options.routerBalanceInput && this.trade.inputAmount.currency.isNative
    const minimumRouterBalance = this.options.routerBalanceInput?.minimumAmount
    if (minimumRouterBalance !== undefined && !balanceInputIsNative) {
      // BALANCE_CHECK_ERC20 reads `owner` verbatim, without the sentinel resolution the
      // recipient params get, so this must be the router's real address.
      planner.addCommand(CommandType.BALANCE_CHECK_ERC20, [
        UNIVERSAL_ROUTER_ADDRESS(this.options.urVersion ?? UniversalRouterVersion.V2_0, this.options.chainId!),
        (this.trade.inputAmount.currency as Token).address,
        minimumRouterBalance,
      ])
    }

    // If the input currency is the native currency, we need to wrap it with the router as the recipient
    if (this.inputRequiresWrap) {
      // TODO: optimize if only one v2 pool we can directly send this to the pool
      planner.addCommand(CommandType.WRAP_ETH, [
        ROUTER_AS_RECIPIENT,
        // Balance input: wrap everything the router holds (attached msg.value plus any
        // stray native), so no value is left behind — UR never refunds msg.value.
        this.options.routerBalanceInput
          ? CONTRACT_BALANCE
          : this.trade.maximumAmountIn(this.options.slippageTolerance).quotient.toString(),
      ])
      if (minimumRouterBalance !== undefined && balanceInputIsNative) {
        planner.addCommand(CommandType.BALANCE_CHECK_ERC20, [
          UNIVERSAL_ROUTER_ADDRESS(this.options.urVersion ?? UniversalRouterVersion.V2_0, this.options.chainId!),
          this.trade.inputAmount.currency.wrapped.address,
          minimumRouterBalance,
        ])
      }
    } else if (this.inputRequiresUnwrap) {
      if (this.options.tokenTransferMode !== TokenTransferMode.ApproveProxy) {
        // send wrapped token to router to unwrap via Permit2
        planner.addCommand(CommandType.PERMIT2_TRANSFER_FROM, [
          (this.trade.inputAmount.currency as Token).address,
          ROUTER_AS_RECIPIENT,
          this.trade.maximumAmountIn(this.options.slippageTolerance).quotient.toString(),
        ])
      }
      // In proxy mode, the proxy already transferred tokens to the UR; just unwrap
      planner.addCommand(CommandType.UNWRAP_WETH, [ROUTER_AS_RECIPIENT, 0])
    }
    // The overall recipient at the end of the trade, SENDER_AS_RECIPIENT uses the msg.sender
    this.options.recipient = this.options.recipient ?? SENDER_AS_RECIPIENT

    // flag for whether we want to perform slippage check on aggregate output of multiple routes
    //   1. when there are >2 exact input trades. this is only a heuristic,
    //      as it's still more gas-expensive even in this case, but has benefits
    //      in that the reversion probability is lower
    const performAggregatedSlippageCheck =
      this.trade.tradeType === TradeType.EXACT_INPUT && this.trade.routes.length > 2
    const routerMustCustody =
      performAggregatedSlippageCheck ||
      this.outputRequiresTransition ||
      hasFeeOption(this.options) ||
      // Balance-swap splits: the remainder leg's output varies with delivery,
      // so the minimum is enforced on the aggregate sweep, never per leg.
      (!!this.options.routerBalanceInput && this.trade.swaps.length > 1)

    // Balance-swap splits: the fixed legs run first with their quoted amounts
    // (per-leg options drop routerBalanceInput, so they encode normally from
    // router custody); the largest leg runs LAST and spends CONTRACT_BALANCE,
    // absorbing all delivery variance. The fill only reverts when delivery
    // cannot cover the fixed legs, so the tolerance is the largest leg's share.
    let swapsInOrder = this.trade.swaps
    let remainderSwap: (typeof swapsInOrder)[number] | undefined
    if (this.options.routerBalanceInput && swapsInOrder.length > 1) {
      remainderSwap = swapsInOrder.reduce((largest, swap) =>
        swap.inputAmount.greaterThan(largest.inputAmount) ? swap : largest
      )
      swapsInOrder = [...swapsInOrder.filter((swap) => swap !== remainderSwap), remainderSwap]
    }

    for (const swap of swapsInOrder) {
      const legOptions =
        remainderSwap !== undefined && swap !== remainderSwap
          ? { ...this.options, routerBalanceInput: undefined }
          : this.options
      switch (swap.route.protocol) {
        case Protocol.V2:
          addV2Swap(planner, swap, this.trade.tradeType, legOptions, this.payerIsUser, routerMustCustody)
          break
        case Protocol.V3:
          addV3Swap(planner, swap, this.trade.tradeType, legOptions, this.payerIsUser, routerMustCustody)
          break
        case Protocol.V4:
          addV4Swap(planner, swap, this.trade.tradeType, legOptions, this.payerIsUser, routerMustCustody)
          break
        case Protocol.MIXED:
          addMixedSwap(planner, swap, this.trade.tradeType, legOptions, this.payerIsUser, routerMustCustody)
          break
        default:
          throw new Error('UNSUPPORTED_TRADE_PROTOCOL')
      }
    }

    let minimumAmountOut: BigNumber = BigNumber.from(
      this.trade.minimumAmountOut(this.options.slippageTolerance).quotient.toString()
    )
    // The router custodies for 3 reasons: to unwrap, to take a fee, and/or to do a slippage check
    if (routerMustCustody) {
      const pools = this.trade.swaps[0].route.pools
      const pathOutputCurrencyAddress = getCurrencyAddress(
        getPathCurrency(this.trade.outputAmount.currency, pools[pools.length - 1])
      )

      // UR >= V2_1_1 has PAY_PORTION_FULL_PRECISION (1e18); older versions only bips.
      const useFullPrecision = isAtLeastV2_1_1(this.options.urVersion)

      // If there is a fee, that percentage is sent to the fee recipient. One PAY_PORTION per
      // recipient, emitted in the caller's order, ahead of the settlement command below.
      // In the case where ETH is the output currency, the fee is taken in WETH (for gas reasons)
      const feeList = toFeeOptionsList(this.options.fee)
      // Rescaling gross fractions against a shrinking balance yields fractional bips, which PAY_PORTION cannot represent.
      invariant(
        feeList.length <= 1 || useFullPrecision,
        'Multiple fee recipients require Universal Router version V2_1_1 or higher'
      )

      // Rescales fee i to f_i / (1 - sum of earlier fees), so each recipient gets its stated fraction of gross.
      const scaledFees = scalePortionFees(feeList)
      for (const { recipient, grossFee, scaledFee } of scaledFees) {
        if (useFullPrecision) {
          planner.addCommand(
            CommandType.PAY_PORTION_FULL_PRECISION,
            [pathOutputCurrencyAddress, recipient, encodeFee1e18(scaledFee)],
            false,
            this.options.urVersion
          )
        } else {
          // Reject fractional bips fees on older UR versions to prevent silent precision loss
          if (!grossFee.multiply(10_000).remainder.equalTo(0)) {
            throw new Error('Fractional fee bips require Universal Router version V2_1_1 or higher')
          }
          // single fee: scaled == gross, so the legacy bips encoding is unchanged
          planner.addCommand(CommandType.PAY_PORTION, [pathOutputCurrencyAddress, recipient, encodeFeeBips(grossFee)])
        }
      }

      // The sweep floor must expect what the commands leave behind, so the deduction replays their cascade.
      let feeDeduction = simulatePortionFeeDeduction(minimumAmountOut, scaledFees, useFullPrecision)

      // If there is a flat fee, that absolute amount is sent to the fee recipient
      // In the case where ETH is the output currency, the fee is taken in WETH (for gas reasons)
      if (!!this.options.flatFee) {
        const feeAmount = this.options.flatFee.amount
        if (minimumAmountOut.lt(feeAmount)) throw new Error('Flat fee amount greater than minimumAmountOut')

        planner.addCommand(CommandType.TRANSFER, [pathOutputCurrencyAddress, this.options.flatFee.recipient, feeAmount])
        feeDeduction = BigNumber.from(feeAmount)
      }

      // If the trade is exact output, and a fee was taken, we must adjust the amount out to be the amount after the fee
      // Otherwise we continue as expected with the trade's normal expected output
      if (this.trade.tradeType === TradeType.EXACT_OUTPUT) {
        minimumAmountOut = minimumAmountOut.sub(feeDeduction)
      }

      // The remaining tokens that need to be sent to the user after the fee is taken will be caught
      // by this if-else clause.
      if (this.outputRequiresUnwrap) {
        planner.addCommand(CommandType.UNWRAP_WETH, [this.options.recipient, minimumAmountOut])
      } else if (this.outputRequiresWrap) {
        planner.addCommand(CommandType.WRAP_ETH, [this.options.recipient, CONTRACT_BALANCE])
      } else {
        planner.addCommand(CommandType.SWEEP, [
          getCurrencyAddress(this.trade.outputAmount.currency),
          this.options.recipient,
          minimumAmountOut,
        ])
      }
    }

    // for exactOutput swaps with native input or that perform an inputToken transition (wrap or unwrap)
    // we need to send back the change to the user
    if (this.trade.tradeType === TradeType.EXACT_OUTPUT || riskOfPartialFill(this.trade)) {
      if (this.inputRequiresWrap) {
        planner.addCommand(CommandType.UNWRAP_WETH, [this.options.recipient, 0])
      } else if (this.inputRequiresUnwrap) {
        planner.addCommand(CommandType.WRAP_ETH, [this.options.recipient, CONTRACT_BALANCE])
      } else if (this.options.tokenTransferMode === TokenTransferMode.ApproveProxy) {
        // Proxy pulled maximumAmountIn into the UR; sweep any unused input back to the user
        planner.addCommand(CommandType.SWEEP, [
          getCurrencyAddress(this.trade.inputAmount.currency),
          this.options.recipient,
          0,
        ])
      } else if (this.options.nativeErc20Input || this.trade.inputAmount.currency.isNative) {
        // must refund extra native currency sent along (nativeErc20Input or native v4 trades).
        // For nativeErc20Input the leftover lives in the router's native balance (18 decimals), so
        // sweep it as native: an ERC20 sweep would floor to the token's decimals and strand dust.
        planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, this.options.recipient, 0])
      }
    }

    // Native balance input always sweeps trailing ETH dust to the recipient: the funder is
    // a third party, so anything left on the router would otherwise be stranded or swept
    // by a stranger.
    if (this.options.safeMode || (this.options.routerBalanceInput && this.trade.inputAmount.currency.isNative)) {
      planner.addCommand(CommandType.SWEEP, [ETH_ADDRESS, this.options.recipient, 0])
    }
  }
}

// encode a uniswap v2 swap
function addV2Swap<TInput extends Currency, TOutput extends Currency>(
  planner: RoutePlanner,
  { route, inputAmount, outputAmount, minHopPriceX36 }: Swap<TInput, TOutput>,
  tradeType: TradeType,
  options: SwapOptions,
  payerIsUser: boolean,
  routerMustCustody: boolean
): void {
  if (minHopPriceX36?.length && minHopPriceX36.length !== route.pools.length) {
    throw new Error(
      `minHopPriceX36 length (${minHopPriceX36.length}) must equal route.pools.length (${route.pools.length})`
    )
  }

  const trade = new V2Trade(
    route as RouteV2<TInput, TOutput>,
    tradeType == TradeType.EXACT_INPUT ? inputAmount : outputAmount,
    tradeType
  )

  const useV2_1_1 = isAtLeastV2_1_1(options.urVersion)

  if (tradeType == TradeType.EXACT_INPUT) {
    const params: any[] = [
      // if native, we have to unwrap so keep in the router for now
      routerMustCustody ? ROUTER_AS_RECIPIENT : options.recipient,
      firstHopInputAmount(options, trade.maximumAmountIn(options.slippageTolerance).quotient.toString()),
      // if router will custody funds, we do aggregated slippage check from router
      routerMustCustody ? 0 : trade.minimumAmountOut(options.slippageTolerance).quotient.toString(),
      route.path.map((token) => token.wrapped.address),
      payerIsUser,
    ]
    if (useV2_1_1) params.push(minHopPriceX36 ?? [])
    planner.addCommand(CommandType.V2_SWAP_EXACT_IN, params, false, options.urVersion)
  } else if (tradeType == TradeType.EXACT_OUTPUT) {
    const params: any[] = [
      routerMustCustody ? ROUTER_AS_RECIPIENT : options.recipient,
      trade.minimumAmountOut(options.slippageTolerance).quotient.toString(),
      trade.maximumAmountIn(options.slippageTolerance).quotient.toString(),
      route.path.map((token) => token.wrapped.address),
      payerIsUser,
    ]
    if (useV2_1_1) params.push(minHopPriceX36 ?? [])
    planner.addCommand(CommandType.V2_SWAP_EXACT_OUT, params, false, options.urVersion)
  }
}

// encode a uniswap v3 swap
function addV3Swap<TInput extends Currency, TOutput extends Currency>(
  planner: RoutePlanner,
  { route, inputAmount, outputAmount, minHopPriceX36 }: Swap<TInput, TOutput>,
  tradeType: TradeType,
  options: SwapOptions,
  payerIsUser: boolean,
  routerMustCustody: boolean
): void {
  if (minHopPriceX36?.length && minHopPriceX36.length !== route.pools.length) {
    throw new Error(
      `minHopPriceX36 length (${minHopPriceX36.length}) must equal route.pools.length (${route.pools.length})`
    )
  }

  const trade = V3Trade.createUncheckedTrade({
    route: route as RouteV3<TInput, TOutput>,
    inputAmount,
    outputAmount,
    tradeType,
  })

  const useV2_1_1 = isAtLeastV2_1_1(options.urVersion)
  const path = encodeRouteToPath(route as RouteV3<TInput, TOutput>, trade.tradeType === TradeType.EXACT_OUTPUT)

  if (tradeType == TradeType.EXACT_INPUT) {
    const params: any[] = [
      routerMustCustody ? ROUTER_AS_RECIPIENT : options.recipient,
      firstHopInputAmount(options, trade.maximumAmountIn(options.slippageTolerance).quotient.toString()),
      routerMustCustody ? 0 : trade.minimumAmountOut(options.slippageTolerance).quotient.toString(),
      path,
      payerIsUser,
    ]
    if (useV2_1_1) params.push(minHopPriceX36 ?? [])
    planner.addCommand(CommandType.V3_SWAP_EXACT_IN, params, false, options.urVersion)
  } else if (tradeType == TradeType.EXACT_OUTPUT) {
    const params: any[] = [
      routerMustCustody ? ROUTER_AS_RECIPIENT : options.recipient,
      trade.minimumAmountOut(options.slippageTolerance).quotient.toString(),
      trade.maximumAmountIn(options.slippageTolerance).quotient.toString(),
      path,
      payerIsUser,
    ]
    if (useV2_1_1) params.push(minHopPriceX36 ?? [])
    planner.addCommand(CommandType.V3_SWAP_EXACT_OUT, params, false, options.urVersion)
  }
}

function addV4Swap<TInput extends Currency, TOutput extends Currency>(
  planner: RoutePlanner,
  { inputAmount, outputAmount, route, minHopPriceX36 }: Swap<TInput, TOutput>,
  tradeType: TradeType,
  options: SwapOptions,
  payerIsUser: boolean,
  routerMustCustody: boolean
): void {
  if (minHopPriceX36?.length && minHopPriceX36.length !== route.pools.length) {
    throw new Error(
      `minHopPriceX36 length (${minHopPriceX36.length}) must equal route.pools.length (${route.pools.length})`
    )
  }

  // create a deep copy of pools since v4Planner encoding tampers with array
  const pools = route.pools.map((p) => p) as V4Pool[]
  const v4Route = new V4Route(pools, inputAmount.currency, outputAmount.currency)
  const trade = V4Trade.createUncheckedTrade({
    route: v4Route,
    inputAmount,
    outputAmount,
    tradeType,
  })

  const slippageToleranceOnSwap =
    routerMustCustody && tradeType == TradeType.EXACT_INPUT ? undefined : options.slippageTolerance

  const perHopSlippage = minHopPriceX36?.map((s) => BigNumber.from(s)) ?? []

  const v4Planner = new V4Planner()
  if (options.routerBalanceInput) {
    // V4Planner.addTrade would bake the quoted amountIn into the swap action, so build the
    // pair explicitly instead: SETTLE the router's whole balance, then swap the resulting
    // open delta. Same shape the mixed-route encoder uses for its v4 sections.
    const pathInput = trade.route.pathInput
    v4Planner.addSettle(pathInput, false, CONTRACT_BALANCE)
    v4Planner.addAction(
      Actions.SWAP_EXACT_IN,
      [
        {
          currencyIn: pathInput.isNative ? ETH_ADDRESS : pathInput.wrapped.address,
          path: encodeV4RouteToPath(v4Route),
          minHopPriceX36: perHopSlippage,
          amountIn: 0, // open delta: the amount settled above
          amountOutMinimum: slippageToleranceOnSwap
            ? trade.minimumAmountOut(slippageToleranceOnSwap).quotient.toString()
            : 0,
        },
      ],
      toV4URVersion(options.urVersion)
    )
  } else {
    v4Planner.addTrade(trade, slippageToleranceOnSwap, perHopSlippage, toV4URVersion(options.urVersion))
    v4Planner.addSettle(trade.route.pathInput, payerIsUser)
  }

  // Handle split route output consistency:
  // - If output is ETH and some routes output WETH: force all to output WETH, then unwrap
  // - If output is WETH and some routes output ETH: force all to output ETH, then wrap
  let pathOutputForTake = trade.route.pathOutput
  let lastPool = v4Route.pools[v4Route.pools.length - 1]
  let ethWethPool = lastPool.currency1.equals(lastPool.currency0.wrapped)

  if (ethWethPool && v4Route.pools.length > 1) {
    let poolBefore = v4Route.pools[v4Route.pools.length - 2]
    if (pathOutputForTake.isNative && poolBefore.currency0.isNative) {
      pathOutputForTake = pathOutputForTake.wrapped
    } else if (
      !pathOutputForTake.isNative &&
      (poolBefore.currency0.equals(lastPool.currency1) || poolBefore.currency1.equals(lastPool.currency1))
    ) {
      pathOutputForTake = lastPool.currency0
    }
  }

  // Floor exact-out delivery: TAKE the exact leg amountOut instead of OPEN_DELTA, so an
  // under-delivering pool (e.g. liquidity exhausted at the price limit) leaves an unsettled
  // delta and reverts at unlock instead of silently forwarding a partial fill.
  let takeAmount: BigNumber | undefined
  if (tradeType === TradeType.EXACT_OUTPUT) {
    takeAmount = BigNumber.from(outputAmount.quotient.toString())
    // amount 0 encodes as the OPEN_DELTA sentinel, which would silently drop the floor
    invariant(!takeAmount.isZero(), 'ZERO_EXACT_OUTPUT_AMOUNT')
  }

  v4Planner.addTake(
    pathOutputForTake,
    routerMustCustody ? ROUTER_AS_RECIPIENT : options.recipient ?? SENDER_AS_RECIPIENT,
    takeAmount
  )
  planner.addCommand(CommandType.V4_SWAP, [v4Planner.finalize()])
}

// encode a mixed route swap, i.e. including both v2 and v3 pools
function addMixedSwap<TInput extends Currency, TOutput extends Currency>(
  planner: RoutePlanner,
  swap: Swap<TInput, TOutput>,
  tradeType: TradeType,
  options: SwapOptions,
  payerIsUser: boolean,
  routerMustCustody: boolean
): void {
  const route = swap.route as MixedRoute<TInput, TOutput>
  if (swap.minHopPriceX36?.length && swap.minHopPriceX36.length !== route.pools.length) {
    throw new Error(
      `minHopPriceX36 length (${swap.minHopPriceX36.length}) must equal route.pools.length (${route.pools.length})`
    )
  }
  const inputAmount = swap.inputAmount
  const outputAmount = swap.outputAmount
  const tradeRecipient = routerMustCustody ? ROUTER_AS_RECIPIENT : options.recipient ?? SENDER_AS_RECIPIENT

  // single hop, so it can be reduced to plain swap logic for one protocol version
  if (route.pools.length === 1) {
    if (route.pools[0] instanceof V4Pool) {
      return addV4Swap(planner, swap, tradeType, options, payerIsUser, routerMustCustody)
    } else if (route.pools[0] instanceof V3Pool) {
      return addV3Swap(planner, swap, tradeType, options, payerIsUser, routerMustCustody)
    } else if (route.pools[0] instanceof Pair) {
      return addV2Swap(planner, swap, tradeType, options, payerIsUser, routerMustCustody)
    } else {
      throw new Error('Invalid route type')
    }
  }

  const trade = MixedRouteTrade.createUncheckedTrade({
    route: route as MixedRoute<TInput, TOutput>,
    inputAmount,
    outputAmount,
    tradeType,
  })

  const amountIn = trade.maximumAmountIn(options.slippageTolerance, inputAmount).quotient.toString()
  const amountOut = routerMustCustody
    ? 0
    : trade.minimumAmountOut(options.slippageTolerance, outputAmount).quotient.toString()

  // logic from
  // https://github.com/Uniswap/router-sdk/blob/d8eed164e6c79519983844ca8b6a3fc24ebcb8f8/src/swapRouter.ts#L276
  const sections = partitionMixedRouteByProtocol(route as MixedRoute<TInput, TOutput>)
  const isLastSectionInRoute = (i: number) => {
    return i === sections.length - 1
  }

  const useV2_1_1 = isAtLeastV2_1_1(options.urVersion)

  let inputToken = route.pathInput
  let hopOffset = 0

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    const routePool = section[0]
    const outputToken = getOutputOfPools(section, inputToken)
    const subRoute = new MixedRoute(new MixedRouteSDK([...section], inputToken, outputToken))

    // Slice this section's portion of minHopPriceX36 from the flat array
    const sectionHopSlippage = swap.minHopPriceX36?.slice(hopOffset, hopOffset + section.length)

    let nextInputToken
    let swapRecipient

    if (isLastSectionInRoute(i)) {
      nextInputToken = outputToken
      swapRecipient = tradeRecipient
    } else {
      const nextPool = sections[i + 1][0]
      nextInputToken = getPathCurrency(outputToken, nextPool)

      const v2PoolIsSwapRecipient = nextPool instanceof Pair && outputToken.equals(nextInputToken)
      swapRecipient = v2PoolIsSwapRecipient ? (nextPool as Pair).liquidityToken.address : ROUTER_AS_RECIPIENT
    }

    if (routePool instanceof V4Pool) {
      const v4Planner = new V4Planner()
      const v4SubRoute = new V4Route(section as V4Pool[], subRoute.input, subRoute.output)
      const v4SectionSlippage: BigNumber[] = sectionHopSlippage?.map((s) => BigNumber.from(s)) ?? []

      v4Planner.addSettle(
        inputToken,
        payerIsUser && i === 0,
        (i == 0 ? firstHopInputAmount(options, amountIn) : CONTRACT_BALANCE) as BigNumber
      )
      v4Planner.addAction(
        Actions.SWAP_EXACT_IN,
        [
          {
            currencyIn: inputToken.isNative ? ETH_ADDRESS : inputToken.address,
            path: encodeV4RouteToPath(v4SubRoute),
            minHopPriceX36: v4SectionSlippage,
            amountIn: 0, // denotes open delta, amount set in v4Planner.addSettle()
            amountOutMinimum: !isLastSectionInRoute(i) ? 0 : amountOut,
          },
        ],
        toV4URVersion(options.urVersion)
      )

      // Handle split route output consistency for V4 sections in mixed routes
      let outputTokenForTake = outputToken
      if (isLastSectionInRoute(i)) {
        let lastPool = route.pools[route.pools.length - 1]
        let v4Pool = lastPool instanceof V4Pool
        let ethWethPool = v4Pool ? (lastPool as V4Pool).currency1.equals((lastPool as V4Pool).currency0.wrapped) : false
        let poolBefore = route.pools[route.pools.length - 2]

        if (ethWethPool) {
          if (outputToken.isNative && poolBefore.token0.isNative) {
            outputTokenForTake = outputToken.wrapped
          } else if (
            !outputToken.isNative &&
            (poolBefore.token0.equals(lastPool.token1) || poolBefore.token1.equals(lastPool.token1))
          ) {
            outputTokenForTake = lastPool.token0
          }
        }
      }

      v4Planner.addTake(outputTokenForTake, swapRecipient)

      planner.addCommand(CommandType.V4_SWAP, [v4Planner.finalize()])
    } else if (routePool instanceof V3Pool) {
      const v3Params: any[] = [
        swapRecipient, // recipient
        i == 0 ? firstHopInputAmount(options, amountIn) : CONTRACT_BALANCE, // amountIn
        !isLastSectionInRoute(i) ? 0 : amountOut, // amountOut
        encodeMixedRouteToPath(subRoute), // path
        payerIsUser && i === 0, // payerIsUser
      ]
      if (useV2_1_1) v3Params.push(sectionHopSlippage ?? [])
      planner.addCommand(CommandType.V3_SWAP_EXACT_IN, v3Params, false, options.urVersion)
    } else if (routePool instanceof Pair) {
      const v2Params: any[] = [
        swapRecipient, // recipient
        i === 0 ? firstHopInputAmount(options, amountIn) : CONTRACT_BALANCE, // amountIn
        !isLastSectionInRoute(i) ? 0 : amountOut, // amountOutMin
        subRoute.path.map((token) => token.wrapped.address), // path
        payerIsUser && i === 0,
      ]
      if (useV2_1_1) v2Params.push(sectionHopSlippage ?? [])
      planner.addCommand(CommandType.V2_SWAP_EXACT_IN, v2Params, false, options.urVersion)
    } else {
      throw new Error('Unexpected Pool Type')
    }

    // perform a token transition (wrap/unwrap if necessary)
    if (!isLastSectionInRoute(i)) {
      if (outputToken.isNative && !nextInputToken.isNative) {
        planner.addCommand(CommandType.WRAP_ETH, [ROUTER_AS_RECIPIENT, CONTRACT_BALANCE])
      } else if (!outputToken.isNative && nextInputToken.isNative) {
        planner.addCommand(CommandType.UNWRAP_WETH, [ROUTER_AS_RECIPIENT, 0])
      }
    }

    hopOffset += section.length
    inputToken = nextInputToken
  }
}

// if price impact is very high, there's a chance of hitting max/min prices resulting in a partial fill of the swap
function riskOfPartialFill(trade: RouterTrade<Currency, Currency, TradeType>): boolean {
  return trade.priceImpact.greaterThan(REFUND_ETH_PRICE_IMPACT_THRESHOLD)
}

// A lone FeeOptions becomes a one-element list, so the single-recipient path is unchanged.
function toFeeOptionsList(fee: SwapOptions['fee']): FeeOptions[] {
  if (!fee) return []
  return Array.isArray(fee) ? fee : [fee]
}

function hasFeeOption(swapOptions: SwapOptions): boolean {
  return toFeeOptionsList(swapOptions.fee).length > 0 || !!swapOptions.flatFee
}
