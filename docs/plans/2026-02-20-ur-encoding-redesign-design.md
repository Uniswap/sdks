# Universal Router SDK Encoding Redesign

## Problem

The current `UniswapTrade.encode()` interleaves safety-critical logic (token transfers, slippage protection) with protocol-specific swap encoding (~580 lines). This creates two problems:

1. **Routing can't innovate freely** -- new path shapes (splits, merges, flash accounting) require SDK changes
2. **Security review surface is large** -- safety-critical code is mixed with swap encoding, making audits harder

## Design Goals

- Keep user funds safe (SDK owns safety envelope)
- Give routing maximum flexibility with swap encodings
- Minimize code duplication and security review surface
- Insulate routing services from router version changes (opcode/encoding updates)

## Solution: `SwapRouter.encodeSwaps()`

Separate commands into two categories:

- **Safety-critical** (SDK-owned): Permit2 approval, initial token transfer into router, final sweep with slippage protection, excess refund
- **Non-critical** (Routing-owned): Swaps, intermediate transfers, protocol transitions, splits, merges

Routing describes what swaps to execute as structured data. The SDK wraps them in a safety envelope and handles all encoding (opcode mapping + ABI encoding).

## Types

```typescript
// === Intent (SDK-owned safety metadata) ===

type SwapIntent = {
  tradeType: TradeType
  inputToken: Currency
  outputToken: Currency
  inputAmount: CurrencyAmount<Currency>   // exact for EXACT_INPUT, max for EXACT_OUTPUT
  outputAmount: CurrencyAmount<Currency>  // expected for EXACT_INPUT, exact for EXACT_OUTPUT
  slippageTolerance: Percent
  recipient?: string                      // defaults to SENDER_AS_RECIPIENT
  permit?: Permit2Permit
  deadline?: BigNumberish
}

// === UR-level swap steps (routing-owned, typesafe whitelist) ===

type V2SwapExactIn = {
  type: 'V2_SWAP_EXACT_IN'
  recipient: string
  amountIn: BigNumberish
  amountOutMin: BigNumberish
  path: string[]            // token addresses
  payerIsUser: boolean
}

type V2SwapExactOut = {
  type: 'V2_SWAP_EXACT_OUT'
  recipient: string
  amountOut: BigNumberish
  amountInMax: BigNumberish
  path: string[]
  payerIsUser: boolean
}

type V3SwapExactIn = {
  type: 'V3_SWAP_EXACT_IN'
  recipient: string
  amountIn: BigNumberish
  amountOutMin: BigNumberish
  path: string              // encoded V3 path bytes
  payerIsUser: boolean
}

type V3SwapExactOut = {
  type: 'V3_SWAP_EXACT_OUT'
  recipient: string
  amountOut: BigNumberish
  amountInMax: BigNumberish
  path: string
  payerIsUser: boolean
}

type V4Swap = {
  type: 'V4_SWAP'
  v4Actions: V4Action[]
}

// Intermediate protocol transitions (routing may need these between V2/V3/V4 sections)
type WrapEth = {
  type: 'WRAP_ETH'
  recipient: string
  amount: BigNumberish
}

type UnwrapWeth = {
  type: 'UNWRAP_WETH'
  recipient: string
  amountMin: BigNumberish
}

type SwapStep =
  | V2SwapExactIn
  | V2SwapExactOut
  | V3SwapExactIn
  | V3SwapExactOut
  | V4Swap
  | WrapEth
  | UnwrapWeth

// === V4 actions (typed, used inside V4Swap.v4Actions) ===

type PoolKey = {
  currency0: string
  currency1: string
  fee: number
  tickSpacing: number
  hooks: string
}

type PathKey = {
  intermediateCurrency: string
  fee: BigNumberish
  tickSpacing: number
  hooks: string
  hookData: string
}

type V4SwapExactIn = {
  action: 'SWAP_EXACT_IN'
  currencyIn: string
  path: PathKey[]
  amountIn: BigNumberish
  amountOutMinimum: BigNumberish
}

type V4SwapExactInSingle = {
  action: 'SWAP_EXACT_IN_SINGLE'
  poolKey: PoolKey
  zeroForOne: boolean
  amountIn: BigNumberish
  amountOutMinimum: BigNumberish
  hookData: string
}

type V4SwapExactOut = {
  action: 'SWAP_EXACT_OUT'
  currencyOut: string
  path: PathKey[]
  amountOut: BigNumberish
  amountInMaximum: BigNumberish
}

type V4SwapExactOutSingle = {
  action: 'SWAP_EXACT_OUT_SINGLE'
  poolKey: PoolKey
  zeroForOne: boolean
  amountOut: BigNumberish
  amountInMaximum: BigNumberish
  hookData: string
}

type V4Settle = {
  action: 'SETTLE'
  currency: string
  amount: BigNumberish
  payerIsUser: boolean
}

type V4SettleAll = {
  action: 'SETTLE_ALL'
  currency: string
  maxAmount: BigNumberish
}

type V4SettlePair = {
  action: 'SETTLE_PAIR'
  currency0: string
  currency1: string
}

type V4Take = {
  action: 'TAKE'
  currency: string
  recipient: string
  amount: BigNumberish
}

type V4TakeAll = {
  action: 'TAKE_ALL'
  currency: string
  minAmount: BigNumberish
}

type V4TakePortion = {
  action: 'TAKE_PORTION'
  currency: string
  recipient: string
  bips: BigNumberish
}

type V4TakePair = {
  action: 'TAKE_PAIR'
  currency0: string
  currency1: string
  recipient: string
}

type V4CloseCurrency = {
  action: 'CLOSE_CURRENCY'
  currency: string
}

type V4Sweep = {
  action: 'SWEEP'
  currency: string
  recipient: string
}

type V4Unwrap = {
  action: 'UNWRAP'
  amount: BigNumberish
}

type V4Action =
  | V4SwapExactIn
  | V4SwapExactInSingle
  | V4SwapExactOut
  | V4SwapExactOutSingle
  | V4Settle
  | V4SettleAll
  | V4SettlePair
  | V4Take
  | V4TakeAll
  | V4TakePortion
  | V4TakePair
  | V4CloseCurrency
  | V4Sweep
  | V4Unwrap
```

The discriminated unions on `type` (UR commands) and `action` (V4 actions) give:
- Compile-time type checking -- routing can't pass wrong params for a command
- Autocomplete -- IDEs suggest valid fields per command type
- Whitelist enforcement -- only trusted commands are accepted
- Easy to extend -- add a new variant to the union when new commands are needed

## Entry Point

```typescript
class SwapRouter {
  // Existing -- unchanged, backward compatible
  static swapCallParameters(...): MethodParameters

  // New
  static encodeSwaps(intent: SwapIntent, swapSteps: SwapStep[]): MethodParameters
}
```

## Internal Flow

```
encodeSwaps(intent, swapSteps):
  planner = new RoutePlanner()

  // --- SAFETY: SDK-owned ---

  // 1. Permit2 permit (if provided)
  if (intent.permit)
    encodePermit(planner, intent.permit)

  // 2. Pull input tokens into router
  if (intent.inputToken.isNative)
    planner.addCommand(WRAP_ETH, [ROUTER_AS_RECIPIENT, maxAmountIn])
  else
    planner.addCommand(PERMIT2_TRANSFER_FROM, [token, ROUTER_AS_RECIPIENT, maxAmountIn])

  // --- SWAPS: Routing-owned (typesafe, SDK encodes) ---

  // 3. Encode routing's swap steps
  for (step of swapSteps)
    switch (step.type)
      'V2_SWAP_EXACT_IN':
        planner.addCommand(CommandType.V2_SWAP_EXACT_IN,
          [step.recipient, step.amountIn, step.amountOutMin, step.path, step.payerIsUser])
      'V3_SWAP_EXACT_IN':
        planner.addCommand(CommandType.V3_SWAP_EXACT_IN,
          [step.recipient, step.amountIn, step.amountOutMin, step.path, step.payerIsUser])
      'V4_SWAP':
        v4Planner = new V4Planner()
        for (action of step.v4Actions)
          v4Planner.addAction(Actions[action.action], encodeV4ActionParams(action))
        planner.addCommand(CommandType.V4_SWAP, [v4Planner.finalize()])
      'WRAP_ETH':
        planner.addCommand(CommandType.WRAP_ETH, [step.recipient, step.amount])
      'UNWRAP_WETH':
        planner.addCommand(CommandType.UNWRAP_WETH, [step.recipient, step.amountMin])
      // ... similar for V2_SWAP_EXACT_OUT, V3_SWAP_EXACT_OUT

  // --- SAFETY: SDK-owned ---

  // 4. Deliver output to user with slippage protection
  if (intent.outputToken.isNative)
    planner.addCommand(UNWRAP_WETH, [recipient, minAmountOut])
  else
    planner.addCommand(SWEEP, [outputToken, recipient, minAmountOut])

  // 5. Refund excess (EXACT_OUTPUT only)
  if (intent.tradeType === EXACT_OUTPUT)
    if (intent.inputToken.isNative)
      planner.addCommand(UNWRAP_WETH, [recipient, 0])
    else
      planner.addCommand(SWEEP, [inputToken, recipient, 0])

  return encodePlan(planner, nativeCurrencyValue, { deadline })
```

## Slippage (SDK-computed)

| Trade Type   | Input Amount Used                                    | Output Protection                                       |
| ------------ | ---------------------------------------------------- | ------------------------------------------------------- |
| EXACT_INPUT  | `inputAmount` (exact)                                | `minAmountOut = outputAmount * (1 - slippageTolerance)` |
| EXACT_OUTPUT | `maxAmountIn = inputAmount * (1 + slippageTolerance)`| `outputAmount` (exact)                                  |

## Routing's Contract

When building `swapSteps`, routing must:

- Send all swap output to `ROUTER_AS_RECIPIENT` (SDK owns final delivery)
- Set `payerIsUser: false` (SDK already pulled tokens into router)
- Use `CONTRACT_BALANCE` for intermediate amounts where appropriate
- Handle all protocol boundary transitions (WRAP/UNWRAP between V2/V3/V4)
- V4 actions: full flexibility including intermediate takes for flash accounting

## Safety Guarantees (SDK-enforced)

- Tokens enter the router through Permit2 (approved + transferred) or WRAP_ETH
- Slippage protection via SWEEP/UNWRAP_WETH minimum amount check
- Output always delivered to the declared recipient
- Excess refunded on EXACT_OUTPUT
- UR-level SWEEP is the final safety backstop regardless of swap complexity

## V4 Encoding

Routing provides all V4 actions as structured data. SDK encodes via V4Planner from `@uniswap/v4-sdk`. Routing has full flexibility over V4 action sequences (including intermediate settles/takes for flash accounting). The UR-level SWEEP is the safety backstop.

If V4Planner encoding changes with a new router version, only the SDK needs updating.

## Serialization (REST API)

The flow: **Routing service** (REST) -> **Trading API** (deserializes) -> **SDK** (`encodeSwaps`) -> calldata

The typesafe types serialize naturally to JSON since field names are explicit:

```json
{
  "swapSteps": [
    {
      "type": "V3_SWAP_EXACT_IN",
      "recipient": "0x0000000000000000000000000000000000000002",
      "amountIn": "1000000",
      "amountOutMin": "0",
      "path": "0xabcd...",
      "payerIsUser": false
    },
    {
      "type": "V4_SWAP",
      "v4Actions": [
        {
          "action": "SETTLE",
          "currency": "0xA0b8...",
          "amount": "500000",
          "payerIsUser": false
        },
        {
          "action": "SWAP_EXACT_IN",
          "currencyIn": "0xA0b8...",
          "path": [
            {
              "intermediateCurrency": "0xC02a...",
              "fee": 3000,
              "tickSpacing": 60,
              "hooks": "0x0000000000000000000000000000000000000000",
              "hookData": "0x"
            }
          ],
          "amountIn": 0,
          "amountOutMinimum": 0
        },
        {
          "action": "TAKE",
          "currency": "0xC02a...",
          "recipient": "0x0000000000000000000000000000000000000002",
          "amount": 0
        }
      ]
    }
  ]
}
```

Trading API deserializes and passes to `SwapRouter.encodeSwaps()`. SDK handles all encoding (opcode mapping + ABI encoding). Router version upgrades only require SDK updates. Named fields make the JSON self-documenting and easy to validate.

## Coexistence

- `swapCallParameters()` remains unchanged for backward compatibility
- `encodeSwaps()` is the new path for the routing/trading separation
- Consumers migrate at their own pace
- `UniswapTrade` class remains available for direct use

## Key Design Decisions

1. **Metadata + opaque commands** -- SDK trusts swap commands, only owns safety bookends
2. **SDK applies slippage** -- routing provides expected amounts, SDK computes min/max
3. **SDK handles all encoding** -- routing sends structured params (Level 2), SDK maps to opcodes + ABI encodes. Insulates routing from router version changes.
4. **V4 full action flexibility** -- routing provides all V4 actions as structured data, SDK encodes via V4Planner. Supports flash accounting and intermediate takes.
5. **Both trade types** -- EXACT_INPUT and EXACT_OUTPUT supported from the start
6. **Fees out of scope** -- can be layered by caller
7. **Always custody through router** -- no direct-to-user optimization, simpler and safer
8. **Always pull input into router** -- no direct-to-protocol optimization, simpler
9. **Typesafe command whitelist** -- discriminated unions for both UR commands and V4 actions. Only trusted commands accepted. Compile-time type checking for params. Easy to extend when new commands are added.
