'use strict';

var JSBI2 = require('jsbi');
var invariant = require('tiny-invariant');
var _Decimal = require('decimal.js-light');
var _Big = require('big.js');
var toFormat = require('toformat');
var bytes = require('@ethersproject/bytes');
var address = require('@ethersproject/address');
var keccak256 = require('@ethersproject/keccak256');
var strings = require('@ethersproject/strings');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var JSBI2__default = /*#__PURE__*/_interopDefault(JSBI2);
var invariant__default = /*#__PURE__*/_interopDefault(invariant);
var _Decimal__default = /*#__PURE__*/_interopDefault(_Decimal);
var _Big__default = /*#__PURE__*/_interopDefault(_Big);
var toFormat__default = /*#__PURE__*/_interopDefault(toFormat);

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../node_modules/@ethersproject/bignumber/node_modules/bn.js/lib/bn.js
var require_bn = __commonJS({
  "../../node_modules/@ethersproject/bignumber/node_modules/bn.js/lib/bn.js"(exports$1, module) {
    (function(module2, exports2) {
      function assert(val, msg) {
        if (!val) throw new Error(msg || "Assertion failed");
      }
      function inherits(ctor, superCtor) {
        ctor.super_ = superCtor;
        var TempCtor = function() {
        };
        TempCtor.prototype = superCtor.prototype;
        ctor.prototype = new TempCtor();
        ctor.prototype.constructor = ctor;
      }
      function BN2(number, base, endian) {
        if (BN2.isBN(number)) {
          return number;
        }
        this.negative = 0;
        this.words = null;
        this.length = 0;
        this.red = null;
        if (number !== null) {
          if (base === "le" || base === "be") {
            endian = base;
            base = 10;
          }
          this._init(number || 0, base || 10, endian || "be");
        }
      }
      if (typeof module2 === "object") {
        module2.exports = BN2;
      } else {
        exports2.BN = BN2;
      }
      BN2.BN = BN2;
      BN2.wordSize = 26;
      var Buffer2;
      try {
        if (typeof window !== "undefined" && typeof window.Buffer !== "undefined") {
          Buffer2 = window.Buffer;
        } else {
          Buffer2 = __require("buffer").Buffer;
        }
      } catch (e) {
      }
      BN2.isBN = function isBN(num) {
        if (num instanceof BN2) {
          return true;
        }
        return num !== null && typeof num === "object" && num.constructor.wordSize === BN2.wordSize && Array.isArray(num.words);
      };
      BN2.max = function max(left, right) {
        if (left.cmp(right) > 0) return left;
        return right;
      };
      BN2.min = function min(left, right) {
        if (left.cmp(right) < 0) return left;
        return right;
      };
      BN2.prototype._init = function init(number, base, endian) {
        if (typeof number === "number") {
          return this._initNumber(number, base, endian);
        }
        if (typeof number === "object") {
          return this._initArray(number, base, endian);
        }
        if (base === "hex") {
          base = 16;
        }
        assert(base === (base | 0) && base >= 2 && base <= 36);
        number = number.toString().replace(/\s+/g, "");
        var start = 0;
        if (number[0] === "-") {
          start++;
          this.negative = 1;
        }
        if (start < number.length) {
          if (base === 16) {
            this._parseHex(number, start, endian);
          } else {
            this._parseBase(number, base, start);
            if (endian === "le") {
              this._initArray(this.toArray(), base, endian);
            }
          }
        }
      };
      BN2.prototype._initNumber = function _initNumber(number, base, endian) {
        if (number < 0) {
          this.negative = 1;
          number = -number;
        }
        if (number < 67108864) {
          this.words = [number & 67108863];
          this.length = 1;
        } else if (number < 4503599627370496) {
          this.words = [
            number & 67108863,
            number / 67108864 & 67108863
          ];
          this.length = 2;
        } else {
          assert(number < 9007199254740992);
          this.words = [
            number & 67108863,
            number / 67108864 & 67108863,
            1
          ];
          this.length = 3;
        }
        if (endian !== "le") return;
        this._initArray(this.toArray(), base, endian);
      };
      BN2.prototype._initArray = function _initArray(number, base, endian) {
        assert(typeof number.length === "number");
        if (number.length <= 0) {
          this.words = [0];
          this.length = 1;
          return this;
        }
        this.length = Math.ceil(number.length / 3);
        this.words = new Array(this.length);
        for (var i = 0; i < this.length; i++) {
          this.words[i] = 0;
        }
        var j, w;
        var off = 0;
        if (endian === "be") {
          for (i = number.length - 1, j = 0; i >= 0; i -= 3) {
            w = number[i] | number[i - 1] << 8 | number[i - 2] << 16;
            this.words[j] |= w << off & 67108863;
            this.words[j + 1] = w >>> 26 - off & 67108863;
            off += 24;
            if (off >= 26) {
              off -= 26;
              j++;
            }
          }
        } else if (endian === "le") {
          for (i = 0, j = 0; i < number.length; i += 3) {
            w = number[i] | number[i + 1] << 8 | number[i + 2] << 16;
            this.words[j] |= w << off & 67108863;
            this.words[j + 1] = w >>> 26 - off & 67108863;
            off += 24;
            if (off >= 26) {
              off -= 26;
              j++;
            }
          }
        }
        return this._strip();
      };
      function parseHex4Bits(string, index) {
        var c = string.charCodeAt(index);
        if (c >= 48 && c <= 57) {
          return c - 48;
        } else if (c >= 65 && c <= 70) {
          return c - 55;
        } else if (c >= 97 && c <= 102) {
          return c - 87;
        } else {
          assert(false, "Invalid character in " + string);
        }
      }
      function parseHexByte(string, lowerBound, index) {
        var r = parseHex4Bits(string, index);
        if (index - 1 >= lowerBound) {
          r |= parseHex4Bits(string, index - 1) << 4;
        }
        return r;
      }
      BN2.prototype._parseHex = function _parseHex(number, start, endian) {
        this.length = Math.ceil((number.length - start) / 6);
        this.words = new Array(this.length);
        for (var i = 0; i < this.length; i++) {
          this.words[i] = 0;
        }
        var off = 0;
        var j = 0;
        var w;
        if (endian === "be") {
          for (i = number.length - 1; i >= start; i -= 2) {
            w = parseHexByte(number, start, i) << off;
            this.words[j] |= w & 67108863;
            if (off >= 18) {
              off -= 18;
              j += 1;
              this.words[j] |= w >>> 26;
            } else {
              off += 8;
            }
          }
        } else {
          var parseLength = number.length - start;
          for (i = parseLength % 2 === 0 ? start + 1 : start; i < number.length; i += 2) {
            w = parseHexByte(number, start, i) << off;
            this.words[j] |= w & 67108863;
            if (off >= 18) {
              off -= 18;
              j += 1;
              this.words[j] |= w >>> 26;
            } else {
              off += 8;
            }
          }
        }
        this._strip();
      };
      function parseBase(str, start, end, mul) {
        var r = 0;
        var b = 0;
        var len = Math.min(str.length, end);
        for (var i = start; i < len; i++) {
          var c = str.charCodeAt(i) - 48;
          r *= mul;
          if (c >= 49) {
            b = c - 49 + 10;
          } else if (c >= 17) {
            b = c - 17 + 10;
          } else {
            b = c;
          }
          assert(c >= 0 && b < mul, "Invalid character");
          r += b;
        }
        return r;
      }
      BN2.prototype._parseBase = function _parseBase(number, base, start) {
        this.words = [0];
        this.length = 1;
        for (var limbLen = 0, limbPow = 1; limbPow <= 67108863; limbPow *= base) {
          limbLen++;
        }
        limbLen--;
        limbPow = limbPow / base | 0;
        var total = number.length - start;
        var mod = total % limbLen;
        var end = Math.min(total, total - mod) + start;
        var word = 0;
        for (var i = start; i < end; i += limbLen) {
          word = parseBase(number, i, i + limbLen, base);
          this.imuln(limbPow);
          if (this.words[0] + word < 67108864) {
            this.words[0] += word;
          } else {
            this._iaddn(word);
          }
        }
        if (mod !== 0) {
          var pow = 1;
          word = parseBase(number, i, number.length, base);
          for (i = 0; i < mod; i++) {
            pow *= base;
          }
          this.imuln(pow);
          if (this.words[0] + word < 67108864) {
            this.words[0] += word;
          } else {
            this._iaddn(word);
          }
        }
        this._strip();
      };
      BN2.prototype.copy = function copy(dest) {
        dest.words = new Array(this.length);
        for (var i = 0; i < this.length; i++) {
          dest.words[i] = this.words[i];
        }
        dest.length = this.length;
        dest.negative = this.negative;
        dest.red = this.red;
      };
      function move(dest, src) {
        dest.words = src.words;
        dest.length = src.length;
        dest.negative = src.negative;
        dest.red = src.red;
      }
      BN2.prototype._move = function _move(dest) {
        move(dest, this);
      };
      BN2.prototype.clone = function clone() {
        var r = new BN2(null);
        this.copy(r);
        return r;
      };
      BN2.prototype._expand = function _expand(size) {
        while (this.length < size) {
          this.words[this.length++] = 0;
        }
        return this;
      };
      BN2.prototype._strip = function strip() {
        while (this.length > 1 && this.words[this.length - 1] === 0) {
          this.length--;
        }
        return this._normSign();
      };
      BN2.prototype._normSign = function _normSign() {
        if (this.length === 1 && this.words[0] === 0) {
          this.negative = 0;
        }
        return this;
      };
      if (typeof Symbol !== "undefined" && typeof Symbol.for === "function") {
        try {
          BN2.prototype[/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")] = inspect;
        } catch (e) {
          BN2.prototype.inspect = inspect;
        }
      } else {
        BN2.prototype.inspect = inspect;
      }
      function inspect() {
        return (this.red ? "<BN-R: " : "<BN: ") + this.toString(16) + ">";
      }
      var zeros = [
        "",
        "0",
        "00",
        "000",
        "0000",
        "00000",
        "000000",
        "0000000",
        "00000000",
        "000000000",
        "0000000000",
        "00000000000",
        "000000000000",
        "0000000000000",
        "00000000000000",
        "000000000000000",
        "0000000000000000",
        "00000000000000000",
        "000000000000000000",
        "0000000000000000000",
        "00000000000000000000",
        "000000000000000000000",
        "0000000000000000000000",
        "00000000000000000000000",
        "000000000000000000000000",
        "0000000000000000000000000"
      ];
      var groupSizes = [
        0,
        0,
        25,
        16,
        12,
        11,
        10,
        9,
        8,
        8,
        7,
        7,
        7,
        7,
        6,
        6,
        6,
        6,
        6,
        6,
        6,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5,
        5
      ];
      var groupBases = [
        0,
        0,
        33554432,
        43046721,
        16777216,
        48828125,
        60466176,
        40353607,
        16777216,
        43046721,
        1e7,
        19487171,
        35831808,
        62748517,
        7529536,
        11390625,
        16777216,
        24137569,
        34012224,
        47045881,
        64e6,
        4084101,
        5153632,
        6436343,
        7962624,
        9765625,
        11881376,
        14348907,
        17210368,
        20511149,
        243e5,
        28629151,
        33554432,
        39135393,
        45435424,
        52521875,
        60466176
      ];
      BN2.prototype.toString = function toString(base, padding) {
        base = base || 10;
        padding = padding | 0 || 1;
        var out;
        if (base === 16 || base === "hex") {
          out = "";
          var off = 0;
          var carry = 0;
          for (var i = 0; i < this.length; i++) {
            var w = this.words[i];
            var word = ((w << off | carry) & 16777215).toString(16);
            carry = w >>> 24 - off & 16777215;
            off += 2;
            if (off >= 26) {
              off -= 26;
              i--;
            }
            if (carry !== 0 || i !== this.length - 1) {
              out = zeros[6 - word.length] + word + out;
            } else {
              out = word + out;
            }
          }
          if (carry !== 0) {
            out = carry.toString(16) + out;
          }
          while (out.length % padding !== 0) {
            out = "0" + out;
          }
          if (this.negative !== 0) {
            out = "-" + out;
          }
          return out;
        }
        if (base === (base | 0) && base >= 2 && base <= 36) {
          var groupSize = groupSizes[base];
          var groupBase = groupBases[base];
          out = "";
          var c = this.clone();
          c.negative = 0;
          while (!c.isZero()) {
            var r = c.modrn(groupBase).toString(base);
            c = c.idivn(groupBase);
            if (!c.isZero()) {
              out = zeros[groupSize - r.length] + r + out;
            } else {
              out = r + out;
            }
          }
          if (this.isZero()) {
            out = "0" + out;
          }
          while (out.length % padding !== 0) {
            out = "0" + out;
          }
          if (this.negative !== 0) {
            out = "-" + out;
          }
          return out;
        }
        assert(false, "Base should be between 2 and 36");
      };
      BN2.prototype.toNumber = function toNumber() {
        var ret = this.words[0];
        if (this.length === 2) {
          ret += this.words[1] * 67108864;
        } else if (this.length === 3 && this.words[2] === 1) {
          ret += 4503599627370496 + this.words[1] * 67108864;
        } else if (this.length > 2) {
          assert(false, "Number can only safely store up to 53 bits");
        }
        return this.negative !== 0 ? -ret : ret;
      };
      BN2.prototype.toJSON = function toJSON() {
        return this.toString(16, 2);
      };
      if (Buffer2) {
        BN2.prototype.toBuffer = function toBuffer(endian, length) {
          return this.toArrayLike(Buffer2, endian, length);
        };
      }
      BN2.prototype.toArray = function toArray(endian, length) {
        return this.toArrayLike(Array, endian, length);
      };
      var allocate = function allocate2(ArrayType, size) {
        if (ArrayType.allocUnsafe) {
          return ArrayType.allocUnsafe(size);
        }
        return new ArrayType(size);
      };
      BN2.prototype.toArrayLike = function toArrayLike(ArrayType, endian, length) {
        this._strip();
        var byteLength = this.byteLength();
        var reqLength = length || Math.max(1, byteLength);
        assert(byteLength <= reqLength, "byte array longer than desired length");
        assert(reqLength > 0, "Requested array length <= 0");
        var res = allocate(ArrayType, reqLength);
        var postfix = endian === "le" ? "LE" : "BE";
        this["_toArrayLike" + postfix](res, byteLength);
        return res;
      };
      BN2.prototype._toArrayLikeLE = function _toArrayLikeLE(res, byteLength) {
        var position = 0;
        var carry = 0;
        for (var i = 0, shift = 0; i < this.length; i++) {
          var word = this.words[i] << shift | carry;
          res[position++] = word & 255;
          if (position < res.length) {
            res[position++] = word >> 8 & 255;
          }
          if (position < res.length) {
            res[position++] = word >> 16 & 255;
          }
          if (shift === 6) {
            if (position < res.length) {
              res[position++] = word >> 24 & 255;
            }
            carry = 0;
            shift = 0;
          } else {
            carry = word >>> 24;
            shift += 2;
          }
        }
        if (position < res.length) {
          res[position++] = carry;
          while (position < res.length) {
            res[position++] = 0;
          }
        }
      };
      BN2.prototype._toArrayLikeBE = function _toArrayLikeBE(res, byteLength) {
        var position = res.length - 1;
        var carry = 0;
        for (var i = 0, shift = 0; i < this.length; i++) {
          var word = this.words[i] << shift | carry;
          res[position--] = word & 255;
          if (position >= 0) {
            res[position--] = word >> 8 & 255;
          }
          if (position >= 0) {
            res[position--] = word >> 16 & 255;
          }
          if (shift === 6) {
            if (position >= 0) {
              res[position--] = word >> 24 & 255;
            }
            carry = 0;
            shift = 0;
          } else {
            carry = word >>> 24;
            shift += 2;
          }
        }
        if (position >= 0) {
          res[position--] = carry;
          while (position >= 0) {
            res[position--] = 0;
          }
        }
      };
      if (Math.clz32) {
        BN2.prototype._countBits = function _countBits(w) {
          return 32 - Math.clz32(w);
        };
      } else {
        BN2.prototype._countBits = function _countBits(w) {
          var t = w;
          var r = 0;
          if (t >= 4096) {
            r += 13;
            t >>>= 13;
          }
          if (t >= 64) {
            r += 7;
            t >>>= 7;
          }
          if (t >= 8) {
            r += 4;
            t >>>= 4;
          }
          if (t >= 2) {
            r += 2;
            t >>>= 2;
          }
          return r + t;
        };
      }
      BN2.prototype._zeroBits = function _zeroBits(w) {
        if (w === 0) return 26;
        var t = w;
        var r = 0;
        if ((t & 8191) === 0) {
          r += 13;
          t >>>= 13;
        }
        if ((t & 127) === 0) {
          r += 7;
          t >>>= 7;
        }
        if ((t & 15) === 0) {
          r += 4;
          t >>>= 4;
        }
        if ((t & 3) === 0) {
          r += 2;
          t >>>= 2;
        }
        if ((t & 1) === 0) {
          r++;
        }
        return r;
      };
      BN2.prototype.bitLength = function bitLength() {
        var w = this.words[this.length - 1];
        var hi = this._countBits(w);
        return (this.length - 1) * 26 + hi;
      };
      function toBitArray(num) {
        var w = new Array(num.bitLength());
        for (var bit = 0; bit < w.length; bit++) {
          var off = bit / 26 | 0;
          var wbit = bit % 26;
          w[bit] = num.words[off] >>> wbit & 1;
        }
        return w;
      }
      BN2.prototype.zeroBits = function zeroBits() {
        if (this.isZero()) return 0;
        var r = 0;
        for (var i = 0; i < this.length; i++) {
          var b = this._zeroBits(this.words[i]);
          r += b;
          if (b !== 26) break;
        }
        return r;
      };
      BN2.prototype.byteLength = function byteLength() {
        return Math.ceil(this.bitLength() / 8);
      };
      BN2.prototype.toTwos = function toTwos(width) {
        if (this.negative !== 0) {
          return this.abs().inotn(width).iaddn(1);
        }
        return this.clone();
      };
      BN2.prototype.fromTwos = function fromTwos(width) {
        if (this.testn(width - 1)) {
          return this.notn(width).iaddn(1).ineg();
        }
        return this.clone();
      };
      BN2.prototype.isNeg = function isNeg() {
        return this.negative !== 0;
      };
      BN2.prototype.neg = function neg() {
        return this.clone().ineg();
      };
      BN2.prototype.ineg = function ineg() {
        if (!this.isZero()) {
          this.negative ^= 1;
        }
        return this;
      };
      BN2.prototype.iuor = function iuor(num) {
        while (this.length < num.length) {
          this.words[this.length++] = 0;
        }
        for (var i = 0; i < num.length; i++) {
          this.words[i] = this.words[i] | num.words[i];
        }
        return this._strip();
      };
      BN2.prototype.ior = function ior(num) {
        assert((this.negative | num.negative) === 0);
        return this.iuor(num);
      };
      BN2.prototype.or = function or(num) {
        if (this.length > num.length) return this.clone().ior(num);
        return num.clone().ior(this);
      };
      BN2.prototype.uor = function uor(num) {
        if (this.length > num.length) return this.clone().iuor(num);
        return num.clone().iuor(this);
      };
      BN2.prototype.iuand = function iuand(num) {
        var b;
        if (this.length > num.length) {
          b = num;
        } else {
          b = this;
        }
        for (var i = 0; i < b.length; i++) {
          this.words[i] = this.words[i] & num.words[i];
        }
        this.length = b.length;
        return this._strip();
      };
      BN2.prototype.iand = function iand(num) {
        assert((this.negative | num.negative) === 0);
        return this.iuand(num);
      };
      BN2.prototype.and = function and(num) {
        if (this.length > num.length) return this.clone().iand(num);
        return num.clone().iand(this);
      };
      BN2.prototype.uand = function uand(num) {
        if (this.length > num.length) return this.clone().iuand(num);
        return num.clone().iuand(this);
      };
      BN2.prototype.iuxor = function iuxor(num) {
        var a;
        var b;
        if (this.length > num.length) {
          a = this;
          b = num;
        } else {
          a = num;
          b = this;
        }
        for (var i = 0; i < b.length; i++) {
          this.words[i] = a.words[i] ^ b.words[i];
        }
        if (this !== a) {
          for (; i < a.length; i++) {
            this.words[i] = a.words[i];
          }
        }
        this.length = a.length;
        return this._strip();
      };
      BN2.prototype.ixor = function ixor(num) {
        assert((this.negative | num.negative) === 0);
        return this.iuxor(num);
      };
      BN2.prototype.xor = function xor(num) {
        if (this.length > num.length) return this.clone().ixor(num);
        return num.clone().ixor(this);
      };
      BN2.prototype.uxor = function uxor(num) {
        if (this.length > num.length) return this.clone().iuxor(num);
        return num.clone().iuxor(this);
      };
      BN2.prototype.inotn = function inotn(width) {
        assert(typeof width === "number" && width >= 0);
        var bytesNeeded = Math.ceil(width / 26) | 0;
        var bitsLeft = width % 26;
        this._expand(bytesNeeded);
        if (bitsLeft > 0) {
          bytesNeeded--;
        }
        for (var i = 0; i < bytesNeeded; i++) {
          this.words[i] = ~this.words[i] & 67108863;
        }
        if (bitsLeft > 0) {
          this.words[i] = ~this.words[i] & 67108863 >> 26 - bitsLeft;
        }
        return this._strip();
      };
      BN2.prototype.notn = function notn(width) {
        return this.clone().inotn(width);
      };
      BN2.prototype.setn = function setn(bit, val) {
        assert(typeof bit === "number" && bit >= 0);
        var off = bit / 26 | 0;
        var wbit = bit % 26;
        this._expand(off + 1);
        if (val) {
          this.words[off] = this.words[off] | 1 << wbit;
        } else {
          this.words[off] = this.words[off] & ~(1 << wbit);
        }
        return this._strip();
      };
      BN2.prototype.iadd = function iadd(num) {
        var r;
        if (this.negative !== 0 && num.negative === 0) {
          this.negative = 0;
          r = this.isub(num);
          this.negative ^= 1;
          return this._normSign();
        } else if (this.negative === 0 && num.negative !== 0) {
          num.negative = 0;
          r = this.isub(num);
          num.negative = 1;
          return r._normSign();
        }
        var a, b;
        if (this.length > num.length) {
          a = this;
          b = num;
        } else {
          a = num;
          b = this;
        }
        var carry = 0;
        for (var i = 0; i < b.length; i++) {
          r = (a.words[i] | 0) + (b.words[i] | 0) + carry;
          this.words[i] = r & 67108863;
          carry = r >>> 26;
        }
        for (; carry !== 0 && i < a.length; i++) {
          r = (a.words[i] | 0) + carry;
          this.words[i] = r & 67108863;
          carry = r >>> 26;
        }
        this.length = a.length;
        if (carry !== 0) {
          this.words[this.length] = carry;
          this.length++;
        } else if (a !== this) {
          for (; i < a.length; i++) {
            this.words[i] = a.words[i];
          }
        }
        return this;
      };
      BN2.prototype.add = function add(num) {
        var res;
        if (num.negative !== 0 && this.negative === 0) {
          num.negative = 0;
          res = this.sub(num);
          num.negative ^= 1;
          return res;
        } else if (num.negative === 0 && this.negative !== 0) {
          this.negative = 0;
          res = num.sub(this);
          this.negative = 1;
          return res;
        }
        if (this.length > num.length) return this.clone().iadd(num);
        return num.clone().iadd(this);
      };
      BN2.prototype.isub = function isub(num) {
        if (num.negative !== 0) {
          num.negative = 0;
          var r = this.iadd(num);
          num.negative = 1;
          return r._normSign();
        } else if (this.negative !== 0) {
          this.negative = 0;
          this.iadd(num);
          this.negative = 1;
          return this._normSign();
        }
        var cmp = this.cmp(num);
        if (cmp === 0) {
          this.negative = 0;
          this.length = 1;
          this.words[0] = 0;
          return this;
        }
        var a, b;
        if (cmp > 0) {
          a = this;
          b = num;
        } else {
          a = num;
          b = this;
        }
        var carry = 0;
        for (var i = 0; i < b.length; i++) {
          r = (a.words[i] | 0) - (b.words[i] | 0) + carry;
          carry = r >> 26;
          this.words[i] = r & 67108863;
        }
        for (; carry !== 0 && i < a.length; i++) {
          r = (a.words[i] | 0) + carry;
          carry = r >> 26;
          this.words[i] = r & 67108863;
        }
        if (carry === 0 && i < a.length && a !== this) {
          for (; i < a.length; i++) {
            this.words[i] = a.words[i];
          }
        }
        this.length = Math.max(this.length, i);
        if (a !== this) {
          this.negative = 1;
        }
        return this._strip();
      };
      BN2.prototype.sub = function sub(num) {
        return this.clone().isub(num);
      };
      function smallMulTo(self, num, out) {
        out.negative = num.negative ^ self.negative;
        var len = self.length + num.length | 0;
        out.length = len;
        len = len - 1 | 0;
        var a = self.words[0] | 0;
        var b = num.words[0] | 0;
        var r = a * b;
        var lo = r & 67108863;
        var carry = r / 67108864 | 0;
        out.words[0] = lo;
        for (var k = 1; k < len; k++) {
          var ncarry = carry >>> 26;
          var rword = carry & 67108863;
          var maxJ = Math.min(k, num.length - 1);
          for (var j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
            var i = k - j | 0;
            a = self.words[i] | 0;
            b = num.words[j] | 0;
            r = a * b + rword;
            ncarry += r / 67108864 | 0;
            rword = r & 67108863;
          }
          out.words[k] = rword | 0;
          carry = ncarry | 0;
        }
        if (carry !== 0) {
          out.words[k] = carry | 0;
        } else {
          out.length--;
        }
        return out._strip();
      }
      var comb10MulTo = function comb10MulTo2(self, num, out) {
        var a = self.words;
        var b = num.words;
        var o = out.words;
        var c = 0;
        var lo;
        var mid;
        var hi;
        var a0 = a[0] | 0;
        var al0 = a0 & 8191;
        var ah0 = a0 >>> 13;
        var a1 = a[1] | 0;
        var al1 = a1 & 8191;
        var ah1 = a1 >>> 13;
        var a2 = a[2] | 0;
        var al2 = a2 & 8191;
        var ah2 = a2 >>> 13;
        var a3 = a[3] | 0;
        var al3 = a3 & 8191;
        var ah3 = a3 >>> 13;
        var a4 = a[4] | 0;
        var al4 = a4 & 8191;
        var ah4 = a4 >>> 13;
        var a5 = a[5] | 0;
        var al5 = a5 & 8191;
        var ah5 = a5 >>> 13;
        var a6 = a[6] | 0;
        var al6 = a6 & 8191;
        var ah6 = a6 >>> 13;
        var a7 = a[7] | 0;
        var al7 = a7 & 8191;
        var ah7 = a7 >>> 13;
        var a8 = a[8] | 0;
        var al8 = a8 & 8191;
        var ah8 = a8 >>> 13;
        var a9 = a[9] | 0;
        var al9 = a9 & 8191;
        var ah9 = a9 >>> 13;
        var b0 = b[0] | 0;
        var bl0 = b0 & 8191;
        var bh0 = b0 >>> 13;
        var b1 = b[1] | 0;
        var bl1 = b1 & 8191;
        var bh1 = b1 >>> 13;
        var b2 = b[2] | 0;
        var bl2 = b2 & 8191;
        var bh2 = b2 >>> 13;
        var b3 = b[3] | 0;
        var bl3 = b3 & 8191;
        var bh3 = b3 >>> 13;
        var b4 = b[4] | 0;
        var bl4 = b4 & 8191;
        var bh4 = b4 >>> 13;
        var b5 = b[5] | 0;
        var bl5 = b5 & 8191;
        var bh5 = b5 >>> 13;
        var b6 = b[6] | 0;
        var bl6 = b6 & 8191;
        var bh6 = b6 >>> 13;
        var b7 = b[7] | 0;
        var bl7 = b7 & 8191;
        var bh7 = b7 >>> 13;
        var b8 = b[8] | 0;
        var bl8 = b8 & 8191;
        var bh8 = b8 >>> 13;
        var b9 = b[9] | 0;
        var bl9 = b9 & 8191;
        var bh9 = b9 >>> 13;
        out.negative = self.negative ^ num.negative;
        out.length = 19;
        lo = Math.imul(al0, bl0);
        mid = Math.imul(al0, bh0);
        mid = mid + Math.imul(ah0, bl0) | 0;
        hi = Math.imul(ah0, bh0);
        var w0 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w0 >>> 26) | 0;
        w0 &= 67108863;
        lo = Math.imul(al1, bl0);
        mid = Math.imul(al1, bh0);
        mid = mid + Math.imul(ah1, bl0) | 0;
        hi = Math.imul(ah1, bh0);
        lo = lo + Math.imul(al0, bl1) | 0;
        mid = mid + Math.imul(al0, bh1) | 0;
        mid = mid + Math.imul(ah0, bl1) | 0;
        hi = hi + Math.imul(ah0, bh1) | 0;
        var w1 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w1 >>> 26) | 0;
        w1 &= 67108863;
        lo = Math.imul(al2, bl0);
        mid = Math.imul(al2, bh0);
        mid = mid + Math.imul(ah2, bl0) | 0;
        hi = Math.imul(ah2, bh0);
        lo = lo + Math.imul(al1, bl1) | 0;
        mid = mid + Math.imul(al1, bh1) | 0;
        mid = mid + Math.imul(ah1, bl1) | 0;
        hi = hi + Math.imul(ah1, bh1) | 0;
        lo = lo + Math.imul(al0, bl2) | 0;
        mid = mid + Math.imul(al0, bh2) | 0;
        mid = mid + Math.imul(ah0, bl2) | 0;
        hi = hi + Math.imul(ah0, bh2) | 0;
        var w2 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w2 >>> 26) | 0;
        w2 &= 67108863;
        lo = Math.imul(al3, bl0);
        mid = Math.imul(al3, bh0);
        mid = mid + Math.imul(ah3, bl0) | 0;
        hi = Math.imul(ah3, bh0);
        lo = lo + Math.imul(al2, bl1) | 0;
        mid = mid + Math.imul(al2, bh1) | 0;
        mid = mid + Math.imul(ah2, bl1) | 0;
        hi = hi + Math.imul(ah2, bh1) | 0;
        lo = lo + Math.imul(al1, bl2) | 0;
        mid = mid + Math.imul(al1, bh2) | 0;
        mid = mid + Math.imul(ah1, bl2) | 0;
        hi = hi + Math.imul(ah1, bh2) | 0;
        lo = lo + Math.imul(al0, bl3) | 0;
        mid = mid + Math.imul(al0, bh3) | 0;
        mid = mid + Math.imul(ah0, bl3) | 0;
        hi = hi + Math.imul(ah0, bh3) | 0;
        var w3 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w3 >>> 26) | 0;
        w3 &= 67108863;
        lo = Math.imul(al4, bl0);
        mid = Math.imul(al4, bh0);
        mid = mid + Math.imul(ah4, bl0) | 0;
        hi = Math.imul(ah4, bh0);
        lo = lo + Math.imul(al3, bl1) | 0;
        mid = mid + Math.imul(al3, bh1) | 0;
        mid = mid + Math.imul(ah3, bl1) | 0;
        hi = hi + Math.imul(ah3, bh1) | 0;
        lo = lo + Math.imul(al2, bl2) | 0;
        mid = mid + Math.imul(al2, bh2) | 0;
        mid = mid + Math.imul(ah2, bl2) | 0;
        hi = hi + Math.imul(ah2, bh2) | 0;
        lo = lo + Math.imul(al1, bl3) | 0;
        mid = mid + Math.imul(al1, bh3) | 0;
        mid = mid + Math.imul(ah1, bl3) | 0;
        hi = hi + Math.imul(ah1, bh3) | 0;
        lo = lo + Math.imul(al0, bl4) | 0;
        mid = mid + Math.imul(al0, bh4) | 0;
        mid = mid + Math.imul(ah0, bl4) | 0;
        hi = hi + Math.imul(ah0, bh4) | 0;
        var w4 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w4 >>> 26) | 0;
        w4 &= 67108863;
        lo = Math.imul(al5, bl0);
        mid = Math.imul(al5, bh0);
        mid = mid + Math.imul(ah5, bl0) | 0;
        hi = Math.imul(ah5, bh0);
        lo = lo + Math.imul(al4, bl1) | 0;
        mid = mid + Math.imul(al4, bh1) | 0;
        mid = mid + Math.imul(ah4, bl1) | 0;
        hi = hi + Math.imul(ah4, bh1) | 0;
        lo = lo + Math.imul(al3, bl2) | 0;
        mid = mid + Math.imul(al3, bh2) | 0;
        mid = mid + Math.imul(ah3, bl2) | 0;
        hi = hi + Math.imul(ah3, bh2) | 0;
        lo = lo + Math.imul(al2, bl3) | 0;
        mid = mid + Math.imul(al2, bh3) | 0;
        mid = mid + Math.imul(ah2, bl3) | 0;
        hi = hi + Math.imul(ah2, bh3) | 0;
        lo = lo + Math.imul(al1, bl4) | 0;
        mid = mid + Math.imul(al1, bh4) | 0;
        mid = mid + Math.imul(ah1, bl4) | 0;
        hi = hi + Math.imul(ah1, bh4) | 0;
        lo = lo + Math.imul(al0, bl5) | 0;
        mid = mid + Math.imul(al0, bh5) | 0;
        mid = mid + Math.imul(ah0, bl5) | 0;
        hi = hi + Math.imul(ah0, bh5) | 0;
        var w5 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w5 >>> 26) | 0;
        w5 &= 67108863;
        lo = Math.imul(al6, bl0);
        mid = Math.imul(al6, bh0);
        mid = mid + Math.imul(ah6, bl0) | 0;
        hi = Math.imul(ah6, bh0);
        lo = lo + Math.imul(al5, bl1) | 0;
        mid = mid + Math.imul(al5, bh1) | 0;
        mid = mid + Math.imul(ah5, bl1) | 0;
        hi = hi + Math.imul(ah5, bh1) | 0;
        lo = lo + Math.imul(al4, bl2) | 0;
        mid = mid + Math.imul(al4, bh2) | 0;
        mid = mid + Math.imul(ah4, bl2) | 0;
        hi = hi + Math.imul(ah4, bh2) | 0;
        lo = lo + Math.imul(al3, bl3) | 0;
        mid = mid + Math.imul(al3, bh3) | 0;
        mid = mid + Math.imul(ah3, bl3) | 0;
        hi = hi + Math.imul(ah3, bh3) | 0;
        lo = lo + Math.imul(al2, bl4) | 0;
        mid = mid + Math.imul(al2, bh4) | 0;
        mid = mid + Math.imul(ah2, bl4) | 0;
        hi = hi + Math.imul(ah2, bh4) | 0;
        lo = lo + Math.imul(al1, bl5) | 0;
        mid = mid + Math.imul(al1, bh5) | 0;
        mid = mid + Math.imul(ah1, bl5) | 0;
        hi = hi + Math.imul(ah1, bh5) | 0;
        lo = lo + Math.imul(al0, bl6) | 0;
        mid = mid + Math.imul(al0, bh6) | 0;
        mid = mid + Math.imul(ah0, bl6) | 0;
        hi = hi + Math.imul(ah0, bh6) | 0;
        var w6 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w6 >>> 26) | 0;
        w6 &= 67108863;
        lo = Math.imul(al7, bl0);
        mid = Math.imul(al7, bh0);
        mid = mid + Math.imul(ah7, bl0) | 0;
        hi = Math.imul(ah7, bh0);
        lo = lo + Math.imul(al6, bl1) | 0;
        mid = mid + Math.imul(al6, bh1) | 0;
        mid = mid + Math.imul(ah6, bl1) | 0;
        hi = hi + Math.imul(ah6, bh1) | 0;
        lo = lo + Math.imul(al5, bl2) | 0;
        mid = mid + Math.imul(al5, bh2) | 0;
        mid = mid + Math.imul(ah5, bl2) | 0;
        hi = hi + Math.imul(ah5, bh2) | 0;
        lo = lo + Math.imul(al4, bl3) | 0;
        mid = mid + Math.imul(al4, bh3) | 0;
        mid = mid + Math.imul(ah4, bl3) | 0;
        hi = hi + Math.imul(ah4, bh3) | 0;
        lo = lo + Math.imul(al3, bl4) | 0;
        mid = mid + Math.imul(al3, bh4) | 0;
        mid = mid + Math.imul(ah3, bl4) | 0;
        hi = hi + Math.imul(ah3, bh4) | 0;
        lo = lo + Math.imul(al2, bl5) | 0;
        mid = mid + Math.imul(al2, bh5) | 0;
        mid = mid + Math.imul(ah2, bl5) | 0;
        hi = hi + Math.imul(ah2, bh5) | 0;
        lo = lo + Math.imul(al1, bl6) | 0;
        mid = mid + Math.imul(al1, bh6) | 0;
        mid = mid + Math.imul(ah1, bl6) | 0;
        hi = hi + Math.imul(ah1, bh6) | 0;
        lo = lo + Math.imul(al0, bl7) | 0;
        mid = mid + Math.imul(al0, bh7) | 0;
        mid = mid + Math.imul(ah0, bl7) | 0;
        hi = hi + Math.imul(ah0, bh7) | 0;
        var w7 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w7 >>> 26) | 0;
        w7 &= 67108863;
        lo = Math.imul(al8, bl0);
        mid = Math.imul(al8, bh0);
        mid = mid + Math.imul(ah8, bl0) | 0;
        hi = Math.imul(ah8, bh0);
        lo = lo + Math.imul(al7, bl1) | 0;
        mid = mid + Math.imul(al7, bh1) | 0;
        mid = mid + Math.imul(ah7, bl1) | 0;
        hi = hi + Math.imul(ah7, bh1) | 0;
        lo = lo + Math.imul(al6, bl2) | 0;
        mid = mid + Math.imul(al6, bh2) | 0;
        mid = mid + Math.imul(ah6, bl2) | 0;
        hi = hi + Math.imul(ah6, bh2) | 0;
        lo = lo + Math.imul(al5, bl3) | 0;
        mid = mid + Math.imul(al5, bh3) | 0;
        mid = mid + Math.imul(ah5, bl3) | 0;
        hi = hi + Math.imul(ah5, bh3) | 0;
        lo = lo + Math.imul(al4, bl4) | 0;
        mid = mid + Math.imul(al4, bh4) | 0;
        mid = mid + Math.imul(ah4, bl4) | 0;
        hi = hi + Math.imul(ah4, bh4) | 0;
        lo = lo + Math.imul(al3, bl5) | 0;
        mid = mid + Math.imul(al3, bh5) | 0;
        mid = mid + Math.imul(ah3, bl5) | 0;
        hi = hi + Math.imul(ah3, bh5) | 0;
        lo = lo + Math.imul(al2, bl6) | 0;
        mid = mid + Math.imul(al2, bh6) | 0;
        mid = mid + Math.imul(ah2, bl6) | 0;
        hi = hi + Math.imul(ah2, bh6) | 0;
        lo = lo + Math.imul(al1, bl7) | 0;
        mid = mid + Math.imul(al1, bh7) | 0;
        mid = mid + Math.imul(ah1, bl7) | 0;
        hi = hi + Math.imul(ah1, bh7) | 0;
        lo = lo + Math.imul(al0, bl8) | 0;
        mid = mid + Math.imul(al0, bh8) | 0;
        mid = mid + Math.imul(ah0, bl8) | 0;
        hi = hi + Math.imul(ah0, bh8) | 0;
        var w8 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w8 >>> 26) | 0;
        w8 &= 67108863;
        lo = Math.imul(al9, bl0);
        mid = Math.imul(al9, bh0);
        mid = mid + Math.imul(ah9, bl0) | 0;
        hi = Math.imul(ah9, bh0);
        lo = lo + Math.imul(al8, bl1) | 0;
        mid = mid + Math.imul(al8, bh1) | 0;
        mid = mid + Math.imul(ah8, bl1) | 0;
        hi = hi + Math.imul(ah8, bh1) | 0;
        lo = lo + Math.imul(al7, bl2) | 0;
        mid = mid + Math.imul(al7, bh2) | 0;
        mid = mid + Math.imul(ah7, bl2) | 0;
        hi = hi + Math.imul(ah7, bh2) | 0;
        lo = lo + Math.imul(al6, bl3) | 0;
        mid = mid + Math.imul(al6, bh3) | 0;
        mid = mid + Math.imul(ah6, bl3) | 0;
        hi = hi + Math.imul(ah6, bh3) | 0;
        lo = lo + Math.imul(al5, bl4) | 0;
        mid = mid + Math.imul(al5, bh4) | 0;
        mid = mid + Math.imul(ah5, bl4) | 0;
        hi = hi + Math.imul(ah5, bh4) | 0;
        lo = lo + Math.imul(al4, bl5) | 0;
        mid = mid + Math.imul(al4, bh5) | 0;
        mid = mid + Math.imul(ah4, bl5) | 0;
        hi = hi + Math.imul(ah4, bh5) | 0;
        lo = lo + Math.imul(al3, bl6) | 0;
        mid = mid + Math.imul(al3, bh6) | 0;
        mid = mid + Math.imul(ah3, bl6) | 0;
        hi = hi + Math.imul(ah3, bh6) | 0;
        lo = lo + Math.imul(al2, bl7) | 0;
        mid = mid + Math.imul(al2, bh7) | 0;
        mid = mid + Math.imul(ah2, bl7) | 0;
        hi = hi + Math.imul(ah2, bh7) | 0;
        lo = lo + Math.imul(al1, bl8) | 0;
        mid = mid + Math.imul(al1, bh8) | 0;
        mid = mid + Math.imul(ah1, bl8) | 0;
        hi = hi + Math.imul(ah1, bh8) | 0;
        lo = lo + Math.imul(al0, bl9) | 0;
        mid = mid + Math.imul(al0, bh9) | 0;
        mid = mid + Math.imul(ah0, bl9) | 0;
        hi = hi + Math.imul(ah0, bh9) | 0;
        var w9 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w9 >>> 26) | 0;
        w9 &= 67108863;
        lo = Math.imul(al9, bl1);
        mid = Math.imul(al9, bh1);
        mid = mid + Math.imul(ah9, bl1) | 0;
        hi = Math.imul(ah9, bh1);
        lo = lo + Math.imul(al8, bl2) | 0;
        mid = mid + Math.imul(al8, bh2) | 0;
        mid = mid + Math.imul(ah8, bl2) | 0;
        hi = hi + Math.imul(ah8, bh2) | 0;
        lo = lo + Math.imul(al7, bl3) | 0;
        mid = mid + Math.imul(al7, bh3) | 0;
        mid = mid + Math.imul(ah7, bl3) | 0;
        hi = hi + Math.imul(ah7, bh3) | 0;
        lo = lo + Math.imul(al6, bl4) | 0;
        mid = mid + Math.imul(al6, bh4) | 0;
        mid = mid + Math.imul(ah6, bl4) | 0;
        hi = hi + Math.imul(ah6, bh4) | 0;
        lo = lo + Math.imul(al5, bl5) | 0;
        mid = mid + Math.imul(al5, bh5) | 0;
        mid = mid + Math.imul(ah5, bl5) | 0;
        hi = hi + Math.imul(ah5, bh5) | 0;
        lo = lo + Math.imul(al4, bl6) | 0;
        mid = mid + Math.imul(al4, bh6) | 0;
        mid = mid + Math.imul(ah4, bl6) | 0;
        hi = hi + Math.imul(ah4, bh6) | 0;
        lo = lo + Math.imul(al3, bl7) | 0;
        mid = mid + Math.imul(al3, bh7) | 0;
        mid = mid + Math.imul(ah3, bl7) | 0;
        hi = hi + Math.imul(ah3, bh7) | 0;
        lo = lo + Math.imul(al2, bl8) | 0;
        mid = mid + Math.imul(al2, bh8) | 0;
        mid = mid + Math.imul(ah2, bl8) | 0;
        hi = hi + Math.imul(ah2, bh8) | 0;
        lo = lo + Math.imul(al1, bl9) | 0;
        mid = mid + Math.imul(al1, bh9) | 0;
        mid = mid + Math.imul(ah1, bl9) | 0;
        hi = hi + Math.imul(ah1, bh9) | 0;
        var w10 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w10 >>> 26) | 0;
        w10 &= 67108863;
        lo = Math.imul(al9, bl2);
        mid = Math.imul(al9, bh2);
        mid = mid + Math.imul(ah9, bl2) | 0;
        hi = Math.imul(ah9, bh2);
        lo = lo + Math.imul(al8, bl3) | 0;
        mid = mid + Math.imul(al8, bh3) | 0;
        mid = mid + Math.imul(ah8, bl3) | 0;
        hi = hi + Math.imul(ah8, bh3) | 0;
        lo = lo + Math.imul(al7, bl4) | 0;
        mid = mid + Math.imul(al7, bh4) | 0;
        mid = mid + Math.imul(ah7, bl4) | 0;
        hi = hi + Math.imul(ah7, bh4) | 0;
        lo = lo + Math.imul(al6, bl5) | 0;
        mid = mid + Math.imul(al6, bh5) | 0;
        mid = mid + Math.imul(ah6, bl5) | 0;
        hi = hi + Math.imul(ah6, bh5) | 0;
        lo = lo + Math.imul(al5, bl6) | 0;
        mid = mid + Math.imul(al5, bh6) | 0;
        mid = mid + Math.imul(ah5, bl6) | 0;
        hi = hi + Math.imul(ah5, bh6) | 0;
        lo = lo + Math.imul(al4, bl7) | 0;
        mid = mid + Math.imul(al4, bh7) | 0;
        mid = mid + Math.imul(ah4, bl7) | 0;
        hi = hi + Math.imul(ah4, bh7) | 0;
        lo = lo + Math.imul(al3, bl8) | 0;
        mid = mid + Math.imul(al3, bh8) | 0;
        mid = mid + Math.imul(ah3, bl8) | 0;
        hi = hi + Math.imul(ah3, bh8) | 0;
        lo = lo + Math.imul(al2, bl9) | 0;
        mid = mid + Math.imul(al2, bh9) | 0;
        mid = mid + Math.imul(ah2, bl9) | 0;
        hi = hi + Math.imul(ah2, bh9) | 0;
        var w11 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w11 >>> 26) | 0;
        w11 &= 67108863;
        lo = Math.imul(al9, bl3);
        mid = Math.imul(al9, bh3);
        mid = mid + Math.imul(ah9, bl3) | 0;
        hi = Math.imul(ah9, bh3);
        lo = lo + Math.imul(al8, bl4) | 0;
        mid = mid + Math.imul(al8, bh4) | 0;
        mid = mid + Math.imul(ah8, bl4) | 0;
        hi = hi + Math.imul(ah8, bh4) | 0;
        lo = lo + Math.imul(al7, bl5) | 0;
        mid = mid + Math.imul(al7, bh5) | 0;
        mid = mid + Math.imul(ah7, bl5) | 0;
        hi = hi + Math.imul(ah7, bh5) | 0;
        lo = lo + Math.imul(al6, bl6) | 0;
        mid = mid + Math.imul(al6, bh6) | 0;
        mid = mid + Math.imul(ah6, bl6) | 0;
        hi = hi + Math.imul(ah6, bh6) | 0;
        lo = lo + Math.imul(al5, bl7) | 0;
        mid = mid + Math.imul(al5, bh7) | 0;
        mid = mid + Math.imul(ah5, bl7) | 0;
        hi = hi + Math.imul(ah5, bh7) | 0;
        lo = lo + Math.imul(al4, bl8) | 0;
        mid = mid + Math.imul(al4, bh8) | 0;
        mid = mid + Math.imul(ah4, bl8) | 0;
        hi = hi + Math.imul(ah4, bh8) | 0;
        lo = lo + Math.imul(al3, bl9) | 0;
        mid = mid + Math.imul(al3, bh9) | 0;
        mid = mid + Math.imul(ah3, bl9) | 0;
        hi = hi + Math.imul(ah3, bh9) | 0;
        var w12 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w12 >>> 26) | 0;
        w12 &= 67108863;
        lo = Math.imul(al9, bl4);
        mid = Math.imul(al9, bh4);
        mid = mid + Math.imul(ah9, bl4) | 0;
        hi = Math.imul(ah9, bh4);
        lo = lo + Math.imul(al8, bl5) | 0;
        mid = mid + Math.imul(al8, bh5) | 0;
        mid = mid + Math.imul(ah8, bl5) | 0;
        hi = hi + Math.imul(ah8, bh5) | 0;
        lo = lo + Math.imul(al7, bl6) | 0;
        mid = mid + Math.imul(al7, bh6) | 0;
        mid = mid + Math.imul(ah7, bl6) | 0;
        hi = hi + Math.imul(ah7, bh6) | 0;
        lo = lo + Math.imul(al6, bl7) | 0;
        mid = mid + Math.imul(al6, bh7) | 0;
        mid = mid + Math.imul(ah6, bl7) | 0;
        hi = hi + Math.imul(ah6, bh7) | 0;
        lo = lo + Math.imul(al5, bl8) | 0;
        mid = mid + Math.imul(al5, bh8) | 0;
        mid = mid + Math.imul(ah5, bl8) | 0;
        hi = hi + Math.imul(ah5, bh8) | 0;
        lo = lo + Math.imul(al4, bl9) | 0;
        mid = mid + Math.imul(al4, bh9) | 0;
        mid = mid + Math.imul(ah4, bl9) | 0;
        hi = hi + Math.imul(ah4, bh9) | 0;
        var w13 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w13 >>> 26) | 0;
        w13 &= 67108863;
        lo = Math.imul(al9, bl5);
        mid = Math.imul(al9, bh5);
        mid = mid + Math.imul(ah9, bl5) | 0;
        hi = Math.imul(ah9, bh5);
        lo = lo + Math.imul(al8, bl6) | 0;
        mid = mid + Math.imul(al8, bh6) | 0;
        mid = mid + Math.imul(ah8, bl6) | 0;
        hi = hi + Math.imul(ah8, bh6) | 0;
        lo = lo + Math.imul(al7, bl7) | 0;
        mid = mid + Math.imul(al7, bh7) | 0;
        mid = mid + Math.imul(ah7, bl7) | 0;
        hi = hi + Math.imul(ah7, bh7) | 0;
        lo = lo + Math.imul(al6, bl8) | 0;
        mid = mid + Math.imul(al6, bh8) | 0;
        mid = mid + Math.imul(ah6, bl8) | 0;
        hi = hi + Math.imul(ah6, bh8) | 0;
        lo = lo + Math.imul(al5, bl9) | 0;
        mid = mid + Math.imul(al5, bh9) | 0;
        mid = mid + Math.imul(ah5, bl9) | 0;
        hi = hi + Math.imul(ah5, bh9) | 0;
        var w14 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w14 >>> 26) | 0;
        w14 &= 67108863;
        lo = Math.imul(al9, bl6);
        mid = Math.imul(al9, bh6);
        mid = mid + Math.imul(ah9, bl6) | 0;
        hi = Math.imul(ah9, bh6);
        lo = lo + Math.imul(al8, bl7) | 0;
        mid = mid + Math.imul(al8, bh7) | 0;
        mid = mid + Math.imul(ah8, bl7) | 0;
        hi = hi + Math.imul(ah8, bh7) | 0;
        lo = lo + Math.imul(al7, bl8) | 0;
        mid = mid + Math.imul(al7, bh8) | 0;
        mid = mid + Math.imul(ah7, bl8) | 0;
        hi = hi + Math.imul(ah7, bh8) | 0;
        lo = lo + Math.imul(al6, bl9) | 0;
        mid = mid + Math.imul(al6, bh9) | 0;
        mid = mid + Math.imul(ah6, bl9) | 0;
        hi = hi + Math.imul(ah6, bh9) | 0;
        var w15 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w15 >>> 26) | 0;
        w15 &= 67108863;
        lo = Math.imul(al9, bl7);
        mid = Math.imul(al9, bh7);
        mid = mid + Math.imul(ah9, bl7) | 0;
        hi = Math.imul(ah9, bh7);
        lo = lo + Math.imul(al8, bl8) | 0;
        mid = mid + Math.imul(al8, bh8) | 0;
        mid = mid + Math.imul(ah8, bl8) | 0;
        hi = hi + Math.imul(ah8, bh8) | 0;
        lo = lo + Math.imul(al7, bl9) | 0;
        mid = mid + Math.imul(al7, bh9) | 0;
        mid = mid + Math.imul(ah7, bl9) | 0;
        hi = hi + Math.imul(ah7, bh9) | 0;
        var w16 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w16 >>> 26) | 0;
        w16 &= 67108863;
        lo = Math.imul(al9, bl8);
        mid = Math.imul(al9, bh8);
        mid = mid + Math.imul(ah9, bl8) | 0;
        hi = Math.imul(ah9, bh8);
        lo = lo + Math.imul(al8, bl9) | 0;
        mid = mid + Math.imul(al8, bh9) | 0;
        mid = mid + Math.imul(ah8, bl9) | 0;
        hi = hi + Math.imul(ah8, bh9) | 0;
        var w17 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w17 >>> 26) | 0;
        w17 &= 67108863;
        lo = Math.imul(al9, bl9);
        mid = Math.imul(al9, bh9);
        mid = mid + Math.imul(ah9, bl9) | 0;
        hi = Math.imul(ah9, bh9);
        var w18 = (c + lo | 0) + ((mid & 8191) << 13) | 0;
        c = (hi + (mid >>> 13) | 0) + (w18 >>> 26) | 0;
        w18 &= 67108863;
        o[0] = w0;
        o[1] = w1;
        o[2] = w2;
        o[3] = w3;
        o[4] = w4;
        o[5] = w5;
        o[6] = w6;
        o[7] = w7;
        o[8] = w8;
        o[9] = w9;
        o[10] = w10;
        o[11] = w11;
        o[12] = w12;
        o[13] = w13;
        o[14] = w14;
        o[15] = w15;
        o[16] = w16;
        o[17] = w17;
        o[18] = w18;
        if (c !== 0) {
          o[19] = c;
          out.length++;
        }
        return out;
      };
      if (!Math.imul) {
        comb10MulTo = smallMulTo;
      }
      function bigMulTo(self, num, out) {
        out.negative = num.negative ^ self.negative;
        out.length = self.length + num.length;
        var carry = 0;
        var hncarry = 0;
        for (var k = 0; k < out.length - 1; k++) {
          var ncarry = hncarry;
          hncarry = 0;
          var rword = carry & 67108863;
          var maxJ = Math.min(k, num.length - 1);
          for (var j = Math.max(0, k - self.length + 1); j <= maxJ; j++) {
            var i = k - j;
            var a = self.words[i] | 0;
            var b = num.words[j] | 0;
            var r = a * b;
            var lo = r & 67108863;
            ncarry = ncarry + (r / 67108864 | 0) | 0;
            lo = lo + rword | 0;
            rword = lo & 67108863;
            ncarry = ncarry + (lo >>> 26) | 0;
            hncarry += ncarry >>> 26;
            ncarry &= 67108863;
          }
          out.words[k] = rword;
          carry = ncarry;
          ncarry = hncarry;
        }
        if (carry !== 0) {
          out.words[k] = carry;
        } else {
          out.length--;
        }
        return out._strip();
      }
      function jumboMulTo(self, num, out) {
        return bigMulTo(self, num, out);
      }
      BN2.prototype.mulTo = function mulTo(num, out) {
        var res;
        var len = this.length + num.length;
        if (this.length === 10 && num.length === 10) {
          res = comb10MulTo(this, num, out);
        } else if (len < 63) {
          res = smallMulTo(this, num, out);
        } else if (len < 1024) {
          res = bigMulTo(this, num, out);
        } else {
          res = jumboMulTo(this, num, out);
        }
        return res;
      };
      BN2.prototype.mul = function mul(num) {
        var out = new BN2(null);
        out.words = new Array(this.length + num.length);
        return this.mulTo(num, out);
      };
      BN2.prototype.mulf = function mulf(num) {
        var out = new BN2(null);
        out.words = new Array(this.length + num.length);
        return jumboMulTo(this, num, out);
      };
      BN2.prototype.imul = function imul(num) {
        return this.clone().mulTo(num, this);
      };
      BN2.prototype.imuln = function imuln(num) {
        var isNegNum = num < 0;
        if (isNegNum) num = -num;
        assert(typeof num === "number");
        assert(num < 67108864);
        var carry = 0;
        for (var i = 0; i < this.length; i++) {
          var w = (this.words[i] | 0) * num;
          var lo = (w & 67108863) + (carry & 67108863);
          carry >>= 26;
          carry += w / 67108864 | 0;
          carry += lo >>> 26;
          this.words[i] = lo & 67108863;
        }
        if (carry !== 0) {
          this.words[i] = carry;
          this.length++;
        }
        this.length = num === 0 ? 1 : this.length;
        return isNegNum ? this.ineg() : this;
      };
      BN2.prototype.muln = function muln(num) {
        return this.clone().imuln(num);
      };
      BN2.prototype.sqr = function sqr() {
        return this.mul(this);
      };
      BN2.prototype.isqr = function isqr() {
        return this.imul(this.clone());
      };
      BN2.prototype.pow = function pow(num) {
        var w = toBitArray(num);
        if (w.length === 0) return new BN2(1);
        var res = this;
        for (var i = 0; i < w.length; i++, res = res.sqr()) {
          if (w[i] !== 0) break;
        }
        if (++i < w.length) {
          for (var q = res.sqr(); i < w.length; i++, q = q.sqr()) {
            if (w[i] === 0) continue;
            res = res.mul(q);
          }
        }
        return res;
      };
      BN2.prototype.iushln = function iushln(bits) {
        assert(typeof bits === "number" && bits >= 0);
        var r = bits % 26;
        var s = (bits - r) / 26;
        var carryMask = 67108863 >>> 26 - r << 26 - r;
        var i;
        if (r !== 0) {
          var carry = 0;
          for (i = 0; i < this.length; i++) {
            var newCarry = this.words[i] & carryMask;
            var c = (this.words[i] | 0) - newCarry << r;
            this.words[i] = c | carry;
            carry = newCarry >>> 26 - r;
          }
          if (carry) {
            this.words[i] = carry;
            this.length++;
          }
        }
        if (s !== 0) {
          for (i = this.length - 1; i >= 0; i--) {
            this.words[i + s] = this.words[i];
          }
          for (i = 0; i < s; i++) {
            this.words[i] = 0;
          }
          this.length += s;
        }
        return this._strip();
      };
      BN2.prototype.ishln = function ishln(bits) {
        assert(this.negative === 0);
        return this.iushln(bits);
      };
      BN2.prototype.iushrn = function iushrn(bits, hint, extended) {
        assert(typeof bits === "number" && bits >= 0);
        var h;
        if (hint) {
          h = (hint - hint % 26) / 26;
        } else {
          h = 0;
        }
        var r = bits % 26;
        var s = Math.min((bits - r) / 26, this.length);
        var mask = 67108863 ^ 67108863 >>> r << r;
        var maskedWords = extended;
        h -= s;
        h = Math.max(0, h);
        if (maskedWords) {
          for (var i = 0; i < s; i++) {
            maskedWords.words[i] = this.words[i];
          }
          maskedWords.length = s;
        }
        if (s === 0) ; else if (this.length > s) {
          this.length -= s;
          for (i = 0; i < this.length; i++) {
            this.words[i] = this.words[i + s];
          }
        } else {
          this.words[0] = 0;
          this.length = 1;
        }
        var carry = 0;
        for (i = this.length - 1; i >= 0 && (carry !== 0 || i >= h); i--) {
          var word = this.words[i] | 0;
          this.words[i] = carry << 26 - r | word >>> r;
          carry = word & mask;
        }
        if (maskedWords && carry !== 0) {
          maskedWords.words[maskedWords.length++] = carry;
        }
        if (this.length === 0) {
          this.words[0] = 0;
          this.length = 1;
        }
        return this._strip();
      };
      BN2.prototype.ishrn = function ishrn(bits, hint, extended) {
        assert(this.negative === 0);
        return this.iushrn(bits, hint, extended);
      };
      BN2.prototype.shln = function shln(bits) {
        return this.clone().ishln(bits);
      };
      BN2.prototype.ushln = function ushln(bits) {
        return this.clone().iushln(bits);
      };
      BN2.prototype.shrn = function shrn(bits) {
        return this.clone().ishrn(bits);
      };
      BN2.prototype.ushrn = function ushrn(bits) {
        return this.clone().iushrn(bits);
      };
      BN2.prototype.testn = function testn(bit) {
        assert(typeof bit === "number" && bit >= 0);
        var r = bit % 26;
        var s = (bit - r) / 26;
        var q = 1 << r;
        if (this.length <= s) return false;
        var w = this.words[s];
        return !!(w & q);
      };
      BN2.prototype.imaskn = function imaskn(bits) {
        assert(typeof bits === "number" && bits >= 0);
        var r = bits % 26;
        var s = (bits - r) / 26;
        assert(this.negative === 0, "imaskn works only with positive numbers");
        if (this.length <= s) {
          return this;
        }
        if (r !== 0) {
          s++;
        }
        this.length = Math.min(s, this.length);
        if (r !== 0) {
          var mask = 67108863 ^ 67108863 >>> r << r;
          this.words[this.length - 1] &= mask;
        }
        return this._strip();
      };
      BN2.prototype.maskn = function maskn(bits) {
        return this.clone().imaskn(bits);
      };
      BN2.prototype.iaddn = function iaddn(num) {
        assert(typeof num === "number");
        assert(num < 67108864);
        if (num < 0) return this.isubn(-num);
        if (this.negative !== 0) {
          if (this.length === 1 && (this.words[0] | 0) <= num) {
            this.words[0] = num - (this.words[0] | 0);
            this.negative = 0;
            return this;
          }
          this.negative = 0;
          this.isubn(num);
          this.negative = 1;
          return this;
        }
        return this._iaddn(num);
      };
      BN2.prototype._iaddn = function _iaddn(num) {
        this.words[0] += num;
        for (var i = 0; i < this.length && this.words[i] >= 67108864; i++) {
          this.words[i] -= 67108864;
          if (i === this.length - 1) {
            this.words[i + 1] = 1;
          } else {
            this.words[i + 1]++;
          }
        }
        this.length = Math.max(this.length, i + 1);
        return this;
      };
      BN2.prototype.isubn = function isubn(num) {
        assert(typeof num === "number");
        assert(num < 67108864);
        if (num < 0) return this.iaddn(-num);
        if (this.negative !== 0) {
          this.negative = 0;
          this.iaddn(num);
          this.negative = 1;
          return this;
        }
        this.words[0] -= num;
        if (this.length === 1 && this.words[0] < 0) {
          this.words[0] = -this.words[0];
          this.negative = 1;
        } else {
          for (var i = 0; i < this.length && this.words[i] < 0; i++) {
            this.words[i] += 67108864;
            this.words[i + 1] -= 1;
          }
        }
        return this._strip();
      };
      BN2.prototype.addn = function addn(num) {
        return this.clone().iaddn(num);
      };
      BN2.prototype.subn = function subn(num) {
        return this.clone().isubn(num);
      };
      BN2.prototype.iabs = function iabs() {
        this.negative = 0;
        return this;
      };
      BN2.prototype.abs = function abs() {
        return this.clone().iabs();
      };
      BN2.prototype._ishlnsubmul = function _ishlnsubmul(num, mul, shift) {
        var len = num.length + shift;
        var i;
        this._expand(len);
        var w;
        var carry = 0;
        for (i = 0; i < num.length; i++) {
          w = (this.words[i + shift] | 0) + carry;
          var right = (num.words[i] | 0) * mul;
          w -= right & 67108863;
          carry = (w >> 26) - (right / 67108864 | 0);
          this.words[i + shift] = w & 67108863;
        }
        for (; i < this.length - shift; i++) {
          w = (this.words[i + shift] | 0) + carry;
          carry = w >> 26;
          this.words[i + shift] = w & 67108863;
        }
        if (carry === 0) return this._strip();
        assert(carry === -1);
        carry = 0;
        for (i = 0; i < this.length; i++) {
          w = -(this.words[i] | 0) + carry;
          carry = w >> 26;
          this.words[i] = w & 67108863;
        }
        this.negative = 1;
        return this._strip();
      };
      BN2.prototype._wordDiv = function _wordDiv(num, mode) {
        var shift = this.length - num.length;
        var a = this.clone();
        var b = num;
        var bhi = b.words[b.length - 1] | 0;
        var bhiBits = this._countBits(bhi);
        shift = 26 - bhiBits;
        if (shift !== 0) {
          b = b.ushln(shift);
          a.iushln(shift);
          bhi = b.words[b.length - 1] | 0;
        }
        var m = a.length - b.length;
        var q;
        if (mode !== "mod") {
          q = new BN2(null);
          q.length = m + 1;
          q.words = new Array(q.length);
          for (var i = 0; i < q.length; i++) {
            q.words[i] = 0;
          }
        }
        var diff = a.clone()._ishlnsubmul(b, 1, m);
        if (diff.negative === 0) {
          a = diff;
          if (q) {
            q.words[m] = 1;
          }
        }
        for (var j = m - 1; j >= 0; j--) {
          var qj = (a.words[b.length + j] | 0) * 67108864 + (a.words[b.length + j - 1] | 0);
          qj = Math.min(qj / bhi | 0, 67108863);
          a._ishlnsubmul(b, qj, j);
          while (a.negative !== 0) {
            qj--;
            a.negative = 0;
            a._ishlnsubmul(b, 1, j);
            if (!a.isZero()) {
              a.negative ^= 1;
            }
          }
          if (q) {
            q.words[j] = qj;
          }
        }
        if (q) {
          q._strip();
        }
        a._strip();
        if (mode !== "div" && shift !== 0) {
          a.iushrn(shift);
        }
        return {
          div: q || null,
          mod: a
        };
      };
      BN2.prototype.divmod = function divmod(num, mode, positive) {
        assert(!num.isZero());
        if (this.isZero()) {
          return {
            div: new BN2(0),
            mod: new BN2(0)
          };
        }
        var div, mod, res;
        if (this.negative !== 0 && num.negative === 0) {
          res = this.neg().divmod(num, mode);
          if (mode !== "mod") {
            div = res.div.neg();
          }
          if (mode !== "div") {
            mod = res.mod.neg();
            if (positive && mod.negative !== 0) {
              mod.iadd(num);
            }
          }
          return {
            div,
            mod
          };
        }
        if (this.negative === 0 && num.negative !== 0) {
          res = this.divmod(num.neg(), mode);
          if (mode !== "mod") {
            div = res.div.neg();
          }
          return {
            div,
            mod: res.mod
          };
        }
        if ((this.negative & num.negative) !== 0) {
          res = this.neg().divmod(num.neg(), mode);
          if (mode !== "div") {
            mod = res.mod.neg();
            if (positive && mod.negative !== 0) {
              mod.isub(num);
            }
          }
          return {
            div: res.div,
            mod
          };
        }
        if (num.length > this.length || this.cmp(num) < 0) {
          return {
            div: new BN2(0),
            mod: this
          };
        }
        if (num.length === 1) {
          if (mode === "div") {
            return {
              div: this.divn(num.words[0]),
              mod: null
            };
          }
          if (mode === "mod") {
            return {
              div: null,
              mod: new BN2(this.modrn(num.words[0]))
            };
          }
          return {
            div: this.divn(num.words[0]),
            mod: new BN2(this.modrn(num.words[0]))
          };
        }
        return this._wordDiv(num, mode);
      };
      BN2.prototype.div = function div(num) {
        return this.divmod(num, "div", false).div;
      };
      BN2.prototype.mod = function mod(num) {
        return this.divmod(num, "mod", false).mod;
      };
      BN2.prototype.umod = function umod(num) {
        return this.divmod(num, "mod", true).mod;
      };
      BN2.prototype.divRound = function divRound(num) {
        var dm = this.divmod(num);
        if (dm.mod.isZero()) return dm.div;
        var mod = dm.div.negative !== 0 ? dm.mod.isub(num) : dm.mod;
        var half = num.ushrn(1);
        var r2 = num.andln(1);
        var cmp = mod.cmp(half);
        if (cmp < 0 || r2 === 1 && cmp === 0) return dm.div;
        return dm.div.negative !== 0 ? dm.div.isubn(1) : dm.div.iaddn(1);
      };
      BN2.prototype.modrn = function modrn(num) {
        var isNegNum = num < 0;
        if (isNegNum) num = -num;
        assert(num <= 67108863);
        var p = (1 << 26) % num;
        var acc = 0;
        for (var i = this.length - 1; i >= 0; i--) {
          acc = (p * acc + (this.words[i] | 0)) % num;
        }
        return isNegNum ? -acc : acc;
      };
      BN2.prototype.modn = function modn(num) {
        return this.modrn(num);
      };
      BN2.prototype.idivn = function idivn(num) {
        var isNegNum = num < 0;
        if (isNegNum) num = -num;
        assert(num <= 67108863);
        var carry = 0;
        for (var i = this.length - 1; i >= 0; i--) {
          var w = (this.words[i] | 0) + carry * 67108864;
          this.words[i] = w / num | 0;
          carry = w % num;
        }
        this._strip();
        return isNegNum ? this.ineg() : this;
      };
      BN2.prototype.divn = function divn(num) {
        return this.clone().idivn(num);
      };
      BN2.prototype.egcd = function egcd(p) {
        assert(p.negative === 0);
        assert(!p.isZero());
        var x = this;
        var y = p.clone();
        if (x.negative !== 0) {
          x = x.umod(p);
        } else {
          x = x.clone();
        }
        var A = new BN2(1);
        var B = new BN2(0);
        var C = new BN2(0);
        var D = new BN2(1);
        var g = 0;
        while (x.isEven() && y.isEven()) {
          x.iushrn(1);
          y.iushrn(1);
          ++g;
        }
        var yp = y.clone();
        var xp = x.clone();
        while (!x.isZero()) {
          for (var i = 0, im = 1; (x.words[0] & im) === 0 && i < 26; ++i, im <<= 1) ;
          if (i > 0) {
            x.iushrn(i);
            while (i-- > 0) {
              if (A.isOdd() || B.isOdd()) {
                A.iadd(yp);
                B.isub(xp);
              }
              A.iushrn(1);
              B.iushrn(1);
            }
          }
          for (var j = 0, jm = 1; (y.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1) ;
          if (j > 0) {
            y.iushrn(j);
            while (j-- > 0) {
              if (C.isOdd() || D.isOdd()) {
                C.iadd(yp);
                D.isub(xp);
              }
              C.iushrn(1);
              D.iushrn(1);
            }
          }
          if (x.cmp(y) >= 0) {
            x.isub(y);
            A.isub(C);
            B.isub(D);
          } else {
            y.isub(x);
            C.isub(A);
            D.isub(B);
          }
        }
        return {
          a: C,
          b: D,
          gcd: y.iushln(g)
        };
      };
      BN2.prototype._invmp = function _invmp(p) {
        assert(p.negative === 0);
        assert(!p.isZero());
        var a = this;
        var b = p.clone();
        if (a.negative !== 0) {
          a = a.umod(p);
        } else {
          a = a.clone();
        }
        var x1 = new BN2(1);
        var x2 = new BN2(0);
        var delta = b.clone();
        while (a.cmpn(1) > 0 && b.cmpn(1) > 0) {
          for (var i = 0, im = 1; (a.words[0] & im) === 0 && i < 26; ++i, im <<= 1) ;
          if (i > 0) {
            a.iushrn(i);
            while (i-- > 0) {
              if (x1.isOdd()) {
                x1.iadd(delta);
              }
              x1.iushrn(1);
            }
          }
          for (var j = 0, jm = 1; (b.words[0] & jm) === 0 && j < 26; ++j, jm <<= 1) ;
          if (j > 0) {
            b.iushrn(j);
            while (j-- > 0) {
              if (x2.isOdd()) {
                x2.iadd(delta);
              }
              x2.iushrn(1);
            }
          }
          if (a.cmp(b) >= 0) {
            a.isub(b);
            x1.isub(x2);
          } else {
            b.isub(a);
            x2.isub(x1);
          }
        }
        var res;
        if (a.cmpn(1) === 0) {
          res = x1;
        } else {
          res = x2;
        }
        if (res.cmpn(0) < 0) {
          res.iadd(p);
        }
        return res;
      };
      BN2.prototype.gcd = function gcd(num) {
        if (this.isZero()) return num.abs();
        if (num.isZero()) return this.abs();
        var a = this.clone();
        var b = num.clone();
        a.negative = 0;
        b.negative = 0;
        for (var shift = 0; a.isEven() && b.isEven(); shift++) {
          a.iushrn(1);
          b.iushrn(1);
        }
        do {
          while (a.isEven()) {
            a.iushrn(1);
          }
          while (b.isEven()) {
            b.iushrn(1);
          }
          var r = a.cmp(b);
          if (r < 0) {
            var t = a;
            a = b;
            b = t;
          } else if (r === 0 || b.cmpn(1) === 0) {
            break;
          }
          a.isub(b);
        } while (true);
        return b.iushln(shift);
      };
      BN2.prototype.invm = function invm(num) {
        return this.egcd(num).a.umod(num);
      };
      BN2.prototype.isEven = function isEven() {
        return (this.words[0] & 1) === 0;
      };
      BN2.prototype.isOdd = function isOdd() {
        return (this.words[0] & 1) === 1;
      };
      BN2.prototype.andln = function andln(num) {
        return this.words[0] & num;
      };
      BN2.prototype.bincn = function bincn(bit) {
        assert(typeof bit === "number");
        var r = bit % 26;
        var s = (bit - r) / 26;
        var q = 1 << r;
        if (this.length <= s) {
          this._expand(s + 1);
          this.words[s] |= q;
          return this;
        }
        var carry = q;
        for (var i = s; carry !== 0 && i < this.length; i++) {
          var w = this.words[i] | 0;
          w += carry;
          carry = w >>> 26;
          w &= 67108863;
          this.words[i] = w;
        }
        if (carry !== 0) {
          this.words[i] = carry;
          this.length++;
        }
        return this;
      };
      BN2.prototype.isZero = function isZero() {
        return this.length === 1 && this.words[0] === 0;
      };
      BN2.prototype.cmpn = function cmpn(num) {
        var negative = num < 0;
        if (this.negative !== 0 && !negative) return -1;
        if (this.negative === 0 && negative) return 1;
        this._strip();
        var res;
        if (this.length > 1) {
          res = 1;
        } else {
          if (negative) {
            num = -num;
          }
          assert(num <= 67108863, "Number is too big");
          var w = this.words[0] | 0;
          res = w === num ? 0 : w < num ? -1 : 1;
        }
        if (this.negative !== 0) return -res | 0;
        return res;
      };
      BN2.prototype.cmp = function cmp(num) {
        if (this.negative !== 0 && num.negative === 0) return -1;
        if (this.negative === 0 && num.negative !== 0) return 1;
        var res = this.ucmp(num);
        if (this.negative !== 0) return -res | 0;
        return res;
      };
      BN2.prototype.ucmp = function ucmp(num) {
        if (this.length > num.length) return 1;
        if (this.length < num.length) return -1;
        var res = 0;
        for (var i = this.length - 1; i >= 0; i--) {
          var a = this.words[i] | 0;
          var b = num.words[i] | 0;
          if (a === b) continue;
          if (a < b) {
            res = -1;
          } else if (a > b) {
            res = 1;
          }
          break;
        }
        return res;
      };
      BN2.prototype.gtn = function gtn(num) {
        return this.cmpn(num) === 1;
      };
      BN2.prototype.gt = function gt(num) {
        return this.cmp(num) === 1;
      };
      BN2.prototype.gten = function gten(num) {
        return this.cmpn(num) >= 0;
      };
      BN2.prototype.gte = function gte(num) {
        return this.cmp(num) >= 0;
      };
      BN2.prototype.ltn = function ltn(num) {
        return this.cmpn(num) === -1;
      };
      BN2.prototype.lt = function lt(num) {
        return this.cmp(num) === -1;
      };
      BN2.prototype.lten = function lten(num) {
        return this.cmpn(num) <= 0;
      };
      BN2.prototype.lte = function lte(num) {
        return this.cmp(num) <= 0;
      };
      BN2.prototype.eqn = function eqn(num) {
        return this.cmpn(num) === 0;
      };
      BN2.prototype.eq = function eq(num) {
        return this.cmp(num) === 0;
      };
      BN2.red = function red(num) {
        return new Red(num);
      };
      BN2.prototype.toRed = function toRed(ctx) {
        assert(!this.red, "Already a number in reduction context");
        assert(this.negative === 0, "red works only with positives");
        return ctx.convertTo(this)._forceRed(ctx);
      };
      BN2.prototype.fromRed = function fromRed() {
        assert(this.red, "fromRed works only with numbers in reduction context");
        return this.red.convertFrom(this);
      };
      BN2.prototype._forceRed = function _forceRed(ctx) {
        this.red = ctx;
        return this;
      };
      BN2.prototype.forceRed = function forceRed(ctx) {
        assert(!this.red, "Already a number in reduction context");
        return this._forceRed(ctx);
      };
      BN2.prototype.redAdd = function redAdd(num) {
        assert(this.red, "redAdd works only with red numbers");
        return this.red.add(this, num);
      };
      BN2.prototype.redIAdd = function redIAdd(num) {
        assert(this.red, "redIAdd works only with red numbers");
        return this.red.iadd(this, num);
      };
      BN2.prototype.redSub = function redSub(num) {
        assert(this.red, "redSub works only with red numbers");
        return this.red.sub(this, num);
      };
      BN2.prototype.redISub = function redISub(num) {
        assert(this.red, "redISub works only with red numbers");
        return this.red.isub(this, num);
      };
      BN2.prototype.redShl = function redShl(num) {
        assert(this.red, "redShl works only with red numbers");
        return this.red.shl(this, num);
      };
      BN2.prototype.redMul = function redMul(num) {
        assert(this.red, "redMul works only with red numbers");
        this.red._verify2(this, num);
        return this.red.mul(this, num);
      };
      BN2.prototype.redIMul = function redIMul(num) {
        assert(this.red, "redMul works only with red numbers");
        this.red._verify2(this, num);
        return this.red.imul(this, num);
      };
      BN2.prototype.redSqr = function redSqr() {
        assert(this.red, "redSqr works only with red numbers");
        this.red._verify1(this);
        return this.red.sqr(this);
      };
      BN2.prototype.redISqr = function redISqr() {
        assert(this.red, "redISqr works only with red numbers");
        this.red._verify1(this);
        return this.red.isqr(this);
      };
      BN2.prototype.redSqrt = function redSqrt() {
        assert(this.red, "redSqrt works only with red numbers");
        this.red._verify1(this);
        return this.red.sqrt(this);
      };
      BN2.prototype.redInvm = function redInvm() {
        assert(this.red, "redInvm works only with red numbers");
        this.red._verify1(this);
        return this.red.invm(this);
      };
      BN2.prototype.redNeg = function redNeg() {
        assert(this.red, "redNeg works only with red numbers");
        this.red._verify1(this);
        return this.red.neg(this);
      };
      BN2.prototype.redPow = function redPow(num) {
        assert(this.red && !num.red, "redPow(normalNum)");
        this.red._verify1(this);
        return this.red.pow(this, num);
      };
      var primes = {
        k256: null,
        p224: null,
        p192: null,
        p25519: null
      };
      function MPrime(name, p) {
        this.name = name;
        this.p = new BN2(p, 16);
        this.n = this.p.bitLength();
        this.k = new BN2(1).iushln(this.n).isub(this.p);
        this.tmp = this._tmp();
      }
      MPrime.prototype._tmp = function _tmp() {
        var tmp = new BN2(null);
        tmp.words = new Array(Math.ceil(this.n / 13));
        return tmp;
      };
      MPrime.prototype.ireduce = function ireduce(num) {
        var r = num;
        var rlen;
        do {
          this.split(r, this.tmp);
          r = this.imulK(r);
          r = r.iadd(this.tmp);
          rlen = r.bitLength();
        } while (rlen > this.n);
        var cmp = rlen < this.n ? -1 : r.ucmp(this.p);
        if (cmp === 0) {
          r.words[0] = 0;
          r.length = 1;
        } else if (cmp > 0) {
          r.isub(this.p);
        } else {
          if (r.strip !== void 0) {
            r.strip();
          } else {
            r._strip();
          }
        }
        return r;
      };
      MPrime.prototype.split = function split(input, out) {
        input.iushrn(this.n, 0, out);
      };
      MPrime.prototype.imulK = function imulK(num) {
        return num.imul(this.k);
      };
      function K256() {
        MPrime.call(
          this,
          "k256",
          "ffffffff ffffffff ffffffff ffffffff ffffffff ffffffff fffffffe fffffc2f"
        );
      }
      inherits(K256, MPrime);
      K256.prototype.split = function split(input, output) {
        var mask = 4194303;
        var outLen = Math.min(input.length, 9);
        for (var i = 0; i < outLen; i++) {
          output.words[i] = input.words[i];
        }
        output.length = outLen;
        if (input.length <= 9) {
          input.words[0] = 0;
          input.length = 1;
          return;
        }
        var prev = input.words[9];
        output.words[output.length++] = prev & mask;
        for (i = 10; i < input.length; i++) {
          var next = input.words[i] | 0;
          input.words[i - 10] = (next & mask) << 4 | prev >>> 22;
          prev = next;
        }
        prev >>>= 22;
        input.words[i - 10] = prev;
        if (prev === 0 && input.length > 10) {
          input.length -= 10;
        } else {
          input.length -= 9;
        }
      };
      K256.prototype.imulK = function imulK(num) {
        num.words[num.length] = 0;
        num.words[num.length + 1] = 0;
        num.length += 2;
        var lo = 0;
        for (var i = 0; i < num.length; i++) {
          var w = num.words[i] | 0;
          lo += w * 977;
          num.words[i] = lo & 67108863;
          lo = w * 64 + (lo / 67108864 | 0);
        }
        if (num.words[num.length - 1] === 0) {
          num.length--;
          if (num.words[num.length - 1] === 0) {
            num.length--;
          }
        }
        return num;
      };
      function P224() {
        MPrime.call(
          this,
          "p224",
          "ffffffff ffffffff ffffffff ffffffff 00000000 00000000 00000001"
        );
      }
      inherits(P224, MPrime);
      function P192() {
        MPrime.call(
          this,
          "p192",
          "ffffffff ffffffff ffffffff fffffffe ffffffff ffffffff"
        );
      }
      inherits(P192, MPrime);
      function P25519() {
        MPrime.call(
          this,
          "25519",
          "7fffffffffffffff ffffffffffffffff ffffffffffffffff ffffffffffffffed"
        );
      }
      inherits(P25519, MPrime);
      P25519.prototype.imulK = function imulK(num) {
        var carry = 0;
        for (var i = 0; i < num.length; i++) {
          var hi = (num.words[i] | 0) * 19 + carry;
          var lo = hi & 67108863;
          hi >>>= 26;
          num.words[i] = lo;
          carry = hi;
        }
        if (carry !== 0) {
          num.words[num.length++] = carry;
        }
        return num;
      };
      BN2._prime = function prime(name) {
        if (primes[name]) return primes[name];
        var prime2;
        if (name === "k256") {
          prime2 = new K256();
        } else if (name === "p224") {
          prime2 = new P224();
        } else if (name === "p192") {
          prime2 = new P192();
        } else if (name === "p25519") {
          prime2 = new P25519();
        } else {
          throw new Error("Unknown prime " + name);
        }
        primes[name] = prime2;
        return prime2;
      };
      function Red(m) {
        if (typeof m === "string") {
          var prime = BN2._prime(m);
          this.m = prime.p;
          this.prime = prime;
        } else {
          assert(m.gtn(1), "modulus must be greater than 1");
          this.m = m;
          this.prime = null;
        }
      }
      Red.prototype._verify1 = function _verify1(a) {
        assert(a.negative === 0, "red works only with positives");
        assert(a.red, "red works only with red numbers");
      };
      Red.prototype._verify2 = function _verify2(a, b) {
        assert((a.negative | b.negative) === 0, "red works only with positives");
        assert(
          a.red && a.red === b.red,
          "red works only with red numbers"
        );
      };
      Red.prototype.imod = function imod(a) {
        if (this.prime) return this.prime.ireduce(a)._forceRed(this);
        move(a, a.umod(this.m)._forceRed(this));
        return a;
      };
      Red.prototype.neg = function neg(a) {
        if (a.isZero()) {
          return a.clone();
        }
        return this.m.sub(a)._forceRed(this);
      };
      Red.prototype.add = function add(a, b) {
        this._verify2(a, b);
        var res = a.add(b);
        if (res.cmp(this.m) >= 0) {
          res.isub(this.m);
        }
        return res._forceRed(this);
      };
      Red.prototype.iadd = function iadd(a, b) {
        this._verify2(a, b);
        var res = a.iadd(b);
        if (res.cmp(this.m) >= 0) {
          res.isub(this.m);
        }
        return res;
      };
      Red.prototype.sub = function sub(a, b) {
        this._verify2(a, b);
        var res = a.sub(b);
        if (res.cmpn(0) < 0) {
          res.iadd(this.m);
        }
        return res._forceRed(this);
      };
      Red.prototype.isub = function isub(a, b) {
        this._verify2(a, b);
        var res = a.isub(b);
        if (res.cmpn(0) < 0) {
          res.iadd(this.m);
        }
        return res;
      };
      Red.prototype.shl = function shl(a, num) {
        this._verify1(a);
        return this.imod(a.ushln(num));
      };
      Red.prototype.imul = function imul(a, b) {
        this._verify2(a, b);
        return this.imod(a.imul(b));
      };
      Red.prototype.mul = function mul(a, b) {
        this._verify2(a, b);
        return this.imod(a.mul(b));
      };
      Red.prototype.isqr = function isqr(a) {
        return this.imul(a, a.clone());
      };
      Red.prototype.sqr = function sqr(a) {
        return this.mul(a, a);
      };
      Red.prototype.sqrt = function sqrt2(a) {
        if (a.isZero()) return a.clone();
        var mod3 = this.m.andln(3);
        assert(mod3 % 2 === 1);
        if (mod3 === 3) {
          var pow = this.m.add(new BN2(1)).iushrn(2);
          return this.pow(a, pow);
        }
        var q = this.m.subn(1);
        var s = 0;
        while (!q.isZero() && q.andln(1) === 0) {
          s++;
          q.iushrn(1);
        }
        assert(!q.isZero());
        var one = new BN2(1).toRed(this);
        var nOne = one.redNeg();
        var lpow = this.m.subn(1).iushrn(1);
        var z = this.m.bitLength();
        z = new BN2(2 * z * z).toRed(this);
        while (this.pow(z, lpow).cmp(nOne) !== 0) {
          z.redIAdd(nOne);
        }
        var c = this.pow(z, q);
        var r = this.pow(a, q.addn(1).iushrn(1));
        var t = this.pow(a, q);
        var m = s;
        while (t.cmp(one) !== 0) {
          var tmp = t;
          for (var i = 0; tmp.cmp(one) !== 0; i++) {
            tmp = tmp.redSqr();
          }
          assert(i < m);
          var b = this.pow(c, new BN2(1).iushln(m - i - 1));
          r = r.redMul(b);
          c = b.redSqr();
          t = t.redMul(c);
          m = i;
        }
        return r;
      };
      Red.prototype.invm = function invm(a) {
        var inv = a._invmp(this.m);
        if (inv.negative !== 0) {
          inv.negative = 0;
          return this.imod(inv).redNeg();
        } else {
          return this.imod(inv);
        }
      };
      Red.prototype.pow = function pow(a, num) {
        if (num.isZero()) return new BN2(1).toRed(this);
        if (num.cmpn(1) === 0) return a.clone();
        var windowSize = 4;
        var wnd = new Array(1 << windowSize);
        wnd[0] = new BN2(1).toRed(this);
        wnd[1] = a;
        for (var i = 2; i < wnd.length; i++) {
          wnd[i] = this.mul(wnd[i - 1], a);
        }
        var res = wnd[0];
        var current = 0;
        var currentLen = 0;
        var start = num.bitLength() % 26;
        if (start === 0) {
          start = 26;
        }
        for (i = num.length - 1; i >= 0; i--) {
          var word = num.words[i];
          for (var j = start - 1; j >= 0; j--) {
            var bit = word >> j & 1;
            if (res !== wnd[0]) {
              res = this.sqr(res);
            }
            if (bit === 0 && current === 0) {
              currentLen = 0;
              continue;
            }
            current <<= 1;
            current |= bit;
            currentLen++;
            if (currentLen !== windowSize && (i !== 0 || j !== 0)) continue;
            res = this.mul(res, wnd[current]);
            currentLen = 0;
            current = 0;
          }
          start = 26;
        }
        return res;
      };
      Red.prototype.convertTo = function convertTo(num) {
        var r = num.umod(this.m);
        return r === num ? r.clone() : r;
      };
      Red.prototype.convertFrom = function convertFrom(num) {
        var res = num.clone();
        res.red = null;
        return res;
      };
      BN2.mont = function mont(num) {
        return new Mont(num);
      };
      function Mont(m) {
        Red.call(this, m);
        this.shift = this.m.bitLength();
        if (this.shift % 26 !== 0) {
          this.shift += 26 - this.shift % 26;
        }
        this.r = new BN2(1).iushln(this.shift);
        this.r2 = this.imod(this.r.sqr());
        this.rinv = this.r._invmp(this.m);
        this.minv = this.rinv.mul(this.r).isubn(1).div(this.m);
        this.minv = this.minv.umod(this.r);
        this.minv = this.r.sub(this.minv);
      }
      inherits(Mont, Red);
      Mont.prototype.convertTo = function convertTo(num) {
        return this.imod(num.ushln(this.shift));
      };
      Mont.prototype.convertFrom = function convertFrom(num) {
        var r = this.imod(num.mul(this.rinv));
        r.red = null;
        return r;
      };
      Mont.prototype.imul = function imul(a, b) {
        if (a.isZero() || b.isZero()) {
          a.words[0] = 0;
          a.length = 1;
          return a;
        }
        var t = a.imul(b);
        var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
        var u = t.isub(c).iushrn(this.shift);
        var res = u;
        if (u.cmp(this.m) >= 0) {
          res = u.isub(this.m);
        } else if (u.cmpn(0) < 0) {
          res = u.iadd(this.m);
        }
        return res._forceRed(this);
      };
      Mont.prototype.mul = function mul(a, b) {
        if (a.isZero() || b.isZero()) return new BN2(0)._forceRed(this);
        var t = a.mul(b);
        var c = t.maskn(this.shift).mul(this.minv).imaskn(this.shift).mul(this.m);
        var u = t.isub(c).iushrn(this.shift);
        var res = u;
        if (u.cmp(this.m) >= 0) {
          res = u.isub(this.m);
        } else if (u.cmpn(0) < 0) {
          res = u.iadd(this.m);
        }
        return res._forceRed(this);
      };
      Mont.prototype.invm = function invm(a) {
        var res = this.imod(a._invmp(this.m).mul(this.r2));
        return res._forceRed(this);
      };
    })(typeof module === "undefined" || module, exports$1);
  }
});

// src/core/chains.ts
var ChainId = /* @__PURE__ */ ((ChainId2) => {
  ChainId2[ChainId2["MAINNET"] = 1] = "MAINNET";
  ChainId2[ChainId2["GOERLI"] = 5] = "GOERLI";
  ChainId2[ChainId2["SEPOLIA"] = 11155111] = "SEPOLIA";
  ChainId2[ChainId2["OPTIMISM"] = 10] = "OPTIMISM";
  ChainId2[ChainId2["OPTIMISM_GOERLI"] = 420] = "OPTIMISM_GOERLI";
  ChainId2[ChainId2["OPTIMISM_SEPOLIA"] = 11155420] = "OPTIMISM_SEPOLIA";
  ChainId2[ChainId2["ARBITRUM_ONE"] = 42161] = "ARBITRUM_ONE";
  ChainId2[ChainId2["ARBITRUM_GOERLI"] = 421613] = "ARBITRUM_GOERLI";
  ChainId2[ChainId2["ARBITRUM_SEPOLIA"] = 421614] = "ARBITRUM_SEPOLIA";
  ChainId2[ChainId2["POLYGON"] = 137] = "POLYGON";
  ChainId2[ChainId2["POLYGON_MUMBAI"] = 80001] = "POLYGON_MUMBAI";
  ChainId2[ChainId2["CELO"] = 42220] = "CELO";
  ChainId2[ChainId2["CELO_ALFAJORES"] = 44787] = "CELO_ALFAJORES";
  ChainId2[ChainId2["GNOSIS"] = 100] = "GNOSIS";
  ChainId2[ChainId2["MOONBEAM"] = 1284] = "MOONBEAM";
  ChainId2[ChainId2["BNB"] = 56] = "BNB";
  ChainId2[ChainId2["AVALANCHE"] = 43114] = "AVALANCHE";
  ChainId2[ChainId2["BASE_GOERLI"] = 84531] = "BASE_GOERLI";
  ChainId2[ChainId2["BASE_SEPOLIA"] = 84532] = "BASE_SEPOLIA";
  ChainId2[ChainId2["BASE"] = 8453] = "BASE";
  ChainId2[ChainId2["ZORA"] = 7777777] = "ZORA";
  ChainId2[ChainId2["ZORA_SEPOLIA"] = 999999999] = "ZORA_SEPOLIA";
  ChainId2[ChainId2["ROOTSTOCK"] = 30] = "ROOTSTOCK";
  ChainId2[ChainId2["BLAST"] = 81457] = "BLAST";
  ChainId2[ChainId2["ZKSYNC"] = 324] = "ZKSYNC";
  ChainId2[ChainId2["WORLDCHAIN"] = 480] = "WORLDCHAIN";
  ChainId2[ChainId2["UNICHAIN_SEPOLIA"] = 1301] = "UNICHAIN_SEPOLIA";
  ChainId2[ChainId2["UNICHAIN"] = 130] = "UNICHAIN";
  ChainId2[ChainId2["MONAD_TESTNET"] = 10143] = "MONAD_TESTNET";
  ChainId2[ChainId2["SONEIUM"] = 1868] = "SONEIUM";
  ChainId2[ChainId2["MONAD"] = 143] = "MONAD";
  ChainId2[ChainId2["XLAYER"] = 196] = "XLAYER";
  return ChainId2;
})(ChainId || {});
var SUPPORTED_CHAINS = [
  1 /* MAINNET */,
  10 /* OPTIMISM */,
  420 /* OPTIMISM_GOERLI */,
  11155420 /* OPTIMISM_SEPOLIA */,
  42161 /* ARBITRUM_ONE */,
  421613 /* ARBITRUM_GOERLI */,
  421614 /* ARBITRUM_SEPOLIA */,
  137 /* POLYGON */,
  80001 /* POLYGON_MUMBAI */,
  5 /* GOERLI */,
  11155111 /* SEPOLIA */,
  44787 /* CELO_ALFAJORES */,
  42220 /* CELO */,
  56 /* BNB */,
  43114 /* AVALANCHE */,
  8453 /* BASE */,
  84531 /* BASE_GOERLI */,
  84532 /* BASE_SEPOLIA */,
  7777777 /* ZORA */,
  999999999 /* ZORA_SEPOLIA */,
  30 /* ROOTSTOCK */,
  81457 /* BLAST */,
  324 /* ZKSYNC */,
  480 /* WORLDCHAIN */,
  1301 /* UNICHAIN_SEPOLIA */,
  130 /* UNICHAIN */,
  10143 /* MONAD_TESTNET */,
  1868 /* SONEIUM */,
  143 /* MONAD */,
  196 /* XLAYER */
];
var NativeCurrencyName = /* @__PURE__ */ ((NativeCurrencyName2) => {
  NativeCurrencyName2["ETHER"] = "ETH";
  NativeCurrencyName2["MATIC"] = "MATIC";
  NativeCurrencyName2["CELO"] = "CELO";
  NativeCurrencyName2["GNOSIS"] = "XDAI";
  NativeCurrencyName2["MOONBEAM"] = "GLMR";
  NativeCurrencyName2["BNB"] = "BNB";
  NativeCurrencyName2["AVAX"] = "AVAX";
  NativeCurrencyName2["ROOTSTOCK"] = "RBTC";
  return NativeCurrencyName2;
})(NativeCurrencyName || {});

// src/core/addresses.ts
var DEFAULT_NETWORKS = [1 /* MAINNET */, 5 /* GOERLI */, 11155111 /* SEPOLIA */];
function constructSameAddressMap(address, additionalNetworks = []) {
  return DEFAULT_NETWORKS.concat(additionalNetworks).reduce((memo, chainId) => {
    memo[chainId] = address;
    return memo;
  }, {});
}
var UNI_ADDRESSES = constructSameAddressMap("0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", [
  10 /* OPTIMISM */,
  42161 /* ARBITRUM_ONE */,
  137 /* POLYGON */,
  80001 /* POLYGON_MUMBAI */,
  11155111 /* SEPOLIA */
]);
var UNISWAP_NFT_AIRDROP_CLAIM_ADDRESS = "0x8B799381ac40b838BBA4131ffB26197C432AFe78";
var V2_FACTORY_ADDRESS = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
var V2_FACTORY_ADDRESSES = {
  [1 /* MAINNET */]: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
  [5 /* GOERLI */]: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
  [11155111 /* SEPOLIA */]: "0xF62c03E08ada871A0bEb309762E260a7a6a880E6",
  [10 /* OPTIMISM */]: "0x0c3c1c532F1e39EdF36BE9Fe0bE1410313E074Bf",
  [42161 /* ARBITRUM_ONE */]: "0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9",
  [43114 /* AVALANCHE */]: "0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C",
  [84532 /* BASE_SEPOLIA */]: "0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e",
  [8453 /* BASE */]: "0x8909dc15e40173ff4699343b6eb8132c65e18ec6",
  [56 /* BNB */]: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
  [137 /* POLYGON */]: "0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C",
  [42220 /* CELO */]: "0x79a530c8e2fA8748B7B40dd3629C0520c2cCf03f",
  [81457 /* BLAST */]: "0x5C346464d33F90bABaf70dB6388507CC889C1070",
  [480 /* WORLDCHAIN */]: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
  [1301 /* UNICHAIN_SEPOLIA */]: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
  [130 /* UNICHAIN */]: "0x1f98400000000000000000000000000000000002",
  [10143 /* MONAD_TESTNET */]: "0x733e88f248b742db6c14c0b1713af5ad7fdd59d0",
  [1868 /* SONEIUM */]: "0x97febbc2adbd5644ba22736e962564b23f5828ce",
  [143 /* MONAD */]: "0x182a927119d56008d921126764bf884221b10f59",
  [196 /* XLAYER */]: "0xdf38f24fe153761634be942f9d859f3dba857e95"
};
var V2_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
var V2_ROUTER_ADDRESSES = {
  [1 /* MAINNET */]: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  [5 /* GOERLI */]: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  [11155111 /* SEPOLIA */]: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3",
  [42161 /* ARBITRUM_ONE */]: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
  [10 /* OPTIMISM */]: "0x4a7b5da61326a6379179b40d00f57e5bbdc962c2",
  [84532 /* BASE_SEPOLIA */]: "0x1689E7B1F10000AE47eBfE339a4f69dECd19F602",
  [8453 /* BASE */]: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
  [43114 /* AVALANCHE */]: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
  [56 /* BNB */]: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
  [137 /* POLYGON */]: "0xedf6066a2b290c185783862c7f4776a2c8077ad1",
  [81457 /* BLAST */]: "0xBB66Eb1c5e875933D44DAe661dbD80e5D9B03035",
  [480 /* WORLDCHAIN */]: "0x541aB7c31A119441eF3575F6973277DE0eF460bd",
  [1301 /* UNICHAIN_SEPOLIA */]: "0x920b806E40A00E02E7D2b94fFc89860fDaEd3640",
  [130 /* UNICHAIN */]: "0x284f11109359a7e1306c3e447ef14d38400063ff",
  [10143 /* MONAD_TESTNET */]: "0xfb8e1c3b833f9e67a71c859a132cf783b645e436",
  [1868 /* SONEIUM */]: "0x273f68c234fa55b550b40e563c4a488e0d334320",
  [143 /* MONAD */]: "0x4b2ab38dbf28d31d467aa8993f6c2585981d6804",
  [196 /* XLAYER */]: "0x182a927119d56008d921126764bf884221b10f59"
};
var DEFAULT_ADDRESSES = {
  v3CoreFactoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  multicallAddress: "0x1F98415757620B543A52E61c46B32eB19261F984",
  quoterAddress: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
  v3MigratorAddress: "0xA5644E29708357803b5A882D272c41cC0dF92B34",
  nonfungiblePositionManagerAddress: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88"
};
var MAINNET_ADDRESSES = {
  ...DEFAULT_ADDRESSES,
  mixedRouteQuoterV1Address: "0x84E44095eeBfEC7793Cd7d5b57B7e401D7f1cA2E",
  v4PoolManagerAddress: "0x000000000004444c5dc75cB358380D2e3dE08A90",
  v4PositionManagerAddress: "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e",
  v4StateView: "0x7ffe42c4a5deea5b0fec41c94c136cf115597227",
  v4QuoterAddress: "0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203"
};
var GOERLI_ADDRESSES = {
  ...DEFAULT_ADDRESSES,
  mixedRouteQuoterV1Address: "0xBa60b6e6fF25488308789E6e0A65D838be34194e"
};
var OPTIMISM_ADDRESSES = {
  ...DEFAULT_ADDRESSES,
  v4PoolManagerAddress: "0x9a13f98cb987694c9f086b1f5eb990eea8264ec3",
  v4PositionManagerAddress: "0x3c3ea4b57a46241e54610e5f022e5c45859a1017",
  v4StateView: "0xc18a3169788f4f75a170290584eca6395c75ecdb",
  v4QuoterAddress: "0x1f3131a13296fb91c90870043742c3cdbff1a8d7"
};
var ARBITRUM_ONE_ADDRESSES = {
  ...DEFAULT_ADDRESSES,
  multicallAddress: "0xadF885960B47eA2CD9B55E6DAc6B42b7Cb2806dB",
  tickLensAddress: "0xbfd8137f7d1516D3ea5cA83523914859ec47F573",
  v4PoolManagerAddress: "0x360e68faccca8ca495c1b759fd9eee466db9fb32",
  v4PositionManagerAddress: "0xd88f38f930b7952f2db2432cb002e7abbf3dd869",
  v4StateView: "0x76fd297e2d437cd7f76d50f01afe6160f86e9990",
  v4QuoterAddress: "0x3972c00f7ed4885e145823eb7c655375d275a1c5"
};
var POLYGON_ADDRESSES = {
  ...DEFAULT_ADDRESSES,
  v4PoolManagerAddress: "0x67366782805870060151383f4bbff9dab53e5cd6",
  v4PositionManagerAddress: "0x1ec2ebf4f37e7363fdfe3551602425af0b3ceef9",
  v4StateView: "0x5ea1bd7974c8a611cbab0bdcafcb1d9cc9b3ba5a",
  v4QuoterAddress: "0xb3d5c3dfc3a7aebff71895a7191796bffc2c81b9"
};
var CELO_ADDRESSES = {
  v3CoreFactoryAddress: "0xAfE208a311B21f13EF87E33A90049fC17A7acDEc",
  multicallAddress: "0x633987602DE5C4F337e3DbF265303A1080324204",
  quoterAddress: "0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8",
  v3MigratorAddress: "0x3cFd4d48EDfDCC53D3f173F596f621064614C582",
  nonfungiblePositionManagerAddress: "0x3d79EdAaBC0EaB6F08ED885C05Fc0B014290D95A",
  tickLensAddress: "0x5f115D9113F88e0a0Db1b5033D90D4a9690AcD3D",
  v4PoolManagerAddress: "0x288dc841A52FCA2707c6947B3A777c5E56cd87BC",
  v4PositionManagerAddress: "0xf7965f3981e4d5bc383bfbcb61501763e9068ca9",
  v4StateView: "0xbc21f8720babf4b20d195ee5c6e99c52b76f2bfb",
  v4QuoterAddress: "0x28566da1093609182dff2cb2a91cfd72e61d66cd"
};
var BNB_ADDRESSES = {
  v3CoreFactoryAddress: "0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7",
  multicallAddress: "0x963Df249eD09c358A4819E39d9Cd5736c3087184",
  quoterAddress: "0x78D78E420Da98ad378D7799bE8f4AF69033EB077",
  v3MigratorAddress: "0x32681814957e0C13117ddc0c2aba232b5c9e760f",
  nonfungiblePositionManagerAddress: "0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613",
  tickLensAddress: "0xD9270014D396281579760619CCf4c3af0501A47C",
  swapRouter02Address: "0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2",
  v4PoolManagerAddress: "0x28e2ea090877bf75740558f6bfb36a5ffee9e9df",
  v4PositionManagerAddress: "0x7a4a5c919ae2541aed11041a1aeee68f1287f95b",
  v4StateView: "0xd13dd3d6e93f276fafc9db9e6bb47c1180aee0c4",
  v4QuoterAddress: "0x9f75dd27d6664c475b90e105573e550ff69437b0"
};
var OPTIMISM_GOERLI_ADDRESSES = {
  v3CoreFactoryAddress: "0xB656dA17129e7EB733A557f4EBc57B76CFbB5d10",
  multicallAddress: "0x07F2D8a2a02251B62af965f22fC4744A5f96BCCd",
  quoterAddress: "0x9569CbA925c8ca2248772A9A4976A516743A246F",
  v3MigratorAddress: "0xf6c55fBe84B1C8c3283533c53F51bC32F5C7Aba8",
  nonfungiblePositionManagerAddress: "0x39Ca85Af2F383190cBf7d7c41ED9202D27426EF6",
  tickLensAddress: "0xe6140Bd164b63E8BfCfc40D5dF952f83e171758e"
};
var OPTIMISM_SEPOLIA_ADDRESSES = {
  v3CoreFactoryAddress: "0x8CE191193D15ea94e11d327b4c7ad8bbE520f6aF",
  multicallAddress: "0x80e4e06841bb76AA9735E0448cB8d003C0EF009a",
  quoterAddress: "0x0FBEa6cf957d95ee9313490050F6A0DA68039404",
  v3MigratorAddress: "0xE7EcbAAaA54D007A00dbb6c1d2f150066D69dA07",
  nonfungiblePositionManagerAddress: "0xdA75cEf1C93078e8b736FCA5D5a30adb97C8957d",
  tickLensAddress: "0xCb7f54747F58F8944973cea5b8f4ac2209BadDC5",
  swapRouter02Address: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4"
};
var ARBITRUM_GOERLI_ADDRESSES = {
  v3CoreFactoryAddress: "0x4893376342d5D7b3e31d4184c08b265e5aB2A3f6",
  multicallAddress: "0x8260CB40247290317a4c062F3542622367F206Ee",
  quoterAddress: "0x1dd92b83591781D0C6d98d07391eea4b9a6008FA",
  v3MigratorAddress: "0xA815919D2584Ac3F76ea9CB62E6Fd40a43BCe0C3",
  nonfungiblePositionManagerAddress: "0x622e4726a167799826d1E1D150b076A7725f5D81",
  tickLensAddress: "0xb52429333da969a0C79a60930a4Bf0020E5D1DE8"
};
var ARBITRUM_SEPOLIA_ADDRESSES = {
  v3CoreFactoryAddress: "0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e",
  multicallAddress: "0x2B718b475e385eD29F56775a66aAB1F5cC6B2A0A",
  quoterAddress: "0x2779a0CC1c3e0E44D2542EC3e79e3864Ae93Ef0B",
  v3MigratorAddress: "0x398f43ef2c67B941147157DA1c5a868E906E043D",
  nonfungiblePositionManagerAddress: "0x6b2937Bde17889EDCf8fbD8dE31C3C2a70Bc4d65",
  tickLensAddress: "0x0fd18587734e5C2dcE2dccDcC7DD1EC89ba557d9",
  swapRouter02Address: "0x101F443B4d1b059569D643917553c771E1b9663E",
  v4PoolManagerAddress: "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317",
  v4PositionManagerAddress: "0xAc631556d3d4019C95769033B5E719dD77124BAc",
  v4StateView: "0x9d467fa9062b6e9b1a46e26007ad82db116c67cb",
  v4QuoterAddress: "0x7de51022d70a725b508085468052e25e22b5c4c9"
};
var SEPOLIA_ADDRESSES = {
  v3CoreFactoryAddress: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
  multicallAddress: "0xD7F33bCdb21b359c8ee6F0251d30E94832baAd07",
  quoterAddress: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
  v3MigratorAddress: "0x729004182cF005CEC8Bd85df140094b6aCbe8b15",
  nonfungiblePositionManagerAddress: "0x1238536071E1c677A632429e3655c799b22cDA52",
  tickLensAddress: "0xd7f33bcdb21b359c8ee6f0251d30e94832baad07",
  swapRouter02Address: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
  // TODO: update mixedRouteQuoterV2Address once v4 on sepolia redeployed
  mixedRouteQuoterV2Address: "0x4745f77b56a0e2294426e3936dc4fab68d9543cd",
  // TODO: update all below once v4 on sepolia redeployed
  v4PoolManagerAddress: "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543",
  v4PositionManagerAddress: "0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4",
  v4StateView: "0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c",
  v4QuoterAddress: "0x61b3f2011a92d183c7dbadbda940a7555ccf9227"
};
var AVALANCHE_ADDRESSES = {
  v3CoreFactoryAddress: "0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD",
  multicallAddress: "0x0139141Cd4Ee88dF3Cdb65881D411bAE271Ef0C2",
  quoterAddress: "0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F",
  v3MigratorAddress: "0x44f5f1f5E452ea8d29C890E8F6e893fC0f1f0f97",
  nonfungiblePositionManagerAddress: "0x655C406EBFa14EE2006250925e54ec43AD184f8B",
  tickLensAddress: "0xEB9fFC8bf81b4fFd11fb6A63a6B0f098c6e21950",
  swapRouter02Address: "0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE",
  v4PoolManagerAddress: "0x06380c0e0912312b5150364b9dc4542ba0dbbc85",
  v4PositionManagerAddress: "0xb74b1f14d2754acfcbbe1a221023a5cf50ab8acd",
  v4StateView: "0xc3c9e198c735a4b97e3e683f391ccbdd60b69286",
  v4QuoterAddress: "0xbe40675bb704506a3c2ccfb762dcfd1e979845c2"
};
var BASE_ADDRESSES = {
  v3CoreFactoryAddress: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
  multicallAddress: "0x091e99cb1C49331a94dD62755D168E941AbD0693",
  quoterAddress: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
  v3MigratorAddress: "0x23cF10b1ee3AdfCA73B0eF17C07F7577e7ACd2d7",
  nonfungiblePositionManagerAddress: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
  tickLensAddress: "0x0CdeE061c75D43c82520eD998C23ac2991c9ac6d",
  swapRouter02Address: "0x2626664c2603336E57B271c5C0b26F421741e481",
  mixedRouteQuoterV1Address: "0xe544efae946f0008ae9a8d64493efa7886b73776",
  v4PoolManagerAddress: "0x498581ff718922c3f8e6a244956af099b2652b2b",
  v4PositionManagerAddress: "0x7c5f5a4bbd8fd63184577525326123b519429bdc",
  v4StateView: "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71",
  v4QuoterAddress: "0x0d5e0f971ed27fbff6c2837bf31316121532048d"
};
var BASE_GOERLI_ADDRESSES = {
  v3CoreFactoryAddress: "0x9323c1d6D800ed51Bd7C6B216cfBec678B7d0BC2",
  multicallAddress: "0xB206027a9E0E13F05eBEFa5D2402Bab3eA716439",
  quoterAddress: "0xedf539058e28E5937dAef3f69cEd0b25fbE66Ae9",
  v3MigratorAddress: "0x3efe5d02a04b7351D671Db7008ec6eBA9AD9e3aE",
  nonfungiblePositionManagerAddress: "0x3c61369ef0D1D2AFa70d8feC2F31C5D6Ce134F30",
  tickLensAddress: "0x1acB873Ee909D0c98adB18e4474943249F931b92",
  swapRouter02Address: "0x8357227D4eDc78991Db6FDB9bD6ADE250536dE1d"
};
var BASE_SEPOLIA_ADDRESSES = {
  v3CoreFactoryAddress: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
  multicallAddress: "0xd867e273eAbD6c853fCd0Ca0bFB6a3aE6491d2C1",
  quoterAddress: "0xC5290058841028F1614F3A6F0F5816cAd0df5E27",
  v3MigratorAddress: "0xCbf8b7f80800bd4888Fbc7bf1713B80FE4E23E10",
  nonfungiblePositionManagerAddress: "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2",
  tickLensAddress: "0xedf6066a2b290C185783862C7F4776A2C8077AD1",
  swapRouter02Address: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4",
  // v4
  v4PoolManagerAddress: "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408",
  v4PositionManagerAddress: "0x4b2c77d209d3405f41a037ec6c77f7f5b8e2ca80",
  v4StateView: "0x571291b572ed32ce6751a2cb2486ebee8defb9b4",
  v4QuoterAddress: "0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba"
};
var ZORA_ADDRESSES = {
  v3CoreFactoryAddress: "0x7145F8aeef1f6510E92164038E1B6F8cB2c42Cbb",
  multicallAddress: "0xA51c76bEE6746cB487a7e9312E43e2b8f4A37C15",
  quoterAddress: "0x11867e1b3348F3ce4FcC170BC5af3d23E07E64Df",
  v3MigratorAddress: "0x048352d8dCF13686982C799da63fA6426a9D0b60",
  nonfungiblePositionManagerAddress: "0xbC91e8DfA3fF18De43853372A3d7dfe585137D78",
  tickLensAddress: "0x209AAda09D74Ad3B8D0E92910Eaf85D2357e3044",
  swapRouter02Address: "0x7De04c96BE5159c3b5CeffC82aa176dc81281557",
  v4PoolManagerAddress: "0x0575338e4c17006ae181b47900a84404247ca30f",
  v4PositionManagerAddress: "0xf66c7b99e2040f0d9b326b3b7c152e9663543d63",
  v4StateView: "0x385785af07d63b50d0a0ea57c4ff89d06adf7328",
  v4QuoterAddress: "0x5edaccc0660e0a2c44b06e07ce8b915e625dc2c6"
};
var ZORA_SEPOLIA_ADDRESSES = {
  v3CoreFactoryAddress: "0x4324A677D74764f46f33ED447964252441aA8Db6",
  multicallAddress: "0xA1E7e3A69671C4494EC59Dbd442de930a93F911A",
  quoterAddress: "0xC195976fEF0985886E37036E2DF62bF371E12Df0",
  v3MigratorAddress: "0x65ef259b31bf1d977c37e9434658694267674897",
  nonfungiblePositionManagerAddress: "0xB8458EaAe43292e3c1F7994EFd016bd653d23c20",
  tickLensAddress: "0x23C0F71877a1Fc4e20A78018f9831365c85f3064"
};
var ROOTSTOCK_ADDRESSES = {
  v3CoreFactoryAddress: "0xaF37EC98A00FD63689CF3060BF3B6784E00caD82",
  multicallAddress: "0x996a9858cDfa45Ad68E47c9A30a7201E29c6a386",
  quoterAddress: "0xb51727c996C68E60F598A923a5006853cd2fEB31",
  v3MigratorAddress: "0x16678977CA4ec3DAD5efc7b15780295FE5f56162",
  nonfungiblePositionManagerAddress: "0x9d9386c042F194B460Ec424a1e57ACDE25f5C4b1",
  tickLensAddress: "0x55B9dF5bF68ADe972191a91980459f48ecA16afC",
  swapRouter02Address: "0x0B14ff67f0014046b4b99057Aec4509640b3947A"
};
var BLAST_ADDRESSES = {
  v3CoreFactoryAddress: "0x792edAdE80af5fC680d96a2eD80A44247D2Cf6Fd",
  multicallAddress: "0xdC7f370de7631cE9e2c2e1DCDA6B3B5744Cf4705",
  quoterAddress: "0x6Cdcd65e03c1CEc3730AeeCd45bc140D57A25C77",
  v3MigratorAddress: "0x15CA7043CD84C5D21Ae76Ba0A1A967d42c40ecE0",
  nonfungiblePositionManagerAddress: "0xB218e4f7cF0533d4696fDfC419A0023D33345F28",
  tickLensAddress: "0x2E95185bCdD928a3e984B7e2D6560Ab1b17d7274",
  swapRouter02Address: "0x549FEB8c9bd4c12Ad2AB27022dA12492aC452B66",
  v4PoolManagerAddress: "0x1631559198a9e474033433b2958dabc135ab6446",
  v4PositionManagerAddress: "0x4ad2f4cca2682cbb5b950d660dd458a1d3f1baad",
  v4StateView: "0x12a88ae16f46dce4e8b15368008ab3380885df30",
  v4QuoterAddress: "0x6f71cdcb0d119ff72c6eb501abceb576fbf62bcf"
};
var ZKSYNC_ADDRESSES = {
  v3CoreFactoryAddress: "0x8FdA5a7a8dCA67BBcDd10F02Fa0649A937215422",
  multicallAddress: "0x0c68a7C72f074d1c45C16d41fa74eEbC6D16a65C",
  quoterAddress: "0x8Cb537fc92E26d8EBBb760E632c95484b6Ea3e28",
  v3MigratorAddress: "0x611841b24E43C4ACfd290B427a3D6cf1A59dac8E",
  nonfungiblePositionManagerAddress: "0x0616e5762c1E7Dc3723c50663dF10a162D690a86",
  tickLensAddress: "0xe10FF11b809f8EE07b056B452c3B2caa7FE24f89",
  swapRouter02Address: "0x99c56385daBCE3E81d8499d0b8d0257aBC07E8A3"
};
var WORLDCHAIN_ADDRESSES = {
  v3CoreFactoryAddress: "0x7a5028BDa40e7B173C278C5342087826455ea25a",
  multicallAddress: "0x0a22c04215c97E3F532F4eF30e0aD9458792dAB9",
  quoterAddress: "0x10158D43e6cc414deE1Bd1eB0EfC6a5cBCfF244c",
  v3MigratorAddress: "0x9EBDdCBa71C9027E1eB45135672a30bcFEec9de3",
  nonfungiblePositionManagerAddress: "0xec12a9F9a09f50550686363766Cc153D03c27b5e",
  tickLensAddress: "0xE61df0CaC9d85876aCE5E3037005D80943570623",
  swapRouter02Address: "0x091AD9e2e6e5eD44c1c66dB50e49A601F9f36cF6",
  v4PoolManagerAddress: "0xb1860d529182ac3bc1f51fa2abd56662b7d13f33",
  v4PositionManagerAddress: "0xc585e0f504613b5fbf874f21af14c65260fb41fa",
  v4StateView: "0x51d394718bc09297262e368c1a481217fdeb71eb",
  v4QuoterAddress: "0x55d235b3ff2daf7c3ede0defc9521f1d6fe6c5c0"
};
var UNICHAIN_SEPOLIA_ADDRESSES = {
  v3CoreFactoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  multicallAddress: "0x9D0F15f2cf58655fDDcD1EE6129C547fDaeD01b1",
  quoterAddress: "0x6Dd37329A1A225a6Fca658265D460423DCafBF89",
  v3MigratorAddress: "0xb5FA244C9d6D04B2FBac84418b3c4910ED1Ae5f2",
  nonfungiblePositionManagerAddress: "0xB7F724d6dDDFd008eFf5cc2834edDE5F9eF0d075",
  tickLensAddress: "0x5f739c790a48E97eec0efb81bab5D152c0A0ecA0",
  swapRouter02Address: "0xd1AAE39293221B77B0C71fBD6dCb7Ea29Bb5B166",
  v4PoolManagerAddress: "0x00b036b58a818b1bc34d502d3fe730db729e62ac",
  v4PositionManagerAddress: "0xf969aee60879c54baaed9f3ed26147db216fd664",
  v4StateView: "0xc199f1072a74d4e905aba1a84d9a45e2546b6222",
  v4QuoterAddress: "0x56dcd40a3f2d466f48e7f48bdbe5cc9b92ae4472"
};
var UNICHAIN_ADDRESSES = {
  v3CoreFactoryAddress: "0x1f98400000000000000000000000000000000003",
  multicallAddress: "0xb7610f9b733e7d45184be3a1bc966960ccc54f0b",
  quoterAddress: "0x565ac8c7863d9bb16d07e809ff49fe5cd467634c",
  v3MigratorAddress: "0xb9d0c246f306b1aaf02ae6ba112d5ef25e5b60dc",
  nonfungiblePositionManagerAddress: "0x943e6e07a7e8e791dafc44083e54041d743c46e9",
  tickLensAddress: "0xd5d76fa166ab8d8ad4c9f61aaa81457b66cbe443",
  swapRouter02Address: "0x73855d06de49d0fe4a9c42636ba96c62da12ff9c",
  v4PoolManagerAddress: "0x1f98400000000000000000000000000000000004",
  v4PositionManagerAddress: "0x4529a01c7a0410167c5740c487a8de60232617bf",
  v4StateView: "0x86e8631a016f9068c3f085faf484ee3f5fdee8f2",
  v4QuoterAddress: "0x333e3c607b141b18ff6de9f258db6e77fe7491e0"
};
var MONAD_TESTNET_ADDRESSES = {
  v3CoreFactoryAddress: "0x961235a9020b05c44df1026d956d1f4d78014276",
  multicallAddress: "0xa707ceb989cc3728551ed0e6e44b718dd114cf44",
  quoterAddress: "0x1ba215c17565de7b0cb7ecab971bcf540c24a862",
  v3MigratorAddress: "0x0a78348b71f8ae8caff2f8f9d4d74a2f36516661",
  nonfungiblePositionManagerAddress: "0x3dcc735c74f10fe2b9db2bb55c40fbbbf24490f7",
  tickLensAddress: "0x337478eb6058455ecb3696184b30dd6a29e3a893",
  swapRouter02Address: "0x4c4eabd5fb1d1a7234a48692551eaecff8194ca7"
};
var MONAD_ADDRESSES = {
  v3CoreFactoryAddress: "0x204faca1764b154221e35c0d20abb3c525710498",
  multicallAddress: "0xd1b797d92d87b688193a2b976efc8d577d204343",
  quoterAddress: "0x2d01411773c8c24805306e89a41f7855c3c4fe65",
  v3MigratorAddress: "0x7078c4537c04c2b2e52ddba06074dbdacf23ca15",
  nonfungiblePositionManagerAddress: "0x7197e214c0b767cfb76fb734ab638e2c192f4e53",
  tickLensAddress: "0xf025e0fe9e331a0ef05c2ad3c4e9c64b625cda6f",
  swapRouter02Address: "0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900",
  // v4
  v4PoolManagerAddress: "0x188d586ddcf52439676ca21a244753fa19f9ea8e",
  v4PositionManagerAddress: "0x5b7ec4a94ff9bedb700fb82ab09d5846972f4016",
  v4StateView: "0x77395f3b2e73ae90843717371294fa97cc419d64",
  v4QuoterAddress: "0xa222dd357a9076d1091ed6aa2e16c9742dd26891"
};
var SONEIUM_ADDRESSES = {
  v3CoreFactoryAddress: "0x42ae7ec7ff020412639d443e245d936429fbe717",
  multicallAddress: "0x8ad5ef2f2508288d2de66f04dd883ad5f4ef62b2",
  quoterAddress: "0x3e6c707d0125226ff60f291b6bd1404634f00aba",
  v3MigratorAddress: "0xa107580f73bd797bd8b87ff24e98346d99f93ddb",
  nonfungiblePositionManagerAddress: "0x56c1205b0244332011c1e866f4ea5384eb6bfa2c",
  tickLensAddress: "0xcd08eefb928c86499e6235ac155906bb7c4dc41a",
  swapRouter02Address: "0x7e40db01736f88464e5f4e42394f3d5bbb6705b9",
  v4PoolManagerAddress: "0x360e68faccca8ca495c1b759fd9eee466db9fb32",
  v4PositionManagerAddress: "0x1b35d13a2e2528f192637f14b05f0dc0e7deb566",
  v4StateView: "0x76fd297e2d437cd7f76d50f01afe6160f86e9990",
  v4QuoterAddress: "0x3972c00f7ed4885e145823eb7c655375d275a1c5"
};
var XLAYER_ADDRESSES = {
  v3CoreFactoryAddress: "0x4b2ab38dbf28d31d467aa8993f6c2585981d6804",
  multicallAddress: "0xe2023f3fa515cf070e07fd9d51c1d236e07843f4",
  quoterAddress: "0x976183ac3d09840d243a88c0268badb3b3e3259f",
  v3MigratorAddress: "0x7197e214c0b767cfb76fb734ab638e2c192f4e53",
  nonfungiblePositionManagerAddress: "0x315e413a11ab0df498ef83873012430ca36638ae",
  tickLensAddress: "0x661e93cca42afacb172121ef892830ca3b70f08d",
  swapRouter02Address: "0x4f0c28f5926afda16bf2506d5d9e57ea190f9bca",
  mixedRouteQuoterV2Address: "0x2d01411773c8c24805306e89a41f7855c3c4fe65",
  v4PoolManagerAddress: "0x360e68faccca8ca495c1b759fd9eee466db9fb32",
  v4PositionManagerAddress: "0xcF1EAFC6928dC385A342E7C6491d371d2871458b",
  v4StateView: "0x76fd297e2d437cd7f76d50f01afe6160f86e9990",
  v4QuoterAddress: "0x8928074ca1b241d8ec02815881c1af11e8bc5219"
};
var CHAIN_TO_ADDRESSES_MAP = {
  [1 /* MAINNET */]: MAINNET_ADDRESSES,
  [10 /* OPTIMISM */]: OPTIMISM_ADDRESSES,
  [42161 /* ARBITRUM_ONE */]: ARBITRUM_ONE_ADDRESSES,
  [137 /* POLYGON */]: POLYGON_ADDRESSES,
  [80001 /* POLYGON_MUMBAI */]: POLYGON_ADDRESSES,
  [5 /* GOERLI */]: GOERLI_ADDRESSES,
  [42220 /* CELO */]: CELO_ADDRESSES,
  [44787 /* CELO_ALFAJORES */]: CELO_ADDRESSES,
  [56 /* BNB */]: BNB_ADDRESSES,
  [420 /* OPTIMISM_GOERLI */]: OPTIMISM_GOERLI_ADDRESSES,
  [11155420 /* OPTIMISM_SEPOLIA */]: OPTIMISM_SEPOLIA_ADDRESSES,
  [421613 /* ARBITRUM_GOERLI */]: ARBITRUM_GOERLI_ADDRESSES,
  [421614 /* ARBITRUM_SEPOLIA */]: ARBITRUM_SEPOLIA_ADDRESSES,
  [11155111 /* SEPOLIA */]: SEPOLIA_ADDRESSES,
  [43114 /* AVALANCHE */]: AVALANCHE_ADDRESSES,
  [8453 /* BASE */]: BASE_ADDRESSES,
  [84531 /* BASE_GOERLI */]: BASE_GOERLI_ADDRESSES,
  [84532 /* BASE_SEPOLIA */]: BASE_SEPOLIA_ADDRESSES,
  [7777777 /* ZORA */]: ZORA_ADDRESSES,
  [999999999 /* ZORA_SEPOLIA */]: ZORA_SEPOLIA_ADDRESSES,
  [30 /* ROOTSTOCK */]: ROOTSTOCK_ADDRESSES,
  [81457 /* BLAST */]: BLAST_ADDRESSES,
  [324 /* ZKSYNC */]: ZKSYNC_ADDRESSES,
  [480 /* WORLDCHAIN */]: WORLDCHAIN_ADDRESSES,
  [1301 /* UNICHAIN_SEPOLIA */]: UNICHAIN_SEPOLIA_ADDRESSES,
  [130 /* UNICHAIN */]: UNICHAIN_ADDRESSES,
  [10143 /* MONAD_TESTNET */]: MONAD_TESTNET_ADDRESSES,
  [1868 /* SONEIUM */]: SONEIUM_ADDRESSES,
  [143 /* MONAD */]: MONAD_ADDRESSES,
  [196 /* XLAYER */]: XLAYER_ADDRESSES
};
var V3_CORE_FACTORY_ADDRESSES = {
  ...SUPPORTED_CHAINS.reduce((memo, chainId) => {
    memo[chainId] = CHAIN_TO_ADDRESSES_MAP[chainId].v3CoreFactoryAddress;
    return memo;
  }, {})
};
var V3_MIGRATOR_ADDRESSES = {
  ...SUPPORTED_CHAINS.reduce((memo, chainId) => {
    const v3MigratorAddress = CHAIN_TO_ADDRESSES_MAP[chainId].v3MigratorAddress;
    if (v3MigratorAddress) {
      memo[chainId] = v3MigratorAddress;
    }
    return memo;
  }, {})
};
var MULTICALL_ADDRESSES = {
  ...SUPPORTED_CHAINS.reduce((memo, chainId) => {
    memo[chainId] = CHAIN_TO_ADDRESSES_MAP[chainId].multicallAddress;
    return memo;
  }, {})
};
var GOVERNANCE_ALPHA_V0_ADDRESSES = constructSameAddressMap(
  "0x5e4be8Bc9637f0EAA1A755019e06A68ce081D58F"
);
var GOVERNANCE_ALPHA_V1_ADDRESSES = {
  [1 /* MAINNET */]: "0xC4e172459f1E7939D522503B81AFAaC1014CE6F6"
};
var GOVERNANCE_BRAVO_ADDRESSES = {
  [1 /* MAINNET */]: "0x408ED6354d4973f66138C91495F2f2FCbd8724C3"
};
var TIMELOCK_ADDRESSES = constructSameAddressMap("0x1a9C8182C09F50C8318d769245beA52c32BE35BC");
var MERKLE_DISTRIBUTOR_ADDRESS = {
  [1 /* MAINNET */]: "0x090D4613473dEE047c3f2706764f49E0821D256e"
};
var ARGENT_WALLET_DETECTOR_ADDRESS = {
  [1 /* MAINNET */]: "0xeca4B0bDBf7c55E9b7925919d03CbF8Dc82537E8"
};
var QUOTER_ADDRESSES = {
  ...SUPPORTED_CHAINS.reduce((memo, chainId) => {
    memo[chainId] = CHAIN_TO_ADDRESSES_MAP[chainId].quoterAddress;
    return memo;
  }, {})
};
var NONFUNGIBLE_POSITION_MANAGER_ADDRESSES = {
  ...SUPPORTED_CHAINS.reduce((memo, chainId) => {
    const nonfungiblePositionManagerAddress = CHAIN_TO_ADDRESSES_MAP[chainId].nonfungiblePositionManagerAddress;
    if (nonfungiblePositionManagerAddress) {
      memo[chainId] = nonfungiblePositionManagerAddress;
    }
    return memo;
  }, {})
};
var ENS_REGISTRAR_ADDRESSES = {
  ...constructSameAddressMap("0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e")
};
var SOCKS_CONTROLLER_ADDRESSES = {
  [1 /* MAINNET */]: "0x65770b5283117639760beA3F867b69b3697a91dd"
};
var TICK_LENS_ADDRESSES = {
  ...SUPPORTED_CHAINS.reduce((memo, chainId) => {
    const tickLensAddress = CHAIN_TO_ADDRESSES_MAP[chainId].tickLensAddress;
    if (tickLensAddress) {
      memo[chainId] = tickLensAddress;
    }
    return memo;
  }, {})
};
var MIXED_ROUTE_QUOTER_V1_ADDRESSES = SUPPORTED_CHAINS.reduce((memo, chainId) => {
  const mixedRouteQuoterV1Address = CHAIN_TO_ADDRESSES_MAP[chainId].mixedRouteQuoterV1Address;
  if (mixedRouteQuoterV1Address) {
    memo[chainId] = mixedRouteQuoterV1Address;
  }
  return memo;
}, {});
var SWAP_ROUTER_02_ADDRESSES = (chainId) => {
  if (SUPPORTED_CHAINS.includes(chainId)) {
    const id = chainId;
    return CHAIN_TO_ADDRESSES_MAP[id].swapRouter02Address ?? "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
  }
  return "";
};
var TradeType = /* @__PURE__ */ ((TradeType2) => {
  TradeType2[TradeType2["EXACT_INPUT"] = 0] = "EXACT_INPUT";
  TradeType2[TradeType2["EXACT_OUTPUT"] = 1] = "EXACT_OUTPUT";
  return TradeType2;
})(TradeType || {});
var Rounding = /* @__PURE__ */ ((Rounding2) => {
  Rounding2[Rounding2["ROUND_DOWN"] = 0] = "ROUND_DOWN";
  Rounding2[Rounding2["ROUND_HALF_UP"] = 1] = "ROUND_HALF_UP";
  Rounding2[Rounding2["ROUND_UP"] = 2] = "ROUND_UP";
  return Rounding2;
})(Rounding || {});
var MaxUint256 = JSBI2__default.default.BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
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
  constructor(numerator, denominator = JSBI2__default.default.BigInt(1)) {
    this.numerator = JSBI2__default.default.BigInt(numerator);
    this.denominator = JSBI2__default.default.BigInt(denominator);
  }
  static tryParseFraction(fractionish) {
    if (fractionish instanceof JSBI2__default.default || typeof fractionish === "number" || typeof fractionish === "string")
      return new _Fraction(fractionish);
    if ("numerator" in fractionish && "denominator" in fractionish) return fractionish;
    throw new Error("Could not parse fraction");
  }
  // performs floor division
  get quotient() {
    return JSBI2__default.default.divide(this.numerator, this.denominator);
  }
  // remainder after floor division
  get remainder() {
    return new _Fraction(JSBI2__default.default.remainder(this.numerator, this.denominator), this.denominator);
  }
  invert() {
    return new _Fraction(this.denominator, this.numerator);
  }
  add(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    if (JSBI2__default.default.equal(this.denominator, otherParsed.denominator)) {
      return new _Fraction(JSBI2__default.default.add(this.numerator, otherParsed.numerator), this.denominator);
    }
    return new _Fraction(
      JSBI2__default.default.add(
        JSBI2__default.default.multiply(this.numerator, otherParsed.denominator),
        JSBI2__default.default.multiply(otherParsed.numerator, this.denominator)
      ),
      JSBI2__default.default.multiply(this.denominator, otherParsed.denominator)
    );
  }
  subtract(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    if (JSBI2__default.default.equal(this.denominator, otherParsed.denominator)) {
      return new _Fraction(JSBI2__default.default.subtract(this.numerator, otherParsed.numerator), this.denominator);
    }
    return new _Fraction(
      JSBI2__default.default.subtract(
        JSBI2__default.default.multiply(this.numerator, otherParsed.denominator),
        JSBI2__default.default.multiply(otherParsed.numerator, this.denominator)
      ),
      JSBI2__default.default.multiply(this.denominator, otherParsed.denominator)
    );
  }
  lessThan(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    return JSBI2__default.default.lessThan(
      JSBI2__default.default.multiply(this.numerator, otherParsed.denominator),
      JSBI2__default.default.multiply(otherParsed.numerator, this.denominator)
    );
  }
  equalTo(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    return JSBI2__default.default.equal(
      JSBI2__default.default.multiply(this.numerator, otherParsed.denominator),
      JSBI2__default.default.multiply(otherParsed.numerator, this.denominator)
    );
  }
  greaterThan(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    return JSBI2__default.default.greaterThan(
      JSBI2__default.default.multiply(this.numerator, otherParsed.denominator),
      JSBI2__default.default.multiply(otherParsed.numerator, this.denominator)
    );
  }
  multiply(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    return new _Fraction(
      JSBI2__default.default.multiply(this.numerator, otherParsed.numerator),
      JSBI2__default.default.multiply(this.denominator, otherParsed.denominator)
    );
  }
  divide(other) {
    const otherParsed = _Fraction.tryParseFraction(other);
    return new _Fraction(
      JSBI2__default.default.multiply(this.numerator, otherParsed.denominator),
      JSBI2__default.default.multiply(this.denominator, otherParsed.numerator)
    );
  }
  toSignificant(significantDigits, format = { groupSeparator: "" }, rounding = 1 /* ROUND_HALF_UP */) {
    invariant__default.default(Number.isInteger(significantDigits), `${significantDigits} is not an integer.`);
    invariant__default.default(significantDigits > 0, `${significantDigits} is not positive.`);
    Decimal.set({ precision: significantDigits + 1, rounding: toSignificantRounding[rounding] });
    const quotient = new Decimal(this.numerator.toString()).div(this.denominator.toString()).toSignificantDigits(significantDigits);
    return quotient.toFormat(quotient.decimalPlaces(), format);
  }
  toFixed(decimalPlaces, format = { groupSeparator: "" }, rounding = 1 /* ROUND_HALF_UP */) {
    invariant__default.default(Number.isInteger(decimalPlaces), `${decimalPlaces} is not an integer.`);
    invariant__default.default(decimalPlaces >= 0, `${decimalPlaces} is negative.`);
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
    invariant__default.default(JSBI2__default.default.lessThanOrEqual(this.quotient, MaxUint256), "AMOUNT");
    this.currency = currency;
    this.decimalScale = JSBI2__default.default.exponentiate(JSBI2__default.default.BigInt(10), JSBI2__default.default.BigInt(currency.decimals));
  }
  add(other) {
    invariant__default.default(this.currency.equals(other.currency), "CURRENCY");
    const added = super.add(other);
    return _CurrencyAmount.fromFractionalAmount(this.currency, added.numerator, added.denominator);
  }
  subtract(other) {
    invariant__default.default(this.currency.equals(other.currency), "CURRENCY");
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
    invariant__default.default(decimalPlaces <= this.currency.decimals, "DECIMALS");
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
var ONE_HUNDRED = new Fraction(JSBI2__default.default.BigInt(100));
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
      JSBI2__default.default.exponentiate(JSBI2__default.default.BigInt(10), JSBI2__default.default.BigInt(baseCurrency.decimals)),
      JSBI2__default.default.exponentiate(JSBI2__default.default.BigInt(10), JSBI2__default.default.BigInt(quoteCurrency.decimals))
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
    invariant__default.default(this.quoteCurrency.equals(other.baseCurrency), "TOKEN");
    const fraction = super.multiply(other);
    return new _Price(this.baseCurrency, other.quoteCurrency, fraction.denominator, fraction.numerator);
  }
  /**
   * Return the amount of quote currency corresponding to a given amount of the base currency
   * @param currencyAmount the amount of base currency to quote against the price
   */
  quote(currencyAmount) {
    invariant__default.default(currencyAmount.currency.equals(this.baseCurrency), "TOKEN");
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
var BaseCurrency = class {
  /**
   * Constructs an instance of the base class `BaseCurrency`.
   * @param chainId the chain ID on which this currency resides
   * @param decimals decimals of the currency
   * @param symbol symbol of the currency
   * @param name of the currency
   */
  constructor(chainId, decimals, symbol, name) {
    invariant__default.default(Number.isSafeInteger(chainId), "CHAIN_ID");
    invariant__default.default(decimals >= 0 && decimals < 255 && Number.isInteger(decimals), "DECIMALS");
    this.chainId = chainId;
    this.decimals = decimals;
    this.symbol = symbol;
    this.name = name;
  }
};

// src/core/entities/nativeCurrency.ts
var NativeCurrency = class extends BaseCurrency {
  constructor() {
    super(...arguments);
    this.isNative = true;
    this.isToken = false;
  }
};

// ../../node_modules/@ethersproject/bignumber/lib.esm/bignumber.js
var import_bn = __toESM(require_bn());

// ../../node_modules/@ethersproject/logger/lib.esm/_version.js
var version = "logger/5.8.0";

// ../../node_modules/@ethersproject/logger/lib.esm/index.js
var _permanentCensorErrors = false;
var _censorErrors = false;
var LogLevels = { debug: 1, "default": 2, info: 2, warning: 3, error: 4, off: 5 };
var _logLevel = LogLevels["default"];
var _globalLogger = null;
function _checkNormalize() {
  try {
    const missing = [];
    ["NFD", "NFC", "NFKD", "NFKC"].forEach((form) => {
      try {
        if ("test".normalize(form) !== "test") {
          throw new Error("bad normalize");
        }
        ;
      } catch (error) {
        missing.push(form);
      }
    });
    if (missing.length) {
      throw new Error("missing " + missing.join(", "));
    }
    if (String.fromCharCode(233).normalize("NFD") !== String.fromCharCode(101, 769)) {
      throw new Error("broken implementation");
    }
  } catch (error) {
    return error.message;
  }
  return null;
}
var _normalizeError = _checkNormalize();
var LogLevel;
(function(LogLevel2) {
  LogLevel2["DEBUG"] = "DEBUG";
  LogLevel2["INFO"] = "INFO";
  LogLevel2["WARNING"] = "WARNING";
  LogLevel2["ERROR"] = "ERROR";
  LogLevel2["OFF"] = "OFF";
})(LogLevel || (LogLevel = {}));
var ErrorCode;
(function(ErrorCode2) {
  ErrorCode2["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
  ErrorCode2["NOT_IMPLEMENTED"] = "NOT_IMPLEMENTED";
  ErrorCode2["UNSUPPORTED_OPERATION"] = "UNSUPPORTED_OPERATION";
  ErrorCode2["NETWORK_ERROR"] = "NETWORK_ERROR";
  ErrorCode2["SERVER_ERROR"] = "SERVER_ERROR";
  ErrorCode2["TIMEOUT"] = "TIMEOUT";
  ErrorCode2["BUFFER_OVERRUN"] = "BUFFER_OVERRUN";
  ErrorCode2["NUMERIC_FAULT"] = "NUMERIC_FAULT";
  ErrorCode2["MISSING_NEW"] = "MISSING_NEW";
  ErrorCode2["INVALID_ARGUMENT"] = "INVALID_ARGUMENT";
  ErrorCode2["MISSING_ARGUMENT"] = "MISSING_ARGUMENT";
  ErrorCode2["UNEXPECTED_ARGUMENT"] = "UNEXPECTED_ARGUMENT";
  ErrorCode2["CALL_EXCEPTION"] = "CALL_EXCEPTION";
  ErrorCode2["INSUFFICIENT_FUNDS"] = "INSUFFICIENT_FUNDS";
  ErrorCode2["NONCE_EXPIRED"] = "NONCE_EXPIRED";
  ErrorCode2["REPLACEMENT_UNDERPRICED"] = "REPLACEMENT_UNDERPRICED";
  ErrorCode2["UNPREDICTABLE_GAS_LIMIT"] = "UNPREDICTABLE_GAS_LIMIT";
  ErrorCode2["TRANSACTION_REPLACED"] = "TRANSACTION_REPLACED";
  ErrorCode2["ACTION_REJECTED"] = "ACTION_REJECTED";
})(ErrorCode || (ErrorCode = {}));
var HEX = "0123456789abcdef";
var Logger = class _Logger {
  constructor(version3) {
    Object.defineProperty(this, "version", {
      enumerable: true,
      value: version3,
      writable: false
    });
  }
  _log(logLevel, args) {
    const level = logLevel.toLowerCase();
    if (LogLevels[level] == null) {
      this.throwArgumentError("invalid log level name", "logLevel", logLevel);
    }
    if (_logLevel > LogLevels[level]) {
      return;
    }
    console.log.apply(console, args);
  }
  debug(...args) {
    this._log(_Logger.levels.DEBUG, args);
  }
  info(...args) {
    this._log(_Logger.levels.INFO, args);
  }
  warn(...args) {
    this._log(_Logger.levels.WARNING, args);
  }
  makeError(message, code, params) {
    if (_censorErrors) {
      return this.makeError("censored error", code, {});
    }
    if (!code) {
      code = _Logger.errors.UNKNOWN_ERROR;
    }
    if (!params) {
      params = {};
    }
    const messageDetails = [];
    Object.keys(params).forEach((key) => {
      const value = params[key];
      try {
        if (value instanceof Uint8Array) {
          let hex = "";
          for (let i = 0; i < value.length; i++) {
            hex += HEX[value[i] >> 4];
            hex += HEX[value[i] & 15];
          }
          messageDetails.push(key + "=Uint8Array(0x" + hex + ")");
        } else {
          messageDetails.push(key + "=" + JSON.stringify(value));
        }
      } catch (error2) {
        messageDetails.push(key + "=" + JSON.stringify(params[key].toString()));
      }
    });
    messageDetails.push(`code=${code}`);
    messageDetails.push(`version=${this.version}`);
    const reason = message;
    let url = "";
    switch (code) {
      case ErrorCode.NUMERIC_FAULT: {
        url = "NUMERIC_FAULT";
        const fault = message;
        switch (fault) {
          case "overflow":
          case "underflow":
          case "division-by-zero":
            url += "-" + fault;
            break;
          case "negative-power":
          case "negative-width":
            url += "-unsupported";
            break;
          case "unbound-bitwise-result":
            url += "-unbound-result";
            break;
        }
        break;
      }
      case ErrorCode.CALL_EXCEPTION:
      case ErrorCode.INSUFFICIENT_FUNDS:
      case ErrorCode.MISSING_NEW:
      case ErrorCode.NONCE_EXPIRED:
      case ErrorCode.REPLACEMENT_UNDERPRICED:
      case ErrorCode.TRANSACTION_REPLACED:
      case ErrorCode.UNPREDICTABLE_GAS_LIMIT:
        url = code;
        break;
    }
    if (url) {
      message += " [ See: https://links.ethers.org/v5-errors-" + url + " ]";
    }
    if (messageDetails.length) {
      message += " (" + messageDetails.join(", ") + ")";
    }
    const error = new Error(message);
    error.reason = reason;
    error.code = code;
    Object.keys(params).forEach(function(key) {
      error[key] = params[key];
    });
    return error;
  }
  throwError(message, code, params) {
    throw this.makeError(message, code, params);
  }
  throwArgumentError(message, name, value) {
    return this.throwError(message, _Logger.errors.INVALID_ARGUMENT, {
      argument: name,
      value
    });
  }
  assert(condition, message, code, params) {
    if (!!condition) {
      return;
    }
    this.throwError(message, code, params);
  }
  assertArgument(condition, message, name, value) {
    if (!!condition) {
      return;
    }
    this.throwArgumentError(message, name, value);
  }
  checkNormalize(message) {
    if (_normalizeError) {
      this.throwError("platform missing String.prototype.normalize", _Logger.errors.UNSUPPORTED_OPERATION, {
        operation: "String.prototype.normalize",
        form: _normalizeError
      });
    }
  }
  checkSafeUint53(value, message) {
    if (typeof value !== "number") {
      return;
    }
    if (message == null) {
      message = "value not safe";
    }
    if (value < 0 || value >= 9007199254740991) {
      this.throwError(message, _Logger.errors.NUMERIC_FAULT, {
        operation: "checkSafeInteger",
        fault: "out-of-safe-range",
        value
      });
    }
    if (value % 1) {
      this.throwError(message, _Logger.errors.NUMERIC_FAULT, {
        operation: "checkSafeInteger",
        fault: "non-integer",
        value
      });
    }
  }
  checkArgumentCount(count, expectedCount, message) {
    if (message) {
      message = ": " + message;
    } else {
      message = "";
    }
    if (count < expectedCount) {
      this.throwError("missing argument" + message, _Logger.errors.MISSING_ARGUMENT, {
        count,
        expectedCount
      });
    }
    if (count > expectedCount) {
      this.throwError("too many arguments" + message, _Logger.errors.UNEXPECTED_ARGUMENT, {
        count,
        expectedCount
      });
    }
  }
  checkNew(target, kind) {
    if (target === Object || target == null) {
      this.throwError("missing new", _Logger.errors.MISSING_NEW, { name: kind.name });
    }
  }
  checkAbstract(target, kind) {
    if (target === kind) {
      this.throwError("cannot instantiate abstract class " + JSON.stringify(kind.name) + " directly; use a sub-class", _Logger.errors.UNSUPPORTED_OPERATION, { name: target.name, operation: "new" });
    } else if (target === Object || target == null) {
      this.throwError("missing new", _Logger.errors.MISSING_NEW, { name: kind.name });
    }
  }
  static globalLogger() {
    if (!_globalLogger) {
      _globalLogger = new _Logger(version);
    }
    return _globalLogger;
  }
  static setCensorship(censorship, permanent) {
    if (!censorship && permanent) {
      this.globalLogger().throwError("cannot permanently disable censorship", _Logger.errors.UNSUPPORTED_OPERATION, {
        operation: "setCensorship"
      });
    }
    if (_permanentCensorErrors) {
      if (!censorship) {
        return;
      }
      this.globalLogger().throwError("error censorship permanent", _Logger.errors.UNSUPPORTED_OPERATION, {
        operation: "setCensorship"
      });
    }
    _censorErrors = !!censorship;
    _permanentCensorErrors = !!permanent;
  }
  static setLogLevel(logLevel) {
    const level = LogLevels[logLevel.toLowerCase()];
    if (level == null) {
      _Logger.globalLogger().warn("invalid log level - " + logLevel);
      return;
    }
    _logLevel = level;
  }
  static from(version3) {
    return new _Logger(version3);
  }
};
Logger.errors = ErrorCode;
Logger.levels = LogLevel;

// ../../node_modules/@ethersproject/bignumber/lib.esm/_version.js
var version2 = "bignumber/5.8.0";

// ../../node_modules/@ethersproject/bignumber/lib.esm/bignumber.js
var BN = import_bn.default.BN;
var logger = new Logger(version2);
var _constructorGuard = {};
var MAX_SAFE = 9007199254740991;
var _warnedToStringRadix = false;
var BigNumber = class _BigNumber {
  constructor(constructorGuard, hex) {
    if (constructorGuard !== _constructorGuard) {
      logger.throwError("cannot call constructor directly; use BigNumber.from", Logger.errors.UNSUPPORTED_OPERATION, {
        operation: "new (BigNumber)"
      });
    }
    this._hex = hex;
    this._isBigNumber = true;
    Object.freeze(this);
  }
  fromTwos(value) {
    return toBigNumber(toBN(this).fromTwos(value));
  }
  toTwos(value) {
    return toBigNumber(toBN(this).toTwos(value));
  }
  abs() {
    if (this._hex[0] === "-") {
      return _BigNumber.from(this._hex.substring(1));
    }
    return this;
  }
  add(other) {
    return toBigNumber(toBN(this).add(toBN(other)));
  }
  sub(other) {
    return toBigNumber(toBN(this).sub(toBN(other)));
  }
  div(other) {
    const o = _BigNumber.from(other);
    if (o.isZero()) {
      throwFault("division-by-zero", "div");
    }
    return toBigNumber(toBN(this).div(toBN(other)));
  }
  mul(other) {
    return toBigNumber(toBN(this).mul(toBN(other)));
  }
  mod(other) {
    const value = toBN(other);
    if (value.isNeg()) {
      throwFault("division-by-zero", "mod");
    }
    return toBigNumber(toBN(this).umod(value));
  }
  pow(other) {
    const value = toBN(other);
    if (value.isNeg()) {
      throwFault("negative-power", "pow");
    }
    return toBigNumber(toBN(this).pow(value));
  }
  and(other) {
    const value = toBN(other);
    if (this.isNegative() || value.isNeg()) {
      throwFault("unbound-bitwise-result", "and");
    }
    return toBigNumber(toBN(this).and(value));
  }
  or(other) {
    const value = toBN(other);
    if (this.isNegative() || value.isNeg()) {
      throwFault("unbound-bitwise-result", "or");
    }
    return toBigNumber(toBN(this).or(value));
  }
  xor(other) {
    const value = toBN(other);
    if (this.isNegative() || value.isNeg()) {
      throwFault("unbound-bitwise-result", "xor");
    }
    return toBigNumber(toBN(this).xor(value));
  }
  mask(value) {
    if (this.isNegative() || value < 0) {
      throwFault("negative-width", "mask");
    }
    return toBigNumber(toBN(this).maskn(value));
  }
  shl(value) {
    if (this.isNegative() || value < 0) {
      throwFault("negative-width", "shl");
    }
    return toBigNumber(toBN(this).shln(value));
  }
  shr(value) {
    if (this.isNegative() || value < 0) {
      throwFault("negative-width", "shr");
    }
    return toBigNumber(toBN(this).shrn(value));
  }
  eq(other) {
    return toBN(this).eq(toBN(other));
  }
  lt(other) {
    return toBN(this).lt(toBN(other));
  }
  lte(other) {
    return toBN(this).lte(toBN(other));
  }
  gt(other) {
    return toBN(this).gt(toBN(other));
  }
  gte(other) {
    return toBN(this).gte(toBN(other));
  }
  isNegative() {
    return this._hex[0] === "-";
  }
  isZero() {
    return toBN(this).isZero();
  }
  toNumber() {
    try {
      return toBN(this).toNumber();
    } catch (error) {
      throwFault("overflow", "toNumber", this.toString());
    }
    return null;
  }
  toBigInt() {
    try {
      return BigInt(this.toString());
    } catch (e) {
    }
    return logger.throwError("this platform does not support BigInt", Logger.errors.UNSUPPORTED_OPERATION, {
      value: this.toString()
    });
  }
  toString() {
    if (arguments.length > 0) {
      if (arguments[0] === 10) {
        if (!_warnedToStringRadix) {
          _warnedToStringRadix = true;
          logger.warn("BigNumber.toString does not accept any parameters; base-10 is assumed");
        }
      } else if (arguments[0] === 16) {
        logger.throwError("BigNumber.toString does not accept any parameters; use bigNumber.toHexString()", Logger.errors.UNEXPECTED_ARGUMENT, {});
      } else {
        logger.throwError("BigNumber.toString does not accept parameters", Logger.errors.UNEXPECTED_ARGUMENT, {});
      }
    }
    return toBN(this).toString(10);
  }
  toHexString() {
    return this._hex;
  }
  toJSON(key) {
    return { type: "BigNumber", hex: this.toHexString() };
  }
  static from(value) {
    if (value instanceof _BigNumber) {
      return value;
    }
    if (typeof value === "string") {
      if (value.match(/^-?0x[0-9a-f]+$/i)) {
        return new _BigNumber(_constructorGuard, toHex(value));
      }
      if (value.match(/^-?[0-9]+$/)) {
        return new _BigNumber(_constructorGuard, toHex(new BN(value)));
      }
      return logger.throwArgumentError("invalid BigNumber string", "value", value);
    }
    if (typeof value === "number") {
      if (value % 1) {
        throwFault("underflow", "BigNumber.from", value);
      }
      if (value >= MAX_SAFE || value <= -MAX_SAFE) {
        throwFault("overflow", "BigNumber.from", value);
      }
      return _BigNumber.from(String(value));
    }
    const anyValue = value;
    if (typeof anyValue === "bigint") {
      return _BigNumber.from(anyValue.toString());
    }
    if (bytes.isBytes(anyValue)) {
      return _BigNumber.from(bytes.hexlify(anyValue));
    }
    if (anyValue) {
      if (anyValue.toHexString) {
        const hex = anyValue.toHexString();
        if (typeof hex === "string") {
          return _BigNumber.from(hex);
        }
      } else {
        let hex = anyValue._hex;
        if (hex == null && anyValue.type === "BigNumber") {
          hex = anyValue.hex;
        }
        if (typeof hex === "string") {
          if (bytes.isHexString(hex) || hex[0] === "-" && bytes.isHexString(hex.substring(1))) {
            return _BigNumber.from(hex);
          }
        }
      }
    }
    return logger.throwArgumentError("invalid BigNumber value", "value", value);
  }
  static isBigNumber(value) {
    return !!(value && value._isBigNumber);
  }
};
function toHex(value) {
  if (typeof value !== "string") {
    return toHex(value.toString(16));
  }
  if (value[0] === "-") {
    value = value.substring(1);
    if (value[0] === "-") {
      logger.throwArgumentError("invalid hex", "value", value);
    }
    value = toHex(value);
    if (value === "0x00") {
      return value;
    }
    return "-" + value;
  }
  if (value.substring(0, 2) !== "0x") {
    value = "0x" + value;
  }
  if (value === "0x") {
    return "0x00";
  }
  if (value.length % 2) {
    value = "0x0" + value.substring(2);
  }
  while (value.length > 4 && value.substring(0, 4) === "0x00") {
    value = "0x" + value.substring(4);
  }
  return value;
}
function toBigNumber(value) {
  return BigNumber.from(toHex(value));
}
function toBN(value) {
  const hex = BigNumber.from(value).toHexString();
  if (hex[0] === "-") {
    return new BN("-" + hex.substring(3), 16);
  }
  return new BN(hex.substring(2), 16);
}
function throwFault(fault, operation, value) {
  const params = { fault, operation };
  if (value != null) {
    params.value = value;
  }
  return logger.throwError(fault, Logger.errors.NUMERIC_FAULT, params);
}
function validateAndParseAddress(address$1) {
  try {
    return address.getAddress(address$1);
  } catch (error) {
    throw new Error(`${address$1} is not a valid address.`);
  }
}
var startsWith0xLen42HexRegex = /^0x[0-9a-fA-F]{40}$/;
function checkValidAddress(address) {
  if (startsWith0xLen42HexRegex.test(address)) {
    return address;
  }
  throw new Error(`${address} is not a valid address.`);
}

// src/core/entities/token.ts
var Token = class extends BaseCurrency {
  /**
   *
   * @param chainId {@link BaseCurrency#chainId}
   * @param address The contract address on the chain on which this token lives
   * @param decimals {@link BaseCurrency#decimals}
   * @param symbol {@link BaseCurrency#symbol}
   * @param name {@link BaseCurrency#name}
   * @param bypassChecksum If true it only checks for length === 42, startsWith 0x and contains only hex characters
   * @param buyFeeBps Buy fee tax for FOT tokens, in basis points
   * @param sellFeeBps Sell fee tax for FOT tokens, in basis points
   */
  constructor(chainId, address, decimals, symbol, name, bypassChecksum, buyFeeBps, sellFeeBps) {
    super(chainId, decimals, symbol, name);
    this.isNative = false;
    this.isToken = true;
    if (bypassChecksum) {
      this.address = checkValidAddress(address);
    } else {
      this.address = validateAndParseAddress(address);
    }
    if (buyFeeBps) {
      invariant__default.default(buyFeeBps.gte(BigNumber.from(0)), "NON-NEGATIVE FOT FEES");
    }
    if (sellFeeBps) {
      invariant__default.default(sellFeeBps.gte(BigNumber.from(0)), "NON-NEGATIVE FOT FEES");
    }
    this.buyFeeBps = buyFeeBps;
    this.sellFeeBps = sellFeeBps;
  }
  /**
   * Returns true if the two tokens are equivalent, i.e. have the same chainId and address.
   * @param other other token to compare
   */
  equals(other) {
    return other.isToken && this.chainId === other.chainId && this.address.toLowerCase() === other.address.toLowerCase();
  }
  /**
   * Returns true if the address of this token sorts before the address of the other token
   * @param other other token to compare
   * @throws if the tokens have the same address
   * @throws if the tokens are on different chains
   */
  sortsBefore(other) {
    invariant__default.default(this.chainId === other.chainId, "CHAIN_IDS");
    invariant__default.default(this.address.toLowerCase() !== other.address.toLowerCase(), "ADDRESSES");
    return this.address.toLowerCase() < other.address.toLowerCase();
  }
  /**
   * Return this token, which does not need to be wrapped
   */
  get wrapped() {
    return this;
  }
};

// src/core/entities/weth9.ts
var WETH9 = {
  1: new Token(1, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 18, "WETH", "Wrapped Ether"),
  11155111: new Token(11155111, "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", 18, "WETH", "Wrapped Ether"),
  3: new Token(3, "0xc778417E063141139Fce010982780140Aa0cD5Ab", 18, "WETH", "Wrapped Ether"),
  4: new Token(4, "0xc778417E063141139Fce010982780140Aa0cD5Ab", 18, "WETH", "Wrapped Ether"),
  5: new Token(5, "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6", 18, "WETH", "Wrapped Ether"),
  42: new Token(42, "0xd0A1E359811322d97991E03f863a0C30C2cF029C", 18, "WETH", "Wrapped Ether"),
  10: new Token(10, "0x4200000000000000000000000000000000000006", 18, "WETH", "Wrapped Ether"),
  69: new Token(69, "0x4200000000000000000000000000000000000006", 18, "WETH", "Wrapped Ether"),
  11155420: new Token(11155420, "0x4200000000000000000000000000000000000006", 18, "WETH", "Wrapped Ether"),
  42161: new Token(42161, "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", 18, "WETH", "Wrapped Ether"),
  421611: new Token(421611, "0xB47e6A5f8b33b3F17603C83a0535A9dcD7E32681", 18, "WETH", "Wrapped Ether"),
  421614: new Token(421614, "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73", 18, "WETH", "Wrapped Ether"),
  8453: new Token(8453, "0x4200000000000000000000000000000000000006", 18, "WETH", "Wrapped Ether"),
  84532: new Token(84532, "0x4200000000000000000000000000000000000006", 18, "WETH", "Wrapped Ether"),
  56: new Token(56, "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", 18, "WBNB", "Wrapped BNB"),
  137: new Token(137, "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", 18, "WMATIC", "Wrapped MATIC"),
  43114: new Token(43114, "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", 18, "WAVAX", "Wrapped AVAX"),
  7777777: new Token(7777777, "0x4200000000000000000000000000000000000006", 18, "WETH", "Wrapped Ether"),
  81457: new Token(81457, "0x4300000000000000000000000000000000000004", 18, "WETH", "Wrapped Ether"),
  324: new Token(324, "0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91", 18, "WETH", "Wrapped Ether"),
  480: new Token(480, "0x4200000000000000000000000000000000000006", 18, "WETH", "Wrapped Ether"),
  1301: new Token(1301, "0x4200000000000000000000000000000000000006", 18, "WETH", "Wrapped Ether"),
  130: new Token(130, "0x4200000000000000000000000000000000000006", 18, "WETH", "Wrapped Ether"),
  10143: new Token(10143, "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701", 18, "WMON", "Wrapped Monad"),
  1868: new Token(1868, "0x4200000000000000000000000000000000000006", 18, "WETH", "Wrapped Ether"),
  143: new Token(143, "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A", 18, "WMON", "Wrapped Monad")
};

// src/core/entities/ether.ts
var _Ether = class _Ether extends NativeCurrency {
  constructor(chainId) {
    super(chainId, 18, "ETH", "Ether");
  }
  get wrapped() {
    const weth9 = WETH9[this.chainId];
    invariant__default.default(!!weth9, "WRAPPED");
    return weth9;
  }
  static onChain(chainId) {
    return this._etherCache[chainId] ?? (this._etherCache[chainId] = new _Ether(chainId));
  }
  equals(other) {
    return other.isNative && other.chainId === this.chainId;
  }
};
_Ether._etherCache = {};
var Ether = _Ether;

// src/core/utils/computePriceImpact.ts
function computePriceImpact(midPrice, inputAmount, outputAmount) {
  const quotedOutputAmount = midPrice.quote(inputAmount);
  const priceImpact = quotedOutputAmount.subtract(outputAmount).divide(quotedOutputAmount);
  return new Percent(priceImpact.numerator, priceImpact.denominator);
}
function computeZksyncCreate2Address(sender, bytecodeHash, salt, input = "0x") {
  const prefix = keccak256.keccak256(strings.toUtf8Bytes("zksyncCreate2"));
  const inputHash = keccak256.keccak256(input);
  const addressBytes = keccak256.keccak256(bytes.concat([prefix, bytes.hexZeroPad(sender, 32), salt, bytecodeHash, inputHash])).slice(26);
  return address.getAddress(addressBytes);
}
function sortedInsert(items, add, maxSize, comparator) {
  invariant__default.default(maxSize > 0, "MAX_SIZE_ZERO");
  invariant__default.default(items.length <= maxSize, "ITEMS_SIZE");
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
var MAX_SAFE_INTEGER = JSBI2__default.default.BigInt(Number.MAX_SAFE_INTEGER);
var ZERO = JSBI2__default.default.BigInt(0);
var ONE = JSBI2__default.default.BigInt(1);
var TWO = JSBI2__default.default.BigInt(2);
function sqrt(value) {
  invariant__default.default(JSBI2__default.default.greaterThanOrEqual(value, ZERO), "NEGATIVE");
  if (JSBI2__default.default.lessThan(value, MAX_SAFE_INTEGER)) {
    return JSBI2__default.default.BigInt(Math.floor(Math.sqrt(JSBI2__default.default.toNumber(value))));
  }
  let z;
  let x;
  z = value;
  x = JSBI2__default.default.add(JSBI2__default.default.divide(value, TWO), ONE);
  while (JSBI2__default.default.lessThan(x, z)) {
    z = x;
    x = JSBI2__default.default.divide(JSBI2__default.default.add(JSBI2__default.default.divide(value, x), x), TWO);
  }
  return z;
}

exports.ARGENT_WALLET_DETECTOR_ADDRESS = ARGENT_WALLET_DETECTOR_ADDRESS;
exports.CHAIN_TO_ADDRESSES_MAP = CHAIN_TO_ADDRESSES_MAP;
exports.ChainId = ChainId;
exports.CurrencyAmount = CurrencyAmount;
exports.ENS_REGISTRAR_ADDRESSES = ENS_REGISTRAR_ADDRESSES;
exports.Ether = Ether;
exports.Fraction = Fraction;
exports.GOVERNANCE_ALPHA_V0_ADDRESSES = GOVERNANCE_ALPHA_V0_ADDRESSES;
exports.GOVERNANCE_ALPHA_V1_ADDRESSES = GOVERNANCE_ALPHA_V1_ADDRESSES;
exports.GOVERNANCE_BRAVO_ADDRESSES = GOVERNANCE_BRAVO_ADDRESSES;
exports.MERKLE_DISTRIBUTOR_ADDRESS = MERKLE_DISTRIBUTOR_ADDRESS;
exports.MIXED_ROUTE_QUOTER_V1_ADDRESSES = MIXED_ROUTE_QUOTER_V1_ADDRESSES;
exports.MULTICALL_ADDRESSES = MULTICALL_ADDRESSES;
exports.MaxUint256 = MaxUint256;
exports.NONFUNGIBLE_POSITION_MANAGER_ADDRESSES = NONFUNGIBLE_POSITION_MANAGER_ADDRESSES;
exports.NativeCurrency = NativeCurrency;
exports.NativeCurrencyName = NativeCurrencyName;
exports.Percent = Percent;
exports.Price = Price;
exports.QUOTER_ADDRESSES = QUOTER_ADDRESSES;
exports.Rounding = Rounding;
exports.SOCKS_CONTROLLER_ADDRESSES = SOCKS_CONTROLLER_ADDRESSES;
exports.SUPPORTED_CHAINS = SUPPORTED_CHAINS;
exports.SWAP_ROUTER_02_ADDRESSES = SWAP_ROUTER_02_ADDRESSES;
exports.TICK_LENS_ADDRESSES = TICK_LENS_ADDRESSES;
exports.TIMELOCK_ADDRESSES = TIMELOCK_ADDRESSES;
exports.Token = Token;
exports.TradeType = TradeType;
exports.UNISWAP_NFT_AIRDROP_CLAIM_ADDRESS = UNISWAP_NFT_AIRDROP_CLAIM_ADDRESS;
exports.UNI_ADDRESSES = UNI_ADDRESSES;
exports.V2_FACTORY_ADDRESS = V2_FACTORY_ADDRESS;
exports.V2_FACTORY_ADDRESSES = V2_FACTORY_ADDRESSES;
exports.V2_ROUTER_ADDRESS = V2_ROUTER_ADDRESS;
exports.V2_ROUTER_ADDRESSES = V2_ROUTER_ADDRESSES;
exports.V3_CORE_FACTORY_ADDRESSES = V3_CORE_FACTORY_ADDRESSES;
exports.V3_MIGRATOR_ADDRESSES = V3_MIGRATOR_ADDRESSES;
exports.WETH9 = WETH9;
exports.computePriceImpact = computePriceImpact;
exports.computeZksyncCreate2Address = computeZksyncCreate2Address;
exports.sortedInsert = sortedInsert;
exports.sqrt = sqrt;
exports.validateAndParseAddress = validateAndParseAddress;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map