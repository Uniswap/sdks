import invariant15 from 'tiny-invariant';
import { keccak256 } from '@ethersproject/solidity';
import JSBI13 from 'jsbi';
import _Decimal from 'decimal.js-light';
import _Big from 'big.js';
import toFormat from 'toformat';
import { getAddress } from '@ethersproject/address';
import { isAddress, defaultAbiCoder } from 'ethers/lib/utils';
import { constants, ethers } from 'ethers';
import { Interface } from '@ethersproject/abi';
import IMulticall from '@uniswap/v3-periphery/artifacts/contracts/interfaces/IMulticall.sol/IMulticall.json';

// src/v4/entities/pool.ts
var MaxUint256 = JSBI13.BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
var RoundingMode = {
  RoundDown: 0,
  RoundHalfUp: 1,
  RoundUp: 3
};
var Decimal = toFormat(_Decimal);
var Big = toFormat(_Big);
var toSignificantRounding = {
  [0 /* ROUND_DOWN */]: Decimal.ROUND_DOWN,
  [1 /* ROUND_HALF_UP */]: Decimal.ROUND_HALF_UP,
  [2 /* ROUND_UP */]: Decimal.ROUND_UP
};
var toFixedRounding = {
  [0 /* ROUND_DOWN */]: RoundingMode.RoundDown,
  [1 /* ROUND_HALF_UP */]: RoundingMode.RoundHalfUp,
  [2 /* ROUND_UP */]: RoundingMode.RoundUp
};
var Fraction = class _Fraction {
  constructor(numerator, denominator = JSBI13.BigInt(1)) {
    this.numerator = JSBI13.BigInt(numerator);
    this.denominator = JSBI13.BigInt(denominator);
  }
  static tryParseFraction(fractionish) {
    if (fractionish instanceof JSBI13 || typeof fractionish === "number" || typeof fractionish === "string")
      return new _Fraction(fractionish);
    if ("numerator" in fractionish && "denominator" in fractionish) return fractionish;
    throw new Error("Could not parse fraction");
  }
  // performs floor division
  get quotient() {
    return JSBI13.divide(this.numerator, this.denominator);
  }
  // remainder after floor division
  get remainder() {
    return new _Fraction(JSBI13.remainder(this.numerator, this.denominator), this.denominator);
  }
  invert() {
    return new _Fraction(this.denominator, this.numerator);
  }
  add(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    if (JSBI13.equal(this.denominator, otherParsed.denominator)) {
      return new _Fraction(JSBI13.add(this.numerator, otherParsed.numerator), this.denominator);
    }
    return new _Fraction(
      JSBI13.add(
        JSBI13.multiply(this.numerator, otherParsed.denominator),
        JSBI13.multiply(otherParsed.numerator, this.denominator)
      ),
      JSBI13.multiply(this.denominator, otherParsed.denominator)
    );
  }
  subtract(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    if (JSBI13.equal(this.denominator, otherParsed.denominator)) {
      return new _Fraction(JSBI13.subtract(this.numerator, otherParsed.numerator), this.denominator);
    }
    return new _Fraction(
      JSBI13.subtract(
        JSBI13.multiply(this.numerator, otherParsed.denominator),
        JSBI13.multiply(otherParsed.numerator, this.denominator)
      ),
      JSBI13.multiply(this.denominator, otherParsed.denominator)
    );
  }
  lessThan(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    return JSBI13.lessThan(
      JSBI13.multiply(this.numerator, otherParsed.denominator),
      JSBI13.multiply(otherParsed.numerator, this.denominator)
    );
  }
  equalTo(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    return JSBI13.equal(
      JSBI13.multiply(this.numerator, otherParsed.denominator),
      JSBI13.multiply(otherParsed.numerator, this.denominator)
    );
  }
  greaterThan(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    return JSBI13.greaterThan(
      JSBI13.multiply(this.numerator, otherParsed.denominator),
      JSBI13.multiply(otherParsed.numerator, this.denominator)
    );
  }
  multiply(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    return new _Fraction(
      JSBI13.multiply(this.numerator, otherParsed.numerator),
      JSBI13.multiply(this.denominator, otherParsed.denominator)
    );
  }
  divide(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    return new _Fraction(
      JSBI13.multiply(this.numerator, otherParsed.denominator),
      JSBI13.multiply(this.denominator, otherParsed.numerator)
    );
  }
  toSignificant(significantDigits, format = { groupSeparator: "" }, rounding = 1 /* ROUND_HALF_UP */) {
    invariant15(Number.isInteger(significantDigits), `${significantDigits} is not an integer.`);
    invariant15(significantDigits > 0, `${significantDigits} is not positive.`);
    Decimal.set({ precision: significantDigits + 1, rounding: toSignificantRounding[rounding] });
    const quotient = new Decimal(this.numerator.toString()).div(this.denominator.toString()).toSignificantDigits(significantDigits);
    return quotient.toFormat(quotient.decimalPlaces(), format);
  }
  toFixed(decimalPlaces, format = { groupSeparator: "" }, rounding = 1 /* ROUND_HALF_UP */) {
    invariant15(Number.isInteger(decimalPlaces), `${decimalPlaces} is not an integer.`);
    invariant15(decimalPlaces >= 0, `${decimalPlaces} is negative.`);
    Big.DP = decimalPlaces;
    Big.RM = toFixedRounding[rounding];
    return new Big(this.numerator.toString()).div(this.denominator.toString()).toFormat(decimalPlaces, format);
  }
  /**
   * Helper method for converting any super class back to a fraction
   */
  get asFraction() {
    return new _Fraction(this.numerator, this.denominator);
  }
};
var Big2 = toFormat(_Big);
var CurrencyAmount = class _CurrencyAmount extends Fraction {
  /**
   * Returns a new currency amount instance from the unitless amount of token, i.e. the raw amount
   * @param currency the currency in the amount
   * @param rawAmount the raw token or ether amount
   */
  static fromRawAmount(currency, rawAmount) {
    return new _CurrencyAmount(currency, rawAmount);
  }
  /**
   * Construct a currency amount with a denominator that is not equal to 1
   * @param currency the currency
   * @param numerator the numerator of the fractional token amount
   * @param denominator the denominator of the fractional token amount
   */
  static fromFractionalAmount(currency, numerator, denominator) {
    return new _CurrencyAmount(currency, numerator, denominator);
  }
  constructor(currency, numerator, denominator) {
    super(numerator, denominator);
    invariant15(JSBI13.lessThanOrEqual(this.quotient, MaxUint256), "AMOUNT");
    this.currency = currency;
    this.decimalScale = JSBI13.exponentiate(JSBI13.BigInt(10), JSBI13.BigInt(currency.decimals));
  }
  add(other) {
    invariant15(this.currency.equals(other.currency), "CURRENCY");
    const added = super.add(other);
    return _CurrencyAmount.fromFractionalAmount(this.currency, added.numerator, added.denominator);
  }
  subtract(other) {
    invariant15(this.currency.equals(other.currency), "CURRENCY");
    const subtracted = super.subtract(other);
    return _CurrencyAmount.fromFractionalAmount(this.currency, subtracted.numerator, subtracted.denominator);
  }
  multiply(other) {
    const multiplied = super.multiply(other);
    return _CurrencyAmount.fromFractionalAmount(this.currency, multiplied.numerator, multiplied.denominator);
  }
  divide(other) {
    const divided = super.divide(other);
    return _CurrencyAmount.fromFractionalAmount(this.currency, divided.numerator, divided.denominator);
  }
  toSignificant(significantDigits = 6, format, rounding = 0 /* ROUND_DOWN */) {
    return super.divide(this.decimalScale).toSignificant(significantDigits, format, rounding);
  }
  toFixed(decimalPlaces = this.currency.decimals, format, rounding = 0 /* ROUND_DOWN */) {
    invariant15(decimalPlaces <= this.currency.decimals, "DECIMALS");
    return super.divide(this.decimalScale).toFixed(decimalPlaces, format, rounding);
  }
  toExact(format = { groupSeparator: "" }) {
    Big2.DP = this.currency.decimals;
    return new Big2(this.quotient.toString()).div(this.decimalScale.toString()).toFormat(format);
  }
  get wrapped() {
    if (this.currency.isToken) return this;
    return _CurrencyAmount.fromFractionalAmount(this.currency.wrapped, this.numerator, this.denominator);
  }
};
var ONE_HUNDRED = new Fraction(JSBI13.BigInt(100));
function toPercent(fraction) {
  return new Percent(fraction.numerator, fraction.denominator);
}
var Percent = class extends Fraction {
  constructor() {
    super(...arguments);
    /**
     * This boolean prevents a fraction from being interpreted as a Percent
     */
    this.isPercent = true;
  }
  add(other) {
    return toPercent(super.add(other));
  }
  subtract(other) {
    return toPercent(super.subtract(other));
  }
  multiply(other) {
    return toPercent(super.multiply(other));
  }
  divide(other) {
    return toPercent(super.divide(other));
  }
  toSignificant(significantDigits = 5, format, rounding) {
    return super.multiply(ONE_HUNDRED).toSignificant(significantDigits, format, rounding);
  }
  toFixed(decimalPlaces = 2, format, rounding) {
    return super.multiply(ONE_HUNDRED).toFixed(decimalPlaces, format, rounding);
  }
};
var Price = class _Price extends Fraction {
  // used to adjust the raw fraction w/r/t the decimals of the {base,quote}Token
  /**
   * Construct a price, either with the base and quote currency amount, or the
   * @param args
   */
  constructor(...args) {
    let baseCurrency, quoteCurrency, denominator, numerator;
    if (args.length === 4) {
      [baseCurrency, quoteCurrency, denominator, numerator] = args;
    } else {
      const result = args[0].quoteAmount.divide(args[0].baseAmount);
      [baseCurrency, quoteCurrency, denominator, numerator] = [
        args[0].baseAmount.currency,
        args[0].quoteAmount.currency,
        result.denominator,
        result.numerator
      ];
    }
    super(numerator, denominator);
    this.baseCurrency = baseCurrency;
    this.quoteCurrency = quoteCurrency;
    this.scalar = new Fraction(
      JSBI13.exponentiate(JSBI13.BigInt(10), JSBI13.BigInt(baseCurrency.decimals)),
      JSBI13.exponentiate(JSBI13.BigInt(10), JSBI13.BigInt(quoteCurrency.decimals))
    );
  }
  /**
   * Flip the price, switching the base and quote currency
   */
  invert() {
    return new _Price(this.quoteCurrency, this.baseCurrency, this.numerator, this.denominator);
  }
  /**
   * Multiply the price by another price, returning a new price. The other price must have the same base currency as this price's quote currency
   * @param other the other price
   */
  multiply(other) {
    invariant15(this.quoteCurrency.equals(other.baseCurrency), "TOKEN");
    const fraction = super.multiply(other);
    return new _Price(this.baseCurrency, other.quoteCurrency, fraction.denominator, fraction.numerator);
  }
  /**
   * Return the amount of quote currency corresponding to a given amount of the base currency
   * @param currencyAmount the amount of base currency to quote against the price
   */
  quote(currencyAmount) {
    invariant15(currencyAmount.currency.equals(this.baseCurrency), "TOKEN");
    const result = super.multiply(currencyAmount);
    return CurrencyAmount.fromFractionalAmount(this.quoteCurrency, result.numerator, result.denominator);
  }
  /**
   * Get the value scaled by decimals for formatting
   * @private
   */
  get adjustedForDecimals() {
    return super.multiply(this.scalar);
  }
  toSignificant(significantDigits = 6, format, rounding) {
    return this.adjustedForDecimals.toSignificant(significantDigits, format, rounding);
  }
  toFixed(decimalPlaces = 4, format, rounding) {
    return this.adjustedForDecimals.toFixed(decimalPlaces, format, rounding);
  }
};
function validateAndParseAddress(address) {
  try {
    return getAddress(address);
  } catch (error) {
    throw new Error(`${address} is not a valid address.`);
  }
}
function sortedInsert(items, add, maxSize, comparator) {
  invariant15(maxSize > 0, "MAX_SIZE_ZERO");
  invariant15(items.length <= maxSize, "ITEMS_SIZE");
  if (items.length === 0) {
    items.push(add);
    return null;
  } else {
    const isFull = items.length === maxSize;
    if (isFull && comparator(items[items.length - 1], add) <= 0) {
      return add;
    }
    let lo = 0, hi = items.length;
    while (lo < hi) {
      const mid = lo + hi >>> 1;
      if (comparator(items[mid], add) <= 0) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    items.splice(lo, 0, add);
    return isFull ? items.pop() : null;
  }
}
var MAX_SAFE_INTEGER = JSBI13.BigInt(Number.MAX_SAFE_INTEGER);
var ZERO = JSBI13.BigInt(0);
var ONE = JSBI13.BigInt(1);
var TWO = JSBI13.BigInt(2);
function sqrt(value) {
  invariant15(JSBI13.greaterThanOrEqual(value, ZERO), "NEGATIVE");
  if (JSBI13.lessThan(value, MAX_SAFE_INTEGER)) {
    return JSBI13.BigInt(Math.floor(Math.sqrt(JSBI13.toNumber(value))));
  }
  let z;
  let x;
  z = value;
  x = JSBI13.add(JSBI13.divide(value, TWO), ONE);
  while (JSBI13.lessThan(x, z)) {
    z = x;
    x = JSBI13.divide(JSBI13.add(JSBI13.divide(value, x), x), TWO);
  }
  return z;
}
var NEGATIVE_ONE = JSBI13.BigInt(-1);
var ZERO2 = JSBI13.BigInt(0);
var ONE2 = JSBI13.BigInt(1);
var Q96 = JSBI13.exponentiate(JSBI13.BigInt(2), JSBI13.BigInt(96));
JSBI13.exponentiate(Q96, JSBI13.BigInt(2));
var FullMath = class {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  static mulDivRoundingUp(a, b, denominator) {
    const product = JSBI13.multiply(a, b);
    let result = JSBI13.divide(product, denominator);
    if (JSBI13.notEqual(JSBI13.remainder(product, denominator), ZERO2)) result = JSBI13.add(result, ONE2);
    return result;
  }
};
var MaxUint160 = JSBI13.subtract(JSBI13.exponentiate(JSBI13.BigInt(2), JSBI13.BigInt(160)), ONE2);
function multiplyIn256(x, y) {
  const product = JSBI13.multiply(x, y);
  return JSBI13.bitwiseAnd(product, MaxUint256);
}
function addIn256(x, y) {
  const sum = JSBI13.add(x, y);
  return JSBI13.bitwiseAnd(sum, MaxUint256);
}
var SqrtPriceMath = class {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  static getAmount0Delta(sqrtRatioAX96, sqrtRatioBX96, liquidity, roundUp) {
    if (JSBI13.greaterThan(sqrtRatioAX96, sqrtRatioBX96)) {
      [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }
    const numerator1 = JSBI13.leftShift(liquidity, JSBI13.BigInt(96));
    const numerator2 = JSBI13.subtract(sqrtRatioBX96, sqrtRatioAX96);
    return roundUp ? FullMath.mulDivRoundingUp(FullMath.mulDivRoundingUp(numerator1, numerator2, sqrtRatioBX96), ONE2, sqrtRatioAX96) : JSBI13.divide(JSBI13.divide(JSBI13.multiply(numerator1, numerator2), sqrtRatioBX96), sqrtRatioAX96);
  }
  static getAmount1Delta(sqrtRatioAX96, sqrtRatioBX96, liquidity, roundUp) {
    if (JSBI13.greaterThan(sqrtRatioAX96, sqrtRatioBX96)) {
      [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }
    return roundUp ? FullMath.mulDivRoundingUp(liquidity, JSBI13.subtract(sqrtRatioBX96, sqrtRatioAX96), Q96) : JSBI13.divide(JSBI13.multiply(liquidity, JSBI13.subtract(sqrtRatioBX96, sqrtRatioAX96)), Q96);
  }
  static getNextSqrtPriceFromInput(sqrtPX96, liquidity, amountIn, zeroForOne) {
    invariant15(JSBI13.greaterThan(sqrtPX96, ZERO2));
    invariant15(JSBI13.greaterThan(liquidity, ZERO2));
    return zeroForOne ? this.getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amountIn, true) : this.getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amountIn, true);
  }
  static getNextSqrtPriceFromOutput(sqrtPX96, liquidity, amountOut, zeroForOne) {
    invariant15(JSBI13.greaterThan(sqrtPX96, ZERO2));
    invariant15(JSBI13.greaterThan(liquidity, ZERO2));
    return zeroForOne ? this.getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amountOut, false) : this.getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amountOut, false);
  }
  static getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amount, add) {
    if (JSBI13.equal(amount, ZERO2)) return sqrtPX96;
    const numerator1 = JSBI13.leftShift(liquidity, JSBI13.BigInt(96));
    if (add) {
      let product = multiplyIn256(amount, sqrtPX96);
      if (JSBI13.equal(JSBI13.divide(product, amount), sqrtPX96)) {
        const denominator = addIn256(numerator1, product);
        if (JSBI13.greaterThanOrEqual(denominator, numerator1)) {
          return FullMath.mulDivRoundingUp(numerator1, sqrtPX96, denominator);
        }
      }
      return FullMath.mulDivRoundingUp(numerator1, ONE2, JSBI13.add(JSBI13.divide(numerator1, sqrtPX96), amount));
    } else {
      let product = multiplyIn256(amount, sqrtPX96);
      invariant15(JSBI13.equal(JSBI13.divide(product, amount), sqrtPX96));
      invariant15(JSBI13.greaterThan(numerator1, product));
      const denominator = JSBI13.subtract(numerator1, product);
      return FullMath.mulDivRoundingUp(numerator1, sqrtPX96, denominator);
    }
  }
  static getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amount, add) {
    if (add) {
      const quotient = JSBI13.lessThanOrEqual(amount, MaxUint160) ? JSBI13.divide(JSBI13.leftShift(amount, JSBI13.BigInt(96)), liquidity) : JSBI13.divide(JSBI13.multiply(amount, Q96), liquidity);
      return JSBI13.add(sqrtPX96, quotient);
    } else {
      const quotient = FullMath.mulDivRoundingUp(amount, Q96, liquidity);
      invariant15(JSBI13.greaterThan(sqrtPX96, quotient));
      return JSBI13.subtract(sqrtPX96, quotient);
    }
  }
};

// src/v3/utils/swapMath.ts
var MAX_FEE = JSBI13.exponentiate(JSBI13.BigInt(10), JSBI13.BigInt(6));
var SwapMath = class {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  static computeSwapStep(sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity, amountRemaining, feePips) {
    const returnValues = {};
    feePips = JSBI13.BigInt(feePips);
    const zeroForOne = JSBI13.greaterThanOrEqual(sqrtRatioCurrentX96, sqrtRatioTargetX96);
    const exactIn = JSBI13.greaterThanOrEqual(amountRemaining, ZERO2);
    if (exactIn) {
      const amountRemainingLessFee = JSBI13.divide(
        JSBI13.multiply(amountRemaining, JSBI13.subtract(MAX_FEE, feePips)),
        MAX_FEE
      );
      returnValues.amountIn = zeroForOne ? SqrtPriceMath.getAmount0Delta(sqrtRatioTargetX96, sqrtRatioCurrentX96, liquidity, true) : SqrtPriceMath.getAmount1Delta(sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity, true);
      if (JSBI13.greaterThanOrEqual(amountRemainingLessFee, returnValues.amountIn)) {
        returnValues.sqrtRatioNextX96 = sqrtRatioTargetX96;
      } else {
        returnValues.sqrtRatioNextX96 = SqrtPriceMath.getNextSqrtPriceFromInput(
          sqrtRatioCurrentX96,
          liquidity,
          amountRemainingLessFee,
          zeroForOne
        );
      }
    } else {
      returnValues.amountOut = zeroForOne ? SqrtPriceMath.getAmount1Delta(sqrtRatioTargetX96, sqrtRatioCurrentX96, liquidity, false) : SqrtPriceMath.getAmount0Delta(sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity, false);
      if (JSBI13.greaterThanOrEqual(JSBI13.multiply(amountRemaining, NEGATIVE_ONE), returnValues.amountOut)) {
        returnValues.sqrtRatioNextX96 = sqrtRatioTargetX96;
      } else {
        returnValues.sqrtRatioNextX96 = SqrtPriceMath.getNextSqrtPriceFromOutput(
          sqrtRatioCurrentX96,
          liquidity,
          JSBI13.multiply(amountRemaining, NEGATIVE_ONE),
          zeroForOne
        );
      }
    }
    const max = JSBI13.equal(sqrtRatioTargetX96, returnValues.sqrtRatioNextX96);
    if (zeroForOne) {
      returnValues.amountIn = max && exactIn ? returnValues.amountIn : SqrtPriceMath.getAmount0Delta(returnValues.sqrtRatioNextX96, sqrtRatioCurrentX96, liquidity, true);
      returnValues.amountOut = max && !exactIn ? returnValues.amountOut : SqrtPriceMath.getAmount1Delta(returnValues.sqrtRatioNextX96, sqrtRatioCurrentX96, liquidity, false);
    } else {
      returnValues.amountIn = max && exactIn ? returnValues.amountIn : SqrtPriceMath.getAmount1Delta(sqrtRatioCurrentX96, returnValues.sqrtRatioNextX96, liquidity, true);
      returnValues.amountOut = max && !exactIn ? returnValues.amountOut : SqrtPriceMath.getAmount0Delta(sqrtRatioCurrentX96, returnValues.sqrtRatioNextX96, liquidity, false);
    }
    if (!exactIn && JSBI13.greaterThan(returnValues.amountOut, JSBI13.multiply(amountRemaining, NEGATIVE_ONE))) {
      returnValues.amountOut = JSBI13.multiply(amountRemaining, NEGATIVE_ONE);
    }
    if (exactIn && JSBI13.notEqual(returnValues.sqrtRatioNextX96, sqrtRatioTargetX96)) {
      returnValues.feeAmount = JSBI13.subtract(amountRemaining, returnValues.amountIn);
    } else {
      returnValues.feeAmount = FullMath.mulDivRoundingUp(
        returnValues.amountIn,
        feePips,
        JSBI13.subtract(MAX_FEE, feePips)
      );
    }
    return [returnValues.sqrtRatioNextX96, returnValues.amountIn, returnValues.amountOut, returnValues.feeAmount];
  }
};
var LiquidityMath = class {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  static addDelta(x, y) {
    if (JSBI13.lessThan(y, ZERO2)) {
      return JSBI13.subtract(x, JSBI13.multiply(y, NEGATIVE_ONE));
    } else {
      return JSBI13.add(x, y);
    }
  }
};
var TWO2 = JSBI13.BigInt(2);
var POWERS_OF_2 = [128, 64, 32, 16, 8, 4, 2, 1].map((pow) => [
  pow,
  JSBI13.exponentiate(TWO2, JSBI13.BigInt(pow))
]);
function mostSignificantBit(x) {
  invariant15(JSBI13.greaterThan(x, ZERO2), "ZERO");
  invariant15(JSBI13.lessThanOrEqual(x, MaxUint256), "MAX");
  let msb = 0;
  for (const [power, min] of POWERS_OF_2) {
    if (JSBI13.greaterThanOrEqual(x, min)) {
      x = JSBI13.signedRightShift(x, JSBI13.BigInt(power));
      msb += power;
    }
  }
  return msb;
}

// src/v3/utils/tickMath.ts
function mulShift(val, mulBy) {
  return JSBI13.signedRightShift(JSBI13.multiply(val, JSBI13.BigInt(mulBy)), JSBI13.BigInt(128));
}
var Q32 = JSBI13.exponentiate(JSBI13.BigInt(2), JSBI13.BigInt(32));
var _TickMath = class _TickMath {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  /**
   * Returns the sqrt ratio as a Q64.96 for the given tick. The sqrt ratio is computed as sqrt(1.0001)^tick
   * @param tick the tick for which to compute the sqrt ratio
   */
  static getSqrtRatioAtTick(tick) {
    invariant15(tick >= _TickMath.MIN_TICK && tick <= _TickMath.MAX_TICK && Number.isInteger(tick), "TICK");
    const absTick = tick < 0 ? tick * -1 : tick;
    let ratio = (absTick & 1) !== 0 ? JSBI13.BigInt("0xfffcb933bd6fad37aa2d162d1a594001") : JSBI13.BigInt("0x100000000000000000000000000000000");
    if ((absTick & 2) !== 0) ratio = mulShift(ratio, "0xfff97272373d413259a46990580e213a");
    if ((absTick & 4) !== 0) ratio = mulShift(ratio, "0xfff2e50f5f656932ef12357cf3c7fdcc");
    if ((absTick & 8) !== 0) ratio = mulShift(ratio, "0xffe5caca7e10e4e61c3624eaa0941cd0");
    if ((absTick & 16) !== 0) ratio = mulShift(ratio, "0xffcb9843d60f6159c9db58835c926644");
    if ((absTick & 32) !== 0) ratio = mulShift(ratio, "0xff973b41fa98c081472e6896dfb254c0");
    if ((absTick & 64) !== 0) ratio = mulShift(ratio, "0xff2ea16466c96a3843ec78b326b52861");
    if ((absTick & 128) !== 0) ratio = mulShift(ratio, "0xfe5dee046a99a2a811c461f1969c3053");
    if ((absTick & 256) !== 0) ratio = mulShift(ratio, "0xfcbe86c7900a88aedcffc83b479aa3a4");
    if ((absTick & 512) !== 0) ratio = mulShift(ratio, "0xf987a7253ac413176f2b074cf7815e54");
    if ((absTick & 1024) !== 0) ratio = mulShift(ratio, "0xf3392b0822b70005940c7a398e4b70f3");
    if ((absTick & 2048) !== 0) ratio = mulShift(ratio, "0xe7159475a2c29b7443b29c7fa6e889d9");
    if ((absTick & 4096) !== 0) ratio = mulShift(ratio, "0xd097f3bdfd2022b8845ad8f792aa5825");
    if ((absTick & 8192) !== 0) ratio = mulShift(ratio, "0xa9f746462d870fdf8a65dc1f90e061e5");
    if ((absTick & 16384) !== 0) ratio = mulShift(ratio, "0x70d869a156d2a1b890bb3df62baf32f7");
    if ((absTick & 32768) !== 0) ratio = mulShift(ratio, "0x31be135f97d08fd981231505542fcfa6");
    if ((absTick & 65536) !== 0) ratio = mulShift(ratio, "0x9aa508b5b7a84e1c677de54f3e99bc9");
    if ((absTick & 131072) !== 0) ratio = mulShift(ratio, "0x5d6af8dedb81196699c329225ee604");
    if ((absTick & 262144) !== 0) ratio = mulShift(ratio, "0x2216e584f5fa1ea926041bedfe98");
    if ((absTick & 524288) !== 0) ratio = mulShift(ratio, "0x48a170391f7dc42444e8fa2");
    if (tick > 0) ratio = JSBI13.divide(MaxUint256, ratio);
    return JSBI13.greaterThan(JSBI13.remainder(ratio, Q32), ZERO2) ? JSBI13.add(JSBI13.divide(ratio, Q32), ONE2) : JSBI13.divide(ratio, Q32);
  }
  /**
   * Returns the tick corresponding to a given sqrt ratio, s.t. #getSqrtRatioAtTick(tick) <= sqrtRatioX96
   * and #getSqrtRatioAtTick(tick + 1) > sqrtRatioX96
   * @param sqrtRatioX96 the sqrt ratio as a Q64.96 for which to compute the tick
   */
  static getTickAtSqrtRatio(sqrtRatioX96) {
    invariant15(
      JSBI13.greaterThanOrEqual(sqrtRatioX96, _TickMath.MIN_SQRT_RATIO) && JSBI13.lessThan(sqrtRatioX96, _TickMath.MAX_SQRT_RATIO),
      "SQRT_RATIO"
    );
    const sqrtRatioX128 = JSBI13.leftShift(sqrtRatioX96, JSBI13.BigInt(32));
    const msb = mostSignificantBit(sqrtRatioX128);
    let r;
    if (JSBI13.greaterThanOrEqual(JSBI13.BigInt(msb), JSBI13.BigInt(128))) {
      r = JSBI13.signedRightShift(sqrtRatioX128, JSBI13.BigInt(msb - 127));
    } else {
      r = JSBI13.leftShift(sqrtRatioX128, JSBI13.BigInt(127 - msb));
    }
    let log_2 = JSBI13.leftShift(JSBI13.subtract(JSBI13.BigInt(msb), JSBI13.BigInt(128)), JSBI13.BigInt(64));
    for (let i = 0; i < 14; i++) {
      r = JSBI13.signedRightShift(JSBI13.multiply(r, r), JSBI13.BigInt(127));
      const f = JSBI13.signedRightShift(r, JSBI13.BigInt(128));
      log_2 = JSBI13.bitwiseOr(log_2, JSBI13.leftShift(f, JSBI13.BigInt(63 - i)));
      r = JSBI13.signedRightShift(r, f);
    }
    const log_sqrt10001 = JSBI13.multiply(log_2, JSBI13.BigInt("255738958999603826347141"));
    const tickLow = JSBI13.toNumber(
      JSBI13.signedRightShift(
        JSBI13.subtract(log_sqrt10001, JSBI13.BigInt("3402992956809132418596140100660247210")),
        JSBI13.BigInt(128)
      )
    );
    const tickHigh = JSBI13.toNumber(
      JSBI13.signedRightShift(
        JSBI13.add(log_sqrt10001, JSBI13.BigInt("291339464771989622907027621153398088495")),
        JSBI13.BigInt(128)
      )
    );
    return tickLow === tickHigh ? tickLow : JSBI13.lessThanOrEqual(_TickMath.getSqrtRatioAtTick(tickHigh), sqrtRatioX96) ? tickHigh : tickLow;
  }
};
/**
 * The minimum tick that can be used on any pool.
 */
_TickMath.MIN_TICK = -887272;
/**
 * The maximum tick that can be used on any pool.
 */
_TickMath.MAX_TICK = -_TickMath.MIN_TICK;
/**
 * The sqrt ratio corresponding to the minimum tick that could be used on any pool.
 */
_TickMath.MIN_SQRT_RATIO = JSBI13.BigInt("4295128739");
/**
 * The sqrt ratio corresponding to the maximum tick that could be used on any pool.
 */
_TickMath.MAX_SQRT_RATIO = JSBI13.BigInt("1461446703485210103287273052203988822378723970342");
var TickMath = _TickMath;

// src/v3/utils/v3swap.ts
async function v3Swap(fee, sqrtRatioX96, tickCurrent, liquidity, tickSpacing, tickDataProvider, zeroForOne, amountSpecified, sqrtPriceLimitX96) {
  if (!sqrtPriceLimitX96)
    sqrtPriceLimitX96 = zeroForOne ? JSBI13.add(TickMath.MIN_SQRT_RATIO, ONE2) : JSBI13.subtract(TickMath.MAX_SQRT_RATIO, ONE2);
  if (zeroForOne) {
    invariant15(JSBI13.greaterThan(sqrtPriceLimitX96, TickMath.MIN_SQRT_RATIO), "RATIO_MIN");
    invariant15(JSBI13.lessThan(sqrtPriceLimitX96, sqrtRatioX96), "RATIO_CURRENT");
  } else {
    invariant15(JSBI13.lessThan(sqrtPriceLimitX96, TickMath.MAX_SQRT_RATIO), "RATIO_MAX");
    invariant15(JSBI13.greaterThan(sqrtPriceLimitX96, sqrtRatioX96), "RATIO_CURRENT");
  }
  const exactInput = JSBI13.greaterThanOrEqual(amountSpecified, ZERO2);
  const state = {
    amountSpecifiedRemaining: amountSpecified,
    amountCalculated: ZERO2,
    sqrtPriceX96: sqrtRatioX96,
    tick: tickCurrent,
    liquidity
  };
  while (JSBI13.notEqual(state.amountSpecifiedRemaining, ZERO2) && state.sqrtPriceX96 !== sqrtPriceLimitX96) {
    let step = {};
    step.sqrtPriceStartX96 = state.sqrtPriceX96;
    [step.tickNext, step.initialized] = await tickDataProvider.nextInitializedTickWithinOneWord(
      state.tick,
      zeroForOne,
      tickSpacing
    );
    if (step.tickNext < TickMath.MIN_TICK) {
      step.tickNext = TickMath.MIN_TICK;
    } else if (step.tickNext > TickMath.MAX_TICK) {
      step.tickNext = TickMath.MAX_TICK;
    }
    step.sqrtPriceNextX96 = TickMath.getSqrtRatioAtTick(step.tickNext);
    [state.sqrtPriceX96, step.amountIn, step.amountOut, step.feeAmount] = SwapMath.computeSwapStep(
      state.sqrtPriceX96,
      (zeroForOne ? JSBI13.lessThan(step.sqrtPriceNextX96, sqrtPriceLimitX96) : JSBI13.greaterThan(step.sqrtPriceNextX96, sqrtPriceLimitX96)) ? sqrtPriceLimitX96 : step.sqrtPriceNextX96,
      state.liquidity,
      state.amountSpecifiedRemaining,
      fee
    );
    if (exactInput) {
      state.amountSpecifiedRemaining = JSBI13.subtract(
        state.amountSpecifiedRemaining,
        JSBI13.add(step.amountIn, step.feeAmount)
      );
      state.amountCalculated = JSBI13.subtract(state.amountCalculated, step.amountOut);
    } else {
      state.amountSpecifiedRemaining = JSBI13.add(state.amountSpecifiedRemaining, step.amountOut);
      state.amountCalculated = JSBI13.add(state.amountCalculated, JSBI13.add(step.amountIn, step.feeAmount));
    }
    if (JSBI13.equal(state.sqrtPriceX96, step.sqrtPriceNextX96)) {
      if (step.initialized) {
        let liquidityNet = JSBI13.BigInt((await tickDataProvider.getTick(step.tickNext)).liquidityNet);
        if (zeroForOne) liquidityNet = JSBI13.multiply(liquidityNet, NEGATIVE_ONE);
        state.liquidity = LiquidityMath.addDelta(state.liquidity, liquidityNet);
      }
      state.tick = zeroForOne ? step.tickNext - 1 : step.tickNext;
    } else if (JSBI13.notEqual(state.sqrtPriceX96, step.sqrtPriceStartX96)) {
      state.tick = TickMath.getTickAtSqrtRatio(state.sqrtPriceX96);
    }
  }
  return {
    amountCalculated: state.amountCalculated,
    sqrtRatioX96: state.sqrtPriceX96,
    liquidity: state.liquidity,
    tickCurrent: state.tick
  };
}

// src/v3/entities/tickDataProvider.ts
var _NoTickDataProvider = class _NoTickDataProvider {
  async getTick(_tick) {
    throw new Error(_NoTickDataProvider.ERROR_MESSAGE);
  }
  async nextInitializedTickWithinOneWord(_tick, _lte, _tickSpacing) {
    throw new Error(_NoTickDataProvider.ERROR_MESSAGE);
  }
};
_NoTickDataProvider.ERROR_MESSAGE = "No tick data provider was given";
var NoTickDataProvider = _NoTickDataProvider;

// src/v3/utils/isSorted.ts
function isSorted(list, comparator) {
  for (let i = 0; i < list.length - 1; i++) {
    if (comparator(list[i], list[i + 1]) > 0) {
      return false;
    }
  }
  return true;
}

// src/v3/utils/tickList.ts
function tickComparator(a, b) {
  return a.index - b.index;
}
var TickList = class _TickList {
  /**
   * Cannot be constructed
   */
  constructor() {
  }
  static validateList(ticks, tickSpacing) {
    invariant15(tickSpacing > 0, "TICK_SPACING_NONZERO");
    invariant15(
      ticks.every(({ index }) => index % tickSpacing === 0),
      "TICK_SPACING"
    );
    invariant15(
      JSBI13.equal(
        ticks.reduce((accumulator, { liquidityNet }) => JSBI13.add(accumulator, liquidityNet), ZERO2),
        ZERO2
      ),
      "ZERO_NET"
    );
    invariant15(isSorted(ticks, tickComparator), "SORTED");
  }
  static isBelowSmallest(ticks, tick) {
    invariant15(ticks.length > 0, "LENGTH");
    return tick < ticks[0].index;
  }
  static isAtOrAboveLargest(ticks, tick) {
    invariant15(ticks.length > 0, "LENGTH");
    return tick >= ticks[ticks.length - 1].index;
  }
  static getTick(ticks, index) {
    const tick = ticks[this.binarySearch(ticks, index)];
    invariant15(tick.index === index, "NOT_CONTAINED");
    return tick;
  }
  /**
   * Finds the largest tick in the list of ticks that is less than or equal to tick
   * @param ticks list of ticks
   * @param tick tick to find the largest tick that is less than or equal to tick
   * @private
   */
  static binarySearch(ticks, tick) {
    invariant15(!this.isBelowSmallest(ticks, tick), "BELOW_SMALLEST");
    let l = 0;
    let r = ticks.length - 1;
    let i;
    while (true) {
      i = Math.floor((l + r) / 2);
      if (ticks[i].index <= tick && (i === ticks.length - 1 || ticks[i + 1].index > tick)) {
        return i;
      }
      if (ticks[i].index < tick) {
        l = i + 1;
      } else {
        r = i - 1;
      }
    }
  }
  static nextInitializedTick(ticks, tick, lte) {
    if (lte) {
      invariant15(!_TickList.isBelowSmallest(ticks, tick), "BELOW_SMALLEST");
      if (_TickList.isAtOrAboveLargest(ticks, tick)) {
        return ticks[ticks.length - 1];
      }
      const index = this.binarySearch(ticks, tick);
      return ticks[index];
    } else {
      invariant15(!this.isAtOrAboveLargest(ticks, tick), "AT_OR_ABOVE_LARGEST");
      if (this.isBelowSmallest(ticks, tick)) {
        return ticks[0];
      }
      const index = this.binarySearch(ticks, tick);
      return ticks[index + 1];
    }
  }
  static nextInitializedTickWithinOneWord(ticks, tick, lte, tickSpacing) {
    const compressed = Math.floor(tick / tickSpacing);
    if (lte) {
      const wordPos = compressed >> 8;
      const minimum = (wordPos << 8) * tickSpacing;
      if (_TickList.isBelowSmallest(ticks, tick)) {
        return [minimum, false];
      }
      const index = _TickList.nextInitializedTick(ticks, tick, lte).index;
      const nextInitializedTick = Math.max(minimum, index);
      return [nextInitializedTick, nextInitializedTick === index];
    } else {
      const wordPos = compressed + 1 >> 8;
      const maximum = ((wordPos + 1 << 8) - 1) * tickSpacing;
      if (this.isAtOrAboveLargest(ticks, tick)) {
        return [maximum, false];
      }
      const index = this.nextInitializedTick(ticks, tick, lte).index;
      const nextInitializedTick = Math.min(maximum, index);
      return [nextInitializedTick, nextInitializedTick === index];
    }
  }
};
function encodeSqrtRatioX96(amount1, amount0) {
  const numerator = JSBI13.leftShift(JSBI13.BigInt(amount1), JSBI13.BigInt(192));
  const denominator = JSBI13.BigInt(amount0);
  const ratioX192 = JSBI13.divide(numerator, denominator);
  return sqrt(ratioX192);
}
function maxLiquidityForAmount0Imprecise(sqrtRatioAX96, sqrtRatioBX96, amount0) {
  if (JSBI13.greaterThan(sqrtRatioAX96, sqrtRatioBX96)) {
    [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  }
  const intermediate = JSBI13.divide(JSBI13.multiply(sqrtRatioAX96, sqrtRatioBX96), Q96);
  return JSBI13.divide(JSBI13.multiply(JSBI13.BigInt(amount0), intermediate), JSBI13.subtract(sqrtRatioBX96, sqrtRatioAX96));
}
function maxLiquidityForAmount0Precise(sqrtRatioAX96, sqrtRatioBX96, amount0) {
  if (JSBI13.greaterThan(sqrtRatioAX96, sqrtRatioBX96)) {
    [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  }
  const numerator = JSBI13.multiply(JSBI13.multiply(JSBI13.BigInt(amount0), sqrtRatioAX96), sqrtRatioBX96);
  const denominator = JSBI13.multiply(Q96, JSBI13.subtract(sqrtRatioBX96, sqrtRatioAX96));
  return JSBI13.divide(numerator, denominator);
}
function maxLiquidityForAmount1(sqrtRatioAX96, sqrtRatioBX96, amount1) {
  if (JSBI13.greaterThan(sqrtRatioAX96, sqrtRatioBX96)) {
    [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  }
  return JSBI13.divide(JSBI13.multiply(JSBI13.BigInt(amount1), Q96), JSBI13.subtract(sqrtRatioBX96, sqrtRatioAX96));
}
function maxLiquidityForAmounts(sqrtRatioCurrentX96, sqrtRatioAX96, sqrtRatioBX96, amount0, amount1, useFullPrecision) {
  if (JSBI13.greaterThan(sqrtRatioAX96, sqrtRatioBX96)) {
    [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  }
  const maxLiquidityForAmount0 = useFullPrecision ? maxLiquidityForAmount0Precise : maxLiquidityForAmount0Imprecise;
  if (JSBI13.lessThanOrEqual(sqrtRatioCurrentX96, sqrtRatioAX96)) {
    return maxLiquidityForAmount0(sqrtRatioAX96, sqrtRatioBX96, amount0);
  } else if (JSBI13.lessThan(sqrtRatioCurrentX96, sqrtRatioBX96)) {
    const liquidity0 = maxLiquidityForAmount0(sqrtRatioCurrentX96, sqrtRatioBX96, amount0);
    const liquidity1 = maxLiquidityForAmount1(sqrtRatioAX96, sqrtRatioCurrentX96, amount1);
    return JSBI13.lessThan(liquidity0, liquidity1) ? liquidity0 : liquidity1;
  } else {
    return maxLiquidityForAmount1(sqrtRatioAX96, sqrtRatioBX96, amount1);
  }
}

// src/v3/entities/tick.ts
var Tick = class {
  constructor({ index, liquidityGross, liquidityNet }) {
    invariant15(index >= TickMath.MIN_TICK && index <= TickMath.MAX_TICK, "TICK");
    this.index = index;
    this.liquidityGross = JSBI13.BigInt(liquidityGross);
    this.liquidityNet = JSBI13.BigInt(liquidityNet);
  }
};

// src/v3/entities/tickListDataProvider.ts
var TickListDataProvider = class {
  constructor(ticks, tickSpacing) {
    const ticksMapped = ticks.map((t) => t instanceof Tick ? t : new Tick(t));
    TickList.validateList(ticksMapped, tickSpacing);
    this.ticks = ticksMapped;
  }
  async getTick(tick) {
    return TickList.getTick(this.ticks, tick);
  }
  async nextInitializedTickWithinOneWord(tick, lte, tickSpacing) {
    return TickList.nextInitializedTickWithinOneWord(this.ticks, tick, lte, tickSpacing);
  }
};

// src/v4/utils/sortsBefore.ts
function sortsBefore(currencyA, currencyB) {
  if (currencyA.isNative) return true;
  if (currencyB.isNative) return false;
  return currencyA.wrapped.sortsBefore(currencyB.wrapped);
}
var HookOptions = /* @__PURE__ */ ((HookOptions2) => {
  HookOptions2["AfterRemoveLiquidityReturnsDelta"] = "afterRemoveLiquidityReturnsDelta";
  HookOptions2["AfterAddLiquidityReturnsDelta"] = "afterAddLiquidityReturnsDelta";
  HookOptions2["AfterSwapReturnsDelta"] = "afterSwapReturnsDelta";
  HookOptions2["BeforeSwapReturnsDelta"] = "beforeSwapReturnsDelta";
  HookOptions2["AfterDonate"] = "afterDonate";
  HookOptions2["BeforeDonate"] = "beforeDonate";
  HookOptions2["AfterSwap"] = "afterSwap";
  HookOptions2["BeforeSwap"] = "beforeSwap";
  HookOptions2["AfterRemoveLiquidity"] = "afterRemoveLiquidity";
  HookOptions2["BeforeRemoveLiquidity"] = "beforeRemoveLiquidity";
  HookOptions2["AfterAddLiquidity"] = "afterAddLiquidity";
  HookOptions2["BeforeAddLiquidity"] = "beforeAddLiquidity";
  HookOptions2["AfterInitialize"] = "afterInitialize";
  HookOptions2["BeforeInitialize"] = "beforeInitialize";
  return HookOptions2;
})(HookOptions || {});
var hookFlagIndex = {
  ["afterRemoveLiquidityReturnsDelta" /* AfterRemoveLiquidityReturnsDelta */]: 0,
  ["afterAddLiquidityReturnsDelta" /* AfterAddLiquidityReturnsDelta */]: 1,
  ["afterSwapReturnsDelta" /* AfterSwapReturnsDelta */]: 2,
  ["beforeSwapReturnsDelta" /* BeforeSwapReturnsDelta */]: 3,
  ["afterDonate" /* AfterDonate */]: 4,
  ["beforeDonate" /* BeforeDonate */]: 5,
  ["afterSwap" /* AfterSwap */]: 6,
  ["beforeSwap" /* BeforeSwap */]: 7,
  ["afterRemoveLiquidity" /* AfterRemoveLiquidity */]: 8,
  ["beforeRemoveLiquidity" /* BeforeRemoveLiquidity */]: 9,
  ["afterAddLiquidity" /* AfterAddLiquidity */]: 10,
  ["beforeAddLiquidity" /* BeforeAddLiquidity */]: 11,
  ["afterInitialize" /* AfterInitialize */]: 12,
  ["beforeInitialize" /* BeforeInitialize */]: 13
};
var Hook = class _Hook {
  static permissions(address) {
    this._checkAddress(address);
    return {
      beforeInitialize: this._hasPermission(address, "beforeInitialize" /* BeforeInitialize */),
      afterInitialize: this._hasPermission(address, "afterInitialize" /* AfterInitialize */),
      beforeAddLiquidity: this._hasPermission(address, "beforeAddLiquidity" /* BeforeAddLiquidity */),
      afterAddLiquidity: this._hasPermission(address, "afterAddLiquidity" /* AfterAddLiquidity */),
      beforeRemoveLiquidity: this._hasPermission(address, "beforeRemoveLiquidity" /* BeforeRemoveLiquidity */),
      afterRemoveLiquidity: this._hasPermission(address, "afterRemoveLiquidity" /* AfterRemoveLiquidity */),
      beforeSwap: this._hasPermission(address, "beforeSwap" /* BeforeSwap */),
      afterSwap: this._hasPermission(address, "afterSwap" /* AfterSwap */),
      beforeDonate: this._hasPermission(address, "beforeDonate" /* BeforeDonate */),
      afterDonate: this._hasPermission(address, "afterDonate" /* AfterDonate */),
      beforeSwapReturnsDelta: this._hasPermission(address, "beforeSwapReturnsDelta" /* BeforeSwapReturnsDelta */),
      afterSwapReturnsDelta: this._hasPermission(address, "afterSwapReturnsDelta" /* AfterSwapReturnsDelta */),
      afterAddLiquidityReturnsDelta: this._hasPermission(address, "afterAddLiquidityReturnsDelta" /* AfterAddLiquidityReturnsDelta */),
      afterRemoveLiquidityReturnsDelta: this._hasPermission(address, "afterRemoveLiquidityReturnsDelta" /* AfterRemoveLiquidityReturnsDelta */)
    };
  }
  static hasPermission(address, hookOption) {
    this._checkAddress(address);
    return this._hasPermission(address, hookOption);
  }
  static hasInitializePermissions(address) {
    this._checkAddress(address);
    return this._hasPermission(address, "beforeInitialize" /* BeforeInitialize */) || _Hook._hasPermission(address, "afterInitialize" /* AfterInitialize */);
  }
  static hasLiquidityPermissions(address) {
    this._checkAddress(address);
    return this._hasPermission(address, "beforeAddLiquidity" /* BeforeAddLiquidity */) || _Hook._hasPermission(address, "afterAddLiquidity" /* AfterAddLiquidity */) || _Hook._hasPermission(address, "beforeRemoveLiquidity" /* BeforeRemoveLiquidity */) || _Hook._hasPermission(address, "afterRemoveLiquidity" /* AfterRemoveLiquidity */);
  }
  static hasSwapPermissions(address) {
    this._checkAddress(address);
    return this._hasPermission(address, "beforeSwap" /* BeforeSwap */) || _Hook._hasPermission(address, "afterSwap" /* AfterSwap */);
  }
  static hasDonatePermissions(address) {
    this._checkAddress(address);
    return this._hasPermission(address, "beforeDonate" /* BeforeDonate */) || _Hook._hasPermission(address, "afterDonate" /* AfterDonate */);
  }
  static _hasPermission(address, hookOption) {
    const last4Bytes = "0x" + address.slice(-8);
    return !!(parseInt(last4Bytes, 16) & 1 << hookFlagIndex[hookOption]);
  }
  static _checkAddress(address) {
    invariant15(isAddress(address), "invalid address");
  }
};
var ADDRESS_ZERO = constants.AddressZero;
var NEGATIVE_ONE2 = JSBI13.BigInt(-1);
var ZERO3 = JSBI13.BigInt(0);
var ONE3 = JSBI13.BigInt(1);
JSBI13.exponentiate(JSBI13.BigInt(10), JSBI13.BigInt(18));
var EMPTY_BYTES = "0x";
var Q962 = JSBI13.exponentiate(JSBI13.BigInt(2), JSBI13.BigInt(96));
var Q1922 = JSBI13.exponentiate(Q962, JSBI13.BigInt(2));
var OPEN_DELTA = constants.Zero;
encodeSqrtRatioX96(1, 1);
var NATIVE_NOT_SET = "NATIVE_NOT_SET";
var ZERO_LIQUIDITY = "ZERO_LIQUIDITY";
var NO_SQRT_PRICE = "NO_SQRT_PRICE";
var CANNOT_BURN = "CANNOT_BURN";
var DYNAMIC_FEE_FLAG = 8388608;
var NO_TICK_DATA_PROVIDER_DEFAULT = new NoTickDataProvider();
var Pool = class _Pool {
  static getPoolKey(currencyA, currencyB, fee, tickSpacing, hooks) {
    invariant15(isAddress(hooks), "Invalid hook address");
    const [currency0, currency1] = sortsBefore(currencyA, currencyB) ? [currencyA, currencyB] : [currencyB, currencyA];
    const currency0Addr = currency0.isNative ? ADDRESS_ZERO : currency0.wrapped.address;
    const currency1Addr = currency1.isNative ? ADDRESS_ZERO : currency1.wrapped.address;
    return {
      currency0: currency0Addr,
      currency1: currency1Addr,
      fee,
      tickSpacing,
      hooks
    };
  }
  static getPoolId(currencyA, currencyB, fee, tickSpacing, hooks) {
    const [currency0, currency1] = sortsBefore(currencyA, currencyB) ? [currencyA, currencyB] : [currencyB, currencyA];
    const currency0Addr = currency0.isNative ? ADDRESS_ZERO : currency0.wrapped.address;
    const currency1Addr = currency1.isNative ? ADDRESS_ZERO : currency1.wrapped.address;
    return keccak256(
      ["bytes"],
      [
        defaultAbiCoder.encode(
          ["address", "address", "uint24", "int24", "address"],
          [currency0Addr, currency1Addr, fee, tickSpacing, hooks]
        )
      ]
    );
  }
  /**
   * Construct a pool
   * @param currencyA One of the currencys in the pool
   * @param currencyB The other currency in the pool
   * @param fee The fee in hundredths of a bips of the input amount of every swap that is collected by the pool
   * @param tickSpacing The tickSpacing of the pool
   * @param hooks The address of the hook contract
   * @param sqrtRatioX96 The sqrt of the current ratio of amounts of currency1 to currency0
   * @param liquidity The current value of in range liquidity
   * @param tickCurrent The current tick of the pool
   */
  constructor(currencyA, currencyB, fee, tickSpacing, hooks, sqrtRatioX96, liquidity, tickCurrent, ticks = NO_TICK_DATA_PROVIDER_DEFAULT) {
    invariant15(isAddress(hooks), "Invalid hook address");
    invariant15(Number.isInteger(fee) && (fee === DYNAMIC_FEE_FLAG || fee < 1e6), "FEE");
    if (fee === DYNAMIC_FEE_FLAG) {
      invariant15(Number(hooks) > 0, "Dynamic fee pool requires a hook");
    }
    const tickCurrentSqrtRatioX96 = TickMath.getSqrtRatioAtTick(tickCurrent);
    const nextTickSqrtRatioX96 = TickMath.getSqrtRatioAtTick(tickCurrent + 1);
    invariant15(
      JSBI13.greaterThanOrEqual(JSBI13.BigInt(sqrtRatioX96), tickCurrentSqrtRatioX96) && JSBI13.lessThanOrEqual(JSBI13.BigInt(sqrtRatioX96), nextTickSqrtRatioX96),
      "PRICE_BOUNDS"
    );
    [this.currency0, this.currency1] = sortsBefore(currencyA, currencyB) ? [currencyA, currencyB] : [currencyB, currencyA];
    this.fee = fee;
    this.sqrtRatioX96 = JSBI13.BigInt(sqrtRatioX96);
    this.tickSpacing = tickSpacing;
    this.hooks = hooks;
    this.liquidity = JSBI13.BigInt(liquidity);
    this.tickCurrent = tickCurrent;
    this.tickDataProvider = Array.isArray(ticks) ? new TickListDataProvider(ticks, tickSpacing) : ticks;
    this.poolKey = _Pool.getPoolKey(this.currency0, this.currency1, this.fee, this.tickSpacing, this.hooks);
    this.poolId = _Pool.getPoolId(this.currency0, this.currency1, this.fee, this.tickSpacing, this.hooks);
  }
  /** backwards compatibility with v2/3 sdks */
  get token0() {
    return this.currency0;
  }
  get token1() {
    return this.currency1;
  }
  /**
   * Returns true if the currency is either currency0 or currency1
   * @param currency The currency to check
   * @returns True if currency is either currency0 or currency1
   */
  involvesCurrency(currency) {
    return currency.equals(this.currency0) || currency.equals(this.currency1);
  }
  /** backwards compatibility with v2/3 sdks */
  involvesToken(currency) {
    return this.involvesCurrency(currency);
  }
  /**
   * v4-only involvesToken convenience method, used for mixed route ETH <-> WETH connection only
   * @param currency
   */
  v4InvolvesToken(currency) {
    return this.involvesCurrency(currency) || currency.wrapped.equals(this.currency0) || currency.wrapped.equals(this.currency1) || currency.wrapped.equals(this.currency0.wrapped) || currency.wrapped.equals(this.currency1.wrapped);
  }
  /**
   * Returns the current mid price of the pool in terms of currency0, i.e. the ratio of currency1 over currency0
   */
  get currency0Price() {
    return this._currency0Price ?? (this._currency0Price = new Price(
      this.currency0,
      this.currency1,
      Q1922,
      JSBI13.multiply(this.sqrtRatioX96, this.sqrtRatioX96)
    ));
  }
  /** backwards compatibility with v2/3 sdks */
  get token0Price() {
    return this.currency0Price;
  }
  /**
   * Returns the current mid price of the pool in terms of currency1, i.e. the ratio of currency0 over currency1
   */
  get currency1Price() {
    return this._currency1Price ?? (this._currency1Price = new Price(
      this.currency1,
      this.currency0,
      JSBI13.multiply(this.sqrtRatioX96, this.sqrtRatioX96),
      Q1922
    ));
  }
  /** backwards compatibility with v2/3 sdks */
  get token1Price() {
    return this.currency1Price;
  }
  /**
   * Return the price of the given currency in terms of the other currency in the pool.
   * @param currency The currency to return price of
   * @returns The price of the given currency, in terms of the other.
   */
  priceOf(currency) {
    invariant15(this.involvesCurrency(currency), "CURRENCY");
    return currency.equals(this.currency0) ? this.currency0Price : this.currency1Price;
  }
  /**
   * Returns the chain ID of the currencies in the pool.
   */
  get chainId() {
    return this.currency0.chainId;
  }
  /** Works only for vanilla hookless v3 pools, otherwise throws an error */
  async getOutputAmount(inputAmount, sqrtPriceLimitX96) {
    invariant15(this.involvesCurrency(inputAmount.currency), "CURRENCY");
    const zeroForOne = inputAmount.currency.equals(this.currency0);
    const {
      amountCalculated: outputAmount,
      sqrtRatioX96,
      liquidity,
      tickCurrent
    } = await this.swap(zeroForOne, inputAmount.quotient, sqrtPriceLimitX96);
    const outputCurrency = zeroForOne ? this.currency1 : this.currency0;
    return [
      CurrencyAmount.fromRawAmount(outputCurrency, JSBI13.multiply(outputAmount, NEGATIVE_ONE2)),
      new _Pool(
        this.currency0,
        this.currency1,
        this.fee,
        this.tickSpacing,
        this.hooks,
        sqrtRatioX96,
        liquidity,
        tickCurrent,
        this.tickDataProvider
      )
    ];
  }
  /**
   * Given a desired output amount of a currency, return the computed input amount and a pool with state updated after the trade
   * Works only for vanilla hookless v3 pools, otherwise throws an error
   * @param outputAmount the output amount for which to quote the input amount
   * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit. If zero for one, the price cannot be less than this value after the swap. If one for zero, the price cannot be greater than this value after the swap
   * @returns The input amount and the pool with updated state
   */
  async getInputAmount(outputAmount, sqrtPriceLimitX96) {
    invariant15(this.involvesCurrency(outputAmount.currency), "CURRENCY");
    const zeroForOne = outputAmount.currency.equals(this.currency1);
    const {
      amountCalculated: inputAmount,
      sqrtRatioX96,
      liquidity,
      tickCurrent
    } = await this.swap(zeroForOne, JSBI13.multiply(outputAmount.quotient, NEGATIVE_ONE2), sqrtPriceLimitX96);
    const inputCurrency = zeroForOne ? this.currency0 : this.currency1;
    return [
      CurrencyAmount.fromRawAmount(inputCurrency, inputAmount),
      new _Pool(
        this.currency0,
        this.currency1,
        this.fee,
        this.tickSpacing,
        this.hooks,
        sqrtRatioX96,
        liquidity,
        tickCurrent,
        this.tickDataProvider
      )
    ];
  }
  /**
   * Executes a swap
   * @param zeroForOne Whether the amount in is token0 or token1
   * @param amountSpecified The amount of the swap, which implicitly configures the swap as exact input (positive), or exact output (negative)
   * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit. If zero for one, the price cannot be less than this value after the swap. If one for zero, the price cannot be greater than this value after the swap
   * @returns amountCalculated
   * @returns sqrtRatioX96
   * @returns liquidity
   * @returns tickCurrent
   */
  async swap(zeroForOne, amountSpecified, sqrtPriceLimitX96) {
    if (!this.hookImpactsSwap()) {
      return v3Swap(
        JSBI13.BigInt(this.fee),
        this.sqrtRatioX96,
        this.tickCurrent,
        this.liquidity,
        this.tickSpacing,
        this.tickDataProvider,
        zeroForOne,
        amountSpecified,
        sqrtPriceLimitX96
      );
    } else {
      throw new Error("Unsupported hook");
    }
  }
  hookImpactsSwap() {
    return Hook.hasSwapPermissions(this.hooks);
  }
};

// src/v4/utils/pathCurrency.ts
function amountWithPathCurrency(amount, pool) {
  return CurrencyAmount.fromFractionalAmount(
    getPathCurrency(amount.currency, pool),
    amount.numerator,
    amount.denominator
  );
}
function getPathCurrency(currency, pool) {
  if (pool.involvesCurrency(currency)) {
    return currency;
  } else if (pool.involvesCurrency(currency.wrapped)) {
    return currency.wrapped;
  } else if (pool.currency0.wrapped.equals(currency)) {
    return pool.currency0;
  } else if (pool.currency1.wrapped.equals(currency)) {
    return pool.currency1;
  } else {
    throw new Error(
      `Expected currency ${currency.symbol} to be either ${pool.currency0.symbol} or ${pool.currency1.symbol}`
    );
  }
}

// src/v4/entities/route.ts
var Route = class {
  /**
   * Creates an instance of route.
   * @param pools An array of `Pool` objects, ordered by the route the swap will take
   * @param input The input currency
   * @param output The output currency
   */
  constructor(pools, input, output) {
    // equivalent or wrapped/unwrapped output to match pool
    this._midPrice = null;
    invariant15(pools.length > 0, "POOLS");
    const chainId = pools[0].chainId;
    const allOnSameChain = pools.every((pool) => pool.chainId === chainId);
    invariant15(allOnSameChain, "CHAIN_IDS");
    this.pathInput = getPathCurrency(input, pools[0]);
    this.pathOutput = getPathCurrency(output, pools[pools.length - 1]);
    const currencyPath = [this.pathInput];
    for (const [i, pool] of pools.entries()) {
      const currentInputCurrency = currencyPath[i];
      invariant15(currentInputCurrency.equals(pool.currency0) || currentInputCurrency.equals(pool.currency1), "PATH");
      const nextCurrency = currentInputCurrency.equals(pool.currency0) ? pool.currency1 : pool.currency0;
      currencyPath.push(nextCurrency);
    }
    this.pools = pools;
    this.currencyPath = currencyPath;
    this.input = input;
    this.output = output ?? currencyPath[currencyPath.length - 1];
  }
  get chainId() {
    return this.pools[0].chainId;
  }
  /**
   * Returns the mid price of the route
   */
  get midPrice() {
    if (this._midPrice !== null) return this._midPrice;
    const price = this.pools.slice(1).reduce(
      ({ nextInput, price: price2 }, pool) => {
        return nextInput.equals(pool.currency0) ? {
          nextInput: pool.currency1,
          price: price2.multiply(pool.currency0Price)
        } : {
          nextInput: pool.currency0,
          price: price2.multiply(pool.currency1Price)
        };
      },
      this.pools[0].currency0.equals(this.pathInput) ? {
        nextInput: this.pools[0].currency1,
        price: this.pools[0].currency0Price
      } : {
        nextInput: this.pools[0].currency0,
        price: this.pools[0].currency1Price
      }
    ).price;
    return this._midPrice = new Price(this.input, this.output, price.denominator, price.numerator);
  }
};
function tradeComparator(a, b) {
  invariant15(a.inputAmount.currency.equals(b.inputAmount.currency), "INPUT_CURRENCY");
  invariant15(a.outputAmount.currency.equals(b.outputAmount.currency), "OUTPUT_CURRENCY");
  if (a.outputAmount.equalTo(b.outputAmount)) {
    if (a.inputAmount.equalTo(b.inputAmount)) {
      const aHops = a.swaps.reduce((total, cur) => total + cur.route.currencyPath.length, 0);
      const bHops = b.swaps.reduce((total, cur) => total + cur.route.currencyPath.length, 0);
      return aHops - bHops;
    }
    if (a.inputAmount.lessThan(b.inputAmount)) {
      return -1;
    } else {
      return 1;
    }
  } else {
    if (a.outputAmount.lessThan(b.outputAmount)) {
      return 1;
    } else {
      return -1;
    }
  }
}
var Trade = class _Trade {
  /**
   * @deprecated Deprecated in favor of 'swaps' property. If the trade consists of multiple routes
   * this will return an error.
   *
   * When the trade consists of just a single route, this returns the route of the trade,
   * i.e. which pools the trade goes through.
   */
  get route() {
    invariant15(this.swaps.length === 1, "MULTIPLE_ROUTES");
    return this.swaps[0].route;
  }
  /**
   * The input amount for the trade assuming no slippage.
   */
  get inputAmount() {
    if (this._inputAmount) {
      return this._inputAmount;
    }
    const inputCurrency = this.swaps[0].inputAmount.currency;
    const totalInputFromRoutes = this.swaps.map(({ inputAmount }) => inputAmount).reduce((total, cur) => total.add(cur), CurrencyAmount.fromRawAmount(inputCurrency, 0));
    this._inputAmount = totalInputFromRoutes;
    return this._inputAmount;
  }
  /**
   * The output amount for the trade assuming no slippage.
   */
  get outputAmount() {
    if (this._outputAmount) {
      return this._outputAmount;
    }
    const outputCurrency = this.swaps[0].outputAmount.currency;
    const totalOutputFromRoutes = this.swaps.map(({ outputAmount }) => outputAmount).reduce((total, cur) => total.add(cur), CurrencyAmount.fromRawAmount(outputCurrency, 0));
    this._outputAmount = totalOutputFromRoutes;
    return this._outputAmount;
  }
  /**
   * The price expressed in terms of output amount/input amount.
   */
  get executionPrice() {
    return this._executionPrice ?? (this._executionPrice = new Price(
      this.inputAmount.currency,
      this.outputAmount.currency,
      this.inputAmount.quotient,
      this.outputAmount.quotient
    ));
  }
  /**
   * Returns the percent difference between the route's mid price and the price impact
   */
  get priceImpact() {
    if (this._priceImpact) {
      return this._priceImpact;
    }
    let spotOutputAmount = CurrencyAmount.fromRawAmount(this.outputAmount.currency, 0);
    for (const { route, inputAmount } of this.swaps) {
      const midPrice = route.midPrice;
      spotOutputAmount = spotOutputAmount.add(midPrice.quote(inputAmount));
    }
    const priceImpact = spotOutputAmount.subtract(this.outputAmount).divide(spotOutputAmount);
    this._priceImpact = new Percent(priceImpact.numerator, priceImpact.denominator);
    return this._priceImpact;
  }
  /**
   * Constructs an exact in trade with the given amount in and route
   * @template TInput The input currency, either Ether or an ERC-20
   * @template TOutput The output currency, either Ether or an ERC-20
   * @param route The route of the exact in trade
   * @param amountIn The amount being passed in
   * @returns The exact in trade
   */
  static async exactIn(route, amountIn) {
    return _Trade.fromRoute(route, amountIn, 0 /* EXACT_INPUT */);
  }
  /**
   * Constructs an exact out trade with the given amount out and route
   * @template TInput The input currency, either Ether or an ERC-20
   * @template TOutput The output currency, either Ether or an ERC-20
   * @param route The route of the exact out trade
   * @param amountOut The amount returned by the trade
   * @returns The exact out trade
   */
  static async exactOut(route, amountOut) {
    return _Trade.fromRoute(route, amountOut, 1 /* EXACT_OUTPUT */);
  }
  /**
   * Constructs a trade by simulating swaps through the given route
   * @template TInput The input currency, either Ether or an ERC-20.
   * @template TOutput The output currency, either Ether or an ERC-20.
   * @template TTradeType The type of the trade, either exact in or exact out.
   * @param route route to swap through
   * @param amount the amount specified, either input or output, depending on tradeType
   * @param tradeType whether the trade is an exact input or exact output swap
   * @returns The route
   */
  static async fromRoute(route, amount, tradeType) {
    let inputAmount;
    let outputAmount;
    if (tradeType === 0 /* EXACT_INPUT */) {
      invariant15(amount.currency.equals(route.input), "INPUT");
      let tokenAmount = amountWithPathCurrency(amount, route.pools[0]);
      for (let i = 0; i < route.pools.length; i++) {
        const pool = route.pools[i];
        [tokenAmount] = await pool.getOutputAmount(tokenAmount);
      }
      inputAmount = CurrencyAmount.fromFractionalAmount(route.input, amount.numerator, amount.denominator);
      outputAmount = CurrencyAmount.fromFractionalAmount(route.output, tokenAmount.numerator, tokenAmount.denominator);
    } else {
      invariant15(amount.currency.equals(route.output), "OUTPUT");
      let tokenAmount = amountWithPathCurrency(amount, route.pools[route.pools.length - 1]);
      for (let i = route.pools.length - 1; i >= 0; i--) {
        const pool = route.pools[i];
        [tokenAmount] = await pool.getInputAmount(tokenAmount);
      }
      inputAmount = CurrencyAmount.fromFractionalAmount(route.input, tokenAmount.numerator, tokenAmount.denominator);
      outputAmount = CurrencyAmount.fromFractionalAmount(route.output, amount.numerator, amount.denominator);
    }
    return new _Trade({
      routes: [{ inputAmount, outputAmount, route }],
      tradeType
    });
  }
  /**
   * Constructs a trade from routes by simulating swaps
   *
   * @template TInput The input currency, either Ether or an ERC-20.
   * @template TOutput The output currency, either Ether or an ERC-20.
   * @template TTradeType The type of the trade, either exact in or exact out.
   * @param routes the routes to swap through and how much of the amount should be routed through each
   * @param tradeType whether the trade is an exact input or exact output swap
   * @returns The trade
   */
  static async fromRoutes(routes, tradeType) {
    const swaps = await Promise.all(
      routes.map(async ({ amount, route }) => {
        const trade = await _Trade.fromRoute(route, amount, tradeType);
        return trade.swaps[0];
      })
    );
    return new _Trade({
      routes: swaps,
      tradeType
    });
  }
  /**
   * Creates a trade without computing the result of swapping through the route. Useful when you have simulated the trade
   * elsewhere and do not have any tick data
   * @template TInput The input currency, either Ether or an ERC-20
   * @template TOutput The output currency, either Ether or an ERC-20
   * @template TTradeType The type of the trade, either exact in or exact out
   * @param constructorArguments The arguments passed to the trade constructor
   * @returns The unchecked trade
   */
  static createUncheckedTrade(constructorArguments) {
    return new _Trade({
      ...constructorArguments,
      routes: [
        {
          inputAmount: constructorArguments.inputAmount,
          outputAmount: constructorArguments.outputAmount,
          route: constructorArguments.route
        }
      ]
    });
  }
  /**
   * Creates a trade without computing the result of swapping through the routes. Useful when you have simulated the trade
   * elsewhere and do not have any tick data
   * @template TInput The input currency, either Ether or an ERC-20
   * @template TOutput The output currency, either Ether or an ERC-20
   * @template TTradeType The type of the trade, either exact in or exact out
   * @param constructorArguments The arguments passed to the trade constructor
   * @returns The unchecked trade
   */
  static createUncheckedTradeWithMultipleRoutes(constructorArguments) {
    return new _Trade(constructorArguments);
  }
  /**
   * Construct a trade by passing in the pre-computed property values
   * @param routes The routes through which the trade occurs
   * @param tradeType The type of trade, exact input or exact output
   */
  constructor({
    routes,
    tradeType
  }) {
    const inputCurrency = routes[0].inputAmount.currency;
    const outputCurrency = routes[0].outputAmount.currency;
    invariant15(
      routes.every(({ route }) => inputCurrency.equals(route.input)),
      "INPUT_CURRENCY_MATCH"
    );
    invariant15(
      routes.every(({ route }) => outputCurrency.equals(route.output)),
      "OUTPUT_CURRENCY_MATCH"
    );
    const numPools = routes.map(({ route }) => route.pools.length).reduce((total, cur) => total + cur, 0);
    const poolIDSet = /* @__PURE__ */ new Set();
    for (const { route } of routes) {
      for (const pool of route.pools) {
        poolIDSet.add(Pool.getPoolId(pool.currency0, pool.currency1, pool.fee, pool.tickSpacing, pool.hooks));
      }
    }
    invariant15(numPools === poolIDSet.size, "POOLS_DUPLICATED");
    this.swaps = routes;
    this.tradeType = tradeType;
  }
  /**
   * Get the minimum amount that must be received from this trade for the given slippage tolerance
   * @param slippageTolerance The tolerance of unfavorable slippage from the execution price of this trade
   * @returns The amount out
   */
  minimumAmountOut(slippageTolerance, amountOut = this.outputAmount) {
    invariant15(!slippageTolerance.lessThan(ZERO3), "SLIPPAGE_TOLERANCE");
    if (this.tradeType === 1 /* EXACT_OUTPUT */) {
      return amountOut;
    } else {
      const slippageAdjustedAmountOut = new Fraction(ONE3).add(slippageTolerance).invert().multiply(amountOut.quotient).quotient;
      return CurrencyAmount.fromRawAmount(amountOut.currency, slippageAdjustedAmountOut);
    }
  }
  /**
   * Get the maximum amount in that can be spent via this trade for the given slippage tolerance
   * @param slippageTolerance The tolerance of unfavorable slippage from the execution price of this trade
   * @returns The amount in
   */
  maximumAmountIn(slippageTolerance, amountIn = this.inputAmount) {
    invariant15(!slippageTolerance.lessThan(ZERO3), "SLIPPAGE_TOLERANCE");
    if (this.tradeType === 0 /* EXACT_INPUT */) {
      return amountIn;
    } else {
      const slippageAdjustedAmountIn = new Fraction(ONE3).add(slippageTolerance).multiply(amountIn.quotient).quotient;
      return CurrencyAmount.fromRawAmount(amountIn.currency, slippageAdjustedAmountIn);
    }
  }
  /**
   * Return the execution price after accounting for slippage tolerance
   * @param slippageTolerance the allowed tolerated slippage
   * @returns The execution price
   */
  worstExecutionPrice(slippageTolerance) {
    return new Price(
      this.inputAmount.currency,
      this.outputAmount.currency,
      this.maximumAmountIn(slippageTolerance).quotient,
      this.minimumAmountOut(slippageTolerance).quotient
    );
  }
  /**
   * Given a list of pools, and a fixed amount in, returns the top `maxNumResults` trades that go from an input currency
   * amount to an output currency, making at most `maxHops` hops.
   * Note this does not consider aggregation, as routes are linear. It's possible a better route exists by splitting
   * the amount in among multiple routes.
   * @param pools the pools to consider in finding the best trade
   * @param nextAmountIn exact amount of input currency to spend
   * @param currencyOut the desired currency out
   * @param maxNumResults maximum number of results to return
   * @param maxHops maximum number of hops a returned trade can make, e.g. 1 hop goes through a single pool
   * @param currentPools used in recursion; the current list of pools
   * @param currencyAmountIn used in recursion; the original value of the currencyAmountIn parameter
   * @param bestTrades used in recursion; the current list of best trades
   * @returns The exact in trade
   */
  static async bestTradeExactIn(pools, currencyAmountIn, currencyOut, { maxNumResults = 3, maxHops = 3 } = {}, currentPools = [], nextAmountIn = currencyAmountIn, bestTrades = []) {
    invariant15(pools.length > 0, "POOLS");
    invariant15(maxHops > 0, "MAX_HOPS");
    invariant15(currencyAmountIn === nextAmountIn || currentPools.length > 0, "INVALID_RECURSION");
    const amountIn = nextAmountIn;
    for (let i = 0; i < pools.length; i++) {
      const pool = pools[i];
      if (!pool.currency0.equals(amountIn.currency) && !pool.currency1.equals(amountIn.currency)) continue;
      let amountOut;
      try {
        ;
        [amountOut] = await pool.getOutputAmount(amountIn);
      } catch (error) {
        if (error.isInsufficientInputAmountError) {
          continue;
        }
        throw error;
      }
      if (amountOut.currency.equals(currencyOut)) {
        sortedInsert(
          bestTrades,
          await _Trade.fromRoute(
            new Route([...currentPools, pool], currencyAmountIn.currency, currencyOut),
            currencyAmountIn,
            0 /* EXACT_INPUT */
          ),
          maxNumResults,
          tradeComparator
        );
      } else if (maxHops > 1 && pools.length > 1) {
        const poolsExcludingThisPool = pools.slice(0, i).concat(pools.slice(i + 1, pools.length));
        await _Trade.bestTradeExactIn(
          poolsExcludingThisPool,
          currencyAmountIn,
          currencyOut,
          {
            maxNumResults,
            maxHops: maxHops - 1
          },
          [...currentPools, pool],
          amountOut,
          bestTrades
        );
      }
    }
    return bestTrades;
  }
  /**
   * similar to the above method but instead targets a fixed output amount
   * given a list of pools, and a fixed amount out, returns the top `maxNumResults` trades that go from an input currency
   * to an output currency amount, making at most `maxHops` hops
   * note this does not consider aggregation, as routes are linear. it's possible a better route exists by splitting
   * the amount in among multiple routes.
   * @param pools the pools to consider in finding the best trade
   * @param currencyIn the currency to spend
   * @param currencyAmountOut the desired currency amount out
   * @param nextAmountOut the exact amount of currency out
   * @param maxNumResults maximum number of results to return
   * @param maxHops maximum number of hops a returned trade can make, e.g. 1 hop goes through a single pool
   * @param currentPools used in recursion; the current list of pools
   * @param bestTrades used in recursion; the current list of best trades
   * @returns The exact out trade
   */
  static async bestTradeExactOut(pools, currencyIn, currencyAmountOut, { maxNumResults = 3, maxHops = 3 } = {}, currentPools = [], nextAmountOut = currencyAmountOut, bestTrades = []) {
    invariant15(pools.length > 0, "POOLS");
    invariant15(maxHops > 0, "MAX_HOPS");
    invariant15(currencyAmountOut === nextAmountOut || currentPools.length > 0, "INVALID_RECURSION");
    const amountOut = nextAmountOut;
    for (let i = 0; i < pools.length; i++) {
      const pool = pools[i];
      if (!pool.currency0.equals(amountOut.currency) && !pool.currency1.equals(amountOut.currency)) continue;
      let amountIn;
      try {
        ;
        [amountIn] = await pool.getInputAmount(amountOut);
      } catch (error) {
        if (error.isInsufficientReservesError) {
          continue;
        }
        throw error;
      }
      if (amountIn.currency.equals(currencyIn)) {
        sortedInsert(
          bestTrades,
          await _Trade.fromRoute(
            new Route([pool, ...currentPools], currencyIn, currencyAmountOut.currency),
            currencyAmountOut,
            1 /* EXACT_OUTPUT */
          ),
          maxNumResults,
          tradeComparator
        );
      } else if (maxHops > 1 && pools.length > 1) {
        const poolsExcludingThisPool = pools.slice(0, i).concat(pools.slice(i + 1, pools.length));
        await _Trade.bestTradeExactOut(
          poolsExcludingThisPool,
          currencyIn,
          currencyAmountOut,
          {
            maxNumResults,
            maxHops: maxHops - 1
          },
          [pool, ...currentPools],
          amountIn,
          bestTrades
        );
      }
    }
    return bestTrades;
  }
};
function tickToPrice(baseCurrency, quoteCurrency, tick) {
  const sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);
  const ratioX192 = JSBI13.multiply(sqrtRatioX96, sqrtRatioX96);
  return sortsBefore(baseCurrency, quoteCurrency) ? new Price(baseCurrency, quoteCurrency, Q1922, ratioX192) : new Price(baseCurrency, quoteCurrency, ratioX192, Q1922);
}
function priceToClosestTick(price) {
  const sorted = sortsBefore(price.baseCurrency, price.quoteCurrency);
  const sqrtRatioX96 = sorted ? encodeSqrtRatioX96(price.numerator, price.denominator) : encodeSqrtRatioX96(price.denominator, price.numerator);
  let tick = TickMath.getTickAtSqrtRatio(sqrtRatioX96);
  const nextTickPrice = tickToPrice(price.baseCurrency, price.quoteCurrency, tick + 1);
  if (sorted) {
    if (!price.lessThan(nextTickPrice)) {
      tick++;
    }
  } else {
    if (!price.greaterThan(nextTickPrice)) {
      tick++;
    }
  }
  return tick;
}

// src/v4/entities/position.ts
var Position = class _Position {
  /**
   * Constructs a position for a given pool with the given liquidity
   * @param pool For which pool the liquidity is assigned
   * @param liquidity The amount of liquidity that is in the position
   * @param tickLower The lower tick of the position
   * @param tickUpper The upper tick of the position
   */
  constructor({ pool, liquidity, tickLower, tickUpper }) {
    // TODO: needs to be fetched from pool manager
    // cached resuts for the getters
    this._token0Amount = null;
    this._token1Amount = null;
    this._mintAmounts = null;
    invariant15(tickLower < tickUpper, "TICK_ORDER");
    invariant15(tickLower >= TickMath.MIN_TICK && tickLower % pool.tickSpacing === 0, "TICK_LOWER");
    invariant15(tickUpper <= TickMath.MAX_TICK && tickUpper % pool.tickSpacing === 0, "TICK_UPPER");
    this.pool = pool;
    this.tickLower = tickLower;
    this.tickUpper = tickUpper;
    this.liquidity = JSBI13.BigInt(liquidity);
  }
  /**
   * Returns the price of token0 at the lower tick
   */
  get token0PriceLower() {
    return tickToPrice(this.pool.currency0, this.pool.currency1, this.tickLower);
  }
  /**
   * Returns the price of token0 at the upper tick
   */
  get token0PriceUpper() {
    return tickToPrice(this.pool.currency0, this.pool.currency1, this.tickUpper);
  }
  /**
   * Returns the amount of token0 that this position's liquidity could be burned for at the current pool price
   */
  get amount0() {
    if (!this._token0Amount) {
      if (this.pool.tickCurrent < this.tickLower) {
        this._token0Amount = CurrencyAmount.fromRawAmount(
          this.pool.currency0,
          SqrtPriceMath.getAmount0Delta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            TickMath.getSqrtRatioAtTick(this.tickUpper),
            this.liquidity,
            false
          )
        );
      } else if (this.pool.tickCurrent < this.tickUpper) {
        this._token0Amount = CurrencyAmount.fromRawAmount(
          this.pool.currency0,
          SqrtPriceMath.getAmount0Delta(
            this.pool.sqrtRatioX96,
            TickMath.getSqrtRatioAtTick(this.tickUpper),
            this.liquidity,
            false
          )
        );
      } else {
        this._token0Amount = CurrencyAmount.fromRawAmount(this.pool.currency0, ZERO3);
      }
    }
    return this._token0Amount;
  }
  /**
   * Returns the amount of token1 that this position's liquidity could be burned for at the current pool price
   */
  get amount1() {
    if (!this._token1Amount) {
      if (this.pool.tickCurrent < this.tickLower) {
        this._token1Amount = CurrencyAmount.fromRawAmount(this.pool.currency1, ZERO3);
      } else if (this.pool.tickCurrent < this.tickUpper) {
        this._token1Amount = CurrencyAmount.fromRawAmount(
          this.pool.currency1,
          SqrtPriceMath.getAmount1Delta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            this.pool.sqrtRatioX96,
            this.liquidity,
            false
          )
        );
      } else {
        this._token1Amount = CurrencyAmount.fromRawAmount(
          this.pool.currency1,
          SqrtPriceMath.getAmount1Delta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            TickMath.getSqrtRatioAtTick(this.tickUpper),
            this.liquidity,
            false
          )
        );
      }
    }
    return this._token1Amount;
  }
  /**
   * Returns the lower and upper sqrt ratios if the price 'slips' up to slippage tolerance percentage
   * @param slippageTolerance The amount by which the price can 'slip' before the transaction will revert
   * @returns The sqrt ratios after slippage
   */
  ratiosAfterSlippage(slippageTolerance) {
    const priceLower = this.pool.token0Price.asFraction.multiply(new Percent(1).subtract(slippageTolerance));
    const priceUpper = this.pool.token0Price.asFraction.multiply(slippageTolerance.add(1));
    let sqrtRatioX96Lower = encodeSqrtRatioX96(priceLower.numerator, priceLower.denominator);
    if (JSBI13.lessThanOrEqual(sqrtRatioX96Lower, TickMath.MIN_SQRT_RATIO)) {
      sqrtRatioX96Lower = JSBI13.add(TickMath.MIN_SQRT_RATIO, JSBI13.BigInt(1));
    }
    let sqrtRatioX96Upper = encodeSqrtRatioX96(priceUpper.numerator, priceUpper.denominator);
    if (JSBI13.greaterThanOrEqual(sqrtRatioX96Upper, TickMath.MAX_SQRT_RATIO)) {
      sqrtRatioX96Upper = JSBI13.subtract(TickMath.MAX_SQRT_RATIO, JSBI13.BigInt(1));
    }
    return {
      sqrtRatioX96Lower,
      sqrtRatioX96Upper
    };
  }
  /**
   * Returns the maximum amount of token0 and token1 that must be sent in order to safely mint the amount of liquidity held by the position
   * with the given slippage tolerance
   * @param slippageTolerance Tolerance of unfavorable slippage from the current price
   * @returns The amounts, with slippage
   * @dev In v4, minting and increasing is protected by maximum amounts of token0 and token1.
   */
  mintAmountsWithSlippage(slippageTolerance) {
    const { sqrtRatioX96Upper, sqrtRatioX96Lower } = this.ratiosAfterSlippage(slippageTolerance);
    const poolLower = new Pool(
      this.pool.token0,
      this.pool.token1,
      this.pool.fee,
      this.pool.tickSpacing,
      this.pool.hooks,
      sqrtRatioX96Lower,
      0,
      TickMath.getTickAtSqrtRatio(sqrtRatioX96Lower)
    );
    const poolUpper = new Pool(
      this.pool.token0,
      this.pool.token1,
      this.pool.fee,
      this.pool.tickSpacing,
      this.pool.hooks,
      sqrtRatioX96Upper,
      0,
      TickMath.getTickAtSqrtRatio(sqrtRatioX96Upper)
    );
    const { amount1 } = new _Position({
      pool: poolUpper,
      liquidity: this.liquidity,
      // The precise liquidity calculated offchain
      tickLower: this.tickLower,
      tickUpper: this.tickUpper
    }).mintAmounts;
    const { amount0 } = new _Position({
      pool: poolLower,
      liquidity: this.liquidity,
      // The precise liquidity calculated offchain
      tickLower: this.tickLower,
      tickUpper: this.tickUpper
    }).mintAmounts;
    return { amount0, amount1 };
  }
  /**
   * Returns the minimum amounts that should be requested in order to safely burn the amount of liquidity held by the
   * position with the given slippage tolerance
   * @param slippageTolerance tolerance of unfavorable slippage from the current price
   * @returns The amounts, with slippage
   */
  burnAmountsWithSlippage(slippageTolerance) {
    const { sqrtRatioX96Upper, sqrtRatioX96Lower } = this.ratiosAfterSlippage(slippageTolerance);
    const poolLower = new Pool(
      this.pool.currency0,
      this.pool.currency1,
      this.pool.fee,
      this.pool.tickSpacing,
      this.pool.hooks,
      sqrtRatioX96Lower,
      0,
      TickMath.getTickAtSqrtRatio(sqrtRatioX96Lower)
    );
    const poolUpper = new Pool(
      this.pool.currency0,
      this.pool.currency1,
      this.pool.fee,
      this.pool.tickSpacing,
      this.pool.hooks,
      sqrtRatioX96Upper,
      0,
      TickMath.getTickAtSqrtRatio(sqrtRatioX96Upper)
    );
    const amount0 = new _Position({
      pool: poolUpper,
      liquidity: this.liquidity,
      tickLower: this.tickLower,
      tickUpper: this.tickUpper
    }).amount0;
    const amount1 = new _Position({
      pool: poolLower,
      liquidity: this.liquidity,
      tickLower: this.tickLower,
      tickUpper: this.tickUpper
    }).amount1;
    return { amount0: amount0.quotient, amount1: amount1.quotient };
  }
  /**
   * Returns the minimum amounts that must be sent in order to mint the amount of liquidity held by the position at
   * the current price for the pool
   */
  get mintAmounts() {
    if (this._mintAmounts === null) {
      if (this.pool.tickCurrent < this.tickLower) {
        return {
          amount0: SqrtPriceMath.getAmount0Delta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            TickMath.getSqrtRatioAtTick(this.tickUpper),
            this.liquidity,
            true
          ),
          amount1: ZERO3
        };
      } else if (this.pool.tickCurrent < this.tickUpper) {
        return {
          amount0: SqrtPriceMath.getAmount0Delta(
            this.pool.sqrtRatioX96,
            TickMath.getSqrtRatioAtTick(this.tickUpper),
            this.liquidity,
            true
          ),
          amount1: SqrtPriceMath.getAmount1Delta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            this.pool.sqrtRatioX96,
            this.liquidity,
            true
          )
        };
      } else {
        return {
          amount0: ZERO3,
          amount1: SqrtPriceMath.getAmount1Delta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            TickMath.getSqrtRatioAtTick(this.tickUpper),
            this.liquidity,
            true
          )
        };
      }
    }
    return this._mintAmounts;
  }
  /**
   * Returns the AllowanceTransferPermitBatch for adding liquidity to a position
   * @param slippageTolerance The amount by which the price can 'slip' before the transaction will revert
   * @param spender The spender of the permit (should usually be the PositionManager)
   * @param nonce A valid permit2 nonce
   * @param deadline The deadline for the permit
   */
  permitBatchData(slippageTolerance, spender, nonce, deadline) {
    const { amount0, amount1 } = this.mintAmountsWithSlippage(slippageTolerance);
    return {
      details: [
        {
          token: this.pool.currency0.wrapped.address,
          amount: amount0,
          expiration: deadline,
          nonce
        },
        {
          token: this.pool.currency1.wrapped.address,
          amount: amount1,
          expiration: deadline,
          nonce
        }
      ],
      spender,
      sigDeadline: deadline
    };
  }
  /**
   * Computes the maximum amount of liquidity received for a given amount of token0, token1,
   * and the prices at the tick boundaries.
   * @param pool The pool for which the position should be created
   * @param tickLower The lower tick of the position
   * @param tickUpper The upper tick of the position
   * @param amount0 token0 amountzw
   * @param amount1 token1 amount
   * @param useFullPrecision If false, liquidity will be maximized according to what the router can calculate,
   * not what core can theoretically support
   * @returns The amount of liquidity for the position
   */
  static fromAmounts({
    pool,
    tickLower,
    tickUpper,
    amount0,
    amount1,
    useFullPrecision
  }) {
    const sqrtRatioAX96 = TickMath.getSqrtRatioAtTick(tickLower);
    const sqrtRatioBX96 = TickMath.getSqrtRatioAtTick(tickUpper);
    return new _Position({
      pool,
      tickLower,
      tickUpper,
      liquidity: maxLiquidityForAmounts(
        pool.sqrtRatioX96,
        sqrtRatioAX96,
        sqrtRatioBX96,
        amount0,
        amount1,
        useFullPrecision
      )
    });
  }
  /**
   * Computes a position with the maximum amount of liquidity received for a given amount of token0, assuming an unlimited amount of token1
   * @param pool The pool for which the position is created
   * @param tickLower The lower tick
   * @param tickUpper The upper tick
   * @param amount0 The desired amount of token0
   * @param useFullPrecision If true, liquidity will be maximized according to what the router can calculate,
   * not what core can theoretically support
   * @returns The position
   */
  static fromAmount0({
    pool,
    tickLower,
    tickUpper,
    amount0,
    useFullPrecision
  }) {
    return _Position.fromAmounts({ pool, tickLower, tickUpper, amount0, amount1: MaxUint256, useFullPrecision });
  }
  /**
   * Computes a position with the maximum amount of liquidity received for a given amount of token1, assuming an unlimited amount of token0
   * @param pool The pool for which the position is created
   * @param tickLower The lower tick
   * @param tickUpper The upper tick
   * @param amount1 The desired amount of token1
   * @returns The position
   */
  static fromAmount1({
    pool,
    tickLower,
    tickUpper,
    amount1
  }) {
    return _Position.fromAmounts({ pool, tickLower, tickUpper, amount0: MaxUint256, amount1, useFullPrecision: true });
  }
};

// src/v4/utils/encodeRouteToPath.ts
var encodeRouteToPath = (route, exactOutput) => {
  let pools = route.pools.map((p) => p);
  if (exactOutput) pools = pools.reverse();
  let startingCurrency = exactOutput ? route.pathOutput : route.pathInput;
  let pathKeys = [];
  for (let pool of pools) {
    const nextCurrency = startingCurrency.equals(pool.currency0) ? pool.currency1 : pool.currency0;
    pathKeys.push({
      intermediateCurrency: nextCurrency.isNative ? ADDRESS_ZERO : nextCurrency.address,
      fee: pool.fee,
      tickSpacing: pool.tickSpacing,
      hooks: pool.hooks,
      hookData: "0x"
    });
    startingCurrency = nextCurrency;
  }
  return exactOutput ? pathKeys.reverse() : pathKeys;
};
var Actions = /* @__PURE__ */ ((Actions2) => {
  Actions2[Actions2["INCREASE_LIQUIDITY"] = 0] = "INCREASE_LIQUIDITY";
  Actions2[Actions2["DECREASE_LIQUIDITY"] = 1] = "DECREASE_LIQUIDITY";
  Actions2[Actions2["MINT_POSITION"] = 2] = "MINT_POSITION";
  Actions2[Actions2["BURN_POSITION"] = 3] = "BURN_POSITION";
  Actions2[Actions2["SWAP_EXACT_IN_SINGLE"] = 6] = "SWAP_EXACT_IN_SINGLE";
  Actions2[Actions2["SWAP_EXACT_IN"] = 7] = "SWAP_EXACT_IN";
  Actions2[Actions2["SWAP_EXACT_OUT_SINGLE"] = 8] = "SWAP_EXACT_OUT_SINGLE";
  Actions2[Actions2["SWAP_EXACT_OUT"] = 9] = "SWAP_EXACT_OUT";
  Actions2[Actions2["SETTLE"] = 11] = "SETTLE";
  Actions2[Actions2["SETTLE_ALL"] = 12] = "SETTLE_ALL";
  Actions2[Actions2["SETTLE_PAIR"] = 13] = "SETTLE_PAIR";
  Actions2[Actions2["TAKE"] = 14] = "TAKE";
  Actions2[Actions2["TAKE_ALL"] = 15] = "TAKE_ALL";
  Actions2[Actions2["TAKE_PORTION"] = 16] = "TAKE_PORTION";
  Actions2[Actions2["TAKE_PAIR"] = 17] = "TAKE_PAIR";
  Actions2[Actions2["CLOSE_CURRENCY"] = 18] = "CLOSE_CURRENCY";
  Actions2[Actions2["SWEEP"] = 20] = "SWEEP";
  Actions2[Actions2["UNWRAP"] = 22] = "UNWRAP";
  return Actions2;
})(Actions || {});
var Subparser = /* @__PURE__ */ ((Subparser2) => {
  Subparser2[Subparser2["V4SwapExactInSingle"] = 0] = "V4SwapExactInSingle";
  Subparser2[Subparser2["V4SwapExactIn"] = 1] = "V4SwapExactIn";
  Subparser2[Subparser2["V4SwapExactOutSingle"] = 2] = "V4SwapExactOutSingle";
  Subparser2[Subparser2["V4SwapExactOut"] = 3] = "V4SwapExactOut";
  Subparser2[Subparser2["PoolKey"] = 4] = "PoolKey";
  return Subparser2;
})(Subparser || {});
var POOL_KEY_STRUCT = "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
var PATH_KEY_STRUCT = "(address intermediateCurrency,uint256 fee,int24 tickSpacing,address hooks,bytes hookData)";
var SWAP_EXACT_IN_SINGLE_STRUCT = "(" + POOL_KEY_STRUCT + " poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)";
var SWAP_EXACT_IN_STRUCT = "(address currencyIn," + PATH_KEY_STRUCT + "[] path,uint128 amountIn,uint128 amountOutMinimum)";
var SWAP_EXACT_OUT_SINGLE_STRUCT = "(" + POOL_KEY_STRUCT + " poolKey,bool zeroForOne,uint128 amountOut,uint128 amountInMaximum,bytes hookData)";
var SWAP_EXACT_OUT_STRUCT = "(address currencyOut," + PATH_KEY_STRUCT + "[] path,uint128 amountOut,uint128 amountInMaximum)";
var V4_BASE_ACTIONS_ABI_DEFINITION = {
  // Liquidity commands
  [0 /* INCREASE_LIQUIDITY */]: [
    { name: "tokenId", type: "uint256" },
    { name: "liquidity", type: "uint256" },
    { name: "amount0Max", type: "uint128" },
    { name: "amount1Max", type: "uint128" },
    { name: "hookData", type: "bytes" }
  ],
  [1 /* DECREASE_LIQUIDITY */]: [
    { name: "tokenId", type: "uint256" },
    { name: "liquidity", type: "uint256" },
    { name: "amount0Min", type: "uint128" },
    { name: "amount1Min", type: "uint128" },
    { name: "hookData", type: "bytes" }
  ],
  [2 /* MINT_POSITION */]: [
    { name: "poolKey", type: POOL_KEY_STRUCT, subparser: 4 /* PoolKey */ },
    { name: "tickLower", type: "int24" },
    { name: "tickUpper", type: "int24" },
    { name: "liquidity", type: "uint256" },
    { name: "amount0Max", type: "uint128" },
    { name: "amount1Max", type: "uint128" },
    { name: "owner", type: "address" },
    { name: "hookData", type: "bytes" }
  ],
  [3 /* BURN_POSITION */]: [
    { name: "tokenId", type: "uint256" },
    { name: "amount0Min", type: "uint128" },
    { name: "amount1Min", type: "uint128" },
    { name: "hookData", type: "bytes" }
  ],
  // Swapping commands
  [6 /* SWAP_EXACT_IN_SINGLE */]: [
    { name: "swap", type: SWAP_EXACT_IN_SINGLE_STRUCT, subparser: 0 /* V4SwapExactInSingle */ }
  ],
  [7 /* SWAP_EXACT_IN */]: [{ name: "swap", type: SWAP_EXACT_IN_STRUCT, subparser: 1 /* V4SwapExactIn */ }],
  [8 /* SWAP_EXACT_OUT_SINGLE */]: [
    { name: "swap", type: SWAP_EXACT_OUT_SINGLE_STRUCT, subparser: 2 /* V4SwapExactOutSingle */ }
  ],
  [9 /* SWAP_EXACT_OUT */]: [{ name: "swap", type: SWAP_EXACT_OUT_STRUCT, subparser: 3 /* V4SwapExactOut */ }],
  // Payments commands
  [11 /* SETTLE */]: [
    { name: "currency", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "payerIsUser", type: "bool" }
  ],
  [12 /* SETTLE_ALL */]: [
    { name: "currency", type: "address" },
    { name: "maxAmount", type: "uint256" }
  ],
  [13 /* SETTLE_PAIR */]: [
    { name: "currency0", type: "address" },
    { name: "currency1", type: "address" }
  ],
  [14 /* TAKE */]: [
    { name: "currency", type: "address" },
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" }
  ],
  [15 /* TAKE_ALL */]: [
    { name: "currency", type: "address" },
    { name: "minAmount", type: "uint256" }
  ],
  [16 /* TAKE_PORTION */]: [
    { name: "currency", type: "address" },
    { name: "recipient", type: "address" },
    { name: "bips", type: "uint256" }
  ],
  [17 /* TAKE_PAIR */]: [
    { name: "currency0", type: "address" },
    { name: "currency1", type: "address" },
    { name: "recipient", type: "address" }
  ],
  [18 /* CLOSE_CURRENCY */]: [{ name: "currency", type: "address" }],
  [20 /* SWEEP */]: [
    { name: "currency", type: "address" },
    { name: "recipient", type: "address" }
  ],
  [22 /* UNWRAP */]: [{ name: "amount", type: "uint256" }]
};
var FULL_DELTA_AMOUNT = 0;
var V4Planner = class {
  constructor() {
    this.actions = EMPTY_BYTES;
    this.params = [];
  }
  addAction(type, parameters) {
    let command = createAction(type, parameters);
    this.params.push(command.encodedInput);
    this.actions = this.actions.concat(command.action.toString(16).padStart(2, "0"));
    return this;
  }
  addTrade(trade, slippageTolerance) {
    const exactOutput = trade.tradeType === 1 /* EXACT_OUTPUT */;
    if (exactOutput) invariant15(!!slippageTolerance, "ExactOut requires slippageTolerance");
    invariant15(trade.swaps.length === 1, "Only accepts Trades with 1 swap (must break swaps into individual trades)");
    const actionType = exactOutput ? 9 /* SWAP_EXACT_OUT */ : 7 /* SWAP_EXACT_IN */;
    const currencyIn = currencyAddress(trade.route.pathInput);
    const currencyOut = currencyAddress(trade.route.pathOutput);
    this.addAction(actionType, [
      exactOutput ? {
        currencyOut,
        path: encodeRouteToPath(trade.route, exactOutput),
        amountInMaximum: trade.maximumAmountIn(slippageTolerance ?? new Percent(0)).quotient.toString(),
        amountOut: trade.outputAmount.quotient.toString()
      } : {
        currencyIn,
        path: encodeRouteToPath(trade.route, exactOutput),
        amountIn: trade.inputAmount.quotient.toString(),
        amountOutMinimum: slippageTolerance ? trade.minimumAmountOut(slippageTolerance).quotient.toString() : 0
      }
    ]);
    return this;
  }
  addSettle(currency, payerIsUser, amount) {
    this.addAction(11 /* SETTLE */, [currencyAddress(currency), amount ?? FULL_DELTA_AMOUNT, payerIsUser]);
    return this;
  }
  addTake(currency, recipient, amount) {
    const takeAmount = amount ?? FULL_DELTA_AMOUNT;
    this.addAction(14 /* TAKE */, [currencyAddress(currency), recipient, takeAmount]);
    return this;
  }
  addUnwrap(amount) {
    this.addAction(22 /* UNWRAP */, [amount]);
    return this;
  }
  finalize() {
    return defaultAbiCoder.encode(["bytes", "bytes[]"], [this.actions, this.params]);
  }
};
function currencyAddress(currency) {
  return currency.isNative ? ADDRESS_ZERO : currency.wrapped.address;
}
function createAction(action, parameters) {
  const encodedInput = defaultAbiCoder.encode(
    V4_BASE_ACTIONS_ABI_DEFINITION[action].map((v) => v.type),
    parameters
  );
  return { action, encodedInput };
}

// src/v4/utils/currencyMap.ts
function toAddress(currency) {
  if (currency.isNative) return ADDRESS_ZERO;
  else return currency.wrapped.address;
}

// src/v4/utils/v4PositionPlanner.ts
var V4PositionPlanner = class extends V4Planner {
  // MINT_POSITION
  addMint(pool, tickLower, tickUpper, liquidity, amount0Max, amount1Max, owner, hookData = EMPTY_BYTES) {
    const inputs = [
      Pool.getPoolKey(pool.currency0, pool.currency1, pool.fee, pool.tickSpacing, pool.hooks),
      tickLower,
      tickUpper,
      liquidity.toString(),
      amount0Max.toString(),
      amount1Max.toString(),
      owner,
      hookData
    ];
    this.addAction(2 /* MINT_POSITION */, inputs);
  }
  // INCREASE_LIQUIDITY
  addIncrease(tokenId, liquidity, amount0Max, amount1Max, hookData = EMPTY_BYTES) {
    const inputs = [tokenId.toString(), liquidity.toString(), amount0Max.toString(), amount1Max.toString(), hookData];
    this.addAction(0 /* INCREASE_LIQUIDITY */, inputs);
  }
  // DECREASE_LIQUIDITY
  addDecrease(tokenId, liquidity, amount0Min, amount1Min, hookData = EMPTY_BYTES) {
    const inputs = [tokenId.toString(), liquidity.toString(), amount0Min.toString(), amount1Min.toString(), hookData];
    this.addAction(1 /* DECREASE_LIQUIDITY */, inputs);
  }
  // BURN_POSITION
  addBurn(tokenId, amount0Min, amount1Min, hookData = EMPTY_BYTES) {
    const inputs = [tokenId.toString(), amount0Min.toString(), amount1Min.toString(), hookData];
    this.addAction(3 /* BURN_POSITION */, inputs);
  }
  // SETTLE_PAIR
  addSettlePair(currency0, currency1) {
    const inputs = [toAddress(currency0), toAddress(currency1)];
    this.addAction(13 /* SETTLE_PAIR */, inputs);
  }
  // TAKE_PAIR
  addTakePair(currency0, currency1, recipient) {
    const inputs = [toAddress(currency0), toAddress(currency1), recipient];
    this.addAction(17 /* TAKE_PAIR */, inputs);
  }
  // SWEEP
  addSweep(currency, to) {
    const inputs = [toAddress(currency), to];
    this.addAction(20 /* SWEEP */, inputs);
  }
};
function toHex(bigintIsh) {
  const bigInt = JSBI13.BigInt(bigintIsh);
  let hex = bigInt.toString(16);
  if (hex.length % 2 !== 0) {
    hex = `0${hex}`;
  }
  return `0x${hex}`;
}
var V4BaseActionsParser = class _V4BaseActionsParser {
  static parseCalldata(calldata) {
    const [actions, inputs] = ethers.utils.defaultAbiCoder.decode(["bytes", "bytes[]"], calldata);
    const actionTypes = _V4BaseActionsParser.getActions(actions);
    return {
      actions: actionTypes.map((actionType, i) => {
        const abiDef = V4_BASE_ACTIONS_ABI_DEFINITION[actionType];
        const rawParams = ethers.utils.defaultAbiCoder.decode(
          abiDef.map((command) => command.type),
          inputs[i]
        );
        const params = rawParams.map((param, j) => {
          switch (abiDef[j].subparser) {
            case 0 /* V4SwapExactInSingle */:
              return {
                name: abiDef[j].name,
                value: parseV4ExactInSingle(param)
              };
            case 1 /* V4SwapExactIn */:
              return {
                name: abiDef[j].name,
                value: parseV4ExactIn(param)
              };
            case 2 /* V4SwapExactOutSingle */:
              return {
                name: abiDef[j].name,
                value: parseV4ExactOutSingle(param)
              };
            case 3 /* V4SwapExactOut */:
              return {
                name: abiDef[j].name,
                value: parseV4ExactOut(param)
              };
            case 4 /* PoolKey */:
              return {
                name: abiDef[j].name,
                value: parsePoolKey(param)
              };
            default:
              return {
                name: abiDef[j].name,
                value: param
              };
          }
        });
        return {
          actionName: Actions[actionType],
          actionType,
          params
        };
      })
    };
  }
  // parse command types from bytes string
  static getActions(actions) {
    const actionTypes = [];
    for (let i = 2; i < actions.length; i += 2) {
      const byte = actions.substring(i, i + 2);
      actionTypes.push(parseInt(byte, 16));
    }
    return actionTypes;
  }
};
function parsePoolKey(data) {
  const [currency0, currency1, fee, tickSpacing, hooks] = data;
  return {
    currency0,
    currency1,
    fee: parseInt(fee),
    tickSpacing: parseInt(tickSpacing),
    hooks
  };
}
function parsePathKey(data) {
  const [intermediateCurrency, fee, tickSpacing, hooks, hookData] = data;
  return {
    intermediateCurrency,
    fee: parseInt(fee),
    tickSpacing: parseInt(tickSpacing),
    hooks,
    hookData
  };
}
function parseV4ExactInSingle(data) {
  const [poolKey, zeroForOne, amountIn, amountOutMinimum, hookData] = data;
  const [currency0, currency1, fee, tickSpacing, hooks] = poolKey;
  return {
    poolKey: {
      currency0,
      currency1,
      fee,
      tickSpacing,
      hooks
    },
    zeroForOne,
    amountIn,
    amountOutMinimum,
    hookData
  };
}
function parseV4ExactIn(data) {
  const [currencyIn, path, amountIn, amountOutMinimum] = data;
  const paths = path.map((pathKey) => parsePathKey(pathKey));
  return {
    path: paths,
    currencyIn,
    amountIn,
    amountOutMinimum
  };
}
function parseV4ExactOutSingle(data) {
  const [poolKey, zeroForOne, amountOut, amountInMaximum, hookData] = data;
  const { currency0, currency1, fee, tickSpacing, hooks } = poolKey;
  return {
    poolKey: {
      currency0,
      currency1,
      fee,
      tickSpacing,
      hooks
    },
    zeroForOne,
    amountOut,
    amountInMaximum,
    hookData
  };
}
function parseV4ExactOut(data) {
  const [currencyOut, path, amountOut, amountInMaximum] = data;
  const paths = path.map((pathKey) => parsePathKey(pathKey));
  return {
    path: paths,
    currencyOut,
    amountOut,
    amountInMaximum
  };
}

// src/v4/actionConstants.ts
var MSG_SENDER = "0x0000000000000000000000000000000000000001";
var _Multicall = class _Multicall {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  static encodeMulticall(calldataList) {
    if (!Array.isArray(calldataList)) {
      calldataList = [calldataList];
    }
    return calldataList.length === 1 ? calldataList[0] : _Multicall.INTERFACE.encodeFunctionData("multicall", [calldataList]);
  }
  static decodeMulticall(encodedCalldata) {
    return _Multicall.INTERFACE.decodeFunctionData("multicall", encodedCalldata)[0];
  }
};
_Multicall.INTERFACE = new Interface(IMulticall.abi);
var Multicall = _Multicall;

// src/v4/utils/positionManagerAbi.ts
var positionManagerAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "_poolManager",
        type: "address",
        internalType: "contract IPoolManager"
      },
      {
        name: "_permit2",
        type: "address",
        internalType: "contract IAllowanceTransfer"
      },
      {
        name: "_unsubscribeGasLimit",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "_tokenDescriptor",
        type: "address",
        internalType: "contract IPositionDescriptor"
      },
      {
        name: "_weth9",
        type: "address",
        internalType: "contract IWETH9"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "receive",
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "DOMAIN_SEPARATOR",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "WETH9",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IWETH9"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      {
        name: "spender",
        type: "address",
        internalType: "address"
      },
      {
        name: "id",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getApproved",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getPoolAndPositionInfo",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "poolKey",
        type: "tuple",
        internalType: "struct PoolKey",
        components: [
          {
            name: "currency0",
            type: "address",
            internalType: "Currency"
          },
          {
            name: "currency1",
            type: "address",
            internalType: "Currency"
          },
          {
            name: "fee",
            type: "uint24",
            internalType: "uint24"
          },
          {
            name: "tickSpacing",
            type: "int24",
            internalType: "int24"
          },
          {
            name: "hooks",
            type: "address",
            internalType: "contract IHooks"
          }
        ]
      },
      {
        name: "info",
        type: "uint256",
        internalType: "PositionInfo"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getPositionLiquidity",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "liquidity",
        type: "uint128",
        internalType: "uint128"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "initializePool",
    inputs: [
      {
        name: "key",
        type: "tuple",
        internalType: "struct PoolKey",
        components: [
          {
            name: "currency0",
            type: "address",
            internalType: "Currency"
          },
          {
            name: "currency1",
            type: "address",
            internalType: "Currency"
          },
          {
            name: "fee",
            type: "uint24",
            internalType: "uint24"
          },
          {
            name: "tickSpacing",
            type: "int24",
            internalType: "int24"
          },
          {
            name: "hooks",
            type: "address",
            internalType: "contract IHooks"
          }
        ]
      },
      {
        name: "sqrtPriceX96",
        type: "uint160",
        internalType: "uint160"
      }
    ],
    outputs: [
      {
        name: "",
        type: "int24",
        internalType: "int24"
      }
    ],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "isApprovedForAll",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      },
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "modifyLiquidities",
    inputs: [
      {
        name: "unlockData",
        type: "bytes",
        internalType: "bytes"
      },
      {
        name: "deadline",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "modifyLiquiditiesWithoutUnlock",
    inputs: [
      {
        name: "actions",
        type: "bytes",
        internalType: "bytes"
      },
      {
        name: "params",
        type: "bytes[]",
        internalType: "bytes[]"
      }
    ],
    outputs: [],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "msgSender",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "multicall",
    inputs: [
      {
        name: "data",
        type: "bytes[]",
        internalType: "bytes[]"
      }
    ],
    outputs: [
      {
        name: "results",
        type: "bytes[]",
        internalType: "bytes[]"
      }
    ],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "nextTokenId",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "nonces",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address"
      },
      {
        name: "word",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "bitmap",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "ownerOf",
    inputs: [
      {
        name: "id",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "permit",
    inputs: [
      {
        name: "spender",
        type: "address",
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "deadline",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "nonce",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "signature",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    outputs: [],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "permit",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address"
      },
      {
        name: "permitSingle",
        type: "tuple",
        internalType: "struct IAllowanceTransfer.PermitSingle",
        components: [
          {
            name: "details",
            type: "tuple",
            internalType: "struct IAllowanceTransfer.PermitDetails",
            components: [
              {
                name: "token",
                type: "address",
                internalType: "address"
              },
              {
                name: "amount",
                type: "uint160",
                internalType: "uint160"
              },
              {
                name: "expiration",
                type: "uint48",
                internalType: "uint48"
              },
              {
                name: "nonce",
                type: "uint48",
                internalType: "uint48"
              }
            ]
          },
          {
            name: "spender",
            type: "address",
            internalType: "address"
          },
          {
            name: "sigDeadline",
            type: "uint256",
            internalType: "uint256"
          }
        ]
      },
      {
        name: "signature",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    outputs: [
      {
        name: "err",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "permit2",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IAllowanceTransfer"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "permitBatch",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address"
      },
      {
        name: "_permitBatch",
        type: "tuple",
        internalType: "struct IAllowanceTransfer.PermitBatch",
        components: [
          {
            name: "details",
            type: "tuple[]",
            internalType: "struct IAllowanceTransfer.PermitDetails[]",
            components: [
              {
                name: "token",
                type: "address",
                internalType: "address"
              },
              {
                name: "amount",
                type: "uint160",
                internalType: "uint160"
              },
              {
                name: "expiration",
                type: "uint48",
                internalType: "uint48"
              },
              {
                name: "nonce",
                type: "uint48",
                internalType: "uint48"
              }
            ]
          },
          {
            name: "spender",
            type: "address",
            internalType: "address"
          },
          {
            name: "sigDeadline",
            type: "uint256",
            internalType: "uint256"
          }
        ]
      },
      {
        name: "signature",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    outputs: [
      {
        name: "err",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "permitForAll",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address"
      },
      {
        name: "operator",
        type: "address",
        internalType: "address"
      },
      {
        name: "approved",
        type: "bool",
        internalType: "bool"
      },
      {
        name: "deadline",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "nonce",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "signature",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    outputs: [],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "poolKeys",
    inputs: [
      {
        name: "poolId",
        type: "bytes25",
        internalType: "bytes25"
      }
    ],
    outputs: [
      {
        name: "currency0",
        type: "address",
        internalType: "Currency"
      },
      {
        name: "currency1",
        type: "address",
        internalType: "Currency"
      },
      {
        name: "fee",
        type: "uint24",
        internalType: "uint24"
      },
      {
        name: "tickSpacing",
        type: "int24",
        internalType: "int24"
      },
      {
        name: "hooks",
        type: "address",
        internalType: "contract IHooks"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "poolManager",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IPoolManager"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "positionInfo",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "info",
        type: "uint256",
        internalType: "PositionInfo"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "revokeNonce",
    inputs: [
      {
        name: "nonce",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "safeTransferFrom",
    inputs: [
      {
        name: "from",
        type: "address",
        internalType: "address"
      },
      {
        name: "to",
        type: "address",
        internalType: "address"
      },
      {
        name: "id",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "safeTransferFrom",
    inputs: [
      {
        name: "from",
        type: "address",
        internalType: "address"
      },
      {
        name: "to",
        type: "address",
        internalType: "address"
      },
      {
        name: "id",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "data",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setApprovalForAll",
    inputs: [
      {
        name: "operator",
        type: "address",
        internalType: "address"
      },
      {
        name: "approved",
        type: "bool",
        internalType: "bool"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "subscribe",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "newSubscriber",
        type: "address",
        internalType: "address"
      },
      {
        name: "data",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    outputs: [],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "subscriber",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "subscriber",
        type: "address",
        internalType: "contract ISubscriber"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "supportsInterface",
    inputs: [
      {
        name: "interfaceId",
        type: "bytes4",
        internalType: "bytes4"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "tokenDescriptor",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IPositionDescriptor"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "tokenURI",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "transferFrom",
    inputs: [
      {
        name: "from",
        type: "address",
        internalType: "address"
      },
      {
        name: "to",
        type: "address",
        internalType: "address"
      },
      {
        name: "id",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "unlockCallback",
    inputs: [
      {
        name: "data",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "unsubscribe",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "unsubscribeGasLimit",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "event",
    name: "Approval",
    inputs: [
      {
        name: "owner",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "spender",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "id",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ApprovalForAll",
    inputs: [
      {
        name: "owner",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "operator",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "approved",
        type: "bool",
        indexed: false,
        internalType: "bool"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Subscription",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      },
      {
        name: "subscriber",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      {
        name: "from",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "to",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "id",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Unsubscription",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      },
      {
        name: "subscriber",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "error",
    name: "AlreadySubscribed",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "subscriber",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "BurnNotificationReverted",
    inputs: [
      {
        name: "subscriber",
        type: "address",
        internalType: "address"
      },
      {
        name: "reason",
        type: "bytes",
        internalType: "bytes"
      }
    ]
  },
  {
    type: "error",
    name: "ContractLocked",
    inputs: []
  },
  {
    type: "error",
    name: "DeadlinePassed",
    inputs: [
      {
        name: "deadline",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "DeltaNotNegative",
    inputs: [
      {
        name: "currency",
        type: "address",
        internalType: "Currency"
      }
    ]
  },
  {
    type: "error",
    name: "DeltaNotPositive",
    inputs: [
      {
        name: "currency",
        type: "address",
        internalType: "Currency"
      }
    ]
  },
  {
    type: "error",
    name: "GasLimitTooLow",
    inputs: []
  },
  {
    type: "error",
    name: "InputLengthMismatch",
    inputs: []
  },
  {
    type: "error",
    name: "InsufficientBalance",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidContractSignature",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidEthSender",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidSignature",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidSignatureLength",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidSigner",
    inputs: []
  },
  {
    type: "error",
    name: "MaximumAmountExceeded",
    inputs: [
      {
        name: "maximumAmount",
        type: "uint128",
        internalType: "uint128"
      },
      {
        name: "amountRequested",
        type: "uint128",
        internalType: "uint128"
      }
    ]
  },
  {
    type: "error",
    name: "MinimumAmountInsufficient",
    inputs: [
      {
        name: "minimumAmount",
        type: "uint128",
        internalType: "uint128"
      },
      {
        name: "amountReceived",
        type: "uint128",
        internalType: "uint128"
      }
    ]
  },
  {
    type: "error",
    name: "ModifyLiquidityNotificationReverted",
    inputs: [
      {
        name: "subscriber",
        type: "address",
        internalType: "address"
      },
      {
        name: "reason",
        type: "bytes",
        internalType: "bytes"
      }
    ]
  },
  {
    type: "error",
    name: "NoCodeSubscriber",
    inputs: []
  },
  {
    type: "error",
    name: "NoSelfPermit",
    inputs: []
  },
  {
    type: "error",
    name: "NonceAlreadyUsed",
    inputs: []
  },
  {
    type: "error",
    name: "NotApproved",
    inputs: [
      {
        name: "caller",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "NotPoolManager",
    inputs: []
  },
  {
    type: "error",
    name: "NotSubscribed",
    inputs: []
  },
  {
    type: "error",
    name: "PoolManagerMustBeLocked",
    inputs: []
  },
  {
    type: "error",
    name: "SignatureDeadlineExpired",
    inputs: []
  },
  {
    type: "error",
    name: "SubscriptionReverted",
    inputs: [
      {
        name: "subscriber",
        type: "address",
        internalType: "address"
      },
      {
        name: "reason",
        type: "bytes",
        internalType: "bytes"
      }
    ]
  },
  {
    type: "error",
    name: "TransferNotificationReverted",
    inputs: [
      {
        name: "subscriber",
        type: "address",
        internalType: "address"
      },
      {
        name: "reason",
        type: "bytes",
        internalType: "bytes"
      }
    ]
  },
  {
    type: "error",
    name: "Unauthorized",
    inputs: []
  },
  {
    type: "error",
    name: "UnsupportedAction",
    inputs: [
      {
        name: "action",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  }
];

// src/v4/PositionManager.ts
var NFT_PERMIT_TYPES = {
  Permit: [
    { name: "spender", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ]
};
function isMint(options) {
  return Object.keys(options).some((k) => k === "recipient");
}
function shouldCreatePool(options) {
  if (options.createPool) {
    invariant15(options.sqrtPriceX96 !== void 0, NO_SQRT_PRICE);
    return true;
  }
  return false;
}
var _V4PositionManager = class _V4PositionManager {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  /**
   * Public methods to encode method parameters for different actions on the PositionManager contract
   */
  static createCallParameters(poolKey, sqrtPriceX96) {
    return {
      calldata: this.encodeInitializePool(poolKey, sqrtPriceX96),
      value: toHex(0)
    };
  }
  static addCallParameters(position, options) {
    invariant15(JSBI13.greaterThan(position.liquidity, ZERO3), ZERO_LIQUIDITY);
    const calldataList = [];
    const planner = new V4PositionPlanner();
    if (isMint(options) && shouldCreatePool(options)) {
      calldataList.push(_V4PositionManager.encodeInitializePool(position.pool.poolKey, options.sqrtPriceX96));
    }
    invariant15(
      position.pool.currency0 === options.useNative || !position.pool.currency0.isNative && options.useNative === void 0,
      NATIVE_NOT_SET
    );
    const maximumAmounts = position.mintAmountsWithSlippage(options.slippageTolerance);
    const amount0Max = toHex(maximumAmounts.amount0);
    const amount1Max = toHex(maximumAmounts.amount1);
    if (options.batchPermit) {
      calldataList.push(
        _V4PositionManager.encodePermitBatch(
          options.batchPermit.owner,
          options.batchPermit.permitBatch,
          options.batchPermit.signature
        )
      );
    }
    if (isMint(options)) {
      const recipient = validateAndParseAddress(options.recipient);
      planner.addMint(
        position.pool,
        position.tickLower,
        position.tickUpper,
        position.liquidity,
        amount0Max,
        amount1Max,
        recipient,
        options.hookData
      );
    } else {
      planner.addIncrease(options.tokenId, position.liquidity, amount0Max, amount1Max, options.hookData);
    }
    let value = toHex(0);
    if (isMint(options) && options.migrate) {
      if (options.useNative) {
        planner.addUnwrap(OPEN_DELTA);
        planner.addSettle(position.pool.currency0, false);
        planner.addSettle(position.pool.currency1, false);
        planner.addSweep(position.pool.currency0.wrapped, options.recipient);
        planner.addSweep(position.pool.currency1, options.recipient);
      } else {
        planner.addSettle(position.pool.currency0, false);
        planner.addSettle(position.pool.currency1, false);
        planner.addSweep(position.pool.currency0, options.recipient);
        planner.addSweep(position.pool.currency1, options.recipient);
      }
    } else {
      planner.addSettlePair(position.pool.currency0, position.pool.currency1);
      if (options.useNative) {
        value = toHex(amount0Max);
        planner.addSweep(position.pool.currency0, MSG_SENDER);
      }
    }
    calldataList.push(_V4PositionManager.encodeModifyLiquidities(planner.finalize(), options.deadline));
    return {
      calldata: Multicall.encodeMulticall(calldataList),
      value
    };
  }
  /**
   * Produces the calldata for completely or partially exiting a position
   * @param position The position to exit
   * @param options Additional information necessary for generating the calldata
   * @returns The call parameters
   */
  static removeCallParameters(position, options) {
    const calldataList = [];
    const planner = new V4PositionPlanner();
    const tokenId = toHex(options.tokenId);
    if (options.burnToken) {
      invariant15(options.liquidityPercentage.equalTo(ONE3), CANNOT_BURN);
      if (options.permit) {
        calldataList.push(
          _V4PositionManager.encodeERC721Permit(
            options.permit.spender,
            options.permit.tokenId,
            options.permit.deadline,
            options.permit.nonce,
            options.permit.signature
          )
        );
      }
      const { amount0: amount0Min, amount1: amount1Min } = position.burnAmountsWithSlippage(options.slippageTolerance);
      planner.addBurn(tokenId, amount0Min, amount1Min, options.hookData);
    } else {
      const partialPosition = new Position({
        pool: position.pool,
        liquidity: options.liquidityPercentage.multiply(position.liquidity).quotient,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper
      });
      invariant15(JSBI13.greaterThan(partialPosition.liquidity, ZERO3), ZERO_LIQUIDITY);
      const { amount0: amount0Min, amount1: amount1Min } = partialPosition.burnAmountsWithSlippage(
        options.slippageTolerance
      );
      planner.addDecrease(
        tokenId,
        partialPosition.liquidity.toString(),
        amount0Min.toString(),
        amount1Min.toString(),
        options.hookData ?? EMPTY_BYTES
      );
    }
    planner.addTakePair(position.pool.currency0, position.pool.currency1, MSG_SENDER);
    calldataList.push(_V4PositionManager.encodeModifyLiquidities(planner.finalize(), options.deadline));
    return {
      calldata: Multicall.encodeMulticall(calldataList),
      value: toHex(0)
    };
  }
  /**
   * Produces the calldata for collecting fees from a position
   * @param position The position to collect fees from
   * @param options Additional information necessary for generating the calldata
   * @returns The call parameters
   */
  static collectCallParameters(position, options) {
    const calldataList = [];
    const planner = new V4PositionPlanner();
    const tokenId = toHex(options.tokenId);
    const recipient = validateAndParseAddress(options.recipient);
    planner.addDecrease(tokenId, "0", "0", "0", options.hookData);
    planner.addTakePair(position.pool.currency0, position.pool.currency1, recipient);
    calldataList.push(_V4PositionManager.encodeModifyLiquidities(planner.finalize(), options.deadline));
    return {
      calldata: Multicall.encodeMulticall(calldataList),
      value: toHex(0)
    };
  }
  // Initialize a pool
  static encodeInitializePool(poolKey, sqrtPriceX96) {
    return _V4PositionManager.INTERFACE.encodeFunctionData("initializePool" /* INITIALIZE_POOL */, [
      poolKey,
      sqrtPriceX96.toString()
    ]);
  }
  // Encode a modify liquidities call
  static encodeModifyLiquidities(unlockData, deadline) {
    return _V4PositionManager.INTERFACE.encodeFunctionData("modifyLiquidities" /* MODIFY_LIQUIDITIES */, [unlockData, deadline]);
  }
  // Encode a permit batch call
  static encodePermitBatch(owner, permitBatch, signature) {
    return _V4PositionManager.INTERFACE.encodeFunctionData("0x002a3e3a" /* PERMIT_BATCH */, [
      owner,
      permitBatch,
      signature
    ]);
  }
  // Encode a ERC721Permit permit call
  static encodeERC721Permit(spender, tokenId, deadline, nonce, signature) {
    return _V4PositionManager.INTERFACE.encodeFunctionData("0x0f5730f1" /* ERC721PERMIT_PERMIT */, [
      spender,
      tokenId,
      deadline,
      nonce,
      signature
    ]);
  }
  // Prepare the params for an EIP712 signTypedData request
  static getPermitData(permit, positionManagerAddress, chainId) {
    return {
      domain: {
        name: "Uniswap V4 Positions NFT",
        chainId,
        verifyingContract: positionManagerAddress
      },
      types: NFT_PERMIT_TYPES,
      values: permit
    };
  }
};
_V4PositionManager.INTERFACE = new Interface(positionManagerAbi);
var V4PositionManager = _V4PositionManager;

export { Actions, DYNAMIC_FEE_FLAG, Hook, HookOptions, Pool, Position, Route, Subparser, Trade, V4BaseActionsParser, V4Planner, V4PositionManager, V4PositionPlanner, V4_BASE_ACTIONS_ABI_DEFINITION, amountWithPathCurrency, encodeRouteToPath, getPathCurrency, hookFlagIndex, priceToClosestTick, sortsBefore, tickToPrice, toAddress, toHex, tradeComparator };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map