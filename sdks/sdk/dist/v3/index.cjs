'use strict';

var JSBI13 = require('jsbi');
var invariant16 = require('tiny-invariant');
var _Decimal = require('decimal.js-light');
var _Big = require('big.js');
var toFormat = require('toformat');
var address = require('@ethersproject/address');
var bytes = require('@ethersproject/bytes');
var keccak256 = require('@ethersproject/keccak256');
var strings = require('@ethersproject/strings');
var abi = require('@ethersproject/abi');
var solidity = require('@ethersproject/solidity');
var IMulticall = require('@uniswap/v3-periphery/artifacts/contracts/interfaces/IMulticall.sol/IMulticall.json');
var INonfungiblePositionManager = require('@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json');
var ISelfPermit = require('@uniswap/v3-periphery/artifacts/contracts/interfaces/ISelfPermit.sol/ISelfPermit.json');
var IPeripheryPaymentsWithFee = require('@uniswap/v3-periphery/artifacts/contracts/interfaces/IPeripheryPaymentsWithFee.sol/IPeripheryPaymentsWithFee.json');
var IQuoter = require('@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json');
var IQuoterV2 = require('@uniswap/swap-router-contracts/artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json');
var IUniswapV3Staker = require('@uniswap/v3-staker/artifacts/contracts/UniswapV3Staker.sol/UniswapV3Staker.json');
var ISwapRouter = require('@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var JSBI13__default = /*#__PURE__*/_interopDefault(JSBI13);
var invariant16__default = /*#__PURE__*/_interopDefault(invariant16);
var _Decimal__default = /*#__PURE__*/_interopDefault(_Decimal);
var _Big__default = /*#__PURE__*/_interopDefault(_Big);
var toFormat__default = /*#__PURE__*/_interopDefault(toFormat);
var IMulticall__default = /*#__PURE__*/_interopDefault(IMulticall);
var INonfungiblePositionManager__default = /*#__PURE__*/_interopDefault(INonfungiblePositionManager);
var ISelfPermit__default = /*#__PURE__*/_interopDefault(ISelfPermit);
var IPeripheryPaymentsWithFee__default = /*#__PURE__*/_interopDefault(IPeripheryPaymentsWithFee);
var IQuoter__default = /*#__PURE__*/_interopDefault(IQuoter);
var IQuoterV2__default = /*#__PURE__*/_interopDefault(IQuoterV2);
var IUniswapV3Staker__default = /*#__PURE__*/_interopDefault(IUniswapV3Staker);
var ISwapRouter__default = /*#__PURE__*/_interopDefault(ISwapRouter);

// src/core/constants.ts
var MaxUint256 = JSBI13__default.default.BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
var RoundingMode = {
  RoundDown: 0,
  RoundHalfUp: 1,
  RoundUp: 3
};
var Decimal = toFormat__default.default(_Decimal__default.default);
var Big = toFormat__default.default(_Big__default.default);
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
  constructor(numerator, denominator = JSBI13__default.default.BigInt(1)) {
    this.numerator = JSBI13__default.default.BigInt(numerator);
    this.denominator = JSBI13__default.default.BigInt(denominator);
  }
  static tryParseFraction(fractionish) {
    if (fractionish instanceof JSBI13__default.default || typeof fractionish === "number" || typeof fractionish === "string")
      return new _Fraction(fractionish);
    if ("numerator" in fractionish && "denominator" in fractionish) return fractionish;
    throw new Error("Could not parse fraction");
  }
  // performs floor division
  get quotient() {
    return JSBI13__default.default.divide(this.numerator, this.denominator);
  }
  // remainder after floor division
  get remainder() {
    return new _Fraction(JSBI13__default.default.remainder(this.numerator, this.denominator), this.denominator);
  }
  invert() {
    return new _Fraction(this.denominator, this.numerator);
  }
  add(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    if (JSBI13__default.default.equal(this.denominator, otherParsed.denominator)) {
      return new _Fraction(JSBI13__default.default.add(this.numerator, otherParsed.numerator), this.denominator);
    }
    return new _Fraction(
      JSBI13__default.default.add(
        JSBI13__default.default.multiply(this.numerator, otherParsed.denominator),
        JSBI13__default.default.multiply(otherParsed.numerator, this.denominator)
      ),
      JSBI13__default.default.multiply(this.denominator, otherParsed.denominator)
    );
  }
  subtract(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    if (JSBI13__default.default.equal(this.denominator, otherParsed.denominator)) {
      return new _Fraction(JSBI13__default.default.subtract(this.numerator, otherParsed.numerator), this.denominator);
    }
    return new _Fraction(
      JSBI13__default.default.subtract(
        JSBI13__default.default.multiply(this.numerator, otherParsed.denominator),
        JSBI13__default.default.multiply(otherParsed.numerator, this.denominator)
      ),
      JSBI13__default.default.multiply(this.denominator, otherParsed.denominator)
    );
  }
  lessThan(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    return JSBI13__default.default.lessThan(
      JSBI13__default.default.multiply(this.numerator, otherParsed.denominator),
      JSBI13__default.default.multiply(otherParsed.numerator, this.denominator)
    );
  }
  equalTo(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    return JSBI13__default.default.equal(
      JSBI13__default.default.multiply(this.numerator, otherParsed.denominator),
      JSBI13__default.default.multiply(otherParsed.numerator, this.denominator)
    );
  }
  greaterThan(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    return JSBI13__default.default.greaterThan(
      JSBI13__default.default.multiply(this.numerator, otherParsed.denominator),
      JSBI13__default.default.multiply(otherParsed.numerator, this.denominator)
    );
  }
  multiply(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    return new _Fraction(
      JSBI13__default.default.multiply(this.numerator, otherParsed.numerator),
      JSBI13__default.default.multiply(this.denominator, otherParsed.denominator)
    );
  }
  divide(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    return new _Fraction(
      JSBI13__default.default.multiply(this.numerator, otherParsed.denominator),
      JSBI13__default.default.multiply(this.denominator, otherParsed.numerator)
    );
  }
  toSignificant(significantDigits, format = { groupSeparator: "" }, rounding = 1 /* ROUND_HALF_UP */) {
    invariant16__default.default(Number.isInteger(significantDigits), `${significantDigits} is not an integer.`);
    invariant16__default.default(significantDigits > 0, `${significantDigits} is not positive.`);
    Decimal.set({ precision: significantDigits + 1, rounding: toSignificantRounding[rounding] });
    const quotient = new Decimal(this.numerator.toString()).div(this.denominator.toString()).toSignificantDigits(significantDigits);
    return quotient.toFormat(quotient.decimalPlaces(), format);
  }
  toFixed(decimalPlaces, format = { groupSeparator: "" }, rounding = 1 /* ROUND_HALF_UP */) {
    invariant16__default.default(Number.isInteger(decimalPlaces), `${decimalPlaces} is not an integer.`);
    invariant16__default.default(decimalPlaces >= 0, `${decimalPlaces} is negative.`);
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
var Big2 = toFormat__default.default(_Big__default.default);
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
    invariant16__default.default(JSBI13__default.default.lessThanOrEqual(this.quotient, MaxUint256), "AMOUNT");
    this.currency = currency;
    this.decimalScale = JSBI13__default.default.exponentiate(JSBI13__default.default.BigInt(10), JSBI13__default.default.BigInt(currency.decimals));
  }
  add(other) {
    invariant16__default.default(this.currency.equals(other.currency), "CURRENCY");
    const added = super.add(other);
    return _CurrencyAmount.fromFractionalAmount(this.currency, added.numerator, added.denominator);
  }
  subtract(other) {
    invariant16__default.default(this.currency.equals(other.currency), "CURRENCY");
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
    invariant16__default.default(decimalPlaces <= this.currency.decimals, "DECIMALS");
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
var ONE_HUNDRED = new Fraction(JSBI13__default.default.BigInt(100));
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
      JSBI13__default.default.exponentiate(JSBI13__default.default.BigInt(10), JSBI13__default.default.BigInt(baseCurrency.decimals)),
      JSBI13__default.default.exponentiate(JSBI13__default.default.BigInt(10), JSBI13__default.default.BigInt(quoteCurrency.decimals))
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
    invariant16__default.default(this.quoteCurrency.equals(other.baseCurrency), "TOKEN");
    const fraction = super.multiply(other);
    return new _Price(this.baseCurrency, other.quoteCurrency, fraction.denominator, fraction.numerator);
  }
  /**
   * Return the amount of quote currency corresponding to a given amount of the base currency
   * @param currencyAmount the amount of base currency to quote against the price
   */
  quote(currencyAmount) {
    invariant16__default.default(currencyAmount.currency.equals(this.baseCurrency), "TOKEN");
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
function validateAndParseAddress(address$1) {
  try {
    return address.getAddress(address$1);
  } catch (error) {
    throw new Error(`${address$1} is not a valid address.`);
  }
}
function computeZksyncCreate2Address(sender, bytecodeHash, salt, input = "0x") {
  const prefix = keccak256.keccak256(strings.toUtf8Bytes("zksyncCreate2"));
  const inputHash = keccak256.keccak256(input);
  const addressBytes = keccak256.keccak256(bytes.concat([prefix, bytes.hexZeroPad(sender, 32), salt, bytecodeHash, inputHash])).slice(26);
  return address.getAddress(addressBytes);
}
function sortedInsert(items, add, maxSize, comparator) {
  invariant16__default.default(maxSize > 0, "MAX_SIZE_ZERO");
  invariant16__default.default(items.length <= maxSize, "ITEMS_SIZE");
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
var MAX_SAFE_INTEGER = JSBI13__default.default.BigInt(Number.MAX_SAFE_INTEGER);
var ZERO = JSBI13__default.default.BigInt(0);
var ONE = JSBI13__default.default.BigInt(1);
var TWO = JSBI13__default.default.BigInt(2);
function sqrt(value) {
  invariant16__default.default(JSBI13__default.default.greaterThanOrEqual(value, ZERO), "NEGATIVE");
  if (JSBI13__default.default.lessThan(value, MAX_SAFE_INTEGER)) {
    return JSBI13__default.default.BigInt(Math.floor(Math.sqrt(JSBI13__default.default.toNumber(value))));
  }
  let z;
  let x;
  z = value;
  x = JSBI13__default.default.add(JSBI13__default.default.divide(value, TWO), ONE);
  while (JSBI13__default.default.lessThan(x, z)) {
    z = x;
    x = JSBI13__default.default.divide(JSBI13__default.default.add(JSBI13__default.default.divide(value, x), x), TWO);
  }
  return z;
}

// src/v3/constants.ts
var FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
var ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
var POOL_INIT_CODE_HASH = "0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54";
function poolInitCodeHash(chainId) {
  switch (chainId) {
    case 324 /* ZKSYNC */:
      return "0x010013f177ea1fcbc4520f9a3ca7cd2d1d77959e05aa66484027cb38e712aeed";
    default:
      return POOL_INIT_CODE_HASH;
  }
}
var FeeAmount = /* @__PURE__ */ ((FeeAmount4) => {
  FeeAmount4[FeeAmount4["LOWEST"] = 100] = "LOWEST";
  FeeAmount4[FeeAmount4["LOW_200"] = 200] = "LOW_200";
  FeeAmount4[FeeAmount4["LOW_300"] = 300] = "LOW_300";
  FeeAmount4[FeeAmount4["LOW_400"] = 400] = "LOW_400";
  FeeAmount4[FeeAmount4["LOW"] = 500] = "LOW";
  FeeAmount4[FeeAmount4["MEDIUM"] = 3e3] = "MEDIUM";
  FeeAmount4[FeeAmount4["HIGH"] = 1e4] = "HIGH";
  return FeeAmount4;
})(FeeAmount || {});
var TICK_SPACINGS = {
  [100 /* LOWEST */]: 1,
  [200 /* LOW_200 */]: 4,
  [300 /* LOW_300 */]: 6,
  [400 /* LOW_400 */]: 8,
  [500 /* LOW */]: 10,
  [3e3 /* MEDIUM */]: 60,
  [1e4 /* HIGH */]: 200
};
var NEGATIVE_ONE = JSBI13__default.default.BigInt(-1);
var ZERO2 = JSBI13__default.default.BigInt(0);
var ONE2 = JSBI13__default.default.BigInt(1);
var Q96 = JSBI13__default.default.exponentiate(JSBI13__default.default.BigInt(2), JSBI13__default.default.BigInt(96));
var Q192 = JSBI13__default.default.exponentiate(Q96, JSBI13__default.default.BigInt(2));
function computePoolAddress({
  factoryAddress,
  tokenA,
  tokenB,
  fee,
  initCodeHashManualOverride,
  chainId
}) {
  const [token0, token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA];
  const salt = solidity.keccak256(
    ["bytes"],
    [abi.defaultAbiCoder.encode(["address", "address", "uint24"], [token0.address, token1.address, fee])]
  );
  const initCodeHash = initCodeHashManualOverride ?? poolInitCodeHash(chainId);
  switch (chainId) {
    case 324 /* ZKSYNC */:
      return computeZksyncCreate2Address(factoryAddress, initCodeHash, salt);
    default:
      return address.getCreate2Address(factoryAddress, salt, initCodeHash);
  }
}
var FullMath = class {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  static mulDivRoundingUp(a, b, denominator) {
    const product = JSBI13__default.default.multiply(a, b);
    let result = JSBI13__default.default.divide(product, denominator);
    if (JSBI13__default.default.notEqual(JSBI13__default.default.remainder(product, denominator), ZERO2)) result = JSBI13__default.default.add(result, ONE2);
    return result;
  }
};
var MaxUint160 = JSBI13__default.default.subtract(JSBI13__default.default.exponentiate(JSBI13__default.default.BigInt(2), JSBI13__default.default.BigInt(160)), ONE2);
function multiplyIn256(x, y) {
  const product = JSBI13__default.default.multiply(x, y);
  return JSBI13__default.default.bitwiseAnd(product, MaxUint256);
}
function addIn256(x, y) {
  const sum = JSBI13__default.default.add(x, y);
  return JSBI13__default.default.bitwiseAnd(sum, MaxUint256);
}
var SqrtPriceMath = class {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  static getAmount0Delta(sqrtRatioAX96, sqrtRatioBX96, liquidity, roundUp) {
    if (JSBI13__default.default.greaterThan(sqrtRatioAX96, sqrtRatioBX96)) {
      [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }
    const numerator1 = JSBI13__default.default.leftShift(liquidity, JSBI13__default.default.BigInt(96));
    const numerator2 = JSBI13__default.default.subtract(sqrtRatioBX96, sqrtRatioAX96);
    return roundUp ? FullMath.mulDivRoundingUp(FullMath.mulDivRoundingUp(numerator1, numerator2, sqrtRatioBX96), ONE2, sqrtRatioAX96) : JSBI13__default.default.divide(JSBI13__default.default.divide(JSBI13__default.default.multiply(numerator1, numerator2), sqrtRatioBX96), sqrtRatioAX96);
  }
  static getAmount1Delta(sqrtRatioAX96, sqrtRatioBX96, liquidity, roundUp) {
    if (JSBI13__default.default.greaterThan(sqrtRatioAX96, sqrtRatioBX96)) {
      [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }
    return roundUp ? FullMath.mulDivRoundingUp(liquidity, JSBI13__default.default.subtract(sqrtRatioBX96, sqrtRatioAX96), Q96) : JSBI13__default.default.divide(JSBI13__default.default.multiply(liquidity, JSBI13__default.default.subtract(sqrtRatioBX96, sqrtRatioAX96)), Q96);
  }
  static getNextSqrtPriceFromInput(sqrtPX96, liquidity, amountIn, zeroForOne) {
    invariant16__default.default(JSBI13__default.default.greaterThan(sqrtPX96, ZERO2));
    invariant16__default.default(JSBI13__default.default.greaterThan(liquidity, ZERO2));
    return zeroForOne ? this.getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amountIn, true) : this.getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amountIn, true);
  }
  static getNextSqrtPriceFromOutput(sqrtPX96, liquidity, amountOut, zeroForOne) {
    invariant16__default.default(JSBI13__default.default.greaterThan(sqrtPX96, ZERO2));
    invariant16__default.default(JSBI13__default.default.greaterThan(liquidity, ZERO2));
    return zeroForOne ? this.getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amountOut, false) : this.getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amountOut, false);
  }
  static getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amount, add) {
    if (JSBI13__default.default.equal(amount, ZERO2)) return sqrtPX96;
    const numerator1 = JSBI13__default.default.leftShift(liquidity, JSBI13__default.default.BigInt(96));
    if (add) {
      let product = multiplyIn256(amount, sqrtPX96);
      if (JSBI13__default.default.equal(JSBI13__default.default.divide(product, amount), sqrtPX96)) {
        const denominator = addIn256(numerator1, product);
        if (JSBI13__default.default.greaterThanOrEqual(denominator, numerator1)) {
          return FullMath.mulDivRoundingUp(numerator1, sqrtPX96, denominator);
        }
      }
      return FullMath.mulDivRoundingUp(numerator1, ONE2, JSBI13__default.default.add(JSBI13__default.default.divide(numerator1, sqrtPX96), amount));
    } else {
      let product = multiplyIn256(amount, sqrtPX96);
      invariant16__default.default(JSBI13__default.default.equal(JSBI13__default.default.divide(product, amount), sqrtPX96));
      invariant16__default.default(JSBI13__default.default.greaterThan(numerator1, product));
      const denominator = JSBI13__default.default.subtract(numerator1, product);
      return FullMath.mulDivRoundingUp(numerator1, sqrtPX96, denominator);
    }
  }
  static getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amount, add) {
    if (add) {
      const quotient = JSBI13__default.default.lessThanOrEqual(amount, MaxUint160) ? JSBI13__default.default.divide(JSBI13__default.default.leftShift(amount, JSBI13__default.default.BigInt(96)), liquidity) : JSBI13__default.default.divide(JSBI13__default.default.multiply(amount, Q96), liquidity);
      return JSBI13__default.default.add(sqrtPX96, quotient);
    } else {
      const quotient = FullMath.mulDivRoundingUp(amount, Q96, liquidity);
      invariant16__default.default(JSBI13__default.default.greaterThan(sqrtPX96, quotient));
      return JSBI13__default.default.subtract(sqrtPX96, quotient);
    }
  }
};

// src/v3/utils/swapMath.ts
var MAX_FEE = JSBI13__default.default.exponentiate(JSBI13__default.default.BigInt(10), JSBI13__default.default.BigInt(6));
var SwapMath = class {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  static computeSwapStep(sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity, amountRemaining, feePips) {
    const returnValues = {};
    feePips = JSBI13__default.default.BigInt(feePips);
    const zeroForOne = JSBI13__default.default.greaterThanOrEqual(sqrtRatioCurrentX96, sqrtRatioTargetX96);
    const exactIn = JSBI13__default.default.greaterThanOrEqual(amountRemaining, ZERO2);
    if (exactIn) {
      const amountRemainingLessFee = JSBI13__default.default.divide(
        JSBI13__default.default.multiply(amountRemaining, JSBI13__default.default.subtract(MAX_FEE, feePips)),
        MAX_FEE
      );
      returnValues.amountIn = zeroForOne ? SqrtPriceMath.getAmount0Delta(sqrtRatioTargetX96, sqrtRatioCurrentX96, liquidity, true) : SqrtPriceMath.getAmount1Delta(sqrtRatioCurrentX96, sqrtRatioTargetX96, liquidity, true);
      if (JSBI13__default.default.greaterThanOrEqual(amountRemainingLessFee, returnValues.amountIn)) {
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
      if (JSBI13__default.default.greaterThanOrEqual(JSBI13__default.default.multiply(amountRemaining, NEGATIVE_ONE), returnValues.amountOut)) {
        returnValues.sqrtRatioNextX96 = sqrtRatioTargetX96;
      } else {
        returnValues.sqrtRatioNextX96 = SqrtPriceMath.getNextSqrtPriceFromOutput(
          sqrtRatioCurrentX96,
          liquidity,
          JSBI13__default.default.multiply(amountRemaining, NEGATIVE_ONE),
          zeroForOne
        );
      }
    }
    const max = JSBI13__default.default.equal(sqrtRatioTargetX96, returnValues.sqrtRatioNextX96);
    if (zeroForOne) {
      returnValues.amountIn = max && exactIn ? returnValues.amountIn : SqrtPriceMath.getAmount0Delta(returnValues.sqrtRatioNextX96, sqrtRatioCurrentX96, liquidity, true);
      returnValues.amountOut = max && !exactIn ? returnValues.amountOut : SqrtPriceMath.getAmount1Delta(returnValues.sqrtRatioNextX96, sqrtRatioCurrentX96, liquidity, false);
    } else {
      returnValues.amountIn = max && exactIn ? returnValues.amountIn : SqrtPriceMath.getAmount1Delta(sqrtRatioCurrentX96, returnValues.sqrtRatioNextX96, liquidity, true);
      returnValues.amountOut = max && !exactIn ? returnValues.amountOut : SqrtPriceMath.getAmount0Delta(sqrtRatioCurrentX96, returnValues.sqrtRatioNextX96, liquidity, false);
    }
    if (!exactIn && JSBI13__default.default.greaterThan(returnValues.amountOut, JSBI13__default.default.multiply(amountRemaining, NEGATIVE_ONE))) {
      returnValues.amountOut = JSBI13__default.default.multiply(amountRemaining, NEGATIVE_ONE);
    }
    if (exactIn && JSBI13__default.default.notEqual(returnValues.sqrtRatioNextX96, sqrtRatioTargetX96)) {
      returnValues.feeAmount = JSBI13__default.default.subtract(amountRemaining, returnValues.amountIn);
    } else {
      returnValues.feeAmount = FullMath.mulDivRoundingUp(
        returnValues.amountIn,
        feePips,
        JSBI13__default.default.subtract(MAX_FEE, feePips)
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
    if (JSBI13__default.default.lessThan(y, ZERO2)) {
      return JSBI13__default.default.subtract(x, JSBI13__default.default.multiply(y, NEGATIVE_ONE));
    } else {
      return JSBI13__default.default.add(x, y);
    }
  }
};
var TWO2 = JSBI13__default.default.BigInt(2);
var POWERS_OF_2 = [128, 64, 32, 16, 8, 4, 2, 1].map((pow) => [
  pow,
  JSBI13__default.default.exponentiate(TWO2, JSBI13__default.default.BigInt(pow))
]);
function mostSignificantBit(x) {
  invariant16__default.default(JSBI13__default.default.greaterThan(x, ZERO2), "ZERO");
  invariant16__default.default(JSBI13__default.default.lessThanOrEqual(x, MaxUint256), "MAX");
  let msb = 0;
  for (const [power, min] of POWERS_OF_2) {
    if (JSBI13__default.default.greaterThanOrEqual(x, min)) {
      x = JSBI13__default.default.signedRightShift(x, JSBI13__default.default.BigInt(power));
      msb += power;
    }
  }
  return msb;
}

// src/v3/utils/tickMath.ts
function mulShift(val, mulBy) {
  return JSBI13__default.default.signedRightShift(JSBI13__default.default.multiply(val, JSBI13__default.default.BigInt(mulBy)), JSBI13__default.default.BigInt(128));
}
var Q32 = JSBI13__default.default.exponentiate(JSBI13__default.default.BigInt(2), JSBI13__default.default.BigInt(32));
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
    invariant16__default.default(tick >= _TickMath.MIN_TICK && tick <= _TickMath.MAX_TICK && Number.isInteger(tick), "TICK");
    const absTick = tick < 0 ? tick * -1 : tick;
    let ratio = (absTick & 1) !== 0 ? JSBI13__default.default.BigInt("0xfffcb933bd6fad37aa2d162d1a594001") : JSBI13__default.default.BigInt("0x100000000000000000000000000000000");
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
    if (tick > 0) ratio = JSBI13__default.default.divide(MaxUint256, ratio);
    return JSBI13__default.default.greaterThan(JSBI13__default.default.remainder(ratio, Q32), ZERO2) ? JSBI13__default.default.add(JSBI13__default.default.divide(ratio, Q32), ONE2) : JSBI13__default.default.divide(ratio, Q32);
  }
  /**
   * Returns the tick corresponding to a given sqrt ratio, s.t. #getSqrtRatioAtTick(tick) <= sqrtRatioX96
   * and #getSqrtRatioAtTick(tick + 1) > sqrtRatioX96
   * @param sqrtRatioX96 the sqrt ratio as a Q64.96 for which to compute the tick
   */
  static getTickAtSqrtRatio(sqrtRatioX96) {
    invariant16__default.default(
      JSBI13__default.default.greaterThanOrEqual(sqrtRatioX96, _TickMath.MIN_SQRT_RATIO) && JSBI13__default.default.lessThan(sqrtRatioX96, _TickMath.MAX_SQRT_RATIO),
      "SQRT_RATIO"
    );
    const sqrtRatioX128 = JSBI13__default.default.leftShift(sqrtRatioX96, JSBI13__default.default.BigInt(32));
    const msb = mostSignificantBit(sqrtRatioX128);
    let r;
    if (JSBI13__default.default.greaterThanOrEqual(JSBI13__default.default.BigInt(msb), JSBI13__default.default.BigInt(128))) {
      r = JSBI13__default.default.signedRightShift(sqrtRatioX128, JSBI13__default.default.BigInt(msb - 127));
    } else {
      r = JSBI13__default.default.leftShift(sqrtRatioX128, JSBI13__default.default.BigInt(127 - msb));
    }
    let log_2 = JSBI13__default.default.leftShift(JSBI13__default.default.subtract(JSBI13__default.default.BigInt(msb), JSBI13__default.default.BigInt(128)), JSBI13__default.default.BigInt(64));
    for (let i = 0; i < 14; i++) {
      r = JSBI13__default.default.signedRightShift(JSBI13__default.default.multiply(r, r), JSBI13__default.default.BigInt(127));
      const f = JSBI13__default.default.signedRightShift(r, JSBI13__default.default.BigInt(128));
      log_2 = JSBI13__default.default.bitwiseOr(log_2, JSBI13__default.default.leftShift(f, JSBI13__default.default.BigInt(63 - i)));
      r = JSBI13__default.default.signedRightShift(r, f);
    }
    const log_sqrt10001 = JSBI13__default.default.multiply(log_2, JSBI13__default.default.BigInt("255738958999603826347141"));
    const tickLow = JSBI13__default.default.toNumber(
      JSBI13__default.default.signedRightShift(
        JSBI13__default.default.subtract(log_sqrt10001, JSBI13__default.default.BigInt("3402992956809132418596140100660247210")),
        JSBI13__default.default.BigInt(128)
      )
    );
    const tickHigh = JSBI13__default.default.toNumber(
      JSBI13__default.default.signedRightShift(
        JSBI13__default.default.add(log_sqrt10001, JSBI13__default.default.BigInt("291339464771989622907027621153398088495")),
        JSBI13__default.default.BigInt(128)
      )
    );
    return tickLow === tickHigh ? tickLow : JSBI13__default.default.lessThanOrEqual(_TickMath.getSqrtRatioAtTick(tickHigh), sqrtRatioX96) ? tickHigh : tickLow;
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
_TickMath.MIN_SQRT_RATIO = JSBI13__default.default.BigInt("4295128739");
/**
 * The sqrt ratio corresponding to the maximum tick that could be used on any pool.
 */
_TickMath.MAX_SQRT_RATIO = JSBI13__default.default.BigInt("1461446703485210103287273052203988822378723970342");
var TickMath = _TickMath;

// src/v3/utils/v3swap.ts
async function v3Swap(fee, sqrtRatioX96, tickCurrent, liquidity, tickSpacing, tickDataProvider, zeroForOne, amountSpecified, sqrtPriceLimitX96) {
  if (!sqrtPriceLimitX96)
    sqrtPriceLimitX96 = zeroForOne ? JSBI13__default.default.add(TickMath.MIN_SQRT_RATIO, ONE2) : JSBI13__default.default.subtract(TickMath.MAX_SQRT_RATIO, ONE2);
  if (zeroForOne) {
    invariant16__default.default(JSBI13__default.default.greaterThan(sqrtPriceLimitX96, TickMath.MIN_SQRT_RATIO), "RATIO_MIN");
    invariant16__default.default(JSBI13__default.default.lessThan(sqrtPriceLimitX96, sqrtRatioX96), "RATIO_CURRENT");
  } else {
    invariant16__default.default(JSBI13__default.default.lessThan(sqrtPriceLimitX96, TickMath.MAX_SQRT_RATIO), "RATIO_MAX");
    invariant16__default.default(JSBI13__default.default.greaterThan(sqrtPriceLimitX96, sqrtRatioX96), "RATIO_CURRENT");
  }
  const exactInput = JSBI13__default.default.greaterThanOrEqual(amountSpecified, ZERO2);
  const state = {
    amountSpecifiedRemaining: amountSpecified,
    amountCalculated: ZERO2,
    sqrtPriceX96: sqrtRatioX96,
    tick: tickCurrent,
    liquidity
  };
  while (JSBI13__default.default.notEqual(state.amountSpecifiedRemaining, ZERO2) && state.sqrtPriceX96 !== sqrtPriceLimitX96) {
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
      (zeroForOne ? JSBI13__default.default.lessThan(step.sqrtPriceNextX96, sqrtPriceLimitX96) : JSBI13__default.default.greaterThan(step.sqrtPriceNextX96, sqrtPriceLimitX96)) ? sqrtPriceLimitX96 : step.sqrtPriceNextX96,
      state.liquidity,
      state.amountSpecifiedRemaining,
      fee
    );
    if (exactInput) {
      state.amountSpecifiedRemaining = JSBI13__default.default.subtract(
        state.amountSpecifiedRemaining,
        JSBI13__default.default.add(step.amountIn, step.feeAmount)
      );
      state.amountCalculated = JSBI13__default.default.subtract(state.amountCalculated, step.amountOut);
    } else {
      state.amountSpecifiedRemaining = JSBI13__default.default.add(state.amountSpecifiedRemaining, step.amountOut);
      state.amountCalculated = JSBI13__default.default.add(state.amountCalculated, JSBI13__default.default.add(step.amountIn, step.feeAmount));
    }
    if (JSBI13__default.default.equal(state.sqrtPriceX96, step.sqrtPriceNextX96)) {
      if (step.initialized) {
        let liquidityNet = JSBI13__default.default.BigInt((await tickDataProvider.getTick(step.tickNext)).liquidityNet);
        if (zeroForOne) liquidityNet = JSBI13__default.default.multiply(liquidityNet, NEGATIVE_ONE);
        state.liquidity = LiquidityMath.addDelta(state.liquidity, liquidityNet);
      }
      state.tick = zeroForOne ? step.tickNext - 1 : step.tickNext;
    } else if (JSBI13__default.default.notEqual(state.sqrtPriceX96, step.sqrtPriceStartX96)) {
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
    invariant16__default.default(tickSpacing > 0, "TICK_SPACING_NONZERO");
    invariant16__default.default(
      ticks.every(({ index }) => index % tickSpacing === 0),
      "TICK_SPACING"
    );
    invariant16__default.default(
      JSBI13__default.default.equal(
        ticks.reduce((accumulator, { liquidityNet }) => JSBI13__default.default.add(accumulator, liquidityNet), ZERO2),
        ZERO2
      ),
      "ZERO_NET"
    );
    invariant16__default.default(isSorted(ticks, tickComparator), "SORTED");
  }
  static isBelowSmallest(ticks, tick) {
    invariant16__default.default(ticks.length > 0, "LENGTH");
    return tick < ticks[0].index;
  }
  static isAtOrAboveLargest(ticks, tick) {
    invariant16__default.default(ticks.length > 0, "LENGTH");
    return tick >= ticks[ticks.length - 1].index;
  }
  static getTick(ticks, index) {
    const tick = ticks[this.binarySearch(ticks, index)];
    invariant16__default.default(tick.index === index, "NOT_CONTAINED");
    return tick;
  }
  /**
   * Finds the largest tick in the list of ticks that is less than or equal to tick
   * @param ticks list of ticks
   * @param tick tick to find the largest tick that is less than or equal to tick
   * @private
   */
  static binarySearch(ticks, tick) {
    invariant16__default.default(!this.isBelowSmallest(ticks, tick), "BELOW_SMALLEST");
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
      invariant16__default.default(!_TickList.isBelowSmallest(ticks, tick), "BELOW_SMALLEST");
      if (_TickList.isAtOrAboveLargest(ticks, tick)) {
        return ticks[ticks.length - 1];
      }
      const index = this.binarySearch(ticks, tick);
      return ticks[index];
    } else {
      invariant16__default.default(!this.isAtOrAboveLargest(ticks, tick), "AT_OR_ABOVE_LARGEST");
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
function toHex(bigintIsh) {
  const bigInt = JSBI13__default.default.BigInt(bigintIsh);
  let hex = bigInt.toString(16);
  if (hex.length % 2 !== 0) {
    hex = `0${hex}`;
  }
  return `0x${hex}`;
}
function encodeRouteToPath(route, exactOutput) {
  const firstInputToken = route.input.wrapped;
  const { path, types } = route.pools.reduce(
    ({ inputToken, path: path2, types: types2 }, pool, index) => {
      const outputToken = pool.token0.equals(inputToken) ? pool.token1 : pool.token0;
      if (index === 0) {
        return {
          inputToken: outputToken,
          types: ["address", "uint24", "address"],
          path: [inputToken.address, pool.fee, outputToken.address]
        };
      } else {
        return {
          inputToken: outputToken,
          types: [...types2, "uint24", "address"],
          path: [...path2, pool.fee, outputToken.address]
        };
      }
    },
    { inputToken: firstInputToken, path: [], types: [] }
  );
  return exactOutput ? solidity.pack(types.reverse(), path.reverse()) : solidity.pack(types, path);
}
function encodeSqrtRatioX96(amount1, amount0) {
  const numerator = JSBI13__default.default.leftShift(JSBI13__default.default.BigInt(amount1), JSBI13__default.default.BigInt(192));
  const denominator = JSBI13__default.default.BigInt(amount0);
  const ratioX192 = JSBI13__default.default.divide(numerator, denominator);
  return sqrt(ratioX192);
}
function maxLiquidityForAmount0Imprecise(sqrtRatioAX96, sqrtRatioBX96, amount0) {
  if (JSBI13__default.default.greaterThan(sqrtRatioAX96, sqrtRatioBX96)) {
    [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  }
  const intermediate = JSBI13__default.default.divide(JSBI13__default.default.multiply(sqrtRatioAX96, sqrtRatioBX96), Q96);
  return JSBI13__default.default.divide(JSBI13__default.default.multiply(JSBI13__default.default.BigInt(amount0), intermediate), JSBI13__default.default.subtract(sqrtRatioBX96, sqrtRatioAX96));
}
function maxLiquidityForAmount0Precise(sqrtRatioAX96, sqrtRatioBX96, amount0) {
  if (JSBI13__default.default.greaterThan(sqrtRatioAX96, sqrtRatioBX96)) {
    [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  }
  const numerator = JSBI13__default.default.multiply(JSBI13__default.default.multiply(JSBI13__default.default.BigInt(amount0), sqrtRatioAX96), sqrtRatioBX96);
  const denominator = JSBI13__default.default.multiply(Q96, JSBI13__default.default.subtract(sqrtRatioBX96, sqrtRatioAX96));
  return JSBI13__default.default.divide(numerator, denominator);
}
function maxLiquidityForAmount1(sqrtRatioAX96, sqrtRatioBX96, amount1) {
  if (JSBI13__default.default.greaterThan(sqrtRatioAX96, sqrtRatioBX96)) {
    [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  }
  return JSBI13__default.default.divide(JSBI13__default.default.multiply(JSBI13__default.default.BigInt(amount1), Q96), JSBI13__default.default.subtract(sqrtRatioBX96, sqrtRatioAX96));
}
function maxLiquidityForAmounts(sqrtRatioCurrentX96, sqrtRatioAX96, sqrtRatioBX96, amount0, amount1, useFullPrecision) {
  if (JSBI13__default.default.greaterThan(sqrtRatioAX96, sqrtRatioBX96)) {
    [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
  }
  const maxLiquidityForAmount0 = useFullPrecision ? maxLiquidityForAmount0Precise : maxLiquidityForAmount0Imprecise;
  if (JSBI13__default.default.lessThanOrEqual(sqrtRatioCurrentX96, sqrtRatioAX96)) {
    return maxLiquidityForAmount0(sqrtRatioAX96, sqrtRatioBX96, amount0);
  } else if (JSBI13__default.default.lessThan(sqrtRatioCurrentX96, sqrtRatioBX96)) {
    const liquidity0 = maxLiquidityForAmount0(sqrtRatioCurrentX96, sqrtRatioBX96, amount0);
    const liquidity1 = maxLiquidityForAmount1(sqrtRatioAX96, sqrtRatioCurrentX96, amount1);
    return JSBI13__default.default.lessThan(liquidity0, liquidity1) ? liquidity0 : liquidity1;
  } else {
    return maxLiquidityForAmount1(sqrtRatioAX96, sqrtRatioBX96, amount1);
  }
}
function nearestUsableTick(tick, tickSpacing) {
  invariant16__default.default(Number.isInteger(tick) && Number.isInteger(tickSpacing), "INTEGERS");
  invariant16__default.default(tickSpacing > 0, "TICK_SPACING");
  invariant16__default.default(tick >= TickMath.MIN_TICK && tick <= TickMath.MAX_TICK, "TICK_BOUND");
  const rounded = Math.round(tick / tickSpacing) * tickSpacing;
  if (rounded < TickMath.MIN_TICK) return rounded + tickSpacing;
  else if (rounded > TickMath.MAX_TICK) return rounded - tickSpacing;
  else return rounded;
}
var Q128 = JSBI13__default.default.exponentiate(JSBI13__default.default.BigInt(2), JSBI13__default.default.BigInt(128));
var PositionLibrary = class {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  // replicates the portions of Position#update required to compute unaccounted fees
  static getTokensOwed(feeGrowthInside0LastX128, feeGrowthInside1LastX128, liquidity, feeGrowthInside0X128, feeGrowthInside1X128) {
    const tokensOwed0 = JSBI13__default.default.divide(
      JSBI13__default.default.multiply(subIn256(feeGrowthInside0X128, feeGrowthInside0LastX128), liquidity),
      Q128
    );
    const tokensOwed1 = JSBI13__default.default.divide(
      JSBI13__default.default.multiply(subIn256(feeGrowthInside1X128, feeGrowthInside1LastX128), liquidity),
      Q128
    );
    return [tokensOwed0, tokensOwed1];
  }
};
function tickToPrice(baseToken, quoteToken, tick) {
  const sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);
  const ratioX192 = JSBI13__default.default.multiply(sqrtRatioX96, sqrtRatioX96);
  return baseToken.sortsBefore(quoteToken) ? new Price(baseToken, quoteToken, Q192, ratioX192) : new Price(baseToken, quoteToken, ratioX192, Q192);
}
function priceToClosestTick(price) {
  const sorted = price.baseCurrency.sortsBefore(price.quoteCurrency);
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
var Q256 = JSBI13__default.default.exponentiate(JSBI13__default.default.BigInt(2), JSBI13__default.default.BigInt(256));
function subIn256(x, y) {
  const difference = JSBI13__default.default.subtract(x, y);
  if (JSBI13__default.default.lessThan(difference, ZERO2)) {
    return JSBI13__default.default.add(Q256, difference);
  } else {
    return difference;
  }
}
var TickLibrary = class {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  static getFeeGrowthInside(feeGrowthOutsideLower, feeGrowthOutsideUpper, tickLower, tickUpper, tickCurrent, feeGrowthGlobal0X128, feeGrowthGlobal1X128) {
    let feeGrowthBelow0X128;
    let feeGrowthBelow1X128;
    if (tickCurrent >= tickLower) {
      feeGrowthBelow0X128 = feeGrowthOutsideLower.feeGrowthOutside0X128;
      feeGrowthBelow1X128 = feeGrowthOutsideLower.feeGrowthOutside1X128;
    } else {
      feeGrowthBelow0X128 = subIn256(feeGrowthGlobal0X128, feeGrowthOutsideLower.feeGrowthOutside0X128);
      feeGrowthBelow1X128 = subIn256(feeGrowthGlobal1X128, feeGrowthOutsideLower.feeGrowthOutside1X128);
    }
    let feeGrowthAbove0X128;
    let feeGrowthAbove1X128;
    if (tickCurrent < tickUpper) {
      feeGrowthAbove0X128 = feeGrowthOutsideUpper.feeGrowthOutside0X128;
      feeGrowthAbove1X128 = feeGrowthOutsideUpper.feeGrowthOutside1X128;
    } else {
      feeGrowthAbove0X128 = subIn256(feeGrowthGlobal0X128, feeGrowthOutsideUpper.feeGrowthOutside0X128);
      feeGrowthAbove1X128 = subIn256(feeGrowthGlobal1X128, feeGrowthOutsideUpper.feeGrowthOutside1X128);
    }
    return [
      subIn256(subIn256(feeGrowthGlobal0X128, feeGrowthBelow0X128), feeGrowthAbove0X128),
      subIn256(subIn256(feeGrowthGlobal1X128, feeGrowthBelow1X128), feeGrowthAbove1X128)
    ];
  }
};

// src/v3/entities/tick.ts
var Tick = class {
  constructor({ index, liquidityGross, liquidityNet }) {
    invariant16__default.default(index >= TickMath.MIN_TICK && index <= TickMath.MAX_TICK, "TICK");
    this.index = index;
    this.liquidityGross = JSBI13__default.default.BigInt(liquidityGross);
    this.liquidityNet = JSBI13__default.default.BigInt(liquidityNet);
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

// src/v3/entities/pool.ts
var NO_TICK_DATA_PROVIDER_DEFAULT = new NoTickDataProvider();
var Pool = class _Pool {
  static getAddress(tokenA, tokenB, fee, initCodeHashManualOverride, factoryAddressOverride) {
    return computePoolAddress({
      factoryAddress: factoryAddressOverride ?? FACTORY_ADDRESS,
      fee,
      tokenA,
      tokenB,
      initCodeHashManualOverride
    });
  }
  /**
   * Construct a pool
   * @param tokenA One of the tokens in the pool
   * @param tokenB The other token in the pool
   * @param fee The fee in hundredths of a bips of the input amount of every swap that is collected by the pool
   * @param sqrtRatioX96 The sqrt of the current ratio of amounts of token1 to token0
   * @param liquidity The current value of in range liquidity
   * @param tickCurrent The current tick of the pool
   * @param ticks The current state of the pool ticks or a data provider that can return tick data
   */
  constructor(tokenA, tokenB, fee, sqrtRatioX96, liquidity, tickCurrent, ticks = NO_TICK_DATA_PROVIDER_DEFAULT) {
    invariant16__default.default(Number.isInteger(fee) && fee < 1e6, "FEE");
    const tickCurrentSqrtRatioX96 = TickMath.getSqrtRatioAtTick(tickCurrent);
    const nextTickSqrtRatioX96 = TickMath.getSqrtRatioAtTick(tickCurrent + 1);
    invariant16__default.default(
      JSBI13__default.default.greaterThanOrEqual(JSBI13__default.default.BigInt(sqrtRatioX96), tickCurrentSqrtRatioX96) && JSBI13__default.default.lessThanOrEqual(JSBI13__default.default.BigInt(sqrtRatioX96), nextTickSqrtRatioX96),
      "PRICE_BOUNDS"
    );
    [this.token0, this.token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA];
    this.fee = fee;
    this.sqrtRatioX96 = JSBI13__default.default.BigInt(sqrtRatioX96);
    this.liquidity = JSBI13__default.default.BigInt(liquidity);
    this.tickCurrent = tickCurrent;
    this.tickDataProvider = Array.isArray(ticks) ? new TickListDataProvider(ticks, TICK_SPACINGS[fee]) : ticks;
  }
  /**
   * Returns true if the token is either token0 or token1
   * @param token The token to check
   * @returns True if token is either token0 or token
   */
  involvesToken(token) {
    return token.equals(this.token0) || token.equals(this.token1);
  }
  /**
   * Returns the current mid price of the pool in terms of token0, i.e. the ratio of token1 over token0
   */
  get token0Price() {
    return this._token0Price ?? (this._token0Price = new Price(
      this.token0,
      this.token1,
      Q192,
      JSBI13__default.default.multiply(this.sqrtRatioX96, this.sqrtRatioX96)
    ));
  }
  /**
   * Returns the current mid price of the pool in terms of token1, i.e. the ratio of token0 over token1
   */
  get token1Price() {
    return this._token1Price ?? (this._token1Price = new Price(
      this.token1,
      this.token0,
      JSBI13__default.default.multiply(this.sqrtRatioX96, this.sqrtRatioX96),
      Q192
    ));
  }
  /**
   * Return the price of the given token in terms of the other token in the pool.
   * @param token The token to return price of
   * @returns The price of the given token, in terms of the other.
   */
  priceOf(token) {
    invariant16__default.default(this.involvesToken(token), "TOKEN");
    return token.equals(this.token0) ? this.token0Price : this.token1Price;
  }
  /**
   * Returns the chain ID of the tokens in the pool.
   */
  get chainId() {
    return this.token0.chainId;
  }
  /**
   * Given an input amount of a token, return the computed output amount, and a pool with state updated after the trade
   * @param inputAmount The input amount for which to quote the output amount
   * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit
   * @returns The output amount and the pool with updated state
   */
  async getOutputAmount(inputAmount, sqrtPriceLimitX96) {
    invariant16__default.default(this.involvesToken(inputAmount.currency), "TOKEN");
    const zeroForOne = inputAmount.currency.equals(this.token0);
    const {
      amountCalculated: outputAmount,
      sqrtRatioX96,
      liquidity,
      tickCurrent
    } = await this.swap(zeroForOne, inputAmount.quotient, sqrtPriceLimitX96);
    const outputToken = zeroForOne ? this.token1 : this.token0;
    return [
      CurrencyAmount.fromRawAmount(outputToken, JSBI13__default.default.multiply(outputAmount, NEGATIVE_ONE)),
      new _Pool(this.token0, this.token1, this.fee, sqrtRatioX96, liquidity, tickCurrent, this.tickDataProvider)
    ];
  }
  /**
   * Given a desired output amount of a token, return the computed input amount and a pool with state updated after the trade
   * @param outputAmount the output amount for which to quote the input amount
   * @param sqrtPriceLimitX96 The Q64.96 sqrt price limit. If zero for one, the price cannot be less than this value after the swap. If one for zero, the price cannot be greater than this value after the swap
   * @returns The input amount and the pool with updated state
   */
  async getInputAmount(outputAmount, sqrtPriceLimitX96) {
    invariant16__default.default(outputAmount.currency.isToken && this.involvesToken(outputAmount.currency), "TOKEN");
    const zeroForOne = outputAmount.currency.equals(this.token1);
    const {
      amountCalculated: inputAmount,
      sqrtRatioX96,
      liquidity,
      tickCurrent
    } = await this.swap(zeroForOne, JSBI13__default.default.multiply(outputAmount.quotient, NEGATIVE_ONE), sqrtPriceLimitX96);
    const inputToken = zeroForOne ? this.token0 : this.token1;
    return [
      CurrencyAmount.fromRawAmount(inputToken, inputAmount),
      new _Pool(this.token0, this.token1, this.fee, sqrtRatioX96, liquidity, tickCurrent, this.tickDataProvider)
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
    return v3Swap(
      JSBI13__default.default.BigInt(this.fee),
      this.sqrtRatioX96,
      this.tickCurrent,
      this.liquidity,
      this.tickSpacing,
      this.tickDataProvider,
      zeroForOne,
      amountSpecified,
      sqrtPriceLimitX96
    );
  }
  get tickSpacing() {
    return TICK_SPACINGS[this.fee];
  }
};
var Position = class _Position {
  /**
   * Constructs a position for a given pool with the given liquidity
   * @param pool For which pool the liquidity is assigned
   * @param liquidity The amount of liquidity that is in the position
   * @param tickLower The lower tick of the position
   * @param tickUpper The upper tick of the position
   */
  constructor({ pool, liquidity, tickLower, tickUpper }) {
    // cached resuts for the getters
    this._token0Amount = null;
    this._token1Amount = null;
    this._mintAmounts = null;
    invariant16__default.default(tickLower < tickUpper, "TICK_ORDER");
    invariant16__default.default(tickLower >= TickMath.MIN_TICK && tickLower % pool.tickSpacing === 0, "TICK_LOWER");
    invariant16__default.default(tickUpper <= TickMath.MAX_TICK && tickUpper % pool.tickSpacing === 0, "TICK_UPPER");
    this.pool = pool;
    this.tickLower = tickLower;
    this.tickUpper = tickUpper;
    this.liquidity = JSBI13__default.default.BigInt(liquidity);
  }
  /**
   * Returns the price of token0 at the lower tick
   */
  get token0PriceLower() {
    return tickToPrice(this.pool.token0, this.pool.token1, this.tickLower);
  }
  /**
   * Returns the price of token0 at the upper tick
   */
  get token0PriceUpper() {
    return tickToPrice(this.pool.token0, this.pool.token1, this.tickUpper);
  }
  /**
   * Returns the amount of token0 that this position's liquidity could be burned for at the current pool price
   */
  get amount0() {
    if (this._token0Amount === null) {
      if (this.pool.tickCurrent < this.tickLower) {
        this._token0Amount = CurrencyAmount.fromRawAmount(
          this.pool.token0,
          SqrtPriceMath.getAmount0Delta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            TickMath.getSqrtRatioAtTick(this.tickUpper),
            this.liquidity,
            false
          )
        );
      } else if (this.pool.tickCurrent < this.tickUpper) {
        this._token0Amount = CurrencyAmount.fromRawAmount(
          this.pool.token0,
          SqrtPriceMath.getAmount0Delta(
            this.pool.sqrtRatioX96,
            TickMath.getSqrtRatioAtTick(this.tickUpper),
            this.liquidity,
            false
          )
        );
      } else {
        this._token0Amount = CurrencyAmount.fromRawAmount(this.pool.token0, ZERO2);
      }
    }
    return this._token0Amount;
  }
  /**
   * Returns the amount of token1 that this position's liquidity could be burned for at the current pool price
   */
  get amount1() {
    if (this._token1Amount === null) {
      if (this.pool.tickCurrent < this.tickLower) {
        this._token1Amount = CurrencyAmount.fromRawAmount(this.pool.token1, ZERO2);
      } else if (this.pool.tickCurrent < this.tickUpper) {
        this._token1Amount = CurrencyAmount.fromRawAmount(
          this.pool.token1,
          SqrtPriceMath.getAmount1Delta(
            TickMath.getSqrtRatioAtTick(this.tickLower),
            this.pool.sqrtRatioX96,
            this.liquidity,
            false
          )
        );
      } else {
        this._token1Amount = CurrencyAmount.fromRawAmount(
          this.pool.token1,
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
    if (JSBI13__default.default.lessThanOrEqual(sqrtRatioX96Lower, TickMath.MIN_SQRT_RATIO)) {
      sqrtRatioX96Lower = JSBI13__default.default.add(TickMath.MIN_SQRT_RATIO, JSBI13__default.default.BigInt(1));
    }
    let sqrtRatioX96Upper = encodeSqrtRatioX96(priceUpper.numerator, priceUpper.denominator);
    if (JSBI13__default.default.greaterThanOrEqual(sqrtRatioX96Upper, TickMath.MAX_SQRT_RATIO)) {
      sqrtRatioX96Upper = JSBI13__default.default.subtract(TickMath.MAX_SQRT_RATIO, JSBI13__default.default.BigInt(1));
    }
    return {
      sqrtRatioX96Lower,
      sqrtRatioX96Upper
    };
  }
  /**
   * Returns the minimum amounts that must be sent in order to safely mint the amount of liquidity held by the position
   * with the given slippage tolerance
   * @param slippageTolerance Tolerance of unfavorable slippage from the current price
   * @returns The amounts, with slippage
   */
  mintAmountsWithSlippage(slippageTolerance) {
    const { sqrtRatioX96Upper, sqrtRatioX96Lower } = this.ratiosAfterSlippage(slippageTolerance);
    const poolLower = new Pool(
      this.pool.token0,
      this.pool.token1,
      this.pool.fee,
      sqrtRatioX96Lower,
      0,
      TickMath.getTickAtSqrtRatio(sqrtRatioX96Lower)
    );
    const poolUpper = new Pool(
      this.pool.token0,
      this.pool.token1,
      this.pool.fee,
      sqrtRatioX96Upper,
      0,
      TickMath.getTickAtSqrtRatio(sqrtRatioX96Upper)
    );
    const positionThatWillBeCreated = _Position.fromAmounts({
      pool: this.pool,
      tickLower: this.tickLower,
      tickUpper: this.tickUpper,
      ...this.mintAmounts,
      // the mint amounts are what will be passed as calldata
      useFullPrecision: false
    });
    const { amount0 } = new _Position({
      pool: poolUpper,
      liquidity: positionThatWillBeCreated.liquidity,
      tickLower: this.tickLower,
      tickUpper: this.tickUpper
    }).mintAmounts;
    const { amount1 } = new _Position({
      pool: poolLower,
      liquidity: positionThatWillBeCreated.liquidity,
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
      this.pool.token0,
      this.pool.token1,
      this.pool.fee,
      sqrtRatioX96Lower,
      0,
      TickMath.getTickAtSqrtRatio(sqrtRatioX96Lower)
    );
    const poolUpper = new Pool(
      this.pool.token0,
      this.pool.token1,
      this.pool.fee,
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
          amount1: ZERO2
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
          amount0: ZERO2,
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
   * Computes the maximum amount of liquidity received for a given amount of token0, token1,
   * and the prices at the tick boundaries.
   * @param pool The pool for which the position should be created
   * @param tickLower The lower tick of the position
   * @param tickUpper The upper tick of the position
   * @param amount0 token0 amount
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
var Route = class {
  /**
   * Creates an instance of route.
   * @param pools An array of `Pool` objects, ordered by the route the swap will take
   * @param input The input token
   * @param output The output token
   */
  constructor(pools, input, output) {
    this._midPrice = null;
    invariant16__default.default(pools.length > 0, "POOLS");
    const chainId = pools[0].chainId;
    const allOnSameChain = pools.every((pool) => pool.chainId === chainId);
    invariant16__default.default(allOnSameChain, "CHAIN_IDS");
    const wrappedInput = input.wrapped;
    invariant16__default.default(pools[0].involvesToken(wrappedInput), "INPUT");
    invariant16__default.default(pools[pools.length - 1].involvesToken(output.wrapped), "OUTPUT");
    const tokenPath = [wrappedInput];
    for (const [i, pool] of pools.entries()) {
      const currentInputToken = tokenPath[i];
      invariant16__default.default(currentInputToken.equals(pool.token0) || currentInputToken.equals(pool.token1), "PATH");
      const nextToken = currentInputToken.equals(pool.token0) ? pool.token1 : pool.token0;
      tokenPath.push(nextToken);
    }
    this.pools = pools;
    this.tokenPath = tokenPath;
    this.input = input;
    this.output = output ?? tokenPath[tokenPath.length - 1];
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
        return nextInput.equals(pool.token0) ? {
          nextInput: pool.token1,
          price: price2.multiply(pool.token0Price)
        } : {
          nextInput: pool.token0,
          price: price2.multiply(pool.token1Price)
        };
      },
      this.pools[0].token0.equals(this.input.wrapped) ? {
        nextInput: this.pools[0].token1,
        price: this.pools[0].token0Price
      } : {
        nextInput: this.pools[0].token0,
        price: this.pools[0].token1Price
      }
    ).price;
    return this._midPrice = new Price(this.input, this.output, price.denominator, price.numerator);
  }
};
function tradeComparator(a, b) {
  invariant16__default.default(a.inputAmount.currency.equals(b.inputAmount.currency), "INPUT_CURRENCY");
  invariant16__default.default(a.outputAmount.currency.equals(b.outputAmount.currency), "OUTPUT_CURRENCY");
  if (a.outputAmount.equalTo(b.outputAmount)) {
    if (a.inputAmount.equalTo(b.inputAmount)) {
      const aHops = a.swaps.reduce((total, cur) => total + cur.route.tokenPath.length, 0);
      const bHops = b.swaps.reduce((total, cur) => total + cur.route.tokenPath.length, 0);
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
    invariant16__default.default(this.swaps.length === 1, "MULTIPLE_ROUTES");
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
   * @template TInput The input token, either Ether or an ERC-20
   * @template TOutput The output token, either Ether or an ERC-20
   * @param route The route of the exact in trade
   * @param amountIn The amount being passed in
   * @returns The exact in trade
   */
  static async exactIn(route, amountIn) {
    return _Trade.fromRoute(route, amountIn, 0 /* EXACT_INPUT */);
  }
  /**
   * Constructs an exact out trade with the given amount out and route
   * @template TInput The input token, either Ether or an ERC-20
   * @template TOutput The output token, either Ether or an ERC-20
   * @param route The route of the exact out trade
   * @param amountOut The amount returned by the trade
   * @returns The exact out trade
   */
  static async exactOut(route, amountOut) {
    return _Trade.fromRoute(route, amountOut, 1 /* EXACT_OUTPUT */);
  }
  /**
   * Constructs a trade by simulating swaps through the given route
   * @template TInput The input token, either Ether or an ERC-20.
   * @template TOutput The output token, either Ether or an ERC-20.
   * @template TTradeType The type of the trade, either exact in or exact out.
   * @param route route to swap through
   * @param amount the amount specified, either input or output, depending on tradeType
   * @param tradeType whether the trade is an exact input or exact output swap
   * @returns The route
   */
  static async fromRoute(route, amount, tradeType) {
    const amounts = new Array(route.tokenPath.length);
    let inputAmount;
    let outputAmount;
    if (tradeType === 0 /* EXACT_INPUT */) {
      invariant16__default.default(amount.currency.equals(route.input), "INPUT");
      amounts[0] = amount.wrapped;
      for (let i = 0; i < route.tokenPath.length - 1; i++) {
        const pool = route.pools[i];
        const [outputAmount2] = await pool.getOutputAmount(amounts[i]);
        amounts[i + 1] = outputAmount2;
      }
      inputAmount = CurrencyAmount.fromFractionalAmount(route.input, amount.numerator, amount.denominator);
      outputAmount = CurrencyAmount.fromFractionalAmount(
        route.output,
        amounts[amounts.length - 1].numerator,
        amounts[amounts.length - 1].denominator
      );
    } else {
      invariant16__default.default(amount.currency.equals(route.output), "OUTPUT");
      amounts[amounts.length - 1] = amount.wrapped;
      for (let i = route.tokenPath.length - 1; i > 0; i--) {
        const pool = route.pools[i - 1];
        const [inputAmount2] = await pool.getInputAmount(amounts[i]);
        amounts[i - 1] = inputAmount2;
      }
      inputAmount = CurrencyAmount.fromFractionalAmount(route.input, amounts[0].numerator, amounts[0].denominator);
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
   * @template TInput The input token, either Ether or an ERC-20.
   * @template TOutput The output token, either Ether or an ERC-20.
   * @template TTradeType The type of the trade, either exact in or exact out.
   * @param routes the routes to swap through and how much of the amount should be routed through each
   * @param tradeType whether the trade is an exact input or exact output swap
   * @returns The trade
   */
  static async fromRoutes(routes, tradeType) {
    const populatedRoutes = [];
    for (const { route, amount } of routes) {
      const amounts = new Array(route.tokenPath.length);
      let inputAmount;
      let outputAmount;
      if (tradeType === 0 /* EXACT_INPUT */) {
        invariant16__default.default(amount.currency.equals(route.input), "INPUT");
        inputAmount = CurrencyAmount.fromFractionalAmount(route.input, amount.numerator, amount.denominator);
        amounts[0] = CurrencyAmount.fromFractionalAmount(route.input.wrapped, amount.numerator, amount.denominator);
        for (let i = 0; i < route.tokenPath.length - 1; i++) {
          const pool = route.pools[i];
          const [outputAmount2] = await pool.getOutputAmount(amounts[i]);
          amounts[i + 1] = outputAmount2;
        }
        outputAmount = CurrencyAmount.fromFractionalAmount(
          route.output,
          amounts[amounts.length - 1].numerator,
          amounts[amounts.length - 1].denominator
        );
      } else {
        invariant16__default.default(amount.currency.equals(route.output), "OUTPUT");
        outputAmount = CurrencyAmount.fromFractionalAmount(route.output, amount.numerator, amount.denominator);
        amounts[amounts.length - 1] = CurrencyAmount.fromFractionalAmount(
          route.output.wrapped,
          amount.numerator,
          amount.denominator
        );
        for (let i = route.tokenPath.length - 1; i > 0; i--) {
          const pool = route.pools[i - 1];
          const [inputAmount2] = await pool.getInputAmount(amounts[i]);
          amounts[i - 1] = inputAmount2;
        }
        inputAmount = CurrencyAmount.fromFractionalAmount(route.input, amounts[0].numerator, amounts[0].denominator);
      }
      populatedRoutes.push({ route, inputAmount, outputAmount });
    }
    return new _Trade({
      routes: populatedRoutes,
      tradeType
    });
  }
  /**
   * Creates a trade without computing the result of swapping through the route. Useful when you have simulated the trade
   * elsewhere and do not have any tick data
   * @template TInput The input token, either Ether or an ERC-20
   * @template TOutput The output token, either Ether or an ERC-20
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
   * @template TInput The input token, either Ether or an ERC-20
   * @template TOutput The output token, either Ether or an ERC-20
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
    invariant16__default.default(
      routes.every(({ route }) => inputCurrency.wrapped.equals(route.input.wrapped)),
      "INPUT_CURRENCY_MATCH"
    );
    invariant16__default.default(
      routes.every(({ route }) => outputCurrency.wrapped.equals(route.output.wrapped)),
      "OUTPUT_CURRENCY_MATCH"
    );
    const numPools = routes.map(({ route }) => route.pools.length).reduce((total, cur) => total + cur, 0);
    const poolAddressSet = /* @__PURE__ */ new Set();
    for (const { route } of routes) {
      for (const pool of route.pools) {
        poolAddressSet.add(Pool.getAddress(pool.token0, pool.token1, pool.fee));
      }
    }
    invariant16__default.default(numPools === poolAddressSet.size, "POOLS_DUPLICATED");
    this.swaps = routes;
    this.tradeType = tradeType;
  }
  /**
   * Get the minimum amount that must be received from this trade for the given slippage tolerance
   * @param slippageTolerance The tolerance of unfavorable slippage from the execution price of this trade
   * @returns The amount out
   */
  minimumAmountOut(slippageTolerance, amountOut = this.outputAmount) {
    invariant16__default.default(!slippageTolerance.lessThan(ZERO2), "SLIPPAGE_TOLERANCE");
    if (this.tradeType === 1 /* EXACT_OUTPUT */) {
      return amountOut;
    } else {
      const slippageAdjustedAmountOut = new Fraction(ONE2).add(slippageTolerance).invert().multiply(amountOut.quotient).quotient;
      return CurrencyAmount.fromRawAmount(amountOut.currency, slippageAdjustedAmountOut);
    }
  }
  /**
   * Get the maximum amount in that can be spent via this trade for the given slippage tolerance
   * @param slippageTolerance The tolerance of unfavorable slippage from the execution price of this trade
   * @returns The amount in
   */
  maximumAmountIn(slippageTolerance, amountIn = this.inputAmount) {
    invariant16__default.default(!slippageTolerance.lessThan(ZERO2), "SLIPPAGE_TOLERANCE");
    if (this.tradeType === 0 /* EXACT_INPUT */) {
      return amountIn;
    } else {
      const slippageAdjustedAmountIn = new Fraction(ONE2).add(slippageTolerance).multiply(amountIn.quotient).quotient;
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
   * Given a list of pools, and a fixed amount in, returns the top `maxNumResults` trades that go from an input token
   * amount to an output token, making at most `maxHops` hops.
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
    invariant16__default.default(pools.length > 0, "POOLS");
    invariant16__default.default(maxHops > 0, "MAX_HOPS");
    invariant16__default.default(currencyAmountIn === nextAmountIn || currentPools.length > 0, "INVALID_RECURSION");
    const amountIn = nextAmountIn.wrapped;
    const tokenOut = currencyOut.wrapped;
    for (let i = 0; i < pools.length; i++) {
      const pool = pools[i];
      if (!pool.token0.equals(amountIn.currency) && !pool.token1.equals(amountIn.currency)) continue;
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
      if (amountOut.currency.isToken && amountOut.currency.equals(tokenOut)) {
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
   * given a list of pools, and a fixed amount out, returns the top `maxNumResults` trades that go from an input token
   * to an output token amount, making at most `maxHops` hops
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
    invariant16__default.default(pools.length > 0, "POOLS");
    invariant16__default.default(maxHops > 0, "MAX_HOPS");
    invariant16__default.default(currencyAmountOut === nextAmountOut || currentPools.length > 0, "INVALID_RECURSION");
    const amountOut = nextAmountOut.wrapped;
    const tokenIn = currencyIn.wrapped;
    for (let i = 0; i < pools.length; i++) {
      const pool = pools[i];
      if (!pool.token0.equals(amountOut.currency) && !pool.token1.equals(amountOut.currency)) continue;
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
      if (amountIn.currency.equals(tokenIn)) {
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
var _Multicall = class _Multicall {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  static encodeMulticall(calldatas) {
    if (!Array.isArray(calldatas)) {
      calldatas = [calldatas];
    }
    return calldatas.length === 1 ? calldatas[0] : _Multicall.INTERFACE.encodeFunctionData("multicall", [calldatas]);
  }
  static decodeMulticall(multicall) {
    return _Multicall.INTERFACE.decodeFunctionData("multicall", multicall).data;
  }
};
_Multicall.INTERFACE = new abi.Interface(IMulticall__default.default.abi);
var Multicall = _Multicall;
function isAllowedPermit(permitOptions) {
  return "nonce" in permitOptions;
}
var _SelfPermit = class _SelfPermit {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  static encodePermit(token, options) {
    return isAllowedPermit(options) ? _SelfPermit.INTERFACE.encodeFunctionData("selfPermitAllowed", [
      token.address,
      toHex(options.nonce),
      toHex(options.expiry),
      options.v,
      options.r,
      options.s
    ]) : _SelfPermit.INTERFACE.encodeFunctionData("selfPermit", [
      token.address,
      toHex(options.amount),
      toHex(options.deadline),
      options.v,
      options.r,
      options.s
    ]);
  }
};
_SelfPermit.INTERFACE = new abi.Interface(ISelfPermit__default.default.abi);
var SelfPermit = _SelfPermit;
var _Payments = class _Payments {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  static encodeFeeBips(fee) {
    return toHex(fee.multiply(1e4).quotient);
  }
  static encodeUnwrapWETH9(amountMinimum, recipient, feeOptions) {
    recipient = validateAndParseAddress(recipient);
    if (!!feeOptions) {
      const feeBips = this.encodeFeeBips(feeOptions.fee);
      const feeRecipient = validateAndParseAddress(feeOptions.recipient);
      return _Payments.INTERFACE.encodeFunctionData("unwrapWETH9WithFee", [
        toHex(amountMinimum),
        recipient,
        feeBips,
        feeRecipient
      ]);
    } else {
      return _Payments.INTERFACE.encodeFunctionData("unwrapWETH9", [toHex(amountMinimum), recipient]);
    }
  }
  static encodeSweepToken(token, amountMinimum, recipient, feeOptions) {
    recipient = validateAndParseAddress(recipient);
    if (!!feeOptions) {
      const feeBips = this.encodeFeeBips(feeOptions.fee);
      const feeRecipient = validateAndParseAddress(feeOptions.recipient);
      return _Payments.INTERFACE.encodeFunctionData("sweepTokenWithFee", [
        token.address,
        toHex(amountMinimum),
        recipient,
        feeBips,
        feeRecipient
      ]);
    } else {
      return _Payments.INTERFACE.encodeFunctionData("sweepToken", [token.address, toHex(amountMinimum), recipient]);
    }
  }
  static encodeRefundETH() {
    return _Payments.INTERFACE.encodeFunctionData("refundETH");
  }
};
_Payments.INTERFACE = new abi.Interface(IPeripheryPaymentsWithFee__default.default.abi);
var Payments = _Payments;

// src/v3/nonfungiblePositionManager.ts
var MaxUint128 = toHex(JSBI13__default.default.subtract(JSBI13__default.default.exponentiate(JSBI13__default.default.BigInt(2), JSBI13__default.default.BigInt(128)), JSBI13__default.default.BigInt(1)));
function isMint(options) {
  return Object.keys(options).some((k) => k === "recipient");
}
var NFT_PERMIT_TYPES = {
  Permit: [
    { name: "spender", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ]
};
var _NonfungiblePositionManager = class _NonfungiblePositionManager {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  static encodeCreate(pool) {
    return _NonfungiblePositionManager.INTERFACE.encodeFunctionData("createAndInitializePoolIfNecessary", [
      pool.token0.address,
      pool.token1.address,
      pool.fee,
      toHex(pool.sqrtRatioX96)
    ]);
  }
  static createCallParameters(pool) {
    return {
      calldata: this.encodeCreate(pool),
      value: toHex(0)
    };
  }
  static addCallParameters(position, options) {
    invariant16__default.default(JSBI13__default.default.greaterThan(position.liquidity, ZERO2), "ZERO_LIQUIDITY");
    const calldatas = [];
    const { amount0: amount0Desired, amount1: amount1Desired } = position.mintAmounts;
    const minimumAmounts = position.mintAmountsWithSlippage(options.slippageTolerance);
    const amount0Min = toHex(minimumAmounts.amount0);
    const amount1Min = toHex(minimumAmounts.amount1);
    const deadline = toHex(options.deadline);
    if (isMint(options) && options.createPool) {
      calldatas.push(this.encodeCreate(position.pool));
    }
    if (options.token0Permit) {
      calldatas.push(SelfPermit.encodePermit(position.pool.token0, options.token0Permit));
    }
    if (options.token1Permit) {
      calldatas.push(SelfPermit.encodePermit(position.pool.token1, options.token1Permit));
    }
    if (isMint(options)) {
      const recipient = validateAndParseAddress(options.recipient);
      calldatas.push(
        _NonfungiblePositionManager.INTERFACE.encodeFunctionData("mint", [
          {
            token0: position.pool.token0.address,
            token1: position.pool.token1.address,
            fee: position.pool.fee,
            tickLower: position.tickLower,
            tickUpper: position.tickUpper,
            amount0Desired: toHex(amount0Desired),
            amount1Desired: toHex(amount1Desired),
            amount0Min,
            amount1Min,
            recipient,
            deadline
          }
        ])
      );
    } else {
      calldatas.push(
        _NonfungiblePositionManager.INTERFACE.encodeFunctionData("increaseLiquidity", [
          {
            tokenId: toHex(options.tokenId),
            amount0Desired: toHex(amount0Desired),
            amount1Desired: toHex(amount1Desired),
            amount0Min,
            amount1Min,
            deadline
          }
        ])
      );
    }
    let value = toHex(0);
    if (options.useNative) {
      const wrapped = options.useNative.wrapped;
      invariant16__default.default(position.pool.token0.equals(wrapped) || position.pool.token1.equals(wrapped), "NO_WETH");
      const wrappedValue = position.pool.token0.equals(wrapped) ? amount0Desired : amount1Desired;
      if (JSBI13__default.default.greaterThan(wrappedValue, ZERO2)) {
        calldatas.push(Payments.encodeRefundETH());
      }
      value = toHex(wrappedValue);
    }
    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value
    };
  }
  static encodeCollect(options) {
    const calldatas = [];
    const tokenId = toHex(options.tokenId);
    const involvesETH = options.expectedCurrencyOwed0.currency.isNative || options.expectedCurrencyOwed1.currency.isNative;
    const recipient = validateAndParseAddress(options.recipient);
    calldatas.push(
      _NonfungiblePositionManager.INTERFACE.encodeFunctionData("collect", [
        {
          tokenId,
          recipient: involvesETH ? ADDRESS_ZERO : recipient,
          amount0Max: MaxUint128,
          amount1Max: MaxUint128
        }
      ])
    );
    if (involvesETH) {
      const ethAmount = options.expectedCurrencyOwed0.currency.isNative ? options.expectedCurrencyOwed0.quotient : options.expectedCurrencyOwed1.quotient;
      const token = options.expectedCurrencyOwed0.currency.isNative ? options.expectedCurrencyOwed1.currency : options.expectedCurrencyOwed0.currency;
      const tokenAmount = options.expectedCurrencyOwed0.currency.isNative ? options.expectedCurrencyOwed1.quotient : options.expectedCurrencyOwed0.quotient;
      calldatas.push(Payments.encodeUnwrapWETH9(ethAmount, recipient));
      calldatas.push(Payments.encodeSweepToken(token, tokenAmount, recipient));
    }
    return calldatas;
  }
  static collectCallParameters(options) {
    const calldatas = _NonfungiblePositionManager.encodeCollect(options);
    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value: toHex(0)
    };
  }
  /**
   * Produces the calldata for completely or partially exiting a position
   * @param position The position to exit
   * @param options Additional information necessary for generating the calldata
   * @returns The call parameters
   */
  static removeCallParameters(position, options) {
    const calldatas = [];
    const deadline = toHex(options.deadline);
    const tokenId = toHex(options.tokenId);
    const partialPosition = new Position({
      pool: position.pool,
      liquidity: options.liquidityPercentage.multiply(position.liquidity).quotient,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper
    });
    invariant16__default.default(JSBI13__default.default.greaterThan(partialPosition.liquidity, ZERO2), "ZERO_LIQUIDITY");
    const { amount0: amount0Min, amount1: amount1Min } = partialPosition.burnAmountsWithSlippage(
      options.slippageTolerance
    );
    if (options.permit) {
      calldatas.push(
        _NonfungiblePositionManager.INTERFACE.encodeFunctionData("permit", [
          validateAndParseAddress(options.permit.spender),
          tokenId,
          toHex(options.permit.deadline),
          options.permit.v,
          options.permit.r,
          options.permit.s
        ])
      );
    }
    calldatas.push(
      _NonfungiblePositionManager.INTERFACE.encodeFunctionData("decreaseLiquidity", [
        {
          tokenId,
          liquidity: toHex(partialPosition.liquidity),
          amount0Min: toHex(amount0Min),
          amount1Min: toHex(amount1Min),
          deadline
        }
      ])
    );
    const { expectedCurrencyOwed0, expectedCurrencyOwed1, ...rest } = options.collectOptions;
    calldatas.push(
      ..._NonfungiblePositionManager.encodeCollect({
        tokenId: toHex(options.tokenId),
        // add the underlying value to the expected currency already owed
        expectedCurrencyOwed0: expectedCurrencyOwed0.add(
          CurrencyAmount.fromRawAmount(expectedCurrencyOwed0.currency, amount0Min)
        ),
        expectedCurrencyOwed1: expectedCurrencyOwed1.add(
          CurrencyAmount.fromRawAmount(expectedCurrencyOwed1.currency, amount1Min)
        ),
        ...rest
      })
    );
    if (options.liquidityPercentage.equalTo(ONE2)) {
      if (options.burnToken) {
        calldatas.push(_NonfungiblePositionManager.INTERFACE.encodeFunctionData("burn", [tokenId]));
      }
    } else {
      invariant16__default.default(options.burnToken !== true, "CANNOT_BURN");
    }
    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value: toHex(0)
    };
  }
  static safeTransferFromParameters(options) {
    const recipient = validateAndParseAddress(options.recipient);
    const sender = validateAndParseAddress(options.sender);
    let calldata;
    if (options.data) {
      calldata = _NonfungiblePositionManager.INTERFACE.encodeFunctionData(
        "safeTransferFrom(address,address,uint256,bytes)",
        [sender, recipient, toHex(options.tokenId), options.data]
      );
    } else {
      calldata = _NonfungiblePositionManager.INTERFACE.encodeFunctionData("safeTransferFrom(address,address,uint256)", [
        sender,
        recipient,
        toHex(options.tokenId)
      ]);
    }
    return {
      calldata,
      value: toHex(0)
    };
  }
  // Prepare the params for an EIP712 signTypedData request
  static getPermitData(permit, positionManagerAddress, chainId) {
    return {
      domain: {
        name: "Uniswap V3 Positions NFT-V1",
        chainId,
        version: "1",
        verifyingContract: positionManagerAddress
      },
      types: NFT_PERMIT_TYPES,
      values: permit
    };
  }
};
_NonfungiblePositionManager.INTERFACE = new abi.Interface(INonfungiblePositionManager__default.default.abi);
var NonfungiblePositionManager = _NonfungiblePositionManager;
var SwapQuoter = class {
  /**
   * Produces the on-chain method name of the appropriate function within QuoterV2,
   * and the relevant hex encoded parameters.
   * @template TInput The input token, either Ether or an ERC-20
   * @template TOutput The output token, either Ether or an ERC-20
   * @param route The swap route, a list of pools through which a swap can occur
   * @param amount The amount of the quote, either an amount in, or an amount out
   * @param tradeType The trade type, either exact input or exact output
   * @param options The optional params including price limit and Quoter contract switch
   * @returns The formatted calldata
   */
  static quoteCallParameters(route, amount, tradeType, options = {}) {
    const singleHop = route.pools.length === 1;
    const quoteAmount = toHex(amount.quotient);
    let calldata;
    const swapInterface = options.useQuoterV2 ? this.V2INTERFACE : this.V1INTERFACE;
    if (singleHop) {
      const baseQuoteParams = {
        tokenIn: route.tokenPath[0].address,
        tokenOut: route.tokenPath[1].address,
        fee: route.pools[0].fee,
        sqrtPriceLimitX96: toHex(options?.sqrtPriceLimitX96 ?? 0)
      };
      const v2QuoteParams = {
        ...baseQuoteParams,
        ...tradeType === 0 /* EXACT_INPUT */ ? { amountIn: quoteAmount } : { amount: quoteAmount }
      };
      const v1QuoteParams = [
        baseQuoteParams.tokenIn,
        baseQuoteParams.tokenOut,
        baseQuoteParams.fee,
        quoteAmount,
        baseQuoteParams.sqrtPriceLimitX96
      ];
      const tradeTypeFunctionName = tradeType === 0 /* EXACT_INPUT */ ? "quoteExactInputSingle" : "quoteExactOutputSingle";
      calldata = swapInterface.encodeFunctionData(
        tradeTypeFunctionName,
        options.useQuoterV2 ? [v2QuoteParams] : v1QuoteParams
      );
    } else {
      invariant16__default.default(options?.sqrtPriceLimitX96 === void 0, "MULTIHOP_PRICE_LIMIT");
      const path = encodeRouteToPath(route, tradeType === 1 /* EXACT_OUTPUT */);
      const tradeTypeFunctionName = tradeType === 0 /* EXACT_INPUT */ ? "quoteExactInput" : "quoteExactOutput";
      calldata = swapInterface.encodeFunctionData(tradeTypeFunctionName, [path, quoteAmount]);
    }
    return {
      calldata,
      value: toHex(0)
    };
  }
};
SwapQuoter.V1INTERFACE = new abi.Interface(IQuoter__default.default.abi);
SwapQuoter.V2INTERFACE = new abi.Interface(IQuoterV2__default.default.abi);
var _Staker = class _Staker {
  constructor() {
  }
  /**
   *  To claim rewards, must unstake and then claim.
   * @param incentiveKey The unique identifier of a staking program.
   * @param options Options for producing the calldata to claim. Can't claim unless you unstake.
   * @returns The calldatas for 'unstakeToken' and 'claimReward'.
   */
  static encodeClaim(incentiveKey, options) {
    const calldatas = [];
    calldatas.push(
      _Staker.INTERFACE.encodeFunctionData("unstakeToken", [
        this._encodeIncentiveKey(incentiveKey),
        toHex(options.tokenId)
      ])
    );
    const recipient = validateAndParseAddress(options.recipient);
    const amount = options.amount ?? 0;
    calldatas.push(
      _Staker.INTERFACE.encodeFunctionData("claimReward", [incentiveKey.rewardToken.address, recipient, toHex(amount)])
    );
    return calldatas;
  }
  /**
   *
   * Note:  A `tokenId` can be staked in many programs but to claim rewards and continue the program you must unstake, claim, and then restake.
   * @param incentiveKeys An IncentiveKey or array of IncentiveKeys that `tokenId` is staked in.
   * Input an array of IncentiveKeys to claim rewards for each program.
   * @param options ClaimOptions to specify tokenId, recipient, and amount wanting to collect.
   * Note that you can only specify one amount and one recipient across the various programs if you are collecting from multiple programs at once.
   * @returns
   */
  static collectRewards(incentiveKeys, options) {
    incentiveKeys = Array.isArray(incentiveKeys) ? incentiveKeys : [incentiveKeys];
    let calldatas = [];
    for (let i = 0; i < incentiveKeys.length; i++) {
      const incentiveKey = incentiveKeys[i];
      calldatas = calldatas.concat(this.encodeClaim(incentiveKey, options));
      calldatas.push(
        _Staker.INTERFACE.encodeFunctionData("stakeToken", [
          this._encodeIncentiveKey(incentiveKey),
          toHex(options.tokenId)
        ])
      );
    }
    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value: toHex(0)
    };
  }
  /**
   *
   * @param incentiveKeys A list of incentiveKeys to unstake from. Should include all incentiveKeys (unique staking programs) that `options.tokenId` is staked in.
   * @param withdrawOptions Options for producing claim calldata and withdraw calldata. Can't withdraw without unstaking all programs for `tokenId`.
   * @returns Calldata for unstaking, claiming, and withdrawing.
   */
  static withdrawToken(incentiveKeys, withdrawOptions) {
    let calldatas = [];
    incentiveKeys = Array.isArray(incentiveKeys) ? incentiveKeys : [incentiveKeys];
    const claimOptions = {
      tokenId: withdrawOptions.tokenId,
      recipient: withdrawOptions.recipient,
      amount: withdrawOptions.amount
    };
    for (let i = 0; i < incentiveKeys.length; i++) {
      const incentiveKey = incentiveKeys[i];
      calldatas = calldatas.concat(this.encodeClaim(incentiveKey, claimOptions));
    }
    const owner = validateAndParseAddress(withdrawOptions.owner);
    calldatas.push(
      _Staker.INTERFACE.encodeFunctionData("withdrawToken", [
        toHex(withdrawOptions.tokenId),
        owner,
        withdrawOptions.data ? withdrawOptions.data : toHex(0)
      ])
    );
    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value: toHex(0)
    };
  }
  /**
   *
   * @param incentiveKeys A single IncentiveKey or array of IncentiveKeys to be encoded and used in the data parameter in `safeTransferFrom`
   * @returns An IncentiveKey as a string
   */
  static encodeDeposit(incentiveKeys) {
    incentiveKeys = Array.isArray(incentiveKeys) ? incentiveKeys : [incentiveKeys];
    let data;
    if (incentiveKeys.length > 1) {
      const keys = [];
      for (let i = 0; i < incentiveKeys.length; i++) {
        const incentiveKey = incentiveKeys[i];
        keys.push(this._encodeIncentiveKey(incentiveKey));
      }
      data = abi.defaultAbiCoder.encode([`${_Staker.INCENTIVE_KEY_ABI}[]`], [keys]);
    } else {
      data = abi.defaultAbiCoder.encode([_Staker.INCENTIVE_KEY_ABI], [this._encodeIncentiveKey(incentiveKeys[0])]);
    }
    return data;
  }
  /**
   *
   * @param incentiveKey An `IncentiveKey` which represents a unique staking program.
   * @returns An encoded IncentiveKey to be read by ethers
   */
  static _encodeIncentiveKey(incentiveKey) {
    const { token0, token1, fee } = incentiveKey.pool;
    const refundee = validateAndParseAddress(incentiveKey.refundee);
    return {
      rewardToken: incentiveKey.rewardToken.address,
      pool: Pool.getAddress(token0, token1, fee),
      startTime: toHex(incentiveKey.startTime),
      endTime: toHex(incentiveKey.endTime),
      refundee
    };
  }
};
_Staker.INTERFACE = new abi.Interface(IUniswapV3Staker__default.default.abi);
_Staker.INCENTIVE_KEY_ABI = "tuple(address rewardToken, address pool, uint256 startTime, uint256 endTime, address refundee)";
var Staker = _Staker;
var _SwapRouter = class _SwapRouter {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  /**
   * Produces the on-chain method name to call and the hex encoded parameters to pass as arguments for a given trade.
   * @param trade to produce call parameters for
   * @param options options for the call parameters
   */
  static swapCallParameters(trades, options) {
    if (!Array.isArray(trades)) {
      trades = [trades];
    }
    const sampleTrade = trades[0];
    const tokenIn = sampleTrade.inputAmount.currency.wrapped;
    const tokenOut = sampleTrade.outputAmount.currency.wrapped;
    invariant16__default.default(
      trades.every((trade) => trade.inputAmount.currency.wrapped.equals(tokenIn)),
      "TOKEN_IN_DIFF"
    );
    invariant16__default.default(
      trades.every((trade) => trade.outputAmount.currency.wrapped.equals(tokenOut)),
      "TOKEN_OUT_DIFF"
    );
    const calldatas = [];
    const ZERO_IN = CurrencyAmount.fromRawAmount(trades[0].inputAmount.currency, 0);
    const ZERO_OUT = CurrencyAmount.fromRawAmount(trades[0].outputAmount.currency, 0);
    const totalAmountOut = trades.reduce(
      (sum, trade) => sum.add(trade.minimumAmountOut(options.slippageTolerance)),
      ZERO_OUT
    );
    const mustRefund = sampleTrade.inputAmount.currency.isNative && sampleTrade.tradeType === 1 /* EXACT_OUTPUT */;
    const inputIsNative = sampleTrade.inputAmount.currency.isNative;
    const outputIsNative = sampleTrade.outputAmount.currency.isNative;
    const routerMustCustody = outputIsNative || !!options.fee;
    const totalValue = inputIsNative ? trades.reduce((sum, trade) => sum.add(trade.maximumAmountIn(options.slippageTolerance)), ZERO_IN) : ZERO_IN;
    if (options.inputTokenPermit) {
      invariant16__default.default(sampleTrade.inputAmount.currency.isToken, "NON_TOKEN_PERMIT");
      calldatas.push(SelfPermit.encodePermit(sampleTrade.inputAmount.currency, options.inputTokenPermit));
    }
    const recipient = validateAndParseAddress(options.recipient);
    const deadline = toHex(options.deadline);
    for (const trade of trades) {
      for (const { route, inputAmount, outputAmount } of trade.swaps) {
        const amountIn = toHex(trade.maximumAmountIn(options.slippageTolerance, inputAmount).quotient);
        const amountOut = toHex(trade.minimumAmountOut(options.slippageTolerance, outputAmount).quotient);
        const singleHop = route.pools.length === 1;
        if (singleHop) {
          if (trade.tradeType === 0 /* EXACT_INPUT */) {
            const exactInputSingleParams = {
              tokenIn: route.tokenPath[0].address,
              tokenOut: route.tokenPath[1].address,
              fee: route.pools[0].fee,
              recipient: routerMustCustody ? ADDRESS_ZERO : recipient,
              deadline,
              amountIn,
              amountOutMinimum: amountOut,
              sqrtPriceLimitX96: toHex(options.sqrtPriceLimitX96 ?? 0)
            };
            calldatas.push(_SwapRouter.INTERFACE.encodeFunctionData("exactInputSingle", [exactInputSingleParams]));
          } else {
            const exactOutputSingleParams = {
              tokenIn: route.tokenPath[0].address,
              tokenOut: route.tokenPath[1].address,
              fee: route.pools[0].fee,
              recipient: routerMustCustody ? ADDRESS_ZERO : recipient,
              deadline,
              amountOut,
              amountInMaximum: amountIn,
              sqrtPriceLimitX96: toHex(options.sqrtPriceLimitX96 ?? 0)
            };
            calldatas.push(_SwapRouter.INTERFACE.encodeFunctionData("exactOutputSingle", [exactOutputSingleParams]));
          }
        } else {
          invariant16__default.default(options.sqrtPriceLimitX96 === void 0, "MULTIHOP_PRICE_LIMIT");
          const path = encodeRouteToPath(route, trade.tradeType === 1 /* EXACT_OUTPUT */);
          if (trade.tradeType === 0 /* EXACT_INPUT */) {
            const exactInputParams = {
              path,
              recipient: routerMustCustody ? ADDRESS_ZERO : recipient,
              deadline,
              amountIn,
              amountOutMinimum: amountOut
            };
            calldatas.push(_SwapRouter.INTERFACE.encodeFunctionData("exactInput", [exactInputParams]));
          } else {
            const exactOutputParams = {
              path,
              recipient: routerMustCustody ? ADDRESS_ZERO : recipient,
              deadline,
              amountOut,
              amountInMaximum: amountIn
            };
            calldatas.push(_SwapRouter.INTERFACE.encodeFunctionData("exactOutput", [exactOutputParams]));
          }
        }
      }
    }
    if (routerMustCustody) {
      if (!!options.fee) {
        if (outputIsNative) {
          calldatas.push(Payments.encodeUnwrapWETH9(totalAmountOut.quotient, recipient, options.fee));
        } else {
          calldatas.push(
            Payments.encodeSweepToken(
              sampleTrade.outputAmount.currency.wrapped,
              totalAmountOut.quotient,
              recipient,
              options.fee
            )
          );
        }
      } else {
        calldatas.push(Payments.encodeUnwrapWETH9(totalAmountOut.quotient, recipient));
      }
    }
    if (mustRefund) {
      calldatas.push(Payments.encodeRefundETH());
    }
    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value: toHex(totalValue.quotient)
    };
  }
};
_SwapRouter.INTERFACE = new abi.Interface(ISwapRouter__default.default.abi);
var SwapRouter = _SwapRouter;

exports.ADDRESS_ZERO = ADDRESS_ZERO;
exports.FACTORY_ADDRESS = FACTORY_ADDRESS;
exports.FeeAmount = FeeAmount;
exports.FullMath = FullMath;
exports.LiquidityMath = LiquidityMath;
exports.Multicall = Multicall;
exports.NoTickDataProvider = NoTickDataProvider;
exports.NonfungiblePositionManager = NonfungiblePositionManager;
exports.POOL_INIT_CODE_HASH = POOL_INIT_CODE_HASH;
exports.Payments = Payments;
exports.Pool = Pool;
exports.Position = Position;
exports.PositionLibrary = PositionLibrary;
exports.Route = Route;
exports.SelfPermit = SelfPermit;
exports.SqrtPriceMath = SqrtPriceMath;
exports.Staker = Staker;
exports.SwapMath = SwapMath;
exports.SwapQuoter = SwapQuoter;
exports.SwapRouter = SwapRouter;
exports.TICK_SPACINGS = TICK_SPACINGS;
exports.Tick = Tick;
exports.TickLibrary = TickLibrary;
exports.TickList = TickList;
exports.TickListDataProvider = TickListDataProvider;
exports.TickMath = TickMath;
exports.Trade = Trade;
exports.computePoolAddress = computePoolAddress;
exports.encodeRouteToPath = encodeRouteToPath;
exports.encodeSqrtRatioX96 = encodeSqrtRatioX96;
exports.isSorted = isSorted;
exports.maxLiquidityForAmounts = maxLiquidityForAmounts;
exports.mostSignificantBit = mostSignificantBit;
exports.nearestUsableTick = nearestUsableTick;
exports.poolInitCodeHash = poolInitCodeHash;
exports.priceToClosestTick = priceToClosestTick;
exports.subIn256 = subIn256;
exports.tickToPrice = tickToPrice;
exports.toHex = toHex;
exports.tradeComparator = tradeComparator;
exports.v3Swap = v3Swap;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map