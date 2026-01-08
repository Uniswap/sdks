import invariant18 from 'tiny-invariant';
import UniversalRouter from '@uniswap/universal-router/artifacts/contracts/UniversalRouter.sol/UniversalRouter.json';
import { Interface, defaultAbiCoder as defaultAbiCoder$1 } from '@ethersproject/abi';
import { constants, BigNumber as BigNumber$1, ethers } from 'ethers';
import JSBI13 from 'jsbi';
import _Decimal from 'decimal.js-light';
import _Big from 'big.js';
import toFormat from 'toformat';
import { isBytes, hexlify, isHexString, concat, hexZeroPad } from '@ethersproject/bytes';
import { getAddress, getCreate2Address } from '@ethersproject/address';
import { keccak256 as keccak256$1 } from '@ethersproject/keccak256';
import { toUtf8Bytes } from '@ethersproject/strings';
import { keccak256, pack } from '@ethersproject/solidity';
import IMulticall from '@uniswap/v3-periphery/artifacts/contracts/interfaces/IMulticall.sol/IMulticall.json';
import INonfungiblePositionManager from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json';
import ISelfPermit from '@uniswap/v3-periphery/artifacts/contracts/interfaces/ISelfPermit.sol/ISelfPermit.json';
import IPeripheryPaymentsWithFee from '@uniswap/v3-periphery/artifacts/contracts/interfaces/IPeripheryPaymentsWithFee.sol/IPeripheryPaymentsWithFee.json';
import { defaultAbiCoder, isAddress } from 'ethers/lib/utils';
import 'bignumber.js';

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

// src/core/addresses.ts
var DEFAULT_NETWORKS = [1 /* MAINNET */, 5 /* GOERLI */, 11155111 /* SEPOLIA */];
function constructSameAddressMap(address, additionalNetworks = []) {
  return DEFAULT_NETWORKS.concat(additionalNetworks).reduce((memo, chainId) => {
    memo[chainId] = address;
    return memo;
  }, {});
}
constructSameAddressMap("0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", [
  10 /* OPTIMISM */,
  42161 /* ARBITRUM_ONE */,
  137 /* POLYGON */,
  80001 /* POLYGON_MUMBAI */,
  11155111 /* SEPOLIA */
]);
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
({
  ...SUPPORTED_CHAINS.reduce((memo, chainId) => {
    memo[chainId] = CHAIN_TO_ADDRESSES_MAP[chainId].v3CoreFactoryAddress;
    return memo;
  }, {})
});
({
  ...SUPPORTED_CHAINS.reduce((memo, chainId) => {
    const v3MigratorAddress = CHAIN_TO_ADDRESSES_MAP[chainId].v3MigratorAddress;
    if (v3MigratorAddress) {
      memo[chainId] = v3MigratorAddress;
    }
    return memo;
  }, {})
});
({
  ...SUPPORTED_CHAINS.reduce((memo, chainId) => {
    memo[chainId] = CHAIN_TO_ADDRESSES_MAP[chainId].multicallAddress;
    return memo;
  }, {})
});
constructSameAddressMap(
  "0x5e4be8Bc9637f0EAA1A755019e06A68ce081D58F"
);
constructSameAddressMap("0x1a9C8182C09F50C8318d769245beA52c32BE35BC");
({
  ...SUPPORTED_CHAINS.reduce((memo, chainId) => {
    memo[chainId] = CHAIN_TO_ADDRESSES_MAP[chainId].quoterAddress;
    return memo;
  }, {})
});
({
  ...SUPPORTED_CHAINS.reduce((memo, chainId) => {
    const nonfungiblePositionManagerAddress = CHAIN_TO_ADDRESSES_MAP[chainId].nonfungiblePositionManagerAddress;
    if (nonfungiblePositionManagerAddress) {
      memo[chainId] = nonfungiblePositionManagerAddress;
    }
    return memo;
  }, {})
});
({
  ...constructSameAddressMap("0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e")
});
({
  ...SUPPORTED_CHAINS.reduce((memo, chainId) => {
    const tickLensAddress = CHAIN_TO_ADDRESSES_MAP[chainId].tickLensAddress;
    if (tickLensAddress) {
      memo[chainId] = tickLensAddress;
    }
    return memo;
  }, {})
});
SUPPORTED_CHAINS.reduce((memo, chainId) => {
  const mixedRouteQuoterV1Address = CHAIN_TO_ADDRESSES_MAP[chainId].mixedRouteQuoterV1Address;
  if (mixedRouteQuoterV1Address) {
    memo[chainId] = mixedRouteQuoterV1Address;
  }
  return memo;
}, {});
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
    invariant18(Number.isInteger(significantDigits), `${significantDigits} is not an integer.`);
    invariant18(significantDigits > 0, `${significantDigits} is not positive.`);
    Decimal.set({ precision: significantDigits + 1, rounding: toSignificantRounding[rounding] });
    const quotient = new Decimal(this.numerator.toString()).div(this.denominator.toString()).toSignificantDigits(significantDigits);
    return quotient.toFormat(quotient.decimalPlaces(), format);
  }
  toFixed(decimalPlaces, format = { groupSeparator: "" }, rounding = 1 /* ROUND_HALF_UP */) {
    invariant18(Number.isInteger(decimalPlaces), `${decimalPlaces} is not an integer.`);
    invariant18(decimalPlaces >= 0, `${decimalPlaces} is negative.`);
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
    invariant18(JSBI13.lessThanOrEqual(this.quotient, MaxUint256), "AMOUNT");
    this.currency = currency;
    this.decimalScale = JSBI13.exponentiate(JSBI13.BigInt(10), JSBI13.BigInt(currency.decimals));
  }
  add(other) {
    invariant18(this.currency.equals(other.currency), "CURRENCY");
    const added = super.add(other);
    return _CurrencyAmount.fromFractionalAmount(this.currency, added.numerator, added.denominator);
  }
  subtract(other) {
    invariant18(this.currency.equals(other.currency), "CURRENCY");
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
    invariant18(decimalPlaces <= this.currency.decimals, "DECIMALS");
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
    invariant18(this.quoteCurrency.equals(other.baseCurrency), "TOKEN");
    const fraction = super.multiply(other);
    return new _Price(this.baseCurrency, other.quoteCurrency, fraction.denominator, fraction.numerator);
  }
  /**
   * Return the amount of quote currency corresponding to a given amount of the base currency
   * @param currencyAmount the amount of base currency to quote against the price
   */
  quote(currencyAmount) {
    invariant18(currencyAmount.currency.equals(this.baseCurrency), "TOKEN");
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
    invariant18(Number.isSafeInteger(chainId), "CHAIN_ID");
    invariant18(decimals >= 0 && decimals < 255 && Number.isInteger(decimals), "DECIMALS");
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
    if (isBytes(anyValue)) {
      return _BigNumber.from(hexlify(anyValue));
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
          if (isHexString(hex) || hex[0] === "-" && isHexString(hex.substring(1))) {
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
function validateAndParseAddress(address) {
  try {
    return getAddress(address);
  } catch (error) {
    throw new Error(`${address} is not a valid address.`);
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
      invariant18(buyFeeBps.gte(BigNumber.from(0)), "NON-NEGATIVE FOT FEES");
    }
    if (sellFeeBps) {
      invariant18(sellFeeBps.gte(BigNumber.from(0)), "NON-NEGATIVE FOT FEES");
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
    invariant18(this.chainId === other.chainId, "CHAIN_IDS");
    invariant18(this.address.toLowerCase() !== other.address.toLowerCase(), "ADDRESSES");
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
    invariant18(!!weth9, "WRAPPED");
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
  const prefix = keccak256$1(toUtf8Bytes("zksyncCreate2"));
  const inputHash = keccak256$1(input);
  const addressBytes = keccak256$1(concat([prefix, hexZeroPad(sender, 32), salt, bytecodeHash, inputHash])).slice(26);
  return getAddress(addressBytes);
}
function sortedInsert(items, add, maxSize, comparator) {
  invariant18(maxSize > 0, "MAX_SIZE_ZERO");
  invariant18(items.length <= maxSize, "ITEMS_SIZE");
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
  invariant18(JSBI13.greaterThanOrEqual(value, ZERO), "NEGATIVE");
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
var TICK_SPACINGS = {
  [100 /* LOWEST */]: 1,
  [200 /* LOW_200 */]: 4,
  [300 /* LOW_300 */]: 6,
  [400 /* LOW_400 */]: 8,
  [500 /* LOW */]: 10,
  [3e3 /* MEDIUM */]: 60,
  [1e4 /* HIGH */]: 200
};
var NEGATIVE_ONE = JSBI13.BigInt(-1);
var ZERO2 = JSBI13.BigInt(0);
var ONE2 = JSBI13.BigInt(1);
var Q96 = JSBI13.exponentiate(JSBI13.BigInt(2), JSBI13.BigInt(96));
var Q192 = JSBI13.exponentiate(Q96, JSBI13.BigInt(2));
function computePoolAddress({
  factoryAddress,
  tokenA,
  tokenB,
  fee,
  initCodeHashManualOverride,
  chainId
}) {
  const [token0, token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA];
  const salt = keccak256(
    ["bytes"],
    [defaultAbiCoder$1.encode(["address", "address", "uint24"], [token0.address, token1.address, fee])]
  );
  const initCodeHash = initCodeHashManualOverride ?? poolInitCodeHash(chainId);
  switch (chainId) {
    case 324 /* ZKSYNC */:
      return computeZksyncCreate2Address(factoryAddress, initCodeHash, salt);
    default:
      return getCreate2Address(factoryAddress, salt, initCodeHash);
  }
}
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
    invariant18(JSBI13.greaterThan(sqrtPX96, ZERO2));
    invariant18(JSBI13.greaterThan(liquidity, ZERO2));
    return zeroForOne ? this.getNextSqrtPriceFromAmount0RoundingUp(sqrtPX96, liquidity, amountIn, true) : this.getNextSqrtPriceFromAmount1RoundingDown(sqrtPX96, liquidity, amountIn, true);
  }
  static getNextSqrtPriceFromOutput(sqrtPX96, liquidity, amountOut, zeroForOne) {
    invariant18(JSBI13.greaterThan(sqrtPX96, ZERO2));
    invariant18(JSBI13.greaterThan(liquidity, ZERO2));
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
      invariant18(JSBI13.equal(JSBI13.divide(product, amount), sqrtPX96));
      invariant18(JSBI13.greaterThan(numerator1, product));
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
      invariant18(JSBI13.greaterThan(sqrtPX96, quotient));
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
  invariant18(JSBI13.greaterThan(x, ZERO2), "ZERO");
  invariant18(JSBI13.lessThanOrEqual(x, MaxUint256), "MAX");
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
    invariant18(tick >= _TickMath.MIN_TICK && tick <= _TickMath.MAX_TICK && Number.isInteger(tick), "TICK");
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
    invariant18(
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
    invariant18(JSBI13.greaterThan(sqrtPriceLimitX96, TickMath.MIN_SQRT_RATIO), "RATIO_MIN");
    invariant18(JSBI13.lessThan(sqrtPriceLimitX96, sqrtRatioX96), "RATIO_CURRENT");
  } else {
    invariant18(JSBI13.lessThan(sqrtPriceLimitX96, TickMath.MAX_SQRT_RATIO), "RATIO_MAX");
    invariant18(JSBI13.greaterThan(sqrtPriceLimitX96, sqrtRatioX96), "RATIO_CURRENT");
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
    invariant18(tickSpacing > 0, "TICK_SPACING_NONZERO");
    invariant18(
      ticks.every(({ index }) => index % tickSpacing === 0),
      "TICK_SPACING"
    );
    invariant18(
      JSBI13.equal(
        ticks.reduce((accumulator, { liquidityNet }) => JSBI13.add(accumulator, liquidityNet), ZERO2),
        ZERO2
      ),
      "ZERO_NET"
    );
    invariant18(isSorted(ticks, tickComparator), "SORTED");
  }
  static isBelowSmallest(ticks, tick) {
    invariant18(ticks.length > 0, "LENGTH");
    return tick < ticks[0].index;
  }
  static isAtOrAboveLargest(ticks, tick) {
    invariant18(ticks.length > 0, "LENGTH");
    return tick >= ticks[ticks.length - 1].index;
  }
  static getTick(ticks, index) {
    const tick = ticks[this.binarySearch(ticks, index)];
    invariant18(tick.index === index, "NOT_CONTAINED");
    return tick;
  }
  /**
   * Finds the largest tick in the list of ticks that is less than or equal to tick
   * @param ticks list of ticks
   * @param tick tick to find the largest tick that is less than or equal to tick
   * @private
   */
  static binarySearch(ticks, tick) {
    invariant18(!this.isBelowSmallest(ticks, tick), "BELOW_SMALLEST");
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
      invariant18(!_TickList.isBelowSmallest(ticks, tick), "BELOW_SMALLEST");
      if (_TickList.isAtOrAboveLargest(ticks, tick)) {
        return ticks[ticks.length - 1];
      }
      const index = this.binarySearch(ticks, tick);
      return ticks[index];
    } else {
      invariant18(!this.isAtOrAboveLargest(ticks, tick), "AT_OR_ABOVE_LARGEST");
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
function toHex2(bigintIsh) {
  const bigInt = JSBI13.BigInt(bigintIsh);
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
  return exactOutput ? pack(types.reverse(), path.reverse()) : pack(types, path);
}
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
function tickToPrice(baseToken, quoteToken, tick) {
  const sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);
  const ratioX192 = JSBI13.multiply(sqrtRatioX96, sqrtRatioX96);
  return baseToken.sortsBefore(quoteToken) ? new Price(baseToken, quoteToken, Q192, ratioX192) : new Price(baseToken, quoteToken, ratioX192, Q192);
}

// src/v3/entities/tick.ts
var Tick = class {
  constructor({ index, liquidityGross, liquidityNet }) {
    invariant18(index >= TickMath.MIN_TICK && index <= TickMath.MAX_TICK, "TICK");
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
    invariant18(Number.isInteger(fee) && fee < 1e6, "FEE");
    const tickCurrentSqrtRatioX96 = TickMath.getSqrtRatioAtTick(tickCurrent);
    const nextTickSqrtRatioX96 = TickMath.getSqrtRatioAtTick(tickCurrent + 1);
    invariant18(
      JSBI13.greaterThanOrEqual(JSBI13.BigInt(sqrtRatioX96), tickCurrentSqrtRatioX96) && JSBI13.lessThanOrEqual(JSBI13.BigInt(sqrtRatioX96), nextTickSqrtRatioX96),
      "PRICE_BOUNDS"
    );
    [this.token0, this.token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA];
    this.fee = fee;
    this.sqrtRatioX96 = JSBI13.BigInt(sqrtRatioX96);
    this.liquidity = JSBI13.BigInt(liquidity);
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
      JSBI13.multiply(this.sqrtRatioX96, this.sqrtRatioX96)
    ));
  }
  /**
   * Returns the current mid price of the pool in terms of token1, i.e. the ratio of token0 over token1
   */
  get token1Price() {
    return this._token1Price ?? (this._token1Price = new Price(
      this.token1,
      this.token0,
      JSBI13.multiply(this.sqrtRatioX96, this.sqrtRatioX96),
      Q192
    ));
  }
  /**
   * Return the price of the given token in terms of the other token in the pool.
   * @param token The token to return price of
   * @returns The price of the given token, in terms of the other.
   */
  priceOf(token) {
    invariant18(this.involvesToken(token), "TOKEN");
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
    invariant18(this.involvesToken(inputAmount.currency), "TOKEN");
    const zeroForOne = inputAmount.currency.equals(this.token0);
    const {
      amountCalculated: outputAmount,
      sqrtRatioX96,
      liquidity,
      tickCurrent
    } = await this.swap(zeroForOne, inputAmount.quotient, sqrtPriceLimitX96);
    const outputToken = zeroForOne ? this.token1 : this.token0;
    return [
      CurrencyAmount.fromRawAmount(outputToken, JSBI13.multiply(outputAmount, NEGATIVE_ONE)),
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
    invariant18(outputAmount.currency.isToken && this.involvesToken(outputAmount.currency), "TOKEN");
    const zeroForOne = outputAmount.currency.equals(this.token1);
    const {
      amountCalculated: inputAmount,
      sqrtRatioX96,
      liquidity,
      tickCurrent
    } = await this.swap(zeroForOne, JSBI13.multiply(outputAmount.quotient, NEGATIVE_ONE), sqrtPriceLimitX96);
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
    invariant18(tickLower < tickUpper, "TICK_ORDER");
    invariant18(tickLower >= TickMath.MIN_TICK && tickLower % pool.tickSpacing === 0, "TICK_LOWER");
    invariant18(tickUpper <= TickMath.MAX_TICK && tickUpper % pool.tickSpacing === 0, "TICK_UPPER");
    this.pool = pool;
    this.tickLower = tickLower;
    this.tickUpper = tickUpper;
    this.liquidity = JSBI13.BigInt(liquidity);
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
    invariant18(pools.length > 0, "POOLS");
    const chainId = pools[0].chainId;
    const allOnSameChain = pools.every((pool) => pool.chainId === chainId);
    invariant18(allOnSameChain, "CHAIN_IDS");
    const wrappedInput = input.wrapped;
    invariant18(pools[0].involvesToken(wrappedInput), "INPUT");
    invariant18(pools[pools.length - 1].involvesToken(output.wrapped), "OUTPUT");
    const tokenPath = [wrappedInput];
    for (const [i, pool] of pools.entries()) {
      const currentInputToken = tokenPath[i];
      invariant18(currentInputToken.equals(pool.token0) || currentInputToken.equals(pool.token1), "PATH");
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
  invariant18(a.inputAmount.currency.equals(b.inputAmount.currency), "INPUT_CURRENCY");
  invariant18(a.outputAmount.currency.equals(b.outputAmount.currency), "OUTPUT_CURRENCY");
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
    invariant18(this.swaps.length === 1, "MULTIPLE_ROUTES");
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
      invariant18(amount.currency.equals(route.input), "INPUT");
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
      invariant18(amount.currency.equals(route.output), "OUTPUT");
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
        invariant18(amount.currency.equals(route.input), "INPUT");
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
        invariant18(amount.currency.equals(route.output), "OUTPUT");
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
    invariant18(
      routes.every(({ route }) => inputCurrency.wrapped.equals(route.input.wrapped)),
      "INPUT_CURRENCY_MATCH"
    );
    invariant18(
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
    invariant18(numPools === poolAddressSet.size, "POOLS_DUPLICATED");
    this.swaps = routes;
    this.tradeType = tradeType;
  }
  /**
   * Get the minimum amount that must be received from this trade for the given slippage tolerance
   * @param slippageTolerance The tolerance of unfavorable slippage from the execution price of this trade
   * @returns The amount out
   */
  minimumAmountOut(slippageTolerance, amountOut = this.outputAmount) {
    invariant18(!slippageTolerance.lessThan(ZERO2), "SLIPPAGE_TOLERANCE");
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
    invariant18(!slippageTolerance.lessThan(ZERO2), "SLIPPAGE_TOLERANCE");
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
    invariant18(pools.length > 0, "POOLS");
    invariant18(maxHops > 0, "MAX_HOPS");
    invariant18(currencyAmountIn === nextAmountIn || currentPools.length > 0, "INVALID_RECURSION");
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
    invariant18(pools.length > 0, "POOLS");
    invariant18(maxHops > 0, "MAX_HOPS");
    invariant18(currencyAmountOut === nextAmountOut || currentPools.length > 0, "INVALID_RECURSION");
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
_Multicall.INTERFACE = new Interface(IMulticall.abi);
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
      toHex2(options.nonce),
      toHex2(options.expiry),
      options.v,
      options.r,
      options.s
    ]) : _SelfPermit.INTERFACE.encodeFunctionData("selfPermit", [
      token.address,
      toHex2(options.amount),
      toHex2(options.deadline),
      options.v,
      options.r,
      options.s
    ]);
  }
};
_SelfPermit.INTERFACE = new Interface(ISelfPermit.abi);
var SelfPermit = _SelfPermit;
var _Payments = class _Payments {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  static encodeFeeBips(fee) {
    return toHex2(fee.multiply(1e4).quotient);
  }
  static encodeUnwrapWETH9(amountMinimum, recipient, feeOptions) {
    recipient = validateAndParseAddress(recipient);
    if (!!feeOptions) {
      const feeBips = this.encodeFeeBips(feeOptions.fee);
      const feeRecipient = validateAndParseAddress(feeOptions.recipient);
      return _Payments.INTERFACE.encodeFunctionData("unwrapWETH9WithFee", [
        toHex2(amountMinimum),
        recipient,
        feeBips,
        feeRecipient
      ]);
    } else {
      return _Payments.INTERFACE.encodeFunctionData("unwrapWETH9", [toHex2(amountMinimum), recipient]);
    }
  }
  static encodeSweepToken(token, amountMinimum, recipient, feeOptions) {
    recipient = validateAndParseAddress(recipient);
    if (!!feeOptions) {
      const feeBips = this.encodeFeeBips(feeOptions.fee);
      const feeRecipient = validateAndParseAddress(feeOptions.recipient);
      return _Payments.INTERFACE.encodeFunctionData("sweepTokenWithFee", [
        token.address,
        toHex2(amountMinimum),
        recipient,
        feeBips,
        feeRecipient
      ]);
    } else {
      return _Payments.INTERFACE.encodeFunctionData("sweepToken", [token.address, toHex2(amountMinimum), recipient]);
    }
  }
  static encodeRefundETH() {
    return _Payments.INTERFACE.encodeFunctionData("refundETH");
  }
};
_Payments.INTERFACE = new Interface(IPeripheryPaymentsWithFee.abi);
var Payments = _Payments;

// src/v3/nonfungiblePositionManager.ts
var MaxUint128 = toHex2(JSBI13.subtract(JSBI13.exponentiate(JSBI13.BigInt(2), JSBI13.BigInt(128)), JSBI13.BigInt(1)));
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
      toHex2(pool.sqrtRatioX96)
    ]);
  }
  static createCallParameters(pool) {
    return {
      calldata: this.encodeCreate(pool),
      value: toHex2(0)
    };
  }
  static addCallParameters(position, options) {
    invariant18(JSBI13.greaterThan(position.liquidity, ZERO2), "ZERO_LIQUIDITY");
    const calldatas = [];
    const { amount0: amount0Desired, amount1: amount1Desired } = position.mintAmounts;
    const minimumAmounts = position.mintAmountsWithSlippage(options.slippageTolerance);
    const amount0Min = toHex2(minimumAmounts.amount0);
    const amount1Min = toHex2(minimumAmounts.amount1);
    const deadline = toHex2(options.deadline);
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
            amount0Desired: toHex2(amount0Desired),
            amount1Desired: toHex2(amount1Desired),
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
            tokenId: toHex2(options.tokenId),
            amount0Desired: toHex2(amount0Desired),
            amount1Desired: toHex2(amount1Desired),
            amount0Min,
            amount1Min,
            deadline
          }
        ])
      );
    }
    let value = toHex2(0);
    if (options.useNative) {
      const wrapped = options.useNative.wrapped;
      invariant18(position.pool.token0.equals(wrapped) || position.pool.token1.equals(wrapped), "NO_WETH");
      const wrappedValue = position.pool.token0.equals(wrapped) ? amount0Desired : amount1Desired;
      if (JSBI13.greaterThan(wrappedValue, ZERO2)) {
        calldatas.push(Payments.encodeRefundETH());
      }
      value = toHex2(wrappedValue);
    }
    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value
    };
  }
  static encodeCollect(options) {
    const calldatas = [];
    const tokenId = toHex2(options.tokenId);
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
      value: toHex2(0)
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
    const deadline = toHex2(options.deadline);
    const tokenId = toHex2(options.tokenId);
    const partialPosition = new Position({
      pool: position.pool,
      liquidity: options.liquidityPercentage.multiply(position.liquidity).quotient,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper
    });
    invariant18(JSBI13.greaterThan(partialPosition.liquidity, ZERO2), "ZERO_LIQUIDITY");
    const { amount0: amount0Min, amount1: amount1Min } = partialPosition.burnAmountsWithSlippage(
      options.slippageTolerance
    );
    if (options.permit) {
      calldatas.push(
        _NonfungiblePositionManager.INTERFACE.encodeFunctionData("permit", [
          validateAndParseAddress(options.permit.spender),
          tokenId,
          toHex2(options.permit.deadline),
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
          liquidity: toHex2(partialPosition.liquidity),
          amount0Min: toHex2(amount0Min),
          amount1Min: toHex2(amount1Min),
          deadline
        }
      ])
    );
    const { expectedCurrencyOwed0, expectedCurrencyOwed1, ...rest } = options.collectOptions;
    calldatas.push(
      ..._NonfungiblePositionManager.encodeCollect({
        tokenId: toHex2(options.tokenId),
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
      invariant18(options.burnToken !== true, "CANNOT_BURN");
    }
    return {
      calldata: Multicall.encodeMulticall(calldatas),
      value: toHex2(0)
    };
  }
  static safeTransferFromParameters(options) {
    const recipient = validateAndParseAddress(options.recipient);
    const sender = validateAndParseAddress(options.sender);
    let calldata;
    if (options.data) {
      calldata = _NonfungiblePositionManager.INTERFACE.encodeFunctionData(
        "safeTransferFrom(address,address,uint256,bytes)",
        [sender, recipient, toHex2(options.tokenId), options.data]
      );
    } else {
      calldata = _NonfungiblePositionManager.INTERFACE.encodeFunctionData("safeTransferFrom(address,address,uint256)", [
        sender,
        recipient,
        toHex2(options.tokenId)
      ]);
    }
    return {
      calldata,
      value: toHex2(0)
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
_NonfungiblePositionManager.INTERFACE = new Interface(INonfungiblePositionManager.abi);
var NonfungiblePositionManager = _NonfungiblePositionManager;

// src/v4/utils/sortsBefore.ts
function sortsBefore(currencyA, currencyB) {
  if (currencyA.isNative) return true;
  if (currencyB.isNative) return false;
  return currencyA.wrapped.sortsBefore(currencyB.wrapped);
}
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
    invariant18(isAddress(address), "invalid address");
  }
};
var ADDRESS_ZERO2 = constants.AddressZero;
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
var NO_TICK_DATA_PROVIDER_DEFAULT2 = new NoTickDataProvider();
var Pool2 = class _Pool {
  static getPoolKey(currencyA, currencyB, fee, tickSpacing, hooks) {
    invariant18(isAddress(hooks), "Invalid hook address");
    const [currency0, currency1] = sortsBefore(currencyA, currencyB) ? [currencyA, currencyB] : [currencyB, currencyA];
    const currency0Addr = currency0.isNative ? ADDRESS_ZERO2 : currency0.wrapped.address;
    const currency1Addr = currency1.isNative ? ADDRESS_ZERO2 : currency1.wrapped.address;
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
    const currency0Addr = currency0.isNative ? ADDRESS_ZERO2 : currency0.wrapped.address;
    const currency1Addr = currency1.isNative ? ADDRESS_ZERO2 : currency1.wrapped.address;
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
  constructor(currencyA, currencyB, fee, tickSpacing, hooks, sqrtRatioX96, liquidity, tickCurrent, ticks = NO_TICK_DATA_PROVIDER_DEFAULT2) {
    invariant18(isAddress(hooks), "Invalid hook address");
    invariant18(Number.isInteger(fee) && (fee === DYNAMIC_FEE_FLAG || fee < 1e6), "FEE");
    if (fee === DYNAMIC_FEE_FLAG) {
      invariant18(Number(hooks) > 0, "Dynamic fee pool requires a hook");
    }
    const tickCurrentSqrtRatioX96 = TickMath.getSqrtRatioAtTick(tickCurrent);
    const nextTickSqrtRatioX96 = TickMath.getSqrtRatioAtTick(tickCurrent + 1);
    invariant18(
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
    invariant18(this.involvesCurrency(currency), "CURRENCY");
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
    invariant18(this.involvesCurrency(inputAmount.currency), "CURRENCY");
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
    invariant18(this.involvesCurrency(outputAmount.currency), "CURRENCY");
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
var Route2 = class {
  /**
   * Creates an instance of route.
   * @param pools An array of `Pool` objects, ordered by the route the swap will take
   * @param input The input currency
   * @param output The output currency
   */
  constructor(pools, input, output) {
    // equivalent or wrapped/unwrapped output to match pool
    this._midPrice = null;
    invariant18(pools.length > 0, "POOLS");
    const chainId = pools[0].chainId;
    const allOnSameChain = pools.every((pool) => pool.chainId === chainId);
    invariant18(allOnSameChain, "CHAIN_IDS");
    this.pathInput = getPathCurrency(input, pools[0]);
    this.pathOutput = getPathCurrency(output, pools[pools.length - 1]);
    const currencyPath = [this.pathInput];
    for (const [i, pool] of pools.entries()) {
      const currentInputCurrency = currencyPath[i];
      invariant18(currentInputCurrency.equals(pool.currency0) || currentInputCurrency.equals(pool.currency1), "PATH");
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
function tradeComparator2(a, b) {
  invariant18(a.inputAmount.currency.equals(b.inputAmount.currency), "INPUT_CURRENCY");
  invariant18(a.outputAmount.currency.equals(b.outputAmount.currency), "OUTPUT_CURRENCY");
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
var Trade2 = class _Trade {
  /**
   * @deprecated Deprecated in favor of 'swaps' property. If the trade consists of multiple routes
   * this will return an error.
   *
   * When the trade consists of just a single route, this returns the route of the trade,
   * i.e. which pools the trade goes through.
   */
  get route() {
    invariant18(this.swaps.length === 1, "MULTIPLE_ROUTES");
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
      invariant18(amount.currency.equals(route.input), "INPUT");
      let tokenAmount = amountWithPathCurrency(amount, route.pools[0]);
      for (let i = 0; i < route.pools.length; i++) {
        const pool = route.pools[i];
        [tokenAmount] = await pool.getOutputAmount(tokenAmount);
      }
      inputAmount = CurrencyAmount.fromFractionalAmount(route.input, amount.numerator, amount.denominator);
      outputAmount = CurrencyAmount.fromFractionalAmount(route.output, tokenAmount.numerator, tokenAmount.denominator);
    } else {
      invariant18(amount.currency.equals(route.output), "OUTPUT");
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
    invariant18(
      routes.every(({ route }) => inputCurrency.equals(route.input)),
      "INPUT_CURRENCY_MATCH"
    );
    invariant18(
      routes.every(({ route }) => outputCurrency.equals(route.output)),
      "OUTPUT_CURRENCY_MATCH"
    );
    const numPools = routes.map(({ route }) => route.pools.length).reduce((total, cur) => total + cur, 0);
    const poolIDSet = /* @__PURE__ */ new Set();
    for (const { route } of routes) {
      for (const pool of route.pools) {
        poolIDSet.add(Pool2.getPoolId(pool.currency0, pool.currency1, pool.fee, pool.tickSpacing, pool.hooks));
      }
    }
    invariant18(numPools === poolIDSet.size, "POOLS_DUPLICATED");
    this.swaps = routes;
    this.tradeType = tradeType;
  }
  /**
   * Get the minimum amount that must be received from this trade for the given slippage tolerance
   * @param slippageTolerance The tolerance of unfavorable slippage from the execution price of this trade
   * @returns The amount out
   */
  minimumAmountOut(slippageTolerance, amountOut = this.outputAmount) {
    invariant18(!slippageTolerance.lessThan(ZERO3), "SLIPPAGE_TOLERANCE");
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
    invariant18(!slippageTolerance.lessThan(ZERO3), "SLIPPAGE_TOLERANCE");
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
    invariant18(pools.length > 0, "POOLS");
    invariant18(maxHops > 0, "MAX_HOPS");
    invariant18(currencyAmountIn === nextAmountIn || currentPools.length > 0, "INVALID_RECURSION");
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
            new Route2([...currentPools, pool], currencyAmountIn.currency, currencyOut),
            currencyAmountIn,
            0 /* EXACT_INPUT */
          ),
          maxNumResults,
          tradeComparator2
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
    invariant18(pools.length > 0, "POOLS");
    invariant18(maxHops > 0, "MAX_HOPS");
    invariant18(currencyAmountOut === nextAmountOut || currentPools.length > 0, "INVALID_RECURSION");
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
            new Route2([pool, ...currentPools], currencyIn, currencyAmountOut.currency),
            currencyAmountOut,
            1 /* EXACT_OUTPUT */
          ),
          maxNumResults,
          tradeComparator2
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
function tickToPrice2(baseCurrency, quoteCurrency, tick) {
  const sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);
  const ratioX192 = JSBI13.multiply(sqrtRatioX96, sqrtRatioX96);
  return sortsBefore(baseCurrency, quoteCurrency) ? new Price(baseCurrency, quoteCurrency, Q1922, ratioX192) : new Price(baseCurrency, quoteCurrency, ratioX192, Q1922);
}

// src/v4/entities/position.ts
var Position2 = class _Position {
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
    invariant18(tickLower < tickUpper, "TICK_ORDER");
    invariant18(tickLower >= TickMath.MIN_TICK && tickLower % pool.tickSpacing === 0, "TICK_LOWER");
    invariant18(tickUpper <= TickMath.MAX_TICK && tickUpper % pool.tickSpacing === 0, "TICK_UPPER");
    this.pool = pool;
    this.tickLower = tickLower;
    this.tickUpper = tickUpper;
    this.liquidity = JSBI13.BigInt(liquidity);
  }
  /**
   * Returns the price of token0 at the lower tick
   */
  get token0PriceLower() {
    return tickToPrice2(this.pool.currency0, this.pool.currency1, this.tickLower);
  }
  /**
   * Returns the price of token0 at the upper tick
   */
  get token0PriceUpper() {
    return tickToPrice2(this.pool.currency0, this.pool.currency1, this.tickUpper);
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
    const poolLower = new Pool2(
      this.pool.token0,
      this.pool.token1,
      this.pool.fee,
      this.pool.tickSpacing,
      this.pool.hooks,
      sqrtRatioX96Lower,
      0,
      TickMath.getTickAtSqrtRatio(sqrtRatioX96Lower)
    );
    const poolUpper = new Pool2(
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
    const poolLower = new Pool2(
      this.pool.currency0,
      this.pool.currency1,
      this.pool.fee,
      this.pool.tickSpacing,
      this.pool.hooks,
      sqrtRatioX96Lower,
      0,
      TickMath.getTickAtSqrtRatio(sqrtRatioX96Lower)
    );
    const poolUpper = new Pool2(
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
var encodeRouteToPath2 = (route, exactOutput) => {
  let pools = route.pools.map((p) => p);
  if (exactOutput) pools = pools.reverse();
  let startingCurrency = exactOutput ? route.pathOutput : route.pathInput;
  let pathKeys = [];
  for (let pool of pools) {
    const nextCurrency = startingCurrency.equals(pool.currency0) ? pool.currency1 : pool.currency0;
    pathKeys.push({
      intermediateCurrency: nextCurrency.isNative ? ADDRESS_ZERO2 : nextCurrency.address,
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
    if (exactOutput) invariant18(!!slippageTolerance, "ExactOut requires slippageTolerance");
    invariant18(trade.swaps.length === 1, "Only accepts Trades with 1 swap (must break swaps into individual trades)");
    const actionType = exactOutput ? 9 /* SWAP_EXACT_OUT */ : 7 /* SWAP_EXACT_IN */;
    const currencyIn = currencyAddress(trade.route.pathInput);
    const currencyOut = currencyAddress(trade.route.pathOutput);
    this.addAction(actionType, [
      exactOutput ? {
        currencyOut,
        path: encodeRouteToPath2(trade.route, exactOutput),
        amountInMaximum: trade.maximumAmountIn(slippageTolerance ?? new Percent(0)).quotient.toString(),
        amountOut: trade.outputAmount.quotient.toString()
      } : {
        currencyIn,
        path: encodeRouteToPath2(trade.route, exactOutput),
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
  return currency.isNative ? ADDRESS_ZERO2 : currency.wrapped.address;
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
  if (currency.isNative) return ADDRESS_ZERO2;
  else return currency.wrapped.address;
}

// src/v4/utils/v4PositionPlanner.ts
var V4PositionPlanner = class extends V4Planner {
  // MINT_POSITION
  addMint(pool, tickLower, tickUpper, liquidity, amount0Max, amount1Max, owner, hookData = EMPTY_BYTES) {
    const inputs = [
      Pool2.getPoolKey(pool.currency0, pool.currency1, pool.fee, pool.tickSpacing, pool.hooks),
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
function toHex3(bigintIsh) {
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
var _Multicall2 = class _Multicall2 {
  /**
   * Cannot be constructed.
   */
  constructor() {
  }
  static encodeMulticall(calldataList) {
    if (!Array.isArray(calldataList)) {
      calldataList = [calldataList];
    }
    return calldataList.length === 1 ? calldataList[0] : _Multicall2.INTERFACE.encodeFunctionData("multicall", [calldataList]);
  }
  static decodeMulticall(encodedCalldata) {
    return _Multicall2.INTERFACE.decodeFunctionData("multicall", encodedCalldata)[0];
  }
};
_Multicall2.INTERFACE = new Interface(IMulticall.abi);
var Multicall2 = _Multicall2;

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
var NFT_PERMIT_TYPES2 = {
  Permit: [
    { name: "spender", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ]
};
function isMint2(options) {
  return Object.keys(options).some((k) => k === "recipient");
}
function shouldCreatePool(options) {
  if (options.createPool) {
    invariant18(options.sqrtPriceX96 !== void 0, NO_SQRT_PRICE);
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
      value: toHex3(0)
    };
  }
  static addCallParameters(position, options) {
    invariant18(JSBI13.greaterThan(position.liquidity, ZERO3), ZERO_LIQUIDITY);
    const calldataList = [];
    const planner = new V4PositionPlanner();
    if (isMint2(options) && shouldCreatePool(options)) {
      calldataList.push(_V4PositionManager.encodeInitializePool(position.pool.poolKey, options.sqrtPriceX96));
    }
    invariant18(
      position.pool.currency0 === options.useNative || !position.pool.currency0.isNative && options.useNative === void 0,
      NATIVE_NOT_SET
    );
    const maximumAmounts = position.mintAmountsWithSlippage(options.slippageTolerance);
    const amount0Max = toHex3(maximumAmounts.amount0);
    const amount1Max = toHex3(maximumAmounts.amount1);
    if (options.batchPermit) {
      calldataList.push(
        _V4PositionManager.encodePermitBatch(
          options.batchPermit.owner,
          options.batchPermit.permitBatch,
          options.batchPermit.signature
        )
      );
    }
    if (isMint2(options)) {
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
    let value = toHex3(0);
    if (isMint2(options) && options.migrate) {
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
        value = toHex3(amount0Max);
        planner.addSweep(position.pool.currency0, MSG_SENDER);
      }
    }
    calldataList.push(_V4PositionManager.encodeModifyLiquidities(planner.finalize(), options.deadline));
    return {
      calldata: Multicall2.encodeMulticall(calldataList),
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
    const tokenId = toHex3(options.tokenId);
    if (options.burnToken) {
      invariant18(options.liquidityPercentage.equalTo(ONE3), CANNOT_BURN);
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
      const partialPosition = new Position2({
        pool: position.pool,
        liquidity: options.liquidityPercentage.multiply(position.liquidity).quotient,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper
      });
      invariant18(JSBI13.greaterThan(partialPosition.liquidity, ZERO3), ZERO_LIQUIDITY);
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
      calldata: Multicall2.encodeMulticall(calldataList),
      value: toHex3(0)
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
    const tokenId = toHex3(options.tokenId);
    const recipient = validateAndParseAddress(options.recipient);
    planner.addDecrease(tokenId, "0", "0", "0", options.hookData);
    planner.addTakePair(position.pool.currency0, position.pool.currency1, recipient);
    calldataList.push(_V4PositionManager.encodeModifyLiquidities(planner.finalize(), options.deadline));
    return {
      calldata: Multicall2.encodeMulticall(calldataList),
      value: toHex3(0)
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
      types: NFT_PERMIT_TYPES2,
      values: permit
    };
  }
};
_V4PositionManager.INTERFACE = new Interface(positionManagerAbi);
var V4PositionManager = _V4PositionManager;
var CommandType = /* @__PURE__ */ ((CommandType2) => {
  CommandType2[CommandType2["V3_SWAP_EXACT_IN"] = 0] = "V3_SWAP_EXACT_IN";
  CommandType2[CommandType2["V3_SWAP_EXACT_OUT"] = 1] = "V3_SWAP_EXACT_OUT";
  CommandType2[CommandType2["PERMIT2_TRANSFER_FROM"] = 2] = "PERMIT2_TRANSFER_FROM";
  CommandType2[CommandType2["PERMIT2_PERMIT_BATCH"] = 3] = "PERMIT2_PERMIT_BATCH";
  CommandType2[CommandType2["SWEEP"] = 4] = "SWEEP";
  CommandType2[CommandType2["TRANSFER"] = 5] = "TRANSFER";
  CommandType2[CommandType2["PAY_PORTION"] = 6] = "PAY_PORTION";
  CommandType2[CommandType2["V2_SWAP_EXACT_IN"] = 8] = "V2_SWAP_EXACT_IN";
  CommandType2[CommandType2["V2_SWAP_EXACT_OUT"] = 9] = "V2_SWAP_EXACT_OUT";
  CommandType2[CommandType2["PERMIT2_PERMIT"] = 10] = "PERMIT2_PERMIT";
  CommandType2[CommandType2["WRAP_ETH"] = 11] = "WRAP_ETH";
  CommandType2[CommandType2["UNWRAP_WETH"] = 12] = "UNWRAP_WETH";
  CommandType2[CommandType2["PERMIT2_TRANSFER_FROM_BATCH"] = 13] = "PERMIT2_TRANSFER_FROM_BATCH";
  CommandType2[CommandType2["BALANCE_CHECK_ERC20"] = 14] = "BALANCE_CHECK_ERC20";
  CommandType2[CommandType2["V4_SWAP"] = 16] = "V4_SWAP";
  CommandType2[CommandType2["V3_POSITION_MANAGER_PERMIT"] = 17] = "V3_POSITION_MANAGER_PERMIT";
  CommandType2[CommandType2["V3_POSITION_MANAGER_CALL"] = 18] = "V3_POSITION_MANAGER_CALL";
  CommandType2[CommandType2["V4_INITIALIZE_POOL"] = 19] = "V4_INITIALIZE_POOL";
  CommandType2[CommandType2["V4_POSITION_MANAGER_CALL"] = 20] = "V4_POSITION_MANAGER_CALL";
  CommandType2[CommandType2["EXECUTE_SUB_PLAN"] = 33] = "EXECUTE_SUB_PLAN";
  return CommandType2;
})(CommandType || {});
var Subparser2 = /* @__PURE__ */ ((Subparser3) => {
  Subparser3[Subparser3["V3PathExactIn"] = 0] = "V3PathExactIn";
  Subparser3[Subparser3["V3PathExactOut"] = 1] = "V3PathExactOut";
  return Subparser3;
})(Subparser2 || {});
var Parser = /* @__PURE__ */ ((Parser2) => {
  Parser2[Parser2["Abi"] = 0] = "Abi";
  Parser2[Parser2["V4Actions"] = 1] = "V4Actions";
  Parser2[Parser2["V3Actions"] = 2] = "V3Actions";
  return Parser2;
})(Parser || {});
var ALLOW_REVERT_FLAG = 128;
var REVERTIBLE_COMMANDS = /* @__PURE__ */ new Set([33 /* EXECUTE_SUB_PLAN */]);
var PERMIT_STRUCT = "((address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline)";
var PERMIT_BATCH_STRUCT = "((address token,uint160 amount,uint48 expiration,uint48 nonce)[] details,address spender,uint256 sigDeadline)";
var POOL_KEY_STRUCT2 = "(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)";
var PERMIT2_TRANSFER_FROM_STRUCT = "(address from,address to,uint160 amount,address token)";
var PERMIT2_TRANSFER_FROM_BATCH_STRUCT = PERMIT2_TRANSFER_FROM_STRUCT + "[]";
var COMMAND_DEFINITION = {
  // Batch Reverts
  [33 /* EXECUTE_SUB_PLAN */]: {
    parser: 0 /* Abi */,
    params: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" }
    ]
  },
  // Permit2 Actions
  [10 /* PERMIT2_PERMIT */]: {
    parser: 0 /* Abi */,
    params: [
      { name: "permit", type: PERMIT_STRUCT },
      { name: "signature", type: "bytes" }
    ]
  },
  [3 /* PERMIT2_PERMIT_BATCH */]: {
    parser: 0 /* Abi */,
    params: [
      { name: "permit", type: PERMIT_BATCH_STRUCT },
      { name: "signature", type: "bytes" }
    ]
  },
  [2 /* PERMIT2_TRANSFER_FROM */]: {
    parser: 0 /* Abi */,
    params: [
      { name: "token", type: "address" },
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint160" }
    ]
  },
  [13 /* PERMIT2_TRANSFER_FROM_BATCH */]: {
    parser: 0 /* Abi */,
    params: [
      {
        name: "transferFrom",
        type: PERMIT2_TRANSFER_FROM_BATCH_STRUCT
      }
    ]
  },
  // Uniswap Actions
  [0 /* V3_SWAP_EXACT_IN */]: {
    parser: 0 /* Abi */,
    params: [
      { name: "recipient", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", subparser: 0 /* V3PathExactIn */, type: "bytes" },
      { name: "payerIsUser", type: "bool" }
    ]
  },
  [1 /* V3_SWAP_EXACT_OUT */]: {
    parser: 0 /* Abi */,
    params: [
      { name: "recipient", type: "address" },
      { name: "amountOut", type: "uint256" },
      { name: "amountInMax", type: "uint256" },
      { name: "path", subparser: 1 /* V3PathExactOut */, type: "bytes" },
      { name: "payerIsUser", type: "bool" }
    ]
  },
  [8 /* V2_SWAP_EXACT_IN */]: {
    parser: 0 /* Abi */,
    params: [
      { name: "recipient", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "payerIsUser", type: "bool" }
    ]
  },
  [9 /* V2_SWAP_EXACT_OUT */]: {
    parser: 0 /* Abi */,
    params: [
      { name: "recipient", type: "address" },
      { name: "amountOut", type: "uint256" },
      { name: "amountInMax", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "payerIsUser", type: "bool" }
    ]
  },
  [16 /* V4_SWAP */]: { parser: 1 /* V4Actions */ },
  // Token Actions and Checks
  [11 /* WRAP_ETH */]: {
    parser: 0 /* Abi */,
    params: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" }
    ]
  },
  [12 /* UNWRAP_WETH */]: {
    parser: 0 /* Abi */,
    params: [
      { name: "recipient", type: "address" },
      { name: "amountMin", type: "uint256" }
    ]
  },
  [4 /* SWEEP */]: {
    parser: 0 /* Abi */,
    params: [
      { name: "token", type: "address" },
      { name: "recipient", type: "address" },
      { name: "amountMin", type: "uint256" }
    ]
  },
  [5 /* TRANSFER */]: {
    parser: 0 /* Abi */,
    params: [
      { name: "token", type: "address" },
      { name: "recipient", type: "address" },
      { name: "value", type: "uint256" }
    ]
  },
  [6 /* PAY_PORTION */]: {
    parser: 0 /* Abi */,
    params: [
      { name: "token", type: "address" },
      { name: "recipient", type: "address" },
      { name: "bips", type: "uint256" }
    ]
  },
  [14 /* BALANCE_CHECK_ERC20 */]: {
    parser: 0 /* Abi */,
    params: [
      { name: "owner", type: "address" },
      { name: "token", type: "address" },
      { name: "minBalance", type: "uint256" }
    ]
  },
  [19 /* V4_INITIALIZE_POOL */]: {
    parser: 0 /* Abi */,
    params: [
      { name: "poolKey", type: POOL_KEY_STRUCT2 },
      { name: "sqrtPriceX96", type: "uint160" }
    ]
  },
  // Position Actions
  [17 /* V3_POSITION_MANAGER_PERMIT */]: { parser: 2 /* V3Actions */ },
  [18 /* V3_POSITION_MANAGER_CALL */]: { parser: 2 /* V3Actions */ },
  [20 /* V4_POSITION_MANAGER_CALL */]: { parser: 1 /* V4Actions */ }
};
var RoutePlanner = class {
  constructor() {
    this.commands = "0x";
    this.inputs = [];
  }
  addSubPlan(subplan) {
    this.addCommand(33 /* EXECUTE_SUB_PLAN */, [subplan.commands, subplan.inputs], true);
    return this;
  }
  addCommand(type, parameters, allowRevert = false) {
    let command = createCommand(type, parameters);
    this.inputs.push(command.encodedInput);
    if (allowRevert) {
      if (!REVERTIBLE_COMMANDS.has(command.type)) {
        throw new Error(`command type: ${command.type} cannot be allowed to revert`);
      }
      command.type = command.type | ALLOW_REVERT_FLAG;
    }
    this.commands = this.commands.concat(command.type.toString(16).padStart(2, "0"));
    return this;
  }
};
function createCommand(type, parameters) {
  const commandDef = COMMAND_DEFINITION[type];
  switch (commandDef.parser) {
    case 0 /* Abi */:
      const encodedInput = defaultAbiCoder.encode(
        commandDef.params.map((abi) => abi.type),
        parameters
      );
      return { type, encodedInput };
    case 1 /* V4Actions */:
      return { type, encodedInput: parameters[0] };
    case 2 /* V3Actions */:
      return { type, encodedInput: parameters[0] };
  }
}
var FACTORY_ADDRESS2 = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
var FACTORY_ADDRESS_MAP = V2_FACTORY_ADDRESSES;
var INIT_CODE_HASH = "0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f";
var MINIMUM_LIQUIDITY = JSBI13.BigInt(1e3);
var ZERO4 = JSBI13.BigInt(0);
var ONE4 = JSBI13.BigInt(1);
var FIVE = JSBI13.BigInt(5);
var _997 = JSBI13.BigInt(997);
var _1000 = JSBI13.BigInt(1e3);
var BASIS_POINTS = JSBI13.BigInt(1e4);
var ZERO_PERCENT = new Percent(ZERO4);
var ONE_HUNDRED_PERCENT = new Percent(ONE4);

// src/v2/errors.ts
var CAN_SET_PROTOTYPE = "setPrototypeOf" in Object;
var InsufficientReservesError = class extends Error {
  constructor() {
    super();
    this.isInsufficientReservesError = true;
    this.name = this.constructor.name;
    if (CAN_SET_PROTOTYPE) Object.setPrototypeOf(this, new.target.prototype);
  }
};
var InsufficientInputAmountError = class extends Error {
  constructor() {
    super();
    this.isInsufficientInputAmountError = true;
    this.name = this.constructor.name;
    if (CAN_SET_PROTOTYPE) Object.setPrototypeOf(this, new.target.prototype);
  }
};
var computePairAddress = ({
  factoryAddress,
  tokenA,
  tokenB
}) => {
  const [token0, token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA];
  return getCreate2Address(
    factoryAddress,
    keccak256(["bytes"], [pack(["address", "address"], [token0.address, token1.address])]),
    INIT_CODE_HASH
  );
};
var Pair = class _Pair {
  static getAddress(tokenA, tokenB) {
    const factoryAddress = FACTORY_ADDRESS_MAP[tokenA.chainId] ?? FACTORY_ADDRESS2;
    return computePairAddress({ factoryAddress, tokenA, tokenB });
  }
  constructor(currencyAmountA, tokenAmountB) {
    const tokenAmounts = currencyAmountA.currency.sortsBefore(tokenAmountB.currency) ? [currencyAmountA, tokenAmountB] : [tokenAmountB, currencyAmountA];
    this.liquidityToken = new Token(
      tokenAmounts[0].currency.chainId,
      _Pair.getAddress(tokenAmounts[0].currency, tokenAmounts[1].currency),
      18,
      "UNI-V2",
      "Uniswap V2"
    );
    this.tokenAmounts = tokenAmounts;
  }
  /**
   * Returns true if the token is either token0 or token1
   * @param token to check
   */
  involvesToken(token) {
    return token.equals(this.token0) || token.equals(this.token1);
  }
  /**
   * Returns the current mid price of the pair in terms of token0, i.e. the ratio of reserve1 to reserve0
   */
  get token0Price() {
    const result = this.tokenAmounts[1].divide(this.tokenAmounts[0]);
    return new Price(this.token0, this.token1, result.denominator, result.numerator);
  }
  /**
   * Returns the current mid price of the pair in terms of token1, i.e. the ratio of reserve0 to reserve1
   */
  get token1Price() {
    const result = this.tokenAmounts[0].divide(this.tokenAmounts[1]);
    return new Price(this.token1, this.token0, result.denominator, result.numerator);
  }
  /**
   * Return the price of the given token in terms of the other token in the pair.
   * @param token token to return price of
   */
  priceOf(token) {
    invariant18(this.involvesToken(token), "TOKEN");
    return token.equals(this.token0) ? this.token0Price : this.token1Price;
  }
  /**
   * Returns the chain ID of the tokens in the pair.
   */
  get chainId() {
    return this.token0.chainId;
  }
  get token0() {
    return this.tokenAmounts[0].currency;
  }
  get token1() {
    return this.tokenAmounts[1].currency;
  }
  get reserve0() {
    return this.tokenAmounts[0];
  }
  get reserve1() {
    return this.tokenAmounts[1];
  }
  reserveOf(token) {
    invariant18(this.involvesToken(token), "TOKEN");
    return token.equals(this.token0) ? this.reserve0 : this.reserve1;
  }
  /**
   * getAmountOut is the linear algebra of reserve ratio against amountIn:amountOut.
   * https://ethereum.stackexchange.com/questions/101629/what-is-math-for-uniswap-calculates-the-amountout-and-amountin-why-997-and-1000
   * has the math deduction for the reserve calculation without fee-on-transfer fees.
   *
   * With fee-on-transfer tax, intuitively it's just:
   * inputAmountWithFeeAndTax = 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn
   *                          = (1 - amountIn.sellFeesBips / 10000) * amountInWithFee
   * where amountInWithFee is the amountIn after taking out the LP fees
   * outputAmountWithTax = amountOut * (1 - amountOut.buyFeesBips / 10000)
   *
   * But we are illustrating the math deduction below to ensure that's the case.
   *
   * before swap A * B = K where A = reserveIn B = reserveOut
   *
   * after swap A' * B' = K where only k is a constant value
   *
   * getAmountOut
   *
   * A' = A + 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn # here 0.3% is deducted
   * B' = B - amountOut * (1 - amountOut.buyFeesBips / 10000)
   * amountOut = (B - B') / (1 - amountOut.buyFeesBips / 10000) # where A' * B' still is k
   *           = (B - K/(A + 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn))
   *             /
   *             (1 - amountOut.buyFeesBips / 10000)
   *           = (B - AB/(A + 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn))
   *             /
   *             (1 - amountOut.buyFeesBips / 10000)
   *           = ((BA + B * 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn - AB)/(A + 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn))
   *             /
   *             (1 - amountOut.buyFeesBips / 10000)
   *           = (B * 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn / (A + 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn)
   *             /
   *             (1 - amountOut.buyFeesBips / 10000)
   * amountOut * (1 - amountOut.buyFeesBips / 10000) = (B * 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn
   *                                                    /
   *                                                    (A + 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn)
   *
   * outputAmountWithTax = (B * 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn
   *                       /
   *                       (A + 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn)
   *                       = (B * 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn * 1000
   *                       /
   *                       ((A + 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn) * 1000)
   *                     = (B * (1 - amountIn.sellFeesBips / 10000) 997 * * amountIn
   *                       /
   *                       (1000 * A + (1 - amountIn.sellFeesBips / 10000) * 997 * amountIn)
   *                     = (B * (1 - amountIn.sellFeesBips / 10000) * inputAmountWithFee)
   *                       /
   *                       (1000 * A + (1 - amountIn.sellFeesBips / 10000) * inputAmountWithFee)
   *                     = (B * inputAmountWithFeeAndTax)
   *                       /
   *                       (1000 * A + inputAmountWithFeeAndTax)
   *
   * inputAmountWithFeeAndTax = (1 - amountIn.sellFeesBips / 10000) * inputAmountWithFee
   * outputAmountWithTax = amountOut * (1 - amountOut.buyFeesBips / 10000)
   *
   * @param inputAmount
   * @param calculateFotFees
   */
  getOutputAmount(inputAmount, calculateFotFees = true) {
    invariant18(this.involvesToken(inputAmount.currency), "TOKEN");
    if (JSBI13.equal(this.reserve0.quotient, ZERO4) || JSBI13.equal(this.reserve1.quotient, ZERO4)) {
      throw new InsufficientReservesError();
    }
    const inputReserve = this.reserveOf(inputAmount.currency);
    const outputReserve = this.reserveOf(inputAmount.currency.equals(this.token0) ? this.token1 : this.token0);
    const percentAfterSellFees = calculateFotFees ? this.derivePercentAfterSellFees(inputAmount) : ZERO_PERCENT;
    const inputAmountAfterTax = percentAfterSellFees.greaterThan(ZERO_PERCENT) ? CurrencyAmount.fromRawAmount(
      inputAmount.currency,
      percentAfterSellFees.multiply(inputAmount).quotient
      // fraction.quotient will round down by itself, which is desired
    ) : inputAmount;
    const inputAmountWithFeeAndAfterTax = JSBI13.multiply(inputAmountAfterTax.quotient, _997);
    const numerator = JSBI13.multiply(inputAmountWithFeeAndAfterTax, outputReserve.quotient);
    const denominator = JSBI13.add(JSBI13.multiply(inputReserve.quotient, _1000), inputAmountWithFeeAndAfterTax);
    const outputAmount = CurrencyAmount.fromRawAmount(
      inputAmount.currency.equals(this.token0) ? this.token1 : this.token0,
      JSBI13.divide(numerator, denominator)
      // JSBI.divide will round down by itself, which is desired
    );
    if (JSBI13.equal(outputAmount.quotient, ZERO4)) {
      throw new InsufficientInputAmountError();
    }
    const percentAfterBuyFees = calculateFotFees ? this.derivePercentAfterBuyFees(outputAmount) : ZERO_PERCENT;
    const outputAmountAfterTax = percentAfterBuyFees.greaterThan(ZERO_PERCENT) ? CurrencyAmount.fromRawAmount(
      outputAmount.currency,
      outputAmount.multiply(percentAfterBuyFees).quotient
      // fraction.quotient will round down by itself, which is desired
    ) : outputAmount;
    if (JSBI13.equal(outputAmountAfterTax.quotient, ZERO4)) {
      throw new InsufficientInputAmountError();
    }
    return [
      outputAmountAfterTax,
      new _Pair(inputReserve.add(inputAmountAfterTax), outputReserve.subtract(outputAmountAfterTax))
    ];
  }
  /**
   * getAmountIn is the linear algebra of reserve ratio against amountIn:amountOut.
   * https://ethereum.stackexchange.com/questions/101629/what-is-math-for-uniswap-calculates-the-amountout-and-amountin-why-997-and-1000
   * has the math deduction for the reserve calculation without fee-on-transfer fees.
   *
   * With fee-on-transfer fees, intuitively it's just:
   * outputAmountWithTax = amountOut / (1 - amountOut.buyFeesBips / 10000)
   * inputAmountWithTax = amountIn / (1 - amountIn.sellFeesBips / 10000) / 0.997
   *
   * But we are illustrating the math deduction below to ensure that's the case.
   *
   * before swap A * B = K where A = reserveIn B = reserveOut
   *
   * after swap A' * B' = K where only k is a constant value
   *
   * getAmountIn
   *
   * B' = B - amountOut * (1 - amountOut.buyFeesBips / 10000)
   * A' = A + 0.997 * (1 - amountIn.sellFeesBips / 10000) * amountIn # here 0.3% is deducted
   * amountIn = (A' - A) / (0.997 * (1 - amountIn.sellFeesBips / 10000))
   *          = (K / (B - amountOut / (1 - amountOut.buyFeesBips / 10000)) - A)
   *            /
   *            (0.997 * (1 - amountIn.sellFeesBips / 10000))
   *          = (AB / (B - amountOut / (1 - amountOut.buyFeesBips / 10000)) - A)
   *            /
   *            (0.997 * (1 - amountIn.sellFeesBips / 10000))
   *          = ((AB - AB + A * amountOut / (1 - amountOut.buyFeesBips / 10000)) / (B - amountOut / (1 - amountOut.buyFeesBips / 10000)))
   *            /
   *            (0.997 * (1 - amountIn.sellFeesBips / 10000))
   *          = ((A * amountOut / (1 - amountOut.buyFeesBips / 10000)) / (B - amountOut / (1 - amountOut.buyFeesBips / 10000)))
   *            /
   *            (0.997 * (1 - amountIn.sellFeesBips / 10000))
   *          = ((A * 1000 * amountOut / (1 - amountOut.buyFeesBips / 10000)) / (B - amountOut / (1 - amountOut.buyFeesBips / 10000)))
   *            /
   *            (997 * (1 - amountIn.sellFeesBips / 10000))
   *
   * outputAmountWithTax = amountOut / (1 - amountOut.buyFeesBips / 10000)
   * inputAmountWithTax = amountIn / (997 * (1 - amountIn.sellFeesBips / 10000))
   *                    = (A * outputAmountWithTax * 1000) / ((B - outputAmountWithTax) * 997)
   *
   * @param outputAmount
   */
  getInputAmount(outputAmount, calculateFotFees = true) {
    invariant18(this.involvesToken(outputAmount.currency), "TOKEN");
    const percentAfterBuyFees = calculateFotFees ? this.derivePercentAfterBuyFees(outputAmount) : ZERO_PERCENT;
    const outputAmountBeforeTax = percentAfterBuyFees.greaterThan(ZERO_PERCENT) ? CurrencyAmount.fromRawAmount(
      outputAmount.currency,
      JSBI13.add(outputAmount.divide(percentAfterBuyFees).quotient, ONE4)
      // add 1 for rounding up
    ) : outputAmount;
    if (JSBI13.equal(this.reserve0.quotient, ZERO4) || JSBI13.equal(this.reserve1.quotient, ZERO4) || JSBI13.greaterThanOrEqual(outputAmount.quotient, this.reserveOf(outputAmount.currency).quotient) || JSBI13.greaterThanOrEqual(outputAmountBeforeTax.quotient, this.reserveOf(outputAmount.currency).quotient)) {
      throw new InsufficientReservesError();
    }
    const outputReserve = this.reserveOf(outputAmount.currency);
    const inputReserve = this.reserveOf(outputAmount.currency.equals(this.token0) ? this.token1 : this.token0);
    const numerator = JSBI13.multiply(JSBI13.multiply(inputReserve.quotient, outputAmountBeforeTax.quotient), _1000);
    const denominator = JSBI13.multiply(JSBI13.subtract(outputReserve.quotient, outputAmountBeforeTax.quotient), _997);
    const inputAmount = CurrencyAmount.fromRawAmount(
      outputAmount.currency.equals(this.token0) ? this.token1 : this.token0,
      JSBI13.add(JSBI13.divide(numerator, denominator), ONE4)
      // add 1 here is part of the formula, no rounding needed here, since there will not be decimal at this point
    );
    const percentAfterSellFees = calculateFotFees ? this.derivePercentAfterSellFees(inputAmount) : ZERO_PERCENT;
    const inputAmountBeforeTax = percentAfterSellFees.greaterThan(ZERO_PERCENT) ? CurrencyAmount.fromRawAmount(
      inputAmount.currency,
      JSBI13.add(inputAmount.divide(percentAfterSellFees).quotient, ONE4)
      // add 1 for rounding up
    ) : inputAmount;
    return [inputAmountBeforeTax, new _Pair(inputReserve.add(inputAmount), outputReserve.subtract(outputAmount))];
  }
  getLiquidityMinted(totalSupply, tokenAmountA, tokenAmountB) {
    invariant18(totalSupply.currency.equals(this.liquidityToken), "LIQUIDITY");
    const tokenAmounts = tokenAmountA.currency.sortsBefore(tokenAmountB.currency) ? [tokenAmountA, tokenAmountB] : [tokenAmountB, tokenAmountA];
    invariant18(tokenAmounts[0].currency.equals(this.token0) && tokenAmounts[1].currency.equals(this.token1), "TOKEN");
    let liquidity;
    if (JSBI13.equal(totalSupply.quotient, ZERO4)) {
      liquidity = JSBI13.subtract(
        sqrt(JSBI13.multiply(tokenAmounts[0].quotient, tokenAmounts[1].quotient)),
        MINIMUM_LIQUIDITY
      );
    } else {
      const amount0 = JSBI13.divide(JSBI13.multiply(tokenAmounts[0].quotient, totalSupply.quotient), this.reserve0.quotient);
      const amount1 = JSBI13.divide(JSBI13.multiply(tokenAmounts[1].quotient, totalSupply.quotient), this.reserve1.quotient);
      liquidity = JSBI13.lessThanOrEqual(amount0, amount1) ? amount0 : amount1;
    }
    if (!JSBI13.greaterThan(liquidity, ZERO4)) {
      throw new InsufficientInputAmountError();
    }
    return CurrencyAmount.fromRawAmount(this.liquidityToken, liquidity);
  }
  getLiquidityValue(token, totalSupply, liquidity, feeOn = false, kLast) {
    invariant18(this.involvesToken(token), "TOKEN");
    invariant18(totalSupply.currency.equals(this.liquidityToken), "TOTAL_SUPPLY");
    invariant18(liquidity.currency.equals(this.liquidityToken), "LIQUIDITY");
    invariant18(JSBI13.lessThanOrEqual(liquidity.quotient, totalSupply.quotient), "LIQUIDITY");
    let totalSupplyAdjusted;
    if (!feeOn) {
      totalSupplyAdjusted = totalSupply;
    } else {
      invariant18(!!kLast, "K_LAST");
      const kLastParsed = JSBI13.BigInt(kLast);
      if (!JSBI13.equal(kLastParsed, ZERO4)) {
        const rootK = sqrt(JSBI13.multiply(this.reserve0.quotient, this.reserve1.quotient));
        const rootKLast = sqrt(kLastParsed);
        if (JSBI13.greaterThan(rootK, rootKLast)) {
          const numerator = JSBI13.multiply(totalSupply.quotient, JSBI13.subtract(rootK, rootKLast));
          const denominator = JSBI13.add(JSBI13.multiply(rootK, FIVE), rootKLast);
          const feeLiquidity = JSBI13.divide(numerator, denominator);
          totalSupplyAdjusted = totalSupply.add(CurrencyAmount.fromRawAmount(this.liquidityToken, feeLiquidity));
        } else {
          totalSupplyAdjusted = totalSupply;
        }
      } else {
        totalSupplyAdjusted = totalSupply;
      }
    }
    return CurrencyAmount.fromRawAmount(
      token,
      JSBI13.divide(JSBI13.multiply(liquidity.quotient, this.reserveOf(token).quotient), totalSupplyAdjusted.quotient)
    );
  }
  derivePercentAfterSellFees(inputAmount) {
    const sellFeeBips = this.token0.wrapped.equals(inputAmount.wrapped.currency) ? this.token0.wrapped.sellFeeBps : this.token1.wrapped.sellFeeBps;
    if (sellFeeBips?.gt(BigNumber.from(0))) {
      return ONE_HUNDRED_PERCENT.subtract(new Percent(JSBI13.BigInt(sellFeeBips)).divide(BASIS_POINTS));
    } else {
      return ZERO_PERCENT;
    }
  }
  derivePercentAfterBuyFees(outputAmount) {
    const buyFeeBps = this.token0.wrapped.equals(outputAmount.wrapped.currency) ? this.token0.wrapped.buyFeeBps : this.token1.wrapped.buyFeeBps;
    if (buyFeeBps?.gt(BigNumber.from(0))) {
      return ONE_HUNDRED_PERCENT.subtract(new Percent(JSBI13.BigInt(buyFeeBps)).divide(BASIS_POINTS));
    } else {
      return ZERO_PERCENT;
    }
  }
};
var Route3 = class {
  constructor(pairs, input, output) {
    this._midPrice = null;
    invariant18(pairs.length > 0, "PAIRS");
    const chainId = pairs[0].chainId;
    invariant18(
      pairs.every((pair) => pair.chainId === chainId),
      "CHAIN_IDS"
    );
    const wrappedInput = input.wrapped;
    invariant18(pairs[0].involvesToken(wrappedInput), "INPUT");
    invariant18(typeof output === "undefined" || pairs[pairs.length - 1].involvesToken(output.wrapped), "OUTPUT");
    const path = [wrappedInput];
    for (const [i, pair] of pairs.entries()) {
      const currentInput = path[i];
      invariant18(currentInput.equals(pair.token0) || currentInput.equals(pair.token1), "PATH");
      const output2 = currentInput.equals(pair.token0) ? pair.token1 : pair.token0;
      path.push(output2);
    }
    this.pairs = pairs;
    this.path = path;
    this.input = input;
    this.output = output;
  }
  get midPrice() {
    if (this._midPrice !== null) return this._midPrice;
    const prices = [];
    for (const [i, pair] of this.pairs.entries()) {
      prices.push(
        this.path[i].equals(pair.token0) ? new Price(pair.reserve0.currency, pair.reserve1.currency, pair.reserve0.quotient, pair.reserve1.quotient) : new Price(pair.reserve1.currency, pair.reserve0.currency, pair.reserve1.quotient, pair.reserve0.quotient)
      );
    }
    const reduced = prices.slice(1).reduce((accumulator, currentValue) => accumulator.multiply(currentValue), prices[0]);
    return this._midPrice = new Price(this.input, this.output, reduced.denominator, reduced.numerator);
  }
  get chainId() {
    return this.pairs[0].chainId;
  }
};
function inputOutputComparator(a, b) {
  invariant18(a.inputAmount.currency.equals(b.inputAmount.currency), "INPUT_CURRENCY");
  invariant18(a.outputAmount.currency.equals(b.outputAmount.currency), "OUTPUT_CURRENCY");
  if (a.outputAmount.equalTo(b.outputAmount)) {
    if (a.inputAmount.equalTo(b.inputAmount)) {
      return 0;
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
function tradeComparator3(a, b) {
  const ioComp = inputOutputComparator(a, b);
  if (ioComp !== 0) {
    return ioComp;
  }
  if (a.priceImpact.lessThan(b.priceImpact)) {
    return -1;
  } else if (a.priceImpact.greaterThan(b.priceImpact)) {
    return 1;
  }
  return a.route.path.length - b.route.path.length;
}
var Trade3 = class _Trade {
  /**
   * Constructs an exact in trade with the given amount in and route
   * @param route route of the exact in trade
   * @param amountIn the amount being passed in
   */
  static exactIn(route, amountIn) {
    return new _Trade(route, amountIn, 0 /* EXACT_INPUT */);
  }
  /**
   * Constructs an exact out trade with the given amount out and route
   * @param route route of the exact out trade
   * @param amountOut the amount returned by the trade
   */
  static exactOut(route, amountOut) {
    return new _Trade(route, amountOut, 1 /* EXACT_OUTPUT */);
  }
  constructor(route, amount, tradeType) {
    this.route = route;
    this.tradeType = tradeType;
    const tokenAmounts = new Array(route.path.length);
    if (tradeType === 0 /* EXACT_INPUT */) {
      invariant18(amount.currency.equals(route.input), "INPUT");
      tokenAmounts[0] = amount.wrapped;
      for (let i = 0; i < route.path.length - 1; i++) {
        const pair = route.pairs[i];
        const [outputAmount] = pair.getOutputAmount(tokenAmounts[i]);
        tokenAmounts[i + 1] = outputAmount;
      }
      this.inputAmount = CurrencyAmount.fromFractionalAmount(route.input, amount.numerator, amount.denominator);
      this.outputAmount = CurrencyAmount.fromFractionalAmount(
        route.output,
        tokenAmounts[tokenAmounts.length - 1].numerator,
        tokenAmounts[tokenAmounts.length - 1].denominator
      );
    } else {
      invariant18(amount.currency.equals(route.output), "OUTPUT");
      tokenAmounts[tokenAmounts.length - 1] = amount.wrapped;
      for (let i = route.path.length - 1; i > 0; i--) {
        const pair = route.pairs[i - 1];
        const [inputAmount] = pair.getInputAmount(tokenAmounts[i]);
        tokenAmounts[i - 1] = inputAmount;
      }
      this.inputAmount = CurrencyAmount.fromFractionalAmount(
        route.input,
        tokenAmounts[0].numerator,
        tokenAmounts[0].denominator
      );
      this.outputAmount = CurrencyAmount.fromFractionalAmount(route.output, amount.numerator, amount.denominator);
    }
    this.executionPrice = new Price(
      this.inputAmount.currency,
      this.outputAmount.currency,
      this.inputAmount.quotient,
      this.outputAmount.quotient
    );
    this.priceImpact = computePriceImpact(route.midPrice, this.inputAmount, this.outputAmount);
  }
  /**
   * Get the minimum amount that must be received from this trade for the given slippage tolerance
   * @param slippageTolerance tolerance of unfavorable slippage from the execution price of this trade
   */
  minimumAmountOut(slippageTolerance) {
    invariant18(!slippageTolerance.lessThan(ZERO4), "SLIPPAGE_TOLERANCE");
    if (this.tradeType === 1 /* EXACT_OUTPUT */) {
      return this.outputAmount;
    } else {
      const slippageAdjustedAmountOut = new Fraction(ONE4).add(slippageTolerance).invert().multiply(this.outputAmount.quotient).quotient;
      return CurrencyAmount.fromRawAmount(this.outputAmount.currency, slippageAdjustedAmountOut);
    }
  }
  /**
   * Get the maximum amount in that can be spent via this trade for the given slippage tolerance
   * @param slippageTolerance tolerance of unfavorable slippage from the execution price of this trade
   */
  maximumAmountIn(slippageTolerance) {
    invariant18(!slippageTolerance.lessThan(ZERO4), "SLIPPAGE_TOLERANCE");
    if (this.tradeType === 0 /* EXACT_INPUT */) {
      return this.inputAmount;
    } else {
      const slippageAdjustedAmountIn = new Fraction(ONE4).add(slippageTolerance).multiply(this.inputAmount.quotient).quotient;
      return CurrencyAmount.fromRawAmount(this.inputAmount.currency, slippageAdjustedAmountIn);
    }
  }
  /**
   * Given a list of pairs, and a fixed amount in, returns the top `maxNumResults` trades that go from an input token
   * amount to an output token, making at most `maxHops` hops.
   * Note this does not consider aggregation, as routes are linear. It's possible a better route exists by splitting
   * the amount in among multiple routes.
   * @param pairs the pairs to consider in finding the best trade
   * @param nextAmountIn exact amount of input currency to spend
   * @param currencyOut the desired currency out
   * @param maxNumResults maximum number of results to return
   * @param maxHops maximum number of hops a returned trade can make, e.g. 1 hop goes through a single pair
   * @param currentPairs used in recursion; the current list of pairs
   * @param currencyAmountIn used in recursion; the original value of the currencyAmountIn parameter
   * @param bestTrades used in recursion; the current list of best trades
   */
  static bestTradeExactIn(pairs, currencyAmountIn, currencyOut, { maxNumResults = 3, maxHops = 3 } = {}, currentPairs = [], nextAmountIn = currencyAmountIn, bestTrades = []) {
    invariant18(pairs.length > 0, "PAIRS");
    invariant18(maxHops > 0, "MAX_HOPS");
    invariant18(currencyAmountIn === nextAmountIn || currentPairs.length > 0, "INVALID_RECURSION");
    const amountIn = nextAmountIn.wrapped;
    const tokenOut = currencyOut.wrapped;
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      if (!pair.token0.equals(amountIn.currency) && !pair.token1.equals(amountIn.currency)) continue;
      if (pair.reserve0.equalTo(ZERO4) || pair.reserve1.equalTo(ZERO4)) continue;
      let amountOut;
      try {
        ;
        [amountOut] = pair.getOutputAmount(amountIn);
      } catch (error) {
        if (error.isInsufficientInputAmountError) {
          continue;
        }
        throw error;
      }
      if (amountOut.currency.equals(tokenOut)) {
        sortedInsert(
          bestTrades,
          new _Trade(
            new Route3([...currentPairs, pair], currencyAmountIn.currency, currencyOut),
            currencyAmountIn,
            0 /* EXACT_INPUT */
          ),
          maxNumResults,
          tradeComparator3
        );
      } else if (maxHops > 1 && pairs.length > 1) {
        const pairsExcludingThisPair = pairs.slice(0, i).concat(pairs.slice(i + 1, pairs.length));
        _Trade.bestTradeExactIn(
          pairsExcludingThisPair,
          currencyAmountIn,
          currencyOut,
          {
            maxNumResults,
            maxHops: maxHops - 1
          },
          [...currentPairs, pair],
          amountOut,
          bestTrades
        );
      }
    }
    return bestTrades;
  }
  /**
   * Return the execution price after accounting for slippage tolerance
   * @param slippageTolerance the allowed tolerated slippage
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
   * similar to the above method but instead targets a fixed output amount
   * given a list of pairs, and a fixed amount out, returns the top `maxNumResults` trades that go from an input token
   * to an output token amount, making at most `maxHops` hops
   * note this does not consider aggregation, as routes are linear. it's possible a better route exists by splitting
   * the amount in among multiple routes.
   * @param pairs the pairs to consider in finding the best trade
   * @param currencyIn the currency to spend
   * @param nextAmountOut the exact amount of currency out
   * @param maxNumResults maximum number of results to return
   * @param maxHops maximum number of hops a returned trade can make, e.g. 1 hop goes through a single pair
   * @param currentPairs used in recursion; the current list of pairs
   * @param currencyAmountOut used in recursion; the original value of the currencyAmountOut parameter
   * @param bestTrades used in recursion; the current list of best trades
   */
  static bestTradeExactOut(pairs, currencyIn, currencyAmountOut, { maxNumResults = 3, maxHops = 3 } = {}, currentPairs = [], nextAmountOut = currencyAmountOut, bestTrades = []) {
    invariant18(pairs.length > 0, "PAIRS");
    invariant18(maxHops > 0, "MAX_HOPS");
    invariant18(currencyAmountOut === nextAmountOut || currentPairs.length > 0, "INVALID_RECURSION");
    const amountOut = nextAmountOut.wrapped;
    const tokenIn = currencyIn.wrapped;
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      if (!pair.token0.equals(amountOut.currency) && !pair.token1.equals(amountOut.currency)) continue;
      if (pair.reserve0.equalTo(ZERO4) || pair.reserve1.equalTo(ZERO4)) continue;
      let amountIn;
      try {
        ;
        [amountIn] = pair.getInputAmount(amountOut);
      } catch (error) {
        if (error.isInsufficientReservesError) {
          continue;
        }
        throw error;
      }
      if (amountIn.currency.equals(tokenIn)) {
        sortedInsert(
          bestTrades,
          new _Trade(
            new Route3([pair, ...currentPairs], currencyIn, currencyAmountOut.currency),
            currencyAmountOut,
            1 /* EXACT_OUTPUT */
          ),
          maxNumResults,
          tradeComparator3
        );
      } else if (maxHops > 1 && pairs.length > 1) {
        const pairsExcludingThisPair = pairs.slice(0, i).concat(pairs.slice(i + 1, pairs.length));
        _Trade.bestTradeExactOut(
          pairsExcludingThisPair,
          currencyIn,
          currencyAmountOut,
          {
            maxNumResults,
            maxHops: maxHops - 1
          },
          [pair, ...currentPairs],
          amountIn,
          bestTrades
        );
      }
    }
    return bestTrades;
  }
};
var ADDRESS_ZERO3 = "0x0000000000000000000000000000000000000000";
var ZERO5 = JSBI13.BigInt(0);
var ONE5 = JSBI13.BigInt(1);
var MIXED_QUOTER_V1_V2_FEE_PATH_PLACEHOLDER = 1 << 23;
var MIXED_QUOTER_V2_V2_FEE_PATH_PLACEHOLDER = 2 << 4;
var MIXED_QUOTER_V2_V3_FEE_PATH_PLACEHOLDER = 3 << 20;
var MIXED_QUOTER_V2_V4_FEE_PATH_PLACEHOLDER = 4 << 20;
var ZERO_PERCENT2 = new Percent(ZERO5);
var ONE_HUNDRED_PERCENT2 = new Percent(100, 100);

// src/router/utils/pathCurrency.ts
function amountWithPathCurrency2(amount, pool) {
  return CurrencyAmount.fromFractionalAmount(
    getPathCurrency2(amount.currency, pool),
    amount.numerator,
    amount.denominator
  );
}
function getPathCurrency2(currency, pool) {
  if (pool.involvesToken(currency)) {
    return currency;
  } else if (pool.involvesToken(currency.wrapped)) {
    return currency.wrapped;
  } else if (pool instanceof Pool2) {
    if (pool.token0.wrapped.equals(currency)) {
      return pool.token0;
    } else if (pool.token1.wrapped.equals(currency)) {
      return pool.token1;
    }
  } else {
    throw new Error(`Expected currency ${currency.symbol} to be either ${pool.token0.symbol} or ${pool.token1.symbol}`);
  }
  return currency;
}

// src/router/entities/mixedRoute/route.ts
var MixedRouteSDK = class {
  /**
   * Creates an instance of route.
   * @param pools An array of `TPool` objects (pools or pairs), ordered by the route the swap will take
   * @param input The input token
   * @param output The output token
   * @param retainsFakePool Set to true to filter out a pool that has a fake eth-weth pool
   */
  constructor(pools, input, output, retainFakePools = false) {
    // routes may need to wrap/unwrap a currency at the end of trading path
    this._midPrice = null;
    pools = retainFakePools ? pools : pools.filter((pool) => !(pool instanceof Pool2 && pool.tickSpacing === 0));
    invariant18(pools.length > 0, "POOLS");
    const chainId = pools[0].chainId;
    const allOnSameChain = pools.every((pool) => pool.chainId === chainId);
    invariant18(allOnSameChain, "CHAIN_IDS");
    this.pathInput = getPathCurrency2(input, pools[0]);
    this.pathOutput = getPathCurrency2(output, pools[pools.length - 1]);
    if (!(pools[0] instanceof Pool2)) {
      invariant18(pools[0].involvesToken(this.pathInput), "INPUT");
    } else {
      invariant18(pools[0].v4InvolvesToken(this.pathInput), "INPUT");
    }
    const lastPool = pools[pools.length - 1];
    if (lastPool instanceof Pool2) {
      invariant18(lastPool.v4InvolvesToken(output) || lastPool.v4InvolvesToken(output.wrapped), "OUTPUT");
    } else {
      invariant18(lastPool.involvesToken(output.wrapped), "OUTPUT");
    }
    const tokenPath = [this.pathInput];
    pools[0].token0.equals(this.pathInput) ? tokenPath.push(pools[0].token1) : tokenPath.push(pools[0].token0);
    for (let i = 1; i < pools.length; i++) {
      const pool = pools[i];
      const inputToken = tokenPath[i];
      let outputToken;
      if (
        // we hit an edge case if it's a v4 pool and neither of the tokens are in the pool OR it is not a v4 pool but the input currency is eth
        pool instanceof Pool2 && !pool.involvesToken(inputToken) || !(pool instanceof Pool2) && inputToken.isNative
      ) {
        if (inputToken.equals(pool.token0.wrapped)) {
          outputToken = pool.token1;
        } else if (inputToken.wrapped.equals(pool.token0) || inputToken.wrapped.equals(pool.token1)) {
          outputToken = inputToken.wrapped.equals(pool.token0) ? pool.token1 : pool.token0;
        } else {
          throw new Error(`POOL_MISMATCH pool: ${JSON.stringify(pool)} inputToken: ${JSON.stringify(inputToken)}`);
        }
      } else {
        invariant18(
          inputToken.equals(pool.token0) || inputToken.equals(pool.token1),
          `PATH pool ${JSON.stringify(pool)} inputToken ${JSON.stringify(inputToken)}`
        );
        outputToken = inputToken.equals(pool.token0) ? pool.token1 : pool.token0;
      }
      tokenPath.push(outputToken);
    }
    this.pools = pools;
    this.path = tokenPath;
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
          price: price2.multiply(pool.token0Price.asFraction)
        } : {
          nextInput: pool.token0,
          price: price2.multiply(pool.token1Price.asFraction)
        };
      },
      this.pools[0].token0.equals(this.pathInput) ? {
        nextInput: this.pools[0].token1,
        price: this.pools[0].token0Price.asFraction
      } : {
        nextInput: this.pools[0].token0,
        price: this.pools[0].token1Price.asFraction
      }
    ).price;
    return this._midPrice = new Price(this.input, this.output, price.denominator, price.numerator);
  }
};
function tradeComparator4(a, b) {
  invariant18(a.inputAmount.currency.equals(b.inputAmount.currency), "INPUT_CURRENCY");
  invariant18(a.outputAmount.currency.equals(b.outputAmount.currency), "OUTPUT_CURRENCY");
  if (a.outputAmount.equalTo(b.outputAmount)) {
    if (a.inputAmount.equalTo(b.inputAmount)) {
      const aHops = a.swaps.reduce((total, cur) => total + cur.route.path.length, 0);
      const bHops = b.swaps.reduce((total, cur) => total + cur.route.path.length, 0);
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
var MixedRouteTrade = class _MixedRouteTrade {
  /**
   * @deprecated Deprecated in favor of 'swaps' property. If the trade consists of multiple routes
   * this will return an error.
   *
   * When the trade consists of just a single route, this returns the route of the trade,
   * i.e. which pools the trade goes through.
   */
  get route() {
    invariant18(this.swaps.length === 1, "MULTIPLE_ROUTES");
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
    const amounts = new Array(route.path.length);
    let inputAmount;
    let outputAmount;
    invariant18(tradeType === 0 /* EXACT_INPUT */, "TRADE_TYPE");
    invariant18(amount.currency.equals(route.input), "INPUT");
    amounts[0] = amountWithPathCurrency2(amount, route.pools[0]);
    for (let i = 0; i < route.path.length - 1; i++) {
      const pool = route.pools[i];
      const [outputAmount2] = await pool.getOutputAmount(
        amountWithPathCurrency2(amounts[i], pool)
      );
      amounts[i + 1] = outputAmount2;
    }
    inputAmount = CurrencyAmount.fromFractionalAmount(route.input, amount.numerator, amount.denominator);
    outputAmount = CurrencyAmount.fromFractionalAmount(
      route.output,
      amounts[amounts.length - 1].numerator,
      amounts[amounts.length - 1].denominator
    );
    return new _MixedRouteTrade({
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
    invariant18(tradeType === 0 /* EXACT_INPUT */, "TRADE_TYPE");
    for (const { route, amount } of routes) {
      const amounts = new Array(route.path.length);
      let inputAmount;
      let outputAmount;
      invariant18(amount.currency.equals(route.input), "INPUT");
      inputAmount = CurrencyAmount.fromFractionalAmount(route.input, amount.numerator, amount.denominator);
      amounts[0] = CurrencyAmount.fromFractionalAmount(route.pathInput, amount.numerator, amount.denominator);
      for (let i = 0; i < route.path.length - 1; i++) {
        const pool = route.pools[i];
        const [outputAmount2] = await pool.getOutputAmount(
          amountWithPathCurrency2(amounts[i], pool)
        );
        amounts[i + 1] = outputAmount2;
      }
      outputAmount = CurrencyAmount.fromFractionalAmount(
        route.output,
        amounts[amounts.length - 1].numerator,
        amounts[amounts.length - 1].denominator
      );
      populatedRoutes.push({ route, inputAmount, outputAmount });
    }
    return new _MixedRouteTrade({
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
    return new _MixedRouteTrade({
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
    return new _MixedRouteTrade(constructorArguments);
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
    invariant18(
      routes.every(({ route }) => inputCurrency.wrapped.equals(route.input.wrapped)),
      "INPUT_CURRENCY_MATCH"
    );
    invariant18(
      routes.every(({ route }) => outputCurrency.wrapped.equals(route.output.wrapped)),
      "OUTPUT_CURRENCY_MATCH"
    );
    const numPools = routes.map(({ route }) => route.pools.length).reduce((total, cur) => total + cur, 0);
    const poolIdentifierSet = /* @__PURE__ */ new Set();
    for (const { route } of routes) {
      for (const pool of route.pools) {
        if (pool instanceof Pool2) {
          poolIdentifierSet.add(pool.poolId);
        } else if (pool instanceof Pool) {
          poolIdentifierSet.add(Pool.getAddress(pool.token0, pool.token1, pool.fee));
        } else if (pool instanceof Pair) {
          const pair = pool;
          poolIdentifierSet.add(Pair.getAddress(pair.token0, pair.token1));
        } else {
          throw new Error("Unexpected pool type in route when constructing trade object");
        }
      }
    }
    invariant18(numPools === poolIdentifierSet.size, "POOLS_DUPLICATED");
    invariant18(tradeType === 0 /* EXACT_INPUT */, "TRADE_TYPE");
    this.swaps = routes;
    this.tradeType = tradeType;
  }
  /**
   * Get the minimum amount that must be received from this trade for the given slippage tolerance
   * @param slippageTolerance The tolerance of unfavorable slippage from the execution price of this trade
   * @returns The amount out
   */
  minimumAmountOut(slippageTolerance, amountOut = this.outputAmount) {
    invariant18(!slippageTolerance.lessThan(ZERO5), "SLIPPAGE_TOLERANCE");
    const slippageAdjustedAmountOut = new Fraction(ONE5).add(slippageTolerance).invert().multiply(amountOut.quotient).quotient;
    return CurrencyAmount.fromRawAmount(amountOut.currency, slippageAdjustedAmountOut);
  }
  /**
   * Get the maximum amount in that can be spent via this trade for the given slippage tolerance
   * @param slippageTolerance The tolerance of unfavorable slippage from the execution price of this trade
   * @returns The amount in
   */
  maximumAmountIn(slippageTolerance, amountIn = this.inputAmount) {
    invariant18(!slippageTolerance.lessThan(ZERO5), "SLIPPAGE_TOLERANCE");
    return amountIn;
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
    invariant18(pools.length > 0, "POOLS");
    invariant18(maxHops > 0, "MAX_HOPS");
    invariant18(currencyAmountIn === nextAmountIn || currentPools.length > 0, "INVALID_RECURSION");
    const amountIn = nextAmountIn;
    for (let i = 0; i < pools.length; i++) {
      const pool = pools[i];
      const amountInAdjusted = pool instanceof Pool2 ? amountIn : amountIn.wrapped;
      if (!pool.token0.equals(amountInAdjusted.currency) && !pool.token1.equals(amountInAdjusted.currency)) continue;
      if (pool instanceof Pair) {
        if (pool.reserve0.equalTo(ZERO5) || pool.reserve1.equalTo(ZERO5)) continue;
      }
      let amountOut;
      try {
        ;
        [amountOut] = pool instanceof Pool2 ? await pool.getOutputAmount(amountInAdjusted) : await pool.getOutputAmount(amountInAdjusted.wrapped);
      } catch (error) {
        if (error.isInsufficientInputAmountError) {
          continue;
        }
        throw error;
      }
      if (amountOut.currency.wrapped.equals(currencyOut.wrapped)) {
        sortedInsert(
          bestTrades,
          await _MixedRouteTrade.fromRoute(
            new MixedRouteSDK([...currentPools, pool], currencyAmountIn.currency, currencyOut),
            currencyAmountIn,
            0 /* EXACT_INPUT */
          ),
          maxNumResults,
          tradeComparator4
        );
      } else if (maxHops > 1 && pools.length > 1) {
        const poolsExcludingThisPool = pools.slice(0, i).concat(pools.slice(i + 1, pools.length));
        await _MixedRouteTrade.bestTradeExactIn(
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
};

// src/router/entities/route.ts
function getPathToken(currency, pool) {
  if (pool.token0.wrapped.equals(currency.wrapped)) {
    return pool.token0;
  } else if (pool.token1.wrapped.equals(currency.wrapped)) {
    return pool.token1;
  } else {
    throw new Error(`Expected token ${currency.symbol} to be either ${pool.token0.symbol} or ${pool.token1.symbol}`);
  }
}
var RouteV2 = class extends Route3 {
  constructor(v2Route) {
    super(v2Route.pairs, v2Route.input, v2Route.output);
    this.protocol = "V2" /* V2 */;
    this.pools = this.pairs;
    this.pathInput = getPathToken(v2Route.input, this.pairs[0]);
    this.pathOutput = getPathToken(v2Route.output, this.pairs[this.pairs.length - 1]);
  }
};
var RouteV3 = class extends Route {
  constructor(v3Route) {
    super(v3Route.pools, v3Route.input, v3Route.output);
    this.protocol = "V3" /* V3 */;
    this.path = v3Route.tokenPath;
    this.pathInput = getPathToken(v3Route.input, this.pools[0]);
    this.pathOutput = getPathToken(v3Route.output, this.pools[this.pools.length - 1]);
  }
};
var RouteV4 = class extends Route2 {
  constructor(v4Route) {
    super(v4Route.pools, v4Route.input, v4Route.output);
    this.protocol = "V4" /* V4 */;
    this.path = v4Route.currencyPath;
  }
};
var MixedRoute = class extends MixedRouteSDK {
  constructor(mixedRoute) {
    super(mixedRoute.pools, mixedRoute.input, mixedRoute.output);
    this.protocol = "MIXED" /* MIXED */;
  }
};

// src/router/entities/trade.ts
var Trade4 = class _Trade {
  //  construct a trade across v2 and v3 routes from pre-computed amounts
  constructor({
    v2Routes = [],
    v3Routes = [],
    v4Routes = [],
    mixedRoutes = [],
    tradeType
  }) {
    this.swaps = [];
    this.routes = [];
    for (const { routev2, inputAmount, outputAmount } of v2Routes) {
      const route = new RouteV2(routev2);
      this.routes.push(route);
      this.swaps.push({
        route,
        inputAmount,
        outputAmount
      });
    }
    for (const { routev3, inputAmount, outputAmount } of v3Routes) {
      const route = new RouteV3(routev3);
      this.routes.push(route);
      this.swaps.push({
        route,
        inputAmount,
        outputAmount
      });
    }
    for (const { routev4, inputAmount, outputAmount } of v4Routes) {
      const route = new RouteV4(routev4);
      this.routes.push(route);
      this.swaps.push({
        route,
        inputAmount,
        outputAmount
      });
    }
    for (const { mixedRoute, inputAmount, outputAmount } of mixedRoutes) {
      const route = new MixedRoute(mixedRoute);
      this.routes.push(route);
      this.swaps.push({
        route,
        inputAmount,
        outputAmount
      });
    }
    if (this.swaps.length === 0) {
      throw new Error("No routes provided when calling Trade constructor");
    }
    this.tradeType = tradeType;
    const inputCurrency = this.swaps[0].inputAmount.currency;
    const outputCurrency = this.swaps[0].outputAmount.currency;
    invariant18(
      this.swaps.every(({ route }) => inputCurrency.wrapped.equals(route.input.wrapped)),
      "INPUT_CURRENCY_MATCH"
    );
    invariant18(
      this.swaps.every(({ route }) => outputCurrency.wrapped.equals(route.output.wrapped)),
      "OUTPUT_CURRENCY_MATCH"
    );
    const numPools = this.swaps.map(({ route }) => route.pools.length).reduce((total, cur) => total + cur, 0);
    const poolIdentifierSet = /* @__PURE__ */ new Set();
    for (const { route } of this.swaps) {
      for (const pool of route.pools) {
        if (pool instanceof Pool2) {
          poolIdentifierSet.add(pool.poolId);
        } else if (pool instanceof Pool) {
          poolIdentifierSet.add(Pool.getAddress(pool.token0, pool.token1, pool.fee));
        } else if (pool instanceof Pair) {
          const pair = pool;
          poolIdentifierSet.add(Pair.getAddress(pair.token0, pair.token1));
        } else {
          throw new Error("Unexpected pool type in route when constructing trade object");
        }
      }
    }
    invariant18(numPools === poolIdentifierSet.size, "POOLS_DUPLICATED");
  }
  get inputAmount() {
    if (this._inputAmount) {
      return this._inputAmount;
    }
    const inputAmountCurrency = this.swaps[0].inputAmount.currency;
    const totalInputFromRoutes = this.swaps.map(({ inputAmount: routeInputAmount }) => routeInputAmount).reduce((total, cur) => total.add(cur), CurrencyAmount.fromRawAmount(inputAmountCurrency, 0));
    this._inputAmount = totalInputFromRoutes;
    return this._inputAmount;
  }
  get outputAmount() {
    if (this._outputAmount) {
      return this._outputAmount;
    }
    const outputCurrency = this.swaps[0].outputAmount.currency;
    const totalOutputFromRoutes = this.swaps.map(({ outputAmount: routeOutputAmount }) => routeOutputAmount).reduce((total, cur) => total.add(cur), CurrencyAmount.fromRawAmount(outputCurrency, 0));
    this._outputAmount = totalOutputFromRoutes;
    return this._outputAmount;
  }
  /**
   * Returns the sum of all swaps within the trade
   * @returns
   * inputAmount: total input amount
   * inputAmountNative: total amount of native currency required for ETH input paths
   *  - 0 if inputAmount is native but no native input paths
   *  - undefined if inputAmount is not native
   * outputAmount: total output amount
   * outputAmountNative: total amount of native currency returned from ETH output paths
   *  - 0 if outputAmount is native but no native output paths
   *  - undefined if outputAmount is not native
   */
  get amounts() {
    const inputNativeCurrency = this.swaps.find(({ inputAmount }) => inputAmount.currency.isNative)?.inputAmount.currency;
    const outputNativeCurrency = this.swaps.find(({ outputAmount }) => outputAmount.currency.isNative)?.outputAmount.currency;
    return {
      inputAmount: this.inputAmount,
      inputAmountNative: inputNativeCurrency ? this.swaps.reduce((total, swap) => {
        return swap.route.pathInput.isNative ? total.add(swap.inputAmount) : total;
      }, CurrencyAmount.fromRawAmount(inputNativeCurrency, 0)) : void 0,
      outputAmount: this.outputAmount,
      outputAmountNative: outputNativeCurrency ? this.swaps.reduce((total, swap) => {
        return swap.route.pathOutput.isNative ? total.add(swap.outputAmount) : total;
      }, CurrencyAmount.fromRawAmount(outputNativeCurrency, 0)) : void 0
    };
  }
  get numberOfInputWraps() {
    if (this.inputAmount.currency.isNative) {
      return this.wethInputRoutes.length;
    } else return 0;
  }
  get numberOfInputUnwraps() {
    if (this.isWrappedNative(this.inputAmount.currency)) {
      return this.nativeInputRoutes.length;
    } else return 0;
  }
  get nativeInputRoutes() {
    if (this._nativeInputRoutes) {
      return this._nativeInputRoutes;
    }
    this._nativeInputRoutes = this.routes.filter((route) => route.pathInput.isNative);
    return this._nativeInputRoutes;
  }
  get wethInputRoutes() {
    if (this._wethInputRoutes) {
      return this._wethInputRoutes;
    }
    this._wethInputRoutes = this.routes.filter((route) => this.isWrappedNative(route.pathInput));
    return this._wethInputRoutes;
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
   * Returns the sell tax of the input token
   */
  get inputTax() {
    const inputCurrency = this.inputAmount.currency;
    if (inputCurrency.isNative || !inputCurrency.wrapped.sellFeeBps) return ZERO_PERCENT2;
    return new Percent(inputCurrency.wrapped.sellFeeBps.toNumber(), 1e4);
  }
  /**
   * Returns the buy tax of the output token
   */
  get outputTax() {
    const outputCurrency = this.outputAmount.currency;
    if (outputCurrency.isNative || !outputCurrency.wrapped.buyFeeBps) return ZERO_PERCENT2;
    return new Percent(outputCurrency.wrapped.buyFeeBps.toNumber(), 1e4);
  }
  isWrappedNative(currency) {
    const chainId = currency.chainId;
    return currency.equals(Ether.onChain(chainId).wrapped);
  }
  /**
   * Returns the percent difference between the route's mid price and the expected execution price
   * In order to exclude token taxes from the price impact calculation, the spot price is calculated
   * using a ratio of values that go into the pools, which are the post-tax input amount and pre-tax output amount.
   */
  get priceImpact() {
    if (this._priceImpact) {
      return this._priceImpact;
    }
    if (this.outputTax.equalTo(ONE_HUNDRED_PERCENT2)) return ZERO_PERCENT2;
    let spotOutputAmount = CurrencyAmount.fromRawAmount(this.outputAmount.currency, 0);
    for (const { route, inputAmount } of this.swaps) {
      const midPrice = route.midPrice;
      const postTaxInputAmount = inputAmount.multiply(new Fraction(ONE5).subtract(this.inputTax));
      spotOutputAmount = spotOutputAmount.add(midPrice.quote(postTaxInputAmount));
    }
    if (spotOutputAmount.equalTo(ZERO5)) return ZERO_PERCENT2;
    const preTaxOutputAmount = this.outputAmount.divide(new Fraction(ONE5).subtract(this.outputTax));
    const priceImpact = spotOutputAmount.subtract(preTaxOutputAmount).divide(spotOutputAmount);
    this._priceImpact = new Percent(priceImpact.numerator, priceImpact.denominator);
    return this._priceImpact;
  }
  /**
   * Get the minimum amount that must be received from this trade for the given slippage tolerance
   * @param slippageTolerance The tolerance of unfavorable slippage from the execution price of this trade
   * @returns The amount out
   */
  minimumAmountOut(slippageTolerance, amountOut = this.outputAmount) {
    invariant18(!slippageTolerance.lessThan(ZERO5), "SLIPPAGE_TOLERANCE");
    if (this.tradeType === 1 /* EXACT_OUTPUT */) {
      return amountOut;
    } else {
      const slippageAdjustedAmountOut = new Fraction(ONE5).add(slippageTolerance).invert().multiply(amountOut.quotient).quotient;
      return CurrencyAmount.fromRawAmount(amountOut.currency, slippageAdjustedAmountOut);
    }
  }
  /**
   * Get the maximum amount in that can be spent via this trade for the given slippage tolerance
   * @param slippageTolerance The tolerance of unfavorable slippage from the execution price of this trade
   * @returns The amount in
   */
  maximumAmountIn(slippageTolerance, amountIn = this.inputAmount) {
    invariant18(!slippageTolerance.lessThan(ZERO5), "SLIPPAGE_TOLERANCE");
    if (this.tradeType === 0 /* EXACT_INPUT */) {
      return amountIn;
    } else {
      const slippageAdjustedAmountIn = new Fraction(ONE5).add(slippageTolerance).multiply(amountIn.quotient).quotient;
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
  static async fromRoutes(v2Routes, v3Routes, tradeType, mixedRoutes, v4Routes) {
    const populatedV2Routes = [];
    const populatedV3Routes = [];
    const populatedV4Routes = [];
    const populatedMixedRoutes = [];
    for (const { routev2, amount } of v2Routes) {
      const v2Trade = new Trade3(routev2, amount, tradeType);
      const { inputAmount, outputAmount } = v2Trade;
      populatedV2Routes.push({
        routev2,
        inputAmount,
        outputAmount
      });
    }
    for (const { routev3, amount } of v3Routes) {
      const v3Trade = await Trade.fromRoute(routev3, amount, tradeType);
      const { inputAmount, outputAmount } = v3Trade;
      populatedV3Routes.push({
        routev3,
        inputAmount,
        outputAmount
      });
    }
    if (v4Routes) {
      for (const { routev4, amount } of v4Routes) {
        const v4Trade = await Trade2.fromRoute(routev4, amount, tradeType);
        const { inputAmount, outputAmount } = v4Trade;
        populatedV4Routes.push({
          routev4,
          inputAmount,
          outputAmount
        });
      }
    }
    if (mixedRoutes) {
      for (const { mixedRoute, amount } of mixedRoutes) {
        const mixedRouteTrade = await MixedRouteTrade.fromRoute(mixedRoute, amount, tradeType);
        const { inputAmount, outputAmount } = mixedRouteTrade;
        populatedMixedRoutes.push({
          mixedRoute,
          inputAmount,
          outputAmount
        });
      }
    }
    return new _Trade({
      v2Routes: populatedV2Routes,
      v3Routes: populatedV3Routes,
      v4Routes: populatedV4Routes,
      mixedRoutes: populatedMixedRoutes,
      tradeType
    });
  }
  static async fromRoute(route, amount, tradeType) {
    let v2Routes = [];
    let v3Routes = [];
    let v4Routes = [];
    let mixedRoutes = [];
    if (route instanceof Route3) {
      const v2Trade = new Trade3(route, amount, tradeType);
      const { inputAmount, outputAmount } = v2Trade;
      v2Routes = [{ routev2: route, inputAmount, outputAmount }];
    } else if (route instanceof Route) {
      const v3Trade = await Trade.fromRoute(route, amount, tradeType);
      const { inputAmount, outputAmount } = v3Trade;
      v3Routes = [{ routev3: route, inputAmount, outputAmount }];
    } else if (route instanceof Route2) {
      const v4Trade = await Trade2.fromRoute(route, amount, tradeType);
      const { inputAmount, outputAmount } = v4Trade;
      v4Routes = [{ routev4: route, inputAmount, outputAmount }];
    } else if (route instanceof MixedRouteSDK) {
      const mixedRouteTrade = await MixedRouteTrade.fromRoute(route, amount, tradeType);
      const { inputAmount, outputAmount } = mixedRouteTrade;
      mixedRoutes = [{ mixedRoute: route, inputAmount, outputAmount }];
    } else {
      throw new Error("Invalid route type");
    }
    return new _Trade({
      v2Routes,
      v3Routes,
      v4Routes,
      mixedRoutes,
      tradeType
    });
  }
};
function encodeMixedRouteToPath(route, useMixedRouterQuoteV2) {
  const containsV4Pool = route.pools.some((pool) => pool instanceof Pool2);
  let path;
  let types;
  if (containsV4Pool) {
    path = [route.pathInput.isNative ? ADDRESS_ZERO3 : route.pathInput.address];
    types = ["address"];
    let currencyIn = route.pathInput;
    for (const pool of route.pools) {
      const currencyOut = currencyIn.equals(pool.token0) ? pool.token1 : pool.token0;
      if (pool instanceof Pool2) {
        if (pool.tickSpacing === 0) {
          const wrapOrUnwrapEncoding = 0;
          path.push(wrapOrUnwrapEncoding, currencyOut.isNative ? ADDRESS_ZERO3 : currencyOut.wrapped.address);
          types.push("uint8", "address");
        } else {
          const v4Fee = pool.fee + MIXED_QUOTER_V2_V4_FEE_PATH_PLACEHOLDER;
          path.push(
            v4Fee,
            pool.tickSpacing,
            pool.hooks,
            currencyOut.isNative ? ADDRESS_ZERO3 : currencyOut.wrapped.address
          );
          types.push("uint24", "uint24", "address", "address");
        }
      } else if (pool instanceof Pool) {
        const v3Fee = pool.fee + MIXED_QUOTER_V2_V3_FEE_PATH_PLACEHOLDER;
        path.push(v3Fee, currencyOut.wrapped.address);
        types.push("uint24", "address");
      } else if (pool instanceof Pair) {
        const v2Fee = MIXED_QUOTER_V2_V2_FEE_PATH_PLACEHOLDER;
        path.push(v2Fee, currencyOut.wrapped.address);
        types.push("uint8", "address");
      } else {
        throw new Error(`Unsupported pool type ${JSON.stringify(pool)}`);
      }
      currencyIn = currencyOut;
    }
  } else {
    const result = route.pools.reduce(
      ({ inputToken, path: path2, types: types2 }, pool, index) => {
        const outputToken = pool.token0.equals(inputToken) ? pool.token1 : pool.token0;
        if (index === 0) {
          return {
            inputToken: outputToken,
            types: ["address", "uint24", "address"],
            path: [
              inputToken.wrapped.address,
              pool instanceof Pool ? pool.fee : MIXED_QUOTER_V1_V2_FEE_PATH_PLACEHOLDER,
              outputToken.wrapped.address
            ]
          };
        } else {
          return {
            inputToken: outputToken,
            types: [...types2, "uint24", "address"],
            path: [
              ...path2,
              pool instanceof Pool ? pool.fee : MIXED_QUOTER_V1_V2_FEE_PATH_PLACEHOLDER,
              outputToken.wrapped.address
            ]
          };
        }
      },
      { inputToken: route.input, path: [], types: [] }
    );
    path = result.path;
    types = result.types;
  }
  return pack(types, path);
}

// src/router/utils/index.ts
var partitionMixedRouteByProtocol = (route) => {
  let acc = [];
  let left = 0;
  let right = 0;
  while (right < route.pools.length) {
    if (route.pools[left] instanceof Pool2 && !(route.pools[right] instanceof Pool2) || route.pools[left] instanceof Pool && !(route.pools[right] instanceof Pool) || route.pools[left] instanceof Pair && !(route.pools[right] instanceof Pair)) {
      acc.push(route.pools.slice(left, right));
      left = right;
    }
    right++;
    if (right === route.pools.length) {
      acc.push(route.pools.slice(left, right));
    }
  }
  return acc;
};
var getOutputOfPools = (pools, firstInputToken) => {
  const { inputToken: outputToken } = pools.reduce(
    ({ inputToken }, pool) => {
      if (!pool.involvesToken(inputToken)) throw new Error("PATH");
      const outputToken2 = pool.token0.equals(inputToken) ? pool.token1 : pool.token0;
      return {
        inputToken: outputToken2
      };
    },
    { inputToken: firstInputToken }
  );
  return outputToken;
};

// src/universal-router/utils/pathCurrency.ts
function getPathCurrency3(currency, pool) {
  if (pool.involvesToken(currency)) {
    return currency;
  } else if (pool.involvesToken(currency.wrapped)) {
    return currency.wrapped;
  } else if (pool instanceof Pool2 && pool.token0.wrapped.equals(currency)) {
    return pool.token0;
  } else if (pool instanceof Pool2 && pool.token1.wrapped.equals(currency)) {
    return pool.token1;
  } else {
    throw new Error(`Expected currency ${currency.symbol} to be either ${pool.token0.symbol} or ${pool.token1.symbol}`);
  }
}

// src/universal-router/entities/Command.ts
var RouterActionType = /* @__PURE__ */ ((RouterActionType2) => {
  RouterActionType2["UniswapTrade"] = "UniswapTrade";
  RouterActionType2["UnwrapWETH"] = "UnwrapWETH";
  return RouterActionType2;
})(RouterActionType || {});
var UniversalRouterVersion = /* @__PURE__ */ ((UniversalRouterVersion2) => {
  UniversalRouterVersion2["V1_2"] = "1.2";
  UniversalRouterVersion2["V2_0"] = "2.0";
  return UniversalRouterVersion2;
})(UniversalRouterVersion || {});
var WETH_NOT_SUPPORTED_ON_CHAIN = "0x0000000000000000000000000000000000000000";
var CHAIN_CONFIGS = {
  // mainnet
  [1]: {
    weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 17143817
      },
      ["2.0" /* V2_0 */]: {
        address: "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",
        creationBlock: 1737658355
      }
    }
  },
  // goerli
  [5]: {
    weth: "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 8940568
      },
      ["2.0" /* V2_0 */]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 8940568
      }
    }
  },
  // sepolia
  [11155111]: {
    weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 3543575
      },
      ["2.0" /* V2_0 */]: {
        address: "0x3a9d48ab9751398bbfa63ad67599bb04e4bdf98b",
        // only update here and creation block below
        creationBlock: 7259601
      }
    }
  },
  // polygon
  [137]: {
    weth: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0xec7BE89e9d109e7e3Fec59c222CF297125FEFda2",
        creationBlock: 52210153
      },
      ["2.0" /* V2_0 */]: {
        address: "0x1095692a6237d83c6a72f3f5efedb9a670c49223",
        creationBlock: 1737492197
      }
    }
  },
  //polygon mumbai
  [80001]: {
    weth: "0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 35176052
      },
      ["2.0" /* V2_0 */]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 35176052
      }
    }
  },
  //optimism
  [10]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0xCb1355ff08Ab38bBCE60111F1bb2B784bE25D7e8",
        creationBlock: 114702266
      },
      ["2.0" /* V2_0 */]: {
        address: "0x851116d9223fabed8e56c0e6b8ad0c31d98b3507",
        creationBlock: 1737494278
      }
    }
  },
  // optimism goerli
  [420]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 8887728
      },
      ["2.0" /* V2_0 */]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 8887728
      }
    }
  },
  // arbitrum
  [42161]: {
    weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x5E325eDA8064b456f4781070C0738d849c824258",
        creationBlock: 169472836
      },
      ["2.0" /* V2_0 */]: {
        address: "0xa51afafe0263b40edaef0df8781ea9aa03e381a3",
        creationBlock: 1737487458
      }
    }
  },
  // arbitrum goerli
  [421613]: {
    weth: "0xe39Ab88f8A4777030A534146A9Ca3B52bd5D43A3",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 18815277
      },
      ["2.0" /* V2_0 */]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 18815277
      }
    }
  },
  // celo
  [42220]: {
    weth: WETH_NOT_SUPPORTED_ON_CHAIN,
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x643770e279d5d0733f21d6dc03a8efbabf3255b4",
        creationBlock: 21407637
      },
      ["2.0" /* V2_0 */]: {
        address: "0xcb695bc5D3Aa22cAD1E6DF07801b061a05A0233A",
        creationBlock: 47387857
      }
    }
  },
  // celo alfajores
  [44787]: {
    weth: WETH_NOT_SUPPORTED_ON_CHAIN,
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 17566658
      },
      ["2.0" /* V2_0 */]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 17566658
      }
    }
  },
  // binance smart chain
  [56]: {
    weth: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x4Dae2f939ACf50408e13d58534Ff8c2776d45265",
        creationBlock: 35160263
      },
      ["2.0" /* V2_0 */]: {
        address: "0x1906c1d672b88cd1b9ac7593301ca990f94eae07",
        creationBlock: 1737493275
      }
    }
  },
  // avalanche
  [43114]: {
    weth: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x4Dae2f939ACf50408e13d58534Ff8c2776d45265",
        creationBlock: 40237257
      },
      ["2.0" /* V2_0 */]: {
        address: "0x94b75331ae8d42c1b61065089b7d48fe14aa73b7",
        creationBlock: 1737558236
      }
    }
  },
  // base goerli
  [84531]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0xd0872d928672ae2ff74bdb2f5130ac12229cafaf",
        creationBlock: 6915289
      },
      ["2.0" /* V2_0 */]: {
        address: "0xd0872d928672ae2ff74bdb2f5130ac12229cafaf",
        creationBlock: 6915289
      }
    }
  },
  // base mainnet
  [8453]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 9107268
      },
      ["2.0" /* V2_0 */]: {
        address: "0x6ff5693b99212da76ad316178a184ab56d299b43",
        creationBlock: 1737491485
      }
    }
  },
  // blast
  [81457]: {
    weth: "0x4300000000000000000000000000000000000004",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x643770E279d5D0733F21d6DC03A8efbABf3255B4",
        creationBlock: 1116444
      },
      ["2.0" /* V2_0 */]: {
        address: "0xeabbcb3e8e415306207ef514f660a3f820025be3",
        creationBlock: 1737564586
      }
    }
  },
  // zora
  [7777777]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x2986d9721A49838ab4297b695858aF7F17f38014",
        creationBlock: 11832155
      },
      ["2.0" /* V2_0 */]: {
        address: "0x3315ef7ca28db74abadc6c44570efdf06b04b020",
        creationBlock: 1737562927
      }
    }
  },
  [324]: {
    weth: "0x5aea5775959fbc2557cc8789bc1bf90a239d9a91",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x28731BCC616B5f51dD52CF2e4dF0E78dD1136C06",
        creationBlock: 12640979
      },
      ["2.0" /* V2_0 */]: {
        address: "0x28731BCC616B5f51dD52CF2e4dF0E78dD1136C06",
        creationBlock: 12640979
      }
    }
  },
  // worldchain
  [480]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
        creationBlock: 4063979
      },
      ["2.0" /* V2_0 */]: {
        address: "0x8ac7bee993bb44dab564ea4bc9ea67bf9eb5e743",
        creationBlock: 1737559557
      }
    }
  },
  [1301]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
        creationBlock: 1241811
      },
      ["2.0" /* V2_0 */]: {
        address: "0xf70536b3bcc1bd1a972dc186a2cf84cc6da6be5d",
        creationBlock: 7100543
      }
    }
  },
  // unichain mainnet
  [130]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x4D73A4411CA1c660035e4AECC8270E5DdDEC8C17",
        creationBlock: 23678
      },
      ["2.0" /* V2_0 */]: {
        address: "0xef740bf23acae26f6492b10de645d6b98dc8eaf3",
        creationBlock: 1737568156
      }
    }
  },
  [10143]: {
    weth: "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x3ae6d8a282d67893e17aa70ebffb33ee5aa65893",
        creationBlock: 23678
      },
      ["2.0" /* V2_0 */]: {
        address: "0x3ae6d8a282d67893e17aa70ebffb33ee5aa65893",
        creationBlock: 23678
      }
    }
  },
  [84532]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x492e6456d9528771018deb9e87ef7750ef184104",
        creationBlock: 20216585
      },
      ["2.0" /* V2_0 */]: {
        address: "0x492e6456d9528771018deb9e87ef7750ef184104",
        creationBlock: 20216585
      }
    }
  },
  [1868]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x0e2850543f69f678257266e0907ff9a58b3f13de",
        creationBlock: 3254782
      },
      ["2.0" /* V2_0 */]: {
        address: "0x0e2850543f69f678257266e0907ff9a58b3f13de",
        creationBlock: 3254782
      }
    }
  },
  [143]: {
    weth: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x0d97dc33264bfc1c226207428a79b26757fb9dc3",
        creationBlock: 29255937
      },
      ["2.0" /* V2_0 */]: {
        address: "0x0d97dc33264bfc1c226207428a79b26757fb9dc3",
        creationBlock: 29255937
      }
    }
  },
  [196]: {
    weth: "0xe538905cf8410324e03A5A23C1c177a474D59b2b",
    routerConfigs: {
      ["1.2" /* V1_2 */]: {
        address: "0x0000000000000000000000000000000000000000",
        creationBlock: 1
      },
      ["2.0" /* V2_0 */]: {
        address: "0x5507749f2c558bb3e162c6e90c314c092e7372ff",
        creationBlock: 47680350
      }
    }
  }
};
var UNIVERSAL_ROUTER_ADDRESS = (version3, chainId) => {
  if (!(chainId in CHAIN_CONFIGS)) throw new Error(`Universal Router not deployed on chain ${chainId}`);
  return CHAIN_CONFIGS[chainId].routerConfigs[version3].address;
};
var UNIVERSAL_ROUTER_CREATION_BLOCK = (version3, chainId) => {
  if (!(chainId in CHAIN_CONFIGS)) throw new Error(`Universal Router not deployed on chain ${chainId}`);
  return CHAIN_CONFIGS[chainId].routerConfigs[version3].creationBlock;
};
var WETH_ADDRESS = (chainId) => {
  if (!(chainId in CHAIN_CONFIGS)) throw new Error(`Universal Router not deployed on chain ${chainId}`);
  if (CHAIN_CONFIGS[chainId].weth == WETH_NOT_SUPPORTED_ON_CHAIN) throw new Error(`Chain ${chainId} does not have WETH`);
  return CHAIN_CONFIGS[chainId].weth;
};
var CONTRACT_BALANCE = BigNumber$1.from(2).pow(255);
var ETH_ADDRESS = "0x0000000000000000000000000000000000000000";
var E_ETH_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
BigNumber$1.from(2).pow(256).sub(1);
BigNumber$1.from(2).pow(160).sub(1);
var SENDER_AS_RECIPIENT = "0x0000000000000000000000000000000000000001";
var ROUTER_AS_RECIPIENT = "0x0000000000000000000000000000000000000002";

// src/universal-router/utils/getCurrencyAddress.ts
function getCurrencyAddress(currency) {
  return currency.isNative ? ETH_ADDRESS : currency.wrapped.address;
}
function encodeFeeBips(fee) {
  return toHex2(fee.multiply(1e4).quotient);
}
var REFUND_ETH_PRICE_IMPACT_THRESHOLD = new Percent(50, 100);
var UniswapTrade = class {
  constructor(trade, options) {
    this.trade = trade;
    this.options = options;
    this.tradeType = "UniswapTrade" /* UniswapTrade */;
    if (!!options.fee && !!options.flatFee) throw new Error("Only one fee option permitted");
    if (this.inputRequiresWrap || this.inputRequiresUnwrap || this.options.useRouterBalance) {
      this.payerIsUser = false;
    } else {
      this.payerIsUser = true;
    }
  }
  get isAllV4() {
    let result = true;
    for (const swap of this.trade.swaps) {
      result = result && swap.route.protocol == "V4" /* V4 */;
    }
    return result;
  }
  // this.trade.swaps is an array of swaps / trades.
  // we are iterating over one swap (trade) at a time so length is 1
  // route is either v2, v3, v4, or mixed
  // pathInput and pathOutput are the currencies of the input and output of the route
  // this.trade.inputAmount is the input currency of the trade (could be different from pathInput)
  // this.trade.outputAmount is the output currency of the trade (could be different from pathOutput)
  // each route can have multiple pools
  get inputRequiresWrap() {
    const swap = this.trade.swaps[0];
    const route = swap.route;
    const firstPool = route.pools[0];
    if (firstPool instanceof Pool2) {
      return this.trade.inputAmount.currency.isNative && !this.trade.swaps[0].route.pathInput.isNative;
    }
    return this.trade.inputAmount.currency.isNative;
  }
  get inputRequiresUnwrap() {
    const swap = this.trade.swaps[0];
    const route = swap.route;
    const firstPool = route.pools[0];
    if (firstPool instanceof Pool2) {
      return !this.trade.inputAmount.currency.isNative && this.trade.swaps[0].route.pathInput.isNative;
    }
    return false;
  }
  get outputRequiresWrap() {
    const swap = this.trade.swaps[0];
    const lastRoute = swap.route;
    const lastPool = lastRoute.pools[lastRoute.pools.length - 1];
    if (lastPool instanceof Pool2) {
      return !this.trade.outputAmount.currency.isNative && lastRoute.pathOutput.isNative;
    }
    return false;
  }
  get outputRequiresUnwrap() {
    const swap = this.trade.swaps[0];
    const lastRoute = swap.route;
    const lastPool = lastRoute.pools[lastRoute.pools.length - 1];
    if (lastPool instanceof Pool2) {
      return this.trade.outputAmount.currency.isNative && !this.trade.swaps[0].route.pathOutput.isNative;
    }
    return this.trade.outputAmount.currency.isNative;
  }
  get outputRequiresTransition() {
    return this.outputRequiresWrap || this.outputRequiresUnwrap;
  }
  encode(planner, _config) {
    if (this.inputRequiresWrap) {
      planner.addCommand(11 /* WRAP_ETH */, [
        ROUTER_AS_RECIPIENT,
        this.trade.maximumAmountIn(this.options.slippageTolerance).quotient.toString()
      ]);
    } else if (this.inputRequiresUnwrap) {
      planner.addCommand(2 /* PERMIT2_TRANSFER_FROM */, [
        this.trade.inputAmount.currency.address,
        ROUTER_AS_RECIPIENT,
        this.trade.maximumAmountIn(this.options.slippageTolerance).quotient.toString()
      ]);
      planner.addCommand(12 /* UNWRAP_WETH */, [ROUTER_AS_RECIPIENT, 0]);
    }
    this.options.recipient = this.options.recipient ?? SENDER_AS_RECIPIENT;
    const performAggregatedSlippageCheck = this.trade.tradeType === 0 /* EXACT_INPUT */ && this.trade.routes.length > 2;
    const routerMustCustody = performAggregatedSlippageCheck || this.outputRequiresTransition || hasFeeOption(this.options);
    for (const swap of this.trade.swaps) {
      switch (swap.route.protocol) {
        case "V2" /* V2 */:
          addV2Swap(planner, swap, this.trade.tradeType, this.options, this.payerIsUser, routerMustCustody);
          break;
        case "V3" /* V3 */:
          addV3Swap(planner, swap, this.trade.tradeType, this.options, this.payerIsUser, routerMustCustody);
          break;
        case "V4" /* V4 */:
          addV4Swap(planner, swap, this.trade.tradeType, this.options, this.payerIsUser, routerMustCustody);
          break;
        case "MIXED" /* MIXED */:
          addMixedSwap(planner, swap, this.trade.tradeType, this.options, this.payerIsUser, routerMustCustody);
          break;
        default:
          throw new Error("UNSUPPORTED_TRADE_PROTOCOL");
      }
    }
    let minimumAmountOut = BigNumber$1.from(
      this.trade.minimumAmountOut(this.options.slippageTolerance).quotient.toString()
    );
    if (routerMustCustody) {
      const pools = this.trade.swaps[0].route.pools;
      const pathOutputCurrencyAddress = getCurrencyAddress(
        getPathCurrency3(this.trade.outputAmount.currency, pools[pools.length - 1])
      );
      if (!!this.options.fee) {
        const feeBips = encodeFeeBips(this.options.fee.fee);
        planner.addCommand(6 /* PAY_PORTION */, [pathOutputCurrencyAddress, this.options.fee.recipient, feeBips]);
        if (this.trade.tradeType === 1 /* EXACT_OUTPUT */) {
          minimumAmountOut = minimumAmountOut.sub(minimumAmountOut.mul(feeBips).div(1e4));
        }
      }
      if (!!this.options.flatFee) {
        const feeAmount = this.options.flatFee.amount;
        if (minimumAmountOut.lt(feeAmount)) throw new Error("Flat fee amount greater than minimumAmountOut");
        planner.addCommand(5 /* TRANSFER */, [pathOutputCurrencyAddress, this.options.flatFee.recipient, feeAmount]);
        if (this.trade.tradeType === 1 /* EXACT_OUTPUT */) {
          minimumAmountOut = minimumAmountOut.sub(feeAmount);
        }
      }
      if (this.outputRequiresUnwrap) {
        planner.addCommand(12 /* UNWRAP_WETH */, [this.options.recipient, minimumAmountOut]);
      } else if (this.outputRequiresWrap) {
        planner.addCommand(11 /* WRAP_ETH */, [this.options.recipient, CONTRACT_BALANCE]);
      } else {
        planner.addCommand(4 /* SWEEP */, [
          getCurrencyAddress(this.trade.outputAmount.currency),
          this.options.recipient,
          minimumAmountOut
        ]);
      }
    }
    if (this.trade.tradeType === 1 /* EXACT_OUTPUT */ || riskOfPartialFill(this.trade)) {
      if (this.inputRequiresWrap) {
        planner.addCommand(12 /* UNWRAP_WETH */, [this.options.recipient, 0]);
      } else if (this.inputRequiresUnwrap) {
        planner.addCommand(11 /* WRAP_ETH */, [this.options.recipient, CONTRACT_BALANCE]);
      } else if (this.trade.inputAmount.currency.isNative) {
        planner.addCommand(4 /* SWEEP */, [ETH_ADDRESS, this.options.recipient, 0]);
      }
    }
    if (this.options.safeMode) planner.addCommand(4 /* SWEEP */, [ETH_ADDRESS, this.options.recipient, 0]);
  }
};
function addV2Swap(planner, { route, inputAmount, outputAmount }, tradeType, options, payerIsUser, routerMustCustody) {
  const trade = new Trade3(
    route,
    tradeType == 0 /* EXACT_INPUT */ ? inputAmount : outputAmount,
    tradeType
  );
  if (tradeType == 0 /* EXACT_INPUT */) {
    planner.addCommand(8 /* V2_SWAP_EXACT_IN */, [
      // if native, we have to unwrap so keep in the router for now
      routerMustCustody ? ROUTER_AS_RECIPIENT : options.recipient,
      trade.maximumAmountIn(options.slippageTolerance).quotient.toString(),
      // if router will custody funds, we do aggregated slippage check from router
      routerMustCustody ? 0 : trade.minimumAmountOut(options.slippageTolerance).quotient.toString(),
      route.path.map((token) => token.wrapped.address),
      payerIsUser
    ]);
  } else if (tradeType == 1 /* EXACT_OUTPUT */) {
    planner.addCommand(9 /* V2_SWAP_EXACT_OUT */, [
      routerMustCustody ? ROUTER_AS_RECIPIENT : options.recipient,
      trade.minimumAmountOut(options.slippageTolerance).quotient.toString(),
      trade.maximumAmountIn(options.slippageTolerance).quotient.toString(),
      route.path.map((token) => token.wrapped.address),
      payerIsUser
    ]);
  }
}
function addV3Swap(planner, { route, inputAmount, outputAmount }, tradeType, options, payerIsUser, routerMustCustody) {
  const trade = Trade.createUncheckedTrade({
    route,
    inputAmount,
    outputAmount,
    tradeType
  });
  const path = encodeRouteToPath(route, trade.tradeType === 1 /* EXACT_OUTPUT */);
  if (tradeType == 0 /* EXACT_INPUT */) {
    planner.addCommand(0 /* V3_SWAP_EXACT_IN */, [
      routerMustCustody ? ROUTER_AS_RECIPIENT : options.recipient,
      trade.maximumAmountIn(options.slippageTolerance).quotient.toString(),
      routerMustCustody ? 0 : trade.minimumAmountOut(options.slippageTolerance).quotient.toString(),
      path,
      payerIsUser
    ]);
  } else if (tradeType == 1 /* EXACT_OUTPUT */) {
    planner.addCommand(1 /* V3_SWAP_EXACT_OUT */, [
      routerMustCustody ? ROUTER_AS_RECIPIENT : options.recipient,
      trade.minimumAmountOut(options.slippageTolerance).quotient.toString(),
      trade.maximumAmountIn(options.slippageTolerance).quotient.toString(),
      path,
      payerIsUser
    ]);
  }
}
function addV4Swap(planner, { inputAmount, outputAmount, route }, tradeType, options, payerIsUser, routerMustCustody) {
  const pools = route.pools.map((p) => p);
  const v4Route = new Route2(pools, inputAmount.currency, outputAmount.currency);
  const trade = Trade2.createUncheckedTrade({
    route: v4Route,
    inputAmount,
    outputAmount,
    tradeType
  });
  const slippageToleranceOnSwap = routerMustCustody && tradeType == 0 /* EXACT_INPUT */ ? void 0 : options.slippageTolerance;
  const v4Planner = new V4Planner();
  v4Planner.addTrade(trade, slippageToleranceOnSwap);
  v4Planner.addSettle(trade.route.pathInput, payerIsUser);
  v4Planner.addTake(
    trade.route.pathOutput,
    routerMustCustody ? ROUTER_AS_RECIPIENT : options.recipient ?? SENDER_AS_RECIPIENT
  );
  planner.addCommand(16 /* V4_SWAP */, [v4Planner.finalize()]);
}
function addMixedSwap(planner, swap, tradeType, options, payerIsUser, routerMustCustody) {
  const route = swap.route;
  const inputAmount = swap.inputAmount;
  const outputAmount = swap.outputAmount;
  const tradeRecipient = routerMustCustody ? ROUTER_AS_RECIPIENT : options.recipient ?? SENDER_AS_RECIPIENT;
  if (route.pools.length === 1) {
    if (route.pools[0] instanceof Pool2) {
      return addV4Swap(planner, swap, tradeType, options, payerIsUser, routerMustCustody);
    } else if (route.pools[0] instanceof Pool) {
      return addV3Swap(planner, swap, tradeType, options, payerIsUser, routerMustCustody);
    } else if (route.pools[0] instanceof Pair) {
      return addV2Swap(planner, swap, tradeType, options, payerIsUser, routerMustCustody);
    } else {
      throw new Error("Invalid route type");
    }
  }
  const trade = MixedRouteTrade.createUncheckedTrade({
    route,
    inputAmount,
    outputAmount,
    tradeType
  });
  const amountIn = trade.maximumAmountIn(options.slippageTolerance, inputAmount).quotient.toString();
  const amountOut = routerMustCustody ? 0 : trade.minimumAmountOut(options.slippageTolerance, outputAmount).quotient.toString();
  const sections = partitionMixedRouteByProtocol(route);
  const isLastSectionInRoute = (i) => {
    return i === sections.length - 1;
  };
  let inputToken = route.pathInput;
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const routePool = section[0];
    const outputToken = getOutputOfPools(section, inputToken);
    const subRoute = new MixedRoute(new MixedRouteSDK([...section], inputToken, outputToken));
    let nextInputToken;
    let swapRecipient;
    if (isLastSectionInRoute(i)) {
      nextInputToken = outputToken;
      swapRecipient = tradeRecipient;
    } else {
      const nextPool = sections[i + 1][0];
      nextInputToken = getPathCurrency3(outputToken, nextPool);
      const v2PoolIsSwapRecipient = nextPool instanceof Pair && outputToken.equals(nextInputToken);
      swapRecipient = v2PoolIsSwapRecipient ? nextPool.liquidityToken.address : ROUTER_AS_RECIPIENT;
    }
    if (routePool instanceof Pool2) {
      const v4Planner = new V4Planner();
      const v4SubRoute = new Route2(section, subRoute.input, subRoute.output);
      v4Planner.addSettle(inputToken, payerIsUser && i === 0, i == 0 ? amountIn : CONTRACT_BALANCE);
      v4Planner.addAction(7 /* SWAP_EXACT_IN */, [
        {
          currencyIn: inputToken.isNative ? ETH_ADDRESS : inputToken.address,
          path: encodeRouteToPath2(v4SubRoute),
          amountIn: 0,
          // denotes open delta, amount set in v4Planner.addSettle()
          amountOutMinimum: !isLastSectionInRoute(i) ? 0 : amountOut
        }
      ]);
      v4Planner.addTake(outputToken, swapRecipient);
      planner.addCommand(16 /* V4_SWAP */, [v4Planner.finalize()]);
    } else if (routePool instanceof Pool) {
      planner.addCommand(0 /* V3_SWAP_EXACT_IN */, [
        swapRecipient,
        // recipient
        i == 0 ? amountIn : CONTRACT_BALANCE,
        // amountIn
        !isLastSectionInRoute(i) ? 0 : amountOut,
        // amountOut
        encodeMixedRouteToPath(subRoute),
        // path
        payerIsUser && i === 0
        // payerIsUser
      ]);
    } else if (routePool instanceof Pair) {
      planner.addCommand(8 /* V2_SWAP_EXACT_IN */, [
        swapRecipient,
        // recipient
        i === 0 ? amountIn : CONTRACT_BALANCE,
        // amountIn
        !isLastSectionInRoute(i) ? 0 : amountOut,
        // amountOutMin
        subRoute.path.map((token) => token.wrapped.address),
        // path
        payerIsUser && i === 0
      ]);
    } else {
      throw new Error("Unexpected Pool Type");
    }
    if (!isLastSectionInRoute(i)) {
      if (outputToken.isNative && !nextInputToken.isNative) {
        planner.addCommand(11 /* WRAP_ETH */, [ROUTER_AS_RECIPIENT, CONTRACT_BALANCE]);
      } else if (!outputToken.isNative && nextInputToken.isNative) {
        planner.addCommand(12 /* UNWRAP_WETH */, [ROUTER_AS_RECIPIENT, 0]);
      }
    }
    inputToken = nextInputToken;
  }
}
function riskOfPartialFill(trade) {
  return trade.priceImpact.greaterThan(REFUND_ETH_PRICE_IMPACT_THRESHOLD);
}
function hasFeeOption(swapOptions) {
  return !!swapOptions.fee || !!swapOptions.flatFee;
}
var SIGNATURE_LENGTH = 65;
var EIP_2098_SIGNATURE_LENGTH = 64;
function encodePermit(planner, permit2) {
  let signature = permit2.signature;
  const length = ethers.utils.arrayify(permit2.signature).length;
  if (length === SIGNATURE_LENGTH || length === EIP_2098_SIGNATURE_LENGTH) {
    signature = ethers.utils.joinSignature(ethers.utils.splitSignature(permit2.signature));
  }
  planner.addCommand(10 /* PERMIT2_PERMIT */, [permit2, signature]);
}
function encodeV3PositionPermit(planner, permit, tokenId) {
  const calldata = NonfungiblePositionManager.INTERFACE.encodeFunctionData("permit", [
    validateAndParseAddress(permit.spender),
    tokenId,
    permit.deadline,
    permit.v,
    permit.r,
    permit.s
  ]);
  planner.addCommand(17 /* V3_POSITION_MANAGER_PERMIT */, [calldata]);
}
function encodeInputTokenOptions(planner, options) {
  if (!!options.permit2TransferFrom && !!options.permit2Permit)
    invariant18(options.permit2TransferFrom.token === options.permit2Permit.details.token, `inconsistent token`);
  if (!!options.permit2Permit) {
    encodePermit(planner, options.permit2Permit);
  }
  if (!!options.permit2TransferFrom) {
    planner.addCommand(2 /* PERMIT2_TRANSFER_FROM */, [
      options.permit2TransferFrom.token,
      options.permit2TransferFrom.recipient ? options.permit2TransferFrom.recipient : ROUTER_AS_RECIPIENT,
      options.permit2TransferFrom.amount
    ]);
  }
}

// src/universal-router/swapRouter.ts
function isMint3(options) {
  return Object.keys(options).some((k) => k === "recipient");
}
var _SwapRouter = class _SwapRouter {
  static swapCallParameters(trades, options) {
    const planner = new RoutePlanner();
    const trade = new UniswapTrade(trades, options);
    const inputCurrency = trade.trade.inputAmount.currency;
    invariant18(!(inputCurrency.isNative && !!options.inputTokenPermit), "NATIVE_INPUT_PERMIT");
    if (options.inputTokenPermit) {
      encodePermit(planner, options.inputTokenPermit);
    }
    const nativeCurrencyValue = inputCurrency.isNative ? BigNumber$1.from(trade.trade.maximumAmountIn(options.slippageTolerance).quotient.toString()) : BigNumber$1.from(0);
    trade.encode(planner, { allowRevert: false });
    return _SwapRouter.encodePlan(planner, nativeCurrencyValue, {
      deadline: options.deadlineOrPreviousBlockhash ? BigNumber$1.from(options.deadlineOrPreviousBlockhash) : void 0
    });
  }
  /**
   * Builds the call parameters for a migration from a V3 position to a V4 position.
   * Some requirements of the parameters:
   *   - v3RemoveLiquidityOptions.collectOptions.recipient must equal v4PositionManager
   *   - v3RemoveLiquidityOptions.liquidityPercentage must be 100%
   *   - input pool and output pool must have the same tokens
   *   - V3 NFT must be approved, or valid inputV3NFTPermit must be provided with UR as spender
   */
  static migrateV3ToV4CallParameters(options, positionManagerOverride) {
    const v4Pool = options.outputPosition.pool;
    const v3Token0 = options.inputPosition.pool.token0;
    const v3Token1 = options.inputPosition.pool.token1;
    const v4PositionManagerAddress = positionManagerOverride ?? CHAIN_TO_ADDRESSES_MAP[v4Pool.chainId].v4PositionManagerAddress;
    if (v4Pool.currency0.isNative) {
      invariant18(
        v4Pool.currency0.wrapped.equals(v3Token0) && v4Pool.currency1.equals(v3Token1) || v4Pool.currency0.wrapped.equals(v3Token1) && v4Pool.currency1.equals(v3Token0),
        "TOKEN_MISMATCH"
      );
    } else {
      invariant18(v3Token0 === v4Pool.token0, "TOKEN0_MISMATCH");
      invariant18(v3Token1 === v4Pool.token1, "TOKEN1_MISMATCH");
    }
    invariant18(
      options.v3RemoveLiquidityOptions.liquidityPercentage.equalTo(new Percent(100, 100)),
      "FULL_REMOVAL_REQUIRED"
    );
    invariant18(options.v3RemoveLiquidityOptions.burnToken == true, "BURN_TOKEN_REQUIRED");
    invariant18(
      options.v3RemoveLiquidityOptions.collectOptions.recipient === v4PositionManagerAddress,
      "RECIPIENT_NOT_POSITION_MANAGER"
    );
    invariant18(isMint3(options.v4AddLiquidityOptions), "MINT_REQUIRED");
    invariant18(options.v4AddLiquidityOptions.migrate, "MIGRATE_REQUIRED");
    const planner = new RoutePlanner();
    if (options.v4AddLiquidityOptions.createPool) {
      const poolKey = Pool2.getPoolKey(
        v4Pool.currency0,
        v4Pool.currency1,
        v4Pool.fee,
        v4Pool.tickSpacing,
        v4Pool.hooks
      );
      planner.addCommand(19 /* V4_INITIALIZE_POOL */, [poolKey, v4Pool.sqrtRatioX96.toString()]);
      delete options.v4AddLiquidityOptions.createPool;
    }
    if (options.v3RemoveLiquidityOptions.permit) {
      const universalRouterAddress = UNIVERSAL_ROUTER_ADDRESS(
        "2.0" /* V2_0 */,
        options.inputPosition.pool.chainId
      );
      invariant18(universalRouterAddress == options.v3RemoveLiquidityOptions.permit.spender, "INVALID_SPENDER");
      encodeV3PositionPermit(planner, options.v3RemoveLiquidityOptions.permit, options.v3RemoveLiquidityOptions.tokenId);
      delete options.v3RemoveLiquidityOptions.permit;
    }
    const v3RemoveParams = NonfungiblePositionManager.removeCallParameters(
      options.inputPosition,
      options.v3RemoveLiquidityOptions
    );
    const v3Calls = Multicall.decodeMulticall(v3RemoveParams.calldata);
    for (const v3Call of v3Calls) {
      const selector2 = v3Call.slice(0, 10);
      invariant18(
        selector2 == NonfungiblePositionManager.INTERFACE.getSighash("collect") || selector2 == NonfungiblePositionManager.INTERFACE.getSighash("decreaseLiquidity") || selector2 == NonfungiblePositionManager.INTERFACE.getSighash("burn"),
        "INVALID_V3_CALL: " + selector2
      );
      planner.addCommand(18 /* V3_POSITION_MANAGER_CALL */, [v3Call]);
    }
    const v4AddParams = V4PositionManager.addCallParameters(options.outputPosition, options.v4AddLiquidityOptions);
    const selector = v4AddParams.calldata.slice(0, 10);
    invariant18(selector == V4PositionManager.INTERFACE.getSighash("modifyLiquidities"), "INVALID_V4_CALL: " + selector);
    planner.addCommand(20 /* V4_POSITION_MANAGER_CALL */, [v4AddParams.calldata]);
    return _SwapRouter.encodePlan(planner, BigNumber$1.from(0), {
      deadline: BigNumber$1.from(options.v4AddLiquidityOptions.deadline)
    });
  }
  /**
   * Encodes a planned route into a method name and parameters for the Router contract.
   * @param planner the planned route
   * @param nativeCurrencyValue the native currency value of the planned route
   * @param config the router config
   */
  static encodePlan(planner, nativeCurrencyValue, config = {}) {
    const { commands, inputs } = planner;
    const functionSignature = !!config.deadline ? "execute(bytes,bytes[],uint256)" : "execute(bytes,bytes[])";
    const parameters = !!config.deadline ? [commands, inputs, config.deadline] : [commands, inputs];
    const calldata = _SwapRouter.INTERFACE.encodeFunctionData(functionSignature, parameters);
    return { calldata, value: nativeCurrencyValue.toHexString() };
  }
};
_SwapRouter.INTERFACE = new Interface(UniversalRouter.abi);
var SwapRouter = _SwapRouter;
var UnwrapWETH = class {
  constructor(amount, chainId, permit2) {
    this.tradeType = "UnwrapWETH" /* UnwrapWETH */;
    this.wethAddress = WETH_ADDRESS(chainId);
    this.amount = amount;
    if (!!permit2) {
      invariant18(
        permit2.details.token.toLowerCase() === this.wethAddress.toLowerCase(),
        `must be permitting WETH address: ${this.wethAddress}`
      );
      invariant18(permit2.details.amount >= amount, `Did not permit enough WETH for unwrapWETH transaction`);
      this.permit2Data = permit2;
    }
  }
  encode(planner, _) {
    encodeInputTokenOptions(planner, {
      permit2Permit: this.permit2Data,
      permit2TransferFrom: {
        token: this.wethAddress,
        amount: this.amount.toString()
      }
    });
    planner.addCommand(12 /* UNWRAP_WETH */, [ROUTER_AS_RECIPIENT, this.amount]);
  }
};
var PoolType = /* @__PURE__ */ ((PoolType2) => {
  PoolType2["V2Pool"] = "v2-pool";
  PoolType2["V3Pool"] = "v3-pool";
  PoolType2["V4Pool"] = "v4-pool";
  return PoolType2;
})(PoolType || {});
var isNativeCurrency = (address) => address.toLowerCase() === ETH_ADDRESS.toLowerCase() || address.toLowerCase() === E_ETH_ADDRESS.toLowerCase();
var _RouterTradeAdapter = class _RouterTradeAdapter {
  // Generate a RouterTrade using fields from a classic quote response
  static fromClassicQuote(quote) {
    const { route, tokenIn, tokenOut } = quote;
    if (!route) throw new Error("Expected route to be present");
    if (!route.length) throw new Error("Expected there to be at least one route");
    if (route.some((r) => !r.length)) throw new Error("Expected all routes to have at least one pool");
    const firstRoute = route[0];
    const tokenInData = firstRoute[0].tokenIn;
    const tokenOutData = firstRoute[firstRoute.length - 1].tokenOut;
    if (!tokenInData || !tokenOutData) throw new Error("Expected both tokenIn and tokenOut to be present");
    if (tokenInData.chainId !== tokenOutData.chainId)
      throw new Error("Expected tokenIn and tokenOut to be have same chainId");
    const parsedCurrencyIn = _RouterTradeAdapter.toCurrency(isNativeCurrency(tokenIn), tokenInData);
    const parsedCurrencyOut = _RouterTradeAdapter.toCurrency(isNativeCurrency(tokenOut), tokenOutData);
    const typedRoutes = route.map((subRoute) => {
      const rawAmountIn = subRoute[0].amountIn;
      const rawAmountOut = subRoute[subRoute.length - 1].amountOut;
      if (!rawAmountIn || !rawAmountOut) {
        throw new Error("Expected both raw amountIn and raw amountOut to be present");
      }
      const inputAmount = CurrencyAmount.fromRawAmount(parsedCurrencyIn, rawAmountIn);
      const outputAmount = CurrencyAmount.fromRawAmount(parsedCurrencyOut, rawAmountOut);
      const isOnlyV2 = _RouterTradeAdapter.isVersionedRoute("v2-pool" /* V2Pool */, subRoute);
      const isOnlyV3 = _RouterTradeAdapter.isVersionedRoute("v3-pool" /* V3Pool */, subRoute);
      const isOnlyV4 = _RouterTradeAdapter.isVersionedRoute("v4-pool" /* V4Pool */, subRoute);
      return {
        routev4: isOnlyV4 ? new Route2(
          subRoute.map(_RouterTradeAdapter.toV4Pool),
          parsedCurrencyIn,
          parsedCurrencyOut
        ) : null,
        routev3: isOnlyV3 ? new Route(
          subRoute.map(_RouterTradeAdapter.toV3Pool),
          parsedCurrencyIn,
          parsedCurrencyOut
        ) : null,
        routev2: isOnlyV2 ? new Route3(
          subRoute.map(_RouterTradeAdapter.toPair),
          parsedCurrencyIn,
          parsedCurrencyOut
        ) : null,
        mixedRoute: !isOnlyV4 && !isOnlyV3 && !isOnlyV2 ? new MixedRouteSDK(subRoute.map(_RouterTradeAdapter.toPoolOrPair), parsedCurrencyIn, parsedCurrencyOut) : null,
        inputAmount,
        outputAmount
      };
    });
    return new Trade4({
      v2Routes: typedRoutes.filter((route2) => route2.routev2).map((route2) => ({
        routev2: route2.routev2,
        inputAmount: route2.inputAmount,
        outputAmount: route2.outputAmount
      })),
      v3Routes: typedRoutes.filter((route2) => route2.routev3).map((route2) => ({
        routev3: route2.routev3,
        inputAmount: route2.inputAmount,
        outputAmount: route2.outputAmount
      })),
      v4Routes: typedRoutes.filter((route2) => route2.routev4).map((route2) => ({
        routev4: route2.routev4,
        inputAmount: route2.inputAmount,
        outputAmount: route2.outputAmount
      })),
      mixedRoutes: typedRoutes.filter((route2) => route2.mixedRoute).map((route2) => ({
        mixedRoute: route2.mixedRoute,
        inputAmount: route2.inputAmount,
        outputAmount: route2.outputAmount
      })),
      tradeType: quote.tradeType
    });
  }
  static toCurrency(isNative, token) {
    if (isNative) {
      return Ether.onChain(token.chainId);
    }
    return this.toToken(token);
  }
  static toToken(token) {
    const { chainId, address, decimals, symbol, buyFeeBps, sellFeeBps } = token;
    return new Token(
      chainId,
      address,
      parseInt(decimals.toString()),
      symbol,
      /* name */
      void 0,
      false,
      buyFeeBps ? BigNumber$1.from(buyFeeBps) : void 0,
      sellFeeBps ? BigNumber$1.from(sellFeeBps) : void 0
    );
  }
  static toV3Pool({ fee, sqrtRatioX96, liquidity, tickCurrent, tokenIn, tokenOut }) {
    return new Pool(
      _RouterTradeAdapter.toToken(tokenIn),
      _RouterTradeAdapter.toToken(tokenOut),
      parseInt(fee),
      sqrtRatioX96,
      liquidity,
      parseInt(tickCurrent)
    );
  }
  static toV4Pool(pool) {
    const parsedCurrencyIn = _RouterTradeAdapter.toCurrency(isNativeCurrency(pool.tokenIn.address), pool.tokenIn);
    const parsedCurrencyOut = _RouterTradeAdapter.toCurrency(isNativeCurrency(pool.tokenOut.address), pool.tokenOut);
    return new Pool2(
      parsedCurrencyIn,
      parsedCurrencyOut,
      parseInt(pool.fee),
      parseInt(pool.tickSpacing),
      pool.hooks,
      pool.sqrtRatioX96,
      pool.liquidity,
      parseInt(pool.tickCurrent)
    );
  }
  static isVersionedRoute(type, route) {
    return route.every((pool) => pool.type === type);
  }
};
_RouterTradeAdapter.toPoolOrPair = (pool) => {
  switch (pool.type) {
    case "v4-pool" /* V4Pool */:
      return _RouterTradeAdapter.toV4Pool(pool);
    case "v3-pool" /* V3Pool */:
      return _RouterTradeAdapter.toV3Pool(pool);
    case "v2-pool" /* V2Pool */:
      return _RouterTradeAdapter.toPair(pool);
    default:
      throw new Error("Invalid pool type");
  }
};
_RouterTradeAdapter.toPair = ({ reserve0, reserve1 }) => {
  return new Pair(
    CurrencyAmount.fromRawAmount(_RouterTradeAdapter.toToken(reserve0.token), reserve0.quotient),
    CurrencyAmount.fromRawAmount(_RouterTradeAdapter.toToken(reserve1.token), reserve1.quotient)
  );
};
var RouterTradeAdapter = _RouterTradeAdapter;
var _CommandParser = class _CommandParser {
  static parseCalldata(calldata) {
    const genericParser = new GenericCommandParser(COMMAND_DEFINITION);
    const txDescription = _CommandParser.INTERFACE.parseTransaction({ data: calldata });
    const { commands, inputs } = txDescription.args;
    return genericParser.parse(commands, inputs);
  }
};
_CommandParser.INTERFACE = new Interface(UniversalRouter.abi);
var CommandParser = _CommandParser;
var GenericCommandParser = class _GenericCommandParser {
  constructor(commandDefinition) {
    this.commandDefinition = commandDefinition;
  }
  parse(commands, inputs) {
    const commandTypes = _GenericCommandParser.getCommands(commands);
    return {
      commands: commandTypes.map((commandType, i) => {
        const commandDef = this.commandDefinition[commandType];
        if (commandDef.parser === 1 /* V4Actions */) {
          const { actions } = V4BaseActionsParser.parseCalldata(inputs[i]);
          return {
            commandName: CommandType[commandType],
            commandType,
            params: v4RouterCallToParams(actions)
          };
        } else if (commandDef.parser === 0 /* Abi */) {
          const abiDef = commandDef.params;
          const rawParams = ethers.utils.defaultAbiCoder.decode(
            abiDef.map((command) => command.type),
            inputs[i]
          );
          const params = rawParams.map((param, j) => {
            switch (abiDef[j].subparser) {
              case 0 /* V3PathExactIn */:
                return {
                  name: abiDef[j].name,
                  value: parseV3PathExactIn(param)
                };
              case 1 /* V3PathExactOut */:
                return {
                  name: abiDef[j].name,
                  value: parseV3PathExactOut(param)
                };
              default:
                return {
                  name: abiDef[j].name,
                  value: param
                };
            }
          });
          return {
            commandName: CommandType[commandType],
            commandType,
            params
          };
        } else if (commandDef.parser === 2 /* V3Actions */) {
          return {
            commandName: CommandType[commandType],
            commandType,
            params: inputs.map((input) => ({ name: "command", value: input }))
          };
        } else {
          throw new Error(`Unsupported parser: ${commandDef}`);
        }
      })
    };
  }
  // parse command types from bytes string
  static getCommands(commands) {
    const commandTypes = [];
    for (let i = 2; i < commands.length; i += 2) {
      const byte = commands.substring(i, i + 2);
      commandTypes.push(parseInt(byte, 16));
    }
    return commandTypes;
  }
};
function parseV3PathExactIn(path) {
  const strippedPath = path.replace("0x", "");
  let tokenIn = ethers.utils.getAddress(strippedPath.substring(0, 40));
  let loc = 40;
  const res = [];
  while (loc < strippedPath.length) {
    const feeAndTokenOut = strippedPath.substring(loc, loc + 46);
    const fee = parseInt(feeAndTokenOut.substring(0, 6), 16);
    const tokenOut = ethers.utils.getAddress(feeAndTokenOut.substring(6, 46));
    res.push({
      tokenIn,
      tokenOut,
      fee
    });
    tokenIn = tokenOut;
    loc += 46;
  }
  return res;
}
function parseV3PathExactOut(path) {
  const strippedPath = path.replace("0x", "");
  let tokenIn = ethers.utils.getAddress(strippedPath.substring(strippedPath.length - 40));
  let loc = strippedPath.length - 86;
  const res = [];
  while (loc >= 0) {
    const feeAndTokenOut = strippedPath.substring(loc, loc + 46);
    const tokenOut = ethers.utils.getAddress(feeAndTokenOut.substring(0, 40));
    const fee = parseInt(feeAndTokenOut.substring(40, 46), 16);
    res.push({
      tokenIn,
      tokenOut,
      fee
    });
    tokenIn = tokenOut;
    loc -= 46;
  }
  return res;
}
function v4RouterCallToParams(actions) {
  return actions.map((action) => {
    return {
      name: action.actionName,
      value: action.params.map((param) => {
        return {
          name: param.name,
          value: param.value
        };
      })
    };
  });
}

export { COMMAND_DEFINITION, CommandParser, CommandType, GenericCommandParser, Parser, PoolType, ROUTER_AS_RECIPIENT, RoutePlanner, RouterActionType, RouterTradeAdapter, Subparser2 as Subparser, SwapRouter, UNIVERSAL_ROUTER_ADDRESS, UNIVERSAL_ROUTER_CREATION_BLOCK, UniswapTrade, UniversalRouterVersion, UnwrapWETH, WETH_ADDRESS, isNativeCurrency };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map