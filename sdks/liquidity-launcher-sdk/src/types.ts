import { type Address, type Hex } from 'viem'

/**
 * TypeScript mirrors of the on-chain structs the launch flow encodes. Field order and types match
 * the deployed contracts exactly:
 * - PoolParameters / MigratorParameters / LiquidityAllocationBracket: liquidity-launcher `MigratorParams.sol`
 * - PositionDefinition: liquidity-launcher `PositionPlannerTypes.sol`
 * - AuctionParameters: continuous-clearing-auction `IContinuousClearingAuction.sol`
 * - Uerc20Metadata: uerc20-factory `UERC20MetadataLibrary.sol`
 * - Distribution: liquidity-launcher `Distribution.sol`
 * - Split: liquidity-launcher `ITokenSplitter.sol`
 */

export interface PoolParameters {
  /** uint24, hundredths of a bip; `DYNAMIC_FEE_FLAG` for a dynamic-fee pool. */
  fee: number
  /** int24. */
  tickSpacing: number
  /** address(0) for a hookless pool. */
  hook: Address
}

export interface MigratorParameters {
  token: Address
  /** address(0) for native ETH. */
  currency: Address
  /** uint64. */
  migrationBlock: bigint
  /** uint128. */
  reservedTokenAmountForLP: bigint
  recipient: Address
  positionRecipient: Address
  poolParameters: PoolParameters
  /** `abi.encode(PositionDefinition[])` — use {@link encodePositionDefinitions}. */
  positionDefinitions: Hex
  /** `abi.encode(LiquidityAllocationBracket[])` — use {@link encodeLpAllocationSchedule}. */
  lpAllocationSchedule: Hex
}

export interface AuctionParameters {
  currency: Address
  tokensRecipient: Address
  fundsRecipient: Address
  /** uint64. */
  startBlock: bigint
  /** uint64. */
  endBlock: bigint
  /** uint64. */
  claimBlock: bigint
  /** uint256 — CCA price-tick granularity (distinct from pool tickSpacing). */
  tickSpacing: bigint
  validationHook: Address
  /** uint256 — currency-per-token in Q96. */
  floorPrice: bigint
  /** uint128. */
  requiredCurrencyRaised: bigint
  /** Packed emission schedule — use {@link encodeAuctionSteps}. */
  auctionStepsData: Hex
}

export interface PositionDefinition {
  /** int24 tick offset from the final auction tick. */
  offsetLower: number
  /** int24. */
  offsetUpper: number
  /** uint24 mps (1e7 = 100%). */
  weight: number
  /** address(0) defers to `MigratorParameters.positionRecipient`. */
  overridePositionRecipient: Address
}

export interface LiquidityAllocationBracket {
  /** uint128 — inclusive lower bound on cumulative currency raised (first bracket = 0). */
  lowerThreshold: bigint
  /** uint24 mps. */
  rate: number
}

export interface Uerc20Metadata {
  description: string
  website: string
  image: string
  /** JSON envelope carrying optional X-verification data ('0x' when absent). */
  extraData: Hex
}

/** One emission step. The packed form encodes `mps` and `endBlock - startBlock`. */
export interface AuctionStepInput {
  /** uint24 tokens-per-block as mps of auction supply (1e7 = 100%). */
  mps: number
  startBlock: bigint
  endBlock: bigint
}

/** A single `distributeToken` distribution. */
export interface Distribution {
  strategy: Address
  /** uint128. */
  amount: bigint
  configData: Hex
}

/**
 * One TokenSplitter recipient. The strategy transfers `amount` of the distributed token to
 * `recipient`; the splits must sum to the enclosing `Distribution.amount`.
 */
export interface Split {
  recipient: Address
  /** uint256. */
  amount: bigint
}
