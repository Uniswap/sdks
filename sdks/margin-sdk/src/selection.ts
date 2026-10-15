import { type Address } from 'viem'

import { BPS_DENOMINATOR, MAX_UINT256, WAD } from './constants.js'
import { MarginSdkError } from './errors.js'
import {
  assertLeverageX18,
  collateralToBuyForLeverage,
  estimateLtv,
  healthFactor,
  leverageForLtv,
  quoteDebtForCollateral,
} from './math.js'
import { type RateModel, SECONDS_PER_YEAR, borrowRateApr, liquidationProbability, numberToWad } from './rates.js'
import { type Market } from './types.js'

/**
 * Market selection: given the eligible lending markets for a pair and the trade a user wants to
 * make, price every market at that size and leverage and pick the one with the lowest expected
 * cost of carry, where "expected cost" is the effective borrow rate plus the expected loss to
 * liquidation over the user's horizon, both as an APR on the debt.
 *
 * The ranking is deliberately a single, explainable number:
 *
 *     expectedCost = postTradeBorrowRate - collateralYield / ltv        (effective carry)
 *                  + P(liquidation within horizon) * penalty * closeFactor / horizon
 *
 * At low leverage the liquidation term vanishes and this is a rate ranking; at high leverage it is
 * dominated by liquidation risk, which is the real cost of a high-LLTV market versus a low one.
 * Setting `volatilityWad` to zero disables the term and ranks on effective rate alone.
 *
 * Feasibility at the requested size is a hard gate: the position must clear the venue's borrow
 * cap, leave the market below a utilization ceiling, and leave the playbook's cap headroom. Among
 * feasible markets within a small band of the cheapest, the lower oracle/curator risk wins, which
 * gives the default both a transparent reason and hysteresis against block-to-block flicker.
 *
 * Everything is a pure function of a snapshot ({@link MarketCandidate}) that the allowlist pipeline
 * emits daily and the app refreshes from chain at open time.
 */

export type Venue = 'MORPHO' | 'AAVE_V3' | 'AAVE_V4' | 'COMPOUND_V3'

/** One routable lending market for a `(collateral, debt)` pair, as a point-in-time snapshot. */
export interface MarketCandidate {
  /** A stable identifier, e.g. the allowlist row id. */
  id: string
  venue: Venue
  /** The `ILendingAdapter` to pass to the router. */
  adapter: Address
  market: Market
  /** Whether the market passes the allowlist gates. Ineligible markets are priced but never feasible. */
  eligible: boolean
  /** Tiebreak order inside the cost band: lower is safer (e.g. Aave 0, Spark 1, Morpho 2). */
  riskRank: number
  /** The liquidation LTV (`adapter.maxLtvWad`), WAD. */
  liquidationLtv: bigint
  /** The borrow-time LTV cap (Aave `ltv`, Comet `borrowCollateralFactor`; equal to `liquidationLtv` on Morpho), WAD. */
  borrowLtvCap: bigint
  /** The fraction of repaid debt a borrower loses at liquidation (Morpho `LIF - 1`, Aave bonus, Comet `1 - liquidationFactor`), WAD. */
  liquidationPenalty: bigint
  /** The fraction of debt a single liquidation repays, WAD. Default 1e18 (full liquidation). */
  closeFactor?: bigint
  /** The venue oracle price: debt-wei per one whole collateral token (`parseUnits(humanPrice, debtDecimals)`). */
  oraclePriceDebtPerCollateralToken: bigint
  /** The debt reserve's total supply (Aave: total debt plus available liquidity), debt units. */
  totalSupply: bigint
  /** The debt reserve's total borrow, debt units. */
  totalBorrow: bigint
  /** Borrowable liquidity, debt units. Default `totalSupply - totalBorrow`. */
  availableLiquidity?: bigint
  /** Remaining room under the debt reserve's borrow cap, debt units. Omit when the venue has none. */
  borrowCapHeadroom?: bigint
  /** Remaining room under the collateral reserve's supply cap, collateral units. Omit when the venue has none. */
  collateralSupplyCapHeadroom?: bigint
  rateModel: RateModel
  /** An additive spread on the borrow rate (Aave v4 risk premium), WAD APR. */
  spreadApr?: bigint
  /** The yield the collateral earns while supplied (Aave aTokens; zero on Morpho and Comet), WAD APR. */
  collateralSupplyApr?: bigint
  /** Borrow-side incentives, WAD APR. Reported, never ranked on. */
  incentiveApr?: bigint
}

/** The trade to price every candidate against. */
export interface TradeIntent {
  /** Equity in collateral units. */
  equity: bigint
  leverageX18: bigint
  collateralDecimals: number
  /** The swap quote, slippage included: `maxDebtIn / collateralToBuy` scaled to debt-wei per whole collateral token. */
  quotePriceDebtPerCollateralToken: bigint
  /** How long the user expects to hold the position. */
  horizonSeconds: bigint
  /** Annualized volatility of the collateral/debt price ratio, WAD. Zero ranks on effective rate alone. */
  volatilityWad: bigint
  /** An optional view on the annual log drift of the collateral/debt ratio, WAD. Default 0. */
  expectedLogDriftApr?: bigint
}

export interface SelectionOptions {
  /** Post-trade utilization ceiling. Default 0.95e18 (the playbook's eligibility bound). */
  maxUtilizationAfter?: bigint
  /** Required cap headroom beyond the trade itself, as a fraction of the trade. Default 0.1e18. */
  capHeadroomWad?: bigint
  /** Minimum post-trade health factor. Default 1.05e18. */
  minHealthFactorAfter?: bigint
  /** Maximum liquidation probability over the horizon, in [0, 1]. Default 1 (no gate). */
  maxLiquidationProbability?: number
  /** Expected-cost band inside which the lower `riskRank` wins. Default 25 bps. */
  tieBandApr?: bigint
  /** Slack added to the post-trade LTV when deriving `maxLtvAfter`. Default 50 bps. */
  ltvBoundToleranceBps?: number
}

export type SelectionReason =
  | 'NOT_ELIGIBLE'
  | 'LEVERAGE_EXCEEDS_BORROW_CAP'
  | 'INSUFFICIENT_LIQUIDITY'
  | 'UTILIZATION_TOO_HIGH'
  | 'BORROW_CAP_HEADROOM'
  | 'SUPPLY_CAP_HEADROOM'
  | 'HEALTH_FACTOR_TOO_LOW'
  | 'LIQUIDATION_PROBABILITY_TOO_HIGH'
  | 'DOMINATED'
  | 'HIGHER_EXPECTED_COST'
  | 'LOST_RISK_TIEBREAK'

export type MarketLabel = 'RECOMMENDED' | 'CHEAPEST' | 'SAFEST'

/** A candidate priced at the intent's size and leverage. All APRs are WAD on the debt unless named otherwise. */
export interface MarketQuote {
  candidate: MarketCandidate
  /** Whether the trade can be opened here. Infeasible quotes keep their numbers so a UI can still show them. */
  feasible: boolean
  /** Why the market is infeasible, or why it lost the ranking. Empty on the recommended market. */
  reasons: SelectionReason[]
  labels: MarketLabel[]
  borrowAmount: bigint
  collateralAfter: bigint
  /** The post-trade LTV at the venue oracle, WAD. */
  ltvAfter: bigint
  /** The post-trade health factor, WAD; `MAX_UINT256` with no debt. */
  healthFactorAfter: bigint
  /** How far the collateral price can fall before liquidation, WAD (`1 - 1/HF`). */
  collateralDropToLiquidation: bigint
  /** How far the debt price can rise before liquidation, WAD (`HF - 1`); `MAX_UINT256` with no debt. */
  debtRiseToLiquidation: bigint
  /** The highest leverage this market opens at, from its borrow cap. */
  maxLeverageX18: bigint
  utilizationBefore: bigint
  utilizationAfter: bigint
  /** The venue rate before the trade, spread included. */
  borrowRateBeforeApr: bigint
  /** The venue rate after the trade, spread included: what the whole position pays. */
  borrowRateApr: bigint
  collateralSupplyApr: bigint
  /** `borrowRateApr - collateralSupplyApr / ltvAfter`: the carry net of collateral yield. */
  effectiveRateApr: bigint
  incentiveApr: bigint
  /** Probability of liquidation within the horizon, in [0, 1]. */
  liquidationProbability: number
  /** The expected liquidation loss annualized over the horizon. */
  expectedLiquidationCostApr: bigint
  /** The ranking key: `effectiveRateApr + expectedLiquidationCostApr`. */
  expectedCostApr: bigint
  /** The same cost as an APR on equity (`* ltv / (1 - ltv)`). */
  expectedCostOnEquityApr: bigint
  /** The expected cost over the horizon in debt units. */
  expectedCostOverHorizon: bigint
  /** The `maxLtvAfter` to pass the router so the displayed buffer is enforced onchain; zero when there is no debt. */
  maxLtvAfter: bigint
}

export interface MarketSelection {
  /** Every candidate: feasible ones first, by ascending expected cost, then infeasible ones in input order. */
  quotes: MarketQuote[]
  /**
   * The cheapest-to-safest tradeoff a UI shows: feasible markets not beaten on both effective rate and
   * health factor by another, plus the recommended market whenever the ranking prefers one that is.
   */
  frontier: MarketQuote[]
  recommended?: MarketQuote
  cheapest?: MarketQuote
  safest?: MarketQuote
}

interface ResolvedOptions {
  maxUtilizationAfter: bigint
  capHeadroomWad: bigint
  minHealthFactorAfter: bigint
  maxLiquidationProbability: number
  tieBandApr: bigint
  ltvBoundToleranceBps: number
}

function resolveOptions(options: SelectionOptions): ResolvedOptions {
  const resolved: ResolvedOptions = {
    maxUtilizationAfter: options.maxUtilizationAfter ?? 95n * 10n ** 16n,
    capHeadroomWad: options.capHeadroomWad ?? 10n ** 17n,
    minHealthFactorAfter: options.minHealthFactorAfter ?? 105n * 10n ** 16n,
    maxLiquidationProbability: options.maxLiquidationProbability ?? 1,
    tieBandApr: options.tieBandApr ?? 25n * 10n ** 14n,
    ltvBoundToleranceBps: options.ltvBoundToleranceBps ?? 50,
  }
  if (resolved.maxUtilizationAfter < 0n || resolved.maxUtilizationAfter > WAD) {
    throw new MarginSdkError('INVALID_INPUT', 'maxUtilizationAfter must be in [0, 1e18]')
  }
  if (resolved.capHeadroomWad < 0n) throw new MarginSdkError('INVALID_INPUT', 'capHeadroomWad must be non-negative')
  if (resolved.minHealthFactorAfter < WAD) {
    throw new MarginSdkError('INVALID_INPUT', 'minHealthFactorAfter must be at least 1e18')
  }
  if (!(resolved.maxLiquidationProbability >= 0 && resolved.maxLiquidationProbability <= 1)) {
    throw new MarginSdkError('INVALID_INPUT', 'maxLiquidationProbability must be in [0, 1]')
  }
  if (resolved.tieBandApr < 0n) throw new MarginSdkError('INVALID_INPUT', 'tieBandApr must be non-negative')
  if (!Number.isInteger(resolved.ltvBoundToleranceBps) || resolved.ltvBoundToleranceBps < 0) {
    throw new MarginSdkError('INVALID_INPUT', 'ltvBoundToleranceBps must be a non-negative integer')
  }
  return resolved
}

function validateCandidate(c: MarketCandidate): void {
  const fail = (message: string): never => {
    throw new MarginSdkError('INVALID_INPUT', `candidate ${c.id}: ${message}`)
  }
  if (c.liquidationLtv <= 0n || c.liquidationLtv >= WAD) fail('liquidationLtv must be in (0, 1e18)')
  if (c.borrowLtvCap <= 0n || c.borrowLtvCap > c.liquidationLtv) fail('borrowLtvCap must be in (0, liquidationLtv]')
  if (c.liquidationPenalty < 0n) fail('liquidationPenalty must be non-negative')
  const closeFactor = c.closeFactor ?? WAD
  if (closeFactor <= 0n || closeFactor > WAD) fail('closeFactor must be in (0, 1e18]')
  if (c.oraclePriceDebtPerCollateralToken <= 0n) fail('oraclePriceDebtPerCollateralToken must be positive')
  if (c.totalBorrow < 0n || c.totalSupply < c.totalBorrow) fail('totalSupply must be at least totalBorrow')
  if (c.availableLiquidity !== undefined && c.availableLiquidity < 0n) fail('availableLiquidity must be non-negative')
  if (!Number.isFinite(c.riskRank)) fail('riskRank must be finite')
}

function validateIntent(intent: TradeIntent): void {
  if (intent.equity <= 0n) throw new MarginSdkError('INVALID_AMOUNT', 'equity must be positive')
  assertLeverageX18(intent.leverageX18)
  if (!Number.isInteger(intent.collateralDecimals) || intent.collateralDecimals < 0) {
    throw new MarginSdkError('INVALID_INPUT', 'collateralDecimals must be a non-negative integer')
  }
  if (intent.quotePriceDebtPerCollateralToken <= 0n) {
    throw new MarginSdkError('INVALID_INPUT', 'quotePriceDebtPerCollateralToken must be positive')
  }
  if (intent.horizonSeconds < 0n) throw new MarginSdkError('INVALID_INPUT', 'horizonSeconds must be non-negative')
  if (intent.volatilityWad < 0n) throw new MarginSdkError('INVALID_INPUT', 'volatilityWad must be non-negative')
}

function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b
}

/** Prices one candidate at the intent's size and leverage. See {@link selectMarket} for the ranking. */
export function quoteMarket(
  candidate: MarketCandidate,
  intent: TradeIntent,
  options: SelectionOptions = {}
): MarketQuote {
  const opts = resolveOptions(options)
  validateCandidate(candidate)
  validateIntent(intent)
  const reasons: SelectionReason[] = []

  const collateralToBuy = collateralToBuyForLeverage(intent.equity, intent.leverageX18)
  const collateralAfter = intent.equity + collateralToBuy
  const borrowAmount = quoteDebtForCollateral({
    collateralAmount: collateralToBuy,
    priceDebtPerCollateralToken: intent.quotePriceDebtPerCollateralToken,
    collateralDecimals: intent.collateralDecimals,
  })
  const hasDebt = borrowAmount > 0n

  // Health at the venue oracle, which is what liquidation and the router's `maxLtvAfter` check use.
  const ltvAfter = hasDebt
    ? estimateLtv({
        collateralAmount: collateralAfter,
        debtAmount: borrowAmount,
        priceDebtPerCollateralToken: candidate.oraclePriceDebtPerCollateralToken,
        collateralDecimals: intent.collateralDecimals,
      })
    : 0n
  const healthFactorAfter = healthFactor(candidate.liquidationLtv, ltvAfter)
  const liquidatable = hasDebt && ltvAfter >= candidate.liquidationLtv
  const collateralDropToLiquidation = liquidatable ? 0n : WAD - (ltvAfter * WAD) / candidate.liquidationLtv
  const debtRiseToLiquidation = !hasDebt ? MAX_UINT256 : liquidatable ? 0n : healthFactorAfter - WAD

  // Utilization and the rate the whole position pays once the borrow lands.
  const utilizationBefore = candidate.totalSupply === 0n ? 0n : (candidate.totalBorrow * WAD) / candidate.totalSupply
  const borrowAfter = candidate.totalBorrow + borrowAmount
  const utilizationAfter =
    candidate.totalSupply === 0n ? (borrowAfter > 0n ? WAD : 0n) : min(WAD, (borrowAfter * WAD) / candidate.totalSupply)
  const spread = candidate.spreadApr ?? 0n
  const borrowRateBeforeApr = borrowRateApr(candidate.rateModel, utilizationBefore) + spread
  const borrowRate = borrowRateApr(candidate.rateModel, utilizationAfter) + spread
  const collateralSupplyApr = candidate.collateralSupplyApr ?? 0n
  // Collateral yield accrues on the whole collateral, so on the debt basis it scales by 1/ltv.
  const effectiveRateApr = hasDebt ? borrowRate - (collateralSupplyApr * WAD) / ltvAfter : 0n

  // Liquidation risk over the horizon: interest erodes the buffer, so the drift is minus the effective carry.
  const probability = hasDebt
    ? liquidationProbability({
        healthFactorAfter,
        volatilityWad: intent.volatilityWad,
        horizonSeconds: intent.horizonSeconds,
        logDriftApr: (intent.expectedLogDriftApr ?? 0n) - effectiveRateApr,
      })
    : 0
  const closeFactor = candidate.closeFactor ?? WAD
  const expectedLossWad = (((numberToWad(probability) * candidate.liquidationPenalty) / WAD) * closeFactor) / WAD
  const expectedLiquidationCostApr =
    intent.horizonSeconds === 0n ? 0n : (expectedLossWad * SECONDS_PER_YEAR) / intent.horizonSeconds
  const expectedCostApr = effectiveRateApr + expectedLiquidationCostApr
  const expectedCostOnEquityApr = hasDebt ? (expectedCostApr * ltvAfter) / (WAD - ltvAfter) : 0n
  const expectedCostOverHorizon = (borrowAmount * expectedCostApr * intent.horizonSeconds) / (WAD * SECONDS_PER_YEAR)

  // Feasibility gates, in the order a UI would explain them.
  if (!candidate.eligible) reasons.push('NOT_ELIGIBLE')
  if (ltvAfter > candidate.borrowLtvCap) reasons.push('LEVERAGE_EXCEEDS_BORROW_CAP')
  const available = candidate.availableLiquidity ?? candidate.totalSupply - candidate.totalBorrow
  if (borrowAmount > available) reasons.push('INSUFFICIENT_LIQUIDITY')
  if (hasDebt && utilizationAfter > opts.maxUtilizationAfter) reasons.push('UTILIZATION_TOO_HIGH')
  const headroomFactor = WAD + opts.capHeadroomWad
  if (candidate.borrowCapHeadroom !== undefined && candidate.borrowCapHeadroom * WAD < borrowAmount * headroomFactor) {
    reasons.push('BORROW_CAP_HEADROOM')
  }
  if (
    candidate.collateralSupplyCapHeadroom !== undefined &&
    candidate.collateralSupplyCapHeadroom * WAD < collateralAfter * headroomFactor
  ) {
    reasons.push('SUPPLY_CAP_HEADROOM')
  }
  if (hasDebt && healthFactorAfter < opts.minHealthFactorAfter) reasons.push('HEALTH_FACTOR_TOO_LOW')
  if (probability > opts.maxLiquidationProbability) reasons.push('LIQUIDATION_PROBABILITY_TOO_HIGH')

  const maxLtvAfter = hasDebt
    ? min((ltvAfter * (BPS_DENOMINATOR + BigInt(opts.ltvBoundToleranceBps))) / BPS_DENOMINATOR, WAD - 1n)
    : 0n

  return {
    candidate,
    feasible: reasons.length === 0,
    reasons,
    labels: [],
    borrowAmount,
    collateralAfter,
    ltvAfter,
    healthFactorAfter,
    collateralDropToLiquidation,
    debtRiseToLiquidation,
    maxLeverageX18: leverageForLtv(candidate.borrowLtvCap),
    utilizationBefore,
    utilizationAfter,
    borrowRateBeforeApr,
    borrowRateApr: borrowRate,
    collateralSupplyApr,
    effectiveRateApr,
    incentiveApr: candidate.incentiveApr ?? 0n,
    liquidationProbability: probability,
    expectedLiquidationCostApr,
    expectedCostApr,
    expectedCostOnEquityApr,
    expectedCostOverHorizon,
    maxLtvAfter,
  }
}

function byExpectedCost(a: MarketQuote, b: MarketQuote): number {
  if (a.expectedCostApr !== b.expectedCostApr) return a.expectedCostApr < b.expectedCostApr ? -1 : 1
  if (a.candidate.riskRank !== b.candidate.riskRank) return a.candidate.riskRank - b.candidate.riskRank
  return a.candidate.id < b.candidate.id ? -1 : a.candidate.id > b.candidate.id ? 1 : 0
}

/** `r` is at least as cheap and at least as safe as `q`, and strictly better on one axis. */
function dominates(r: MarketQuote, q: MarketQuote): boolean {
  return (
    r.effectiveRateApr <= q.effectiveRateApr &&
    r.healthFactorAfter >= q.healthFactorAfter &&
    (r.effectiveRateApr < q.effectiveRateApr || r.healthFactorAfter > q.healthFactorAfter)
  )
}

/**
 * Prices every candidate against the intent and ranks the feasible ones by expected cost. The
 * recommended market is the cheapest, except that any feasible market within `tieBandApr` of it
 * with a lower `riskRank` takes precedence. The frontier is the set a UI offers as alternatives;
 * everything else carries the reason it lost.
 */
export function selectMarket(
  candidates: readonly MarketCandidate[],
  intent: TradeIntent,
  options: SelectionOptions = {}
): MarketSelection {
  const opts = resolveOptions(options)
  const quotes = candidates.map((candidate) => quoteMarket(candidate, intent, opts))
  const feasible = quotes.filter((q) => q.feasible).sort(byExpectedCost)
  const infeasible = quotes.filter((q) => !q.feasible)

  let recommended: MarketQuote | undefined
  let cheapest: MarketQuote | undefined
  let safest: MarketQuote | undefined
  let inBand: MarketQuote[] = []
  if (feasible.length > 0) {
    cheapest = feasible.reduce((a, b) => (b.effectiveRateApr < a.effectiveRateApr ? b : a))
    safest = feasible.reduce((a, b) => (b.healthFactorAfter > a.healthFactorAfter ? b : a))
    cheapest.labels.push('CHEAPEST')
    if (!safest.labels.includes('SAFEST')) safest.labels.push('SAFEST')

    const limit = feasible[0].expectedCostApr + opts.tieBandApr
    inBand = feasible.filter((q) => q.expectedCostApr <= limit)
    recommended = inBand.reduce((a, b) => (b.candidate.riskRank < a.candidate.riskRank ? b : a))
    recommended.labels.unshift('RECOMMENDED')
  }

  // The frontier is the Pareto set on the two displayed axes. The ranking can still prefer a market
  // another beats on both of them, through the liquidation term or the risk tiebreak, so the
  // recommendation is always offered and never reported as dominated.
  const pareto = feasible.filter((q) => !feasible.some((r) => dominates(r, q)))
  const frontier =
    recommended !== undefined && !pareto.includes(recommended) ? [recommended, ...pareto].sort(byExpectedCost) : pareto
  for (const q of feasible) {
    if (q === recommended) continue
    if (!frontier.includes(q)) q.reasons.push('DOMINATED')
    q.reasons.push(inBand.includes(q) ? 'LOST_RISK_TIEBREAK' : 'HIGHER_EXPECTED_COST')
  }

  return { quotes: [...feasible, ...infeasible], frontier, recommended, cheapest, safest }
}
