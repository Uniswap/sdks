import type { Address, Hex } from 'viem'
import { encodeAbiParameters, encodeFunctionData, isAddressEqual, parseAbiParameters, zeroAddress } from 'viem'

import { UR_ADDRESS_THIS } from '../constants'
import { UnsupportedRouteError } from '../errors'
import { UR_ABI } from '../internal/abis'
import { isNative } from '../internal/currency'
import { assertPlanInvariants } from '../plan/compile'
import { assertNever, isSwapOperation, payerOf, recipientOf } from '../plan/operations'
import { encodeV3Path } from '../protocols/v3'
import type {
  ConversionOperation,
  CurrencyRef,
  EncodedTx,
  ExecutionOperation,
  ExecutionPlan,
  RouteLeg,
  SwapOperation,
  UniversalRouterDeployment,
} from '../types'

// ---------------------------------------------------------------------------
// `ur-2.0` execution-plan encoder.
//
// This module turns an {@link ExecutionPlan} — an ordered list of operations
// with explicit custody — into Universal Router `execute(commands, inputs,
// deadline)` calldata. It is the *only* place in the SDK that knows command
// bytes, sentinel addresses and v4 action layouts, and it decides nothing about
// custody: every recipient, payer and amount is read off the plan.
//
// It is pinned to one immutable deployment family (`commandSet: 'ur-2.0'`).
// Anything else throws, because a command byte that moved between router
// versions is a fund-loss bug, not a compatibility warning.
//
// Correctness is established differentially: `differential.test.ts` builds the
// same trade through `@uniswap/universal-router-sdk` and compares calldata
// byte-for-byte, and `goldens.json` freezes the result so the oracle cannot
// drift silently. Three encodings intentionally differ from that SDK; each is
// called out at its site below and re-stated here so they are impossible to
// miss:
//
//  1. A trailing `wrap-native` (v4 produced native, the trade delivers wrapped
//     native) carries `amountOutMinimum` on the preceding v4 swap. The SDK
//     zeroes it and then wraps with no floor, leaving the trade with *no*
//     slippage check at all.
//  2. Contiguous v2 operations are merged into one multi-hop
//     `V2_SWAP_EXACT_IN`, matching the SDK; the plan keeps them separate
//     because quoting composes v2 reserves leg by leg.
//  3. We emit no partial-fill refund. When a pool cannot fill the whole input
//     (liquidity exhausted at a price limit), the swap consumes less than it
//     was given and the remainder stays wherever it sat. The SDK guards this
//     with a trailing refund — `SWEEP(ETH, recipient, 0)` for native input,
//     `UNWRAP_WETH(recipient, 0)` after a leading wrap, `WRAP_ETH(recipient,
//     CONTRACT_BALANCE)` after a leading unwrap — whenever it estimates a
//     partial-fill risk (price impact > 50%).
//
//     Exposure: only plans whose input is *router-custodied* — native input,
//     wrapped-native input, or anything with a leading conversion. There the
//     unconsumed remainder is stranded in the router (recoverable by anyone,
//     effectively lost) if the trade still clears its min-out. Plans that pay
//     pools straight from the trader's Permit2 allowance cannot strand
//     anything: an unspent allowance is simply never drawn.
//
//     Deliberately not fixed here. Refunding and rejecting are both defensible
//     (a refund silently converts an exact-input trade into a partial one),
//     and the rejecting side wants a preflight that detects the shortfall
//     before broadcast rather than a command appended after the fact. Owner:
//     the wave-engine/preflight tasks, plus a product decision.
// ---------------------------------------------------------------------------

/**
 * Universal Router `ur-2.0` command bytes.
 *
 * EXPORTED FOR TEST-TIME PARITY ONLY (R6) — not re-exported from `index.ts` or `experimental.ts`,
 * so this is not public API. The values were "verified against `universal-router-sdk`'s
 * `CommandType`" by a human reading two files; `ur20.test.ts` now asserts every entry against that
 * enum mechanically, on every run, without `universal-router-sdk` becoming a runtime dependency
 * (it stays a devDependency — the same C4-P4 posture as `manifest.parity.test.ts`). A command byte
 * that moved between router versions is a fund-loss bug, which is more than a comment should be
 * asked to hold.
 */
export const COMMAND = {
  V3_SWAP_EXACT_IN: 0x00,
  PERMIT2_TRANSFER_FROM: 0x02,
  V2_SWAP_EXACT_IN: 0x08,
  PERMIT2_PERMIT: 0x0a,
  WRAP_ETH: 0x0b,
  UNWRAP_WETH: 0x0c,
  V4_SWAP: 0x10,
} as const

/** v4 router action bytes. Asserted against `v4-sdk`'s `Actions` in `ur20.test.ts` — exported for
 * that test only, on the same terms as {@link COMMAND} above (R6). */
export const V4_ACTION = {
  SWAP_EXACT_IN: 0x07,
  SETTLE: 0x0b,
  TAKE: 0x0e,
} as const

/**
 * Sentinel amount meaning "the router's entire balance of this currency". Used for every amount the
 * encoder cannot know statically: each operation after the first spends whatever its predecessor
 * left behind.
 */
const CONTRACT_BALANCE = 2n ** 255n

/** Sentinel amount meaning "settle/take the whole open delta" in a v4 action. */
const OPEN_DELTA = 0n

const V2_SWAP_PARAMS = parseAbiParameters(
  'address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, bool payerIsUser',
)
const V3_SWAP_PARAMS = parseAbiParameters(
  'address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser',
)
const WRAP_UNWRAP_PARAMS = parseAbiParameters('address recipient, uint256 amount')
const PERMIT2_TRANSFER_FROM_PARAMS = parseAbiParameters('address token, address recipient, uint160 amount')
const PERMIT2_PERMIT_PARAMS = parseAbiParameters(
  '((address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline) permit, bytes signature',
)
const V4_SWAP_PARAMS = parseAbiParameters('bytes actions, bytes[] params')
const V4_SWAP_EXACT_IN_PARAMS = parseAbiParameters(
  '(address currencyIn, (address intermediateCurrency, uint256 fee, int24 tickSpacing, address hooks, bytes hookData)[] path, uint128 amountIn, uint128 amountOutMinimum) swap',
)
const V4_SETTLE_PARAMS = parseAbiParameters('address currency, uint256 amount, bool payerIsUser')
const V4_TAKE_PARAMS = parseAbiParameters('address currency, address recipient, uint256 amount')

/**
 * Guards the one place the encoder does not take the plan at its word.
 *
 * `payerIsUser` is derived from the operation sequence (nothing had to happen to the funds first)
 * rather than read off the first operation's payer. The two agree everywhere except one shape:
 * native input straight into v4, where the plan says `settleFrom: 'router'` because
 * 'trader-via-permit2' is meaningless for ETH, and the router encoding says `payerIsUser: true`
 * because a native v4 SETTLE ignores the payer entirely — it forwards the router's own value to the
 * pool manager. That single exemption is spelled out here so that any *other* disagreement, which
 * would mean the plan and the encoder disagree about who funds the trade, fails loudly instead of
 * being silently overridden.
 */
function assertPayerAgreesWithPlan(
  derived: boolean,
  acquireInput: ExecutionPlan['acquireInput'],
  firstSwap: SwapOperation,
): void {
  const planned = payerOf(firstSwap) === 'trader-via-permit2'
  if (derived === planned) return
  if (derived && acquireInput.kind === 'native-value' && firstSwap.kind === 'v4-swap') return
  throw new UnsupportedRouteError(
    `plan funds its first ${firstSwap.kind} from '${payerOf(firstSwap)}' but the operation sequence encodes payerIsUser=${derived}`,
  )
}

/** A currency as the router spells it on the wire: native is `address(0)`. */
function currencyAddress(currency: CurrencyRef): Address {
  return isNative(currency) ? zeroAddress : currency
}

function byteHex(value: number): string {
  return value.toString(16).padStart(2, '0')
}

/**
 * Merges runs of contiguous v2 operations into a single multi-hop one.
 *
 * The plan keeps every v2 leg in its own operation because quoting composes v2 reserves leg by leg,
 * but the router's `V2_SWAP_EXACT_IN` walks a whole token path in one command — sending each hop's
 * output straight into the next pair instead of round-tripping through the router. Merging is what
 * `universal-router-sdk` emits, is strictly cheaper, and is safe precisely because two adjacent v2
 * operations always agree on the hand-off currency (a plan invariant) and the later one is always
 * router-paid.
 */
function mergeContiguousV2(operations: ExecutionOperation[]): ExecutionOperation[] {
  const merged: ExecutionOperation[] = []
  for (const op of operations) {
    const previous = merged[merged.length - 1]
    if (op.kind === 'v2-swap' && previous?.kind === 'v2-swap') {
      merged[merged.length - 1] = { ...previous, legs: [...previous.legs, ...op.legs], recipient: op.recipient }
      continue
    }
    merged.push(op)
  }
  return merged
}

/**
 * Guards the assumption `protocols/v3.ts#encodeV3Path` is called under here (R4).
 *
 * THE ENCODER USED TO HAVE ITS OWN v3 PATH BUILDER — a `concatHex` of manually `padStart`-ed fee
 * bytes, second implementation of a format `protocols/v3.ts` already encodes with `encodePacked`
 * against ABI types. Two hand-rolled encodings of one wire format is one too many: the fee width
 * (3 bytes, `uint24`) was a literal `6` in a `padStart` here and a type in the ABI there, and only
 * one of them was covered by the differential suite against `universal-router-sdk`.
 *
 * The surviving implementation resolves a `'native'` leg input to `wrappedNative`, while this one
 * resolved it to `address(0)`. The difference is unobservable, and this assertion is what says so
 * out loud rather than leaving it to be rediscovered: `assertPlanInvariants` rejects any v2/v3
 * operation holding native (`"${op.kind} operations hold wrapped native only, never native"`), so
 * no v3 leg reaching this encoder can carry it, and every plan arrives here already wrapped by
 * `plan/compile.ts#wrappedLeg`. If that invariant is ever relaxed, this throws instead of silently
 * encoding a path against a different token than either implementation intended.
 */
function assertNoNativeInV3Path(legs: RouteLeg[]): void {
  for (const leg of legs) {
    if (isNative(leg.currencyIn) || isNative(leg.currencyOut)) {
      throw new UnsupportedRouteError(
        `a v3 operation reached the encoder holding native currency; v2/v3 legs are always wrapped (plan invariant)`,
      )
    }
  }
}

/** `[tokenIn, …tokenOut per hop]` — the v2 address path. */
function encodeV2Path(legs: RouteLeg[]): Address[] {
  return [currencyAddress(legs[0]!.currencyIn), ...legs.map((leg) => currencyAddress(leg.currencyOut))]
}

function encodeV4PathKeys(legs: RouteLeg[]): {
  intermediateCurrency: Address
  fee: bigint
  tickSpacing: number
  hooks: Address
  hookData: Hex
}[] {
  return legs.map((leg) => {
    if (leg.pool.protocol !== 'v4') throw new UnsupportedRouteError(`v4 path contains a ${leg.pool.protocol} leg`)
    return {
      intermediateCurrency: currencyAddress(leg.currencyOut),
      fee: BigInt(leg.pool.poolKey.fee),
      tickSpacing: leg.pool.poolKey.tickSpacing,
      hooks: leg.pool.poolKey.hooks,
      hookData: leg.hookData ?? '0x',
    }
  })
}

type Command = { type: number; input: Hex }

/**
 * Encodes an {@link ExecutionPlan} as Universal Router `execute` calldata for a `ur-2.0` deployment.
 *
 * Throws {@link UnsupportedRouteError} for any deployment outside the closed supported command set,
 * for any plan that fails {@link assertPlanInvariants}, and for any plan shape the closed set does
 * not cover (more than two swap groups after v2 merging, or a leading unwrap that is not funded by
 * a Permit2 pull).
 *
 * `deadline` is the Universal Router's own execution deadline; it is the caller's, derived from the
 * pinned block timestamp rather than wall-clock time.
 */
export function encodeExecutionPlan(
  plan: ExecutionPlan,
  deployment: UniversalRouterDeployment,
  deadline: bigint,
): EncodedTx {
  if (deployment.commandSet !== 'ur-2.0')
    throw new UnsupportedRouteError(
      `unsupported Universal Router command set '${String(deployment.commandSet)}'; only 'ur-2.0' is encodable`,
    )
  // A hand-built plan gets exactly the same scrutiny the compiler's own output does.
  assertPlanInvariants(plan, deployment.wrappedNative)
  if (deadline <= 0n) throw new UnsupportedRouteError(`deadline must be positive, got ${deadline}`)

  const { acquireInput, deliverOutput } = plan
  const operations = mergeContiguousV2(plan.operations)
  const swaps = operations.filter(isSwapOperation)
  if (swaps.length > 2)
    throw new UnsupportedRouteError(`plans with more than two swap groups are not encodable; got ${swaps.length}`)

  const leading: ConversionOperation | undefined = isSwapOperation(operations[0]!) ? undefined : operations[0]
  const lastOperation = operations[operations.length - 1]!
  const trailing: ConversionOperation | undefined = isSwapOperation(lastOperation) ? undefined : lastOperation

  // The router pays pools out of the trader's Permit2 allowance only when the funds never had to
  // land in the router first. A leading wrap/unwrap means they did, so the router self-funds.
  const payerIsUser = leading === undefined
  assertPayerAgreesWithPlan(payerIsUser, acquireInput, swaps[0]!)

  // Exactly one slippage floor exists in a plan, and it sits wherever the funds are last handled.
  const floorOnTrailingUnwrap = trailing?.kind === 'unwrap-native'
  const floorOnLastSwap = !floorOnTrailingUnwrap

  const commands: Command[] = []

  // --- input acquisition -------------------------------------------------------------------
  if (acquireInput.kind === 'permit2-pull' && acquireInput.permit) {
    const { details, spender, sigDeadline, signature } = acquireInput.permit
    // A Permit2 permit is an *allowance grant*, not a transfer: it outlives this transaction. A
    // permit naming anyone but this router would be broadcast on the trader's behalf and leave that
    // party spending their tokens afterwards — and the swap itself would still succeed whenever the
    // trader already had a standing allowance, so nothing downstream would notice.
    // `isAddressEqual` (R3): both are validated addresses by now — the permit's spender by
    // `router.ts#validateSwapRequest`, the deployment's by the manifest — and a permit written with
    // checksummed casing must not read as "grants an allowance to someone else".
    if (!isAddressEqual(spender, deployment.address))
      throw new UnsupportedRouteError(
        `permit grants an allowance to ${spender}, not to the Universal Router at ${deployment.address}`,
      )
    commands.push({
      type: COMMAND.PERMIT2_PERMIT,
      input: encodeAbiParameters(PERMIT2_PERMIT_PARAMS, [
        {
          details: {
            token: details.token,
            amount: details.amount,
            expiration: details.expiration,
            nonce: details.nonce,
          },
          spender,
          sigDeadline,
        },
        signature,
      ]),
    })
  }

  // --- leading conversion ------------------------------------------------------------------
  if (leading?.kind === 'wrap-native') {
    // Native input is attached as msg.value, so the exact amount is known and wrapped outright.
    commands.push({
      type: COMMAND.WRAP_ETH,
      input: encodeAbiParameters(WRAP_UNWRAP_PARAMS, [UR_ADDRESS_THIS, acquireInput.amount]),
    })
  } else if (leading?.kind === 'unwrap-native') {
    if (acquireInput.kind !== 'permit2-pull')
      throw new UnsupportedRouteError('a leading unwrap requires the input to be pulled through Permit2')
    // UNWRAP_WETH calls `withdraw` on the router's own immutable WETH, whatever the plan pulled. A
    // plan that pulls some other token and then unwraps would move that token into the router and
    // strand it there, while the swap runs on the router's incidental native balance.
    if (!isAddressEqual(acquireInput.token, deployment.wrappedNative))
      throw new UnsupportedRouteError(
        `a leading unwrap must pull the router's wrapped native (${deployment.wrappedNative}), not ${acquireInput.token}`,
      )
    // The pull has to be explicit: the swap that follows is router-paid, so nothing else would move
    // the wrapped native into the router for the unwrap.
    commands.push({
      type: COMMAND.PERMIT2_TRANSFER_FROM,
      input: encodeAbiParameters(PERMIT2_TRANSFER_FROM_PARAMS, [
        acquireInput.token,
        UR_ADDRESS_THIS,
        acquireInput.amount,
      ]),
    })
    // Floor 0: UNWRAP_WETH unwraps the router's whole balance and treats its argument as a minimum.
    // The pull immediately above guarantees that balance covers the input, so a floor here would be
    // a check that can never fire — the plan's one real floor lives at the delivery end.
    commands.push({
      type: COMMAND.UNWRAP_WETH,
      input: encodeAbiParameters(WRAP_UNWRAP_PARAMS, [UR_ADDRESS_THIS, 0n]),
    })
  }

  // --- swaps and the conversions between them ----------------------------------------------
  let swapIndex = 0
  for (const op of operations) {
    if (!isSwapOperation(op)) {
      if (op === leading || op === trailing) continue
      // An intermediate conversion always works on whatever the previous group produced.
      commands.push({
        type: op.kind === 'wrap-native' ? COMMAND.WRAP_ETH : COMMAND.UNWRAP_WETH,
        input: encodeAbiParameters(WRAP_UNWRAP_PARAMS, [
          UR_ADDRESS_THIS,
          op.kind === 'wrap-native' ? CONTRACT_BALANCE : 0n,
        ]),
      })
      continue
    }

    const isFirstSwap = swapIndex === 0
    const isLastSwap = swapIndex === swaps.length - 1
    swapIndex++

    const recipient = recipientOf(op) === 'final' ? deliverOutput.recipient : UR_ADDRESS_THIS
    // Operation 0 spends the acquired input; everything after it spends what it inherited.
    const amountIn = isFirstSwap ? acquireInput.amount : CONTRACT_BALANCE
    // A trailing wrap is the one case where the group that carries the floor is not the group that
    // pays the recipient: WRAP_ETH has no minimum parameter, so without this the trade would ship
    // with no slippage check whatsoever. universal-router-sdk zeroes this field; we do not.
    const amountOutMin = isLastSwap && floorOnLastSwap ? deliverOutput.minAmountOut : 0n
    const payer = payerIsUser && isFirstSwap

    if (op.kind === 'v2-swap') {
      commands.push({
        type: COMMAND.V2_SWAP_EXACT_IN,
        input: encodeAbiParameters(V2_SWAP_PARAMS, [recipient, amountIn, amountOutMin, encodeV2Path(op.legs), payer]),
      })
    } else if (op.kind === 'v3-swap') {
      // ONE v3 path encoder for the whole package (R4): `protocols/v3.ts`'s, which builds the
      // `token(20) | fee(3) | token(20) …` layout with `encodePacked` against ABI types rather than
      // hand-padded hex, and is the one the differential suite already pins byte-for-byte against
      // `universal-router-sdk`. See `assertNoNativeInV3Path` for why the `wrappedNative` argument
      // can never actually be consulted from here.
      assertNoNativeInV3Path(op.legs)
      commands.push({
        type: COMMAND.V3_SWAP_EXACT_IN,
        input: encodeAbiParameters(V3_SWAP_PARAMS, [
          recipient,
          amountIn,
          amountOutMin,
          encodeV3Path(op.legs, deployment.wrappedNative),
          payer,
        ]),
      })
    } else if (op.kind === 'v4-swap') {
      commands.push({
        type: COMMAND.V4_SWAP,
        input: encodeV4Swap({
          legs: op.legs,
          isWholeRoute: swaps.length === 1,
          amountIn,
          amountOutMin,
          payerIsUser: payer,
          recipient,
        }),
      })
    } else {
      assertNever(op, 'swap operation kind')
    }
  }

  // --- trailing conversion / delivery --------------------------------------------------------
  if (trailing?.kind === 'unwrap-native') {
    commands.push({
      type: COMMAND.UNWRAP_WETH,
      input: encodeAbiParameters(WRAP_UNWRAP_PARAMS, [deliverOutput.recipient, deliverOutput.minAmountOut]),
    })
  } else if (trailing?.kind === 'wrap-native') {
    commands.push({
      type: COMMAND.WRAP_ETH,
      input: encodeAbiParameters(WRAP_UNWRAP_PARAMS, [deliverOutput.recipient, CONTRACT_BALANCE]),
    })
  }

  const data = encodeFunctionData({
    abi: UR_ABI,
    functionName: 'execute',
    args: [
      `0x${commands.map((command) => byteHex(command.type)).join('')}` as Hex,
      commands.map((command) => command.input),
      deadline,
    ],
  })

  return {
    to: deployment.address,
    data,
    value: acquireInput.kind === 'native-value' ? acquireInput.amount : 0n,
  }
}

/**
 * Encodes one v4 group as the `V4_SWAP` command's `(actions, params)` payload.
 *
 * The two action orderings are not cosmetic. When the group *is* the whole route the swap states
 * its own input amount and the settle closes whatever delta that produced (`SWAP, SETTLE, TAKE`).
 * When the group is one section of a mixed route the amount is only known to the settle — it is the
 * section's inherited balance — so the settle must come first and the swap consumes the open delta
 * (`SETTLE, SWAP, TAKE`). Both orderings mirror `universal-router-sdk`'s `addV4Swap` / `addMixedSwap`.
 */
function encodeV4Swap(args: {
  legs: RouteLeg[]
  isWholeRoute: boolean
  amountIn: bigint
  amountOutMin: bigint
  payerIsUser: boolean
  recipient: Address
}): Hex {
  const { legs, isWholeRoute, amountIn, amountOutMin, payerIsUser, recipient } = args
  const currencyIn = currencyAddress(legs[0]!.currencyIn)
  const currencyOut = currencyAddress(legs[legs.length - 1]!.currencyOut)
  const path = encodeV4PathKeys(legs)

  const swap = (swapAmountIn: bigint): Hex =>
    encodeAbiParameters(V4_SWAP_EXACT_IN_PARAMS, [
      { currencyIn, path, amountIn: swapAmountIn, amountOutMinimum: amountOutMin },
    ])
  const settle = (amount: bigint): Hex => encodeAbiParameters(V4_SETTLE_PARAMS, [currencyIn, amount, payerIsUser])
  const take = encodeAbiParameters(V4_TAKE_PARAMS, [currencyOut, recipient, OPEN_DELTA])

  const [actions, params] = isWholeRoute
    ? ([
        [V4_ACTION.SWAP_EXACT_IN, V4_ACTION.SETTLE, V4_ACTION.TAKE],
        [swap(amountIn), settle(OPEN_DELTA), take],
      ] as const)
    : ([
        [V4_ACTION.SETTLE, V4_ACTION.SWAP_EXACT_IN, V4_ACTION.TAKE],
        [settle(amountIn), swap(OPEN_DELTA), take],
      ] as const)

  return encodeAbiParameters(V4_SWAP_PARAMS, [`0x${actions.map(byteHex).join('')}` as Hex, [...params]])
}
