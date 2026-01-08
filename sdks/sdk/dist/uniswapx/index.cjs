'use strict';

var keccak256 = require('@ethersproject/keccak256');
var strings = require('@ethersproject/strings');
var address = require('@ethersproject/address');
var bytes = require('@ethersproject/bytes');
var invariant8 = require('tiny-invariant');
var ethers = require('ethers');
var utils = require('ethers/lib/utils');
var JSBI2 = require('jsbi');
var _Decimal = require('decimal.js-light');
var _Big = require('big.js');
var toFormat = require('toformat');
var abi = require('@ethersproject/abi');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var invariant8__default = /*#__PURE__*/_interopDefault(invariant8);
var JSBI2__default = /*#__PURE__*/_interopDefault(JSBI2);
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
      BN2.prototype.toString = function toString(base, padding2) {
        base = base || 10;
        padding2 = padding2 | 0 || 1;
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
          while (out.length % padding2 !== 0) {
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
          while (out.length % padding2 !== 0) {
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
      Red.prototype.sqrt = function sqrt(a) {
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
function id(text) {
  return keccak256.keccak256(strings.toUtf8Bytes(text));
}

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
  constructor(version5) {
    Object.defineProperty(this, "version", {
      enumerable: true,
      value: version5,
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
  static from(version5) {
    return new _Logger(version5);
  }
};
Logger.errors = ErrorCode;
Logger.levels = LogLevel;

// ../../node_modules/@ethersproject/hash/lib.esm/_version.js
var version2 = "hash/5.8.0";

// ../../node_modules/@ethersproject/bignumber/lib.esm/bignumber.js
var import_bn = __toESM(require_bn());

// ../../node_modules/@ethersproject/bignumber/lib.esm/_version.js
var version3 = "bignumber/5.8.0";

// ../../node_modules/@ethersproject/bignumber/lib.esm/bignumber.js
var BN = import_bn.default.BN;
var logger = new Logger(version3);
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

// ../../node_modules/@ethersproject/properties/lib.esm/_version.js
var version4 = "properties/5.8.0";

// ../../node_modules/@ethersproject/properties/lib.esm/index.js
var logger2 = new Logger(version4);
function defineReadOnly(object, name, value) {
  Object.defineProperty(object, name, {
    enumerable: true,
    value,
    writable: false
  });
}
function shallowCopy(object) {
  const result = {};
  for (const key in object) {
    result[key] = object[key];
  }
  return result;
}
var opaque = { bigint: true, boolean: true, "function": true, number: true, string: true };
function _isFrozen(object) {
  if (object === void 0 || object === null || opaque[typeof object]) {
    return true;
  }
  if (Array.isArray(object) || typeof object === "object") {
    if (!Object.isFrozen(object)) {
      return false;
    }
    const keys = Object.keys(object);
    for (let i = 0; i < keys.length; i++) {
      let value = null;
      try {
        value = object[keys[i]];
      } catch (error) {
        continue;
      }
      if (!_isFrozen(value)) {
        return false;
      }
    }
    return true;
  }
  return logger2.throwArgumentError(`Cannot deepCopy ${typeof object}`, "object", object);
}
function _deepCopy(object) {
  if (_isFrozen(object)) {
    return object;
  }
  if (Array.isArray(object)) {
    return Object.freeze(object.map((item) => deepCopy(item)));
  }
  if (typeof object === "object") {
    const result = {};
    for (const key in object) {
      const value = object[key];
      if (value === void 0) {
        continue;
      }
      defineReadOnly(result, key, deepCopy(value));
    }
    return result;
  }
  return logger2.throwArgumentError(`Cannot deepCopy ${typeof object}`, "object", object);
}
function deepCopy(object) {
  return _deepCopy(object);
}

// ../../node_modules/@ethersproject/hash/lib.esm/typed-data.js
var __awaiter = function(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, [])).next());
  });
};
var logger3 = new Logger(version2);
var padding = new Uint8Array(32);
padding.fill(0);
var NegativeOne = BigNumber.from(-1);
var Zero = BigNumber.from(0);
var One = BigNumber.from(1);
var MaxUint256 = BigNumber.from("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
function hexPadRight(value) {
  const bytes$1 = bytes.arrayify(value);
  const padOffset = bytes$1.length % 32;
  if (padOffset) {
    return bytes.hexConcat([bytes$1, padding.slice(padOffset)]);
  }
  return bytes.hexlify(bytes$1);
}
var hexTrue = bytes.hexZeroPad(One.toHexString(), 32);
var hexFalse = bytes.hexZeroPad(Zero.toHexString(), 32);
var domainFieldTypes = {
  name: "string",
  version: "string",
  chainId: "uint256",
  verifyingContract: "address",
  salt: "bytes32"
};
var domainFieldNames = [
  "name",
  "version",
  "chainId",
  "verifyingContract",
  "salt"
];
function checkString(key) {
  return function(value) {
    if (typeof value !== "string") {
      logger3.throwArgumentError(`invalid domain value for ${JSON.stringify(key)}`, `domain.${key}`, value);
    }
    return value;
  };
}
var domainChecks = {
  name: checkString("name"),
  version: checkString("version"),
  chainId: function(value) {
    try {
      return BigNumber.from(value).toString();
    } catch (error) {
    }
    return logger3.throwArgumentError(`invalid domain value for "chainId"`, "domain.chainId", value);
  },
  verifyingContract: function(value) {
    try {
      return address.getAddress(value).toLowerCase();
    } catch (error) {
    }
    return logger3.throwArgumentError(`invalid domain value "verifyingContract"`, "domain.verifyingContract", value);
  },
  salt: function(value) {
    try {
      const bytes$1 = bytes.arrayify(value);
      if (bytes$1.length !== 32) {
        throw new Error("bad length");
      }
      return bytes.hexlify(bytes$1);
    } catch (error) {
    }
    return logger3.throwArgumentError(`invalid domain value "salt"`, "domain.salt", value);
  }
};
function getBaseEncoder(type) {
  {
    const match = type.match(/^(u?)int(\d*)$/);
    if (match) {
      const signed = match[1] === "";
      const width = parseInt(match[2] || "256");
      if (width % 8 !== 0 || width > 256 || match[2] && match[2] !== String(width)) {
        logger3.throwArgumentError("invalid numeric width", "type", type);
      }
      const boundsUpper = MaxUint256.mask(signed ? width - 1 : width);
      const boundsLower = signed ? boundsUpper.add(One).mul(NegativeOne) : Zero;
      return function(value) {
        const v = BigNumber.from(value);
        if (v.lt(boundsLower) || v.gt(boundsUpper)) {
          logger3.throwArgumentError(`value out-of-bounds for ${type}`, "value", value);
        }
        return bytes.hexZeroPad(v.toTwos(256).toHexString(), 32);
      };
    }
  }
  {
    const match = type.match(/^bytes(\d+)$/);
    if (match) {
      const width = parseInt(match[1]);
      if (width === 0 || width > 32 || match[1] !== String(width)) {
        logger3.throwArgumentError("invalid bytes width", "type", type);
      }
      return function(value) {
        const bytes$1 = bytes.arrayify(value);
        if (bytes$1.length !== width) {
          logger3.throwArgumentError(`invalid length for ${type}`, "value", value);
        }
        return hexPadRight(value);
      };
    }
  }
  switch (type) {
    case "address":
      return function(value) {
        return bytes.hexZeroPad(address.getAddress(value), 32);
      };
    case "bool":
      return function(value) {
        return !value ? hexFalse : hexTrue;
      };
    case "bytes":
      return function(value) {
        return keccak256.keccak256(value);
      };
    case "string":
      return function(value) {
        return id(value);
      };
  }
  return null;
}
function encodeType(name, fields) {
  return `${name}(${fields.map(({ name: name2, type }) => type + " " + name2).join(",")})`;
}
var TypedDataEncoder = class _TypedDataEncoder {
  constructor(types) {
    defineReadOnly(this, "types", Object.freeze(deepCopy(types)));
    defineReadOnly(this, "_encoderCache", {});
    defineReadOnly(this, "_types", {});
    const links = {};
    const parents = {};
    const subtypes = {};
    Object.keys(types).forEach((type) => {
      links[type] = {};
      parents[type] = [];
      subtypes[type] = {};
    });
    for (const name in types) {
      const uniqueNames = {};
      types[name].forEach((field) => {
        if (uniqueNames[field.name]) {
          logger3.throwArgumentError(`duplicate variable name ${JSON.stringify(field.name)} in ${JSON.stringify(name)}`, "types", types);
        }
        uniqueNames[field.name] = true;
        const baseType = field.type.match(/^([^\x5b]*)(\x5b|$)/)[1];
        if (baseType === name) {
          logger3.throwArgumentError(`circular type reference to ${JSON.stringify(baseType)}`, "types", types);
        }
        const encoder = getBaseEncoder(baseType);
        if (encoder) {
          return;
        }
        if (!parents[baseType]) {
          logger3.throwArgumentError(`unknown type ${JSON.stringify(baseType)}`, "types", types);
        }
        parents[baseType].push(name);
        links[name][baseType] = true;
      });
    }
    const primaryTypes = Object.keys(parents).filter((n) => parents[n].length === 0);
    if (primaryTypes.length === 0) {
      logger3.throwArgumentError("missing primary type", "types", types);
    } else if (primaryTypes.length > 1) {
      logger3.throwArgumentError(`ambiguous primary types or unused types: ${primaryTypes.map((t) => JSON.stringify(t)).join(", ")}`, "types", types);
    }
    defineReadOnly(this, "primaryType", primaryTypes[0]);
    function checkCircular(type, found) {
      if (found[type]) {
        logger3.throwArgumentError(`circular type reference to ${JSON.stringify(type)}`, "types", types);
      }
      found[type] = true;
      Object.keys(links[type]).forEach((child) => {
        if (!parents[child]) {
          return;
        }
        checkCircular(child, found);
        Object.keys(found).forEach((subtype) => {
          subtypes[subtype][child] = true;
        });
      });
      delete found[type];
    }
    checkCircular(this.primaryType, {});
    for (const name in subtypes) {
      const st = Object.keys(subtypes[name]);
      st.sort();
      this._types[name] = encodeType(name, types[name]) + st.map((t) => encodeType(t, types[t])).join("");
    }
  }
  getEncoder(type) {
    let encoder = this._encoderCache[type];
    if (!encoder) {
      encoder = this._encoderCache[type] = this._getEncoder(type);
    }
    return encoder;
  }
  _getEncoder(type) {
    {
      const encoder = getBaseEncoder(type);
      if (encoder) {
        return encoder;
      }
    }
    const match = type.match(/^(.*)(\x5b(\d*)\x5d)$/);
    if (match) {
      const subtype = match[1];
      const subEncoder = this.getEncoder(subtype);
      const length = parseInt(match[3]);
      return (value) => {
        if (length >= 0 && value.length !== length) {
          logger3.throwArgumentError("array length mismatch; expected length ${ arrayLength }", "value", value);
        }
        let result = value.map(subEncoder);
        if (this._types[subtype]) {
          result = result.map(keccak256.keccak256);
        }
        return keccak256.keccak256(bytes.hexConcat(result));
      };
    }
    const fields = this.types[type];
    if (fields) {
      const encodedType = id(this._types[type]);
      return (value) => {
        const values = fields.map(({ name, type: type2 }) => {
          const result = this.getEncoder(type2)(value[name]);
          if (this._types[type2]) {
            return keccak256.keccak256(result);
          }
          return result;
        });
        values.unshift(encodedType);
        return bytes.hexConcat(values);
      };
    }
    return logger3.throwArgumentError(`unknown type: ${type}`, "type", type);
  }
  encodeType(name) {
    const result = this._types[name];
    if (!result) {
      logger3.throwArgumentError(`unknown type: ${JSON.stringify(name)}`, "name", name);
    }
    return result;
  }
  encodeData(type, value) {
    return this.getEncoder(type)(value);
  }
  hashStruct(name, value) {
    return keccak256.keccak256(this.encodeData(name, value));
  }
  encode(value) {
    return this.encodeData(this.primaryType, value);
  }
  hash(value) {
    return this.hashStruct(this.primaryType, value);
  }
  _visit(type, value, callback) {
    {
      const encoder = getBaseEncoder(type);
      if (encoder) {
        return callback(type, value);
      }
    }
    const match = type.match(/^(.*)(\x5b(\d*)\x5d)$/);
    if (match) {
      const subtype = match[1];
      const length = parseInt(match[3]);
      if (length >= 0 && value.length !== length) {
        logger3.throwArgumentError("array length mismatch; expected length ${ arrayLength }", "value", value);
      }
      return value.map((v) => this._visit(subtype, v, callback));
    }
    const fields = this.types[type];
    if (fields) {
      return fields.reduce((accum, { name, type: type2 }) => {
        accum[name] = this._visit(type2, value[name], callback);
        return accum;
      }, {});
    }
    return logger3.throwArgumentError(`unknown type: ${type}`, "type", type);
  }
  visit(value, callback) {
    return this._visit(this.primaryType, value, callback);
  }
  static from(types) {
    return new _TypedDataEncoder(types);
  }
  static getPrimaryType(types) {
    return _TypedDataEncoder.from(types).primaryType;
  }
  static hashStruct(name, types, value) {
    return _TypedDataEncoder.from(types).hashStruct(name, value);
  }
  static hashDomain(domain) {
    const domainFields = [];
    for (const name in domain) {
      const type = domainFieldTypes[name];
      if (!type) {
        logger3.throwArgumentError(`invalid typed-data domain key: ${JSON.stringify(name)}`, "domain", domain);
      }
      domainFields.push({ name, type });
    }
    domainFields.sort((a, b) => {
      return domainFieldNames.indexOf(a.name) - domainFieldNames.indexOf(b.name);
    });
    return _TypedDataEncoder.hashStruct("EIP712Domain", { EIP712Domain: domainFields }, domain);
  }
  static encode(domain, types, value) {
    return bytes.hexConcat([
      "0x1901",
      _TypedDataEncoder.hashDomain(domain),
      _TypedDataEncoder.from(types).hash(value)
    ]);
  }
  static hash(domain, types, value) {
    return keccak256.keccak256(_TypedDataEncoder.encode(domain, types, value));
  }
  // Replaces all address types with ENS names with their looked up address
  static resolveNames(domain, types, value, resolveName) {
    return __awaiter(this, void 0, void 0, function* () {
      domain = shallowCopy(domain);
      const ensCache = {};
      if (domain.verifyingContract && !bytes.isHexString(domain.verifyingContract, 20)) {
        ensCache[domain.verifyingContract] = "0x";
      }
      const encoder = _TypedDataEncoder.from(types);
      encoder.visit(value, (type, value2) => {
        if (type === "address" && !bytes.isHexString(value2, 20)) {
          ensCache[value2] = "0x";
        }
        return value2;
      });
      for (const name in ensCache) {
        ensCache[name] = yield resolveName(name);
      }
      if (domain.verifyingContract && ensCache[domain.verifyingContract]) {
        domain.verifyingContract = ensCache[domain.verifyingContract];
      }
      value = encoder.visit(value, (type, value2) => {
        if (type === "address" && ensCache[value2]) {
          return ensCache[value2];
        }
        return value2;
      });
      return { domain, value };
    });
  }
  static getPayload(domain, types, value) {
    _TypedDataEncoder.hashDomain(domain);
    const domainValues = {};
    const domainTypes = [];
    domainFieldNames.forEach((name) => {
      const value2 = domain[name];
      if (value2 == null) {
        return;
      }
      domainValues[name] = domainChecks[name](value2);
      domainTypes.push({ name, type: domainFieldTypes[name] });
    });
    const encoder = _TypedDataEncoder.from(types);
    const typesWithDomain = shallowCopy(types);
    if (typesWithDomain.EIP712Domain) {
      logger3.throwArgumentError("types must not contain EIP712Domain type", "types.EIP712Domain", types);
    } else {
      typesWithDomain.EIP712Domain = domainTypes;
    }
    encoder.encode(value);
    return {
      types: typesWithDomain,
      domain: domainValues,
      primaryType: encoder.primaryType,
      message: encoder.visit(value, (type, value2) => {
        if (type.match(/^bytes(\d*)/)) {
          return bytes.hexlify(bytes.arrayify(value2));
        }
        if (type.match(/^u?int/)) {
          return BigNumber.from(value2).toString();
        }
        switch (type) {
          case "address":
            return value2.toLowerCase();
          case "bool":
            return !!value2;
          case "string":
            if (typeof value2 !== "string") {
              logger3.throwArgumentError(`invalid string`, "value", value2);
            }
            return value2;
        }
        return logger3.throwArgumentError("unsupported type", "type", type);
      })
    };
  }
};

// src/permit2/constants.ts
BigNumber.from("0xffffffffffff");
BigNumber.from("0xffffffffffffffffffffffffffffffffffffffff");
var MaxUint2562 = BigNumber.from("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
var MaxSignatureTransferAmount = MaxUint2562;
var MaxUnorderedNonce = MaxUint2562;
var MaxSigDeadline = MaxUint2562;
BigNumber.from(0);

// src/permit2/domain.ts
var PERMIT2_DOMAIN_NAME = "Permit2";
function permit2Domain(permit2Address, chainId) {
  return {
    name: PERMIT2_DOMAIN_NAME,
    chainId,
    verifyingContract: permit2Address
  };
}
var TOKEN_PERMISSIONS = [
  { name: "token", type: "address" },
  { name: "amount", type: "uint256" }
];
var PERMIT_TRANSFER_FROM_TYPES = {
  PermitTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ],
  TokenPermissions: TOKEN_PERMISSIONS
};
var PERMIT_BATCH_TRANSFER_FROM_TYPES = {
  PermitBatchTransferFrom: [
    { name: "permitted", type: "TokenPermissions[]" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ],
  TokenPermissions: TOKEN_PERMISSIONS
};
function permitTransferFromWithWitnessType(witness) {
  return {
    PermitWitnessTransferFrom: [
      { name: "permitted", type: "TokenPermissions" },
      { name: "spender", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "witness", type: witness.witnessTypeName }
    ],
    TokenPermissions: TOKEN_PERMISSIONS,
    ...witness.witnessType
  };
}
function permitBatchTransferFromWithWitnessType(witness) {
  return {
    PermitBatchWitnessTransferFrom: [
      { name: "permitted", type: "TokenPermissions[]" },
      { name: "spender", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "witness", type: witness.witnessTypeName }
    ],
    TokenPermissions: TOKEN_PERMISSIONS,
    ...witness.witnessType
  };
}
function isPermitTransferFrom(permit) {
  return !Array.isArray(permit.permitted);
}
var SignatureTransfer = class _SignatureTransfer {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  // return the data to be sent in a eth_signTypedData RPC call
  // for signing the given permit data
  static getPermitData(permit, permit2Address, chainId, witness) {
    invariant8__default.default(MaxSigDeadline.gte(permit.deadline), "SIG_DEADLINE_OUT_OF_RANGE");
    invariant8__default.default(MaxUnorderedNonce.gte(permit.nonce), "NONCE_OUT_OF_RANGE");
    const domain = permit2Domain(permit2Address, chainId);
    if (isPermitTransferFrom(permit)) {
      validateTokenPermissions(permit.permitted);
      const types = witness ? permitTransferFromWithWitnessType(witness) : PERMIT_TRANSFER_FROM_TYPES;
      const values = witness ? Object.assign(permit, { witness: witness.witness }) : permit;
      return {
        domain,
        types,
        values
      };
    } else {
      permit.permitted.forEach(validateTokenPermissions);
      const types = witness ? permitBatchTransferFromWithWitnessType(witness) : PERMIT_BATCH_TRANSFER_FROM_TYPES;
      const values = witness ? Object.assign(permit, { witness: witness.witness }) : permit;
      return {
        domain,
        types,
        values
      };
    }
  }
  static hash(permit, permit2Address, chainId, witness) {
    const { domain, types, values } = _SignatureTransfer.getPermitData(permit, permit2Address, chainId, witness);
    return TypedDataEncoder.hash(domain, types, values);
  }
};
function validateTokenPermissions(permissions) {
  invariant8__default.default(MaxSignatureTransferAmount.gte(permissions.amount), "AMOUNT_OUT_OF_RANGE");
}
var MaxUint2563 = JSBI2__default.default.BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
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
    invariant8__default.default(Number.isInteger(significantDigits), `${significantDigits} is not an integer.`);
    invariant8__default.default(significantDigits > 0, `${significantDigits} is not positive.`);
    Decimal.set({ precision: significantDigits + 1, rounding: toSignificantRounding[rounding] });
    const quotient = new Decimal(this.numerator.toString()).div(this.denominator.toString()).toSignificantDigits(significantDigits);
    return quotient.toFormat(quotient.decimalPlaces(), format);
  }
  toFixed(decimalPlaces, format = { groupSeparator: "" }, rounding = 1 /* ROUND_HALF_UP */) {
    invariant8__default.default(Number.isInteger(decimalPlaces), `${decimalPlaces} is not an integer.`);
    invariant8__default.default(decimalPlaces >= 0, `${decimalPlaces} is negative.`);
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
    invariant8__default.default(JSBI2__default.default.lessThanOrEqual(this.quotient, MaxUint2563), "AMOUNT");
    this.currency = currency;
    this.decimalScale = JSBI2__default.default.exponentiate(JSBI2__default.default.BigInt(10), JSBI2__default.default.BigInt(currency.decimals));
  }
  add(other) {
    invariant8__default.default(this.currency.equals(other.currency), "CURRENCY");
    const added = super.add(other);
    return _CurrencyAmount.fromFractionalAmount(this.currency, added.numerator, added.denominator);
  }
  subtract(other) {
    invariant8__default.default(this.currency.equals(other.currency), "CURRENCY");
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
    invariant8__default.default(decimalPlaces <= this.currency.decimals, "DECIMALS");
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
    invariant8__default.default(this.quoteCurrency.equals(other.baseCurrency), "TOKEN");
    const fraction = super.multiply(other);
    return new _Price(this.baseCurrency, other.quoteCurrency, fraction.denominator, fraction.numerator);
  }
  /**
   * Return the amount of quote currency corresponding to a given amount of the base currency
   * @param currencyAmount the amount of base currency to quote against the price
   */
  quote(currencyAmount) {
    invariant8__default.default(currencyAmount.currency.equals(this.baseCurrency), "TOKEN");
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
var NETWORKS_WITH_SAME_ADDRESS = [
  1 /* MAINNET */,
  5 /* GOERLI */,
  137 /* POLYGON */,
  8453 /* BASE */,
  130 /* UNICHAIN */
];
function constructSameAddressMap(address, additionalNetworks = []) {
  return NETWORKS_WITH_SAME_ADDRESS.concat(additionalNetworks).reduce((memo, chainId) => {
    memo[chainId] = address;
    return memo;
  }, {});
}
var PERMIT2_MAPPING = {
  ...constructSameAddressMap(
    "0x000000000022d473030f116ddee9f6b43ac78ba3",
    [11155111, 42161]
  ),
  12341234: "0x000000000022d473030f116ddee9f6b43ac78ba3",
  1301: "0x000000000022d473030f116ddee9f6b43ac78ba3"
};
var UNISWAPX_ORDER_QUOTER_MAPPING = {
  ...constructSameAddressMap("0x54539967a06Fc0E3C3ED0ee320Eb67362D13C5fF"),
  11155111: "0xAA6187C48096e093c37d2cF178B1e8534A6934f7",
  12341234: "0xbea0901A41177811b099F787D753436b2c47690E",
  1: "0xc6ef4C96Ee89e48Eff1C35545DBEED4Ad8dAC9D4",
  10: "0xc6ef4C96Ee89e48Eff1C35545DBEED4Ad8dAC9D4",
  8453: "0xc6ef4C96Ee89e48Eff1C35545DBEED4Ad8dAC9D4",
  130: "0xc6ef4C96Ee89e48Eff1C35545DBEED4Ad8dAC9D4",
  42161: "0xc6ef4C96Ee89e48Eff1C35545DBEED4Ad8dAC9D4",
  1301: "0xBFE64A14130054E1C3aB09287bc69E7148471636"
};
var UNISWAPX_V4_ORDER_QUOTER_MAPPING = {
  ...constructSameAddressMap("0x0000000000000000000000000000000000000000"),
  1301: "0x8166d8286Ec24E1D17A054088B2a71470527BFf8"
};
var UNISWAPX_V4_TOKEN_TRANSFER_HOOK_MAPPING = {
  ...constructSameAddressMap("0x0000000000000000000000000000000000000000"),
  1301: "0xd70467c1dA526491CFb790A2F84dfe0E10aa6D00"
};
var EXCLUSIVE_FILLER_VALIDATION_MAPPING = {
  ...constructSameAddressMap("0x8A66A74e15544db9688B68B06E116f5d19e5dF90"),
  5: "0x0000000000000000000000000000000000000000",
  11155111: "0x0000000000000000000000000000000000000000",
  42161: "0x0000000000000000000000000000000000000000",
  12341234: "0x8A66A74e15544db9688B68B06E116f5d19e5dF90"
};
var KNOWN_EVENT_SIGNATURES = /* @__PURE__ */ ((KNOWN_EVENT_SIGNATURES2) => {
  KNOWN_EVENT_SIGNATURES2["ERC20_TRANSFER"] = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  return KNOWN_EVENT_SIGNATURES2;
})(KNOWN_EVENT_SIGNATURES || {});
var OrderType = /* @__PURE__ */ ((OrderType3) => {
  OrderType3["Dutch"] = "Dutch";
  OrderType3["Relay"] = "Relay";
  OrderType3["Dutch_V2"] = "Dutch_V2";
  OrderType3["Dutch_V3"] = "Dutch_V3";
  OrderType3["Limit"] = "Limit";
  OrderType3["Priority"] = "Priority";
  OrderType3["V4"] = "V4";
  OrderType3["Hybrid"] = "Hybrid";
  return OrderType3;
})(OrderType || {});
var REACTOR_ADDRESS_MAPPING = {
  ...constructSameAddressMap({
    ["Dutch" /* Dutch */]: "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4",
    ["Dutch_V2" /* Dutch_V2 */]: "0x0000000000000000000000000000000000000000",
    ["Relay" /* Relay */]: "0x0000000000A4e21E2597DCac987455c48b12edBF"
  }),
  //test contract is only on mainnet
  1: {
    ["Dutch" /* Dutch */]: "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4",
    ["Dutch_V2" /* Dutch_V2 */]: "0x00000011F84B9aa48e5f8aA8B9897600006289Be",
    ["Priority" /* Priority */]: "0x0000000000000000000000000000000000000000",
    ["Relay" /* Relay */]: "0x0000000000A4e21E2597DCac987455c48b12edBF"
  },
  12341234: {
    ["Dutch" /* Dutch */]: "0xbD7F9D0239f81C94b728d827a87b9864972661eC",
    ["Dutch_V2" /* Dutch_V2 */]: "0x0000000000000000000000000000000000000000",
    ["Relay" /* Relay */]: "0x0000000000A4e21E2597DCac987455c48b12edBF"
  },
  11155111: {
    ["Dutch_V2" /* Dutch_V2 */]: "0x0e22B6638161A89533940Db590E67A52474bEBcd",
    ["Dutch" /* Dutch */]: "0xD6c073F2A3b676B8f9002b276B618e0d8bA84Fad",
    ["Relay" /* Relay */]: "0x0000000000A4e21E2597DCac987455c48b12edBF"
  },
  42161: {
    ["Dutch_V2" /* Dutch_V2 */]: "0x1bd1aAdc9E230626C44a139d7E70d842749351eb",
    ["Dutch" /* Dutch */]: "0x0000000000000000000000000000000000000000",
    ["Relay" /* Relay */]: "0x0000000000000000000000000000000000000000",
    ["Dutch_V3" /* Dutch_V3 */]: "0xB274d5F4b833b61B340b654d600A864fB604a87c"
  },
  8453: {
    ["Dutch" /* Dutch */]: "0x0000000000000000000000000000000000000000",
    ["Dutch_V2" /* Dutch_V2 */]: "0x0000000000000000000000000000000000000000",
    ["Relay" /* Relay */]: "0x0000000000000000000000000000000000000000",
    ["Priority" /* Priority */]: "0x000000001Ec5656dcdB24D90DFa42742738De729"
  },
  130: {
    ["Dutch" /* Dutch */]: "0x0000000000000000000000000000000000000000",
    ["Dutch_V2" /* Dutch_V2 */]: "0x0000000000000000000000000000000000000000",
    ["Relay" /* Relay */]: "0x0000000000000000000000000000000000000000",
    ["Priority" /* Priority */]: "0x00000006021a6Bce796be7ba509BBBA71e956e37"
  },
  1301: {
    ["Hybrid" /* Hybrid */]: "0x000000c40Fe6C03a7A1111D0a66Ce522BDc9fC8f",
    ["Dutch" /* Dutch */]: "0x0000000000000000000000000000000000000000",
    ["Dutch_V2" /* Dutch_V2 */]: "0x0000000000000000000000000000000000000000",
    ["Relay" /* Relay */]: "0x0000000000000000000000000000000000000000",
    ["Priority" /* Priority */]: "0x0000000000000000000000000000000000000000"
  }
};
var REACTOR_CONTRACT_MAPPING = REACTOR_ADDRESS_MAPPING;
var multicallAddressOn = (chainId = 1) => {
  switch (chainId) {
    // multicall3 is deployed to a different address on zksync than all other EVM chains
    // due to differences in create2 address derivation
    // deployment address from: https://github.com/mds1/multicall/blob/d7b62458c99c650ce1efa7464ffad69d2059ad56/deployments.json#L927
    case 324:
      return "0xF9cda624FBC7e059355ce98a31693d299FACd963";
    default:
      return "0xcA11bde05977b3631167028862bE2a173976CA11";
  }
};
var RELAY_SENTINEL_RECIPIENT = "0x0000000000000000000000000000000000000000";
var REVERSE_REACTOR_MAPPING = Object.entries(
  REACTOR_ADDRESS_MAPPING
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
).reduce((acc, [_, orderTypes]) => {
  for (const [orderType, reactorAddress] of Object.entries(orderTypes)) {
    acc[reactorAddress.toLowerCase()] = {
      orderType: OrderType[orderType]
    };
  }
  return acc;
}, {});
var BPS = 1e4;
var MPS = ethers.BigNumber.from(10).pow(7);
var PermissionedTokenInterface = /* @__PURE__ */ ((PermissionedTokenInterface2) => {
  PermissionedTokenInterface2["DSTokenInterface"] = "DSTokenInterface";
  PermissionedTokenInterface2["ISuperstateTokenV4"] = "ISuperstateTokenV4";
  return PermissionedTokenInterface2;
})(PermissionedTokenInterface || {});
var PermissionedTokenProxyType = /* @__PURE__ */ ((PermissionedTokenProxyType2) => {
  PermissionedTokenProxyType2["None"] = "None";
  PermissionedTokenProxyType2["Standard"] = "Standard";
  PermissionedTokenProxyType2["ERC1967"] = "ERC1967";
  return PermissionedTokenProxyType2;
})(PermissionedTokenProxyType || {});
var PERMISSIONED_TOKENS = [
  {
    address: "0x7712c34205737192402172409a8F7ccef8aA2AEc",
    chainId: 1 /* MAINNET */,
    symbol: "BUIDL",
    proxyType: "None" /* None */,
    interface: "DSTokenInterface" /* DSTokenInterface */
  },
  {
    address: "0x14d60E7FDC0D71d8611742720E4C50E7a974020c",
    chainId: 1 /* MAINNET */,
    symbol: "USCC",
    proxyType: "ERC1967" /* ERC1967 */,
    interface: "ISuperstateTokenV4" /* ISuperstateTokenV4 */
  }
];
var HYBRID_RESOLVER_ADDRESS_MAPPING = {
  1301: "0x000000B380393337109C04e3e29eD993667E0f89"
};
var REVERSE_RESOLVER_MAPPING = Object.entries(
  HYBRID_RESOLVER_ADDRESS_MAPPING
).reduce((acc, [, resolverAddress]) => {
  acc[resolverAddress.toLowerCase()] = { orderType: "Hybrid" /* Hybrid */ };
  return acc;
}, {});

// src/uniswapx/errors.ts
var MissingConfiguration = class _MissingConfiguration extends Error {
  constructor(key, value) {
    super(`Missing configuration for ${key}: ${value}`);
    Object.setPrototypeOf(this, _MissingConfiguration.prototype);
  }
};

// src/uniswapx/utils/dutchDecay.ts
function getDecayedAmount(config, atTime = Math.floor(Date.now() / 1e3)) {
  const { startAmount, endAmount, decayStartTime, decayEndTime } = config;
  if (decayEndTime <= atTime) {
    return endAmount;
  }
  if (decayStartTime >= atTime) {
    return startAmount;
  }
  if (startAmount.eq(endAmount)) {
    return startAmount;
  }
  const duration = decayEndTime - decayStartTime;
  const elapsed = atTime - decayStartTime;
  if (startAmount.gt(endAmount)) {
    const decay = startAmount.sub(endAmount).mul(elapsed).div(duration);
    return startAmount.sub(decay);
  } else {
    const decay = endAmount.sub(startAmount).mul(elapsed).div(duration);
    return startAmount.add(decay);
  }
}
var ValidationType = /* @__PURE__ */ ((ValidationType2) => {
  ValidationType2[ValidationType2["None"] = 0] = "None";
  ValidationType2[ValidationType2["ExclusiveFiller"] = 1] = "ExclusiveFiller";
  return ValidationType2;
})(ValidationType || {});
var NONE_VALIDATION = {
  type: 0 /* None */,
  data: null
};
function parseValidation(info) {
  const data = parseExclusiveFillerData(info.additionalValidationData);
  if (data.type !== 0 /* None */) {
    return data;
  }
  return NONE_VALIDATION;
}
function parseExclusiveFillerData(encoded) {
  try {
    const [address, timestamp] = new ethers.ethers.utils.AbiCoder().decode(
      ["address", "uint256"],
      encoded
    );
    return {
      type: 1 /* ExclusiveFiller */,
      data: {
        filler: address,
        lastExclusiveTimestamp: timestamp.toNumber()
      }
    };
  } catch {
    return NONE_VALIDATION;
  }
}
function encodeExclusiveFillerData(fillerAddress, lastExclusiveTimestamp, chainId, additionalValidationContractAddress) {
  let additionalValidationContract = "";
  if (additionalValidationContractAddress) {
    additionalValidationContract = additionalValidationContractAddress;
  } else if (chainId) {
    additionalValidationContract = EXCLUSIVE_FILLER_VALIDATION_MAPPING[chainId];
  } else {
    throw new Error("No validation contract provided");
  }
  const encoded = new ethers.ethers.utils.AbiCoder().encode(
    ["address", "uint256"],
    [fillerAddress, lastExclusiveTimestamp]
  );
  return {
    additionalValidationContract,
    additionalValidationData: encoded
  };
}

// src/uniswapx/order/DutchOrder.ts
function id2(text) {
  return utils.keccak256(utils.toUtf8Bytes(text));
}
var STRICT_EXCLUSIVITY = ethers.BigNumber.from(0);
var DUTCH_ORDER_TYPES = {
  ExclusiveDutchOrder: [
    { name: "info", type: "OrderInfo" },
    { name: "decayStartTime", type: "uint256" },
    { name: "decayEndTime", type: "uint256" },
    { name: "exclusiveFiller", type: "address" },
    { name: "exclusivityOverrideBps", type: "uint256" },
    { name: "inputToken", type: "address" },
    { name: "inputStartAmount", type: "uint256" },
    { name: "inputEndAmount", type: "uint256" },
    { name: "outputs", type: "DutchOutput[]" }
  ],
  OrderInfo: [
    { name: "reactor", type: "address" },
    { name: "swapper", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "additionalValidationContract", type: "address" },
    { name: "additionalValidationData", type: "bytes" }
  ],
  DutchOutput: [
    { name: "token", type: "address" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
    { name: "recipient", type: "address" }
  ]
};
var DUTCH_ORDER_ABI = [
  "tuple(" + [
    "tuple(address,address,uint256,uint256,address,bytes)",
    "uint256",
    "uint256",
    "address",
    "uint256",
    "tuple(address,uint256,uint256)",
    "tuple(address,uint256,uint256,address)[]"
  ].join(",") + ")"
];
var DutchOrder = class _DutchOrder {
  constructor(info, chainId, _permit2Address) {
    this.info = info;
    this.chainId = chainId;
    this._permit2Address = _permit2Address;
    if (_permit2Address) {
      this.permit2Address = _permit2Address;
    } else if (PERMIT2_MAPPING[chainId]) {
      this.permit2Address = PERMIT2_MAPPING[chainId];
    } else {
      throw new MissingConfiguration("permit2", chainId.toString());
    }
  }
  static fromJSON(json, chainId, _permit2Address) {
    return new _DutchOrder(
      {
        ...json,
        exclusivityOverrideBps: ethers.BigNumber.from(json.exclusivityOverrideBps),
        nonce: ethers.BigNumber.from(json.nonce),
        input: {
          token: json.input.token,
          startAmount: ethers.BigNumber.from(json.input.startAmount),
          endAmount: ethers.BigNumber.from(json.input.endAmount)
        },
        outputs: json.outputs.map((output) => ({
          token: output.token,
          startAmount: ethers.BigNumber.from(output.startAmount),
          endAmount: ethers.BigNumber.from(output.endAmount),
          recipient: output.recipient
        }))
      },
      chainId,
      _permit2Address
    );
  }
  static parse(encoded, chainId, permit2) {
    const abiCoder = new ethers.ethers.utils.AbiCoder();
    const decoded = abiCoder.decode(DUTCH_ORDER_ABI, encoded);
    const [
      [
        [
          reactor,
          swapper,
          nonce,
          deadline,
          additionalValidationContract,
          additionalValidationData
        ],
        decayStartTime,
        decayEndTime,
        exclusiveFiller,
        exclusivityOverrideBps,
        [inputToken, inputStartAmount, inputEndAmount],
        outputs
      ]
    ] = decoded;
    return new _DutchOrder(
      {
        reactor,
        swapper,
        nonce,
        deadline: deadline.toNumber(),
        additionalValidationContract,
        additionalValidationData,
        decayStartTime: decayStartTime.toNumber(),
        decayEndTime: decayEndTime.toNumber(),
        exclusiveFiller,
        exclusivityOverrideBps,
        input: {
          token: inputToken,
          startAmount: inputStartAmount,
          endAmount: inputEndAmount
        },
        outputs: outputs.map(
          ([token, startAmount, endAmount, recipient]) => {
            return {
              token,
              startAmount,
              endAmount,
              recipient
            };
          }
        )
      },
      chainId,
      permit2
    );
  }
  toJSON() {
    return {
      chainId: this.chainId,
      permit2Address: this.permit2Address,
      reactor: this.info.reactor,
      swapper: this.info.swapper,
      nonce: this.info.nonce.toString(),
      deadline: this.info.deadline,
      additionalValidationContract: this.info.additionalValidationContract,
      additionalValidationData: this.info.additionalValidationData,
      decayStartTime: this.info.decayStartTime,
      decayEndTime: this.info.decayEndTime,
      exclusiveFiller: this.info.exclusiveFiller,
      exclusivityOverrideBps: this.info.exclusivityOverrideBps.toString(),
      input: {
        token: this.info.input.token,
        startAmount: this.info.input.startAmount.toString(),
        endAmount: this.info.input.endAmount.toString()
      },
      outputs: this.info.outputs.map((output) => ({
        token: output.token,
        startAmount: output.startAmount.toString(),
        endAmount: output.endAmount.toString(),
        recipient: output.recipient
      }))
    };
  }
  /**
   * @inheritdoc order
   */
  get blockOverrides() {
    return void 0;
  }
  /**
   * @inheritdoc order
   */
  serialize() {
    const abiCoder = new ethers.ethers.utils.AbiCoder();
    return abiCoder.encode(DUTCH_ORDER_ABI, [
      [
        [
          this.info.reactor,
          this.info.swapper,
          this.info.nonce,
          this.info.deadline,
          this.info.additionalValidationContract,
          this.info.additionalValidationData
        ],
        this.info.decayStartTime,
        this.info.decayEndTime,
        this.info.exclusiveFiller,
        this.info.exclusivityOverrideBps,
        [
          this.info.input.token,
          this.info.input.startAmount,
          this.info.input.endAmount
        ],
        this.info.outputs.map((output) => [
          output.token,
          output.startAmount,
          output.endAmount,
          output.recipient
        ])
      ]
    ]);
  }
  /**
   * @inheritDoc OrderInterface
   */
  getSigner(signature) {
    return ethers.ethers.utils.computeAddress(
      ethers.ethers.utils.recoverPublicKey(
        SignatureTransfer.hash(
          this.toPermit(),
          this.permit2Address,
          this.chainId,
          this.witness()
        ),
        signature
      )
    );
  }
  /**
   * @inheritDoc OrderInterface
   */
  permitData() {
    return SignatureTransfer.getPermitData(
      this.toPermit(),
      this.permit2Address,
      this.chainId,
      this.witness()
    );
  }
  /**
   * @inheritDoc OrderInterface
   */
  hash() {
    return ethers.ethers.utils._TypedDataEncoder.from(DUTCH_ORDER_TYPES).hash(this.witnessInfo());
  }
  /**
   * Returns the resolved order with the given options
   * @return The resolved order
   */
  resolve(options) {
    const useOverride = this.info.exclusiveFiller !== ethers.ethers.constants.AddressZero && options.timestamp <= this.info.decayStartTime && options.filler !== this.info.exclusiveFiller;
    return {
      input: {
        token: this.info.input.token,
        amount: getDecayedAmount(
          {
            decayStartTime: this.info.decayStartTime,
            decayEndTime: this.info.decayEndTime,
            startAmount: this.info.input.startAmount,
            endAmount: this.info.input.endAmount
          },
          options.timestamp
        )
      },
      outputs: this.info.outputs.map((output) => {
        const baseAmount = getDecayedAmount(
          {
            decayStartTime: this.info.decayStartTime,
            decayEndTime: this.info.decayEndTime,
            startAmount: output.startAmount,
            endAmount: output.endAmount
          },
          options.timestamp
        );
        let amount = baseAmount;
        if (useOverride) {
          if (this.info.exclusivityOverrideBps.eq(STRICT_EXCLUSIVITY)) {
            amount = ethers.ethers.constants.MaxUint256;
          } else {
            amount = baseAmount.mul(this.info.exclusivityOverrideBps.add(BPS)).div(BPS);
          }
        }
        return {
          token: output.token,
          amount
        };
      })
    };
  }
  /**
   * Returns the parsed validation
   * @return The parsed validation data for the order
   */
  get validation() {
    return parseValidation(this.info);
  }
  toPermit() {
    return {
      permitted: {
        token: this.info.input.token,
        amount: this.info.input.endAmount
      },
      spender: this.info.reactor,
      nonce: this.info.nonce,
      deadline: this.info.deadline
    };
  }
  witnessInfo() {
    return {
      info: {
        reactor: this.info.reactor,
        swapper: this.info.swapper,
        nonce: this.info.nonce,
        deadline: this.info.deadline,
        additionalValidationContract: this.info.additionalValidationContract,
        additionalValidationData: this.info.additionalValidationData
      },
      decayStartTime: this.info.decayStartTime,
      decayEndTime: this.info.decayEndTime,
      exclusiveFiller: this.info.exclusiveFiller,
      exclusivityOverrideBps: this.info.exclusivityOverrideBps,
      inputToken: this.info.input.token,
      inputStartAmount: this.info.input.startAmount,
      inputEndAmount: this.info.input.endAmount,
      outputs: this.info.outputs
    };
  }
  witness() {
    return {
      witness: this.witnessInfo(),
      // TODO: remove "Limit"
      witnessTypeName: "ExclusiveDutchOrder",
      witnessType: DUTCH_ORDER_TYPES
    };
  }
};
var _abi = [
  {
    type: "constructor",
    inputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      {
        name: "owner",
        type: "address"
      },
      {
        name: "spender",
        type: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256"
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
        type: "address"
      },
      {
        name: "value",
        type: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [
      {
        name: "who",
        type: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "balanceOfInvestor",
    inputs: [
      {
        name: "_id",
        type: "string"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "burn",
    inputs: [
      {
        name: "_who",
        type: "address"
      },
      {
        name: "_value",
        type: "uint256"
      },
      {
        name: "_reason",
        type: "string"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "getVersion",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256[]"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getWalletAt",
    inputs: [
      {
        name: "_index",
        type: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "isPaused",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "issueTokens",
    inputs: [
      {
        name: "_to",
        type: "address"
      },
      {
        name: "_value",
        type: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "issueTokensCustom",
    inputs: [
      {
        name: "_to",
        type: "address"
      },
      {
        name: "_value",
        type: "uint256"
      },
      {
        name: "_issuanceTime",
        type: "uint256"
      },
      {
        name: "_valueLocked",
        type: "uint256"
      },
      {
        name: "_reason",
        type: "string"
      },
      {
        name: "_releaseTime",
        type: "uint64"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "preTransferCheck",
    inputs: [
      {
        name: "_from",
        type: "address"
      },
      {
        name: "_to",
        type: "address"
      },
      {
        name: "_value",
        type: "uint256"
      }
    ],
    outputs: [
      {
        name: "code",
        type: "uint256"
      },
      {
        name: "reason",
        type: "string"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "seize",
    inputs: [
      {
        name: "_from",
        type: "address"
      },
      {
        name: "_to",
        type: "address"
      },
      {
        name: "_value",
        type: "uint256"
      },
      {
        name: "_reason",
        type: "string"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setCap",
    inputs: [
      {
        name: "_cap",
        type: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "totalIssued",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      {
        name: "to",
        type: "address"
      },
      {
        name: "value",
        type: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "transferFrom",
    inputs: [
      {
        name: "from",
        type: "address"
      },
      {
        name: "to",
        type: "address"
      },
      {
        name: "value",
        type: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "walletCount",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256"
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
        indexed: true
      },
      {
        name: "spender",
        type: "address",
        indexed: true
      },
      {
        name: "value",
        type: "uint256",
        indexed: false
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Burn",
    inputs: [
      {
        name: "burner",
        type: "address",
        indexed: true
      },
      {
        name: "value",
        type: "uint256",
        indexed: false
      },
      {
        name: "reason",
        type: "string",
        indexed: false
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Issue",
    inputs: [
      {
        name: "to",
        type: "address",
        indexed: true
      },
      {
        name: "value",
        type: "uint256",
        indexed: false
      },
      {
        name: "valueLocked",
        type: "uint256",
        indexed: false
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Seize",
    inputs: [
      {
        name: "from",
        type: "address",
        indexed: true
      },
      {
        name: "to",
        type: "address",
        indexed: true
      },
      {
        name: "value",
        type: "uint256",
        indexed: false
      },
      {
        name: "reason",
        type: "string",
        indexed: false
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
        indexed: true
      },
      {
        name: "to",
        type: "address",
        indexed: true
      },
      {
        name: "value",
        type: "uint256",
        indexed: false
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "WalletAdded",
    inputs: [
      {
        name: "wallet",
        type: "address",
        indexed: false
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "WalletRemoved",
    inputs: [
      {
        name: "wallet",
        type: "address",
        indexed: false
      }
    ],
    anonymous: false
  }
];
var DSTokenInterface__factory = class {
  static createInterface() {
    return new ethers.utils.Interface(_abi);
  }
  static connect(address, signerOrProvider) {
    return new ethers.Contract(address, _abi, signerOrProvider);
  }
};
DSTokenInterface__factory.abi = _abi;
var _abi2 = [
  {
    inputs: [
      {
        internalType: "contract IPermit2",
        name: "_permit2",
        type: "address"
      },
      {
        internalType: "address",
        name: "_protocolFeeOwner",
        type: "address"
      }
    ],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    inputs: [],
    name: "DeadlineBeforeEndTime",
    type: "error"
  },
  {
    inputs: [],
    name: "DeadlinePassed",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "duplicateToken",
        type: "address"
      }
    ],
    name: "DuplicateFeeOutput",
    type: "error"
  },
  {
    inputs: [],
    name: "EndTimeBeforeStartTime",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      },
      {
        internalType: "address",
        name: "recipient",
        type: "address"
      }
    ],
    name: "FeeTooLarge",
    type: "error"
  },
  {
    inputs: [],
    name: "IncorrectAmounts",
    type: "error"
  },
  {
    inputs: [],
    name: "InputAndOutputDecay",
    type: "error"
  },
  {
    inputs: [],
    name: "InsufficientEth",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "feeToken",
        type: "address"
      }
    ],
    name: "InvalidFeeToken",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidReactor",
    type: "error"
  },
  {
    inputs: [],
    name: "NativeTransferFailed",
    type: "error"
  },
  {
    inputs: [],
    name: "NoExclusiveOverride",
    type: "error"
  },
  {
    inputs: [],
    name: "OrderEndTimeBeforeStartTime",
    type: "error"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "orderHash",
        type: "bytes32"
      },
      {
        indexed: true,
        internalType: "address",
        name: "filler",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "swapper",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "nonce",
        type: "uint256"
      }
    ],
    name: "Fill",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "user",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "newOwner",
        type: "address"
      }
    ],
    name: "OwnershipTransferred",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "oldFeeController",
        type: "address"
      },
      {
        indexed: false,
        internalType: "address",
        name: "newFeeController",
        type: "address"
      }
    ],
    name: "ProtocolFeeControllerSet",
    type: "event"
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "bytes",
            name: "order",
            type: "bytes"
          },
          {
            internalType: "bytes",
            name: "sig",
            type: "bytes"
          }
        ],
        internalType: "struct SignedOrder",
        name: "order",
        type: "tuple"
      }
    ],
    name: "execute",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "bytes",
            name: "order",
            type: "bytes"
          },
          {
            internalType: "bytes",
            name: "sig",
            type: "bytes"
          }
        ],
        internalType: "struct SignedOrder[]",
        name: "orders",
        type: "tuple[]"
      }
    ],
    name: "executeBatch",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "bytes",
            name: "order",
            type: "bytes"
          },
          {
            internalType: "bytes",
            name: "sig",
            type: "bytes"
          }
        ],
        internalType: "struct SignedOrder[]",
        name: "orders",
        type: "tuple[]"
      },
      {
        internalType: "bytes",
        name: "callbackData",
        type: "bytes"
      }
    ],
    name: "executeBatchWithCallback",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "bytes",
            name: "order",
            type: "bytes"
          },
          {
            internalType: "bytes",
            name: "sig",
            type: "bytes"
          }
        ],
        internalType: "struct SignedOrder",
        name: "order",
        type: "tuple"
      },
      {
        internalType: "bytes",
        name: "callbackData",
        type: "bytes"
      }
    ],
    name: "executeWithCallback",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [],
    name: "feeController",
    outputs: [
      {
        internalType: "contract IProtocolFeeController",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "owner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "permit2",
    outputs: [
      {
        internalType: "contract IPermit2",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "_newFeeController",
        type: "address"
      }
    ],
    name: "setProtocolFeeController",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newOwner",
        type: "address"
      }
    ],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    stateMutability: "payable",
    type: "receive"
  }
];
var _bytecode = "0x60a06040523480156200001157600080fd5b5060405162003136380380620031368339810160408190526200003491620000b8565b600080546001600160a01b0319166001600160a01b03831690811782556040518492849283928392907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0908290a350506001600255506001600160a01b031660805250620000f79050565b6001600160a01b0381168114620000b557600080fd5b50565b60008060408385031215620000cc57600080fd5b8251620000d9816200009f565b6020840151909250620000ec816200009f565b809150509250929050565b60805161301d620001196000396000818160e0015261191b015261301d6000f3fe60806040526004361061009a5760003560e01c80632d771389116100695780636999b3771161004e5780636999b377146101715780638da5cb5b1461019e578063f2fde38b146101cb57600080fd5b80632d7713891461013e5780633f62192e1461015e57600080fd5b80630d335884146100a65780630d7a16c3146100bb57806312261ee7146100ce57806313fb72c71461012b57600080fd5b366100a157005b600080fd5b6100b96100b4366004612281565b6101eb565b005b6100b96100c936600461232f565b610364565b3480156100da57600080fd5b506101027f000000000000000000000000000000000000000000000000000000000000000081565b60405173ffffffffffffffffffffffffffffffffffffffff909116815260200160405180910390f35b6100b9610139366004612371565b6104c5565b34801561014a57600080fd5b506100b961015936600461240f565b610683565b6100b961016c366004612433565b61078f565b34801561017d57600080fd5b506001546101029073ffffffffffffffffffffffffffffffffffffffff1681565b3480156101aa57600080fd5b506000546101029073ffffffffffffffffffffffffffffffffffffffff1681565b3480156101d757600080fd5b506100b96101e636600461240f565b610894565b6101f3610985565b604080516001808252818301909252600091816020015b6040805161016081018252600060a0820181815260c0830182905260e0830182905261010083018290526101208301829052606061014084018190529083528351808201855282815260208082018490528186018490528085019190915293830181905280830152608082015282527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff90920191018161020a5790505090506102b2846109f6565b816000815181106102c5576102c5612497565b60200260200101819052506102d981610b62565b6040517f585da628000000000000000000000000000000000000000000000000000000008152339063585da6289061031990849087908790600401612699565b600060405180830381600087803b15801561033357600080fd5b505af1158015610347573d6000803e3d6000fd5b5050505061035481610bb3565b5061035f6001600255565b505050565b61036c610985565b8060008167ffffffffffffffff81111561038857610388612468565b60405190808252806020026020018201604052801561044357816020015b6040805161016081018252600060a0820181815260c0830182905260e0830182905261010083018290526101208301829052606061014084018190529083528351808201855282815260208082018490528186018490528085019190915293830181905280830152608082015282527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff9092019101816103a65790505b50905060005b828110156104a25761047d85858381811061046657610466612497565b9050602002810190610478919061275f565b6109f6565b82828151811061048f5761048f612497565b6020908102919091010152600101610449565b506104ac81610b62565b6104b581610bb3565b50506104c16001600255565b5050565b6104cd610985565b8260008167ffffffffffffffff8111156104e9576104e9612468565b6040519080825280602002602001820160405280156105a457816020015b6040805161016081018252600060a0820181815260c0830182905260e0830182905261010083018290526101208301829052606061014084018190529083528351808201855282815260208082018490528186018490528085019190915293830181905280830152608082015282527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff9092019101816105075790505b50905060005b828110156105ec576105c787878381811061046657610466612497565b8282815181106105d9576105d9612497565b60209081029190910101526001016105aa565b506105f681610b62565b6040517f585da628000000000000000000000000000000000000000000000000000000008152339063585da6289061063690849088908890600401612699565b600060405180830381600087803b15801561065057600080fd5b505af1158015610664573d6000803e3d6000fd5b5050505061067181610bb3565b505061067d6001600255565b50505050565b60005473ffffffffffffffffffffffffffffffffffffffff163314610709576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f554e415554484f52495a4544000000000000000000000000000000000000000060448201526064015b60405180910390fd5b6001805473ffffffffffffffffffffffffffffffffffffffff8381167fffffffffffffffffffffffff000000000000000000000000000000000000000083168117909355604080519190921680825260208201939093527fb904ae9529e373e48bc82df4326cceaf1b4c472babf37f5b7dec46fecc6b53e0910160405180910390a15050565b610797610985565b604080516001808252818301909252600091816020015b6040805161016081018252600060a0820181815260c0830182905260e0830182905261010083018290526101208301829052606061014084018190529083528351808201855282815260208082018490528186018490528085019190915293830181905280830152608082015282527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff9092019101816107ae579050509050610856826109f6565b8160008151811061086957610869612497565b602002602001018190525061087d81610b62565b61088681610bb3565b506108916001600255565b50565b60005473ffffffffffffffffffffffffffffffffffffffff163314610915576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152600c60248201527f554e415554484f52495a454400000000000000000000000000000000000000006044820152606401610700565b600080547fffffffffffffffffffffffff00000000000000000000000000000000000000001673ffffffffffffffffffffffffffffffffffffffff83169081178255604051909133917f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e09190a350565b60028054036109f0576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601f60248201527f5265656e7472616e637947756172643a207265656e7472616e742063616c6c006044820152606401610700565b60028055565b6040805161016081018252600060a0820181815260c0830182905260e083018290526101008301829052610120830182905260606101408401819052908352835180820185528281526020808201849052818601849052840152928201839052828201929092526080810182905290610a6f838061279d565b810190610a7c9190612b26565b9050610a8781610d06565b6040518060a0016040528082600001518152602001610abd836020015184604001518560a00151610e339092919063ffffffff16565b8152602001610ae3836020015184604001518560c00151610f059092919063ffffffff16565b8152602001848060200190610af8919061279d565b8080601f016020809104026020016040519081016040528093929190818152602001838380828437600092019190915250505090825250602001610b3b83610fec565b9052606082015160208301516080840151929450610b5c92859291906112be565b50919050565b805160005b8181101561035f576000838281518110610b8357610b83612497565b60200260200101519050610b9681611367565b610ba081336117e1565b610baa8133611919565b50600101610b67565b805160005b81811015610cf5576000838281518110610bd457610bd4612497565b602002602001015190506000816040015151905060005b81811015610c5557600083604001518281518110610c0b57610c0b612497565b60200260200101519050610c4c81604001518260200151836000015173ffffffffffffffffffffffffffffffffffffffff16611cac9092919063ffffffff16565b50600101610beb565b5081600001516020015173ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff16868581518110610c9e57610c9e612497565b6020026020010151608001517f78ad7ec0e9f89e74012afa58738b6b661c024cb0fd185ee2f616c0a28924bd66856000015160400151604051610ce391815260200190565b60405180910390a45050600101610bb8565b5047156104c1576104c13347611cf3565b60408101518151606001511015610d49576040517f773a618700000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b806020015181604001511015610d8b576040517f48fee69c00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60a08101516040810151602090910151146108915760005b8160c00151518110156104c1578160c001518181518110610dc657610dc6612497565b6020026020010151604001518260c001518281518110610de857610de8612497565b60200260200101516020015114610e2b576040517fd303758b00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b600101610da3565b610e6d6040518060600160405280600073ffffffffffffffffffffffffffffffffffffffff16815260200160008152602001600081525090565b836040015184602001511115610eaf576040517f7c1f811300000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6000610ec5856020015186604001518686611d92565b60408051606081018252875173ffffffffffffffffffffffffffffffffffffffff1681526020810192909252958601519581019590955250929392505050565b82516060908067ffffffffffffffff811115610f2357610f23612468565b604051908082528060200260200182016040528015610f8c57816020015b60408051606081018252600080825260208083018290529282015282527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff909201910181610f415790505b50915060005b81811015610fe357610fbe868281518110610faf57610faf612497565b60200260200101518686611e2c565b838281518110610fd057610fd0612497565b6020908102919091010152600101610f92565b50509392505050565b6040517f4578636c757369766544757463684f726465722800000000000000000000000060208201527f4f72646572496e666f20696e666f2c000000000000000000000000000000000060348201527f75696e74323536206465636179537461727454696d652c00000000000000000060438201527f75696e74323536206465636179456e6454696d652c0000000000000000000000605a8201527f61646472657373206578636c757369766546696c6c65722c0000000000000000606f8201527f75696e74323536206578636c757369766974794f766572726964654270732c0060878201527f6164647265737320696e707574546f6b656e2c0000000000000000000000000060a68201527f75696e7432353620696e7075745374617274416d6f756e742c0000000000000060b98201527f75696e7432353620696e707574456e64416d6f756e742c00000000000000000060d28201527f44757463684f75747075745b5d206f757470757473290000000000000000000060e982015260009060ff01604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0818403018152608083019091526052808352909190612edb60208301396040518060c00160405280608d8152602001612f5b608d91396040516020016111de93929190612bfa565b604051602081830303815290604052805190602001206112018360000151611efc565b83602001518460400151856060015186608001518760a00151600001518860a00151602001518960a001516040015161123d8b60c00151611f96565b60408051602081019b909b528a01989098526060890196909652608088019490945273ffffffffffffffffffffffffffffffffffffffff92831660a088015260c08701919091521660e0850152610100840152610120830152610140820152610160015b604051602081830303815290604052805190602001209050919050565b6112c88383612034565b61067d5780611303576040517fb9ec1e9600000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b604084015160005b815181101561135f57600082828151811061132857611328612497565b60200260200101519050611351846127106113439190612c3d565b602083015190612710612081565b60209091015260010161130b565b505050505050565b60015473ffffffffffffffffffffffffffffffffffffffff166113875750565b6001546040517f8aa6cf0300000000000000000000000000000000000000000000000000000000815260009173ffffffffffffffffffffffffffffffffffffffff1690638aa6cf03906113de908590600401612c77565b600060405180830381865afa1580156113fb573d6000803e3d6000fd5b505050506040513d6000823e601f3d9081017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe01682016040526114419190810190612c8a565b60408301515181519192509060006114598284612c3d565b67ffffffffffffffff81111561147157611471612468565b6040519080825280602002602001820160405280156114da57816020015b60408051606081018252600080825260208083018290529282015282527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff90920191018161148f5790505b50905060005b8381101561152b57856040015181815181106114fe576114fe612497565b602002602001015182828151811061151857611518612497565b60209081029190910101526001016114e0565b5060005b828110156117d257600085828151811061154b5761154b612497565b6020026020010151905060005b828110156116095786818151811061157257611572612497565b60200260200101516000015173ffffffffffffffffffffffffffffffffffffffff16826000015173ffffffffffffffffffffffffffffffffffffffff16036116015781516040517ffff0830300000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff9091166004820152602401610700565b600101611558565b506000805b8681101561168e5760008960400151828151811061162e5761162e612497565b60200260200101519050836000015173ffffffffffffffffffffffffffffffffffffffff16816000015173ffffffffffffffffffffffffffffffffffffffff16036116855760208101516116829084612c3d565b92505b5060010161160e565b50815160208901515173ffffffffffffffffffffffffffffffffffffffff9182169116036116cb5760208089015101516116c89082612c3d565b90505b806000036117205781516040517feddf07f500000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff9091166004820152602401610700565b61172e816005612710612081565b826020015111156117a1578151602083015160408085015190517f82e7565600000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff93841660048201526024810192909252919091166044820152606401610700565b81846117ad8589612c3d565b815181106117bd576117bd612497565b6020908102919091010152505060010161152f565b50604090940193909352505050565b81515173ffffffffffffffffffffffffffffffffffffffff163014611832576040517f4ddf4a6400000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b815160600151421115611871576040517f70f65caa00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b81516080015173ffffffffffffffffffffffffffffffffffffffff16156104c1578151608001516040517f6e84ba2b00000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff90911690636e84ba2b906118ed9084908690600401612d5a565b60006040518083038186803b15801561190557600080fd5b505afa15801561135f573d6000803e3d6000fd5b7f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff1663137c29fe6119d9846040805160a0810182526000606082018181526080830182905282526020820181905291810191909152506040805160a081018252602080840180515173ffffffffffffffffffffffffffffffffffffffff1660608085019182529151850151608085015283528451840151918301919091529251909201519082015290565b6040805180820182526000808252602091820152815180830190925273ffffffffffffffffffffffffffffffffffffffff8616825280870151810151908201528560000151602001518660800151604051806080016040528060528152602001612edb60529139604080517f4578636c757369766544757463684f726465722800000000000000000000000060208201527f4f72646572496e666f20696e666f2c000000000000000000000000000000000060348201527f75696e74323536206465636179537461727454696d652c00000000000000000060438201527f75696e74323536206465636179456e6454696d652c0000000000000000000000605a8201527f61646472657373206578636c757369766546696c6c65722c0000000000000000606f8201527f75696e74323536206578636c757369766974794f766572726964654270732c0060878201527f6164647265737320696e707574546f6b656e2c0000000000000000000000000060a68201527f75696e7432353620696e7075745374617274416d6f756e742c0000000000000060b98201527f75696e7432353620696e707574456e64416d6f756e742c00000000000000000060d28201527f44757463684f75747075745b5d206f757470757473290000000000000000000060e9820152815160df8183030181526101bf8201909252608d60ff820181815291612f5b9061011f01396040518060600160405280602e8152602001612f2d602e9139604051602001611c119493929190612d89565b604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08184030181529082905260608a01517fffffffff0000000000000000000000000000000000000000000000000000000060e089901b168352611c7e9695949392600401612e12565b600060405180830381600087803b158015611c9857600080fd5b505af115801561135f573d6000803e3d6000fd5b73ffffffffffffffffffffffffffffffffffffffff8316611cd15761035f8282611cf3565b61035f73ffffffffffffffffffffffffffffffffffffffff84163384846120bd565b60008273ffffffffffffffffffffffffffffffffffffffff1682611af490604051600060405180830381858888f193505050503d8060008114611d52576040519150601f19603f3d011682016040523d82523d6000602084013e611d57565b606091505b505090508061035f576040517ff4b3b1bc00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b600082821015611dce576040517f4313345300000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b428211611ddc575082611e24565b428310611dea575083611e24565b4283900383830386861015611e0f57611e068688038383612081565b87039250611e21565b611e1c8787038383612081565b870192505b50505b949350505050565b6040805160608101825260008082526020820181905291810191909152836040015184602001511015611e8b576040517f7c1f811300000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b6000611ea1856020015186604001518686611d92565b90506040518060600160405280866000015173ffffffffffffffffffffffffffffffffffffffff168152602001828152602001866060015173ffffffffffffffffffffffffffffffffffffffff168152509150509392505050565b60006040518060c00160405280608d8152602001612f5b608d913980516020918201208351848301516040808701516060880151608089015160a08a015180519089012093516112a198939492939192910196875273ffffffffffffffffffffffffffffffffffffffff958616602088015293851660408701526060860192909252608085015290911660a083015260c082015260e00190565b600080825160200267ffffffffffffffff811115611fb657611fb6612468565b6040519080825280601f01601f191660200182016040528015611fe0576020820181803683370190505b50905060005b835181101561202557600061201385838151811061200657612006612497565b60200260200101516121af565b60208381028501015250600101611fe6565b50805160209091012092915050565b600073ffffffffffffffffffffffffffffffffffffffff8316158061205857508142115b80612078575073ffffffffffffffffffffffffffffffffffffffff831633145b90505b92915050565b6000827fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff04841183021582026120b657600080fd5b5091020490565b60006040517f23b872dd00000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff8516600482015273ffffffffffffffffffffffffffffffffffffffff841660248201528260448201526020600060648360008a5af13d15601f3d11600160005114161716915050806121a8576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601460248201527f5452414e534645525f46524f4d5f4641494c45440000000000000000000000006044820152606401610700565b5050505050565b6000604051806080016040528060528152602001612edb605291398051602091820120835184830151604080870151606088015191516112a1969192910194855273ffffffffffffffffffffffffffffffffffffffff93841660208601526040850192909252606084015216608082015260a00190565b600060408284031215610b5c57600080fd5b60008083601f84011261224a57600080fd5b50813567ffffffffffffffff81111561226257600080fd5b60208301915083602082850101111561227a57600080fd5b9250929050565b60008060006040848603121561229657600080fd5b833567ffffffffffffffff808211156122ae57600080fd5b6122ba87838801612226565b945060208601359150808211156122d057600080fd5b506122dd86828701612238565b9497909650939450505050565b60008083601f8401126122fc57600080fd5b50813567ffffffffffffffff81111561231457600080fd5b6020830191508360208260051b850101111561227a57600080fd5b6000806020838503121561234257600080fd5b823567ffffffffffffffff81111561235957600080fd5b612365858286016122ea565b90969095509350505050565b6000806000806040858703121561238757600080fd5b843567ffffffffffffffff8082111561239f57600080fd5b6123ab888389016122ea565b909650945060208701359150808211156123c457600080fd5b506123d187828801612238565b95989497509550505050565b73ffffffffffffffffffffffffffffffffffffffff8116811461089157600080fd5b803561240a816123dd565b919050565b60006020828403121561242157600080fd5b813561242c816123dd565b9392505050565b60006020828403121561244557600080fd5b813567ffffffffffffffff81111561245c57600080fd5b611e2484828501612226565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b60005b838110156124e15781810151838201526020016124c9565b50506000910152565b600081518084526125028160208601602086016124c6565b601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0169290920160200192915050565b600081518084526020808501945080840160005b83811015612593578151805173ffffffffffffffffffffffffffffffffffffffff908116895284820151858a0152604091820151169088015260609096019590820190600101612548565b509495945050505050565b6000815160e0845273ffffffffffffffffffffffffffffffffffffffff8082511660e08601528060208301511661010086015260408201516101208601526060820151610140860152806080830151166101608601525060a0810151905060c06101808501526126126101a08501826124ea565b905060208301516126506020860182805173ffffffffffffffffffffffffffffffffffffffff16825260208082015190830152604090810151910152565b50604083015184820360808601526126688282612534565b915050606083015184820360a086015261268282826124ea565b915050608083015160c08501528091505092915050565b6000604082016040835280865180835260608501915060608160051b8601019250602080890160005b8381101561270e577fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa08887030185526126fc86835161259e565b955093820193908201906001016126c2565b5050858403818701528684528688828601376000848801820152601f9096017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0169092019094019695505050505050565b600082357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc183360301811261279357600080fd5b9190910192915050565b60008083357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe18436030181126127d257600080fd5b83018035915067ffffffffffffffff8211156127ed57600080fd5b60200191503681900382131561227a57600080fd5b6040516060810167ffffffffffffffff8111828210171561282557612825612468565b60405290565b6040516080810167ffffffffffffffff8111828210171561282557612825612468565b60405160e0810167ffffffffffffffff8111828210171561282557612825612468565b604051601f82017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe016810167ffffffffffffffff811182821017156128b8576128b8612468565b604052919050565b600082601f8301126128d157600080fd5b813567ffffffffffffffff8111156128eb576128eb612468565b61291c60207fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0601f84011601612871565b81815284602083860101111561293157600080fd5b816020850160208301376000918101602001919091529392505050565b600060c0828403121561296057600080fd5b60405160c0810167ffffffffffffffff828210818311171561298457612984612468565b8160405282935084359150612998826123dd565b9082526020840135906129aa826123dd565b8160208401526040850135604084015260608501356060840152608085013591506129d4826123dd565b81608084015260a08501359150808211156129ee57600080fd5b506129fb858286016128c0565b60a0830152505092915050565b600060608284031215612a1a57600080fd5b612a22612802565b90508135612a2f816123dd565b80825250602082013560208201526040820135604082015292915050565b600067ffffffffffffffff821115612a6757612a67612468565b5060051b60200190565b600082601f830112612a8257600080fd5b81356020612a97612a9283612a4d565b612871565b82815260079290921b84018101918181019086841115612ab657600080fd5b8286015b84811015612b1b5760808189031215612ad35760008081fd5b612adb61282b565b8135612ae6816123dd565b8152818501358582015260408083013590820152606080830135612b09816123dd565b90820152835291830191608001612aba565b509695505050505050565b600060208284031215612b3857600080fd5b813567ffffffffffffffff80821115612b5057600080fd5b908301906101208286031215612b6557600080fd5b612b6d61284e565b823582811115612b7c57600080fd5b612b888782860161294e565b8252506020830135602082015260408301356040820152612bab606084016123ff565b606082015260808301356080820152612bc78660a08501612a08565b60a082015261010083013582811115612bdf57600080fd5b612beb87828601612a71565b60c08301525095945050505050565b60008451612c0c8184602089016124c6565b845190830190612c208183602089016124c6565b8451910190612c338183602088016124c6565b0195945050505050565b8082018082111561207b577f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b602081526000612078602083018461259e565b60006020808385031215612c9d57600080fd5b825167ffffffffffffffff811115612cb457600080fd5b8301601f81018513612cc557600080fd5b8051612cd3612a9282612a4d565b81815260609182028301840191848201919088841115612cf257600080fd5b938501935b83851015612d4e5780858a031215612d0f5760008081fd5b612d17612802565b8551612d22816123dd565b81528587015187820152604080870151612d3b816123dd565b9082015283529384019391850191612cf7565b50979650505050505050565b73ffffffffffffffffffffffffffffffffffffffff83168152604060208201526000611e24604083018461259e565b7f4578636c757369766544757463684f72646572207769746e6573732900000000815260008551612dc181601c850160208a016124c6565b855190830190612dd881601c840160208a016124c6565b8551910190612dee81601c8401602089016124c6565b8451910190612e0481601c8401602088016124c6565b01601c019695505050505050565b6000610140612e42838a51805173ffffffffffffffffffffffffffffffffffffffff168252602090810151910152565b6020890151604084015260408901516060840152612e836080840189805173ffffffffffffffffffffffffffffffffffffffff168252602090810151910152565b73ffffffffffffffffffffffffffffffffffffffff871660c08401528560e084015280610100840152612eb8818401866124ea565b9050828103610120840152612ecd81856124ea565b999850505050505050505056fe44757463684f7574707574286164647265737320746f6b656e2c75696e74323536207374617274416d6f756e742c75696e7432353620656e64416d6f756e742c6164647265737320726563697069656e7429546f6b656e5065726d697373696f6e73286164647265737320746f6b656e2c75696e7432353620616d6f756e74294f72646572496e666f28616464726573732072656163746f722c6164647265737320737761707065722c75696e74323536206e6f6e63652c75696e7432353620646561646c696e652c61646472657373206164646974696f6e616c56616c69646174696f6e436f6e74726163742c6279746573206164646974696f6e616c56616c69646174696f6e4461746129a2646970667358221220895643e805129fd4ed4b9dbb76b8350150a9a20556a76ca1da49adf06223485b64736f6c63430008130033";
var isSuperArgs = (xs) => xs.length > 1;
var ExclusiveDutchOrderReactor__factory = class extends ethers.ContractFactory {
  constructor(...args) {
    if (isSuperArgs(args)) {
      super(...args);
    } else {
      super(_abi2, _bytecode, args[0]);
    }
  }
  deploy(_permit2, _protocolFeeOwner, overrides) {
    return super.deploy(
      _permit2,
      _protocolFeeOwner,
      overrides || {}
    );
  }
  getDeployTransaction(_permit2, _protocolFeeOwner, overrides) {
    return super.getDeployTransaction(
      _permit2,
      _protocolFeeOwner,
      overrides || {}
    );
  }
  attach(address) {
    return super.attach(address);
  }
  connect(signer) {
    return super.connect(signer);
  }
  static createInterface() {
    return new ethers.utils.Interface(_abi2);
  }
  static connect(address, signerOrProvider) {
    return new ethers.Contract(
      address,
      _abi2,
      signerOrProvider
    );
  }
};
ExclusiveDutchOrderReactor__factory.bytecode = _bytecode;
ExclusiveDutchOrderReactor__factory.abi = _abi2;
var _abi3 = [
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
    name: "accountingPause",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "accountingPaused",
    inputs: [],
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
    name: "accountingUnpause",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "adminBurn",
    inputs: [
      {
        name: "src",
        type: "address",
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "allowListV2",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IAllowListV2"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address"
      },
      {
        name: "spender",
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
    name: "approve",
    inputs: [
      {
        name: "spender",
        type: "address",
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [
      {
        name: "account",
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
    name: "bridge",
    inputs: [
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "ethDestinationAddress",
        type: "address",
        internalType: "address"
      },
      {
        name: "otherDestinationAddress",
        type: "string",
        internalType: "string"
      },
      {
        name: "chainId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "bridgeToBookEntry",
    inputs: [
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "bulkMint",
    inputs: [
      {
        name: "dsts",
        type: "address[]",
        internalType: "address[]"
      },
      {
        name: "amounts",
        type: "uint256[]",
        internalType: "uint256[]"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "initialize",
    inputs: [
      {
        name: "_name",
        type: "string",
        internalType: "string"
      },
      {
        name: "_symbol",
        type: "string",
        internalType: "string"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "initializeV2",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "initializeV3",
    inputs: [
      {
        name: "_allowList",
        type: "address",
        internalType: "contract AllowList"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "isAllowed",
    inputs: [
      {
        name: "addr",
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
    name: "mint",
    inputs: [
      {
        name: "dst",
        type: "address",
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "nonces",
    inputs: [
      {
        name: "toFind",
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
    name: "offchainRedeem",
    inputs: [
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "pause",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
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
        name: "spender",
        type: "address",
        internalType: "address"
      },
      {
        name: "value",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "deadline",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "v",
        type: "uint8",
        internalType: "uint8"
      },
      {
        name: "r",
        type: "bytes32",
        internalType: "bytes32"
      },
      {
        name: "s",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setChainIdSupport",
    inputs: [
      {
        name: "_chainId",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "_supported",
        type: "bool",
        internalType: "bool"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setRedemptionContract",
    inputs: [
      {
        name: "_newRedemptionContract",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "totalSupply",
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
    name: "transfer",
    inputs: [
      {
        name: "to",
        type: "address",
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "nonpayable"
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
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "unpause",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "event",
    name: "AccountingPaused",
    inputs: [
      {
        name: "admin",
        type: "address",
        indexed: false,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "AccountingUnpaused",
    inputs: [
      {
        name: "admin",
        type: "address",
        indexed: false,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "AdminBurn",
    inputs: [
      {
        name: "burner",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "src",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
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
        name: "value",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Bridge",
    inputs: [
      {
        name: "caller",
        type: "address",
        indexed: false,
        internalType: "address"
      },
      {
        name: "src",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "ethDestinationAddress",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "otherDestinationAddress",
        type: "string",
        indexed: true,
        internalType: "string"
      },
      {
        name: "chainId",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Mint",
    inputs: [
      {
        name: "minter",
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
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "OffchainRedeem",
    inputs: [
      {
        name: "burner",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "src",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "SetChainIdSupport",
    inputs: [
      {
        name: "chainId",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      },
      {
        name: "oldSupported",
        type: "bool",
        indexed: false,
        internalType: "bool"
      },
      {
        name: "newSupported",
        type: "bool",
        indexed: false,
        internalType: "bool"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "SetMaximumOracleDelay",
    inputs: [
      {
        name: "oldMaxOracleDelay",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "newMaxOracleDelay",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "SetOracle",
    inputs: [
      {
        name: "oldOracle",
        type: "address",
        indexed: false,
        internalType: "address"
      },
      {
        name: "newOracle",
        type: "address",
        indexed: false,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "SetRedemptionContract",
    inputs: [
      {
        name: "oldRedemptionContract",
        type: "address",
        indexed: false,
        internalType: "address"
      },
      {
        name: "newRedemptionContract",
        type: "address",
        indexed: false,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "SetStablecoinConfig",
    inputs: [
      {
        name: "stablecoin",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "oldSweepDestination",
        type: "address",
        indexed: false,
        internalType: "address"
      },
      {
        name: "newSweepDestination",
        type: "address",
        indexed: false,
        internalType: "address"
      },
      {
        name: "oldFee",
        type: "uint96",
        indexed: false,
        internalType: "uint96"
      },
      {
        name: "newFee",
        type: "uint96",
        indexed: false,
        internalType: "uint96"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Subscribe",
    inputs: [
      {
        name: "subscriber",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "stablecoin",
        type: "address",
        indexed: false,
        internalType: "address"
      },
      {
        name: "stablecoinInAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "stablecoinInAmountAfterFee",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "superstateTokenOutAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
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
        name: "value",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "error",
    name: "AccountingIsNotPaused",
    inputs: []
  },
  {
    type: "error",
    name: "AccountingIsPaused",
    inputs: []
  },
  {
    type: "error",
    name: "BadArgs",
    inputs: []
  },
  {
    type: "error",
    name: "BadChainlinkData",
    inputs: []
  },
  {
    type: "error",
    name: "BadSignatory",
    inputs: []
  },
  {
    type: "error",
    name: "BridgeChainIdDestinationNotSupported",
    inputs: []
  },
  {
    type: "error",
    name: "FeeTooHigh",
    inputs: []
  },
  {
    type: "error",
    name: "InsufficientPermissions",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidArgumentLengths",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidSignatureS",
    inputs: []
  },
  {
    type: "error",
    name: "OnchainDestinationSetForBridgeToBookEntry",
    inputs: []
  },
  {
    type: "error",
    name: "OnchainSubscriptionsDisabled",
    inputs: []
  },
  {
    type: "error",
    name: "RenounceOwnershipDisabled",
    inputs: []
  },
  {
    type: "error",
    name: "SignatureExpired",
    inputs: []
  },
  {
    type: "error",
    name: "StablecoinNotSupported",
    inputs: []
  },
  {
    type: "error",
    name: "TwoDestinationsInvalid",
    inputs: []
  },
  {
    type: "error",
    name: "Unauthorized",
    inputs: []
  },
  {
    type: "error",
    name: "ZeroSuperstateTokensOut",
    inputs: []
  }
];
var ISuperstateTokenV4__factory = class {
  static createInterface() {
    return new ethers.utils.Interface(_abi3);
  }
  static connect(address, signerOrProvider) {
    return new ethers.Contract(address, _abi3, signerOrProvider);
  }
};
ISuperstateTokenV4__factory.abi = _abi3;
var _abi4 = [
  {
    inputs: [],
    name: "OrdersLengthIncorrect",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "order",
        type: "bytes"
      }
    ],
    name: "getReactor",
    outputs: [
      {
        internalType: "contract IReactor",
        name: "reactor",
        type: "address"
      }
    ],
    stateMutability: "pure",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "order",
        type: "bytes"
      },
      {
        internalType: "bytes",
        name: "sig",
        type: "bytes"
      }
    ],
    name: "quote",
    outputs: [
      {
        components: [
          {
            components: [
              {
                internalType: "contract IReactor",
                name: "reactor",
                type: "address"
              },
              {
                internalType: "address",
                name: "swapper",
                type: "address"
              },
              {
                internalType: "uint256",
                name: "nonce",
                type: "uint256"
              },
              {
                internalType: "uint256",
                name: "deadline",
                type: "uint256"
              },
              {
                internalType: "contract IValidationCallback",
                name: "additionalValidationContract",
                type: "address"
              },
              {
                internalType: "bytes",
                name: "additionalValidationData",
                type: "bytes"
              }
            ],
            internalType: "struct OrderInfo",
            name: "info",
            type: "tuple"
          },
          {
            components: [
              {
                internalType: "contract ERC20",
                name: "token",
                type: "address"
              },
              {
                internalType: "uint256",
                name: "amount",
                type: "uint256"
              },
              {
                internalType: "uint256",
                name: "maxAmount",
                type: "uint256"
              }
            ],
            internalType: "struct InputToken",
            name: "input",
            type: "tuple"
          },
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address"
              },
              {
                internalType: "uint256",
                name: "amount",
                type: "uint256"
              },
              {
                internalType: "address",
                name: "recipient",
                type: "address"
              }
            ],
            internalType: "struct OutputToken[]",
            name: "outputs",
            type: "tuple[]"
          },
          {
            internalType: "bytes",
            name: "sig",
            type: "bytes"
          },
          {
            internalType: "bytes32",
            name: "hash",
            type: "bytes32"
          }
        ],
        internalType: "struct ResolvedOrder",
        name: "result",
        type: "tuple"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        components: [
          {
            components: [
              {
                internalType: "contract IReactor",
                name: "reactor",
                type: "address"
              },
              {
                internalType: "address",
                name: "swapper",
                type: "address"
              },
              {
                internalType: "uint256",
                name: "nonce",
                type: "uint256"
              },
              {
                internalType: "uint256",
                name: "deadline",
                type: "uint256"
              },
              {
                internalType: "contract IValidationCallback",
                name: "additionalValidationContract",
                type: "address"
              },
              {
                internalType: "bytes",
                name: "additionalValidationData",
                type: "bytes"
              }
            ],
            internalType: "struct OrderInfo",
            name: "info",
            type: "tuple"
          },
          {
            components: [
              {
                internalType: "contract ERC20",
                name: "token",
                type: "address"
              },
              {
                internalType: "uint256",
                name: "amount",
                type: "uint256"
              },
              {
                internalType: "uint256",
                name: "maxAmount",
                type: "uint256"
              }
            ],
            internalType: "struct InputToken",
            name: "input",
            type: "tuple"
          },
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address"
              },
              {
                internalType: "uint256",
                name: "amount",
                type: "uint256"
              },
              {
                internalType: "address",
                name: "recipient",
                type: "address"
              }
            ],
            internalType: "struct OutputToken[]",
            name: "outputs",
            type: "tuple[]"
          },
          {
            internalType: "bytes",
            name: "sig",
            type: "bytes"
          },
          {
            internalType: "bytes32",
            name: "hash",
            type: "bytes32"
          }
        ],
        internalType: "struct ResolvedOrder[]",
        name: "resolvedOrders",
        type: "tuple[]"
      },
      {
        internalType: "bytes",
        name: "",
        type: "bytes"
      }
    ],
    name: "reactorCallback",
    outputs: [],
    stateMutability: "pure",
    type: "function"
  }
];
var _bytecode2 = "0x608060405234801561001057600080fd5b50610df8806100206000396000f3fe608060405234801561001057600080fd5b50600436106100415760003560e01c806341d88d6914610046578063585da6281461006f5780637671d07b14610084575b600080fd5b6100596100543660046104bb565b6100c5565b60405161006691906105f7565b60405180910390f35b61008261007d3660046108ec565b610221565b005b6100a0610092366004610a62565b604081810151909101015190565b60405173ffffffffffffffffffffffffffffffffffffffff9091168152602001610066565b6040805161016081018252600060a0820181815260c0830182905260e083018290526101008301829052610120830182905260606101408401819052908352835180820185528281526020808201849052818601849052840152928201839052828201929092526080810191909152604080840151840101516040805180820182528581526020808201869052825190810183526000815291517f0d33588400000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff9390931692630d335884926101af9291600401610a9f565b600060405180830381600087803b1580156101c957600080fd5b505af19250505080156101da575060015b61021b573d808015610208576040519150601f19603f3d011682016040523d82523d6000602084013e61020d565b606091505b50610217816102a2565b9150505b92915050565b815160011461025c576040517f06ee987800000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b60008260008151811061027157610271610b13565b602002602001015160405160200161028991906105f7565b6040516020818303038152906040529050805181602001fd5b6040805161016081018252600060a0820181815260c080840183905260e08401839052610100840183905261012084018390526060610140850181905291845284518083018652838152602080820185905281870185905285015293830181905280830152608082015282519091111561031e57815182602001fd5b8180602001905181019061021b9190610cf0565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b60405160c0810167ffffffffffffffff8111828210171561038457610384610332565b60405290565b6040516060810167ffffffffffffffff8111828210171561038457610384610332565b60405160a0810167ffffffffffffffff8111828210171561038457610384610332565b604051601f82017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe016810167ffffffffffffffff8111828210171561041757610417610332565b604052919050565b600067ffffffffffffffff82111561043957610439610332565b50601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe01660200190565b600082601f83011261047657600080fd5b81356104896104848261041f565b6103d0565b81815284602083860101111561049e57600080fd5b816020850160208301376000918101602001919091529392505050565b600080604083850312156104ce57600080fd5b823567ffffffffffffffff808211156104e657600080fd5b6104f286838701610465565b9350602085013591508082111561050857600080fd5b5061051585828601610465565b9150509250929050565b60005b8381101561053a578181015183820152602001610522565b50506000910152565b6000815180845261055b81602086016020860161051f565b601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0169290920160200192915050565b600081518084526020808501945080840160005b838110156105ec578151805173ffffffffffffffffffffffffffffffffffffffff908116895284820151858a01526040918201511690880152606090960195908201906001016105a1565b509495945050505050565b602081526000825160e0602084015273ffffffffffffffffffffffffffffffffffffffff808251166101008501528060208301511661012085015260408201516101408501526060820151610160850152806080830151166101808501525060a0810151905060c06101a08401526106736101c0840182610543565b905060208401516106b16040850182805173ffffffffffffffffffffffffffffffffffffffff16825260208082015190830152604090810151910152565b5060408401517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0808584030160a08601526106ec838361058d565b925060608601519150808584030160c08601525061070a8282610543565b915050608084015160e08401528091505092915050565b600067ffffffffffffffff82111561073b5761073b610332565b5060051b60200190565b73ffffffffffffffffffffffffffffffffffffffff8116811461076757600080fd5b50565b600060c0828403121561077c57600080fd5b610784610361565b9050813561079181610745565b815260208201356107a181610745565b80602083015250604082013560408201526060820135606082015260808201356107ca81610745565b608082015260a082013567ffffffffffffffff8111156107e957600080fd5b6107f584828501610465565b60a08301525092915050565b60006060828403121561081357600080fd5b61081b61038a565b9050813561082881610745565b80825250602082013560208201526040820135604082015292915050565b600082601f83011261085757600080fd5b8135602061086761048483610721565b8281526060928302850182019282820191908785111561088657600080fd5b8387015b858110156108df5781818a0312156108a25760008081fd5b6108aa61038a565b81356108b581610745565b815281860135868201526040808301356108ce81610745565b90820152845292840192810161088a565b5090979650505050505050565b600080604083850312156108ff57600080fd5b823567ffffffffffffffff8082111561091757600080fd5b818501915085601f83011261092b57600080fd5b8135602061093b61048483610721565b82815260059290921b8401810191818101908984111561095a57600080fd5b8286015b84811015610a4b578035868111156109765760008081fd5b870160e0818d037fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0018113156109ac5760008081fd5b6109b46103ad565b86830135898111156109c65760008081fd5b6109d48f898387010161076a565b8252506109e48e60408501610801565b8782015260a0830135898111156109fb5760008081fd5b610a098f8983870101610846565b60408301525060c083013589811115610a225760008081fd5b610a308f8983870101610465565b6060830152509101356080820152835291830191830161095e565b509650508601359250508082111561050857600080fd5b600060208284031215610a7457600080fd5b813567ffffffffffffffff811115610a8b57600080fd5b610a9784828501610465565b949350505050565b6040815260008351604080840152610aba6080840182610543565b905060208501517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc0848303016060850152610af58282610543565b9150508281036020840152610b0a8185610543565b95945050505050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b600082601f830112610b5357600080fd5b8151610b616104848261041f565b818152846020838601011115610b7657600080fd5b610a9782602083016020870161051f565b600060c08284031215610b9957600080fd5b610ba1610361565b90508151610bae81610745565b81526020820151610bbe81610745565b8060208301525060408201516040820152606082015160608201526080820151610be781610745565b608082015260a082015167ffffffffffffffff811115610c0657600080fd5b6107f584828501610b42565b600060608284031215610c2457600080fd5b610c2c61038a565b90508151610c3981610745565b80825250602082015160208201526040820151604082015292915050565b600082601f830112610c6857600080fd5b81516020610c7861048483610721565b82815260609283028501820192828201919087851115610c9757600080fd5b8387015b858110156108df5781818a031215610cb35760008081fd5b610cbb61038a565b8151610cc681610745565b81528186015186820152604080830151610cdf81610745565b908201528452928401928101610c9b565b600060208284031215610d0257600080fd5b815167ffffffffffffffff80821115610d1a57600080fd5b9083019060e08286031215610d2e57600080fd5b610d366103ad565b825182811115610d4557600080fd5b610d5187828601610b87565b825250610d618660208501610c12565b6020820152608083015182811115610d7857600080fd5b610d8487828601610c57565b60408301525060a083015182811115610d9c57600080fd5b610da887828601610b42565b60608301525060c09290920151608083015250939250505056fea26469706673582212200f8bfac10e493298054283c6a1044fad50f6979a90490fcbe07d79ecea4c1f8964736f6c63430008130033";
var isSuperArgs2 = (xs) => xs.length > 1;
var OrderQuoter__factory = class extends ethers.ContractFactory {
  constructor(...args) {
    if (isSuperArgs2(args)) {
      super(...args);
    } else {
      super(_abi4, _bytecode2, args[0]);
    }
  }
  deploy(overrides) {
    return super.deploy(overrides || {});
  }
  getDeployTransaction(overrides) {
    return super.getDeployTransaction(overrides || {});
  }
  attach(address) {
    return super.attach(address);
  }
  connect(signer) {
    return super.connect(signer);
  }
  static createInterface() {
    return new ethers.utils.Interface(_abi4);
  }
  static connect(address, signerOrProvider) {
    return new ethers.Contract(address, _abi4, signerOrProvider);
  }
};
OrderQuoter__factory.bytecode = _bytecode2;
OrderQuoter__factory.abi = _abi4;
var _abi5 = [
  {
    type: "receive",
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "getAuctionResolver",
    inputs: [
      {
        name: "order",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    outputs: [
      {
        name: "auctionResolver",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "pure"
  },
  {
    type: "function",
    name: "quote",
    inputs: [
      {
        name: "reactor",
        type: "address",
        internalType: "contract IReactor"
      },
      {
        name: "order",
        type: "bytes",
        internalType: "bytes"
      },
      {
        name: "sig",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    outputs: [
      {
        name: "result",
        type: "tuple",
        internalType: "struct ResolvedOrder",
        components: [
          {
            name: "info",
            type: "tuple",
            internalType: "struct OrderInfo",
            components: [
              {
                name: "reactor",
                type: "address",
                internalType: "contract IReactor"
              },
              {
                name: "swapper",
                type: "address",
                internalType: "address"
              },
              {
                name: "nonce",
                type: "uint256",
                internalType: "uint256"
              },
              {
                name: "deadline",
                type: "uint256",
                internalType: "uint256"
              },
              {
                name: "preExecutionHook",
                type: "address",
                internalType: "contract IPreExecutionHook"
              },
              {
                name: "preExecutionHookData",
                type: "bytes",
                internalType: "bytes"
              },
              {
                name: "postExecutionHook",
                type: "address",
                internalType: "contract IPostExecutionHook"
              },
              {
                name: "postExecutionHookData",
                type: "bytes",
                internalType: "bytes"
              },
              {
                name: "auctionResolver",
                type: "address",
                internalType: "contract IAuctionResolver"
              }
            ]
          },
          {
            name: "input",
            type: "tuple",
            internalType: "struct InputToken",
            components: [
              {
                name: "token",
                type: "address",
                internalType: "contract ERC20"
              },
              {
                name: "amount",
                type: "uint256",
                internalType: "uint256"
              },
              {
                name: "maxAmount",
                type: "uint256",
                internalType: "uint256"
              }
            ]
          },
          {
            name: "outputs",
            type: "tuple[]",
            internalType: "struct OutputToken[]",
            components: [
              {
                name: "token",
                type: "address",
                internalType: "address"
              },
              {
                name: "amount",
                type: "uint256",
                internalType: "uint256"
              },
              {
                name: "recipient",
                type: "address",
                internalType: "address"
              }
            ]
          },
          {
            name: "sig",
            type: "bytes",
            internalType: "bytes"
          },
          {
            name: "hash",
            type: "bytes32",
            internalType: "bytes32"
          },
          {
            name: "auctionResolver",
            type: "address",
            internalType: "address"
          },
          {
            name: "witnessTypeString",
            type: "string",
            internalType: "string"
          }
        ]
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "reactorCallback",
    inputs: [
      {
        name: "resolvedOrders",
        type: "tuple[]",
        internalType: "struct ResolvedOrder[]",
        components: [
          {
            name: "info",
            type: "tuple",
            internalType: "struct OrderInfo",
            components: [
              {
                name: "reactor",
                type: "address",
                internalType: "contract IReactor"
              },
              {
                name: "swapper",
                type: "address",
                internalType: "address"
              },
              {
                name: "nonce",
                type: "uint256",
                internalType: "uint256"
              },
              {
                name: "deadline",
                type: "uint256",
                internalType: "uint256"
              },
              {
                name: "preExecutionHook",
                type: "address",
                internalType: "contract IPreExecutionHook"
              },
              {
                name: "preExecutionHookData",
                type: "bytes",
                internalType: "bytes"
              },
              {
                name: "postExecutionHook",
                type: "address",
                internalType: "contract IPostExecutionHook"
              },
              {
                name: "postExecutionHookData",
                type: "bytes",
                internalType: "bytes"
              },
              {
                name: "auctionResolver",
                type: "address",
                internalType: "contract IAuctionResolver"
              }
            ]
          },
          {
            name: "input",
            type: "tuple",
            internalType: "struct InputToken",
            components: [
              {
                name: "token",
                type: "address",
                internalType: "contract ERC20"
              },
              {
                name: "amount",
                type: "uint256",
                internalType: "uint256"
              },
              {
                name: "maxAmount",
                type: "uint256",
                internalType: "uint256"
              }
            ]
          },
          {
            name: "outputs",
            type: "tuple[]",
            internalType: "struct OutputToken[]",
            components: [
              {
                name: "token",
                type: "address",
                internalType: "address"
              },
              {
                name: "amount",
                type: "uint256",
                internalType: "uint256"
              },
              {
                name: "recipient",
                type: "address",
                internalType: "address"
              }
            ]
          },
          {
            name: "sig",
            type: "bytes",
            internalType: "bytes"
          },
          {
            name: "hash",
            type: "bytes32",
            internalType: "bytes32"
          },
          {
            name: "auctionResolver",
            type: "address",
            internalType: "address"
          },
          {
            name: "witnessTypeString",
            type: "string",
            internalType: "string"
          }
        ]
      },
      {
        name: "",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    outputs: [],
    stateMutability: "pure"
  },
  {
    type: "error",
    name: "OrdersLengthIncorrect",
    inputs: []
  }
];
var _bytecode3 = "0x6080604052348015600e575f5ffd5b506112bd8061001c5f395ff3fe608060405260043610610036575f3560e01c806376b14307146100415780639a58757c1461008c578063c8a702c2146100ad575f5ffd5b3661003d57005b5f5ffd5b34801561004c575f5ffd5b5061006261005b36600461051b565b6020015190565b60405173ffffffffffffffffffffffffffffffffffffffff90911681526020015b60405180910390f35b348015610097575f5ffd5b506100ab6100a636600461059a565b6100d9565b005b3480156100b8575f5ffd5b506100cc6100c7366004610664565b610161565b60405161008391906107a8565b60018314610113576040517f06ee987800000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b5f84845f818110610126576101266109fd565b90506020028101906101389190610a2a565b6040516020016101489190610d54565b6040516020818303038152906040529050805181602001fd5b60408051610200810182525f60e082018181526101008301829052610120830182905261014083018290526101608301829052606061018084018190526101a084018390526101c084018190526101e084018390529083528351808201855282815260208082018490528186018490528401529282018390528282018390526080820181905260a082015260c08101919091526040805180820182528481526020808201859052825190810183525f815291517f0d33588400000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff871692630d3358849261026492909190600401610ec7565b5f604051808303815f87803b15801561027b575f5ffd5b505af192505050801561028c575060015b6102cc573d8080156102b9576040519150601f19603f3d011682016040523d82523d5f602084013e6102be565b606091505b506102c8816102d3565b9150505b9392505050565b60408051610200810182525f60e082018181526101008301829052610120830182905261014083018290526101608301829052606061018084018190526101a084018390526101c084018190526101e084018390529083528351808201855282815260208082018490528186018490528401529282018390528282018390526080820181905260a082015260c08101919091526103008251101561037957815182602001fd5b8180602001905181019061038d919061116b565b92915050565b919050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52604160045260245ffd5b604051610120810167ffffffffffffffff811182821017156103e9576103e9610398565b60405290565b6040516060810167ffffffffffffffff811182821017156103e9576103e9610398565b60405160e0810167ffffffffffffffff811182821017156103e9576103e9610398565b604051601f82017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe016810167ffffffffffffffff8111828210171561047c5761047c610398565b604052919050565b5f67ffffffffffffffff82111561049d5761049d610398565b50601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe01660200190565b5f82601f8301126104d8575f5ffd5b81356104eb6104e682610484565b610435565b8181528460208386010111156104ff575f5ffd5b816020850160208301375f918101602001919091529392505050565b5f6020828403121561052b575f5ffd5b813567ffffffffffffffff811115610541575f5ffd5b61054d848285016104c9565b949350505050565b5f5f83601f840112610565575f5ffd5b50813567ffffffffffffffff81111561057c575f5ffd5b602083019150836020828501011115610593575f5ffd5b9250929050565b5f5f5f5f604085870312156105ad575f5ffd5b843567ffffffffffffffff8111156105c3575f5ffd5b8501601f810187136105d3575f5ffd5b803567ffffffffffffffff8111156105e9575f5ffd5b8760208260051b84010111156105fd575f5ffd5b60209182019550935085013567ffffffffffffffff81111561061d575f5ffd5b61062987828801610555565b95989497509550505050565b73ffffffffffffffffffffffffffffffffffffffff81168114610656575f5ffd5b50565b803561039381610635565b5f5f5f60608486031215610676575f5ffd5b833561068181610635565b9250602084013567ffffffffffffffff81111561069c575f5ffd5b6106a8868287016104c9565b925050604084013567ffffffffffffffff8111156106c4575f5ffd5b6106d0868287016104c9565b9150509250925092565b5f81518084528060208401602086015e5f6020828601015260207fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0601f83011685010191505092915050565b5f8151808452602084019350602083015f5b8281101561079e57815173ffffffffffffffffffffffffffffffffffffffff81511687526020810151602088015273ffffffffffffffffffffffffffffffffffffffff604082015116604088015250606086019550602082019150600181019050610738565b5093949350505050565b602081525f825161012060208401526107db6101408401825173ffffffffffffffffffffffffffffffffffffffff169052565b602081015173ffffffffffffffffffffffffffffffffffffffff908116610160850152604082015161018085015260608201516101a08501526080820151166101c084015260a08101516101206101e085015261083c6102608501826106da565b905060c082015161086661020086018273ffffffffffffffffffffffffffffffffffffffff169052565b5060e08201517ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffec0858303016102208601526108a182826106da565b91505061010082015191506108cf61024085018373ffffffffffffffffffffffffffffffffffffffff169052565b6020850151915061090d6040850183805173ffffffffffffffffffffffffffffffffffffffff16825260208082015190830152604090810151910152565b604085015191507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08482030160a08501526109488183610726565b91505060608401517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08483030160c085015261098482826106da565b915050608084015160e084015260a08401516109b961010085018273ffffffffffffffffffffffffffffffffffffffff169052565b5060c08401517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0848303016101208501526109f482826106da565b95945050505050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52603260045260245ffd5b5f82357ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffee1833603018112610a5c575f5ffd5b9190910192915050565b5f5f83357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe1843603018112610a99575f5ffd5b830160208101925035905067ffffffffffffffff811115610ab8575f5ffd5b803603821315610593575f5ffd5b81835281816020850137505f602082840101525f60207fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0601f840116840101905092915050565b610b3482610b1a83610659565b73ffffffffffffffffffffffffffffffffffffffff169052565b5f610b4160208301610659565b73ffffffffffffffffffffffffffffffffffffffff1660208401526040828101359084015260608083013590840152610b7c60808301610659565b73ffffffffffffffffffffffffffffffffffffffff166080840152610ba460a0830183610a66565b61012060a0860152610bbb61012086018284610ac6565b915050610bca60c08401610659565b73ffffffffffffffffffffffffffffffffffffffff1660c0850152610bf260e0840184610a66565b85830360e0870152610c05838284610ac6565b92505050610c166101008401610659565b73ffffffffffffffffffffffffffffffffffffffff8116610100860152509392505050565b8035610c4681610635565b73ffffffffffffffffffffffffffffffffffffffff16825260208181013590830152604090810135910152565b5f5f83357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe1843603018112610ca6575f5ffd5b830160208101925035905067ffffffffffffffff811115610cc5575f5ffd5b606081023603821315610593575f5ffd5b8183526020830192505f815f5b8481101561079e578135610cf681610635565b73ffffffffffffffffffffffffffffffffffffffff168652602082810135908701526040820135610d2681610635565b73ffffffffffffffffffffffffffffffffffffffff1660408701526060958601959190910190600101610ce3565b602081525f82357ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffee1843603018112610d8a575f5ffd5b6101206020840152610da26101408401858301610b0d565b9050610db46040840160208601610c3b565b610dc16080850185610c73565b7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08584030160a0860152610df6838284610cd6565b92505050610e0760a0850185610a66565b7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08584030160c0860152610e3c838284610ac6565b925050505f60c085013590508060e085015250610e5b60e08501610659565b73ffffffffffffffffffffffffffffffffffffffff811661010085015250610e87610100850185610a66565b7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe085840301610120860152610ebd838284610ac6565b9695505050505050565b604081525f8351604080840152610ee160808401826106da565b905060208501517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc0848303016060850152610f1c82826106da565b91505082810360208401526109f481856106da565b805161039381610635565b5f82601f830112610f4b575f5ffd5b8151602083015f610f5e6104e684610484565b9050828152858383011115610f71575f5ffd5b8282602083015e5f92810160200192909252509392505050565b5f6101208284031215610f9c575f5ffd5b610fa46103c5565b9050610faf82610f31565b8152610fbd60208301610f31565b60208201526040828101519082015260608083015190820152610fe260808301610f31565b608082015260a082015167ffffffffffffffff811115611000575f5ffd5b61100c84828501610f3c565b60a08301525061101e60c08301610f31565b60c082015260e082015167ffffffffffffffff81111561103c575f5ffd5b61104884828501610f3c565b60e08301525061105b6101008301610f31565b61010082015292915050565b5f60608284031215611077575f5ffd5b61107f6103ef565b9050815161108c81610635565b81526020828101519082015260409182015191810191909152919050565b5f82601f8301126110b9575f5ffd5b815167ffffffffffffffff8111156110d3576110d3610398565b6110e260208260051b01610435565b80828252602082019150602060608402860101925085831115611103575f5ffd5b602085015b83811015611161576060818803121561111f575f5ffd5b6111276103ef565b815161113281610635565b815260208281015190820152604082015161114c81610635565b60408201528352602090920191606001611108565b5095945050505050565b5f6020828403121561117b575f5ffd5b815167ffffffffffffffff811115611191575f5ffd5b820161012081850312156111a3575f5ffd5b6111ab610412565b815167ffffffffffffffff8111156111c1575f5ffd5b6111cd86828501610f8b565b8252506111dd8560208401611067565b6020820152608082015167ffffffffffffffff8111156111fb575f5ffd5b611207868285016110aa565b60408301525060a082015167ffffffffffffffff811115611226575f5ffd5b61123286828501610f3c565b60608301525060c0820151608082015261124e60e08301610f31565b60a082015261010082015167ffffffffffffffff81111561126d575f5ffd5b61127986828501610f3c565b60c08301525094935050505056fea2646970667358221220ab38903574960967a008e6904054f6eac9d325d119e3d893a931f8d6ae8b0bbd64736f6c634300081e0033";
var isSuperArgs3 = (xs) => xs.length > 1;
var OrderQuoterV4__factory = class extends ethers.ContractFactory {
  constructor(...args) {
    if (isSuperArgs3(args)) {
      super(...args);
    } else {
      super(_abi5, _bytecode3, args[0]);
    }
  }
  deploy(overrides) {
    return super.deploy(overrides || {});
  }
  getDeployTransaction(overrides) {
    return super.getDeployTransaction(overrides || {});
  }
  attach(address) {
    return super.attach(address);
  }
  connect(signer) {
    return super.connect(signer);
  }
  static createInterface() {
    return new ethers.utils.Interface(_abi5);
  }
  static connect(address, signerOrProvider) {
    return new ethers.Contract(address, _abi5, signerOrProvider);
  }
};
OrderQuoterV4__factory.bytecode = _bytecode3;
OrderQuoterV4__factory.abi = _abi5;
var _abi6 = [
  {
    inputs: [
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256"
      }
    ],
    name: "AllowanceExpired",
    type: "error"
  },
  {
    inputs: [],
    name: "ExcessiveInvalidation",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }
    ],
    name: "InsufficientAllowance",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "maxAmount",
        type: "uint256"
      }
    ],
    name: "InvalidAmount",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidContractSignature",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidNonce",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidSignature",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidSignatureLength",
    type: "error"
  },
  {
    inputs: [],
    name: "InvalidSigner",
    type: "error"
  },
  {
    inputs: [],
    name: "LengthMismatch",
    type: "error"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "signatureDeadline",
        type: "uint256"
      }
    ],
    name: "SignatureExpired",
    type: "error"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "token",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "spender",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint160",
        name: "amount",
        type: "uint160"
      },
      {
        indexed: false,
        internalType: "uint48",
        name: "expiration",
        type: "uint48"
      }
    ],
    name: "Approval",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address"
      },
      {
        indexed: false,
        internalType: "address",
        name: "token",
        type: "address"
      },
      {
        indexed: false,
        internalType: "address",
        name: "spender",
        type: "address"
      }
    ],
    name: "Lockdown",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "token",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "spender",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint48",
        name: "newNonce",
        type: "uint48"
      },
      {
        indexed: false,
        internalType: "uint48",
        name: "oldNonce",
        type: "uint48"
      }
    ],
    name: "NonceInvalidation",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "token",
        type: "address"
      },
      {
        indexed: true,
        internalType: "address",
        name: "spender",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint160",
        name: "amount",
        type: "uint160"
      },
      {
        indexed: false,
        internalType: "uint48",
        name: "expiration",
        type: "uint48"
      },
      {
        indexed: false,
        internalType: "uint48",
        name: "nonce",
        type: "uint48"
      }
    ],
    name: "Permit",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "owner",
        type: "address"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "word",
        type: "uint256"
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "mask",
        type: "uint256"
      }
    ],
    name: "UnorderedNonceInvalidation",
    type: "event"
  },
  {
    inputs: [],
    name: "DOMAIN_SEPARATOR",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      },
      {
        internalType: "address",
        name: "",
        type: "address"
      },
      {
        internalType: "address",
        name: "",
        type: "address"
      }
    ],
    name: "allowance",
    outputs: [
      {
        internalType: "uint160",
        name: "amount",
        type: "uint160"
      },
      {
        internalType: "uint48",
        name: "expiration",
        type: "uint48"
      },
      {
        internalType: "uint48",
        name: "nonce",
        type: "uint48"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address"
      },
      {
        internalType: "address",
        name: "spender",
        type: "address"
      },
      {
        internalType: "uint160",
        name: "amount",
        type: "uint160"
      },
      {
        internalType: "uint48",
        name: "expiration",
        type: "uint48"
      }
    ],
    name: "approve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address"
      },
      {
        internalType: "address",
        name: "spender",
        type: "address"
      },
      {
        internalType: "uint48",
        name: "newNonce",
        type: "uint48"
      }
    ],
    name: "invalidateNonces",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "wordPos",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "mask",
        type: "uint256"
      }
    ],
    name: "invalidateUnorderedNonces",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "token",
            type: "address"
          },
          {
            internalType: "address",
            name: "spender",
            type: "address"
          }
        ],
        internalType: "struct IAllowanceTransfer.TokenSpenderPair[]",
        name: "approvals",
        type: "tuple[]"
      }
    ],
    name: "lockdown",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    name: "nonceBitmap",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address"
      },
      {
        components: [
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address"
              },
              {
                internalType: "uint160",
                name: "amount",
                type: "uint160"
              },
              {
                internalType: "uint48",
                name: "expiration",
                type: "uint48"
              },
              {
                internalType: "uint48",
                name: "nonce",
                type: "uint48"
              }
            ],
            internalType: "struct IAllowanceTransfer.PermitDetails[]",
            name: "details",
            type: "tuple[]"
          },
          {
            internalType: "address",
            name: "spender",
            type: "address"
          },
          {
            internalType: "uint256",
            name: "sigDeadline",
            type: "uint256"
          }
        ],
        internalType: "struct IAllowanceTransfer.PermitBatch",
        name: "permitBatch",
        type: "tuple"
      },
      {
        internalType: "bytes",
        name: "signature",
        type: "bytes"
      }
    ],
    name: "permit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "owner",
        type: "address"
      },
      {
        components: [
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address"
              },
              {
                internalType: "uint160",
                name: "amount",
                type: "uint160"
              },
              {
                internalType: "uint48",
                name: "expiration",
                type: "uint48"
              },
              {
                internalType: "uint48",
                name: "nonce",
                type: "uint48"
              }
            ],
            internalType: "struct IAllowanceTransfer.PermitDetails",
            name: "details",
            type: "tuple"
          },
          {
            internalType: "address",
            name: "spender",
            type: "address"
          },
          {
            internalType: "uint256",
            name: "sigDeadline",
            type: "uint256"
          }
        ],
        internalType: "struct IAllowanceTransfer.PermitSingle",
        name: "permitSingle",
        type: "tuple"
      },
      {
        internalType: "bytes",
        name: "signature",
        type: "bytes"
      }
    ],
    name: "permit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        components: [
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address"
              },
              {
                internalType: "uint256",
                name: "amount",
                type: "uint256"
              }
            ],
            internalType: "struct ISignatureTransfer.TokenPermissions",
            name: "permitted",
            type: "tuple"
          },
          {
            internalType: "uint256",
            name: "nonce",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "deadline",
            type: "uint256"
          }
        ],
        internalType: "struct ISignatureTransfer.PermitTransferFrom",
        name: "permit",
        type: "tuple"
      },
      {
        components: [
          {
            internalType: "address",
            name: "to",
            type: "address"
          },
          {
            internalType: "uint256",
            name: "requestedAmount",
            type: "uint256"
          }
        ],
        internalType: "struct ISignatureTransfer.SignatureTransferDetails",
        name: "transferDetails",
        type: "tuple"
      },
      {
        internalType: "address",
        name: "owner",
        type: "address"
      },
      {
        internalType: "bytes",
        name: "signature",
        type: "bytes"
      }
    ],
    name: "permitTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        components: [
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address"
              },
              {
                internalType: "uint256",
                name: "amount",
                type: "uint256"
              }
            ],
            internalType: "struct ISignatureTransfer.TokenPermissions[]",
            name: "permitted",
            type: "tuple[]"
          },
          {
            internalType: "uint256",
            name: "nonce",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "deadline",
            type: "uint256"
          }
        ],
        internalType: "struct ISignatureTransfer.PermitBatchTransferFrom",
        name: "permit",
        type: "tuple"
      },
      {
        components: [
          {
            internalType: "address",
            name: "to",
            type: "address"
          },
          {
            internalType: "uint256",
            name: "requestedAmount",
            type: "uint256"
          }
        ],
        internalType: "struct ISignatureTransfer.SignatureTransferDetails[]",
        name: "transferDetails",
        type: "tuple[]"
      },
      {
        internalType: "address",
        name: "owner",
        type: "address"
      },
      {
        internalType: "bytes",
        name: "signature",
        type: "bytes"
      }
    ],
    name: "permitTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        components: [
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address"
              },
              {
                internalType: "uint256",
                name: "amount",
                type: "uint256"
              }
            ],
            internalType: "struct ISignatureTransfer.TokenPermissions",
            name: "permitted",
            type: "tuple"
          },
          {
            internalType: "uint256",
            name: "nonce",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "deadline",
            type: "uint256"
          }
        ],
        internalType: "struct ISignatureTransfer.PermitTransferFrom",
        name: "permit",
        type: "tuple"
      },
      {
        components: [
          {
            internalType: "address",
            name: "to",
            type: "address"
          },
          {
            internalType: "uint256",
            name: "requestedAmount",
            type: "uint256"
          }
        ],
        internalType: "struct ISignatureTransfer.SignatureTransferDetails",
        name: "transferDetails",
        type: "tuple"
      },
      {
        internalType: "address",
        name: "owner",
        type: "address"
      },
      {
        internalType: "bytes32",
        name: "witness",
        type: "bytes32"
      },
      {
        internalType: "string",
        name: "witnessTypeString",
        type: "string"
      },
      {
        internalType: "bytes",
        name: "signature",
        type: "bytes"
      }
    ],
    name: "permitWitnessTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        components: [
          {
            components: [
              {
                internalType: "address",
                name: "token",
                type: "address"
              },
              {
                internalType: "uint256",
                name: "amount",
                type: "uint256"
              }
            ],
            internalType: "struct ISignatureTransfer.TokenPermissions[]",
            name: "permitted",
            type: "tuple[]"
          },
          {
            internalType: "uint256",
            name: "nonce",
            type: "uint256"
          },
          {
            internalType: "uint256",
            name: "deadline",
            type: "uint256"
          }
        ],
        internalType: "struct ISignatureTransfer.PermitBatchTransferFrom",
        name: "permit",
        type: "tuple"
      },
      {
        components: [
          {
            internalType: "address",
            name: "to",
            type: "address"
          },
          {
            internalType: "uint256",
            name: "requestedAmount",
            type: "uint256"
          }
        ],
        internalType: "struct ISignatureTransfer.SignatureTransferDetails[]",
        name: "transferDetails",
        type: "tuple[]"
      },
      {
        internalType: "address",
        name: "owner",
        type: "address"
      },
      {
        internalType: "bytes32",
        name: "witness",
        type: "bytes32"
      },
      {
        internalType: "string",
        name: "witnessTypeString",
        type: "string"
      },
      {
        internalType: "bytes",
        name: "signature",
        type: "bytes"
      }
    ],
    name: "permitWitnessTransferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "from",
            type: "address"
          },
          {
            internalType: "address",
            name: "to",
            type: "address"
          },
          {
            internalType: "uint160",
            name: "amount",
            type: "uint160"
          },
          {
            internalType: "address",
            name: "token",
            type: "address"
          }
        ],
        internalType: "struct IAllowanceTransfer.AllowanceTransferDetails[]",
        name: "transferDetails",
        type: "tuple[]"
      }
    ],
    name: "transferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "from",
        type: "address"
      },
      {
        internalType: "address",
        name: "to",
        type: "address"
      },
      {
        internalType: "uint160",
        name: "amount",
        type: "uint160"
      },
      {
        internalType: "address",
        name: "token",
        type: "address"
      }
    ],
    name: "transferFrom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
];
var _bytecode4 = "0x60c0346100bb574660a052602081017f8cad95687ba82c2ce50e74f7b754645e5117c3a5bec8151c0726d5857980a86681527f9ac997416e8ff9d2ff6bebeb7149f65cdae5e32e2b90440b566bb3044041d36a60408301524660608301523060808301526080825260a082019180831060018060401b038411176100a557826040525190206080526123c090816100c1823960805181611b47015260a05181611b210152f35b634e487b7160e01b600052604160045260246000fd5b600080fdfe6040608081526004908136101561001557600080fd5b600090813560e01c80630d58b1db1461126c578063137c29fe146110755780632a2d80d114610db75780632b67b57014610bde57806330f28b7a14610ade5780633644e51514610a9d57806336c7851614610a285780633ff9dcb1146109a85780634fe02b441461093f57806365d9723c146107ac57806387517c451461067a578063927da105146105c3578063cc53287f146104a3578063edd9444b1461033a5763fe8ec1a7146100c657600080fd5b346103365760c07ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126103365767ffffffffffffffff833581811161033257610114903690860161164b565b60243582811161032e5761012b903690870161161a565b6101336114e6565b9160843585811161032a5761014b9036908a016115c1565b98909560a43590811161032657610164913691016115c1565b969095815190610173826113ff565b606b82527f5065726d697442617463685769746e6573735472616e7366657246726f6d285460208301527f6f6b656e5065726d697373696f6e735b5d207065726d69747465642c61646472838301527f657373207370656e6465722c75696e74323536206e6f6e63652c75696e74323560608301527f3620646561646c696e652c000000000000000000000000000000000000000000608083015282519a8b9181610222602085018096611f93565b918237018a8152039961025b7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe09b8c8101835282611437565b5190209085515161026b81611ebb565b908a5b8181106102f95750506102f6999a6102ed9183516102a081610294602082018095611f66565b03848101835282611437565b519020602089810151858b015195519182019687526040820192909252336060820152608081019190915260a081019390935260643560c08401528260e081015b03908101835282611437565b51902093611cf7565b80f35b8061031161030b610321938c5161175e565b51612054565b61031b828661175e565b52611f0a565b61026e565b8880fd5b8780fd5b8480fd5b8380fd5b5080fd5b5091346103365760807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126103365767ffffffffffffffff9080358281116103325761038b903690830161164b565b60243583811161032e576103a2903690840161161a565b9390926103ad6114e6565b9160643590811161049f576103c4913691016115c1565b949093835151976103d489611ebb565b98885b81811061047d5750506102f697988151610425816103f9602082018095611f66565b037fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08101835282611437565b5190206020860151828701519083519260208401947ffcf35f5ac6a2c28868dc44c302166470266239195f02b0ee408334829333b7668652840152336060840152608083015260a082015260a081526102ed8161141b565b808b61031b8261049461030b61049a968d5161175e565b9261175e565b6103d7565b8680fd5b5082346105bf57602090817ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126103325780359067ffffffffffffffff821161032e576104f49136910161161a565b929091845b848110610504578580f35b8061051a610515600193888861196c565b61197c565b61052f84610529848a8a61196c565b0161197c565b3389528385528589209173ffffffffffffffffffffffffffffffffffffffff80911692838b528652868a20911690818a5285528589207fffffffffffffffffffffffff000000000000000000000000000000000000000081541690558551918252848201527f89b1add15eff56b3dfe299ad94e01f2b52fbcb80ae1a3baea6ae8c04cb2b98a4853392a2016104f9565b8280fd5b50346103365760607ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc36011261033657610676816105ff6114a0565b936106086114c3565b6106106114e6565b73ffffffffffffffffffffffffffffffffffffffff968716835260016020908152848420928816845291825283832090871683528152919020549251938316845260a083901c65ffffffffffff169084015260d09190911c604083015281906060820190565b0390f35b50346103365760807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc360112610336576106b26114a0565b906106bb6114c3565b916106c46114e6565b65ffffffffffff926064358481169081810361032a5779ffffffffffff0000000000000000000000000000000000000000947fda9fa7c1b00402c17d0161b249b1ab8bbec047c5a52207b9c112deffd817036b94338a5260016020527fffffffffffff0000000000000000000000000000000000000000000000000000858b209873ffffffffffffffffffffffffffffffffffffffff809416998a8d5260205283878d209b169a8b8d52602052868c209486156000146107a457504216925b8454921697889360a01b16911617179055815193845260208401523392a480f35b905092610783565b5082346105bf5760607ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126105bf576107e56114a0565b906107ee6114c3565b9265ffffffffffff604435818116939084810361032a57338852602091600183528489209673ffffffffffffffffffffffffffffffffffffffff80911697888b528452858a20981697888a5283528489205460d01c93848711156109175761ffff9085840316116108f05750907f55eb90d810e1700b35a8e7e25395ff7f2b2259abd7415ca2284dfb1c246418f393929133895260018252838920878a528252838920888a5282528389209079ffffffffffffffffffffffffffffffffffffffffffffffffffff7fffffffffffff000000000000000000000000000000000000000000000000000083549260d01b16911617905582519485528401523392a480f35b84517f24d35a26000000000000000000000000000000000000000000000000000000008152fd5b5084517f756688fe000000000000000000000000000000000000000000000000000000008152fd5b503461033657807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc360112610336578060209273ffffffffffffffffffffffffffffffffffffffff61098f6114a0565b1681528084528181206024358252845220549051908152f35b5082346105bf57817ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126105bf577f3704902f963766a4e561bbaab6e6cdc1b1dd12f6e9e99648da8843b3f46b918d90359160243533855284602052818520848652602052818520818154179055815193845260208401523392a280f35b8234610a9a5760807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc360112610a9a57610a606114a0565b610a686114c3565b610a706114e6565b6064359173ffffffffffffffffffffffffffffffffffffffff8316830361032e576102f6936117a1565b80fd5b503461033657817ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc36011261033657602090610ad7611b1e565b9051908152f35b508290346105bf576101007ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126105bf57610b1a3661152a565b90807fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7c36011261033257610b4c611478565b9160e43567ffffffffffffffff8111610bda576102f694610b6f913691016115c1565b939092610b7c8351612054565b6020840151828501519083519260208401947f939c21a48a8dbe3a9a2404a1d46691e4d39f6583d6ec6b35714604c986d801068652840152336060840152608083015260a082015260a08152610bd18161141b565b51902091611c25565b8580fd5b509134610336576101007ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc36011261033657610c186114a0565b7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffdc360160c08112610332576080855191610c51836113e3565b1261033257845190610c6282611398565b73ffffffffffffffffffffffffffffffffffffffff91602435838116810361049f578152604435838116810361049f57602082015265ffffffffffff606435818116810361032a5788830152608435908116810361049f576060820152815260a435938285168503610bda576020820194855260c4359087830182815260e43567ffffffffffffffff811161032657610cfe90369084016115c1565b929093804211610d88575050918591610d786102f6999a610d7e95610d238851611fbe565b90898c511690519083519260208401947ff3841cd1ff0085026a6327b620b67997ce40f282c88a8e905a7a5626e310f3d086528401526060830152608082015260808152610d70816113ff565b519020611bd9565b916120c7565b519251169161199d565b602492508a51917fcd21db4f000000000000000000000000000000000000000000000000000000008352820152fd5b5091346103365760607ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc93818536011261033257610df36114a0565b9260249081359267ffffffffffffffff9788851161032a578590853603011261049f578051978589018981108282111761104a578252848301358181116103265785019036602383011215610326578382013591610e50836115ef565b90610e5d85519283611437565b838252602093878584019160071b83010191368311611046578801905b828210610fe9575050508a526044610e93868801611509565b96838c01978852013594838b0191868352604435908111610fe557610ebb90369087016115c1565b959096804211610fba575050508998995151610ed681611ebb565b908b5b818110610f9757505092889492610d7892610f6497958351610f02816103f98682018095611f66565b5190209073ffffffffffffffffffffffffffffffffffffffff9a8b8b51169151928551948501957faf1b0d30d2cab0380e68f0689007e3254993c596f2fdd0aaa7f4d04f794408638752850152830152608082015260808152610d70816113ff565b51169082515192845b848110610f78578580f35b80610f918585610f8b600195875161175e565b5161199d565b01610f6d565b80610311610fac8e9f9e93610fb2945161175e565b51611fbe565b9b9a9b610ed9565b8551917fcd21db4f000000000000000000000000000000000000000000000000000000008352820152fd5b8a80fd5b6080823603126110465785608091885161100281611398565b61100b85611509565b8152611018838601611509565b838201526110278a8601611607565b8a8201528d611037818701611607565b90820152815201910190610e7a565b8c80fd5b84896041867f4e487b7100000000000000000000000000000000000000000000000000000000835252fd5b5082346105bf576101407ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc3601126105bf576110b03661152a565b91807fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7c360112610332576110e2611478565b67ffffffffffffffff93906101043585811161049f5761110590369086016115c1565b90936101243596871161032a57611125610bd1966102f6983691016115c1565b969095825190611134826113ff565b606482527f5065726d69745769746e6573735472616e7366657246726f6d28546f6b656e5060208301527f65726d697373696f6e73207065726d69747465642c6164647265737320737065848301527f6e6465722c75696e74323536206e6f6e63652c75696e7432353620646561646c60608301527f696e652c0000000000000000000000000000000000000000000000000000000060808301528351948591816111e3602085018096611f93565b918237018b8152039361121c7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe095868101835282611437565b5190209261122a8651612054565b6020878101518589015195519182019687526040820192909252336060820152608081019190915260a081019390935260e43560c08401528260e081016102e1565b5082346105bf576020807ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc36011261033257813567ffffffffffffffff92838211610bda5736602383011215610bda5781013592831161032e576024906007368386831b8401011161049f57865b8581106112e5578780f35b80821b83019060807fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffdc83360301126103265761139288876001946060835161132c81611398565b611368608461133c8d8601611509565b9485845261134c60448201611509565b809785015261135d60648201611509565b809885015201611509565b918291015273ffffffffffffffffffffffffffffffffffffffff80808093169516931691166117a1565b016112da565b6080810190811067ffffffffffffffff8211176113b457604052565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b6060810190811067ffffffffffffffff8211176113b457604052565b60a0810190811067ffffffffffffffff8211176113b457604052565b60c0810190811067ffffffffffffffff8211176113b457604052565b90601f7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0910116810190811067ffffffffffffffff8211176113b457604052565b60c4359073ffffffffffffffffffffffffffffffffffffffff8216820361149b57565b600080fd5b6004359073ffffffffffffffffffffffffffffffffffffffff8216820361149b57565b6024359073ffffffffffffffffffffffffffffffffffffffff8216820361149b57565b6044359073ffffffffffffffffffffffffffffffffffffffff8216820361149b57565b359073ffffffffffffffffffffffffffffffffffffffff8216820361149b57565b7ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc01906080821261149b576040805190611563826113e3565b8082941261149b57805181810181811067ffffffffffffffff8211176113b457825260043573ffffffffffffffffffffffffffffffffffffffff8116810361149b578152602435602082015282526044356020830152606435910152565b9181601f8401121561149b5782359167ffffffffffffffff831161149b576020838186019501011161149b57565b67ffffffffffffffff81116113b45760051b60200190565b359065ffffffffffff8216820361149b57565b9181601f8401121561149b5782359167ffffffffffffffff831161149b576020808501948460061b01011161149b57565b91909160608184031261149b576040805191611666836113e3565b8294813567ffffffffffffffff9081811161149b57830182601f8201121561149b578035611693816115ef565b926116a087519485611437565b818452602094858086019360061b8501019381851161149b579086899897969594939201925b8484106116e3575050505050855280820135908501520135910152565b90919293949596978483031261149b578851908982019082821085831117611730578a928992845261171487611509565b81528287013583820152815201930191908897969594936116c6565b602460007f4e487b710000000000000000000000000000000000000000000000000000000081526041600452fd5b80518210156117725760209160051b010190565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b92919273ffffffffffffffffffffffffffffffffffffffff604060008284168152600160205282828220961695868252602052818120338252602052209485549565ffffffffffff8760a01c16804211611884575082871696838803611812575b5050611810955016926118b5565b565b878484161160001461184f57602488604051907ff96fb0710000000000000000000000000000000000000000000000000000000082526004820152fd5b7fffffffffffffffffffffffff000000000000000000000000000000000000000084846118109a031691161790553880611802565b602490604051907fd81b2f2e0000000000000000000000000000000000000000000000000000000082526004820152fd5b9060006064926020958295604051947f23b872dd0000000000000000000000000000000000000000000000000000000086526004860152602485015260448401525af13d15601f3d116001600051141617161561190e57565b60646040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601460248201527f5452414e534645525f46524f4d5f4641494c45440000000000000000000000006044820152fd5b91908110156117725760061b0190565b3573ffffffffffffffffffffffffffffffffffffffff8116810361149b5790565b9065ffffffffffff908160608401511673ffffffffffffffffffffffffffffffffffffffff908185511694826020820151169280866040809401511695169560009187835260016020528383208984526020528383209916988983526020528282209184835460d01c03611af5579185611ace94927fc6a377bfc4eb120024a8ac08eef205be16b817020812c73223e81d1bdb9708ec98979694508715600014611ad35779ffffffffffff00000000000000000000000000000000000000009042165b60a01b167fffffffffffff00000000000000000000000000000000000000000000000000006001860160d01b1617179055519384938491604091949373ffffffffffffffffffffffffffffffffffffffff606085019616845265ffffffffffff809216602085015216910152565b0390a4565b5079ffffffffffff000000000000000000000000000000000000000087611a60565b600484517f756688fe000000000000000000000000000000000000000000000000000000008152fd5b467f000000000000000000000000000000000000000000000000000000000000000003611b69577f000000000000000000000000000000000000000000000000000000000000000090565b60405160208101907f8cad95687ba82c2ce50e74f7b754645e5117c3a5bec8151c0726d5857980a86682527f9ac997416e8ff9d2ff6bebeb7149f65cdae5e32e2b90440b566bb3044041d36a604082015246606082015230608082015260808152611bd3816113ff565b51902090565b611be1611b1e565b906040519060208201927f190100000000000000000000000000000000000000000000000000000000000084526022830152604282015260428152611bd381611398565b9192909360a435936040840151804211611cc65750602084510151808611611c955750918591610d78611c6594611c60602088015186611e47565b611bd9565b73ffffffffffffffffffffffffffffffffffffffff809151511692608435918216820361149b57611810936118b5565b602490604051907f3728b83d0000000000000000000000000000000000000000000000000000000082526004820152fd5b602490604051907fcd21db4f0000000000000000000000000000000000000000000000000000000082526004820152fd5b959093958051519560409283830151804211611e175750848803611dee57611d2e918691610d7860209b611c608d88015186611e47565b60005b868110611d42575050505050505050565b611d4d81835161175e565b5188611d5a83878a61196c565b01359089810151808311611dbe575091818888886001968596611d84575b50505050505001611d31565b611db395611dad9273ffffffffffffffffffffffffffffffffffffffff6105159351169561196c565b916118b5565b803888888883611d78565b6024908651907f3728b83d0000000000000000000000000000000000000000000000000000000082526004820152fd5b600484517fff633a38000000000000000000000000000000000000000000000000000000008152fd5b6024908551907fcd21db4f0000000000000000000000000000000000000000000000000000000082526004820152fd5b9073ffffffffffffffffffffffffffffffffffffffff600160ff83161b9216600052600060205260406000209060081c6000526020526040600020818154188091551615611e9157565b60046040517f756688fe000000000000000000000000000000000000000000000000000000008152fd5b90611ec5826115ef565b611ed26040519182611437565b8281527fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0611f0082946115ef565b0190602036910137565b7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff8114611f375760010190565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b805160208092019160005b828110611f7f575050505090565b835185529381019392810192600101611f71565b9081519160005b838110611fab575050016000815290565b8060208092840101518185015201611f9a565b60405160208101917f65626cad6cb96493bf6f5ebea28756c966f023ab9e8a83a7101849d5573b3678835273ffffffffffffffffffffffffffffffffffffffff8082511660408401526020820151166060830152606065ffffffffffff9182604082015116608085015201511660a082015260a0815260c0810181811067ffffffffffffffff8211176113b45760405251902090565b6040516020808201927f618358ac3db8dc274f0cd8829da7e234bd48cd73c4a740aede1adec9846d06a1845273ffffffffffffffffffffffffffffffffffffffff81511660408401520151606082015260608152611bd381611398565b919082604091031261149b576020823592013590565b6000843b61222e5750604182036121ac576120e4828201826120b1565b939092604010156117725760209360009360ff6040608095013560f81c5b60405194855216868401526040830152606082015282805260015afa156121a05773ffffffffffffffffffffffffffffffffffffffff806000511691821561217657160361214c57565b60046040517f815e1d64000000000000000000000000000000000000000000000000000000008152fd5b60046040517f8baa579f000000000000000000000000000000000000000000000000000000008152fd5b6040513d6000823e3d90fd5b60408203612204576121c0918101906120b1565b91601b7f7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff84169360ff1c019060ff8211611f375760209360009360ff608094612102565b60046040517f4be6321b000000000000000000000000000000000000000000000000000000008152fd5b929391601f928173ffffffffffffffffffffffffffffffffffffffff60646020957fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0604051988997889687947f1626ba7e000000000000000000000000000000000000000000000000000000009e8f8752600487015260406024870152816044870152868601378b85828601015201168101030192165afa9081156123a857829161232a575b507fffffffff000000000000000000000000000000000000000000000000000000009150160361230057565b60046040517fb0669cbc000000000000000000000000000000000000000000000000000000008152fd5b90506020813d82116123a0575b8161234460209383611437565b810103126103365751907fffffffff0000000000000000000000000000000000000000000000000000000082168203610a9a57507fffffffff0000000000000000000000000000000000000000000000000000000090386122d4565b3d9150612337565b6040513d84823e3d90fdfea164736f6c6343000811000a";
var isSuperArgs4 = (xs) => xs.length > 1;
var Permit2__factory = class extends ethers.ContractFactory {
  constructor(...args) {
    if (isSuperArgs4(args)) {
      super(...args);
    } else {
      super(_abi6, _bytecode4, args[0]);
    }
  }
  deploy(overrides) {
    return super.deploy(overrides || {});
  }
  getDeployTransaction(overrides) {
    return super.getDeployTransaction(overrides || {});
  }
  attach(address) {
    return super.attach(address);
  }
  connect(signer) {
    return super.connect(signer);
  }
  static createInterface() {
    return new ethers.utils.Interface(_abi6);
  }
  static connect(address, signerOrProvider) {
    return new ethers.Contract(address, _abi6, signerOrProvider);
  }
};
Permit2__factory.bytecode = _bytecode4;
Permit2__factory.abi = _abi6;
var _abi7 = [
  {
    type: "constructor",
    inputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "fallback",
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "owner",
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
    name: "setOwner",
    inputs: [
      {
        name: "_owner",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setTarget",
    inputs: [
      {
        name: "_target",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "target",
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
    type: "event",
    name: "ProxyOwnerChanged",
    inputs: [
      {
        name: "owner",
        type: "address",
        indexed: false,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ProxyTargetSet",
    inputs: [
      {
        name: "target",
        type: "address",
        indexed: false,
        internalType: "address"
      }
    ],
    anonymous: false
  }
];
var _bytecode5 = "0x6080604052348015600e575f80fd5b505f80546001600160a01b031916331790556102b38061002d5f395ff3fe608060405234801561000f575f80fd5b506004361061004a575f3560e01c806313af4035146100bd578063776d1a01146100d05780638da5cb5b146100e3578063d4b8399214610111575b6001546001600160a01b0316806100995760405162461bcd60e51b815260206004820152600e60248201526d15185c99d95d081b9bdd081cd95d60921b60448201526064015b60405180910390fd5b604051365f82375f803683855af43d805f843e8180156100b7578184f35b8184fd5b005b6100bb6100cb366004610250565b610124565b6100bb6100de366004610250565b6101bd565b5f546100f5906001600160a01b031681565b6040516001600160a01b03909116815260200160405180910390f35b6001546100f5906001600160a01b031681565b5f546001600160a01b031633146101695760405162461bcd60e51b81526020600482015260096024820152682737ba1037bbb732b960b91b6044820152606401610090565b5f80546001600160a01b0319166001600160a01b0383169081179091556040519081527fe543d3a077035cec99b732bad2c4cf1c0fdee02ddf561ae543106ccc31cf35a3906020015b60405180910390a150565b5f546001600160a01b031633146102025760405162461bcd60e51b81526020600482015260096024820152682737ba1037bbb732b960b91b6044820152606401610090565b600180546001600160a01b0319166001600160a01b0383169081179091556040519081527ff1b1e874978309afba903baec19abf568b0337fcedc05dde58cfea25ec25b94d906020016101b2565b5f60208284031215610260575f80fd5b81356001600160a01b0381168114610276575f80fd5b939250505056fea26469706673582212209927617c4c48e469a09ba0687a3588e871b87639ce58ca1e9834cfa89ff06e5464736f6c634300081a0033";
var isSuperArgs5 = (xs) => xs.length > 1;
var Proxy__factory = class extends ethers.ContractFactory {
  constructor(...args) {
    if (isSuperArgs5(args)) {
      super(...args);
    } else {
      super(_abi7, _bytecode5, args[0]);
    }
  }
  deploy(overrides) {
    return super.deploy(overrides || {});
  }
  getDeployTransaction(overrides) {
    return super.getDeployTransaction(overrides || {});
  }
  attach(address) {
    return super.attach(address);
  }
  connect(signer) {
    return super.connect(signer);
  }
  static createInterface() {
    return new ethers.utils.Interface(_abi7);
  }
  static connect(address, signerOrProvider) {
    return new ethers.Contract(address, _abi7, signerOrProvider);
  }
};
Proxy__factory.bytecode = _bytecode5;
Proxy__factory.abi = _abi7;
var _abi8 = [
  {
    type: "constructor",
    inputs: [
      {
        name: "_universalRouter",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "PERMIT2",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract IPermit2"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "execute",
    inputs: [
      {
        name: "signedOrder",
        type: "tuple",
        internalType: "struct SignedOrder",
        components: [
          {
            name: "order",
            type: "bytes",
            internalType: "bytes"
          },
          {
            name: "sig",
            type: "bytes",
            internalType: "bytes"
          }
        ]
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "execute",
    inputs: [
      {
        name: "signedOrder",
        type: "tuple",
        internalType: "struct SignedOrder",
        components: [
          {
            name: "order",
            type: "bytes",
            internalType: "bytes"
          },
          {
            name: "sig",
            type: "bytes",
            internalType: "bytes"
          }
        ]
      },
      {
        name: "feeRecipient",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
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
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "permit",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "contract ERC20"
      },
      {
        name: "owner",
        type: "address",
        internalType: "address"
      },
      {
        name: "spender",
        type: "address",
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "deadline",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "v",
        type: "uint8",
        internalType: "uint8"
      },
      {
        name: "r",
        type: "bytes32",
        internalType: "bytes32"
      },
      {
        name: "s",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "universalRouter",
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
    type: "event",
    name: "Relay",
    inputs: [
      {
        name: "orderHash",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32"
      },
      {
        name: "filler",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "swapper",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "nonce",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "error",
    name: "DeadlineBeforeEndTime",
    inputs: []
  },
  {
    type: "error",
    name: "EndTimeBeforeStartTime",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidAmounts",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidReactor",
    inputs: []
  },
  {
    type: "error",
    name: "UnsafeCast",
    inputs: []
  }
];
var _bytecode6 = "0x60a060405234801561001057600080fd5b506040516200245b3803806200245b83398101604081905261003191610042565b6001600160a01b0316608052610072565b60006020828403121561005457600080fd5b81516001600160a01b038116811461006b57600080fd5b9392505050565b6080516123c76200009460003960008181607c01526102f701526123c76000f3fe608060405234801561001057600080fd5b50600436106100725760003560e01c8063ac9650d811610050578063ac9650d8146100f3578063d339056d14610113578063e956bbdf1461012657600080fd5b806335a9e4df146100775780633f62192e146100c85780636afdd850146100dd575b600080fd5b61009e7f000000000000000000000000000000000000000000000000000000000000000081565b60405173ffffffffffffffffffffffffffffffffffffffff90911681526020015b60405180910390f35b6100db6100d636600461198b565b610139565b005b61009e6e22d473030f116ddee9f6b43ac78ba381565b6101066101013660046119c0565b610146565b6040516100bf9190611aa3565b6100db610121366004611b47565b610259565b6100db610134366004611bd0565b610289565b6101438133610289565b50565b60608167ffffffffffffffff81111561016157610161611c22565b60405190808252806020026020018201604052801561019457816020015b606081526020019060019003908161017f5790505b50905060005b8281101561025257600080308686858181106101b8576101b8611c51565b90506020028101906101ca9190611c80565b6040516101d8929190611cec565b600060405180830381855af49150503d8060008114610213576040519150601f19603f3d011682016040523d82523d6000602084013e610218565b606091505b50915091508161022a57805160208201fd5b8084848151811061023d5761023d611c51565b6020908102919091010152505060010161019a565b5092915050565b61027f73ffffffffffffffffffffffffffffffffffffffff8916888888888888886103f4565b5050505050505050565b60006102958380611c80565b8101906102a29190611eb6565b90506102ad81610731565b60006102b8826107c9565b90506102e7816e22d473030f116ddee9f6b43ac78ba3856102dc6020890189611c80565b879493929190610b9d565b60608201515115610395576000807f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff16846060015160405161033e9190611fa3565b6000604051808303816000865af19150503d806000811461037b576040519150601f19603f3d011682016040523d82523d6000602084013e610380565b606091505b50915091508161039257805160208201fd5b50505b8151602080820151604092830151925192835273ffffffffffffffffffffffffffffffffffffffff1691339184917fbdc51d356193695661ad4ba75c0bfa57f277fdefd271d6267cf74dc93f1c86d3910160405180910390a450505050565b6040805160048152602481019091526020810180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff167f3644e5150000000000000000000000000000000000000000000000000000000017905260008073ffffffffffffffffffffffffffffffffffffffff8b1673c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2146104a157602060008451602086018e611388fa60203d1460005115151616915060005190505b811561070f577fdbb8cf42e1ecb028be3f3dbc922e1d878b963f411dc388ced501601c60f7c6f781146105995760405173ffffffffffffffffffffffffffffffffffffffff808c1660248301528a166044820152606481018990526084810188905260ff871660a482015260c4810186905260e4810185905261010401604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08184030181529190526020810180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff167fd505accf000000000000000000000000000000000000000000000000000000001790526106fc565b6040517f7ecebe0000000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff808c1660048301528b918b918e1690637ecebe0090602401602060405180830381865afa158015610609573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061062d9190611fbf565b60405173ffffffffffffffffffffffffffffffffffffffff9384166024820152929091166044830152606482015260848101889052600160a482015260ff871660c482015260e48101869052610104810185905261012401604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08184030181529190526020810180517bffffffffffffffffffffffffffffffffffffffffffffffffffffffff167f8fcbaf0c000000000000000000000000000000000000000000000000000000001790525b925060008084516020860160008f5af191505b81610724576107248b8b8b8b8b8b8b8b611011565b5050505050505050505050565b6040810151608001518151606001511015610778576040517f773a618700000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b80515173ffffffffffffffffffffffffffffffffffffffff163014610143576040517f4ddf4a6400000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b604080517f52656c61794f726465722800000000000000000000000000000000000000000060208201527f52656c61794f72646572496e666f20696e666f2c000000000000000000000000602b8201527f496e70757420696e7075742c0000000000000000000000000000000000000000603f8201527f466565457363616c61746f72206665652c000000000000000000000000000000604b8201527f627974657320756e6976657273616c526f7574657243616c6c64617461290000605c8201528151605a818303018152607a820183527f466565457363616c61746f722800000000000000000000000000000000000000609a8301527f6164647265737320746f6b656e2c00000000000000000000000000000000000060a783018190527f75696e74323536207374617274416d6f756e742c00000000000000000000000060b58401527f75696e7432353620656e64416d6f756e742c000000000000000000000000000060c98401527f75696e7432353620737461727454696d652c000000000000000000000000000060db8401527f75696e7432353620656e6454696d65290000000000000000000000000000000060ed840152835160dd81850301815260fd840185527f496e70757428000000000000000000000000000000000000000000000000000061011d8501526101238401919091527f75696e7432353620616d6f756e742c00000000000000000000000000000000006101318401527f6164647265737320726563697069656e742900000000000000000000000000006101408401528351610132818503018152610152840185527f52656c61794f72646572496e666f2800000000000000000000000000000000006101728501527f616464726573732072656163746f722c000000000000000000000000000000006101818501527f6164647265737320737761707065722c000000000000000000000000000000006101918501527f75696e74323536206e6f6e63652c0000000000000000000000000000000000006101a18501527f75696e7432353620646561646c696e65290000000000000000000000000000006101af85015284516101a08186030181526101c08501909552600094610b07946101e001611fd8565b60405160208183030381529060405280519060200120610b2a8360000151611214565b610b378460200151611361565b610b44856040015161147b565b60608601518051602091820120604051610b80969594939201948552602085019390935260408401919091526060830152608082015260a00190565b604051602081830303815290604052805190602001209050919050565b6000610ba8876115fa565b90506000610bb68886611700565b90508573ffffffffffffffffffffffffffffffffffffffff1663fe8ec1a760405180606001604052808581526020018b600001516040015181526020018b6000015160600151815250838b60000151602001518b604051602001610cfb907f466565457363616c61746f72280000000000000000000000000000000000000081527f6164647265737320746f6b656e2c000000000000000000000000000000000000600d8201527f75696e74323536207374617274416d6f756e742c000000000000000000000000601b8201527f75696e7432353620656e64416d6f756e742c0000000000000000000000000000602f8201527f75696e7432353620737461727454696d652c000000000000000000000000000060418201527f75696e7432353620656e6454696d652900000000000000000000000000000000605382015260630190565b604080518083037fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe00181528282527f496e70757428000000000000000000000000000000000000000000000000000060208401527f6164647265737320746f6b656e2c00000000000000000000000000000000000060268401527f75696e7432353620616d6f756e742c000000000000000000000000000000000060348401527f6164647265737320726563697069656e742900000000000000000000000000006043840152815160358185030181526055840183527f52656c61794f726465722800000000000000000000000000000000000000000060758501527f52656c61794f72646572496e666f20696e666f2c00000000000000000000000060808501527f496e70757420696e7075742c000000000000000000000000000000000000000060948501527f466565457363616c61746f72206665652c00000000000000000000000000000060a08501527f627974657320756e6976657273616c526f7574657243616c6c6461746129000060b1850152825160af81860301815260cf850184527f52656c61794f72646572496e666f28000000000000000000000000000000000060ef8601527f616464726573732072656163746f722c0000000000000000000000000000000060fe8601527f6164647265737320737761707065722c0000000000000000000000000000000061010e8601527f75696e74323536206e6f6e63652c00000000000000000000000000000000000061011e8601527f75696e7432353620646561646c696e652900000000000000000000000000000061012c860152835161011d81870301815261019d8601909452602e61013d860181815293959294919391926123649061015d0139604051602001610fa295949392919061202f565b6040516020818303038152906040528a8a6040518863ffffffff1660e01b8152600401610fd59796959493929190612179565b600060405180830381600087803b158015610fef57600080fd5b505af1158015611003573d6000803e3d6000fd5b505050505050505050505050565b6040517f927da10500000000000000000000000000000000000000000000000000000000815273ffffffffffffffffffffffffffffffffffffffff8089166004830152808a166024830152871660448201526000906e22d473030f116ddee9f6b43ac78ba39063927da10590606401606060405180830381865afa15801561109d573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906110c19190612292565b925050506e22d473030f116ddee9f6b43ac78ba373ffffffffffffffffffffffffffffffffffffffff16632b67b57089604051806060016040528060405180608001604052808f73ffffffffffffffffffffffffffffffffffffffff16815260200161112c8d6117cb565b73ffffffffffffffffffffffffffffffffffffffff908116825265ffffffffffff6020808401829052908a166040938401529284528e16838301529182018b905281519081018990529081018790527fff0000000000000000000000000000000000000000000000000000000000000060f88a901b1660608201526061016040516020818303038152906040526040518463ffffffff1660e01b81526004016111d7939291906122d7565b600060405180830381600087803b1580156111f157600080fd5b505af1158015611205573d6000803e3d6000fd5b50505050505050505050505050565b6040517f52656c61794f72646572496e666f28000000000000000000000000000000000060208201527f616464726573732072656163746f722c00000000000000000000000000000000602f8201527f6164647265737320737761707065722c00000000000000000000000000000000603f8201527f75696e74323536206e6f6e63652c000000000000000000000000000000000000604f8201527f75696e7432353620646561646c696e6529000000000000000000000000000000605d820152600090606e01604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08184030181528282528051602091820120855186830151878501516060808a01519588019490945273ffffffffffffffffffffffffffffffffffffffff928316958701959095521690840152608083019190915260a082015260c001610b80565b6040517f496e70757428000000000000000000000000000000000000000000000000000060208201527f6164647265737320746f6b656e2c00000000000000000000000000000000000060268201527f75696e7432353620616d6f756e742c000000000000000000000000000000000060348201527f6164647265737320726563697069656e742900000000000000000000000000006043820152600090605501604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08184030181528282528051602091820120855186830151878501519386019290925273ffffffffffffffffffffffffffffffffffffffff90811693850193909352606084015216608082015260a001610b80565b6040517f466565457363616c61746f72280000000000000000000000000000000000000060208201527f6164647265737320746f6b656e2c000000000000000000000000000000000000602d8201527f75696e74323536207374617274416d6f756e742c000000000000000000000000603b8201527f75696e7432353620656e64416d6f756e742c0000000000000000000000000000604f8201527f75696e7432353620737461727454696d652c000000000000000000000000000060618201527f75696e7432353620656e6454696d6529000000000000000000000000000000006073820152600090608301604080517fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe08184030181528282528051602091820120855186830151878501516060808a01516080808c0151978a019690965273ffffffffffffffffffffffffffffffffffffffff90941696880196909652948601529084019290925260a083019190915260c082015260e001610b80565b6040805160028082526060828101909352816020015b6040805180820190915260008082526020820152815260200190600190039081611610579050509050604051806040016040528083602001516000015173ffffffffffffffffffffffffffffffffffffffff1681526020018360200151602001518152508160008151811061168757611687611c51565b60200260200101819052506116dd8260400151604080518082019091526000808252602082015250604080518082018252825173ffffffffffffffffffffffffffffffffffffffff168152910151602082015290565b816001815181106116f0576116f0611c51565b6020026020010181905250919050565b6040805160028082526060828101909352816020015b6040805180820190915260008082526020820152815260200190600190039081611716579050509050604051806040016040528084602001516040015173ffffffffffffffffffffffffffffffffffffffff1681526020018460200151602001518152508160008151811061178d5761178d611c51565b602090810291909101015260408301516117a7908361181f565b816001815181106117ba576117ba611c51565b602002602001018190525092915050565b600073ffffffffffffffffffffffffffffffffffffffff82111561181b576040517fc4bd89a900000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b5090565b604080518082019091526000808252602082015260006118518460200151856040015186606001518760800151611882565b6040805180820190915273ffffffffffffffffffffffffffffffffffffffff90941684526020840152509092915050565b6000838511156118be576040517fd856fc5a00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b828210156118f8576040517f4313345300000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b42821161190657508261192f565b42831061191457508361192f565b428390038383036119288787038383611937565b8701925050505b949350505050565b6000827fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff048411830215820261196c57600080fd5b5091020490565b60006040828403121561198557600080fd5b50919050565b60006020828403121561199d57600080fd5b813567ffffffffffffffff8111156119b457600080fd5b61192f84828501611973565b600080602083850312156119d357600080fd5b823567ffffffffffffffff808211156119eb57600080fd5b818501915085601f8301126119ff57600080fd5b813581811115611a0e57600080fd5b8660208260051b8501011115611a2357600080fd5b60209290920196919550909350505050565b60005b83811015611a50578181015183820152602001611a38565b50506000910152565b60008151808452611a71816020860160208601611a35565b601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0169290920160200192915050565b600060208083016020845280855180835260408601915060408160051b87010192506020870160005b82811015611b18577fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc0888603018452611b06858351611a59565b94509285019290850190600101611acc565b5092979650505050505050565b73ffffffffffffffffffffffffffffffffffffffff8116811461014357600080fd5b600080600080600080600080610100898b031215611b6457600080fd5b8835611b6f81611b25565b97506020890135611b7f81611b25565b96506040890135611b8f81611b25565b9550606089013594506080890135935060a089013560ff81168114611bb357600080fd5b979a969950949793969295929450505060c08201359160e0013590565b60008060408385031215611be357600080fd5b823567ffffffffffffffff811115611bfa57600080fd5b611c0685828601611973565b9250506020830135611c1781611b25565b809150509250929050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b60008083357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe1843603018112611cb557600080fd5b83018035915067ffffffffffffffff821115611cd057600080fd5b602001915036819003821315611ce557600080fd5b9250929050565b8183823760009101908152919050565b6040516080810167ffffffffffffffff81118282101715611d1f57611d1f611c22565b60405290565b600060608284031215611d3757600080fd5b6040516060810181811067ffffffffffffffff82111715611d5a57611d5a611c22565b6040529050808235611d6b81611b25565b8152602083810135908201526040830135611d8581611b25565b6040919091015292915050565b600060a08284031215611da457600080fd5b60405160a0810181811067ffffffffffffffff82111715611dc757611dc7611c22565b6040529050808235611dd881611b25565b80825250602083013560208201526040830135604082015260608301356060820152608083013560808201525092915050565b600082601f830112611e1c57600080fd5b813567ffffffffffffffff80821115611e3757611e37611c22565b604051601f83017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0908116603f01168101908282118183101715611e7d57611e7d611c22565b81604052838152866020858801011115611e9657600080fd5b836020870160208301376000602085830101528094505050505092915050565b600060208284031215611ec857600080fd5b813567ffffffffffffffff80821115611ee057600080fd5b908301908185036101a0811215611ef657600080fd5b611efe611cfc565b6080821215611f0c57600080fd5b611f14611cfc565b91508335611f2181611b25565b82526020840135611f3181611b25565b806020840152506040840135604083015260608401356060830152818152611f5c8760808601611d25565b6020820152611f6e8760e08601611d92565b6040820152610180840135915082821115611f8857600080fd5b611f9487838601611e0b565b60608201529695505050505050565b60008251611fb5818460208701611a35565b9190910192915050565b600060208284031215611fd157600080fd5b5051919050565b60008551611fea818460208a01611a35565b855190830190611ffe818360208a01611a35565b8551910190612011818360208901611a35565b8451910190612024818360208801611a35565b019695505050505050565b7f52656c61794f72646572207769746e657373290000000000000000000000000081526000601387516120688183860160208c01611a35565b87519084019061207e8184840160208c01611a35565b87519101906120938184840160208b01611a35565b86519101906120a88184840160208a01611a35565b85519101906120bd8184840160208901611a35565b0101979650505050505050565b60008151808452602080850194506020840160005b8381101561212557612112878351805173ffffffffffffffffffffffffffffffffffffffff168252602090810151910152565b60409690960195908201906001016120df565b509495945050505050565b8183528181602085013750600060208284010152600060207fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0601f840116840101905092915050565b60c08152600061012082018951606060c0850152818151808452610140860191506020935060208301925060005b818110156121ed576121da838551805173ffffffffffffffffffffffffffffffffffffffff168252602090810151910152565b92840192604092909201916001016121a7565b505060208c015160e086015260408c01516101008601528481036020860152612216818c6120ca565b9250505061223c604084018973ffffffffffffffffffffffffffffffffffffffff169052565b86606084015282810360808401526122548187611a59565b905082810360a0840152612269818587612130565b9a9950505050505050505050565b805165ffffffffffff8116811461228d57600080fd5b919050565b6000806000606084860312156122a757600080fd5b83516122b281611b25565b92506122c060208501612277565b91506122ce60408501612277565b90509250925092565b600061010073ffffffffffffffffffffffffffffffffffffffff80871684528551818151166020860152816020820151166040860152604081015165ffffffffffff80821660608801528060608401511660808801525050508060208701511660a085015250604085015160c08401528060e084015261235981840185611a59565b969550505050505056fe546f6b656e5065726d697373696f6e73286164647265737320746f6b656e2c75696e7432353620616d6f756e7429a26469706673582212201cafb3c3b5e4b86a59d3230671eb354f0497fab4750ee1d1c44b660c904448dc64736f6c63430008180033";
var isSuperArgs6 = (xs) => xs.length > 1;
var RelayOrderReactor__factory = class extends ethers.ContractFactory {
  constructor(...args) {
    if (isSuperArgs6(args)) {
      super(...args);
    } else {
      super(_abi8, _bytecode6, args[0]);
    }
  }
  deploy(_universalRouter, overrides) {
    return super.deploy(
      _universalRouter,
      overrides || {}
    );
  }
  getDeployTransaction(_universalRouter, overrides) {
    return super.getDeployTransaction(_universalRouter, overrides || {});
  }
  attach(address) {
    return super.attach(address);
  }
  connect(signer) {
    return super.connect(signer);
  }
  static createInterface() {
    return new ethers.utils.Interface(_abi8);
  }
  static connect(address, signerOrProvider) {
    return new ethers.Contract(address, _abi8, signerOrProvider);
  }
};
RelayOrderReactor__factory.bytecode = _bytecode6;
RelayOrderReactor__factory.abi = _abi8;
var _abi9 = [
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "target",
            type: "address"
          },
          {
            internalType: "bytes",
            name: "callData",
            type: "bytes"
          }
        ],
        internalType: "struct Multicall2.Call[]",
        name: "calls",
        type: "tuple[]"
      }
    ],
    name: "aggregate",
    outputs: [
      {
        internalType: "uint256",
        name: "blockNumber",
        type: "uint256"
      },
      {
        internalType: "bytes[]",
        name: "returnData",
        type: "bytes[]"
      }
    ],
    payable: false,
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "target",
            type: "address"
          },
          {
            internalType: "bytes",
            name: "callData",
            type: "bytes"
          }
        ],
        internalType: "struct Multicall2.Call[]",
        name: "calls",
        type: "tuple[]"
      }
    ],
    name: "blockAndAggregate",
    outputs: [
      {
        internalType: "uint256",
        name: "blockNumber",
        type: "uint256"
      },
      {
        internalType: "bytes32",
        name: "blockHash",
        type: "bytes32"
      },
      {
        components: [
          {
            internalType: "bool",
            name: "success",
            type: "bool"
          },
          {
            internalType: "bytes",
            name: "returnData",
            type: "bytes"
          }
        ],
        internalType: "struct Multicall2.Result[]",
        name: "returnData",
        type: "tuple[]"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "blockNumber",
        type: "uint256"
      }
    ],
    name: "getBlockHash",
    outputs: [
      {
        internalType: "bytes32",
        name: "blockHash",
        type: "bytes32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getBlockNumber",
    outputs: [
      {
        internalType: "uint256",
        name: "blockNumber",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getCurrentBlockCoinbase",
    outputs: [
      {
        internalType: "address",
        name: "coinbase",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getCurrentBlockDifficulty",
    outputs: [
      {
        internalType: "uint256",
        name: "difficulty",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getCurrentBlockGasLimit",
    outputs: [
      {
        internalType: "uint256",
        name: "gaslimit",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getCurrentBlockTimestamp",
    outputs: [
      {
        internalType: "uint256",
        name: "timestamp",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "addr",
        type: "address"
      }
    ],
    name: "getEthBalance",
    outputs: [
      {
        internalType: "uint256",
        name: "balance",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getLastBlockHash",
    outputs: [
      {
        internalType: "bytes32",
        name: "blockHash",
        type: "bytes32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "bool",
        name: "requireSuccess",
        type: "bool"
      },
      {
        components: [
          {
            internalType: "address",
            name: "target",
            type: "address"
          },
          {
            internalType: "bytes",
            name: "callData",
            type: "bytes"
          }
        ],
        internalType: "struct Multicall2.Call[]",
        name: "calls",
        type: "tuple[]"
      }
    ],
    name: "tryAggregate",
    outputs: [
      {
        components: [
          {
            internalType: "bool",
            name: "success",
            type: "bool"
          },
          {
            internalType: "bytes",
            name: "returnData",
            type: "bytes"
          }
        ],
        internalType: "struct Multicall2.Result[]",
        name: "returnData",
        type: "tuple[]"
      }
    ],
    payable: false,
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "bool",
        name: "requireSuccess",
        type: "bool"
      },
      {
        components: [
          {
            internalType: "address",
            name: "target",
            type: "address"
          },
          {
            internalType: "bytes",
            name: "callData",
            type: "bytes"
          }
        ],
        internalType: "struct Multicall2.Call[]",
        name: "calls",
        type: "tuple[]"
      }
    ],
    name: "tryBlockAndAggregate",
    outputs: [
      {
        internalType: "uint256",
        name: "blockNumber",
        type: "uint256"
      },
      {
        internalType: "bytes32",
        name: "blockHash",
        type: "bytes32"
      },
      {
        components: [
          {
            internalType: "bool",
            name: "success",
            type: "bool"
          },
          {
            internalType: "bytes",
            name: "returnData",
            type: "bytes"
          }
        ],
        internalType: "struct Multicall2.Result[]",
        name: "returnData",
        type: "tuple[]"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  }
];
var Multicall2__factory = class {
  static createInterface() {
    return new ethers.utils.Interface(_abi9);
  }
  static connect(address, signerOrProvider) {
    return new ethers.Contract(address, _abi9, signerOrProvider);
  }
};
Multicall2__factory.abi = _abi9;
var NonceManager = class {
  constructor(provider, chainId, permit2Address) {
    this.provider = provider;
    if (permit2Address) {
      this.permit2 = Permit2__factory.connect(permit2Address, provider);
    } else if (PERMIT2_MAPPING[chainId]) {
      this.permit2 = Permit2__factory.connect(
        PERMIT2_MAPPING[chainId],
        this.provider
      );
    } else {
      throw new MissingConfiguration("permit2", chainId.toString());
    }
    this.currentWord = /* @__PURE__ */ new Map();
    this.currentBitmap = /* @__PURE__ */ new Map();
  }
  /**
   * Finds the next unused nonce and returns it
   * Marks the nonce as used so it won't be returned again from this instance
   * NOTE: if any nonce usages are in-flight and created outside of this instance,
   * this function will not know about them and will return duplicates
   */
  async useNonce(address) {
    const { word, bitmap } = await this.getNextOpenWord(address);
    const bitPos = getFirstUnsetBit(bitmap);
    this.currentWord.set(address, word);
    this.currentBitmap.set(address, setBit(bitmap, bitPos));
    return buildNonce(word, bitPos);
  }
  async isUsed(address, nonce) {
    const { word, bitPos } = splitNonce(nonce);
    const bitmap = await this.permit2.nonceBitmap(address, word);
    return bitmap.div(ethers.BigNumber.from(2).pow(bitPos)).mod(2).eq(1);
  }
  // Returns the first word that contains empty bits
  async getNextOpenWord(address) {
    let currentWord = this.currentWord.get(address) || ethers.BigNumber.from(0);
    let bitmap = this.currentBitmap.get(address) || await this.permit2.nonceBitmap(address, currentWord);
    while (bitmap.eq(ethers.ethers.constants.MaxUint256)) {
      currentWord = currentWord.add(1);
      bitmap = await this.permit2.nonceBitmap(address, currentWord);
    }
    return {
      word: currentWord,
      bitmap
    };
  }
};
function splitNonce(nonce) {
  const word = nonce.div(256);
  const bitPos = nonce.mod(256);
  return { word, bitPos };
}
function buildNonce(word, bitPos) {
  const shiftedWord = word.mul(256);
  return shiftedWord.add(bitPos);
}
function getFirstUnsetBit(bitmap) {
  for (let i = 0; i < 256; i++) {
    if (bitmap.div(ethers.BigNumber.from(2).pow(i)).mod(2).eq(0)) {
      return i;
    }
  }
  return -1;
}
function setBit(bitmap, bitPos) {
  const mask = ethers.BigNumber.from(2).pow(bitPos);
  if (bitmap.div(mask).mod(2).eq(1)) {
    return bitmap;
  }
  return bitmap.add(mask);
}
function getCancelSingleParams(nonceToCancel) {
  const { word, bitPos } = splitNonce(nonceToCancel);
  const mask = ethers.BigNumber.from(2).pow(bitPos);
  return { word, mask };
}
function getCancelMultipleParams(noncesToCancel) {
  const splitNonces = noncesToCancel.map(splitNonce);
  const splitNoncesByWord = {};
  splitNonces.forEach((splitNonce2) => {
    const word = splitNonce2.word.toString();
    if (!splitNoncesByWord[word]) {
      splitNoncesByWord[word] = [];
    }
    splitNoncesByWord[word].push(splitNonce2);
  });
  return Object.entries(splitNoncesByWord).map(([word, splitNonce2]) => {
    let mask = ethers.BigNumber.from(0);
    splitNonce2.forEach((splitNonce3) => {
      mask = mask.or(ethers.BigNumber.from(2).pow(splitNonce3.bitPos));
    });
    return { word: ethers.BigNumber.from(word), mask };
  });
}

// src/uniswapx/abis/deploylessMulticall2.json
var deploylessMulticall2_default = [
  {
    inputs: [
      {
        internalType: "bool",
        name: "requireSuccess",
        type: "bool"
      },
      {
        components: [
          {
            internalType: "address",
            name: "target",
            type: "address"
          },
          {
            internalType: "bytes",
            name: "callData",
            type: "bytes"
          }
        ],
        internalType: "struct DeploylessMulticall2.Call[]",
        name: "calls",
        type: "tuple[]"
      }
    ],
    stateMutability: "nonpayable",
    type: "constructor"
  }
];

// src/uniswapx/abis/multicall2.json
var multicall2_default = [
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "target",
            type: "address"
          },
          {
            internalType: "bytes",
            name: "callData",
            type: "bytes"
          }
        ],
        internalType: "struct Multicall2.Call[]",
        name: "calls",
        type: "tuple[]"
      }
    ],
    name: "aggregate",
    outputs: [
      {
        internalType: "uint256",
        name: "blockNumber",
        type: "uint256"
      },
      {
        internalType: "bytes[]",
        name: "returnData",
        type: "bytes[]"
      }
    ],
    payable: false,
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "address",
            name: "target",
            type: "address"
          },
          {
            internalType: "bytes",
            name: "callData",
            type: "bytes"
          }
        ],
        internalType: "struct Multicall2.Call[]",
        name: "calls",
        type: "tuple[]"
      }
    ],
    name: "blockAndAggregate",
    outputs: [
      {
        internalType: "uint256",
        name: "blockNumber",
        type: "uint256"
      },
      {
        internalType: "bytes32",
        name: "blockHash",
        type: "bytes32"
      },
      {
        components: [
          {
            internalType: "bool",
            name: "success",
            type: "bool"
          },
          {
            internalType: "bytes",
            name: "returnData",
            type: "bytes"
          }
        ],
        internalType: "struct Multicall2.Result[]",
        name: "returnData",
        type: "tuple[]"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "blockNumber",
        type: "uint256"
      }
    ],
    name: "getBlockHash",
    outputs: [
      {
        internalType: "bytes32",
        name: "blockHash",
        type: "bytes32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getBlockNumber",
    outputs: [
      {
        internalType: "uint256",
        name: "blockNumber",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getCurrentBlockCoinbase",
    outputs: [
      {
        internalType: "address",
        name: "coinbase",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getCurrentBlockDifficulty",
    outputs: [
      {
        internalType: "uint256",
        name: "difficulty",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getCurrentBlockGasLimit",
    outputs: [
      {
        internalType: "uint256",
        name: "gaslimit",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getCurrentBlockTimestamp",
    outputs: [
      {
        internalType: "uint256",
        name: "timestamp",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "addr",
        type: "address"
      }
    ],
    name: "getEthBalance",
    outputs: [
      {
        internalType: "uint256",
        name: "balance",
        type: "uint256"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getLastBlockHash",
    outputs: [
      {
        internalType: "bytes32",
        name: "blockHash",
        type: "bytes32"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "bool",
        name: "requireSuccess",
        type: "bool"
      },
      {
        components: [
          {
            internalType: "address",
            name: "target",
            type: "address"
          },
          {
            internalType: "bytes",
            name: "callData",
            type: "bytes"
          }
        ],
        internalType: "struct Multicall2.Call[]",
        name: "calls",
        type: "tuple[]"
      }
    ],
    name: "tryAggregate",
    outputs: [
      {
        components: [
          {
            internalType: "bool",
            name: "success",
            type: "bool"
          },
          {
            internalType: "bytes",
            name: "returnData",
            type: "bytes"
          }
        ],
        internalType: "struct Multicall2.Result[]",
        name: "returnData",
        type: "tuple[]"
      }
    ],
    payable: false,
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "bool",
        name: "requireSuccess",
        type: "bool"
      },
      {
        components: [
          {
            internalType: "address",
            name: "target",
            type: "address"
          },
          {
            internalType: "bytes",
            name: "callData",
            type: "bytes"
          }
        ],
        internalType: "struct Multicall2.Call[]",
        name: "calls",
        type: "tuple[]"
      }
    ],
    name: "tryBlockAndAggregate",
    outputs: [
      {
        internalType: "uint256",
        name: "blockNumber",
        type: "uint256"
      },
      {
        internalType: "bytes32",
        name: "blockHash",
        type: "bytes32"
      },
      {
        components: [
          {
            internalType: "bool",
            name: "success",
            type: "bool"
          },
          {
            internalType: "bytes",
            name: "returnData",
            type: "bytes"
          }
        ],
        internalType: "struct Multicall2.Result[]",
        name: "returnData",
        type: "tuple[]"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  }
];

// src/uniswapx/utils/multicall.ts
var DEPLOYLESS_MULTICALL_BYTECODE = "0x608060405234801561001057600080fd5b5060405161087538038061087583398181016040528101906100329190610666565b6000815167ffffffffffffffff81111561004f5761004e610358565b5b60405190808252806020026020018201604052801561008857816020015b6100756102da565b81526020019060019003908161006d5790505b50905060005b82518110156101d3576000808483815181106100ad576100ac6106c2565b5b60200260200101516000015173ffffffffffffffffffffffffffffffffffffffff168584815181106100e2576100e16106c2565b5b6020026020010151602001516040516100fb9190610738565b6000604051808303816000865af19150503d8060008114610138576040519150601f19603f3d011682016040523d82523d6000602084013e61013d565b606091505b509150915085156101895781610188576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161017f906107d2565b60405180910390fd5b5b60405180604001604052808315158152602001828152508484815181106101b3576101b26106c2565b5b6020026020010181905250505080806101cb9061082b565b91505061008e565b50602081516040028260405103030160408160405103036001835111156102535760005b8351811015610251578060200260208501018160200260400183018261021f57855160200281525b6000831115610244576020808303510151602083510151038060208303510180835250505b50506001810190506101f7565b505b60005b8351811015610281578060200260208501018051516040602083510151035250600181019050610256565b5060005b83518110156102ae57806020026020850101604060208083510151035250600181019050610285565b506001835114156102cb5760208301604082018451602002815250505b60208152825160208201528181f35b6040518060400160405280600015158152602001606081525090565b6000604051905090565b600080fd5b600080fd5b60008115159050919050565b61031f8161030a565b811461032a57600080fd5b50565b60008151905061033c81610316565b92915050565b600080fd5b6000601f19601f8301169050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b61039082610347565b810181811067ffffffffffffffff821117156103af576103ae610358565b5b80604052505050565b60006103c26102f6565b90506103ce8282610387565b919050565b600067ffffffffffffffff8211156103ee576103ed610358565b5b602082029050602081019050919050565b600080fd5b600080fd5b600080fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006104398261040e565b9050919050565b6104498161042e565b811461045457600080fd5b50565b60008151905061046681610440565b92915050565b600080fd5b600067ffffffffffffffff82111561048c5761048b610358565b5b61049582610347565b9050602081019050919050565b60005b838110156104c05780820151818401526020810190506104a5565b838111156104cf576000848401525b50505050565b60006104e86104e384610471565b6103b8565b9050828152602081018484840111156105045761050361046c565b5b61050f8482856104a2565b509392505050565b600082601f83011261052c5761052b610342565b5b815161053c8482602086016104d5565b91505092915050565b60006040828403121561055b5761055a610404565b5b61056560406103b8565b9050600061057584828501610457565b600083015250602082015167ffffffffffffffff81111561059957610598610409565b5b6105a584828501610517565b60208301525092915050565b60006105c46105bf846103d3565b6103b8565b905080838252602082019050602084028301858111156105e7576105e66103ff565b5b835b8181101561062e57805167ffffffffffffffff81111561060c5761060b610342565b5b8086016106198982610545565b855260208501945050506020810190506105e9565b5050509392505050565b600082601f83011261064d5761064c610342565b5b815161065d8482602086016105b1565b91505092915050565b6000806040838503121561067d5761067c610300565b5b600061068b8582860161032d565b925050602083015167ffffffffffffffff8111156106ac576106ab610305565b5b6106b885828601610638565b9150509250929050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b600081519050919050565b600081905092915050565b6000610712826106f1565b61071c81856106fc565b935061072c8185602086016104a2565b80840191505092915050565b60006107448284610707565b915081905092915050565b600082825260208201905092915050565b7f4d756c746963616c6c32206167677265676174653a2063616c6c206661696c6560008201527f6400000000000000000000000000000000000000000000000000000000000000602082015250565b60006107bc60218361074f565b91506107c782610760565b604082019050919050565b600060208201905081810360008301526107eb816107af565b9050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b6000819050919050565b600061083682610821565b91507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff821415610869576108686107f2565b5b60018201905091905056fe";
async function multicallSameContractManyFunctions(provider, params, stateOverrrides, blockOverrides) {
  const { address, contractInterface, functionName, functionParams } = params;
  const fragment = contractInterface.getFunction(functionName);
  const calls = functionParams.map((functionParam) => {
    const callData = contractInterface.encodeFunctionData(
      fragment,
      functionParam
    );
    return {
      target: address,
      callData
    };
  });
  return multicall(provider, calls, stateOverrrides, blockOverrides);
}
async function multicallSameFunctionManyContracts(provider, params, stateOverrrides, blockOverrides) {
  const { addresses, contractInterface, functionName, functionParam } = params;
  const fragment = contractInterface.getFunction(functionName);
  const callData = contractInterface.encodeFunctionData(
    fragment,
    functionParam
  );
  const calls = addresses.map((address) => {
    return {
      target: address,
      callData
    };
  });
  return multicall(provider, calls, stateOverrrides, blockOverrides);
}
async function multicall(provider, calls, stateOverrides, blockOverrides) {
  const chainId = (await provider.getNetwork()).chainId;
  const code = await provider.getCode(multicallAddressOn(chainId));
  let response;
  if (code.length > 2) {
    const multicall2 = Multicall2__factory.connect(multicallAddressOn(chainId), provider);
    const params = [
      {
        from: ethers.ethers.constants.AddressZero,
        to: multicall2.address,
        data: multicall2.interface.encodeFunctionData("tryAggregate", [false, calls])
      },
      "latest",
      stateOverrides ? stateOverrides : {}
    ];
    if (blockOverrides) params.push(blockOverrides);
    response = await provider.send("eth_call", params);
  } else {
    const deploylessInterface = new abi.Interface(deploylessMulticall2_default);
    const args = deploylessInterface.encodeDeploy([false, calls]);
    const data = bytes.hexConcat([DEPLOYLESS_MULTICALL_BYTECODE, args]);
    const params = [
      {
        from: ethers.ethers.constants.AddressZero,
        to: ethers.ethers.constants.AddressZero,
        data
      },
      "latest",
      stateOverrides ? stateOverrides : {}
    ];
    if (blockOverrides) params.push(blockOverrides);
    response = await provider.send("eth_call", params);
  }
  const multicallInterface = new abi.Interface(multicall2_default);
  return multicallInterface.decodeFunctionResult("tryAggregate", response).returnData;
}

// src/uniswapx/utils/OrderQuoter.ts
var OrderValidation = /* @__PURE__ */ ((OrderValidation3) => {
  OrderValidation3[OrderValidation3["Expired"] = 0] = "Expired";
  OrderValidation3[OrderValidation3["NonceUsed"] = 1] = "NonceUsed";
  OrderValidation3[OrderValidation3["InsufficientFunds"] = 2] = "InsufficientFunds";
  OrderValidation3[OrderValidation3["InvalidSignature"] = 3] = "InvalidSignature";
  OrderValidation3[OrderValidation3["InvalidOrderFields"] = 4] = "InvalidOrderFields";
  OrderValidation3[OrderValidation3["UnknownError"] = 5] = "UnknownError";
  OrderValidation3[OrderValidation3["ValidationFailed"] = 6] = "ValidationFailed";
  OrderValidation3[OrderValidation3["ExclusivityPeriod"] = 7] = "ExclusivityPeriod";
  OrderValidation3[OrderValidation3["OrderNotFillableYet"] = 8] = "OrderNotFillableYet";
  OrderValidation3[OrderValidation3["InvalidGasPrice"] = 9] = "InvalidGasPrice";
  OrderValidation3[OrderValidation3["InvalidCosignature"] = 10] = "InvalidCosignature";
  OrderValidation3[OrderValidation3["OK"] = 11] = "OK";
  return OrderValidation3;
})(OrderValidation || {});
var BASIC_ERROR = "0x08c379a0";
var KNOWN_ERRORS = {
  "8baa579f": 3 /* InvalidSignature */,
  "815e1d64": 3 /* InvalidSignature */,
  "756688fe": 1 /* NonceUsed */,
  // invalid dutch decay time
  "302e5b7c": 4 /* InvalidOrderFields */,
  // invalid dutch decay time
  "773a6187": 4 /* InvalidOrderFields */,
  // invalid reactor address
  "4ddf4a64": 4 /* InvalidOrderFields */,
  // both input and output decay
  d303758b: 4 /* InvalidOrderFields */,
  // Incorrect amounts
  "7c1f8113": 4 /* InvalidOrderFields */,
  // invalid dutch decay time
  "43133453": 4 /* InvalidOrderFields */,
  "48fee69c": 4 /* InvalidOrderFields */,
  "70f65caa": 0 /* Expired */,
  ee3b3d4b: 1 /* NonceUsed */,
  "0a0b0d79": 6 /* ValidationFailed */,
  b9ec1e96: 7 /* ExclusivityPeriod */,
  "062dec56": 7 /* ExclusivityPeriod */,
  "75c1bb14": 7 /* ExclusivityPeriod */,
  // invalid cosigner output
  a305df82: 4 /* InvalidOrderFields */,
  // invalid cosigner input
  ac9143e7: 4 /* InvalidOrderFields */,
  // duplicate fee output
  fff08303: 4 /* InvalidOrderFields */,
  // invalid cosignature
  d7815be1: 10 /* InvalidCosignature */,
  TRANSFER_FROM_FAILED: 2 /* InsufficientFunds */,
  // invalid fee escalation amounts
  d856fc5a: 4 /* InvalidOrderFields */,
  // Signature expired
  cd21db4f: 0 /* Expired */,
  // PriorityOrderReactor:InvalidDeadline()
  "769d11e4": 0 /* Expired */,
  // PriorityOrderReactor:OrderNotFillable()
  c6035520: 8 /* OrderNotFillableYet */,
  // PriorityOrderReactor:InputOutputScaling()
  a6b844f5: 4 /* InvalidOrderFields */,
  // PriorityOrderReactor:InvalidGasPrice()
  f3eb44e5: 9 /* InvalidGasPrice */
};
async function checkTerminalStates(provider, nonceManager, orders, validations) {
  return await Promise.all(
    validations.map(async (validation, i) => {
      const order = orders[i];
      if (validation === 0 /* Expired */ || order.order.info.deadline < Math.floor((/* @__PURE__ */ new Date()).getTime() / 1e3)) {
        const maker = order.order.getSigner(order.signature);
        const cancelled = await nonceManager.isUsed(
          maker,
          order.order.info.nonce
        );
        return cancelled ? 1 /* NonceUsed */ : 0 /* Expired */;
      } else if (order.order.blockOverrides && order.order.blockOverrides.number && validation === 11 /* OK */) {
        const blockNumber = await provider.getBlockNumber();
        if (blockNumber < parseInt(order.order.blockOverrides.number, 16)) {
          return 8 /* OrderNotFillableYet */;
        }
      }
      return validation;
    })
  );
}
var UniswapXOrderQuoter = class {
  constructor(provider, chainId, orderQuoterAddress) {
    this.provider = provider;
    this.chainId = chainId;
    if (orderQuoterAddress) {
      this.quoter = OrderQuoter__factory.connect(orderQuoterAddress, provider);
    } else if (UNISWAPX_ORDER_QUOTER_MAPPING[chainId]) {
      this.quoter = OrderQuoter__factory.connect(
        UNISWAPX_ORDER_QUOTER_MAPPING[chainId],
        this.provider
      );
    } else {
      throw new MissingConfiguration("quoter", chainId.toString());
    }
  }
  async quote(order) {
    return (await this.quoteBatch([order]))[0];
  }
  async quoteBatch(orders) {
    const results = await this.getMulticallResults("quote", orders);
    const validations = await this.getValidations(orders, results);
    const quotes = results.map(
      ({ success, returnData }) => {
        if (!success) {
          return void 0;
        }
        return this.quoter.interface.decodeFunctionResult("quote", returnData).result;
      }
    );
    return validations.map((validation, i) => {
      return {
        validation,
        quote: quotes[i]
      };
    });
  }
  async getValidations(orders, results) {
    const validations = results.map((result, idx) => {
      if (result.success) {
        return 11 /* OK */;
      } else {
        let returnData = result.returnData;
        if (returnData.startsWith(BASIC_ERROR)) {
          returnData = new ethers.ethers.utils.AbiCoder().decode(
            ["string"],
            "0x" + returnData.slice(10)
          )[0];
        }
        for (const key of Object.keys(KNOWN_ERRORS)) {
          if (returnData.includes(key)) {
            if (key === "0a0b0d79") {
              if ("additionalValidationData" in orders[idx].order.info) {
                const fillerValidation = parseExclusiveFillerData(
                  orders[idx].order.info.additionalValidationData
                );
                if (fillerValidation.type === 1 /* ExclusiveFiller */ && fillerValidation.data.filler !== ethers.ethers.constants.AddressZero) {
                  return 7 /* ExclusivityPeriod */;
                }
              }
              return 6 /* ValidationFailed */;
            }
            return KNOWN_ERRORS[key];
          }
        }
        return 5 /* UnknownError */;
      }
    });
    return await checkTerminalStates(
      this.provider,
      new NonceManager(
        this.provider,
        this.chainId,
        PERMIT2_MAPPING[this.chainId]
      ),
      orders,
      validations
    );
  }
  /// Get the results of a multicall for a given function
  /// Each order with a blockOverride is multicalled separately
  async getMulticallResults(functionName, orders) {
    const ordersWithBlockOverrides = orders.filter(
      (order) => order.order.blockOverrides
    );
    const promises = [];
    ordersWithBlockOverrides.map((order) => {
      promises.push(
        multicallSameContractManyFunctions(
          this.provider,
          {
            address: this.quoter.address,
            contractInterface: this.quoter.interface,
            functionName,
            functionParams: [[order.order.serialize(), order.signature]]
          },
          void 0,
          order.order.blockOverrides
        )
      );
    });
    const ordersWithoutBlockOverrides = orders.filter(
      (order) => !order.order.blockOverrides
    );
    const calls = ordersWithoutBlockOverrides.map((order) => {
      return [order.order.serialize(), order.signature];
    });
    promises.push(
      multicallSameContractManyFunctions(this.provider, {
        address: this.quoter.address,
        contractInterface: this.quoter.interface,
        functionName,
        functionParams: calls
      })
    );
    const results = await Promise.all(promises);
    return results.flat();
  }
  get orderQuoterAddress() {
    return this.quoter.address;
  }
};
var RelayOrderQuoter = class {
  // function execute((bytes, bytes))
  constructor(provider, chainId, reactorAddress) {
    this.provider = provider;
    this.chainId = chainId;
    this.quoteFunctionSelector = "0x3f62192e";
    if (reactorAddress) {
      this.quoter = RelayOrderReactor__factory.connect(
        reactorAddress,
        provider
      );
    } else if (REACTOR_ADDRESS_MAPPING[chainId]["Relay" /* Relay */]) {
      this.quoter = RelayOrderReactor__factory.connect(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        REACTOR_ADDRESS_MAPPING[chainId]["Relay" /* Relay */],
        this.provider
      );
    } else {
      throw new MissingConfiguration("quoter", chainId.toString());
    }
  }
  async quote(order) {
    return (await this.quoteBatch([order]))[0];
  }
  async quoteBatch(orders) {
    const results = await this.getMulticallResults(
      this.quoteFunctionSelector,
      orders
    );
    const validations = await this.getValidations(orders, results);
    const quotes = results.map(
      // no return data
      ({ success }, idx) => {
        if (!success) {
          return void 0;
        }
        return orders[idx].order.resolve({
          timestamp: Math.floor((/* @__PURE__ */ new Date()).getTime() / 1e3)
        });
      }
    );
    return validations.map((validation, i) => {
      return {
        validation,
        quote: quotes[i]
      };
    });
  }
  /// Get the results of a multicall for a given function
  /// Each order with a blockOverride is multicalled separately
  async getMulticallResults(functionName, orders) {
    const ordersWithBlockOverrides = orders.filter(
      (order) => order.order.blockOverrides
    );
    const promises = [];
    ordersWithBlockOverrides.map((order) => {
      promises.push(
        multicallSameContractManyFunctions(
          this.provider,
          {
            address: this.quoter.address,
            contractInterface: this.quoter.interface,
            functionName,
            functionParams: [
              [
                {
                  order: order.order.serialize(),
                  sig: order.signature
                }
              ]
            ]
          },
          void 0,
          order.order.blockOverrides
        )
      );
    });
    const ordersWithoutBlockOverrides = orders.filter(
      (order) => !order.order.blockOverrides
    );
    const calls = ordersWithoutBlockOverrides.map((order) => {
      return [
        {
          order: order.order.serialize(),
          sig: order.signature
        }
      ];
    });
    promises.push(
      multicallSameContractManyFunctions(this.provider, {
        address: this.quoter.address,
        contractInterface: this.quoter.interface,
        functionName,
        functionParams: calls
      })
    );
    const results = await Promise.all(promises);
    return results.flat();
  }
  async getValidations(orders, results) {
    const validations = results.map((result) => {
      if (result.success) {
        return 11 /* OK */;
      } else {
        let returnData = result.returnData;
        if (returnData.startsWith(BASIC_ERROR)) {
          returnData = new ethers.ethers.utils.AbiCoder().decode(
            ["string"],
            "0x" + returnData.slice(10)
          )[0];
        }
        for (const key of Object.keys(KNOWN_ERRORS)) {
          if (returnData.includes(key)) {
            return KNOWN_ERRORS[key];
          }
        }
        return 5 /* UnknownError */;
      }
    });
    return await checkTerminalStates(
      this.provider,
      new NonceManager(
        this.provider,
        this.chainId,
        PERMIT2_MAPPING[this.chainId]
      ),
      orders,
      validations
    );
  }
  get orderQuoterAddress() {
    return this.quoter.address;
  }
};
var V4OrderQuoter = class {
  constructor(provider, chainId, orderQuoterAddress) {
    this.provider = provider;
    this.chainId = chainId;
    if (orderQuoterAddress) {
      this.quoter = OrderQuoterV4__factory.connect(
        orderQuoterAddress,
        provider
      );
    } else if (UNISWAPX_V4_ORDER_QUOTER_MAPPING[chainId]) {
      this.quoter = OrderQuoterV4__factory.connect(
        UNISWAPX_V4_ORDER_QUOTER_MAPPING[chainId],
        this.provider
      );
    } else {
      throw new MissingConfiguration("v4Quoter", chainId.toString());
    }
  }
  async quote(order) {
    return (await this.quoteBatch([order]))[0];
  }
  async quoteBatch(orders) {
    const results = await this.getMulticallResults("quote", orders);
    const validations = await this.getValidations(orders, results);
    const quotes = results.map(
      ({ success, returnData }) => {
        if (!success) {
          return void 0;
        }
        const result = this.quoter.interface.decodeFunctionResult(
          "quote",
          returnData
        ).result;
        return {
          input: {
            token: result.input.token,
            amount: result.input.amount
          },
          outputs: result.outputs.map(
            (output) => ({
              token: output.token,
              amount: output.amount
            })
          ),
          auctionResolver: result.auctionResolver,
          witnessTypeString: result.witnessTypeString
        };
      }
    );
    return validations.map((validation, i) => {
      return {
        validation,
        quote: quotes[i]
      };
    });
  }
  async getValidations(orders, results) {
    const validations = results.map((result) => {
      if (result.success) {
        return 11 /* OK */;
      } else {
        let returnData = result.returnData;
        if (returnData.startsWith(BASIC_ERROR)) {
          returnData = new ethers.ethers.utils.AbiCoder().decode(
            ["string"],
            "0x" + returnData.slice(10)
          )[0];
        }
        for (const key of Object.keys(KNOWN_ERRORS)) {
          if (returnData.includes(key)) {
            return KNOWN_ERRORS[key];
          }
        }
        return 5 /* UnknownError */;
      }
    });
    return await checkTerminalStates(
      this.provider,
      new NonceManager(
        this.provider,
        this.chainId,
        PERMIT2_MAPPING[this.chainId]
      ),
      orders,
      validations
    );
  }
  /// Get the results of a multicall for a given function
  /// V4 quote requires (reactor, order, sig) instead of (order, sig)
  async getMulticallResults(functionName, orders) {
    const ordersWithBlockOverrides = orders.filter(
      (order) => order.order.blockOverrides
    );
    const promises = [];
    ordersWithBlockOverrides.map((order) => {
      promises.push(
        multicallSameContractManyFunctions(
          this.provider,
          {
            address: this.quoter.address,
            contractInterface: this.quoter.interface,
            functionName,
            functionParams: [
              [
                order.order.info.reactor,
                order.order.serialize(),
                order.signature
              ]
            ]
          },
          void 0,
          order.order.blockOverrides
        )
      );
    });
    const ordersWithoutBlockOverrides = orders.filter(
      (order) => !order.order.blockOverrides
    );
    const calls = ordersWithoutBlockOverrides.map((order) => {
      return [
        order.order.info.reactor,
        order.order.serialize(),
        order.signature
      ];
    });
    if (calls.length > 0) {
      promises.push(
        multicallSameContractManyFunctions(this.provider, {
          address: this.quoter.address,
          contractInterface: this.quoter.interface,
          functionName,
          functionParams: calls
        })
      );
    }
    const results = await Promise.all(promises);
    return results.flat();
  }
  get orderQuoterAddress() {
    return this.quoter.address;
  }
};

// src/uniswapx/utils/OrderValidator.ts
var OrderValidator = class extends UniswapXOrderQuoter {
  async validate(order) {
    return (await super.quote(order)).validation;
  }
  async validateBatch(orders) {
    return (await super.quoteBatch(orders)).map((order) => order.validation);
  }
};
var RelayOrderValidator = class extends RelayOrderQuoter {
  async validate(order) {
    return (await super.quote(order)).validation;
  }
  async validateBatch(orders) {
    return (await super.quoteBatch(orders)).map((order) => order.validation);
  }
};
var V4OrderValidator = class extends V4OrderQuoter {
  async validate(order) {
    return (await super.quote(order)).validation;
  }
  async validateBatch(orders) {
    return (await super.quoteBatch(orders)).map((order) => order.validation);
  }
};

// src/uniswapx/abis/MockERC20.json
var MockERC20_default = {
  abi: [
    {
      inputs: [
        {
          internalType: "string",
          name: "name",
          type: "string"
        },
        {
          internalType: "string",
          name: "symbol",
          type: "string"
        },
        {
          internalType: "uint8",
          name: "decimals",
          type: "uint8"
        }
      ],
      stateMutability: "nonpayable",
      type: "constructor"
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: "address",
          name: "owner",
          type: "address"
        },
        {
          indexed: true,
          internalType: "address",
          name: "spender",
          type: "address"
        },
        {
          indexed: false,
          internalType: "uint256",
          name: "amount",
          type: "uint256"
        }
      ],
      name: "Approval",
      type: "event"
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: "address",
          name: "from",
          type: "address"
        },
        {
          indexed: true,
          internalType: "address",
          name: "to",
          type: "address"
        },
        {
          indexed: false,
          internalType: "uint256",
          name: "amount",
          type: "uint256"
        }
      ],
      name: "Transfer",
      type: "event"
    },
    {
      inputs: [],
      name: "DOMAIN_SEPARATOR",
      outputs: [
        {
          internalType: "bytes32",
          name: "",
          type: "bytes32"
        }
      ],
      stateMutability: "view",
      type: "function"
    },
    {
      inputs: [
        {
          internalType: "address",
          name: "",
          type: "address"
        },
        {
          internalType: "address",
          name: "",
          type: "address"
        }
      ],
      name: "allowance",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256"
        }
      ],
      stateMutability: "view",
      type: "function"
    },
    {
      inputs: [
        {
          internalType: "address",
          name: "spender",
          type: "address"
        },
        {
          internalType: "uint256",
          name: "amount",
          type: "uint256"
        }
      ],
      name: "approve",
      outputs: [
        {
          internalType: "bool",
          name: "",
          type: "bool"
        }
      ],
      stateMutability: "nonpayable",
      type: "function"
    },
    {
      inputs: [
        {
          internalType: "address",
          name: "",
          type: "address"
        }
      ],
      name: "balanceOf",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256"
        }
      ],
      stateMutability: "view",
      type: "function"
    },
    {
      inputs: [],
      name: "decimals",
      outputs: [
        {
          internalType: "uint8",
          name: "",
          type: "uint8"
        }
      ],
      stateMutability: "view",
      type: "function"
    },
    {
      inputs: [
        {
          internalType: "address",
          name: "_from",
          type: "address"
        },
        {
          internalType: "address",
          name: "_to",
          type: "address"
        },
        {
          internalType: "uint256",
          name: "_amount",
          type: "uint256"
        }
      ],
      name: "forceApprove",
      outputs: [
        {
          internalType: "bool",
          name: "",
          type: "bool"
        }
      ],
      stateMutability: "nonpayable",
      type: "function"
    },
    {
      inputs: [
        {
          internalType: "address",
          name: "_to",
          type: "address"
        },
        {
          internalType: "uint256",
          name: "_amount",
          type: "uint256"
        }
      ],
      name: "mint",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function"
    },
    {
      inputs: [],
      name: "name",
      outputs: [
        {
          internalType: "string",
          name: "",
          type: "string"
        }
      ],
      stateMutability: "view",
      type: "function"
    },
    {
      inputs: [
        {
          internalType: "address",
          name: "",
          type: "address"
        }
      ],
      name: "nonces",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256"
        }
      ],
      stateMutability: "view",
      type: "function"
    },
    {
      inputs: [
        {
          internalType: "address",
          name: "owner",
          type: "address"
        },
        {
          internalType: "address",
          name: "spender",
          type: "address"
        },
        {
          internalType: "uint256",
          name: "value",
          type: "uint256"
        },
        {
          internalType: "uint256",
          name: "deadline",
          type: "uint256"
        },
        {
          internalType: "uint8",
          name: "v",
          type: "uint8"
        },
        {
          internalType: "bytes32",
          name: "r",
          type: "bytes32"
        },
        {
          internalType: "bytes32",
          name: "s",
          type: "bytes32"
        }
      ],
      name: "permit",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function"
    },
    {
      inputs: [],
      name: "symbol",
      outputs: [
        {
          internalType: "string",
          name: "",
          type: "string"
        }
      ],
      stateMutability: "view",
      type: "function"
    },
    {
      inputs: [],
      name: "totalSupply",
      outputs: [
        {
          internalType: "uint256",
          name: "",
          type: "uint256"
        }
      ],
      stateMutability: "view",
      type: "function"
    },
    {
      inputs: [
        {
          internalType: "address",
          name: "to",
          type: "address"
        },
        {
          internalType: "uint256",
          name: "amount",
          type: "uint256"
        }
      ],
      name: "transfer",
      outputs: [
        {
          internalType: "bool",
          name: "",
          type: "bool"
        }
      ],
      stateMutability: "nonpayable",
      type: "function"
    },
    {
      inputs: [
        {
          internalType: "address",
          name: "from",
          type: "address"
        },
        {
          internalType: "address",
          name: "to",
          type: "address"
        },
        {
          internalType: "uint256",
          name: "amount",
          type: "uint256"
        }
      ],
      name: "transferFrom",
      outputs: [
        {
          internalType: "bool",
          name: "",
          type: "bool"
        }
      ],
      stateMutability: "nonpayable",
      type: "function"
    }
  ]};

// src/uniswapx/utils/EventWatcher.ts
var TRANSFER = "Transfer";
var EventWatcher = class {
  constructor(reactor) {
    this.reactor = reactor;
  }
  async getFillEvents(fromBlock, toBlock) {
    const logs = await this.getFillLogs(fromBlock, toBlock);
    return logs.map((log) => log.args);
  }
  async getFillInfo(fromBlock, toBlock) {
    const logs = await this.getFillLogs(fromBlock, toBlock);
    const events = logs.map((log) => log.args);
    const txs = logs.reduce(
      (acc, log) => acc.add(
        this.reactor.provider.getTransactionReceipt(log.transactionHash)
      ),
      /* @__PURE__ */ new Set()
    );
    const txReceipts = await Promise.all(txs);
    const fills = events.map((e, i) => {
      return {
        orderHash: e.orderHash,
        swapper: e.swapper,
        filler: e.filler,
        nonce: e.nonce,
        txLogs: txReceipts[i].logs,
        // insertion order
        blockNumber: txReceipts[i].blockNumber,
        txHash: txReceipts[i].transactionHash
      };
    });
    return fills.map((fill) => {
      const outputs = this.getTokenTransfers(fill.txLogs, fill.swapper);
      const inputs = this.getTokenTransfers(fill.txLogs, fill.filler);
      return {
        orderHash: fill.orderHash,
        swapper: fill.swapper,
        filler: fill.filler,
        nonce: fill.nonce,
        blockNumber: fill.blockNumber,
        txHash: fill.txHash,
        inputs,
        outputs
      };
    });
  }
  getTokenTransfers(logs, recipient) {
    const ERC20Interface = new ethers.utils.Interface(MockERC20_default.abi);
    return logs.reduce((logAcc, log) => {
      try {
        const parsedLog = ERC20Interface.parseLog(log);
        if (parsedLog.name === TRANSFER && parsedLog.args.to === recipient) {
          logAcc.push({
            token: log.address,
            amount: parsedLog.args.amount
          });
        }
        return logAcc;
      } catch (_e) {
        return logAcc;
      }
    }, []);
  }
};
var UniswapXEventWatcher = class extends EventWatcher {
  constructor(provider, reactorAddress) {
    const reactor = ExclusiveDutchOrderReactor__factory.connect(
      reactorAddress,
      provider
    );
    super(reactor);
  }
  async getFillLogs(fromBlock, toBlock) {
    return await this.reactor.queryFilter(
      this.reactor.filters.Fill(),
      fromBlock,
      toBlock
    );
  }
  onFill(callback) {
    this.reactor.on(
      this.reactor.filters.Fill(),
      (orderHash, filler, swapper, nonce, event) => {
        callback(
          {
            orderHash,
            filler,
            nonce,
            swapper
          },
          event
        );
      }
    );
  }
};
var RelayEventWatcher = class extends EventWatcher {
  constructor(provider, reactorAddress) {
    const reactor = RelayOrderReactor__factory.connect(
      reactorAddress,
      provider
    );
    super(reactor);
  }
  async getFillLogs(fromBlock, toBlock) {
    return await this.reactor.queryFilter(
      this.reactor.filters.Relay(),
      fromBlock,
      toBlock
    );
  }
  onFill(callback) {
    this.reactor.on(
      this.reactor.filters.Relay(),
      (orderHash, filler, swapper, nonce, event) => {
        callback(
          {
            orderHash,
            filler,
            nonce,
            swapper
          },
          event
        );
      }
    );
  }
};
function locateArrayPosition(curve, currentRelativeBlock) {
  const relativeBlocks = curve.relativeBlocks;
  let prev = 0;
  let next = 0;
  for (; next < relativeBlocks.length; next++) {
    if (relativeBlocks[next] >= currentRelativeBlock) {
      return [prev, next];
    }
    prev = next;
  }
  return [next - 1, next - 1];
}
var NonLinearDutchDecayLib = class {
  static decay(curve, startAmount, decayStartBlock, currentBlock) {
    if (curve.relativeAmounts.length > 16) {
      throw new Error("InvalidDecayCurve");
    }
    if (decayStartBlock >= currentBlock || curve.relativeAmounts.length === 0) {
      return startAmount;
    }
    const blockDelta = currentBlock - decayStartBlock;
    if (curve.relativeBlocks[0] > blockDelta) {
      return this.linearDecay(
        0,
        curve.relativeBlocks[0],
        blockDelta,
        startAmount,
        startAmount.sub(curve.relativeAmounts[0].toString())
      );
    }
    const [prev, next] = locateArrayPosition(curve, blockDelta);
    const lastAmount = startAmount.sub(curve.relativeAmounts[prev].toString());
    const nextAmount = startAmount.sub(curve.relativeAmounts[next].toString());
    return this.linearDecay(
      curve.relativeBlocks[prev],
      curve.relativeBlocks[next],
      blockDelta,
      lastAmount,
      nextAmount
    );
  }
  static linearDecay(startPoint, endPoint, currentPoint, startAmount, endAmount) {
    if (currentPoint >= endPoint) {
      return endAmount;
    }
    const elapsed = ethers.BigNumber.from(currentPoint - startPoint);
    const duration = ethers.BigNumber.from(endPoint - startPoint);
    let delta;
    if (endAmount.lt(startAmount)) {
      delta = ethers.BigNumber.from(0).sub(startAmount.sub(endAmount).mul(elapsed).div(duration));
    } else {
      delta = endAmount.sub(startAmount).mul(elapsed).div(duration);
    }
    return startAmount.add(delta);
  }
};
function getBlockDecayedAmount(config, atBlock) {
  const { decayStartBlock, startAmount, relativeBlocks, relativeAmounts } = config;
  return NonLinearDutchDecayLib.decay(
    { relativeAmounts, relativeBlocks },
    startAmount,
    decayStartBlock,
    atBlock
  );
}

// src/uniswapx/order/V3DutchOrder.ts
var COSIGNER_DATA_TUPLE_ABI = "tuple(uint256,address,uint256,uint256,uint256[])";
var V3_DUTCH_ORDER_TYPES = {
  V3DutchOrder: [
    { name: "info", type: "OrderInfo" },
    { name: "cosigner", type: "address" },
    { name: "startingBaseFee", type: "uint256" },
    { name: "baseInput", type: "V3DutchInput" },
    { name: "baseOutputs", type: "V3DutchOutput[]" }
  ],
  OrderInfo: [
    { name: "reactor", type: "address" },
    { name: "swapper", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "additionalValidationContract", type: "address" },
    { name: "additionalValidationData", type: "bytes" }
  ],
  V3DutchInput: [
    { name: "token", type: "address" },
    { name: "startAmount", type: "uint256" },
    { name: "curve", type: "NonlinearDutchDecay" },
    { name: "maxAmount", type: "uint256" },
    { name: "adjustmentPerGweiBaseFee", type: "uint256" }
  ],
  V3DutchOutput: [
    { name: "token", type: "address" },
    { name: "startAmount", type: "uint256" },
    { name: "curve", type: "NonlinearDutchDecay" },
    { name: "recipient", type: "address" },
    { name: "minAmount", type: "uint256" },
    { name: "adjustmentPerGweiBaseFee", type: "uint256" }
  ],
  NonlinearDutchDecay: [
    { name: "relativeBlocks", type: "uint256" },
    { name: "relativeAmounts", type: "int256[]" }
  ]
};
var V3_DUTCH_ORDER_ABI = [
  "tuple(" + [
    "tuple(address,address,uint256,uint256,address,bytes)",
    // OrderInfo
    "address",
    // Cosigner
    "uint256",
    //startingBaseFee
    "tuple(address,uint256,tuple(uint256,int256[]),uint256,uint256)",
    // V3DutchInput
    "tuple(address,uint256,tuple(uint256,int256[]),address,uint256,uint256)[]",
    // V3DutchOutput
    COSIGNER_DATA_TUPLE_ABI,
    "bytes"
    // Cosignature
  ].join(",") + ")"
];
var UnsignedV3DutchOrder = class _UnsignedV3DutchOrder {
  constructor(info, chainId, _permit2Address) {
    this.info = info;
    this.chainId = chainId;
    this.permit2Address = getPermit2(chainId, _permit2Address);
  }
  static fromJSON(json, chainId, _permit2Address) {
    return new _UnsignedV3DutchOrder(
      {
        ...json,
        nonce: ethers.BigNumber.from(json.nonce),
        startingBaseFee: ethers.BigNumber.from(json.startingBaseFee),
        input: {
          ...json.input,
          startAmount: ethers.BigNumber.from(json.input.startAmount),
          curve: {
            relativeBlocks: json.input.curve.relativeBlocks,
            relativeAmounts: json.input.curve.relativeAmounts.map(
              (amount) => BigInt(amount)
            )
          },
          maxAmount: ethers.BigNumber.from(json.input.maxAmount),
          adjustmentPerGweiBaseFee: ethers.BigNumber.from(
            json.input.adjustmentPerGweiBaseFee
          )
        },
        outputs: json.outputs.map((output) => ({
          ...output,
          startAmount: ethers.BigNumber.from(output.startAmount),
          curve: {
            relativeBlocks: output.curve.relativeBlocks,
            relativeAmounts: output.curve.relativeAmounts.map(
              (amount) => BigInt(amount)
            )
          },
          minAmount: ethers.BigNumber.from(output.minAmount),
          adjustmentPerGweiBaseFee: ethers.BigNumber.from(
            output.adjustmentPerGweiBaseFee
          )
        }))
      },
      chainId,
      _permit2Address
    );
  }
  /**
   * @inheritdoc order
   */
  get blockOverrides() {
    return void 0;
  }
  /**
   * @inheritdoc order
   */
  serialize() {
    const encodedRelativeBlocks = encodeRelativeBlocks(
      this.info.input.curve.relativeBlocks
    );
    const abiCoder = new ethers.ethers.utils.AbiCoder();
    return abiCoder.encode(V3_DUTCH_ORDER_ABI, [
      [
        [
          this.info.reactor,
          this.info.swapper,
          this.info.nonce,
          this.info.deadline,
          this.info.additionalValidationContract,
          this.info.additionalValidationData
        ],
        this.info.cosigner,
        this.info.startingBaseFee,
        [
          this.info.input.token,
          this.info.input.startAmount,
          [encodedRelativeBlocks, this.info.input.curve.relativeAmounts],
          this.info.input.maxAmount,
          this.info.input.adjustmentPerGweiBaseFee
        ],
        this.info.outputs.map((output) => [
          output.token,
          output.startAmount,
          [encodedRelativeBlocks, output.curve.relativeAmounts],
          output.recipient,
          output.minAmount,
          output.adjustmentPerGweiBaseFee
        ]),
        [0, ethers.ethers.constants.AddressZero, 0, 0, [0]],
        "0x"
      ]
    ]);
  }
  /**
   * @inheritdoc order
   */
  toJSON() {
    return {
      reactor: this.info.reactor,
      swapper: this.info.swapper,
      nonce: this.info.nonce.toString(),
      deadline: this.info.deadline,
      additionalValidationContract: this.info.additionalValidationContract,
      additionalValidationData: this.info.additionalValidationData,
      cosigner: this.info.cosigner,
      startingBaseFee: this.info.startingBaseFee.toString(),
      input: {
        token: this.info.input.token,
        startAmount: this.info.input.startAmount.toString(),
        curve: {
          relativeBlocks: this.info.input.curve.relativeBlocks,
          relativeAmounts: this.info.input.curve.relativeAmounts.map(
            (amount) => amount.toString()
          )
        },
        maxAmount: this.info.input.maxAmount.toString(),
        adjustmentPerGweiBaseFee: this.info.input.adjustmentPerGweiBaseFee.toString()
      },
      outputs: this.info.outputs.map((output) => ({
        token: output.token,
        startAmount: output.startAmount.toString(),
        curve: {
          relativeBlocks: output.curve.relativeBlocks,
          relativeAmounts: output.curve.relativeAmounts.map(
            (amount) => amount.toString()
          )
        },
        recipient: output.recipient,
        minAmount: output.minAmount.toString(),
        adjustmentPerGweiBaseFee: output.adjustmentPerGweiBaseFee.toString()
      })),
      chainId: this.chainId,
      permit2Address: this.permit2Address
    };
  }
  permitData() {
    return SignatureTransfer.getPermitData(
      this.toPermit(),
      this.permit2Address,
      this.chainId,
      this.witness()
    );
  }
  toPermit() {
    return {
      permitted: {
        token: this.info.input.token,
        amount: this.info.input.maxAmount
      },
      spender: this.info.reactor,
      nonce: this.info.nonce,
      deadline: this.info.deadline
    };
  }
  witnessInfo() {
    return {
      info: {
        reactor: this.info.reactor,
        swapper: this.info.swapper,
        nonce: this.info.nonce,
        deadline: this.info.deadline,
        additionalValidationContract: this.info.additionalValidationContract,
        additionalValidationData: this.info.additionalValidationData
      },
      cosigner: this.info.cosigner,
      startingBaseFee: this.info.startingBaseFee,
      baseInput: {
        token: this.info.input.token,
        startAmount: this.info.input.startAmount,
        curve: {
          relativeBlocks: encodeRelativeBlocks(this.info.input.curve.relativeBlocks),
          relativeAmounts: this.info.input.curve.relativeAmounts.map(
            (amount) => amount.toString()
          )
        },
        maxAmount: this.info.input.maxAmount,
        adjustmentPerGweiBaseFee: this.info.input.adjustmentPerGweiBaseFee
      },
      baseOutputs: this.info.outputs.map((output) => ({
        token: output.token,
        startAmount: output.startAmount,
        curve: {
          relativeBlocks: encodeRelativeBlocks(output.curve.relativeBlocks),
          relativeAmounts: output.curve.relativeAmounts.map(
            (amount) => amount.toString()
          )
        },
        recipient: output.recipient,
        minAmount: output.minAmount,
        adjustmentPerGweiBaseFee: output.adjustmentPerGweiBaseFee
      }))
    };
  }
  witness() {
    return {
      witness: this.witnessInfo(),
      witnessTypeName: "V3DutchOrder",
      witnessType: V3_DUTCH_ORDER_TYPES
    };
  }
  getSigner(signature) {
    return ethers.ethers.utils.computeAddress(
      ethers.ethers.utils.recoverPublicKey(
        SignatureTransfer.hash(
          this.toPermit(),
          this.permit2Address,
          this.chainId,
          this.witness()
        ),
        signature
      )
    );
  }
  hash() {
    const witnessInfo = this.witnessInfo();
    return ethers.ethers.utils._TypedDataEncoder.from(V3_DUTCH_ORDER_TYPES).hash(witnessInfo);
  }
  /**
   * Full order hash that should be signed over by the cosigner
   */
  cosignatureHash(cosignerData) {
    const abiCoder = new ethers.ethers.utils.AbiCoder();
    return ethers.ethers.utils.solidityKeccak256(
      ["bytes32", "uint256", "bytes"],
      [
        this.hash(),
        this.chainId,
        abiCoder.encode(
          [COSIGNER_DATA_TUPLE_ABI],
          [
            [
              cosignerData.decayStartBlock,
              cosignerData.exclusiveFiller,
              cosignerData.exclusivityOverrideBps,
              cosignerData.inputOverride,
              cosignerData.outputOverrides
            ]
          ]
        )
      ]
    );
  }
  static parse(encoded, chainId, permit2) {
    return new _UnsignedV3DutchOrder(
      parseSerializedOrder(encoded),
      chainId,
      permit2
    );
  }
};
var CosignedV3DutchOrder = class _CosignedV3DutchOrder extends UnsignedV3DutchOrder {
  constructor(info, chainId, _permit2Address) {
    super(info, chainId, _permit2Address);
    this.info = info;
    this.chainId = chainId;
  }
  static fromUnsignedOrder(order, cosignerData, cosignature) {
    return new _CosignedV3DutchOrder(
      {
        ...order.info,
        cosignerData,
        cosignature
      },
      order.chainId,
      order.permit2Address
    );
  }
  static fromJSON(json, chainId, _permit2Address) {
    return new _CosignedV3DutchOrder(
      {
        ...json,
        nonce: ethers.BigNumber.from(json.nonce),
        startingBaseFee: ethers.BigNumber.from(json.startingBaseFee),
        input: {
          token: json.input.token,
          startAmount: ethers.BigNumber.from(json.input.startAmount),
          curve: {
            relativeBlocks: json.input.curve.relativeBlocks,
            relativeAmounts: json.input.curve.relativeAmounts.map(
              (amount) => BigInt(amount)
            )
          },
          maxAmount: ethers.BigNumber.from(json.input.maxAmount),
          adjustmentPerGweiBaseFee: ethers.BigNumber.from(
            json.input.adjustmentPerGweiBaseFee
          )
        },
        outputs: json.outputs.map((output) => ({
          token: output.token,
          startAmount: ethers.BigNumber.from(output.startAmount),
          curve: {
            relativeBlocks: output.curve.relativeBlocks,
            relativeAmounts: output.curve.relativeAmounts.map(
              (amount) => BigInt(amount)
            )
          },
          recipient: output.recipient,
          minAmount: ethers.BigNumber.from(output.minAmount),
          adjustmentPerGweiBaseFee: ethers.BigNumber.from(
            output.adjustmentPerGweiBaseFee
          )
        })),
        cosignerData: {
          decayStartBlock: json.cosignerData.decayStartBlock,
          exclusiveFiller: json.cosignerData.exclusiveFiller,
          exclusivityOverrideBps: ethers.BigNumber.from(
            json.cosignerData.exclusivityOverrideBps
          ),
          inputOverride: ethers.BigNumber.from(json.cosignerData.inputOverride),
          outputOverrides: json.cosignerData.outputOverrides.map(
            ethers.BigNumber.from
          )
        },
        cosignature: json.cosignature
      },
      chainId,
      _permit2Address
    );
  }
  /**
   * @inheritdoc order
   */
  toJSON() {
    return {
      ...super.toJSON(),
      cosignerData: {
        decayStartBlock: this.info.cosignerData.decayStartBlock,
        exclusiveFiller: this.info.cosignerData.exclusiveFiller,
        exclusivityOverrideBps: this.info.cosignerData.exclusivityOverrideBps.toNumber(),
        inputOverride: this.info.cosignerData.inputOverride.toString(),
        outputOverrides: this.info.cosignerData.outputOverrides.map(
          (override) => override.toString()
        )
      },
      cosignature: this.info.cosignature
    };
  }
  static parse(encoded, chainId, permit2) {
    return new _CosignedV3DutchOrder(
      parseSerializedOrder(encoded),
      chainId,
      permit2
    );
  }
  serialize() {
    const encodedInputRelativeBlocks = encodeRelativeBlocks(
      this.info.input.curve.relativeBlocks
    );
    const abiCoder = new ethers.ethers.utils.AbiCoder();
    return abiCoder.encode(V3_DUTCH_ORDER_ABI, [
      [
        [
          this.info.reactor,
          this.info.swapper,
          this.info.nonce,
          this.info.deadline,
          this.info.additionalValidationContract,
          this.info.additionalValidationData
        ],
        this.info.cosigner,
        this.info.startingBaseFee,
        [
          this.info.input.token,
          this.info.input.startAmount,
          [encodedInputRelativeBlocks, this.info.input.curve.relativeAmounts],
          this.info.input.maxAmount,
          this.info.input.adjustmentPerGweiBaseFee
        ],
        this.info.outputs.map((output) => [
          output.token,
          output.startAmount,
          [
            encodeRelativeBlocks(output.curve.relativeBlocks),
            output.curve.relativeAmounts
          ],
          output.recipient,
          output.minAmount,
          output.adjustmentPerGweiBaseFee
        ]),
        [
          this.info.cosignerData.decayStartBlock,
          this.info.cosignerData.exclusiveFiller,
          this.info.cosignerData.exclusivityOverrideBps,
          this.info.cosignerData.inputOverride.toString(),
          this.info.cosignerData.outputOverrides.map(
            (override) => override.toString()
          )
        ],
        this.info.cosignature
      ]
    ]);
  }
  recoverCosigner() {
    const messageHash = this.cosignatureHash(this.info.cosignerData);
    const signature = this.info.cosignature;
    return ethers.ethers.utils.recoverAddress(messageHash, signature);
  }
  resolve(options) {
    return {
      input: {
        token: this.info.input.token,
        amount: getBlockDecayedAmount(
          {
            decayStartBlock: this.info.cosignerData.decayStartBlock,
            startAmount: originalIfZero(
              this.info.cosignerData.inputOverride,
              this.info.input.startAmount
            ),
            relativeBlocks: this.info.input.curve.relativeBlocks,
            relativeAmounts: this.info.input.curve.relativeAmounts
          },
          options.currentBlock
        )
      },
      outputs: this.info.outputs.map((output, idx) => {
        return {
          token: output.token,
          amount: getBlockDecayedAmount(
            {
              decayStartBlock: this.info.cosignerData.decayStartBlock,
              startAmount: originalIfZero(
                this.info.cosignerData.outputOverrides[idx],
                output.startAmount
              ),
              relativeBlocks: output.curve.relativeBlocks,
              relativeAmounts: output.curve.relativeAmounts
            },
            options.currentBlock
          )
        };
      })
    };
  }
};
function parseSerializedOrder(serialized) {
  const abiCoder = new ethers.ethers.utils.AbiCoder();
  const decoded = abiCoder.decode(V3_DUTCH_ORDER_ABI, serialized);
  const [
    [
      [
        reactor,
        swapper,
        nonce,
        deadline,
        additionalValidationContract,
        additionalValidationData
      ],
      cosigner,
      startingBaseFee,
      [
        token,
        startAmount,
        [inputRelativeBlocks, relativeAmounts],
        maxAmount,
        adjustmentPerGweiBaseFee
      ],
      outputs,
      [
        decayStartBlock,
        exclusiveFiller,
        exclusivityOverrideBps,
        inputOverride,
        outputOverrides
      ],
      cosignature
    ]
  ] = decoded;
  return {
    reactor,
    swapper,
    nonce,
    deadline: deadline.toNumber(),
    additionalValidationContract,
    additionalValidationData,
    cosigner,
    startingBaseFee,
    input: {
      token,
      startAmount,
      curve: {
        relativeBlocks: decodeRelativeBlocks(
          inputRelativeBlocks,
          relativeAmounts.length
        ),
        relativeAmounts: relativeAmounts.map(
          (amount) => amount.toBigInt()
        )
      },
      maxAmount,
      adjustmentPerGweiBaseFee
    },
    outputs: outputs.map(
      ([
        token2,
        startAmount2,
        [outputRelativeBlocks, relativeAmounts2],
        recipient,
        minAmount,
        adjustmentPerGweiBaseFee2
      ]) => ({
        token: token2,
        startAmount: startAmount2,
        curve: {
          relativeBlocks: decodeRelativeBlocks(
            outputRelativeBlocks,
            relativeAmounts2.length
          ),
          relativeAmounts: relativeAmounts2.map(
            (amount) => amount.toBigInt()
          )
        },
        recipient,
        minAmount,
        adjustmentPerGweiBaseFee: adjustmentPerGweiBaseFee2
      })
    ),
    cosignerData: {
      decayStartBlock: decayStartBlock.toNumber(),
      exclusiveFiller,
      exclusivityOverrideBps,
      inputOverride,
      outputOverrides
    },
    cosignature
  };
}
function encodeRelativeBlocks(relativeBlocks) {
  let packedData = ethers.BigNumber.from(0);
  for (let i = 0; i < relativeBlocks.length; i++) {
    packedData = packedData.or(ethers.BigNumber.from(relativeBlocks[i]).shl(i * 16));
  }
  return packedData;
}
function decodeRelativeBlocks(packedData, relativeAmountsLength) {
  const relativeBlocks = [];
  for (let i = 0; i < relativeAmountsLength; i++) {
    const block = packedData.shr(i * 16).toNumber() & 65535;
    relativeBlocks.push(block);
  }
  return relativeBlocks;
}

// src/uniswapx/utils/order.ts
var UNISWAPX_ORDER_INFO_OFFSET = 64;
var RELAY_ORDER_INFO_OFFSET = 64;
var SLOT_LENGTH = 64;
var ADDRESS_LENGTH = 40;
var OrderParser = class {
  /**
   * Parses a serialized order based on the order shape
   * @dev called by derived classes which set the offset
   */
  _parseOrder(order) {
    const strippedOrder = stripHexPrefix(order);
    const orderInfoOffsetBytes = parseInt(
      strippedOrder.slice(
        this.orderInfoOffset,
        this.orderInfoOffset + SLOT_LENGTH
      ),
      16
    );
    const reactorAddressOffset = orderInfoOffsetBytes * 2 + SLOT_LENGTH;
    const reactorAddressSlot = strippedOrder.slice(
      reactorAddressOffset,
      reactorAddressOffset + SLOT_LENGTH
    );
    const reactorAddress = ethers.ethers.utils.getAddress(reactorAddressSlot.slice(SLOT_LENGTH - ADDRESS_LENGTH)).toLowerCase();
    if (!REVERSE_REACTOR_MAPPING[reactorAddress]) {
      throw new MissingConfiguration("reactor", reactorAddress);
    }
    return REVERSE_REACTOR_MAPPING[reactorAddress].orderType;
  }
  /**
   * Determines the OrderType from an Order object
   * @return OrderType
   */
  getOrderType(order) {
    const { orderType } = REVERSE_REACTOR_MAPPING[order.info.reactor.toLowerCase()];
    return orderType;
  }
  /**
   * Helper function to determine the OrderType from a serialized order
   */
  getOrderTypeFromEncoded(order, chainId) {
    const parsedOrder = this.parseOrder(order, chainId);
    return this.getOrderType(parsedOrder);
  }
};
var UniswapXOrderParser = class extends OrderParser {
  constructor() {
    super(...arguments);
    this.orderInfoOffset = UNISWAPX_ORDER_INFO_OFFSET;
  }
  /**
   * Parses a serialized order
   */
  parseOrder(order, chainId) {
    const v4OrderType = this.detectV4OrderType(order);
    if (v4OrderType) {
      return this.parseV4Order(order, chainId, v4OrderType);
    }
    const orderType = this._parseOrder(order);
    switch (orderType) {
      case "Dutch" /* Dutch */:
        return DutchOrder.parse(order, chainId);
      case "Dutch_V2" /* Dutch_V2 */: {
        const cosignedOrder = CosignedV2DutchOrder.parse(order, chainId);
        if (cosignedOrder.info.cosignature === "0x") {
          return UnsignedV2DutchOrder.parse(order, chainId);
        }
        return cosignedOrder;
      }
      case "Dutch_V3" /* Dutch_V3 */: {
        const cosignedOrder = CosignedV3DutchOrder.parse(order, chainId);
        if (cosignedOrder.info.cosignature === "0x") {
          return UnsignedV3DutchOrder.parse(order, chainId);
        }
        return cosignedOrder;
      }
      case "Priority" /* Priority */: {
        const cosignedOrder = CosignedPriorityOrder.parse(order, chainId);
        if (cosignedOrder.info.cosignature === "0x") {
          return UnsignedPriorityOrder.parse(order, chainId);
        }
        return cosignedOrder;
      }
      default:
        throw new MissingConfiguration("orderType", orderType);
    }
  }
  /**
   * Detects V4 order type by checking if the first address is a known resolver
   * V4 orders are serialized as: (resolver, orderData)
   */
  detectV4OrderType(order) {
    try {
      const abiCoder = new ethers.ethers.utils.AbiCoder();
      const [resolver] = abiCoder.decode(["address", "bytes"], order);
      const resolverLower = resolver.toLowerCase();
      if (REVERSE_RESOLVER_MAPPING[resolverLower]) {
        return REVERSE_RESOLVER_MAPPING[resolverLower].orderType;
      }
    } catch {
    }
    return null;
  }
  /**
   * Parses a V4 order based on its resolver
   */
  parseV4Order(order, chainId, orderType) {
    switch (orderType) {
      case "Hybrid" /* Hybrid */: {
        const cosignedOrder = CosignedHybridOrder.parse(order, chainId);
        if (cosignedOrder.info.cosignature === "0x") {
          return UnsignedHybridOrder.parse(order, chainId);
        }
        return cosignedOrder;
      }
      default:
        throw new MissingConfiguration("v4OrderType", orderType);
    }
  }
  /**
   * Determine the order type of a UniswapX order
   * @dev Special cases limit orders which are dutch orders with no output decay
   * @dev V4 orders (like HybridOrder) are detected by instance check since they use resolver-based lookup
   */
  getOrderType(order) {
    if (order instanceof UnsignedHybridOrder || order instanceof CosignedHybridOrder) {
      return "Hybrid" /* Hybrid */;
    }
    const { orderType } = REVERSE_REACTOR_MAPPING[order.info.reactor.toLowerCase()];
    if (orderType == "Dutch" /* Dutch */) {
      const input = order.info.input;
      const outputs = order.info.outputs;
      const isLimit = input.startAmount.eq(input.endAmount) && outputs.every((output) => output.startAmount.eq(output.endAmount));
      return isLimit ? "Limit" /* Limit */ : "Dutch" /* Dutch */;
    }
    return orderType;
  }
};
var RelayOrderParser = class extends OrderParser {
  constructor() {
    super(...arguments);
    this.orderInfoOffset = RELAY_ORDER_INFO_OFFSET;
  }
  /**
   * Parses a serialized order
   */
  parseOrder(order, chainId) {
    return RelayOrder.parse(order, chainId);
  }
};
function originalIfZero(value, original) {
  return value.isZero() ? original : value;
}

// src/uniswapx/utils/PermissionedTokenValidator.ts
var PermissionedTokenValidator = class {
  /**
   * Checks if a token is a permissioned token
   * @param tokenAddress The address of the token
   * @returns True if the token is a permissioned token, false otherwise
   */
  static isPermissionedToken(tokenAddress, chainId, permissionedTokens = PERMISSIONED_TOKENS) {
    return permissionedTokens.some(
      (token) => token.address.toLowerCase() === tokenAddress.toLowerCase() && token.chainId === chainId
    );
  }
  /**
   * Checks if a transfer would be allowed for a permissioned token
   * @param provider The provider to use for the view call
   * @param tokenAddress The address of the permissioned token
   * @param from The sender's address
   * @param to The recipient's address 
   * @param value The amount to transfer (in base units)
   * @returns True if the token is not a permissioned token or the transfer is 
   * allowed, false otherwise
   * @throws Will throw an exception if there is an error with the provider
   */
  static async preTransferCheck(provider, tokenAddress, from, to, value, permissionedTokens = PERMISSIONED_TOKENS) {
    const token = permissionedTokens.find(
      (token2) => token2.address.toLowerCase() === tokenAddress.toLowerCase()
    );
    if (!token) {
      return true;
    }
    let resolvedTokenAddress = tokenAddress;
    if (token.proxyType === "Standard" /* Standard */) {
      const proxyContract = Proxy__factory.connect(tokenAddress, provider);
      resolvedTokenAddress = await proxyContract.target();
    } else if (token.proxyType === "ERC1967" /* ERC1967 */) {
      const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
      const implStorage = await provider.getStorageAt(tokenAddress, implSlot);
      resolvedTokenAddress = "0x" + implStorage.slice(26);
    }
    if (token.interface === "DSTokenInterface" /* DSTokenInterface */) {
      const tokenContract = DSTokenInterface__factory.connect(resolvedTokenAddress, provider);
      const [code, _reason] = await tokenContract.preTransferCheck(from, to, value);
      return code.toNumber() === 0;
    } else if (token.interface === "ISuperstateTokenV4" /* ISuperstateTokenV4 */) {
      const tokenContract = ISuperstateTokenV4__factory.connect(resolvedTokenAddress, provider);
      const [fromAllowed, toAllowed] = await Promise.all([
        tokenContract.isAllowed(from),
        tokenContract.isAllowed(to)
      ]);
      return fromAllowed && toAllowed;
    } else {
      throw new Error("Unknown token interface: " + token.interface);
    }
  }
};

// src/uniswapx/utils/index.ts
function stripHexPrefix(a) {
  if (a.startsWith("0x")) {
    return a.slice(2);
  } else {
    return a;
  }
}
function getPermit2(chainId, permit2Address) {
  if (permit2Address) {
    return permit2Address;
  } else if (PERMIT2_MAPPING[chainId]) {
    return PERMIT2_MAPPING[chainId];
  } else {
    throw new MissingConfiguration("permit2", chainId.toString());
  }
}
function getReactor(chainId, orderType, reactorAddress) {
  const mappedReactorAddress = REACTOR_ADDRESS_MAPPING[chainId] ? REACTOR_ADDRESS_MAPPING[chainId][orderType] : void 0;
  if (reactorAddress) {
    return reactorAddress;
  } else if (mappedReactorAddress) {
    return mappedReactorAddress;
  } else {
    throw new MissingConfiguration("reactor", chainId.toString());
  }
}

// src/uniswapx/order/PriorityOrder.ts
var OrderNotFillable = class extends Error {
  constructor(message) {
    super(message);
    this.name = "OrderNotFillable";
  }
};
var PRIORITY_COSIGNER_DATA_TUPLE_ABI = "tuple(uint256)";
var PRIORITY_ORDER_TYPES = {
  PriorityOrder: [
    { name: "info", type: "OrderInfo" },
    { name: "cosigner", type: "address" },
    { name: "auctionStartBlock", type: "uint256" },
    { name: "baselinePriorityFeeWei", type: "uint256" },
    { name: "input", type: "PriorityInput" },
    { name: "outputs", type: "PriorityOutput[]" }
  ],
  OrderInfo: [
    { name: "reactor", type: "address" },
    { name: "swapper", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "additionalValidationContract", type: "address" },
    { name: "additionalValidationData", type: "bytes" }
  ],
  PriorityInput: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "mpsPerPriorityFeeWei", type: "uint256" }
  ],
  PriorityOutput: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "mpsPerPriorityFeeWei", type: "uint256" },
    { name: "recipient", type: "address" }
  ]
};
var PRIORITY_ORDER_ABI = [
  "tuple(" + [
    "tuple(address,address,uint256,uint256,address,bytes)",
    // OrderInfo
    "address",
    // cosigner
    "uint256",
    // auctionStartBlock
    "uint256",
    // baselinePriorityFeeWei
    "tuple(address,uint256,uint256)",
    // input
    "tuple(address,uint256,uint256,address)[]",
    // outputs
    "tuple(uint256)",
    // cosignerData
    "bytes"
    // cosignature
  ].join(",") + ")"
];
var UnsignedPriorityOrder = class _UnsignedPriorityOrder {
  constructor(info, chainId, _permit2Address) {
    this.info = info;
    this.chainId = chainId;
    this.permit2Address = getPermit2(chainId, _permit2Address);
  }
  static fromJSON(json, chainId, _permit2Address) {
    return new _UnsignedPriorityOrder(
      {
        ...json,
        cosigner: json.cosigner,
        auctionStartBlock: ethers.BigNumber.from(json.auctionStartBlock),
        baselinePriorityFeeWei: ethers.BigNumber.from(json.baselinePriorityFeeWei),
        nonce: ethers.BigNumber.from(json.nonce),
        input: {
          token: json.input.token,
          amount: ethers.BigNumber.from(json.input.amount),
          mpsPerPriorityFeeWei: ethers.BigNumber.from(json.input.mpsPerPriorityFeeWei)
        },
        outputs: json.outputs.map((output) => ({
          token: output.token,
          amount: ethers.BigNumber.from(output.amount),
          mpsPerPriorityFeeWei: ethers.BigNumber.from(output.mpsPerPriorityFeeWei),
          recipient: output.recipient
        }))
      },
      chainId,
      _permit2Address
    );
  }
  static parse(encoded, chainId, permit2) {
    return new _UnsignedPriorityOrder(
      parseSerializedOrder2(encoded),
      chainId,
      permit2
    );
  }
  /**
   * @inheritdoc order
   */
  toJSON() {
    return {
      chainId: this.chainId,
      permit2Address: this.permit2Address,
      reactor: this.info.reactor,
      swapper: this.info.swapper,
      nonce: this.info.nonce.toString(),
      deadline: this.info.deadline,
      additionalValidationContract: this.info.additionalValidationContract,
      additionalValidationData: this.info.additionalValidationData,
      cosigner: this.info.cosigner,
      auctionStartBlock: this.info.auctionStartBlock.toString(),
      baselinePriorityFeeWei: this.info.baselinePriorityFeeWei.toString(),
      input: {
        token: this.info.input.token,
        amount: this.info.input.amount.toString(),
        mpsPerPriorityFeeWei: this.info.input.mpsPerPriorityFeeWei.toString()
      },
      outputs: this.info.outputs.map((output) => ({
        token: output.token,
        amount: output.amount.toString(),
        mpsPerPriorityFeeWei: output.mpsPerPriorityFeeWei.toString(),
        recipient: output.recipient
      }))
    };
  }
  /**
   * @inheritdoc Order
   */
  get blockOverrides() {
    return {
      number: bytes.hexStripZeros(this.info.auctionStartBlock.toHexString())
    };
  }
  /**
   * @inheritdoc order
   */
  serialize() {
    const abiCoder = new ethers.ethers.utils.AbiCoder();
    return abiCoder.encode(PRIORITY_ORDER_ABI, [
      [
        [
          this.info.reactor,
          this.info.swapper,
          this.info.nonce,
          this.info.deadline,
          this.info.additionalValidationContract,
          this.info.additionalValidationData
        ],
        this.info.cosigner,
        this.info.auctionStartBlock,
        this.info.baselinePriorityFeeWei,
        [
          this.info.input.token,
          this.info.input.amount,
          this.info.input.mpsPerPriorityFeeWei
        ],
        this.info.outputs.map((output) => [
          output.token,
          output.amount,
          output.mpsPerPriorityFeeWei,
          output.recipient
        ]),
        // use empty default for cosignerData and cosignature
        [0],
        "0x"
      ]
    ]);
  }
  /**
   * @inheritdoc Order
   */
  getSigner(signature) {
    return ethers.ethers.utils.computeAddress(
      ethers.ethers.utils.recoverPublicKey(
        SignatureTransfer.hash(
          this.toPermit(),
          this.permit2Address,
          this.chainId,
          this.witness()
        ),
        signature
      )
    );
  }
  /**
   * @inheritdoc Order
   */
  permitData() {
    return SignatureTransfer.getPermitData(
      this.toPermit(),
      this.permit2Address,
      this.chainId,
      this.witness()
    );
  }
  /**
   * @inheritdoc Order
   */
  hash() {
    return ethers.ethers.utils._TypedDataEncoder.from(PRIORITY_ORDER_TYPES).hash(this.witnessInfo());
  }
  /**
   * Returns the resolved order with the given options
   * @return The resolved order
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  resolve(_options) {
    throw new Error("Method not implemented.");
  }
  /**
   * Returns the parsed validation
   * @return The parsed validation data for the order
   */
  get validation() {
    return parseValidation(this.info);
  }
  toPermit() {
    return {
      permitted: {
        token: this.info.input.token,
        amount: this.info.input.amount
      },
      spender: this.info.reactor,
      nonce: this.info.nonce,
      deadline: this.info.deadline
    };
  }
  witnessInfo() {
    return {
      info: {
        reactor: this.info.reactor,
        swapper: this.info.swapper,
        nonce: this.info.nonce,
        deadline: this.info.deadline,
        additionalValidationContract: this.info.additionalValidationContract,
        additionalValidationData: this.info.additionalValidationData
      },
      cosigner: this.info.cosigner,
      auctionStartBlock: this.info.auctionStartBlock,
      baselinePriorityFeeWei: this.info.baselinePriorityFeeWei,
      input: this.info.input,
      outputs: this.info.outputs
    };
  }
  witness() {
    return {
      witness: this.witnessInfo(),
      witnessTypeName: "PriorityOrder",
      witnessType: PRIORITY_ORDER_TYPES
    };
  }
  /**
   * Full order hash that should be signed over by the cosigner
   */
  cosignatureHash(cosignerData) {
    const abiCoder = new ethers.ethers.utils.AbiCoder();
    return ethers.ethers.utils.solidityKeccak256(
      ["bytes32", "uint256", "bytes"],
      [
        this.hash(),
        this.chainId,
        abiCoder.encode(
          [PRIORITY_COSIGNER_DATA_TUPLE_ABI],
          [[cosignerData.auctionTargetBlock]]
        )
      ]
    );
  }
};
var CosignedPriorityOrder = class _CosignedPriorityOrder extends UnsignedPriorityOrder {
  constructor(info, chainId, _permit2Address) {
    super(info, chainId, _permit2Address);
    this.info = info;
    this.chainId = chainId;
  }
  // build a cosigned order from an unsigned order plus cosigner data
  static fromUnsignedOrder(order, cosignerData, cosignature) {
    return new _CosignedPriorityOrder(
      {
        ...order.info,
        cosignerData,
        cosignature
      },
      order.chainId,
      order.permit2Address
    );
  }
  // build a cosigned order from json
  static fromJSON(json, chainId, _permit2Address) {
    return new _CosignedPriorityOrder(
      {
        ...json,
        nonce: ethers.BigNumber.from(json.nonce),
        cosigner: json.cosigner,
        auctionStartBlock: ethers.BigNumber.from(json.auctionStartBlock),
        baselinePriorityFeeWei: ethers.BigNumber.from(json.baselinePriorityFeeWei),
        input: {
          token: json.input.token,
          amount: ethers.BigNumber.from(json.input.amount),
          mpsPerPriorityFeeWei: ethers.BigNumber.from(json.input.mpsPerPriorityFeeWei)
        },
        outputs: json.outputs.map((output) => ({
          token: output.token,
          amount: ethers.BigNumber.from(output.amount),
          mpsPerPriorityFeeWei: ethers.BigNumber.from(output.mpsPerPriorityFeeWei),
          recipient: output.recipient
        })),
        cosignerData: {
          auctionTargetBlock: ethers.BigNumber.from(
            json.cosignerData.auctionTargetBlock
          )
        },
        cosignature: json.cosignature
      },
      chainId,
      _permit2Address
    );
  }
  // build a cosigned order from serialized
  static parse(encoded, chainId, permit2) {
    return new _CosignedPriorityOrder(
      parseSerializedOrder2(encoded),
      chainId,
      permit2
    );
  }
  /**
   * @inheritdoc order
   */
  toJSON() {
    return {
      ...super.toJSON(),
      cosignerData: {
        auctionTargetBlock: this.info.cosignerData.auctionTargetBlock.toString()
      },
      cosignature: this.info.cosignature
    };
  }
  /**
   * @inheritdoc Order
   */
  resolve(options) {
    if (options.currentBlock) {
      if (this.info.cosignerData.auctionTargetBlock.gt(0) && options.currentBlock.lt(this.info.cosignerData.auctionTargetBlock)) {
        throw new OrderNotFillable("Target block in the future");
      } else if (options.currentBlock.lt(this.info.auctionStartBlock)) {
        throw new OrderNotFillable("Start block in the future");
      }
    }
    return {
      input: {
        token: this.info.input.token,
        amount: scaleInput(this.info.input, options.priorityFee)
      },
      outputs: scaleOutputs(this.info.outputs, options.priorityFee)
    };
  }
  /**
   * @inheritdoc Order
   */
  get blockOverrides() {
    return {
      number: bytes.hexStripZeros(this.info.cosignerData.auctionTargetBlock.toHexString())
    };
  }
  /**
   * @inheritdoc order
   */
  serialize() {
    const abiCoder = new ethers.ethers.utils.AbiCoder();
    return abiCoder.encode(PRIORITY_ORDER_ABI, [
      [
        [
          this.info.reactor,
          this.info.swapper,
          this.info.nonce,
          this.info.deadline,
          this.info.additionalValidationContract,
          this.info.additionalValidationData
        ],
        this.info.cosigner,
        this.info.auctionStartBlock,
        this.info.baselinePriorityFeeWei,
        [
          this.info.input.token,
          this.info.input.amount,
          this.info.input.mpsPerPriorityFeeWei
        ],
        this.info.outputs.map((output) => [
          output.token,
          output.amount,
          output.mpsPerPriorityFeeWei,
          output.recipient
        ]),
        [this.info.cosignerData.auctionTargetBlock],
        this.info.cosignature
      ]
    ]);
  }
  /**
   *  recovers co-signer address from cosignature and full order hash
   *  @returns The address which co-signed the order
   */
  recoverCosigner() {
    return ethers.ethers.utils.verifyMessage(
      this.cosignatureHash(this.info.cosignerData),
      this.info.cosignature
    );
  }
};
function parseSerializedOrder2(serialized) {
  const abiCoder = new ethers.ethers.utils.AbiCoder();
  const decoded = abiCoder.decode(PRIORITY_ORDER_ABI, serialized);
  const [
    [
      [
        reactor,
        swapper,
        nonce,
        deadline,
        additionalValidationContract,
        additionalValidationData
      ],
      cosigner,
      auctionStartBlock,
      baselinePriorityFeeWei,
      [token, amount, mpsPerPriorityFeeWei],
      outputs,
      [auctionTargetBlock],
      cosignature
    ]
  ] = decoded;
  return {
    reactor,
    swapper,
    nonce,
    deadline: deadline.toNumber(),
    additionalValidationContract,
    additionalValidationData,
    cosigner,
    auctionStartBlock,
    baselinePriorityFeeWei,
    input: {
      token,
      amount,
      mpsPerPriorityFeeWei
    },
    outputs: outputs.map(
      ([token2, amount2, mpsPerPriorityFeeWei2, recipient]) => {
        return {
          token: token2,
          amount: amount2,
          mpsPerPriorityFeeWei: mpsPerPriorityFeeWei2,
          recipient
        };
      }
    ),
    cosignerData: {
      auctionTargetBlock
    },
    cosignature
  };
}
function scaleInput(input, priorityFee) {
  if (priorityFee.mul(input.mpsPerPriorityFeeWei).gte(MPS)) {
    return ethers.BigNumber.from(0);
  }
  return input.amount.mul(MPS.sub(priorityFee.mul(input.mpsPerPriorityFeeWei))).div(MPS);
}
function scaleOutputs(outputs, priorityFee) {
  return outputs.map((output) => {
    const product = output.amount.mul(
      MPS.add(priorityFee.mul(output.mpsPerPriorityFeeWei))
    );
    const mod = product.mod(MPS);
    const div = product.div(MPS);
    return {
      ...output,
      amount: mod.eq(0) ? div : div.add(1)
    };
  });
}
var RELAY_WITNESS_TYPES = {
  RelayOrder: [
    { name: "info", type: "RelayOrderInfo" },
    { name: "input", type: "Input" },
    { name: "fee", type: "FeeEscalator" },
    { name: "universalRouterCalldata", type: "bytes" }
  ],
  RelayOrderInfo: [
    { name: "reactor", type: "address" },
    { name: "swapper", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ],
  Input: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "recipient", type: "address" }
  ],
  FeeEscalator: [
    { name: "token", type: "address" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" }
  ]
};
var RELAY_ORDER_ABI = [
  "tuple(" + [
    "tuple(address,address,uint256,uint256)",
    "tuple(address,uint256,address)",
    "tuple(address,uint256,uint256,uint256,uint256)",
    "bytes"
  ].join(",") + ")"
];
var RelayOrder = class _RelayOrder {
  constructor(info, chainId, _permit2Address) {
    this.info = info;
    this.chainId = chainId;
    this._permit2Address = _permit2Address;
    if (_permit2Address) {
      this.permit2Address = _permit2Address;
    } else if (PERMIT2_MAPPING[chainId]) {
      this.permit2Address = PERMIT2_MAPPING[chainId];
    } else {
      throw new MissingConfiguration("permit2", chainId.toString());
    }
  }
  static fromJSON(json, chainId, _permit2Address) {
    return new _RelayOrder(
      {
        ...json,
        nonce: ethers.BigNumber.from(json.nonce),
        input: {
          token: json.input.token,
          amount: ethers.BigNumber.from(json.input.amount),
          recipient: json.input.recipient
        },
        fee: {
          token: json.fee.token,
          startAmount: ethers.BigNumber.from(json.fee.startAmount),
          endAmount: ethers.BigNumber.from(json.fee.endAmount),
          startTime: json.fee.startTime,
          endTime: json.fee.endTime
        }
      },
      chainId,
      _permit2Address
    );
  }
  static parse(encoded, chainId, permit2) {
    const abiCoder = new ethers.ethers.utils.AbiCoder();
    const decoded = abiCoder.decode(RELAY_ORDER_ABI, encoded);
    const [
      [
        [reactor, swapper, nonce, deadline],
        [inputToken, inputAmount, inputRecipient],
        [feeToken, feeStartAmount, feeEndAmount, feeStartTime, feeEndTime],
        universalRouterCalldata
      ]
    ] = decoded;
    return new _RelayOrder(
      {
        reactor,
        swapper,
        nonce,
        deadline: deadline.toNumber(),
        input: {
          token: inputToken,
          amount: inputAmount,
          recipient: inputRecipient
        },
        fee: {
          token: feeToken,
          startAmount: feeStartAmount,
          endAmount: feeEndAmount,
          startTime: feeStartTime.toNumber(),
          endTime: feeEndTime.toNumber()
        },
        universalRouterCalldata
      },
      chainId,
      permit2
    );
  }
  toJSON() {
    return {
      chainId: this.chainId,
      permit2Address: this.permit2Address,
      reactor: this.info.reactor,
      swapper: this.info.swapper,
      nonce: this.info.nonce.toString(),
      deadline: this.info.deadline,
      universalRouterCalldata: this.info.universalRouterCalldata,
      input: {
        token: this.info.input.token,
        amount: this.info.input.amount.toString(),
        recipient: this.info.input.recipient
      },
      fee: {
        token: this.info.fee.token,
        startAmount: this.info.fee.startAmount.toString(),
        endAmount: this.info.fee.endAmount.toString(),
        startTime: this.info.fee.startTime,
        endTime: this.info.fee.endTime
      }
    };
  }
  /**
   * @inheritdoc order
   */
  get blockOverrides() {
    return void 0;
  }
  serialize() {
    const abiCoder = new ethers.ethers.utils.AbiCoder();
    return abiCoder.encode(RELAY_ORDER_ABI, [
      [
        [
          this.info.reactor,
          this.info.swapper,
          this.info.nonce,
          this.info.deadline
        ],
        [
          this.info.input.token,
          this.info.input.amount,
          this.info.input.recipient
        ],
        [
          this.info.fee.token,
          this.info.fee.startAmount,
          this.info.fee.endAmount,
          this.info.fee.startTime,
          this.info.fee.endTime
        ],
        this.info.universalRouterCalldata
      ]
    ]);
  }
  /**
   * @inheritdoc Order
   */
  getSigner(signature) {
    return ethers.ethers.utils.computeAddress(
      ethers.ethers.utils.recoverPublicKey(
        SignatureTransfer.hash(
          this.toPermit(),
          this.permit2Address,
          this.chainId,
          this.witness()
        ),
        signature
      )
    );
  }
  /**
   * @inheritdoc OrderInterface
   */
  permitData() {
    return SignatureTransfer.getPermitData(
      this.toPermit(),
      this.permit2Address,
      this.chainId,
      this.witness()
    );
  }
  /**
   * @inheritdoc OrderInterface
   */
  hash() {
    return ethers.ethers.utils._TypedDataEncoder.from(RELAY_WITNESS_TYPES).hash(this.witnessInfo());
  }
  /**
   * Returns the resolved order with the given options
   * @return The resolved order
   */
  resolve(options) {
    return {
      fee: {
        token: this.info.fee.token,
        amount: getDecayedAmount(
          {
            decayStartTime: this.info.fee.startTime,
            decayEndTime: this.info.fee.endTime,
            startAmount: this.info.fee.startAmount,
            endAmount: this.info.fee.endAmount
          },
          options.timestamp
        )
      }
    };
  }
  toPermit() {
    return {
      permitted: [
        {
          token: this.info.input.token,
          amount: this.info.input.amount
        },
        {
          token: this.info.fee.token,
          amount: this.info.fee.endAmount
        }
      ],
      spender: this.info.reactor,
      nonce: this.info.nonce,
      deadline: this.info.deadline
    };
  }
  witnessInfo() {
    return {
      info: {
        reactor: this.info.reactor,
        swapper: this.info.swapper,
        nonce: this.info.nonce,
        deadline: this.info.deadline
      },
      input: this.info.input,
      fee: this.info.fee,
      universalRouterCalldata: this.info.universalRouterCalldata
    };
  }
  witness() {
    return {
      witness: this.witnessInfo(),
      witnessTypeName: "RelayOrder",
      witnessType: RELAY_WITNESS_TYPES
    };
  }
};
var COSIGNER_DATA_TUPLE_ABI2 = "tuple(uint256,uint256,address,uint256,uint256,uint256[])";
var V2_DUTCH_ORDER_TYPES = {
  V2DutchOrder: [
    { name: "info", type: "OrderInfo" },
    { name: "cosigner", type: "address" },
    { name: "baseInputToken", type: "address" },
    { name: "baseInputStartAmount", type: "uint256" },
    { name: "baseInputEndAmount", type: "uint256" },
    { name: "baseOutputs", type: "DutchOutput[]" }
  ],
  OrderInfo: [
    { name: "reactor", type: "address" },
    { name: "swapper", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "additionalValidationContract", type: "address" },
    { name: "additionalValidationData", type: "bytes" }
  ],
  DutchOutput: [
    { name: "token", type: "address" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
    { name: "recipient", type: "address" }
  ]
};
var V2_DUTCH_ORDER_ABI = [
  "tuple(" + [
    "tuple(address,address,uint256,uint256,address,bytes)",
    // OrderInfo
    "address",
    // cosigner
    "tuple(address,uint256,uint256)",
    // input
    "tuple(address,uint256,uint256,address)[]",
    // outputs
    COSIGNER_DATA_TUPLE_ABI2,
    // cosignerData
    "bytes"
    // cosignature
  ].join(",") + ")"
];
var UnsignedV2DutchOrder = class _UnsignedV2DutchOrder {
  constructor(info, chainId, _permit2Address) {
    this.info = info;
    this.chainId = chainId;
    this.permit2Address = getPermit2(chainId, _permit2Address);
  }
  static fromJSON(json, chainId, _permit2Address) {
    return new _UnsignedV2DutchOrder(
      {
        ...json,
        nonce: ethers.BigNumber.from(json.nonce),
        input: {
          token: json.input.token,
          startAmount: ethers.BigNumber.from(json.input.startAmount),
          endAmount: ethers.BigNumber.from(json.input.endAmount)
        },
        outputs: json.outputs.map((output) => ({
          token: output.token,
          startAmount: ethers.BigNumber.from(output.startAmount),
          endAmount: ethers.BigNumber.from(output.endAmount),
          recipient: output.recipient
        }))
      },
      chainId,
      _permit2Address
    );
  }
  static parse(encoded, chainId, permit2) {
    return new _UnsignedV2DutchOrder(
      parseSerializedOrder3(encoded),
      chainId,
      permit2
    );
  }
  /**
   * @inheritdoc order
   */
  toJSON() {
    return {
      chainId: this.chainId,
      permit2Address: this.permit2Address,
      reactor: this.info.reactor,
      swapper: this.info.swapper,
      nonce: this.info.nonce.toString(),
      deadline: this.info.deadline,
      additionalValidationContract: this.info.additionalValidationContract,
      additionalValidationData: this.info.additionalValidationData,
      input: {
        token: this.info.input.token,
        startAmount: this.info.input.startAmount.toString(),
        endAmount: this.info.input.endAmount.toString()
      },
      outputs: this.info.outputs.map((output) => ({
        token: output.token,
        startAmount: output.startAmount.toString(),
        endAmount: output.endAmount.toString(),
        recipient: output.recipient
      })),
      cosigner: this.info.cosigner
    };
  }
  /**
   * @inheritdoc order
   */
  get blockOverrides() {
    return void 0;
  }
  /**
   * @inheritdoc order
   */
  serialize() {
    const abiCoder = new ethers.ethers.utils.AbiCoder();
    return abiCoder.encode(V2_DUTCH_ORDER_ABI, [
      [
        [
          this.info.reactor,
          this.info.swapper,
          this.info.nonce,
          this.info.deadline,
          this.info.additionalValidationContract,
          this.info.additionalValidationData
        ],
        this.info.cosigner,
        [
          this.info.input.token,
          this.info.input.startAmount,
          this.info.input.endAmount
        ],
        this.info.outputs.map((output) => [
          output.token,
          output.startAmount,
          output.endAmount,
          output.recipient
        ]),
        // use empty default for cosignerData and cosignature
        [0, 0, ethers.ethers.constants.AddressZero, 0, 0, [0]],
        "0x"
      ]
    ]);
  }
  /**
   * @inheritdoc Order
   */
  getSigner(signature) {
    return ethers.ethers.utils.computeAddress(
      ethers.ethers.utils.recoverPublicKey(
        SignatureTransfer.hash(
          this.toPermit(),
          this.permit2Address,
          this.chainId,
          this.witness()
        ),
        signature
      )
    );
  }
  /**
   * @inheritdoc Order
   */
  permitData() {
    return SignatureTransfer.getPermitData(
      this.toPermit(),
      this.permit2Address,
      this.chainId,
      this.witness()
    );
  }
  /**
   * @inheritdoc Order
   */
  hash() {
    return ethers.ethers.utils._TypedDataEncoder.from(V2_DUTCH_ORDER_TYPES).hash(this.witnessInfo());
  }
  /**
   * Returns the resolved order with the given options
   * @return The resolved order
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  resolve(_options) {
    throw new Error("Method not implemented");
  }
  /**
   * Returns the parsed validation
   * @return The parsed validation data for the order
   */
  get validation() {
    return parseValidation(this.info);
  }
  toPermit() {
    return {
      permitted: {
        token: this.info.input.token,
        amount: this.info.input.endAmount
      },
      spender: this.info.reactor,
      nonce: this.info.nonce,
      deadline: this.info.deadline
    };
  }
  witnessInfo() {
    return {
      info: {
        reactor: this.info.reactor,
        swapper: this.info.swapper,
        nonce: this.info.nonce,
        deadline: this.info.deadline,
        additionalValidationContract: this.info.additionalValidationContract,
        additionalValidationData: this.info.additionalValidationData
      },
      cosigner: this.info.cosigner,
      baseInputToken: this.info.input.token,
      baseInputStartAmount: this.info.input.startAmount,
      baseInputEndAmount: this.info.input.endAmount,
      baseOutputs: this.info.outputs
    };
  }
  witness() {
    return {
      witness: this.witnessInfo(),
      witnessTypeName: "V2DutchOrder",
      witnessType: V2_DUTCH_ORDER_TYPES
    };
  }
  /**
   * Full order hash that should be signed over by the cosigner
   */
  cosignatureHash(cosignerData) {
    const abiCoder = new ethers.ethers.utils.AbiCoder();
    return ethers.ethers.utils.solidityKeccak256(
      ["bytes32", "bytes"],
      [
        this.hash(),
        abiCoder.encode(
          [COSIGNER_DATA_TUPLE_ABI2],
          [
            [
              cosignerData.decayStartTime,
              cosignerData.decayEndTime,
              cosignerData.exclusiveFiller,
              cosignerData.exclusivityOverrideBps,
              cosignerData.inputOverride,
              cosignerData.outputOverrides
            ]
          ]
        )
      ]
    );
  }
};
var CosignedV2DutchOrder = class _CosignedV2DutchOrder extends UnsignedV2DutchOrder {
  constructor(info, chainId, _permit2Address) {
    super(info, chainId, _permit2Address);
    this.info = info;
    this.chainId = chainId;
  }
  // build a cosigned order from an unsigned order plus cosigner data
  static fromUnsignedOrder(order, cosignerData, cosignature) {
    return new _CosignedV2DutchOrder(
      {
        ...order.info,
        cosignerData,
        cosignature
      },
      order.chainId,
      order.permit2Address
    );
  }
  // build a cosigned order from json
  static fromJSON(json, chainId, _permit2Address) {
    return new _CosignedV2DutchOrder(
      {
        ...json,
        nonce: ethers.BigNumber.from(json.nonce),
        input: {
          token: json.input.token,
          startAmount: ethers.BigNumber.from(json.input.startAmount),
          endAmount: ethers.BigNumber.from(json.input.endAmount)
        },
        outputs: json.outputs.map((output) => ({
          token: output.token,
          startAmount: ethers.BigNumber.from(output.startAmount),
          endAmount: ethers.BigNumber.from(output.endAmount),
          recipient: output.recipient
        })),
        cosignerData: {
          decayStartTime: json.cosignerData.decayStartTime,
          decayEndTime: json.cosignerData.decayEndTime,
          exclusiveFiller: json.cosignerData.exclusiveFiller,
          exclusivityOverrideBps: ethers.BigNumber.from(
            json.cosignerData.exclusivityOverrideBps
          ),
          inputOverride: ethers.BigNumber.from(json.cosignerData.inputOverride),
          outputOverrides: json.cosignerData.outputOverrides.map(
            ethers.BigNumber.from
          )
        },
        cosignature: json.cosignature
      },
      chainId,
      _permit2Address
    );
  }
  // build a cosigned order from serialized
  static parse(encoded, chainId, permit2) {
    return new _CosignedV2DutchOrder(
      parseSerializedOrder3(encoded),
      chainId,
      permit2
    );
  }
  /**
   * @inheritdoc order
   */
  toJSON() {
    return {
      ...super.toJSON(),
      cosignerData: {
        decayStartTime: this.info.cosignerData.decayStartTime,
        decayEndTime: this.info.cosignerData.decayEndTime,
        exclusiveFiller: this.info.cosignerData.exclusiveFiller,
        exclusivityOverrideBps: this.info.cosignerData.exclusivityOverrideBps.toNumber(),
        inputOverride: this.info.cosignerData.inputOverride.toString(),
        outputOverrides: this.info.cosignerData.outputOverrides.map(
          (o) => o.toString()
        )
      },
      cosignature: this.info.cosignature
    };
  }
  /**
   * @inheritdoc Order
   */
  resolve(options) {
    return {
      input: {
        token: this.info.input.token,
        amount: getDecayedAmount(
          {
            decayStartTime: this.info.cosignerData.decayStartTime,
            decayEndTime: this.info.cosignerData.decayEndTime,
            startAmount: originalIfZero(
              this.info.cosignerData.inputOverride,
              this.info.input.startAmount
            ),
            endAmount: this.info.input.endAmount
          },
          options.timestamp
        )
      },
      outputs: this.info.outputs.map((output, idx) => {
        return {
          token: output.token,
          amount: getDecayedAmount(
            {
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              decayStartTime: this.info.cosignerData.decayStartTime,
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              decayEndTime: this.info.cosignerData.decayEndTime,
              startAmount: originalIfZero(
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                this.info.cosignerData.outputOverrides[idx],
                output.startAmount
              ),
              endAmount: output.endAmount
            },
            options.timestamp
          )
        };
      })
    };
  }
  /**
   * @inheritdoc order
   */
  serialize() {
    const abiCoder = new ethers.ethers.utils.AbiCoder();
    return abiCoder.encode(V2_DUTCH_ORDER_ABI, [
      [
        [
          this.info.reactor,
          this.info.swapper,
          this.info.nonce,
          this.info.deadline,
          this.info.additionalValidationContract,
          this.info.additionalValidationData
        ],
        this.info.cosigner,
        [
          this.info.input.token,
          this.info.input.startAmount,
          this.info.input.endAmount
        ],
        this.info.outputs.map((output) => [
          output.token,
          output.startAmount,
          output.endAmount,
          output.recipient
        ]),
        [
          this.info.cosignerData.decayStartTime,
          this.info.cosignerData.decayEndTime,
          this.info.cosignerData.exclusiveFiller,
          this.info.cosignerData.exclusivityOverrideBps,
          this.info.cosignerData.inputOverride.toString(),
          this.info.cosignerData.outputOverrides.map((o) => o.toString())
        ],
        this.info.cosignature
      ]
    ]);
  }
  /**
   *  recovers co-signer address from cosignature and full order hash
   *  @returns The address which co-signed the order
   */
  recoverCosigner() {
    return ethers.ethers.utils.verifyMessage(
      this.cosignatureHash(this.info.cosignerData),
      this.info.cosignature
    );
  }
};
function parseSerializedOrder3(serialized) {
  const abiCoder = new ethers.ethers.utils.AbiCoder();
  const decoded = abiCoder.decode(V2_DUTCH_ORDER_ABI, serialized);
  const [
    [
      [
        reactor,
        swapper,
        nonce,
        deadline,
        additionalValidationContract,
        additionalValidationData
      ],
      cosigner,
      [inputToken, inputStartAmount, inputEndAmount],
      outputs,
      [
        decayStartTime,
        decayEndTime,
        exclusiveFiller,
        exclusivityOverrideBps,
        inputOverride,
        outputOverrides
      ],
      cosignature
    ]
  ] = decoded;
  return {
    reactor,
    swapper,
    nonce,
    deadline: deadline.toNumber(),
    additionalValidationContract,
    additionalValidationData,
    cosigner,
    input: {
      token: inputToken,
      startAmount: inputStartAmount,
      endAmount: inputEndAmount
    },
    outputs: outputs.map(
      ([token, startAmount, endAmount, recipient]) => {
        return {
          token,
          startAmount,
          endAmount,
          recipient
        };
      }
    ),
    cosignerData: {
      decayStartTime: decayStartTime.toNumber(),
      decayEndTime: decayEndTime.toNumber(),
      exclusiveFiller,
      exclusivityOverrideBps,
      inputOverride,
      outputOverrides
    },
    cosignature
  };
}
var ORDER_INFO_V4_TYPE_STRING = "OrderInfo(address reactor,address swapper,uint256 nonce,uint256 deadline,address preExecutionHook,bytes preExecutionHookData,address postExecutionHook,bytes postExecutionHookData,address auctionResolver)";
var ORDER_INFO_V4_TYPE_HASH = ethers.ethers.utils.keccak256(
  ethers.ethers.utils.toUtf8Bytes(ORDER_INFO_V4_TYPE_STRING)
);
var HYBRID_INPUT_TYPE_STRING = "HybridInput(address token,uint256 maxAmount)";
var HYBRID_INPUT_TYPE_HASH = ethers.ethers.utils.keccak256(
  ethers.ethers.utils.toUtf8Bytes(HYBRID_INPUT_TYPE_STRING)
);
var HYBRID_OUTPUT_TYPE_STRING = "HybridOutput(address token,uint256 minAmount,address recipient)";
var HYBRID_OUTPUT_TYPE_HASH = ethers.ethers.utils.keccak256(
  ethers.ethers.utils.toUtf8Bytes(HYBRID_OUTPUT_TYPE_STRING)
);
var HYBRID_ORDER_TYPE_STRING = [
  "HybridOrder(",
  "OrderInfo info,",
  "address cosigner,",
  "HybridInput input,",
  "HybridOutput[] outputs,",
  "uint256 auctionStartBlock,",
  "uint256 baselinePriorityFee,",
  "uint256 scalingFactor,",
  "uint256[] priceCurve)"
].join("");
var HYBRID_ORDER_TYPE_HASH = ethers.ethers.utils.keccak256(
  ethers.ethers.utils.toUtf8Bytes(
    HYBRID_ORDER_TYPE_STRING + HYBRID_INPUT_TYPE_STRING + HYBRID_OUTPUT_TYPE_STRING + ORDER_INFO_V4_TYPE_STRING
  )
);
var HYBRID_ORDER_TYPES = {
  HybridInput: [
    { name: "token", type: "address" },
    { name: "maxAmount", type: "uint256" }
  ],
  HybridOrder: [
    { name: "info", type: "OrderInfo" },
    { name: "cosigner", type: "address" },
    { name: "input", type: "HybridInput" },
    { name: "outputs", type: "HybridOutput[]" },
    { name: "auctionStartBlock", type: "uint256" },
    { name: "baselinePriorityFee", type: "uint256" },
    { name: "scalingFactor", type: "uint256" },
    { name: "priceCurve", type: "uint256[]" }
  ],
  HybridOutput: [
    { name: "token", type: "address" },
    { name: "minAmount", type: "uint256" },
    { name: "recipient", type: "address" }
  ],
  OrderInfo: [
    { name: "reactor", type: "address" },
    { name: "swapper", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "preExecutionHook", type: "address" },
    { name: "preExecutionHookData", type: "bytes" },
    { name: "postExecutionHook", type: "address" },
    { name: "postExecutionHookData", type: "bytes" },
    { name: "auctionResolver", type: "address" }
  ]
};
function hashOrderInfoV4(info) {
  return ethers.ethers.utils.keccak256(
    ethers.ethers.utils.defaultAbiCoder.encode(
      [
        "bytes32",
        "address",
        "address",
        "uint256",
        "uint256",
        "address",
        "bytes32",
        "address",
        "bytes32",
        "address"
      ],
      [
        ORDER_INFO_V4_TYPE_HASH,
        info.reactor,
        info.swapper,
        info.nonce,
        info.deadline,
        info.preExecutionHook,
        ethers.ethers.utils.keccak256(info.preExecutionHookData),
        info.postExecutionHook,
        ethers.ethers.utils.keccak256(info.postExecutionHookData),
        info.auctionResolver
      ]
    )
  );
}
function hashHybridInput(input) {
  return ethers.ethers.utils.keccak256(
    ethers.ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "address", "uint256"],
      [HYBRID_INPUT_TYPE_HASH, input.token, input.maxAmount]
    )
  );
}
function hashHybridOutput(output) {
  return ethers.ethers.utils.keccak256(
    ethers.ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "address", "uint256", "address"],
      [
        HYBRID_OUTPUT_TYPE_HASH,
        output.token,
        output.minAmount,
        output.recipient
      ]
    )
  );
}
function hashHybridOutputs(outputs) {
  const hashes = outputs.map(hashHybridOutput);
  if (hashes.length === 0) {
    return ethers.ethers.utils.keccak256("0x");
  }
  const types = new Array(hashes.length).fill("bytes32");
  return ethers.ethers.utils.keccak256(ethers.ethers.utils.solidityPack(types, hashes));
}
function hashPriceCurve(curve) {
  if (curve.length === 0) {
    return ethers.ethers.utils.keccak256("0x");
  }
  const types = new Array(curve.length).fill("uint256");
  const values = curve.map((value) => ethers.BigNumber.from(value));
  return ethers.ethers.utils.keccak256(ethers.ethers.utils.solidityPack(types, values));
}
function hashHybridOrder(order) {
  const infoHash = hashOrderInfoV4(order);
  const inputHash = hashHybridInput(order.input);
  const outputsHash = hashHybridOutputs(order.outputs);
  const priceCurveHash = hashPriceCurve(order.priceCurve);
  return ethers.ethers.utils.keccak256(
    ethers.ethers.utils.defaultAbiCoder.encode(
      [
        "bytes32",
        "bytes32",
        "address",
        "bytes32",
        "bytes32",
        "uint256",
        "uint256",
        "uint256",
        "bytes32"
      ],
      [
        HYBRID_ORDER_TYPE_HASH,
        infoHash,
        order.cosigner,
        inputHash,
        outputsHash,
        order.auctionStartBlock,
        order.baselinePriorityFee,
        order.scalingFactor,
        priceCurveHash
      ]
    )
  );
}
function hashHybridCosignerData(orderHash, cosignerData, chainId) {
  const encodedCosignerData = ethers.ethers.utils.defaultAbiCoder.encode(
    ["tuple(uint256 auctionTargetBlock,uint256[] supplementalPriceCurve)"],
    [
      [
        cosignerData.auctionTargetBlock,
        cosignerData.supplementalPriceCurve.map(
          (value) => ethers.BigNumber.from(value)
        )
      ]
    ]
  );
  return ethers.ethers.utils.keccak256(
    ethers.ethers.utils.solidityPack(
      ["bytes32", "uint256", "bytes"],
      [orderHash, chainId, encodedCosignerData]
    )
  );
}
var FEED_INFO_TYPE = "FeedInfo(bytes32 feedId,address feed_address,string feedType)";
var FEED_INFO_TYPE_HASH = ethers.ethers.utils.keccak256(
  ethers.ethers.utils.toUtf8Bytes(FEED_INFO_TYPE)
);
var PRIVATE_INTENT_TYPE = "PrivateIntent(uint256 totalAmount,uint256 exactFrequency,uint256 numChunks,bytes32 salt,FeedInfo[] oracleFeeds)" + FEED_INFO_TYPE;
var PRIVATE_INTENT_TYPE_HASH = ethers.ethers.utils.keccak256(
  ethers.ethers.utils.toUtf8Bytes(PRIVATE_INTENT_TYPE)
);
function hashFeedInfo(feed) {
  return ethers.ethers.utils.keccak256(
    ethers.ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "bytes32", "address", "string"],
      [FEED_INFO_TYPE_HASH, feed.feedId, feed.feed_address, feed.feedType]
    )
  );
}
function hashFeedInfoArray(feeds) {
  const hashes = feeds.map(hashFeedInfo);
  return ethers.ethers.utils.keccak256(
    ethers.ethers.utils.defaultAbiCoder.encode(["bytes32[]"], [hashes])
  );
}
function hashPrivateIntent(privateIntent) {
  const oracleFeedsHash = hashFeedInfoArray(privateIntent.oracleFeeds);
  return ethers.ethers.utils.keccak256(
    ethers.ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "uint256", "uint256", "uint256", "bytes32", "bytes32"],
      [
        PRIVATE_INTENT_TYPE_HASH,
        privateIntent.totalAmount,
        privateIntent.exactFrequency,
        privateIntent.numChunks,
        privateIntent.salt,
        oracleFeedsHash
      ]
    )
  );
}
var OUTPUT_ALLOCATION_TYPE = "OutputAllocation(address recipient,uint16 basisPoints)";
var OUTPUT_ALLOCATION_TYPE_HASH = ethers.ethers.utils.keccak256(
  ethers.ethers.utils.toUtf8Bytes(OUTPUT_ALLOCATION_TYPE)
);
function hashOutputAllocation(allocation) {
  return ethers.ethers.utils.keccak256(
    ethers.ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "address", "uint16"],
      [
        OUTPUT_ALLOCATION_TYPE_HASH,
        allocation.recipient,
        allocation.basisPoints
      ]
    )
  );
}
function hashOutputAllocations(allocations) {
  const hashes = allocations.map(hashOutputAllocation);
  return ethers.ethers.utils.keccak256(
    ethers.ethers.utils.defaultAbiCoder.encode(["bytes32[]"], [hashes])
  );
}
var DCA_INTENT_TYPE = "DCAIntent(address swapper,uint256 nonce,uint256 chainId,address hookAddress,bool isExactIn,address inputToken,address outputToken,address cosigner,uint256 minPeriod,uint256 maxPeriod,uint256 minChunkSize,uint256 maxChunkSize,uint256 minPrice,uint256 deadline,OutputAllocation[] outputAllocations,PrivateIntent privateIntent)" + OUTPUT_ALLOCATION_TYPE + PRIVATE_INTENT_TYPE;
var DCA_INTENT_TYPE_HASH = ethers.ethers.utils.keccak256(
  ethers.ethers.utils.toUtf8Bytes(DCA_INTENT_TYPE)
);
function hashDCAIntent(intent, privateIntentHash) {
  const outputAllocationsHash = hashOutputAllocations(intent.outputAllocations);
  return ethers.ethers.utils.keccak256(
    ethers.ethers.utils.defaultAbiCoder.encode(
      [
        "bytes32",
        "address",
        "uint256",
        "uint256",
        "address",
        "bool",
        "address",
        "address",
        "address",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "bytes32",
        "bytes32"
      ],
      [
        DCA_INTENT_TYPE_HASH,
        intent.swapper,
        intent.nonce,
        intent.chainId,
        intent.hookAddress,
        intent.isExactIn,
        intent.inputToken,
        intent.outputToken,
        intent.cosigner,
        intent.minPeriod,
        intent.maxPeriod,
        intent.minChunkSize,
        intent.maxChunkSize,
        intent.minPrice,
        intent.deadline,
        outputAllocationsHash,
        privateIntentHash
      ]
    )
  );
}
var DCA_COSIGNER_DATA_TYPE = "DCAOrderCosignerData(address swapper,uint96 nonce,uint160 execAmount,uint96 orderNonce,uint160 limitAmount)";
var DCA_COSIGNER_DATA_TYPE_HASH = ethers.ethers.utils.keccak256(
  ethers.ethers.utils.toUtf8Bytes(DCA_COSIGNER_DATA_TYPE)
);
function hashDCACosignerData(cosignerData) {
  return ethers.ethers.utils.keccak256(
    ethers.ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "address", "uint96", "uint160", "uint96", "uint160"],
      [
        DCA_COSIGNER_DATA_TYPE_HASH,
        cosignerData.swapper,
        cosignerData.nonce,
        cosignerData.execAmount,
        cosignerData.orderNonce,
        cosignerData.limitAmount
      ]
    )
  );
}
var DCA_INTENT_TYPES = {
  DCAIntent: [
    { name: "swapper", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "chainId", type: "uint256" },
    { name: "hookAddress", type: "address" },
    { name: "isExactIn", type: "bool" },
    { name: "inputToken", type: "address" },
    { name: "outputToken", type: "address" },
    { name: "cosigner", type: "address" },
    { name: "minPeriod", type: "uint256" },
    { name: "maxPeriod", type: "uint256" },
    { name: "minChunkSize", type: "uint256" },
    { name: "maxChunkSize", type: "uint256" },
    { name: "minPrice", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "outputAllocations", type: "OutputAllocation[]" },
    { name: "privateIntent", type: "PrivateIntent" }
  ],
  OutputAllocation: [
    { name: "recipient", type: "address" },
    { name: "basisPoints", type: "uint16" }
  ],
  PrivateIntent: [
    { name: "totalAmount", type: "uint256" },
    { name: "exactFrequency", type: "uint256" },
    { name: "numChunks", type: "uint256" },
    { name: "salt", type: "bytes32" },
    { name: "oracleFeeds", type: "FeedInfo[]" }
  ],
  FeedInfo: [
    { name: "feedId", type: "bytes32" },
    { name: "feed_address", type: "address" },
    { name: "feedType", type: "string" }
  ]
};

// src/uniswapx/constants/v4.ts
ethers.ethers.utils.keccak256(
  ethers.ethers.utils.toUtf8Bytes(
    "EIP712Domain(string name,uint256 chainId,address verifyingContract)"
  )
);
ethers.ethers.utils.keccak256(
  ethers.ethers.utils.toUtf8Bytes(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
  )
);
ethers.ethers.utils.keccak256(
  ethers.ethers.utils.toUtf8Bytes(
    "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,GenericOrder witness)GenericOrder(address resolver,bytes32 orderHash)TokenPermissions(address token,uint256 amount)"
  )
);
ethers.ethers.utils.keccak256(
  ethers.ethers.utils.toUtf8Bytes("TokenPermissions(address token,uint256 amount)")
);
var BASE_SCALING_FACTOR = ethers.ethers.constants.WeiPerEther;

// src/uniswapx/order/v4/HybridOrder.ts
var ZERO_ADDRESS = ethers.ethers.constants.AddressZero;
var WAD = ethers.ethers.constants.WeiPerEther;
var MAX_UINT_240 = ethers.BigNumber.from(1).shl(240).sub(1);
var MAX_UINT_16 = 65535;
var PRICE_CURVE_DURATION_SHIFT = 240;
var HYBRID_ORDER_ABI = [
  "tuple(" + [
    "tuple(address,address,uint256,uint256,address,bytes,address,bytes,address)",
    "address",
    "tuple(address,uint256)",
    "tuple(address,uint256,address)[]",
    "uint256",
    "uint256",
    "uint256",
    "uint256[]",
    "tuple(uint256,uint256[])",
    "bytes"
  ].join(",") + ")"
];
var OrderResolutionError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "OrderResolutionError";
  }
};
var HybridOrderPriceCurveError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "HybridOrderPriceCurveError";
  }
};
var HybridOrderCosignatureError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "HybridOrderCosignatureError";
  }
};
function parseSerializedHybridOrder(encoded) {
  const abiCoder = new ethers.ethers.utils.AbiCoder();
  const [resolver, orderData] = abiCoder.decode(
    ["address", "bytes"],
    encoded
  );
  const decoded = abiCoder.decode(HYBRID_ORDER_ABI, orderData);
  const [
    [
      [
        reactor,
        swapper,
        nonce,
        deadline,
        preExecutionHook,
        preExecutionHookData,
        postExecutionHook,
        postExecutionHookData,
        auctionResolver
      ],
      cosigner,
      [inputToken, inputMaxAmount],
      outputs,
      auctionStartBlock,
      baselinePriorityFee,
      scalingFactor,
      priceCurve,
      [auctionTargetBlock, supplementalPriceCurve],
      cosignature
    ]
  ] = decoded;
  return {
    resolver,
    info: {
      reactor,
      swapper,
      nonce,
      deadline: deadline.toNumber(),
      preExecutionHook,
      preExecutionHookData,
      postExecutionHook,
      postExecutionHookData,
      auctionResolver,
      cosigner,
      input: { token: inputToken, maxAmount: inputMaxAmount },
      outputs: outputs.map(
        ([token, minAmount, recipient]) => ({
          token,
          minAmount,
          recipient
        })
      ),
      auctionStartBlock,
      baselinePriorityFee,
      scalingFactor,
      priceCurve: [...priceCurve],
      cosignerData: {
        auctionTargetBlock,
        supplementalPriceCurve: [...supplementalPriceCurve]
      },
      cosignature
    }
  };
}
var UnsignedHybridOrder = class _UnsignedHybridOrder {
  constructor(info, chainId, resolver, _permit2Address) {
    this.info = info;
    this.chainId = chainId;
    this.resolver = resolver;
    this.permit2Address = getPermit2(chainId, _permit2Address);
  }
  /**
   * Parse a serialized HybridOrder into an UnsignedHybridOrder
   */
  static parse(encoded, chainId, permit2) {
    const { resolver, info } = parseSerializedHybridOrder(encoded);
    const unsignedInfo = {
      reactor: info.reactor,
      swapper: info.swapper,
      nonce: info.nonce,
      deadline: info.deadline,
      preExecutionHook: info.preExecutionHook,
      preExecutionHookData: info.preExecutionHookData,
      postExecutionHook: info.postExecutionHook,
      postExecutionHookData: info.postExecutionHookData,
      auctionResolver: info.auctionResolver,
      cosigner: info.cosigner,
      input: info.input,
      outputs: info.outputs,
      auctionStartBlock: info.auctionStartBlock,
      baselinePriorityFee: info.baselinePriorityFee,
      scalingFactor: info.scalingFactor,
      priceCurve: info.priceCurve
    };
    return new _UnsignedHybridOrder(unsignedInfo, chainId, resolver, permit2);
  }
  static fromJSON(json, chainId, resolver, _permit2Address) {
    return new _UnsignedHybridOrder(
      {
        reactor: json.reactor,
        swapper: json.swapper,
        nonce: ethers.BigNumber.from(json.nonce),
        deadline: json.deadline,
        preExecutionHook: json.preExecutionHook,
        preExecutionHookData: json.preExecutionHookData,
        postExecutionHook: json.postExecutionHook,
        postExecutionHookData: json.postExecutionHookData,
        auctionResolver: json.auctionResolver,
        cosigner: json.cosigner,
        input: {
          token: json.input.token,
          maxAmount: ethers.BigNumber.from(json.input.maxAmount)
        },
        outputs: json.outputs.map((output) => ({
          token: output.token,
          minAmount: ethers.BigNumber.from(output.minAmount),
          recipient: output.recipient
        })),
        auctionStartBlock: ethers.BigNumber.from(json.auctionStartBlock),
        baselinePriorityFee: ethers.BigNumber.from(json.baselinePriorityFee),
        scalingFactor: ethers.BigNumber.from(json.scalingFactor),
        priceCurve: json.priceCurve.map((value) => ethers.BigNumber.from(value))
      },
      chainId,
      resolver,
      _permit2Address
    );
  }
  /**
   * Encode a price curve element from duration and scaling factor
   */
  static encodePriceCurveElement(duration, scalingFactor) {
    if (duration < 0 || duration > MAX_UINT_16) {
      throw new HybridOrderPriceCurveError(
        `Duration must be between 0 and ${MAX_UINT_16} (fits in 16 bits)`
      );
    }
    if (scalingFactor.lt(0) || scalingFactor.gt(MAX_UINT_240)) {
      throw new HybridOrderPriceCurveError(
        "Scaling factor must be between 0 and 2^240-1"
      );
    }
    return encodePriceCurveElement(duration, scalingFactor);
  }
  /**
   * Decode a price curve element into duration and scaling factor
   */
  static decodePriceCurveElement(value) {
    return decodePriceCurveElement(value);
  }
  hash() {
    return hashHybridOrder({
      ...this.info,
      cosignerData: {
        auctionTargetBlock: ethers.BigNumber.from(0)}});
  }
  serialize() {
    const abiCoder = new ethers.ethers.utils.AbiCoder();
    const orderData = abiCoder.encode(HYBRID_ORDER_ABI, [
      [
        [
          this.info.reactor,
          this.info.swapper,
          this.info.nonce,
          this.info.deadline,
          this.info.preExecutionHook,
          this.info.preExecutionHookData,
          this.info.postExecutionHook,
          this.info.postExecutionHookData,
          this.info.auctionResolver
        ],
        this.info.cosigner,
        [this.info.input.token, this.info.input.maxAmount],
        this.info.outputs.map((output) => [
          output.token,
          output.minAmount,
          output.recipient
        ]),
        this.info.auctionStartBlock,
        this.info.baselinePriorityFee,
        this.info.scalingFactor,
        this.info.priceCurve,
        [ethers.BigNumber.from(0), []],
        // Empty cosignerData
        "0x"
        // Empty cosignature
      ]
    ]);
    return abiCoder.encode(["address", "bytes"], [this.resolver, orderData]);
  }
  permitData() {
    return SignatureTransfer.getPermitData(
      this.toPermit(),
      this.permit2Address,
      this.chainId,
      this.witness()
    );
  }
  getSigner(signature) {
    return ethers.ethers.utils.computeAddress(
      ethers.ethers.utils.recoverPublicKey(
        SignatureTransfer.hash(
          this.toPermit(),
          this.permit2Address,
          this.chainId,
          this.witness()
        ),
        signature
      )
    );
  }
  toPermit() {
    return {
      permitted: {
        token: this.info.input.token,
        amount: this.info.input.maxAmount
      },
      spender: this.info.preExecutionHook,
      nonce: this.info.nonce,
      deadline: this.info.deadline
    };
  }
  witness() {
    return {
      witness: {
        info: {
          reactor: this.info.reactor,
          swapper: this.info.swapper,
          nonce: this.info.nonce,
          deadline: this.info.deadline,
          preExecutionHook: this.info.preExecutionHook,
          preExecutionHookData: this.info.preExecutionHookData,
          postExecutionHook: this.info.postExecutionHook,
          postExecutionHookData: this.info.postExecutionHookData,
          auctionResolver: this.info.auctionResolver
        },
        cosigner: this.info.cosigner,
        input: this.info.input,
        outputs: this.info.outputs,
        auctionStartBlock: this.info.auctionStartBlock,
        baselinePriorityFee: this.info.baselinePriorityFee,
        scalingFactor: this.info.scalingFactor,
        priceCurve: this.info.priceCurve
      },
      witnessTypeName: "HybridOrder",
      witnessType: HYBRID_ORDER_TYPES
    };
  }
  get blockOverrides() {
    if (this.info.auctionStartBlock.isZero()) {
      return void 0;
    }
    return {
      number: bytes.hexStripZeros(this.info.auctionStartBlock.toHexString())
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  resolve(_options) {
    throw new Error("Cannot resolve unsigned order - cosigner data required");
  }
  cosignatureHash(cosignerData) {
    return hashHybridCosignerData(this.hash(), cosignerData, this.chainId);
  }
  toJSON() {
    return {
      chainId: this.chainId,
      resolver: this.resolver,
      permit2Address: this.permit2Address,
      reactor: this.info.reactor,
      swapper: this.info.swapper,
      nonce: this.info.nonce.toString(),
      deadline: this.info.deadline,
      preExecutionHook: this.info.preExecutionHook,
      preExecutionHookData: this.info.preExecutionHookData,
      postExecutionHook: this.info.postExecutionHook,
      postExecutionHookData: this.info.postExecutionHookData,
      auctionResolver: this.info.auctionResolver,
      cosigner: this.info.cosigner,
      input: {
        token: this.info.input.token,
        maxAmount: this.info.input.maxAmount.toString()
      },
      outputs: this.info.outputs.map((output) => ({
        token: output.token,
        minAmount: output.minAmount.toString(),
        recipient: output.recipient
      })),
      auctionStartBlock: this.info.auctionStartBlock.toString(),
      baselinePriorityFee: this.info.baselinePriorityFee.toString(),
      scalingFactor: this.info.scalingFactor.toString(),
      priceCurve: this.info.priceCurve.map((value) => value.toString())
    };
  }
};
var CosignedHybridOrder = class _CosignedHybridOrder extends UnsignedHybridOrder {
  constructor(info, chainId, resolver, _permit2Address) {
    super(info, chainId, resolver, _permit2Address);
    this.info = info;
    this.chainId = chainId;
    this.resolver = resolver;
  }
  /**
   * Parse a serialized HybridOrder into a CosignedHybridOrder
   */
  static parse(encoded, chainId, permit2) {
    const { resolver, info } = parseSerializedHybridOrder(encoded);
    return new _CosignedHybridOrder(info, chainId, resolver, permit2);
  }
  /**
   * Create a CosignedHybridOrder from an UnsignedHybridOrder
   */
  static fromUnsignedOrder(order, cosignerData, cosignature) {
    return new _CosignedHybridOrder(
      {
        ...order.info,
        cosignerData,
        cosignature
      },
      order.chainId,
      order.resolver,
      order.permit2Address
    );
  }
  static fromJSON(json, chainId, resolver, _permit2Address) {
    return new _CosignedHybridOrder(
      {
        reactor: json.reactor,
        swapper: json.swapper,
        nonce: ethers.BigNumber.from(json.nonce),
        deadline: json.deadline,
        preExecutionHook: json.preExecutionHook,
        preExecutionHookData: json.preExecutionHookData,
        postExecutionHook: json.postExecutionHook,
        postExecutionHookData: json.postExecutionHookData,
        auctionResolver: json.auctionResolver,
        cosigner: json.cosigner,
        input: {
          token: json.input.token,
          maxAmount: ethers.BigNumber.from(json.input.maxAmount)
        },
        outputs: json.outputs.map((output) => ({
          token: output.token,
          minAmount: ethers.BigNumber.from(output.minAmount),
          recipient: output.recipient
        })),
        auctionStartBlock: ethers.BigNumber.from(json.auctionStartBlock),
        baselinePriorityFee: ethers.BigNumber.from(json.baselinePriorityFee),
        scalingFactor: ethers.BigNumber.from(json.scalingFactor),
        priceCurve: json.priceCurve.map((value) => ethers.BigNumber.from(value)),
        cosignerData: {
          auctionTargetBlock: ethers.BigNumber.from(
            json.cosignerData.auctionTargetBlock
          ),
          supplementalPriceCurve: json.cosignerData.supplementalPriceCurve.map(
            (value) => ethers.BigNumber.from(value)
          )
        },
        cosignature: json.cosignature
      },
      chainId,
      resolver,
      _permit2Address
    );
  }
  hash() {
    return hashHybridOrder(this.info);
  }
  serialize() {
    const abiCoder = new ethers.ethers.utils.AbiCoder();
    const orderData = abiCoder.encode(HYBRID_ORDER_ABI, [
      [
        [
          this.info.reactor,
          this.info.swapper,
          this.info.nonce,
          this.info.deadline,
          this.info.preExecutionHook,
          this.info.preExecutionHookData,
          this.info.postExecutionHook,
          this.info.postExecutionHookData,
          this.info.auctionResolver
        ],
        this.info.cosigner,
        [this.info.input.token, this.info.input.maxAmount],
        this.info.outputs.map((output) => [
          output.token,
          output.minAmount,
          output.recipient
        ]),
        this.info.auctionStartBlock,
        this.info.baselinePriorityFee,
        this.info.scalingFactor,
        this.info.priceCurve,
        [
          this.info.cosignerData.auctionTargetBlock,
          this.info.cosignerData.supplementalPriceCurve
        ],
        this.info.cosignature
      ]
    ]);
    return abiCoder.encode(["address", "bytes"], [this.resolver, orderData]);
  }
  get blockOverrides() {
    const block = !this.info.cosignerData.auctionTargetBlock.isZero() ? this.info.cosignerData.auctionTargetBlock : this.info.auctionStartBlock;
    if (block.isZero()) {
      return void 0;
    }
    return {
      number: bytes.hexStripZeros(block.toHexString())
    };
  }
  resolve(options) {
    let auctionTargetBlock = this.info.auctionStartBlock;
    let effectivePriceCurve = this.info.priceCurve.map(
      (value) => ethers.BigNumber.from(value)
    );
    if (this.info.cosigner !== ZERO_ADDRESS) {
      const recovered = this.recoverCosigner();
      if (ethers.ethers.utils.getAddress(recovered) !== ethers.ethers.utils.getAddress(this.info.cosigner)) {
        throw new HybridOrderCosignatureError("Invalid cosignature");
      }
      if (!this.info.cosignerData.auctionTargetBlock.isZero()) {
        auctionTargetBlock = this.info.cosignerData.auctionTargetBlock;
      }
      if (this.info.cosignerData.supplementalPriceCurve.length > 0) {
        effectivePriceCurve = applySupplementalPriceCurve(
          effectivePriceCurve,
          this.info.cosignerData.supplementalPriceCurve
        );
      }
    }
    if (!auctionTargetBlock.isZero() && options.currentBlock.lt(auctionTargetBlock)) {
      throw new OrderResolutionError("Target block in the future");
    }
    const currentScalingFactor = deriveCurrentScalingFactor(
      this.info,
      effectivePriceCurve,
      auctionTargetBlock,
      options.currentBlock
    );
    const priorityFeeAboveBaseline = options.priorityFeeWei.gt(
      this.info.baselinePriorityFee
    ) ? options.priorityFeeWei.sub(this.info.baselinePriorityFee) : ethers.BigNumber.from(0);
    const useExactIn = this.info.scalingFactor.gt(BASE_SCALING_FACTOR) || this.info.scalingFactor.eq(BASE_SCALING_FACTOR) && currentScalingFactor.gte(BASE_SCALING_FACTOR);
    if (useExactIn) {
      const scalingMultiplier2 = currentScalingFactor.add(
        this.info.scalingFactor.sub(BASE_SCALING_FACTOR).mul(priorityFeeAboveBaseline)
      );
      return {
        input: {
          token: this.info.input.token,
          amount: this.info.input.maxAmount
        },
        outputs: scaleOutputs2(this.info.outputs, scalingMultiplier2)
      };
    }
    const scalingMultiplier = currentScalingFactor.sub(
      BASE_SCALING_FACTOR.sub(this.info.scalingFactor).mul(
        priorityFeeAboveBaseline
      )
    );
    return {
      input: scaleInput2(this.info.input, scalingMultiplier),
      outputs: this.info.outputs.map((output) => ({
        token: output.token,
        amount: output.minAmount
      }))
    };
  }
  toJSON() {
    return {
      chainId: this.chainId,
      resolver: this.resolver,
      permit2Address: this.permit2Address,
      reactor: this.info.reactor,
      swapper: this.info.swapper,
      nonce: this.info.nonce.toString(),
      deadline: this.info.deadline,
      preExecutionHook: this.info.preExecutionHook,
      preExecutionHookData: this.info.preExecutionHookData,
      postExecutionHook: this.info.postExecutionHook,
      postExecutionHookData: this.info.postExecutionHookData,
      auctionResolver: this.info.auctionResolver,
      cosigner: this.info.cosigner,
      input: {
        token: this.info.input.token,
        maxAmount: this.info.input.maxAmount.toString()
      },
      outputs: this.info.outputs.map((output) => ({
        token: output.token,
        minAmount: output.minAmount.toString(),
        recipient: output.recipient
      })),
      auctionStartBlock: this.info.auctionStartBlock.toString(),
      baselinePriorityFee: this.info.baselinePriorityFee.toString(),
      scalingFactor: this.info.scalingFactor.toString(),
      priceCurve: this.info.priceCurve.map((value) => value.toString()),
      cosignerData: {
        auctionTargetBlock: this.info.cosignerData.auctionTargetBlock.toString(),
        supplementalPriceCurve: this.info.cosignerData.supplementalPriceCurve.map(
          (value) => value.toString()
        )
      },
      cosignature: this.info.cosignature
    };
  }
  cosignatureHash() {
    return hashHybridCosignerData(
      this.hash(),
      this.info.cosignerData,
      this.chainId
    );
  }
  recoverCosigner() {
    return ethers.ethers.utils.recoverAddress(
      this.cosignatureHash(),
      this.info.cosignature
    );
  }
};
function applySupplementalPriceCurve(priceCurve, supplemental) {
  if (supplemental.length === 0) {
    return priceCurve.map((value) => ethers.BigNumber.from(value));
  }
  if (priceCurve.length === 0) {
    throw new HybridOrderPriceCurveError(
      "Supplemental curve provided without base curve"
    );
  }
  const combined = priceCurve.map((value) => ethers.BigNumber.from(value));
  const length = Math.min(priceCurve.length, supplemental.length);
  for (let i = 0; i < length; i++) {
    const { duration, scalingFactor } = decodePriceCurveElement(priceCurve[i]);
    const supplementalScaling = ethers.BigNumber.from(supplemental[i]);
    if (!sharesScalingDirection(scalingFactor, supplementalScaling)) {
      throw new HybridOrderPriceCurveError(
        "Supplemental scaling direction mismatch"
      );
    }
    const mergedScaling = scalingFactor.add(supplementalScaling).sub(BASE_SCALING_FACTOR);
    if (mergedScaling.lt(0) || mergedScaling.gt(MAX_UINT_240)) {
      throw new HybridOrderPriceCurveError(
        "Supplemental scaling factor out of range"
      );
    }
    combined[i] = encodePriceCurveElement(duration, mergedScaling);
  }
  return combined;
}
function deriveCurrentScalingFactor(order, priceCurve, targetBlock, fillBlock) {
  if (targetBlock.isZero()) {
    if (priceCurve.length !== 0) {
      throw new HybridOrderPriceCurveError("Invalid target block designation");
    }
    return BASE_SCALING_FACTOR;
  }
  if (targetBlock.gt(fillBlock)) {
    throw new OrderResolutionError("Invalid target block");
  }
  const blocksPassed = fillBlock.sub(targetBlock).toNumber();
  const currentScalingFactor = getCalculatedScalingFactor(
    priceCurve,
    blocksPassed
  );
  if (!sharesScalingDirection(order.scalingFactor, currentScalingFactor)) {
    throw new HybridOrderPriceCurveError("Scaling direction mismatch");
  }
  return currentScalingFactor;
}
function getCalculatedScalingFactor(parameters, blocksPassed) {
  if (parameters.length === 0) {
    return BASE_SCALING_FACTOR;
  }
  let blocksCounted = 0;
  let lastZeroDurationScaling = null;
  let previousDuration = 0;
  for (let i = 0; i < parameters.length; i++) {
    const { duration, scalingFactor } = decodePriceCurveElement(parameters[i]);
    if (duration === 0) {
      if (blocksPassed >= blocksCounted) {
        lastZeroDurationScaling = scalingFactor;
        if (blocksPassed === blocksCounted) {
          return scalingFactor;
        }
      }
      previousDuration = duration;
      continue;
    }
    const segmentEnd = blocksCounted + duration;
    if (blocksPassed < segmentEnd) {
      if (previousDuration === 0 && lastZeroDurationScaling) {
        if (!sharesScalingDirection(lastZeroDurationScaling, scalingFactor)) {
          throw new HybridOrderPriceCurveError(
            "Zero duration scaling mismatch"
          );
        }
        return locateCurrentAmount(
          lastZeroDurationScaling,
          scalingFactor,
          blocksCounted,
          blocksPassed,
          segmentEnd,
          lastZeroDurationScaling.gt(BASE_SCALING_FACTOR)
        );
      }
      const endScalingFactor = i + 1 < parameters.length ? decodePriceCurveElement(parameters[i + 1]).scalingFactor : BASE_SCALING_FACTOR;
      if (!sharesScalingDirection(scalingFactor, endScalingFactor)) {
        throw new HybridOrderPriceCurveError("Scaling direction mismatch");
      }
      return locateCurrentAmount(
        scalingFactor,
        endScalingFactor,
        blocksCounted,
        blocksPassed,
        segmentEnd,
        scalingFactor.gt(BASE_SCALING_FACTOR)
      );
    }
    blocksCounted = segmentEnd;
    previousDuration = duration;
  }
  if (blocksPassed >= blocksCounted) {
    throw new HybridOrderPriceCurveError("Price curve blocks exceeded");
  }
  throw new HybridOrderPriceCurveError("Unable to derive scaling factor");
}
function locateCurrentAmount(startAmount, endAmount, startBlock, currentBlock, endBlock, roundUp) {
  if (startAmount.eq(endAmount)) {
    return endAmount;
  }
  const duration = endBlock - startBlock;
  if (duration === 0) {
    throw new HybridOrderPriceCurveError(
      "Invalid duration: zero duration when it shouldn't be"
    );
  }
  const elapsed = currentBlock - startBlock;
  const remaining = duration - elapsed;
  const durationBN = ethers.BigNumber.from(duration);
  const elapsedBN = ethers.BigNumber.from(elapsed);
  const remainingBN = ethers.BigNumber.from(remaining);
  const totalBeforeDivision = startAmount.mul(remainingBN).add(endAmount.mul(elapsedBN));
  if (totalBeforeDivision.isZero()) {
    return ethers.BigNumber.from(0);
  }
  if (roundUp) {
    return totalBeforeDivision.sub(1).div(durationBN).add(1);
  }
  return totalBeforeDivision.div(durationBN);
}
function scaleOutputs2(outputs, scalingMultiplier) {
  return outputs.map((output) => ({
    token: output.token,
    amount: mulWadUp(output.minAmount, scalingMultiplier)
  }));
}
function scaleInput2(input, scalingMultiplier) {
  return {
    token: input.token,
    amount: mulWad(input.maxAmount, scalingMultiplier)
  };
}
function mulWad(a, b) {
  if (a.isZero() || b.isZero()) {
    return ethers.BigNumber.from(0);
  }
  return a.mul(b).div(WAD);
}
function mulWadUp(a, b) {
  if (a.isZero() || b.isZero()) {
    return ethers.BigNumber.from(0);
  }
  return a.mul(b).add(WAD).sub(1).div(WAD);
}
function decodePriceCurveElement(value) {
  const scalingFactor = value.and(MAX_UINT_240);
  const duration = value.shr(PRICE_CURVE_DURATION_SHIFT).toNumber();
  return { duration, scalingFactor };
}
function encodePriceCurveElement(duration, scalingFactor) {
  return ethers.BigNumber.from(duration).shl(PRICE_CURVE_DURATION_SHIFT).or(scalingFactor);
}
function sharesScalingDirection(a, b) {
  if (a.eq(BASE_SCALING_FACTOR) || b.eq(BASE_SCALING_FACTOR)) {
    return true;
  }
  return a.gt(BASE_SCALING_FACTOR) === b.gt(BASE_SCALING_FACTOR);
}
function nativeCurrencyAddressString(chainId) {
  switch (chainId) {
    case 137 /* POLYGON */:
      return "MATIC" /* MATIC */;
    case 56 /* BNB */:
      return "BNB" /* BNB */;
    case 43114 /* AVALANCHE */:
      return "AVAX" /* AVAX */;
    default:
      return "ETH" /* ETH */;
  }
}
function areCurrenciesEqual(currency, address, chainId) {
  if (currency.chainId !== chainId) return false;
  if (currency.isNative) {
    return address === ethers.constants.AddressZero || address === nativeCurrencyAddressString(chainId);
  }
  return currency.address.toLowerCase() === address?.toLowerCase();
}

// src/uniswapx/trade/DutchOrderTrade.ts
var DutchOrderTrade = class {
  constructor({
    currencyIn,
    currenciesOut,
    orderInfo,
    tradeType
  }) {
    this._currencyIn = currencyIn;
    this._currenciesOut = currenciesOut;
    this.tradeType = tradeType;
    this.order = new DutchOrder(orderInfo, currencyIn.chainId);
  }
  get inputAmount() {
    if (this._inputAmount) return this._inputAmount;
    const amount = CurrencyAmount.fromRawAmount(
      this._currencyIn,
      this.order.info.input.startAmount.toString()
    );
    this._inputAmount = amount;
    return amount;
  }
  get outputAmounts() {
    if (this._outputAmounts) return this._outputAmounts;
    const amounts = this.order.info.outputs.map((output) => {
      const currencyOut = this._currenciesOut.find(
        (currency) => areCurrenciesEqual(currency, output.token, currency.chainId)
      );
      if (!currencyOut) {
        throw new Error("currency not found in output array");
      }
      return CurrencyAmount.fromRawAmount(
        currencyOut,
        output.startAmount.toString()
      );
    });
    this._outputAmounts = amounts;
    return amounts;
  }
  getFirstNonFeeOutputStartEndAmounts() {
    if (this._firstNonFeeOutputStartEndAmounts)
      return this._firstNonFeeOutputStartEndAmounts;
    if (this.order.info.outputs.length === 0) {
      throw new Error("there must be at least one output token");
    }
    const output = this.order.info.outputs[0];
    const currencyOut = this._currenciesOut.find(
      (currency) => areCurrenciesEqual(currency, output.token, currency.chainId)
    );
    if (!currencyOut) {
      throw new Error(
        "currency output from order must exist in currenciesOut list"
      );
    }
    const startEndAmounts = {
      startAmount: CurrencyAmount.fromRawAmount(
        currencyOut,
        output.startAmount.toString()
      ),
      endAmount: CurrencyAmount.fromRawAmount(
        currencyOut,
        output.endAmount.toString()
      )
    };
    this._firstNonFeeOutputStartEndAmounts = startEndAmounts;
    return startEndAmounts;
  }
  // TODO: revise when there are actually multiple output amounts. for now, assume only one non-fee output at a time
  get outputAmount() {
    return this.getFirstNonFeeOutputStartEndAmounts().startAmount;
  }
  minimumAmountOut() {
    return this.getFirstNonFeeOutputStartEndAmounts().endAmount;
  }
  maximumAmountIn() {
    return CurrencyAmount.fromRawAmount(
      this._currencyIn,
      this.order.info.input.endAmount.toString()
    );
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
   * Return the execution price after accounting for slippage tolerance
   * @returns The execution price
   */
  worstExecutionPrice() {
    return new Price(
      this.inputAmount.currency,
      this.outputAmount.currency,
      this.maximumAmountIn().quotient,
      this.minimumAmountOut().quotient
    );
  }
};

// src/uniswapx/trade/V2DutchOrderTrade.ts
var V2DutchOrderTrade = class {
  constructor({
    currencyIn,
    currenciesOut,
    orderInfo,
    tradeType
  }) {
    this._currencyIn = currencyIn;
    this._currenciesOut = currenciesOut;
    this.tradeType = tradeType;
    this.order = new UnsignedV2DutchOrder(orderInfo, currencyIn.chainId);
  }
  get inputAmount() {
    if (this._inputAmount) return this._inputAmount;
    const amount = CurrencyAmount.fromRawAmount(
      this._currencyIn,
      this.order.info.input.startAmount.toString()
    );
    this._inputAmount = amount;
    return amount;
  }
  get outputAmounts() {
    if (this._outputAmounts) return this._outputAmounts;
    const amounts = this.order.info.outputs.map((output) => {
      const currencyOut = this._currenciesOut.find(
        (currency) => areCurrenciesEqual(currency, output.token, currency.chainId)
      );
      if (!currencyOut) {
        throw new Error("currency not found in output array");
      }
      return CurrencyAmount.fromRawAmount(
        currencyOut,
        output.startAmount.toString()
      );
    });
    this._outputAmounts = amounts;
    return amounts;
  }
  getFirstNonFeeOutputStartEndAmounts() {
    if (this._firstNonFeeOutputStartEndAmounts)
      return this._firstNonFeeOutputStartEndAmounts;
    if (this.order.info.outputs.length === 0) {
      throw new Error("there must be at least one output token");
    }
    const output = this.order.info.outputs[0];
    const currencyOut = this._currenciesOut.find(
      (currency) => areCurrenciesEqual(currency, output.token, currency.chainId)
    );
    if (!currencyOut) {
      throw new Error(
        "currency output from order must exist in currenciesOut list"
      );
    }
    const startEndAmounts = {
      startAmount: CurrencyAmount.fromRawAmount(
        currencyOut,
        output.startAmount.toString()
      ),
      endAmount: CurrencyAmount.fromRawAmount(
        currencyOut,
        output.endAmount.toString()
      )
    };
    this._firstNonFeeOutputStartEndAmounts = startEndAmounts;
    return startEndAmounts;
  }
  // TODO: revise when there are actually multiple output amounts. for now, assume only one non-fee output at a time
  get outputAmount() {
    return this.getFirstNonFeeOutputStartEndAmounts().startAmount;
  }
  minimumAmountOut() {
    return this.getFirstNonFeeOutputStartEndAmounts().endAmount;
  }
  maximumAmountIn() {
    return CurrencyAmount.fromRawAmount(
      this._currencyIn,
      this.order.info.input.endAmount.toString()
    );
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
   * Return the execution price after accounting for slippage tolerance
   * @returns The execution price
   */
  worstExecutionPrice() {
    return new Price(
      this.inputAmount.currency,
      this.outputAmount.currency,
      this.maximumAmountIn().quotient,
      this.minimumAmountOut().quotient
    );
  }
};

// src/uniswapx/trade/PriorityOrderTrade.ts
var PriorityOrderTrade = class {
  constructor({
    currencyIn,
    currenciesOut,
    orderInfo,
    tradeType,
    expectedAmounts
  }) {
    this._currencyIn = currencyIn;
    this._currenciesOut = currenciesOut;
    this.tradeType = tradeType;
    this.expectedAmounts = expectedAmounts;
    this.order = new UnsignedPriorityOrder(orderInfo, currencyIn.chainId);
  }
  get inputAmount() {
    if (this._inputAmount) return this._inputAmount;
    const amount = this.expectedAmounts?.expectedAmountIn ? this.getExpectedAmountIn() : CurrencyAmount.fromRawAmount(
      this._currencyIn,
      this.order.info.input.amount.toString()
    );
    this._inputAmount = amount;
    return amount;
  }
  get outputAmounts() {
    if (this._outputAmounts) return this._outputAmounts;
    const amounts = this.order.info.outputs.map((output) => {
      const currencyOut = this._currenciesOut.find(
        (currency) => areCurrenciesEqual(currency, output.token, currency.chainId)
      );
      if (!currencyOut) {
        throw new Error("currency not found in output array");
      }
      return CurrencyAmount.fromRawAmount(
        currencyOut,
        output.amount.toString()
      );
    });
    this._outputAmounts = amounts;
    return amounts;
  }
  getFirstNonFeeOutputAmount() {
    if (this._firstNonFeeOutputAmount)
      return this._firstNonFeeOutputAmount;
    if (this.order.info.outputs.length === 0) {
      throw new Error("there must be at least one output token");
    }
    const output = this.order.info.outputs[0];
    const currencyOut = this._currenciesOut.find(
      (currency) => areCurrenciesEqual(currency, output.token, currency.chainId)
    );
    if (!currencyOut) {
      throw new Error(
        "currency output from order must exist in currenciesOut list"
      );
    }
    const amount = CurrencyAmount.fromRawAmount(
      currencyOut,
      output.amount.toString()
    );
    this._firstNonFeeOutputAmount = amount;
    return amount;
  }
  // TODO: revise when there are actually multiple output amounts. for now, assume only one non-fee output at a time
  get outputAmount() {
    return this.expectedAmounts?.expectedAmountOut ? this.getExpectedAmountOut() : this.getFirstNonFeeOutputAmount();
  }
  minimumAmountOut() {
    return this.getFirstNonFeeOutputAmount();
  }
  maximumAmountIn() {
    return CurrencyAmount.fromRawAmount(
      this._currencyIn,
      this.order.info.input.amount.toString()
    );
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
   * Return the execution price after accounting for slippage tolerance
   * @returns The execution price
   */
  worstExecutionPrice() {
    return new Price(
      this.inputAmount.currency,
      this.outputAmount.currency,
      this.maximumAmountIn().quotient,
      this.minimumAmountOut().quotient
    );
  }
  getExpectedAmountIn() {
    if (!this.expectedAmounts?.expectedAmountIn) {
      throw new Error("expectedAmountIn not set");
    }
    return CurrencyAmount.fromRawAmount(
      this._currencyIn,
      this.expectedAmounts.expectedAmountIn
    );
  }
  getExpectedAmountOut() {
    if (!this.expectedAmounts?.expectedAmountOut) {
      throw new Error("expectedAmountOut not set");
    }
    return CurrencyAmount.fromRawAmount(
      this._currenciesOut[0],
      this.expectedAmounts.expectedAmountOut
    );
  }
};

// src/uniswapx/trade/RelayOrderTrade.ts
var RelayOrderTrade = class {
  // Since Relay orders have no concept of an output amount, it must be provided as a constructor param
  // this is the output amount from the encoded swap, or the value to be used for execution price
  constructor({
    currenciesIn,
    outputAmount,
    orderInfo,
    tradeType
  }) {
    this._currenciesIn = currenciesIn;
    this._outputAmount = outputAmount;
    this.tradeType = tradeType;
    this.order = new RelayOrder(orderInfo, outputAmount.currency.chainId);
  }
  get outputAmount() {
    return this._outputAmount;
  }
  // This is the "tip" given to fillers of the order
  getFeeInputStartEndAmounts() {
    if (this._feeStartEndAmounts) return this._feeStartEndAmounts;
    if (!this.order.info.fee) {
      throw new Error("no fee found");
    }
    const currencyIn = this._currenciesIn.find(
      (currency) => areCurrenciesEqual(currency, this.order.info.fee.token, currency.chainId)
    );
    if (!currencyIn) {
      throw new Error(
        "currency output from order must exist in currenciesOut list"
      );
    }
    const startEndAmounts = {
      startAmount: CurrencyAmount.fromRawAmount(
        currencyIn,
        this.order.info.fee.startAmount.toString()
      ),
      endAmount: CurrencyAmount.fromRawAmount(
        currencyIn,
        this.order.info.fee.endAmount.toString()
      )
    };
    this._feeStartEndAmounts = startEndAmounts;
    return startEndAmounts;
  }
  // This is the input for the order
  getInputAmount() {
    if (this._inputAmount) return this._inputAmount;
    if (!this.order.info.input) {
      throw new Error("no input found");
    }
    const currencyIn = this._currenciesIn.find(
      (currency) => areCurrenciesEqual(
        currency,
        this.order.info.input.token,
        currency.chainId
      )
    );
    if (!currencyIn) {
      throw new Error(
        "currency input from order must exist in currenciesIn list"
      );
    }
    const inputAmount = CurrencyAmount.fromRawAmount(
      currencyIn,
      this.order.info.input.amount.toString()
    );
    this._inputAmount = inputAmount;
    return inputAmount;
  }
  // Gets the start amount for the first non-fee input
  // Relay order inputs only increase, so maximum denotes endAmount
  get amountIn() {
    return this.getInputAmount();
  }
  get amountInFee() {
    return this.getFeeInputStartEndAmounts().startAmount;
  }
  get maximumAmountInFee() {
    return this.getFeeInputStartEndAmounts().endAmount;
  }
  /**
   * The price expressed in terms of output amount/input amount.
   * @dev this only takes into account non fee inputs (does not include gas)
   */
  get executionPrice() {
    return this._executionPrice ?? (this._executionPrice = new Price(
      this.amountIn.currency,
      this.outputAmount.currency,
      this.amountIn.quotient,
      this.outputAmount.quotient
    ));
  }
  /**
   * Return the execution price after accounting for slippage tolerance
   * @dev this only takes into account non fee inputs (does not include gas)
   * @returns The execution price
   */
  worstExecutionPrice() {
    return new Price(
      this.amountIn.currency,
      this.outputAmount.currency,
      this.amountIn.quotient,
      this.outputAmount.quotient
    );
  }
};

// src/uniswapx/trade/V3DutchOrderTrade.ts
var V3DutchOrderTrade = class {
  constructor({
    currencyIn,
    currenciesOut,
    orderInfo,
    tradeType,
    expectedAmounts
  }) {
    this._currencyIn = currencyIn;
    this._currenciesOut = currenciesOut;
    this.tradeType = tradeType;
    this.expectedAmounts = expectedAmounts;
    this.order = new UnsignedV3DutchOrder(orderInfo, currencyIn.chainId);
  }
  get inputAmount() {
    if (this._inputAmount) return this._inputAmount;
    const amount = this.expectedAmounts?.expectedAmountIn ? this.getExpectedAmountIn() : CurrencyAmount.fromRawAmount(
      this._currencyIn,
      this.order.info.input.startAmount.toString()
    );
    this._inputAmount = amount;
    return amount;
  }
  get outputAmounts() {
    if (this._outputAmounts) return this._outputAmounts;
    const amounts = this.order.info.outputs.map((output) => {
      const currencyOut = this._currenciesOut.find(
        (currency) => areCurrenciesEqual(currency, output.token, currency.chainId)
      );
      if (!currencyOut) {
        throw new Error("Currency out not found");
      }
      return CurrencyAmount.fromRawAmount(currencyOut, output.startAmount.toString());
    });
    this._outputAmounts = amounts;
    return amounts;
  }
  // Same assumption as V2 that there is only one non-fee output at a time, and it exists at index 0
  get outputAmount() {
    return this.expectedAmounts?.expectedAmountOut ? this.getExpectedAmountOut() : this.outputAmounts[0];
  }
  minimumAmountOut() {
    const nonFeeOutput = this.order.info.outputs[0];
    const relativeAmounts = nonFeeOutput.curve.relativeAmounts;
    const startAmount = nonFeeOutput.startAmount;
    const maxRelativeAmount = relativeAmounts.reduce((max, amount) => amount > max ? amount : max, BigInt(0));
    const minOut = startAmount.sub(maxRelativeAmount.toString());
    return CurrencyAmount.fromRawAmount(this.outputAmount.currency, minOut.toString());
  }
  maximumAmountIn() {
    const maxAmountIn = this.order.info.input.maxAmount;
    return CurrencyAmount.fromRawAmount(
      this._currencyIn,
      maxAmountIn.toString()
    );
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
   * Return the execution price after accounting for slippage tolerance
   * @returns The execution price
   */
  worstExecutionPrice() {
    return new Price(
      this.inputAmount.currency,
      this.outputAmount.currency,
      this.maximumAmountIn().quotient,
      this.minimumAmountOut().quotient
    );
  }
  getExpectedAmountIn() {
    if (!this.expectedAmounts?.expectedAmountIn) {
      throw new Error("expectedAmountIn not set");
    }
    return CurrencyAmount.fromRawAmount(
      this._currencyIn,
      this.expectedAmounts.expectedAmountIn
    );
  }
  getExpectedAmountOut() {
    if (!this.expectedAmounts?.expectedAmountOut) {
      throw new Error("expectedAmountOut not set");
    }
    return CurrencyAmount.fromRawAmount(
      this._currenciesOut[0],
      this.expectedAmounts.expectedAmountOut
    );
  }
};

// src/uniswapx/trade/HybridOrderTrade.ts
var HybridOrderTrade = class {
  constructor({
    currencyIn,
    currenciesOut,
    orderInfo,
    chainId,
    resolver,
    permit2Address,
    tradeType,
    expectedAmounts
  }) {
    this._currencyIn = currencyIn;
    this._currenciesOut = currenciesOut;
    this.tradeType = tradeType;
    this.expectedAmounts = expectedAmounts;
    this.order = new CosignedHybridOrder(
      orderInfo,
      chainId,
      resolver,
      permit2Address
    );
  }
  get inputAmount() {
    if (this._inputAmount) return this._inputAmount;
    const amount = this.expectedAmounts?.expectedAmountIn ? this.getExpectedAmountIn() : CurrencyAmount.fromRawAmount(
      this._currencyIn,
      this.order.info.input.maxAmount.toString()
    );
    this._inputAmount = amount;
    return amount;
  }
  get outputAmounts() {
    if (this._outputAmounts) return this._outputAmounts;
    const amounts = this.order.info.outputs.map((output) => {
      const currencyOut = this._currenciesOut.find(
        (currency) => areCurrenciesEqual(currency, output.token, currency.chainId)
      );
      if (!currencyOut) {
        throw new Error("Currency out not found");
      }
      return CurrencyAmount.fromRawAmount(
        currencyOut,
        output.minAmount.toString()
      );
    });
    this._outputAmounts = amounts;
    return amounts;
  }
  // Same assumption as V3 that there is only one non-fee output at a time, and it exists at index 0
  get outputAmount() {
    return this.expectedAmounts?.expectedAmountOut ? this.getExpectedAmountOut() : this.outputAmounts[0];
  }
  /**
   * For exact-in orders: minimum amount out is the minAmount from the order
   * For exact-out orders: minimum amount out is the fixed output amount
   */
  minimumAmountOut() {
    const firstOutput = this.order.info.outputs[0];
    return CurrencyAmount.fromRawAmount(
      this.outputAmount.currency,
      firstOutput.minAmount.toString()
    );
  }
  /**
   * For exact-in orders: maximum amount in is the fixed maxAmount
   * For exact-out orders: maximum amount in is the maxAmount (worst case)
   */
  maximumAmountIn() {
    return CurrencyAmount.fromRawAmount(
      this._currencyIn,
      this.order.info.input.maxAmount.toString()
    );
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
   * Return the execution price after accounting for slippage tolerance
   * @returns The worst execution price (max in / min out)
   */
  worstExecutionPrice() {
    return new Price(
      this.inputAmount.currency,
      this.outputAmount.currency,
      this.maximumAmountIn().quotient,
      this.minimumAmountOut().quotient
    );
  }
  /**
   * Determine if this is an exact-in order based on the scalingFactor
   */
  isExactIn() {
    return this.order.info.scalingFactor.gt(BASE_SCALING_FACTOR) || this.order.info.scalingFactor.eq(BASE_SCALING_FACTOR);
  }
  /**
   * Determine if this is an exact-out order based on the scalingFactor
   */
  isExactOut() {
    return this.order.info.scalingFactor.lt(BASE_SCALING_FACTOR);
  }
  getExpectedAmountIn() {
    if (!this.expectedAmounts?.expectedAmountIn) {
      throw new Error("expectedAmountIn not set");
    }
    return CurrencyAmount.fromRawAmount(
      this._currencyIn,
      this.expectedAmounts.expectedAmountIn
    );
  }
  getExpectedAmountOut() {
    if (!this.expectedAmounts?.expectedAmountOut) {
      throw new Error("expectedAmountOut not set");
    }
    return CurrencyAmount.fromRawAmount(
      this._currenciesOut[0],
      this.expectedAmounts.expectedAmountOut
    );
  }
};
var OrderBuilder = class {
  constructor() {
    this.orderInfo = {
      additionalValidationContract: ethers.ethers.constants.AddressZero,
      additionalValidationData: "0x"
    };
  }
  deadline(deadline) {
    this.orderInfo.deadline = deadline;
    return this;
  }
  nonce(nonce) {
    this.orderInfo.nonce = nonce;
    return this;
  }
  swapper(swapper) {
    this.orderInfo.swapper = swapper;
    return this;
  }
  validation(info) {
    this.orderInfo.additionalValidationContract = info.additionalValidationContract;
    this.orderInfo.additionalValidationData = info.additionalValidationData;
    return this;
  }
  reactor(reactor) {
    this.orderInfo.reactor = reactor;
    return this;
  }
  getOrderInfo() {
    invariant8__default.default(this.orderInfo.reactor !== void 0, "reactor not set");
    invariant8__default.default(this.orderInfo.nonce !== void 0, "nonce not set");
    invariant8__default.default(this.orderInfo.deadline !== void 0, "deadline not set");
    invariant8__default.default(
      this.orderInfo.deadline > Date.now() / 1e3,
      `Deadline must be in the future: ${this.orderInfo.deadline}`
    );
    invariant8__default.default(this.orderInfo.swapper !== void 0, "swapper not set");
    invariant8__default.default(
      this.orderInfo.additionalValidationContract !== void 0,
      "validation contract not set"
    );
    invariant8__default.default(
      this.orderInfo.additionalValidationData !== void 0,
      "validation data not set"
    );
    return {
      reactor: this.orderInfo.reactor,
      swapper: this.orderInfo.swapper,
      nonce: this.orderInfo.nonce,
      deadline: this.orderInfo.deadline,
      additionalValidationContract: this.orderInfo.additionalValidationContract,
      additionalValidationData: this.orderInfo.additionalValidationData
    };
  }
};

// src/uniswapx/builder/DutchOrderBuilder.ts
var DutchOrderBuilder = class _DutchOrderBuilder extends OrderBuilder {
  constructor(chainId, reactorAddress, permit2Address) {
    super();
    this.chainId = chainId;
    this.permit2Address = permit2Address;
    const mappedReactorAddress = REACTOR_ADDRESS_MAPPING[chainId] ? REACTOR_ADDRESS_MAPPING[chainId]["Dutch" /* Dutch */] : void 0;
    if (reactorAddress) {
      this.reactor(reactorAddress);
    } else if (mappedReactorAddress) {
      this.reactor(mappedReactorAddress);
    } else {
      throw new MissingConfiguration("reactor", chainId.toString());
    }
    this.info = {
      outputs: [],
      exclusiveFiller: ethers.ethers.constants.AddressZero,
      exclusivityOverrideBps: ethers.BigNumber.from(0)
    };
  }
  static fromOrder(order) {
    const builder = new _DutchOrderBuilder(order.chainId, order.info.reactor).deadline(order.info.deadline).decayEndTime(order.info.decayEndTime).decayStartTime(order.info.decayStartTime).swapper(order.info.swapper).nonce(order.info.nonce).input(order.info.input).exclusiveFiller(
      order.info.exclusiveFiller,
      order.info.exclusivityOverrideBps
    ).validation({
      additionalValidationContract: order.info.additionalValidationContract,
      additionalValidationData: order.info.additionalValidationData
    });
    for (const output of order.info.outputs) {
      builder.output(output);
    }
    return builder;
  }
  decayStartTime(decayStartTime) {
    this.info.decayStartTime = decayStartTime;
    return this;
  }
  decayEndTime(decayEndTime) {
    if (this.orderInfo.deadline === void 0) {
      super.deadline(decayEndTime);
    }
    this.info.decayEndTime = decayEndTime;
    return this;
  }
  input(input) {
    this.info.input = input;
    return this;
  }
  output(output) {
    if (!this.info.outputs) {
      this.info.outputs = [];
    }
    invariant8__default.default(
      output.startAmount.gte(output.endAmount),
      `startAmount must be greater than endAmount: ${output.startAmount.toString()}`
    );
    this.info.outputs.push(output);
    return this;
  }
  deadline(deadline) {
    super.deadline(deadline);
    if (this.info.decayEndTime === void 0) {
      this.decayEndTime(deadline);
    }
    return this;
  }
  swapper(swapper) {
    super.swapper(swapper);
    return this;
  }
  nonce(nonce) {
    super.nonce(nonce);
    return this;
  }
  validation(info) {
    super.validation(info);
    return this;
  }
  // ensures that we only change non fee outputs
  nonFeeRecipient(newRecipient, feeRecipient) {
    invariant8__default.default(
      newRecipient !== feeRecipient,
      `newRecipient must be different from feeRecipient: ${newRecipient}`
    );
    if (!this.info.outputs) {
      return this;
    }
    this.info.outputs = this.info.outputs.map((output) => {
      if (feeRecipient && output.recipient.toLowerCase() === feeRecipient.toLowerCase()) {
        return output;
      }
      return {
        ...output,
        recipient: newRecipient
      };
    });
    return this;
  }
  exclusiveFiller(exclusiveFiller, exclusivityOverrideBps) {
    this.info.exclusiveFiller = exclusiveFiller;
    this.info.exclusivityOverrideBps = exclusivityOverrideBps;
    return this;
  }
  build() {
    invariant8__default.default(this.info.decayStartTime !== void 0, "decayStartTime not set");
    invariant8__default.default(this.info.input !== void 0, "input not set");
    invariant8__default.default(this.info.decayEndTime !== void 0, "decayEndTime not set");
    invariant8__default.default(
      this.info.exclusiveFiller !== void 0,
      "exclusiveFiller not set"
    );
    invariant8__default.default(
      this.info.exclusivityOverrideBps !== void 0,
      "exclusivityOverrideBps not set"
    );
    invariant8__default.default(
      this.info.outputs !== void 0 && this.info.outputs.length !== 0,
      "outputs not set"
    );
    invariant8__default.default(
      this.info.decayEndTime !== void 0 || this.getOrderInfo().deadline !== void 0,
      "Must set either deadline or decayEndTime"
    );
    invariant8__default.default(
      !this.orderInfo.deadline || this.info.decayStartTime <= this.orderInfo.deadline,
      `decayStartTime must be before or same as deadline: ${this.info.decayStartTime}`
    );
    invariant8__default.default(
      !this.orderInfo.deadline || this.info.decayEndTime <= this.orderInfo.deadline,
      `decayEndTime must be before or same as deadline: ${this.info.decayEndTime}`
    );
    return new DutchOrder(
      Object.assign(this.getOrderInfo(), {
        decayStartTime: this.info.decayStartTime,
        decayEndTime: this.info.decayEndTime,
        exclusiveFiller: this.info.exclusiveFiller,
        exclusivityOverrideBps: this.info.exclusivityOverrideBps,
        input: this.info.input,
        outputs: this.info.outputs
      }),
      this.chainId,
      this.permit2Address
    );
  }
};
var RelayOrderBuilder = class _RelayOrderBuilder {
  constructor(chainId, reactorAddress, permit2Address) {
    this.chainId = chainId;
    this.permit2Address = permit2Address;
    this.info = {};
    const mappedReactorAddress = REACTOR_ADDRESS_MAPPING[chainId] ? REACTOR_ADDRESS_MAPPING[chainId]["Relay" /* Relay */] : void 0;
    if (reactorAddress) {
      this.reactor(reactorAddress);
    } else if (mappedReactorAddress) {
      this.reactor(mappedReactorAddress);
    } else {
      throw new MissingConfiguration("reactor", chainId.toString());
    }
  }
  static fromOrder(order) {
    const builder = new _RelayOrderBuilder(order.chainId, order.info.reactor).deadline(order.info.deadline).swapper(order.info.swapper).nonce(order.info.nonce).universalRouterCalldata(order.info.universalRouterCalldata).input(order.info.input).fee(order.info.fee).feeStartTime(order.info.fee.startTime).feeEndTime(order.info.fee.endTime);
    return builder;
  }
  reactor(reactor) {
    this.info.reactor = reactor;
    return this;
  }
  deadline(deadline) {
    this.info.deadline = deadline;
    return this;
  }
  nonce(nonce) {
    this.info.nonce = nonce;
    return this;
  }
  swapper(swapper) {
    this.info.swapper = swapper;
    return this;
  }
  // TODO: perform some calldata validation here
  universalRouterCalldata(universalRouterCalldata) {
    this.info.universalRouterCalldata = universalRouterCalldata;
    return this;
  }
  feeStartTime(feeStartTime) {
    invariant8__default.default(this.info.fee !== void 0, "fee not set");
    this.info.fee = {
      ...this.info.fee,
      startTime: feeStartTime
    };
    return this;
  }
  feeEndTime(feeEndTime) {
    invariant8__default.default(this.info.fee !== void 0, "fee not set");
    if (this.info.deadline === void 0) {
      this.info.deadline = feeEndTime;
    }
    this.info.fee = {
      ...this.info.fee,
      endTime: feeEndTime
    };
    return this;
  }
  input(input) {
    this.info.input = input;
    return this;
  }
  fee(fee) {
    invariant8__default.default(
      fee.startAmount.lte(fee.endAmount),
      `startAmount must be less than or equal than endAmount: ${fee.startAmount.toString()}`
    );
    this.info.fee = fee;
    return this;
  }
  build() {
    invariant8__default.default(this.info.reactor !== void 0, "reactor not set");
    invariant8__default.default(this.info.nonce !== void 0, "nonce not set");
    invariant8__default.default(this.info.deadline !== void 0, "deadline not set");
    invariant8__default.default(
      this.info.deadline > Date.now() / 1e3,
      `Deadline must be in the future: ${this.info.deadline}`
    );
    invariant8__default.default(this.info.swapper !== void 0, "swapper not set");
    invariant8__default.default(
      this.info.universalRouterCalldata !== void 0,
      "universalRouterCalldata not set"
    );
    invariant8__default.default(this.info.input !== void 0, "input not set");
    invariant8__default.default(this.info.fee !== void 0, "fee not set");
    invariant8__default.default(
      !this.info.deadline || this.info.fee.startTime <= this.info.deadline,
      `feeStartTime must be before or same as deadline: ${this.info.fee.startTime}`
    );
    invariant8__default.default(
      !this.info.deadline || this.info.fee.endTime <= this.info.deadline,
      `feeEndTime must be before or same as deadline: ${this.info.fee.endTime}`
    );
    return new RelayOrder(
      Object.assign(this.info, {
        reactor: this.info.reactor,
        swapper: this.info.swapper,
        nonce: this.info.nonce,
        deadline: this.info.deadline,
        input: this.info.input,
        fee: this.info.fee,
        universalRouterCalldata: this.info.universalRouterCalldata
      }),
      this.chainId,
      this.permit2Address
    );
  }
};
var V2DutchOrderBuilder = class _V2DutchOrderBuilder extends OrderBuilder {
  constructor(chainId, reactorAddress, _permit2Address) {
    super();
    this.chainId = chainId;
    this.reactor(getReactor(chainId, "Dutch_V2" /* Dutch_V2 */, reactorAddress));
    this.permit2Address = getPermit2(chainId, _permit2Address);
    this.info = {
      outputs: [],
      cosignerData: {
        decayStartTime: 0,
        decayEndTime: 0,
        exclusiveFiller: ethers.ethers.constants.AddressZero,
        exclusivityOverrideBps: ethers.BigNumber.from(0),
        inputOverride: ethers.BigNumber.from(0),
        outputOverrides: []
      }
    };
  }
  static fromOrder(order) {
    const builder = new _V2DutchOrderBuilder(order.chainId, order.info.reactor).deadline(order.info.deadline).swapper(order.info.swapper).nonce(order.info.nonce).input(order.info.input).cosigner(order.info.cosigner).validation({
      additionalValidationContract: order.info.additionalValidationContract,
      additionalValidationData: order.info.additionalValidationData
    });
    for (const output of order.info.outputs) {
      builder.output(output);
    }
    if (order instanceof CosignedV2DutchOrder) {
      builder.cosignature(order.info.cosignature);
      builder.decayEndTime(order.info.cosignerData.decayEndTime);
      builder.decayStartTime(order.info.cosignerData.decayStartTime);
      builder.cosignerData(order.info.cosignerData);
    }
    return builder;
  }
  decayStartTime(decayStartTime) {
    if (!this.info.cosignerData) {
      this.initializeCosignerData({ decayStartTime });
    } else {
      this.info.cosignerData.decayStartTime = decayStartTime;
    }
    return this;
  }
  decayEndTime(decayEndTime) {
    if (!this.info.cosignerData) {
      this.initializeCosignerData({ decayEndTime });
    } else {
      this.info.cosignerData.decayEndTime = decayEndTime;
    }
    if (!this.orderInfo.deadline) {
      super.deadline(decayEndTime);
    }
    return this;
  }
  input(input) {
    this.info.input = input;
    return this;
  }
  output(output) {
    invariant8__default.default(
      output.startAmount.gte(output.endAmount),
      `startAmount must be greater than endAmount: ${output.startAmount.toString()}`
    );
    this.info.outputs?.push(output);
    return this;
  }
  deadline(deadline) {
    super.deadline(deadline);
    if (!this.info.cosignerData) {
      this.initializeCosignerData({ decayEndTime: deadline });
    } else if (!this.info.cosignerData.decayEndTime) {
      this.decayEndTime(deadline);
    }
    return this;
  }
  swapper(swapper) {
    super.swapper(swapper);
    return this;
  }
  nonce(nonce) {
    super.nonce(nonce);
    return this;
  }
  validation(info) {
    super.validation(info);
    return this;
  }
  // ensures that we only change non fee outputs
  nonFeeRecipient(newRecipient, feeRecipient) {
    invariant8__default.default(
      newRecipient !== feeRecipient,
      `newRecipient must be different from feeRecipient: ${newRecipient}`
    );
    if (!this.info.outputs) {
      return this;
    }
    this.info.outputs = this.info.outputs.map((output) => {
      if (feeRecipient && output.recipient.toLowerCase() === feeRecipient.toLowerCase()) {
        return output;
      }
      return {
        ...output,
        recipient: newRecipient
      };
    });
    return this;
  }
  exclusiveFiller(exclusiveFiller) {
    if (!this.info.cosignerData) {
      this.info.cosignerData = {
        decayStartTime: 0,
        decayEndTime: 0,
        exclusiveFiller,
        exclusivityOverrideBps: ethers.BigNumber.from(0),
        inputOverride: ethers.BigNumber.from(0),
        outputOverrides: []
      };
    }
    this.info.cosignerData.exclusiveFiller = exclusiveFiller;
    return this;
  }
  exclusivityOverrideBps(exclusivityOverrideBps) {
    if (!this.info.cosignerData) {
      this.info.cosignerData = {
        decayStartTime: 0,
        decayEndTime: 0,
        exclusiveFiller: ethers.ethers.constants.AddressZero,
        exclusivityOverrideBps,
        inputOverride: ethers.BigNumber.from(0),
        outputOverrides: []
      };
    }
    this.info.cosignerData.exclusivityOverrideBps = exclusivityOverrideBps;
    return this;
  }
  inputOverride(inputOverride) {
    if (!this.info.cosignerData) {
      this.initializeCosignerData({ inputOverride });
    } else {
      this.info.cosignerData.inputOverride = inputOverride;
    }
    return this;
  }
  outputOverrides(outputOverrides) {
    if (!this.info.cosignerData) {
      this.initializeCosignerData({ outputOverrides });
    } else {
      this.info.cosignerData.outputOverrides = outputOverrides;
    }
    return this;
  }
  cosigner(cosigner) {
    this.info.cosigner = cosigner;
    return this;
  }
  cosignature(cosignature) {
    this.info.cosignature = cosignature;
    return this;
  }
  cosignerData(cosignerData) {
    this.decayStartTime(cosignerData.decayStartTime);
    this.decayEndTime(cosignerData.decayEndTime);
    this.exclusiveFiller(cosignerData.exclusiveFiller);
    this.exclusivityOverrideBps(cosignerData.exclusivityOverrideBps);
    this.inputOverride(cosignerData.inputOverride);
    this.outputOverrides(cosignerData.outputOverrides);
    return this;
  }
  buildPartial() {
    invariant8__default.default(this.info.cosigner !== void 0, "cosigner not set");
    invariant8__default.default(this.info.input !== void 0, "input not set");
    invariant8__default.default(
      this.info.outputs && this.info.outputs.length > 0,
      "outputs not set"
    );
    invariant8__default.default(this.info.input !== void 0, "original input not set");
    invariant8__default.default(
      !this.orderInfo.deadline || this.info.cosignerData && this.info.cosignerData.decayStartTime <= this.orderInfo.deadline,
      `if present, decayStartTime must be before or same as deadline: ${this.info.cosignerData?.decayStartTime}`
    );
    invariant8__default.default(
      !this.orderInfo.deadline || this.info.cosignerData && this.info.cosignerData.decayEndTime <= this.orderInfo.deadline,
      `if present, decayEndTime must be before or same as deadline: ${this.info.cosignerData?.decayEndTime}`
    );
    return new UnsignedV2DutchOrder(
      Object.assign(this.getOrderInfo(), {
        input: this.info.input,
        outputs: this.info.outputs,
        cosigner: this.info.cosigner
      }),
      this.chainId,
      this.permit2Address
    );
  }
  build() {
    invariant8__default.default(this.info.cosigner !== void 0, "cosigner not set");
    invariant8__default.default(this.info.cosignature !== void 0, "cosignature not set");
    invariant8__default.default(this.info.input !== void 0, "input not set");
    invariant8__default.default(
      this.info.outputs && this.info.outputs.length > 0,
      "outputs not set"
    );
    invariant8__default.default(this.info.cosignerData !== void 0, "cosignerData not set");
    invariant8__default.default(
      this.info.cosignerData.decayStartTime !== void 0,
      "decayStartTime not set"
    );
    invariant8__default.default(
      this.info.cosignerData.decayEndTime !== void 0 || this.orderInfo.deadline !== void 0,
      "Neither decayEndTime or deadline not set"
    );
    invariant8__default.default(
      this.info.cosignerData.exclusiveFiller !== void 0,
      "exclusiveFiller not set"
    );
    invariant8__default.default(
      this.info.cosignerData.exclusivityOverrideBps !== void 0,
      "exclusivityOverrideBps not set"
    );
    invariant8__default.default(
      this.info.cosignerData.inputOverride.lte(this.info.input.startAmount),
      "inputOverride larger than original input"
    );
    invariant8__default.default(
      this.info.cosignerData.outputOverrides.length > 0,
      "outputOverrides not set"
    );
    this.info.cosignerData.outputOverrides.forEach((override, idx) => {
      invariant8__default.default(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        override.gte(this.info.outputs[idx].startAmount),
        "outputOverride must be larger than or equal to original output"
      );
    });
    invariant8__default.default(this.info.input !== void 0, "original input not set");
    invariant8__default.default(
      !this.orderInfo.deadline || this.info.cosignerData.decayStartTime <= this.orderInfo.deadline,
      `decayStartTime must be before or same as deadline: ${this.info.cosignerData.decayStartTime}`
    );
    invariant8__default.default(
      !this.orderInfo.deadline || this.info.cosignerData.decayEndTime <= this.orderInfo.deadline,
      `decayEndTime must be before or same as deadline: ${this.info.cosignerData.decayEndTime}`
    );
    return new CosignedV2DutchOrder(
      Object.assign(this.getOrderInfo(), {
        cosignerData: this.info.cosignerData,
        input: this.info.input,
        outputs: this.info.outputs,
        cosigner: this.info.cosigner,
        cosignature: this.info.cosignature
      }),
      this.chainId,
      this.permit2Address
    );
  }
  initializeCosignerData(overrides) {
    this.info.cosignerData = {
      decayStartTime: 0,
      decayEndTime: 0,
      exclusiveFiller: ethers.ethers.constants.AddressZero,
      exclusivityOverrideBps: ethers.BigNumber.from(0),
      inputOverride: ethers.BigNumber.from(0),
      outputOverrides: [],
      ...overrides
    };
  }
};
var PriorityOrderBuilder = class _PriorityOrderBuilder extends OrderBuilder {
  constructor(chainId, reactorAddress, permit2Address) {
    super();
    this.chainId = chainId;
    this.permit2Address = permit2Address;
    this.reactor(getReactor(chainId, "Priority" /* Priority */, reactorAddress));
    this.permit2Address = getPermit2(chainId, permit2Address);
    this.info = {
      cosignerData: {
        auctionTargetBlock: ethers.BigNumber.from(0)
      },
      outputs: []
    };
  }
  static fromOrder(order) {
    const builder = new _PriorityOrderBuilder(
      order.chainId,
      order.info.reactor,
      order.permit2Address
    ).deadline(order.info.deadline).swapper(order.info.swapper).nonce(order.info.nonce).input(order.info.input).auctionStartBlock(order.info.auctionStartBlock).baselinePriorityFeeWei(order.info.baselinePriorityFeeWei).cosigner(order.info.cosigner).validation({
      additionalValidationContract: order.info.additionalValidationContract,
      additionalValidationData: order.info.additionalValidationData
    });
    for (const output of order.info.outputs) {
      builder.output(output);
    }
    if (isCosigned(order)) {
      builder.cosignature(order.info.cosignature);
      builder.auctionTargetBlock(order.info.cosignerData.auctionTargetBlock);
    }
    return builder;
  }
  cosigner(cosigner) {
    this.info.cosigner = cosigner;
    return this;
  }
  auctionStartBlock(auctionStartBlock) {
    this.info.auctionStartBlock = auctionStartBlock;
    return this;
  }
  auctionTargetBlock(auctionTargetBlock) {
    if (!this.info.cosignerData) {
      this.info.cosignerData = {
        auctionTargetBlock
      };
    } else {
      this.info.cosignerData.auctionTargetBlock = auctionTargetBlock;
    }
    return this;
  }
  baselinePriorityFeeWei(baselinePriorityFeeWei) {
    this.info.baselinePriorityFeeWei = baselinePriorityFeeWei;
    return this;
  }
  cosignerData(cosignerData) {
    this.info.cosignerData = cosignerData;
    return this;
  }
  cosignature(cosignature) {
    this.info.cosignature = cosignature;
    return this;
  }
  input(input) {
    this.info.input = input;
    return this;
  }
  output(output) {
    if (!this.info.outputs) {
      this.info.outputs = [];
    }
    this.info.outputs.push(output);
    return this;
  }
  deadline(deadline) {
    super.deadline(deadline);
    return this;
  }
  swapper(swapper) {
    super.swapper(swapper);
    return this;
  }
  nonce(nonce) {
    super.nonce(nonce);
    return this;
  }
  validation(info) {
    super.validation(info);
    return this;
  }
  // ensures that we only change non fee outputs
  nonFeeRecipient(newRecipient, feeRecipient) {
    invariant8__default.default(
      newRecipient !== feeRecipient,
      `newRecipient must be different from feeRecipient: ${newRecipient}`
    );
    if (!this.info.outputs) {
      return this;
    }
    this.info.outputs = this.info.outputs.map((output) => {
      if (feeRecipient && output.recipient.toLowerCase() === feeRecipient.toLowerCase()) {
        return output;
      }
      return {
        ...output,
        recipient: newRecipient
      };
    });
    return this;
  }
  buildPartial() {
    invariant8__default.default(this.info.input !== void 0, "input not set");
    invariant8__default.default(this.info.cosigner !== void 0, "cosigner not set");
    invariant8__default.default(
      this.info.baselinePriorityFeeWei !== void 0,
      "baselinePriorityFeeWei not set"
    );
    invariant8__default.default(
      this.info.outputs !== void 0 && this.info.outputs.length !== 0,
      "outputs not set"
    );
    invariant8__default.default(
      this.info.auctionStartBlock !== void 0 && this.info.auctionStartBlock.gt(0),
      "auctionStartBlock not set"
    );
    invariant8__default.default(
      !this.info.input.mpsPerPriorityFeeWei.eq(0) || this.info.outputs.every((output) => !output.mpsPerPriorityFeeWei.eq(0)),
      "Priority auction not configured"
    );
    invariant8__default.default(
      !(this.info.input.mpsPerPriorityFeeWei.gt(0) && this.info.outputs.every((output) => output.mpsPerPriorityFeeWei.gt(0))),
      "Can only configure priority auction on either input or output"
    );
    return new UnsignedPriorityOrder(
      Object.assign(this.getOrderInfo(), {
        cosigner: this.info.cosigner,
        auctionStartBlock: this.info.auctionStartBlock,
        baselinePriorityFeeWei: this.info.baselinePriorityFeeWei,
        input: this.info.input,
        outputs: this.info.outputs
      }),
      this.chainId,
      this.permit2Address
    );
  }
  build() {
    invariant8__default.default(this.info.input !== void 0, "input not set");
    invariant8__default.default(this.info.cosigner !== void 0, "cosigner not set");
    invariant8__default.default(this.info.cosignature !== void 0, "cosignature not set");
    invariant8__default.default(
      this.info.baselinePriorityFeeWei !== void 0,
      "baselinePriorityFeeWei not set"
    );
    invariant8__default.default(
      this.info.outputs !== void 0 && this.info.outputs.length !== 0,
      "outputs not set"
    );
    invariant8__default.default(
      this.info.auctionStartBlock !== void 0 && this.info.auctionStartBlock.gt(0),
      "auctionStartBlock not set"
    );
    invariant8__default.default(
      this.info.cosignerData !== void 0 && this.info.cosignerData.auctionTargetBlock.gt(0) && this.info.cosignerData.auctionTargetBlock.lte(
        this.info.auctionStartBlock
      ),
      "auctionTargetBlock not set properly"
    );
    invariant8__default.default(
      !this.info.input.mpsPerPriorityFeeWei.eq(0) || this.info.outputs.every((output) => !output.mpsPerPriorityFeeWei.eq(0)),
      "Priority auction not configured"
    );
    invariant8__default.default(
      !(this.info.input.mpsPerPriorityFeeWei.gt(0) && this.info.outputs.some((output) => output.mpsPerPriorityFeeWei.gt(0))),
      "Can only configure priority auction on either input or output"
    );
    return new CosignedPriorityOrder(
      Object.assign(this.getOrderInfo(), {
        cosigner: this.info.cosigner,
        auctionStartBlock: this.info.auctionStartBlock,
        baselinePriorityFeeWei: this.info.baselinePriorityFeeWei,
        input: this.info.input,
        outputs: this.info.outputs,
        cosignerData: this.info.cosignerData,
        cosignature: this.info.cosignature
      }),
      this.chainId,
      this.permit2Address
    );
  }
};
function isCosigned(order) {
  return order.info.cosignature !== void 0;
}
var V3DutchOrderBuilder = class _V3DutchOrderBuilder extends OrderBuilder {
  constructor(chainId, reactorAddress, _permit2Address) {
    super();
    this.chainId = chainId;
    this.reactor(getReactor(chainId, "Dutch_V3" /* Dutch_V3 */, reactorAddress));
    this.permit2Address = getPermit2(chainId, _permit2Address);
    this.info = {
      outputs: []
    };
    this.initializeCosignerData({});
  }
  static fromOrder(order) {
    const builder = new _V3DutchOrderBuilder(order.chainId, order.info.reactor);
    builder.cosigner(order.info.cosigner).startingBaseFee(order.info.startingBaseFee).input(order.info.input).deadline(order.info.deadline).nonce(order.info.nonce).swapper(order.info.swapper).validation({
      additionalValidationContract: order.info.additionalValidationContract,
      additionalValidationData: order.info.additionalValidationData
    });
    order.info.outputs.forEach((output) => {
      builder.output(output);
    });
    if (order instanceof CosignedV3DutchOrder) {
      builder.cosignature(order.info.cosignature);
      builder.decayStartBlock(order.info.cosignerData.decayStartBlock);
      builder.exclusiveFiller(order.info.cosignerData.exclusiveFiller);
      builder.inputOverride(order.info.cosignerData.inputOverride);
      builder.exclusivityOverrideBps(
        order.info.cosignerData.exclusivityOverrideBps
      );
      builder.outputOverrides(order.info.cosignerData.outputOverrides);
    }
    return builder;
  }
  build() {
    invariant8__default.default(this.info.cosignature !== void 0, "cosignature not set");
    this.checkUnsignedInvariants(this.info);
    this.checkCosignedInvariants(this.info);
    return new CosignedV3DutchOrder(
      Object.assign(this.getOrderInfo(), {
        cosignerData: this.info.cosignerData,
        startingBaseFee: this.info.startingBaseFee,
        input: this.info.input,
        outputs: this.info.outputs,
        cosigner: this.info.cosigner,
        cosignature: this.info.cosignature
      }),
      this.chainId,
      this.permit2Address
    );
  }
  cosigner(cosigner) {
    this.info.cosigner = cosigner;
    return this;
  }
  cosignature(cosignature) {
    this.info.cosignature = cosignature;
    return this;
  }
  decayStartBlock(decayStartBlock) {
    if (!this.info.cosignerData) {
      this.initializeCosignerData({ decayStartBlock });
    } else {
      this.info.cosignerData.decayStartBlock = decayStartBlock;
    }
    return this;
  }
  initializeCosignerData(data) {
    this.info.cosignerData = {
      decayStartBlock: 0,
      exclusiveFiller: ethers.ethers.constants.AddressZero,
      exclusivityOverrideBps: ethers.BigNumber.from(0),
      inputOverride: ethers.BigNumber.from(0),
      outputOverrides: [],
      ...data
    };
  }
  isRelativeBlocksIncreasing(relativeBlocks) {
    let prevBlock = 0;
    for (const block of relativeBlocks) {
      if (block <= prevBlock) {
        return false;
      }
      prevBlock = block;
    }
    return true;
  }
  checkUnsignedInvariants(info) {
    invariant8__default.default(info.cosigner !== void 0, "cosigner not set");
    invariant8__default.default(info.startingBaseFee !== void 0, "startingBaseFee not set");
    invariant8__default.default(info.input !== void 0, "input not set");
    invariant8__default.default(info.outputs && info.outputs.length > 0, "outputs not set");
    invariant8__default.default(
      info.input.curve.relativeAmounts.length === info.input.curve.relativeBlocks.length,
      "relativeBlocks and relativeAmounts length mismatch"
    );
    invariant8__default.default(
      this.isRelativeBlocksIncreasing(info.input.curve.relativeBlocks),
      "relativeBlocks not strictly increasing"
    );
    info.outputs.forEach((output) => {
      invariant8__default.default(
        output.curve.relativeBlocks.length === output.curve.relativeAmounts.length,
        "relativeBlocks and relativeAmounts length mismatch"
      );
      invariant8__default.default(
        this.isRelativeBlocksIncreasing(output.curve.relativeBlocks),
        "relativeBlocks not strictly increasing"
      );
    });
    invariant8__default.default(this.orderInfo.deadline !== void 0, "deadline not set");
    invariant8__default.default(this.orderInfo.swapper !== void 0, "swapper not set");
  }
  checkCosignedInvariants(info) {
    invariant8__default.default(info.cosignerData !== void 0, "cosignerData not set");
    invariant8__default.default(
      info.cosignerData.decayStartBlock !== void 0,
      "decayStartBlock not set"
    );
    invariant8__default.default(
      info.cosignerData.exclusiveFiller !== void 0,
      "exclusiveFiller not set"
    );
    invariant8__default.default(
      info.cosignerData.exclusivityOverrideBps !== void 0,
      "exclusivityOverrideBps not set"
    );
    invariant8__default.default(
      info.cosignerData.outputOverrides.length > 0,
      "outputOverrides not set"
    );
    invariant8__default.default(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      info.cosignerData.inputOverride.lte(this.info.input.startAmount),
      "inputOverride larger than original input"
    );
    info.cosignerData.outputOverrides.forEach((override, idx) => {
      if (override.toString() != "0") {
        invariant8__default.default(
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          override.gte(this.info.outputs[idx].startAmount),
          "outputOverride smaller than original output"
        );
      }
    });
  }
  startingBaseFee(startingBaseFee) {
    this.info.startingBaseFee = startingBaseFee;
    return this;
  }
  input(input) {
    this.info.input = input;
    return this;
  }
  output(output) {
    this.info.outputs?.push(output);
    return this;
  }
  inputOverride(inputOverride) {
    if (!this.info.cosignerData) {
      this.initializeCosignerData({ inputOverride });
    } else {
      this.info.cosignerData.inputOverride = inputOverride;
    }
    return this;
  }
  outputOverrides(outputOverrides) {
    if (!this.info.cosignerData) {
      this.initializeCosignerData({ outputOverrides });
    } else {
      this.info.cosignerData.outputOverrides = outputOverrides;
    }
    return this;
  }
  deadline(deadline) {
    super.deadline(deadline);
    return this;
  }
  swapper(swapper) {
    super.swapper(swapper);
    return this;
  }
  nonce(nonce) {
    super.nonce(nonce);
    return this;
  }
  validation(info) {
    super.validation(info);
    return this;
  }
  cosignerData(cosignerData) {
    this.decayStartBlock(cosignerData.decayStartBlock);
    this.exclusiveFiller(cosignerData.exclusiveFiller);
    this.exclusivityOverrideBps(cosignerData.exclusivityOverrideBps);
    this.inputOverride(cosignerData.inputOverride);
    this.outputOverrides(cosignerData.outputOverrides);
    return this;
  }
  exclusiveFiller(exclusiveFiller) {
    if (!this.info.cosignerData) {
      this.initializeCosignerData({ exclusiveFiller });
    } else {
      this.info.cosignerData.exclusiveFiller = exclusiveFiller;
    }
    return this;
  }
  exclusivityOverrideBps(exclusivityOverrideBps) {
    if (!this.info.cosignerData) {
      this.initializeCosignerData({ exclusivityOverrideBps });
    } else {
      this.info.cosignerData.exclusivityOverrideBps = exclusivityOverrideBps;
    }
    return this;
  }
  // ensures that we only change non fee outputs
  nonFeeRecipient(newRecipient, feeRecipient) {
    invariant8__default.default(
      newRecipient !== feeRecipient,
      `newRecipient must be different from feeRecipient: ${newRecipient}`
    );
    if (!this.info.outputs) {
      return this;
    }
    this.info.outputs = this.info.outputs.map((output) => {
      if (feeRecipient && output.recipient.toLowerCase() === feeRecipient.toLowerCase()) {
        return output;
      }
      return {
        ...output,
        recipient: newRecipient
      };
    });
    return this;
  }
  buildPartial() {
    this.checkUnsignedInvariants(this.info);
    return new UnsignedV3DutchOrder(
      Object.assign(this.getOrderInfo(), {
        input: this.info.input,
        outputs: this.info.outputs,
        cosigner: this.info.cosigner,
        startingBaseFee: this.info.startingBaseFee
      }),
      this.chainId,
      this.permit2Address
    );
  }
  // A helper function for users of the class to easily find the value to pass to maxAmount in an input
  static getMaxAmountOut(startAmount, relativeAmounts) {
    if (relativeAmounts.length == 0) {
      return startAmount;
    }
    const minRelativeAmount = relativeAmounts.reduce(
      (min, amount) => amount < min ? amount : min,
      BigInt(0)
    );
    const maxOut = startAmount.sub(minRelativeAmount.toString());
    return maxOut;
  }
  // A helper function for users of the class find the lowest possible output amount
  static getMinAmountOut(startAmount, relativeAmounts) {
    if (relativeAmounts.length == 0) {
      return startAmount;
    }
    const maxRelativeAmount = relativeAmounts.reduce(
      (max, amount) => amount > max ? amount : max,
      BigInt(0)
    );
    const minOut = startAmount.sub(maxRelativeAmount.toString());
    return minOut;
  }
};
var ZERO_ADDRESS2 = ethers.constants.AddressZero;
var HybridOrderBuilder = class _HybridOrderBuilder {
  constructor(chainId, reactor, resolver, permit2Address) {
    this.chainId = chainId;
    this.resolver = resolver;
    this.permit2Address = permit2Address;
    this.info = {
      reactor,
      preExecutionHook: ZERO_ADDRESS2,
      preExecutionHookData: "0x",
      postExecutionHook: ZERO_ADDRESS2,
      postExecutionHookData: "0x",
      auctionResolver: resolver
    };
    this.orderData = {
      outputs: []
    };
    this.initializeCosignerData({});
  }
  static fromOrder(order, resolver) {
    const builder = new _HybridOrderBuilder(
      order.chainId,
      order.info.reactor,
      resolver || order.resolver,
      order.permit2Address
    );
    builder.cosigner(order.info.cosigner).input(order.info.input).deadline(order.info.deadline).nonce(order.info.nonce).swapper(order.info.swapper).auctionStartBlock(order.info.auctionStartBlock).baselinePriorityFee(order.info.baselinePriorityFee).scalingFactor(order.info.scalingFactor).priceCurve(order.info.priceCurve).preExecutionHook(order.info.preExecutionHook, order.info.preExecutionHookData).postExecutionHook(
      order.info.postExecutionHook,
      order.info.postExecutionHookData
    ).auctionResolver(order.info.auctionResolver);
    order.info.outputs.forEach((output) => {
      builder.output(output);
    });
    if ("cosignerData" in order.info && "cosignature" in order.info) {
      const cosignedInfo = order.info;
      builder.cosignerData(cosignedInfo.cosignerData);
      if (cosignedInfo.cosignature && cosignedInfo.cosignature !== "0x") {
        builder.cosignature(cosignedInfo.cosignature);
      }
    }
    return builder;
  }
  initializeCosignerData(data) {
    this.orderData.cosignerData = {
      auctionTargetBlock: ethers.BigNumber.from(0),
      supplementalPriceCurve: [],
      ...data
    };
  }
  validatePriceCurve(curve, prefix) {
    curve.forEach((elem, i) => {
      if (elem.lt(0)) {
        throw new Error(`${prefix} curve element ${i} must be non-negative`);
      }
    });
  }
  reactor(reactor) {
    this.info.reactor = reactor;
    return this;
  }
  swapper(swapper) {
    this.info.swapper = swapper;
    return this;
  }
  nonce(nonce) {
    this.info.nonce = nonce;
    return this;
  }
  deadline(deadline) {
    this.info.deadline = deadline;
    return this;
  }
  preExecutionHook(hook, hookData) {
    this.info.preExecutionHook = hook;
    if (hookData !== void 0) {
      this.info.preExecutionHookData = hookData;
    }
    return this;
  }
  postExecutionHook(hook, hookData) {
    this.info.postExecutionHook = hook;
    if (hookData !== void 0) {
      this.info.postExecutionHookData = hookData;
    }
    return this;
  }
  auctionResolver(resolver) {
    this.info.auctionResolver = resolver;
    return this;
  }
  cosigner(cosigner) {
    this.orderData.cosigner = cosigner;
    return this;
  }
  cosignature(cosignature) {
    this.orderData.cosignature = cosignature;
    return this;
  }
  input(input) {
    this.orderData.input = input;
    return this;
  }
  output(output) {
    this.orderData.outputs.push(output);
    return this;
  }
  auctionStartBlock(block) {
    this.orderData.auctionStartBlock = typeof block === "number" ? ethers.BigNumber.from(block) : block;
    return this;
  }
  baselinePriorityFee(fee) {
    this.orderData.baselinePriorityFee = typeof fee === "number" ? ethers.BigNumber.from(fee) : fee;
    return this;
  }
  scalingFactor(factor) {
    this.orderData.scalingFactor = factor;
    return this;
  }
  priceCurve(curve) {
    this.validatePriceCurve(curve, "Price");
    this.orderData.priceCurve = curve;
    return this;
  }
  cosignerData(data) {
    this.orderData.cosignerData = data;
    return this;
  }
  auctionTargetBlock(block) {
    if (!this.orderData.cosignerData) {
      this.initializeCosignerData({
        auctionTargetBlock: typeof block === "number" ? ethers.BigNumber.from(block) : block
      });
    } else {
      this.orderData.cosignerData.auctionTargetBlock = typeof block === "number" ? ethers.BigNumber.from(block) : block;
    }
    return this;
  }
  supplementalPriceCurve(curve) {
    this.validatePriceCurve(curve, "Supplemental price");
    if (!this.orderData.cosignerData) {
      this.initializeCosignerData({ supplementalPriceCurve: curve });
    } else {
      this.orderData.cosignerData.supplementalPriceCurve = curve;
    }
    return this;
  }
  checkUnsignedInvariants() {
    invariant8__default.default(this.info.reactor !== void 0, "reactor not set");
    invariant8__default.default(this.info.swapper !== void 0, "swapper not set");
    invariant8__default.default(this.info.nonce !== void 0, "nonce not set");
    invariant8__default.default(this.info.deadline !== void 0, "deadline not set");
    invariant8__default.default(
      this.info.deadline > Math.floor(Date.now() / 1e3),
      `Deadline must be in the future: ${this.info.deadline}`
    );
    invariant8__default.default(
      this.info.preExecutionHook !== void 0,
      "preExecutionHook not set"
    );
    invariant8__default.default(
      this.info.auctionResolver !== void 0,
      "auctionResolver not set"
    );
    invariant8__default.default(this.orderData.input !== void 0, "input not set");
    invariant8__default.default(
      this.orderData.outputs && this.orderData.outputs.length > 0,
      "outputs not set"
    );
    invariant8__default.default(
      this.orderData.auctionStartBlock !== void 0,
      "auctionStartBlock not set"
    );
    invariant8__default.default(
      this.orderData.baselinePriorityFee !== void 0,
      "baselinePriorityFee not set"
    );
    invariant8__default.default(
      this.orderData.scalingFactor !== void 0,
      "scalingFactor not set"
    );
    invariant8__default.default(this.orderData.priceCurve !== void 0, "priceCurve not set");
    if (this.orderData.priceCurve && this.orderData.priceCurve.length > 0) {
      for (let i = 1; i < this.orderData.priceCurve.length; i++) {
        const prevScaling = this.extractScalingFactor(this.orderData.priceCurve[i - 1]);
        const scaling = this.extractScalingFactor(this.orderData.priceCurve[i]);
        const sharesDirection = prevScaling.eq(BASE_SCALING_FACTOR) || scaling.eq(BASE_SCALING_FACTOR) || prevScaling.gt(BASE_SCALING_FACTOR) === scaling.gt(BASE_SCALING_FACTOR);
        invariant8__default.default(
          sharesDirection,
          `Price curve scaling factors must share direction. Element ${i} violates this.`
        );
      }
    }
    invariant8__default.default(
      this.orderData.input.maxAmount.gt(0),
      "input maxAmount must be greater than 0"
    );
    this.orderData.outputs.forEach((output, i) => {
      invariant8__default.default(
        output.minAmount.gt(0),
        `output ${i} minAmount must be greater than 0`
      );
    });
    invariant8__default.default(
      this.orderData.baselinePriorityFee.gte(0),
      "baselinePriorityFee must be non-negative"
    );
  }
  extractScalingFactor(curveElement) {
    const mask = ethers.BigNumber.from(2).pow(240).sub(1);
    return curveElement.and(mask);
  }
  checkCosignedInvariants() {
    invariant8__default.default(
      this.orderData.cosignature !== void 0 && this.orderData.cosignature !== "0x",
      "cosignature not set"
    );
    invariant8__default.default(
      this.orderData.cosignerData !== void 0,
      "cosignerData not set"
    );
    invariant8__default.default(
      this.orderData.cosignerData.auctionTargetBlock !== void 0,
      "auctionTargetBlock not set"
    );
    invariant8__default.default(
      this.orderData.cosignerData.supplementalPriceCurve !== void 0,
      "supplementalPriceCurve not set"
    );
  }
  buildPartial() {
    this.checkUnsignedInvariants();
    const orderInfo = {
      ...this.info,
      cosigner: this.orderData.cosigner || ZERO_ADDRESS2,
      input: this.orderData.input,
      outputs: this.orderData.outputs,
      auctionStartBlock: this.orderData.auctionStartBlock,
      baselinePriorityFee: this.orderData.baselinePriorityFee,
      scalingFactor: this.orderData.scalingFactor,
      priceCurve: this.orderData.priceCurve
    };
    return new UnsignedHybridOrder(
      orderInfo,
      this.chainId,
      this.resolver,
      this.permit2Address
    );
  }
  build() {
    this.checkUnsignedInvariants();
    this.checkCosignedInvariants();
    const orderInfo = {
      ...this.info,
      cosigner: this.orderData.cosigner,
      input: this.orderData.input,
      outputs: this.orderData.outputs,
      auctionStartBlock: this.orderData.auctionStartBlock,
      baselinePriorityFee: this.orderData.baselinePriorityFee,
      scalingFactor: this.orderData.scalingFactor,
      priceCurve: this.orderData.priceCurve,
      cosignerData: this.orderData.cosignerData,
      cosignature: this.orderData.cosignature
    };
    return new CosignedHybridOrder(
      orderInfo,
      this.chainId,
      this.resolver,
      this.permit2Address
    );
  }
};

exports.BPS = BPS;
exports.CosignedHybridOrder = CosignedHybridOrder;
exports.CosignedPriorityOrder = CosignedPriorityOrder;
exports.CosignedV2DutchOrder = CosignedV2DutchOrder;
exports.CosignedV3DutchOrder = CosignedV3DutchOrder;
exports.DCA_COSIGNER_DATA_TYPE_HASH = DCA_COSIGNER_DATA_TYPE_HASH;
exports.DCA_INTENT_TYPES = DCA_INTENT_TYPES;
exports.DutchOrder = DutchOrder;
exports.DutchOrderBuilder = DutchOrderBuilder;
exports.DutchOrderTrade = DutchOrderTrade;
exports.EXCLUSIVE_FILLER_VALIDATION_MAPPING = EXCLUSIVE_FILLER_VALIDATION_MAPPING;
exports.HYBRID_ORDER_TYPES = HYBRID_ORDER_TYPES;
exports.HYBRID_RESOLVER_ADDRESS_MAPPING = HYBRID_RESOLVER_ADDRESS_MAPPING;
exports.HybridOrderBuilder = HybridOrderBuilder;
exports.HybridOrderCosignatureError = HybridOrderCosignatureError;
exports.HybridOrderPriceCurveError = HybridOrderPriceCurveError;
exports.HybridOrderTrade = HybridOrderTrade;
exports.KNOWN_EVENT_SIGNATURES = KNOWN_EVENT_SIGNATURES;
exports.MPS = MPS;
exports.NonceManager = NonceManager;
exports.ORDER_INFO_V4_TYPE_HASH = ORDER_INFO_V4_TYPE_HASH;
exports.ORDER_INFO_V4_TYPE_STRING = ORDER_INFO_V4_TYPE_STRING;
exports.OrderBuilder = OrderBuilder;
exports.OrderNotFillable = OrderNotFillable;
exports.OrderResolutionError = OrderResolutionError;
exports.OrderType = OrderType;
exports.OrderValidation = OrderValidation;
exports.OrderValidator = OrderValidator;
exports.PERMISSIONED_TOKENS = PERMISSIONED_TOKENS;
exports.PERMIT2_MAPPING = PERMIT2_MAPPING;
exports.PermissionedTokenInterface = PermissionedTokenInterface;
exports.PermissionedTokenProxyType = PermissionedTokenProxyType;
exports.PermissionedTokenValidator = PermissionedTokenValidator;
exports.PriorityOrderBuilder = PriorityOrderBuilder;
exports.PriorityOrderTrade = PriorityOrderTrade;
exports.REACTOR_ADDRESS_MAPPING = REACTOR_ADDRESS_MAPPING;
exports.REACTOR_CONTRACT_MAPPING = REACTOR_CONTRACT_MAPPING;
exports.RELAY_SENTINEL_RECIPIENT = RELAY_SENTINEL_RECIPIENT;
exports.REVERSE_REACTOR_MAPPING = REVERSE_REACTOR_MAPPING;
exports.REVERSE_RESOLVER_MAPPING = REVERSE_RESOLVER_MAPPING;
exports.RelayEventWatcher = RelayEventWatcher;
exports.RelayOrder = RelayOrder;
exports.RelayOrderBuilder = RelayOrderBuilder;
exports.RelayOrderParser = RelayOrderParser;
exports.RelayOrderQuoter = RelayOrderQuoter;
exports.RelayOrderTrade = RelayOrderTrade;
exports.RelayOrderValidator = RelayOrderValidator;
exports.UNISWAPX_ORDER_QUOTER_MAPPING = UNISWAPX_ORDER_QUOTER_MAPPING;
exports.UNISWAPX_V4_ORDER_QUOTER_MAPPING = UNISWAPX_V4_ORDER_QUOTER_MAPPING;
exports.UNISWAPX_V4_TOKEN_TRANSFER_HOOK_MAPPING = UNISWAPX_V4_TOKEN_TRANSFER_HOOK_MAPPING;
exports.UniswapXEventWatcher = UniswapXEventWatcher;
exports.UniswapXOrderParser = UniswapXOrderParser;
exports.UniswapXOrderQuoter = UniswapXOrderQuoter;
exports.UnsignedHybridOrder = UnsignedHybridOrder;
exports.UnsignedPriorityOrder = UnsignedPriorityOrder;
exports.UnsignedV2DutchOrder = UnsignedV2DutchOrder;
exports.UnsignedV3DutchOrder = UnsignedV3DutchOrder;
exports.V2DutchOrderBuilder = V2DutchOrderBuilder;
exports.V2DutchOrderTrade = V2DutchOrderTrade;
exports.V3DutchOrderBuilder = V3DutchOrderBuilder;
exports.V3DutchOrderTrade = V3DutchOrderTrade;
exports.V3_DUTCH_ORDER_TYPES = V3_DUTCH_ORDER_TYPES;
exports.V4OrderQuoter = V4OrderQuoter;
exports.V4OrderValidator = V4OrderValidator;
exports.ValidationType = ValidationType;
exports.buildNonce = buildNonce;
exports.constructSameAddressMap = constructSameAddressMap;
exports.encodeExclusiveFillerData = encodeExclusiveFillerData;
exports.encodeRelativeBlocks = encodeRelativeBlocks;
exports.getCancelMultipleParams = getCancelMultipleParams;
exports.getCancelSingleParams = getCancelSingleParams;
exports.getDecayedAmount = getDecayedAmount;
exports.getFirstUnsetBit = getFirstUnsetBit;
exports.getPermit2 = getPermit2;
exports.getReactor = getReactor;
exports.hashDCACosignerData = hashDCACosignerData;
exports.hashDCAIntent = hashDCAIntent;
exports.hashHybridCosignerData = hashHybridCosignerData;
exports.hashHybridOrder = hashHybridOrder;
exports.hashOrderInfoV4 = hashOrderInfoV4;
exports.hashPrivateIntent = hashPrivateIntent;
exports.id = id2;
exports.multicall = multicall;
exports.multicallAddressOn = multicallAddressOn;
exports.multicallSameContractManyFunctions = multicallSameContractManyFunctions;
exports.multicallSameFunctionManyContracts = multicallSameFunctionManyContracts;
exports.originalIfZero = originalIfZero;
exports.parseExclusiveFillerData = parseExclusiveFillerData;
exports.parseValidation = parseValidation;
exports.setBit = setBit;
exports.splitNonce = splitNonce;
exports.stripHexPrefix = stripHexPrefix;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map