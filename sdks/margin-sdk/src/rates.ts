import { WAD } from './constants.js'
import { MarginSdkError } from './errors.js'

/**
 * Venue borrow-rate curves and liquidation economics for market selection. Everything here is a
 * pure function of a market snapshot, so a UI can re-evaluate it on every leverage-slider tick
 * without an RPC round-trip; the snapshot itself (utilization, anchor rate, curve parameters) comes
 * from the allowlist pipeline or a direct venue read.
 *
 * Rate conventions: every rate is a signed WAD simple APR (1e18 == 100% per year) unless the name
 * says otherwise. Morpho's `rateAtTarget` and Comet's `getBorrowRate` are per-second WAD values
 * onchain ({@link perSecondToApr}); Aave's are RAY-scaled annual values ({@link rayToWad}).
 */

/** Seconds in a 365-day year, the annualization basis for every APR in the SDK. */
export const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n

/** RAY fixed-point scale (Aave rates). */
export const RAY = 10n ** 27n

/** Morpho `AdaptiveCurveIrm` constants (mainnet deployment), annualized where the contract is per-second. */
export const MORPHO_TARGET_UTILIZATION = 9n * 10n ** 17n
export const MORPHO_CURVE_STEEPNESS = 4n * WAD
export const MORPHO_ADJUSTMENT_SPEED_APR = 50n * WAD
export const MORPHO_MIN_RATE_AT_TARGET_APR = WAD / 1000n
export const MORPHO_MAX_RATE_AT_TARGET_APR = 2n * WAD

/** Morpho Blue liquidation constants: `LIQUIDATION_CURSOR = 0.3e18`, `MAX_LIQUIDATION_INCENTIVE_FACTOR = 1.15e18`. */
export const MORPHO_LIQUIDATION_CURSOR = 3n * 10n ** 17n
export const MORPHO_MAX_LIQUIDATION_INCENTIVE_FACTOR = 115n * 10n ** 16n

/** Converts a WAD per-second rate (Morpho `borrowRateView` / `rateAtTarget`, Comet `getBorrowRate`) to a simple WAD APR. */
export function perSecondToApr(ratePerSecondWad: bigint): bigint {
  return ratePerSecondWad * SECONDS_PER_YEAR
}

/** Converts a RAY-scaled annual rate (Aave `currentVariableBorrowRate`, `currentLiquidityRate`) to WAD. */
export function rayToWad(ray: bigint): bigint {
  return ray / (RAY / WAD)
}

/** `Number(x) / 1e18`. Precision is that of a double, which is ample for a rate or probability. */
export function wadToNumber(x: bigint): number {
  return Number(x) / 1e18
}

/** `BigInt(round(x * 1e18))`; rejects NaN and infinities. */
export function numberToWad(x: number): bigint {
  if (!Number.isFinite(x)) throw new MarginSdkError('INVALID_INPUT', `expected a finite number, got ${x}`)
  return BigInt(Math.round(x * 1e18))
}

/**
 * Morpho Blue `AdaptiveCurveIrm`: a piecewise-linear curve around a target utilization, anchored
 * on `rateAtTarget`, which itself drifts exponentially while utilization sits away from target.
 * Defaults mirror the mainnet deployment.
 */
export interface MorphoAdaptiveCurveModel {
  kind: 'morphoAdaptiveCurve'
  /** The market's current `rateAtTarget`, annualized (WAD APR). */
  rateAtTargetApr: bigint
  /** Default {@link MORPHO_TARGET_UTILIZATION} (90%). */
  targetUtilization?: bigint
  /** Default {@link MORPHO_CURVE_STEEPNESS} (4x at full utilization, 1/4 at zero). */
  curveSteepness?: bigint
  /** Anchor drift speed, WAD per year. Default {@link MORPHO_ADJUSTMENT_SPEED_APR}. */
  adjustmentSpeedApr?: bigint
  /**
   * How long the post-trade utilization is assumed to persist before suppliers and borrowers
   * respond. Zero (default) prices the instantaneous post-trade rate. A positive window prices the
   * time-average of the drifting anchor over it, which is what a position that pushes a market
   * above target actually pays until the market rebalances.
   */
  persistenceSeconds?: bigint
}

/** Aave v3 `DefaultReserveInterestRateStrategyV2` shape, also the Aave v4 Hub curve. */
export interface AaveKinkedModel {
  kind: 'aaveKinked'
  baseApr: bigint
  /** The rate increase from zero to optimal utilization. */
  slope1Apr: bigint
  /** The rate increase from optimal to full utilization. */
  slope2Apr: bigint
  optimalUtilization: bigint
}

/** Compound v3 Comet borrow curve: `base + slopeLow * u` up to the kink, `slopeHigh` beyond it. */
export interface CompoundKinkedModel {
  kind: 'compoundKinked'
  baseApr: bigint
  slopeLowApr: bigint
  slopeHighApr: bigint
  kink: bigint
}

/** A flat rate, for venues without a utilization curve or for tests. */
export interface ConstantRateModel {
  kind: 'constant'
  apr: bigint
}

export type RateModel = MorphoAdaptiveCurveModel | AaveKinkedModel | CompoundKinkedModel | ConstantRateModel

function assertUtilization(utilization: bigint): void {
  if (utilization < 0n || utilization > WAD) {
    throw new MarginSdkError('INVALID_INPUT', `utilization must be in [0, 1e18], got ${utilization}`)
  }
}

function clamp(x: bigint, lo: bigint, hi: bigint): bigint {
  return x < lo ? lo : x > hi ? hi : x
}

/** The venue borrow APR at `utilization` under `model` (WAD). */
export function borrowRateApr(model: RateModel, utilization: bigint): bigint {
  assertUtilization(utilization)
  switch (model.kind) {
    case 'constant':
      return model.apr
    case 'aaveKinked': {
      const uOpt = model.optimalUtilization
      if (uOpt <= 0n || uOpt >= WAD) {
        throw new MarginSdkError('INVALID_INPUT', `optimalUtilization must be in (0, 1e18), got ${uOpt}`)
      }
      if (utilization <= uOpt) return model.baseApr + (model.slope1Apr * utilization) / uOpt
      return model.baseApr + model.slope1Apr + (model.slope2Apr * (utilization - uOpt)) / (WAD - uOpt)
    }
    case 'compoundKinked': {
      if (model.kink < 0n || model.kink > WAD) {
        throw new MarginSdkError('INVALID_INPUT', `kink must be in [0, 1e18], got ${model.kink}`)
      }
      if (utilization <= model.kink) return model.baseApr + (model.slopeLowApr * utilization) / WAD
      return (
        model.baseApr + (model.slopeLowApr * model.kink) / WAD + (model.slopeHighApr * (utilization - model.kink)) / WAD
      )
    }
    case 'morphoAdaptiveCurve':
      return morphoAdaptiveCurveApr(model, utilization)
  }
}

function morphoAdaptiveCurveApr(model: MorphoAdaptiveCurveModel, utilization: bigint): bigint {
  const target = model.targetUtilization ?? MORPHO_TARGET_UTILIZATION
  const steepness = model.curveSteepness ?? MORPHO_CURVE_STEEPNESS
  const speed = model.adjustmentSpeedApr ?? MORPHO_ADJUSTMENT_SPEED_APR
  const persistence = model.persistenceSeconds ?? 0n
  if (target <= 0n || target >= WAD) {
    throw new MarginSdkError('INVALID_INPUT', `targetUtilization must be in (0, 1e18), got ${target}`)
  }
  if (steepness <= WAD) throw new MarginSdkError('INVALID_INPUT', `curveSteepness must exceed 1e18, got ${steepness}`)

  // Normalized error in [-1e18, 1e18]: the contract's `_err`.
  const err =
    utilization > target ? ((utilization - target) * WAD) / (WAD - target) : ((utilization - target) * WAD) / target
  // The contract's `_curve`: slope (steepness - 1) above target, (1 - 1/steepness) below, through (0, 1).
  const coeff = err < 0n ? WAD - (WAD * WAD) / steepness : steepness - WAD
  const curve = (coeff * err) / WAD + WAD

  let anchor = clamp(model.rateAtTargetApr, MORPHO_MIN_RATE_AT_TARGET_APR, MORPHO_MAX_RATE_AT_TARGET_APR)
  if (persistence > 0n && err !== 0n) {
    // anchor(t) = anchor * exp(speed * err * t); its time-average over [0, T] is anchor * (e^k - 1) / k.
    // The onchain bounds are applied to the average, which is exact unless the cap binds mid-window.
    const k = wadToNumber(speed) * wadToNumber(err) * (Number(persistence) / Number(SECONDS_PER_YEAR))
    const average = Math.abs(k) < 1e-9 ? 1 : Math.expm1(k) / k
    anchor = clamp(
      numberToWad(wadToNumber(anchor) * average),
      MORPHO_MIN_RATE_AT_TARGET_APR,
      MORPHO_MAX_RATE_AT_TARGET_APR
    )
  }
  return (anchor * curve) / WAD
}

/**
 * Morpho Blue's liquidation incentive factor for an LLTV, `min(1.15, 1 / (0.3 * lltv + 0.7))` in
 * WAD. The borrower loses `(LIF - 1)` of every unit of debt a liquidator repays.
 */
export function morphoLiquidationIncentiveFactor(lltv: bigint): bigint {
  if (lltv <= 0n || lltv >= WAD) throw new MarginSdkError('INVALID_INPUT', `lltv must be in (0, 1e18), got ${lltv}`)
  const denominator = (MORPHO_LIQUIDATION_CURSOR * lltv) / WAD + (WAD - MORPHO_LIQUIDATION_CURSOR)
  const lif = (WAD * WAD) / denominator
  return lif < MORPHO_MAX_LIQUIDATION_INCENTIVE_FACTOR ? lif : MORPHO_MAX_LIQUIDATION_INCENTIVE_FACTOR
}

/** Complementary error function, Numerical Recipes `erfcc` (fractional error below 1.2e-7 everywhere). */
function erfc(z: number): number {
  const t = 1 / (1 + 0.5 * Math.abs(z))
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    )
  return z >= 0 ? r : 2 - r
}

/** The standard normal CDF. */
export function normalCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2)
}

/** `ln(Φ(x))`, switching to the Mills-ratio asymptotic in the far lower tail where `Φ` underflows. */
function logNormalCdf(x: number): number {
  if (x > -5) return Math.log(normalCdf(x))
  const x2 = x * x
  return -x2 / 2 - 0.5 * Math.log(2 * Math.PI) - Math.log(-x) + Math.log(1 - 1 / x2 + 3 / (x2 * x2))
}

/**
 * The probability that a position opened at `healthFactorAfter` touches the liquidation barrier
 * (health factor 1) within `horizonSeconds`.
 *
 * Model: the log of the collateral/debt price ratio diffuses with annualized volatility
 * `volatilityWad`, so `ln(healthFactor)` is a Brownian motion started at `ln(HF_after)` with drift
 * `logDriftApr` (negative when interest accrues faster than the collateral yields) and the barrier
 * at zero. The first-passage probability of that process is closed-form. The Itô correction is
 * deliberately omitted: the ratio is treated as log-driftless, which is neutral between a long and
 * a short of the same pair; pass a view through `logDriftApr` if one is wanted. The venue oracle
 * updates discretely, so a continuous-touch probability is a mild upper bound.
 */
export function liquidationProbability(p: {
  /** The post-trade health factor, WAD (1e18 == at the barrier). */
  healthFactorAfter: bigint
  /** Annualized volatility of the collateral/debt price ratio, WAD (0.8e18 == 80%). */
  volatilityWad: bigint
  horizonSeconds: bigint
  /** Signed annual drift of `ln(healthFactor)`, WAD. Default 0. */
  logDriftApr?: bigint
}): number {
  if (p.volatilityWad < 0n) throw new MarginSdkError('INVALID_INPUT', 'volatilityWad must be non-negative')
  if (p.horizonSeconds < 0n) throw new MarginSdkError('INVALID_INPUT', 'horizonSeconds must be non-negative')
  if (p.healthFactorAfter <= WAD) return 1
  if (p.horizonSeconds === 0n) return 0

  const y0 = Math.log(wadToNumber(p.healthFactorAfter))
  if (!Number.isFinite(y0)) return 0
  const T = Number(p.horizonSeconds) / Number(SECONDS_PER_YEAR)
  const sigma = wadToNumber(p.volatilityWad)
  const mu = wadToNumber(p.logDriftApr ?? 0n)
  if (sigma === 0) return mu < 0 && -mu * T >= y0 ? 1 : 0

  const s = sigma * Math.sqrt(T)
  const direct = normalCdf((-y0 - mu * T) / s)
  // The reflected term, evaluated in log space so a strong drift toward the barrier cannot overflow.
  const logReflected = (-2 * mu * y0) / (sigma * sigma) + logNormalCdf((-y0 + mu * T) / s)
  const reflected = logReflected >= 0 ? 1 : Math.exp(logReflected)
  return Math.min(1, Math.max(0, direct + reflected))
}
