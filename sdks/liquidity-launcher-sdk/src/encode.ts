import {
  type AbiParameter,
  type Address,
  type Hex,
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  maxUint160,
  maxUint256,
  toHex,
} from 'viem'

import { CCA_ABI, ERC20_APPROVE_ABI, LBP_STRATEGY_ABI, LIQUIDITY_LAUNCHER_ABI, PERMIT2_ABI } from './abis'
import { LauncherSdkError } from './errors'
import type {
  AuctionParameters,
  AuctionStepInput,
  Distribution,
  LiquidityAllocationBracket,
  MigratorParameters,
  PositionDefinition,
  Split,
  Uerc20Metadata,
} from './types'

/**
 * Encoders for the LiquidityLauncher / LBPStrategy / ContinuousClearingAuction launch flow. These
 * build the calldata a wallet signs. The strategy decodes `configData` as
 * `abi.encode(MigratorParameters, bytes auctionParams)`, and the CCA factory decodes the inner
 * `auctionParams` as `abi.encode(AuctionParameters)`.
 */

// ---------------------------------------------------------------------------
// abi.encode tuple parameter definitions
// ---------------------------------------------------------------------------

const POOL_PARAMETERS_COMPONENTS = [
  { name: 'fee', type: 'uint24' },
  { name: 'tickSpacing', type: 'int24' },
  { name: 'hook', type: 'address' },
] as const satisfies readonly AbiParameter[]

/** The `MigratorParameters` tuple param — exported because the initializer salt hashes over it. */
export const MIGRATOR_PARAMETERS_PARAM = {
  name: 'migratorParameters',
  type: 'tuple',
  components: [
    { name: 'token', type: 'address' },
    { name: 'currency', type: 'address' },
    { name: 'migrationBlock', type: 'uint64' },
    { name: 'reservedTokenAmountForLP', type: 'uint128' },
    { name: 'recipient', type: 'address' },
    { name: 'positionRecipient', type: 'address' },
    { name: 'poolParameters', type: 'tuple', components: POOL_PARAMETERS_COMPONENTS },
    { name: 'positionDefinitions', type: 'bytes' },
    { name: 'lpAllocationSchedule', type: 'bytes' },
  ],
} as const satisfies AbiParameter

const AUCTION_PARAMETERS_PARAM = {
  name: 'auctionParameters',
  type: 'tuple',
  components: [
    { name: 'currency', type: 'address' },
    { name: 'tokensRecipient', type: 'address' },
    { name: 'fundsRecipient', type: 'address' },
    { name: 'startBlock', type: 'uint64' },
    { name: 'endBlock', type: 'uint64' },
    { name: 'claimBlock', type: 'uint64' },
    { name: 'tickSpacing', type: 'uint256' },
    { name: 'validationHook', type: 'address' },
    { name: 'floorPrice', type: 'uint256' },
    { name: 'requiredCurrencyRaised', type: 'uint128' },
    { name: 'auctionStepsData', type: 'bytes' },
  ],
} as const satisfies AbiParameter

const POSITION_DEFINITIONS_PARAM = {
  name: 'positionDefinitions',
  type: 'tuple[]',
  components: [
    { name: 'offsetLower', type: 'int24' },
    { name: 'offsetUpper', type: 'int24' },
    { name: 'weight', type: 'uint24' },
    { name: 'overridePositionRecipient', type: 'address' },
  ],
} as const satisfies AbiParameter

const LP_ALLOCATION_SCHEDULE_PARAM = {
  name: 'lpAllocationSchedule',
  type: 'tuple[]',
  components: [
    { name: 'lowerThreshold', type: 'uint128' },
    { name: 'rate', type: 'uint24' },
  ],
} as const satisfies AbiParameter

const UERC20_METADATA_PARAM = {
  name: 'metadata',
  type: 'tuple',
  components: [
    { name: 'description', type: 'string' },
    { name: 'website', type: 'string' },
    { name: 'image', type: 'string' },
    { name: 'extraData', type: 'bytes' },
  ],
} as const satisfies AbiParameter

const TOKEN_SPLITTER_SPLITS_PARAM = {
  name: 'splits',
  type: 'tuple[]',
  components: [
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
} as const satisfies AbiParameter

// ---------------------------------------------------------------------------
// abi.encode helpers (struct / bytes payloads)
// ---------------------------------------------------------------------------

/** `abi.encode(PositionDefinition[])` — the `MigratorParameters.positionDefinitions` field. */
export function encodePositionDefinitions(definitions: PositionDefinition[]): Hex {
  return encodeAbiParameters([POSITION_DEFINITIONS_PARAM], [definitions])
}

/** `abi.encode(LiquidityAllocationBracket[])` — the `MigratorParameters.lpAllocationSchedule` field. */
export function encodeLpAllocationSchedule(brackets: LiquidityAllocationBracket[]): Hex {
  return encodeAbiParameters([LP_ALLOCATION_SCHEDULE_PARAM], [brackets])
}

/** `abi.encode(AuctionParameters)` — the inner `auctionParams` bytes the CCA factory decodes. */
export function encodeAuctionParams(params: AuctionParameters): Hex {
  return encodeAbiParameters([AUCTION_PARAMETERS_PARAM], [params])
}

/**
 * `abi.encode(MigratorParameters, bytes auctionParams)` — the strategy's `configData`.
 * `positionDefinitions` / `lpAllocationSchedule` inside `migrator` must already be encoded bytes
 * (use {@link encodePositionDefinitions} / {@link encodeLpAllocationSchedule}).
 */
export function encodeConfigData(migrator: MigratorParameters, auctionParams: Hex): Hex {
  return encodeAbiParameters(
    [MIGRATOR_PARAMETERS_PARAM, { name: 'auctionParams', type: 'bytes' }],
    [migrator, auctionParams]
  )
}

/** `abi.encode(Split[])` — the TokenSplitter strategy's `configData`. */
export function encodeTokenSplitterConfig(splits: Split[]): Hex {
  return encodeAbiParameters([TOKEN_SPLITTER_SPLITS_PARAM], [splits])
}

/**
 * Packs the auction emission schedule into the CCA's tight byte format: one 8-byte word per step =
 * `bytes3(mps) ‖ bytes5(blockDelta)`, where `blockDelta = endBlock - startBlock`. See
 * continuous-clearing-auction `StepLib.sol`.
 */
export function encodeAuctionSteps(steps: AuctionStepInput[]): Hex {
  if (steps.length === 0) {
    return '0x'
  }
  const words = steps.map((step) => {
    const blockDelta = step.endBlock - step.startBlock
    if (blockDelta <= 0n) {
      throw new LauncherSdkError('INVALID_AUCTION_STEP', 'Auction step endBlock must be greater than startBlock')
    }
    // mps == 0 is allowed (a prebid window emits nothing). NaN comparisons are both false, so this
    // also rejects non-integer / out-of-range values up front.
    if (!Number.isInteger(step.mps) || step.mps < 0 || step.mps > 0xffffff) {
      throw new LauncherSdkError(
        'INVALID_AUCTION_STEP',
        'Auction step mps must be a non-negative integer within uint24'
      )
    }
    if (blockDelta > 0xffffffffffn) {
      throw new LauncherSdkError('INVALID_AUCTION_STEP', 'Auction step blockDelta out of uint40 range')
    }
    return concatHex([toHex(step.mps, { size: 3 }), toHex(blockDelta, { size: 5 })])
  })
  return concatHex(words)
}

/**
 * `abi.encode(Uerc20Metadata)` for the UERC20Factory `tokenData` arg. The USUPERC20Factory variant
 * prepends `(uint256 homeChainId, address creator)` — use {@link encodeSuperchainTokenData}.
 */
export function encodeTokenData(metadata: Uerc20Metadata): Hex {
  return encodeAbiParameters([UERC20_METADATA_PARAM], [metadata])
}

export function encodeSuperchainTokenData(homeChainId: bigint, creator: Address, metadata: Uerc20Metadata): Hex {
  return encodeAbiParameters(
    [{ name: 'homeChainId', type: 'uint256' }, { name: 'creator', type: 'address' }, UERC20_METADATA_PARAM],
    [homeChainId, creator, metadata]
  )
}

// ---------------------------------------------------------------------------
// Function calldata encoders
// ---------------------------------------------------------------------------

export interface CreateTokenArgs {
  factory: Address
  name: string
  symbol: string
  decimals: number
  initialSupply: bigint
  recipient: Address
  tokenData: Hex
}

export function encodeCreateToken(args: CreateTokenArgs): Hex {
  return encodeFunctionData({
    abi: LIQUIDITY_LAUNCHER_ABI,
    functionName: 'createToken',
    args: [args.factory, args.name, args.symbol, args.decimals, args.initialSupply, args.recipient, args.tokenData],
  })
}

export function encodeDistributeToken(token: Address, distribution: Distribution, salt: Hex): Hex {
  return encodeFunctionData({
    abi: LIQUIDITY_LAUNCHER_ABI,
    functionName: 'distributeToken',
    args: [token, distribution, salt],
  })
}

export function encodeDepositToken(token: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: LIQUIDITY_LAUNCHER_ABI, functionName: 'depositToken', args: [token, amount] })
}

/** Wraps a list of launcher subcalls into a single `multicall([...])`. */
export function encodeMulticall(calls: Hex[]): Hex {
  return encodeFunctionData({ abi: LIQUIDITY_LAUNCHER_ABI, functionName: 'multicall', args: [calls] })
}

/**
 * ERC20 `approve(spender, amount)` — used to approve Permit2. Defaults to the canonical infinite
 * approval `uint256.max`. Do NOT default to `uint160.max`: UNI/COMP-style governance tokens store
 * allowances as uint96 and revert any amount above 96 bits UNLESS it is exactly `uint256.max`, which
 * they special-case as infinite. (Permit2's own allowance is uint160 — see {@link encodePermit2Approve}.)
 */
export function encodeErc20Approve(spender: Address, amount: bigint = maxUint256): Hex {
  return encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [spender, amount] })
}

/**
 * `ContinuousClearingAuction.sweepUnsoldTokens()` — the creator's token recovery. Callable only by
 * the auction's `tokensRecipient()`, only after `endBlock`, and only once. On a failed
 * (non-graduated) auction it returns the full deposited supply; on a graduated one, the unsold
 * remainder.
 */
export function encodeSweepUnsoldTokens(): Hex {
  return encodeFunctionData({ abi: CCA_ABI, functionName: 'sweepUnsoldTokens', args: [] })
}

/**
 * `LBPStrategy.migrate(initializer)` — the permissionless success-path migration for the strategy's
 * auction at `auctionAddress`. Sweeps the raised currency and seeds the v4 pool; reverts until the
 * auction is finalized & graduated and `migrationBlock` has passed.
 */
export function encodeMigrate(auctionAddress: Address): Hex {
  return encodeFunctionData({ abi: LBP_STRATEGY_ABI, functionName: 'migrate', args: [auctionAddress] })
}

// uint48 max; viem maps uint48 to `number`, which is safe (< 2^53).
const MAX_UINT48 = 281474976710655

/** Permit2 on-chain allowance `approve(token, spender, amount, expiration)`. */
export function encodePermit2Approve(
  token: Address,
  spender: Address,
  amount: bigint = maxUint160,
  expiration: number = MAX_UINT48
): Hex {
  return encodeFunctionData({ abi: PERMIT2_ABI, functionName: 'approve', args: [token, spender, amount, expiration] })
}
