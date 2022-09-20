'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var ethers = require('ethers');
var bytes = require('@ethersproject/bytes');
var abi = require('@ethersproject/abi');
var invariant = _interopDefault(require('tiny-invariant'));

var _, _2;

var PERMIT_POST_MAPPING = {
  1: '0x0000000000000000000000000000000000000000',
  12341234: '0xFD6D23eE2b6b136E34572fc80cbCd33E9787705e'
};
var ORDER_QUOTER_MAPPING = {
  1: '0x0000000000000000000000000000000000000000',
  12341234: '0x1D13fF25b10C9a6741DFdce229073bed652197c7'
};
var OrderType;

(function (OrderType) {
  OrderType["DutchLimit"] = "DutchLimit";
})(OrderType || (OrderType = {}));

var REACTOR_ADDRESS_MAPPING = {
  1: (_ = {}, _[OrderType.DutchLimit] = '0x0000000000000000000000000000000000000000', _),
  12341234: (_2 = {}, _2[OrderType.DutchLimit] = '0x4DAf17c8142A483B2E2348f56ae0F2cFDAe22ceE', _2)
};
var REVERSE_REACTOR_MAPPING = /*#__PURE__*/Object.entries(REACTOR_ADDRESS_MAPPING).reduce(function (acc, _ref) {
  var chainId = _ref[0],
      orderTypes = _ref[1];

  for (var _i = 0, _Object$entries = Object.entries(orderTypes); _i < _Object$entries.length; _i++) {
    var _Object$entries$_i = _Object$entries[_i],
        orderType = _Object$entries$_i[0],
        reactorAddress = _Object$entries$_i[1];
    // lowercase for consistency when parsing orders
    acc[reactorAddress.toLowerCase()] = {
      chainId: parseInt(chainId),
      orderType: OrderType[orderType]
    };
  }

  return acc;
}, {});

function _regeneratorRuntime() {
  /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/facebook/regenerator/blob/main/LICENSE */

  _regeneratorRuntime = function () {
    return exports;
  };

  var exports = {},
      Op = Object.prototype,
      hasOwn = Op.hasOwnProperty,
      $Symbol = "function" == typeof Symbol ? Symbol : {},
      iteratorSymbol = $Symbol.iterator || "@@iterator",
      asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator",
      toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag";

  function define(obj, key, value) {
    return Object.defineProperty(obj, key, {
      value: value,
      enumerable: !0,
      configurable: !0,
      writable: !0
    }), obj[key];
  }

  try {
    define({}, "");
  } catch (err) {
    define = function (obj, key, value) {
      return obj[key] = value;
    };
  }

  function wrap(innerFn, outerFn, self, tryLocsList) {
    var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator,
        generator = Object.create(protoGenerator.prototype),
        context = new Context(tryLocsList || []);
    return generator._invoke = function (innerFn, self, context) {
      var state = "suspendedStart";
      return function (method, arg) {
        if ("executing" === state) throw new Error("Generator is already running");

        if ("completed" === state) {
          if ("throw" === method) throw arg;
          return doneResult();
        }

        for (context.method = method, context.arg = arg;;) {
          var delegate = context.delegate;

          if (delegate) {
            var delegateResult = maybeInvokeDelegate(delegate, context);

            if (delegateResult) {
              if (delegateResult === ContinueSentinel) continue;
              return delegateResult;
            }
          }

          if ("next" === context.method) context.sent = context._sent = context.arg;else if ("throw" === context.method) {
            if ("suspendedStart" === state) throw state = "completed", context.arg;
            context.dispatchException(context.arg);
          } else "return" === context.method && context.abrupt("return", context.arg);
          state = "executing";
          var record = tryCatch(innerFn, self, context);

          if ("normal" === record.type) {
            if (state = context.done ? "completed" : "suspendedYield", record.arg === ContinueSentinel) continue;
            return {
              value: record.arg,
              done: context.done
            };
          }

          "throw" === record.type && (state = "completed", context.method = "throw", context.arg = record.arg);
        }
      };
    }(innerFn, self, context), generator;
  }

  function tryCatch(fn, obj, arg) {
    try {
      return {
        type: "normal",
        arg: fn.call(obj, arg)
      };
    } catch (err) {
      return {
        type: "throw",
        arg: err
      };
    }
  }

  exports.wrap = wrap;
  var ContinueSentinel = {};

  function Generator() {}

  function GeneratorFunction() {}

  function GeneratorFunctionPrototype() {}

  var IteratorPrototype = {};
  define(IteratorPrototype, iteratorSymbol, function () {
    return this;
  });
  var getProto = Object.getPrototypeOf,
      NativeIteratorPrototype = getProto && getProto(getProto(values([])));
  NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol) && (IteratorPrototype = NativeIteratorPrototype);
  var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype);

  function defineIteratorMethods(prototype) {
    ["next", "throw", "return"].forEach(function (method) {
      define(prototype, method, function (arg) {
        return this._invoke(method, arg);
      });
    });
  }

  function AsyncIterator(generator, PromiseImpl) {
    function invoke(method, arg, resolve, reject) {
      var record = tryCatch(generator[method], generator, arg);

      if ("throw" !== record.type) {
        var result = record.arg,
            value = result.value;
        return value && "object" == typeof value && hasOwn.call(value, "__await") ? PromiseImpl.resolve(value.__await).then(function (value) {
          invoke("next", value, resolve, reject);
        }, function (err) {
          invoke("throw", err, resolve, reject);
        }) : PromiseImpl.resolve(value).then(function (unwrapped) {
          result.value = unwrapped, resolve(result);
        }, function (error) {
          return invoke("throw", error, resolve, reject);
        });
      }

      reject(record.arg);
    }

    var previousPromise;

    this._invoke = function (method, arg) {
      function callInvokeWithMethodAndArg() {
        return new PromiseImpl(function (resolve, reject) {
          invoke(method, arg, resolve, reject);
        });
      }

      return previousPromise = previousPromise ? previousPromise.then(callInvokeWithMethodAndArg, callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg();
    };
  }

  function maybeInvokeDelegate(delegate, context) {
    var method = delegate.iterator[context.method];

    if (undefined === method) {
      if (context.delegate = null, "throw" === context.method) {
        if (delegate.iterator.return && (context.method = "return", context.arg = undefined, maybeInvokeDelegate(delegate, context), "throw" === context.method)) return ContinueSentinel;
        context.method = "throw", context.arg = new TypeError("The iterator does not provide a 'throw' method");
      }

      return ContinueSentinel;
    }

    var record = tryCatch(method, delegate.iterator, context.arg);
    if ("throw" === record.type) return context.method = "throw", context.arg = record.arg, context.delegate = null, ContinueSentinel;
    var info = record.arg;
    return info ? info.done ? (context[delegate.resultName] = info.value, context.next = delegate.nextLoc, "return" !== context.method && (context.method = "next", context.arg = undefined), context.delegate = null, ContinueSentinel) : info : (context.method = "throw", context.arg = new TypeError("iterator result is not an object"), context.delegate = null, ContinueSentinel);
  }

  function pushTryEntry(locs) {
    var entry = {
      tryLoc: locs[0]
    };
    1 in locs && (entry.catchLoc = locs[1]), 2 in locs && (entry.finallyLoc = locs[2], entry.afterLoc = locs[3]), this.tryEntries.push(entry);
  }

  function resetTryEntry(entry) {
    var record = entry.completion || {};
    record.type = "normal", delete record.arg, entry.completion = record;
  }

  function Context(tryLocsList) {
    this.tryEntries = [{
      tryLoc: "root"
    }], tryLocsList.forEach(pushTryEntry, this), this.reset(!0);
  }

  function values(iterable) {
    if (iterable) {
      var iteratorMethod = iterable[iteratorSymbol];
      if (iteratorMethod) return iteratorMethod.call(iterable);
      if ("function" == typeof iterable.next) return iterable;

      if (!isNaN(iterable.length)) {
        var i = -1,
            next = function next() {
          for (; ++i < iterable.length;) if (hasOwn.call(iterable, i)) return next.value = iterable[i], next.done = !1, next;

          return next.value = undefined, next.done = !0, next;
        };

        return next.next = next;
      }
    }

    return {
      next: doneResult
    };
  }

  function doneResult() {
    return {
      value: undefined,
      done: !0
    };
  }

  return GeneratorFunction.prototype = GeneratorFunctionPrototype, define(Gp, "constructor", GeneratorFunctionPrototype), define(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = define(GeneratorFunctionPrototype, toStringTagSymbol, "GeneratorFunction"), exports.isGeneratorFunction = function (genFun) {
    var ctor = "function" == typeof genFun && genFun.constructor;
    return !!ctor && (ctor === GeneratorFunction || "GeneratorFunction" === (ctor.displayName || ctor.name));
  }, exports.mark = function (genFun) {
    return Object.setPrototypeOf ? Object.setPrototypeOf(genFun, GeneratorFunctionPrototype) : (genFun.__proto__ = GeneratorFunctionPrototype, define(genFun, toStringTagSymbol, "GeneratorFunction")), genFun.prototype = Object.create(Gp), genFun;
  }, exports.awrap = function (arg) {
    return {
      __await: arg
    };
  }, defineIteratorMethods(AsyncIterator.prototype), define(AsyncIterator.prototype, asyncIteratorSymbol, function () {
    return this;
  }), exports.AsyncIterator = AsyncIterator, exports.async = function (innerFn, outerFn, self, tryLocsList, PromiseImpl) {
    void 0 === PromiseImpl && (PromiseImpl = Promise);
    var iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList), PromiseImpl);
    return exports.isGeneratorFunction(outerFn) ? iter : iter.next().then(function (result) {
      return result.done ? result.value : iter.next();
    });
  }, defineIteratorMethods(Gp), define(Gp, toStringTagSymbol, "Generator"), define(Gp, iteratorSymbol, function () {
    return this;
  }), define(Gp, "toString", function () {
    return "[object Generator]";
  }), exports.keys = function (object) {
    var keys = [];

    for (var key in object) keys.push(key);

    return keys.reverse(), function next() {
      for (; keys.length;) {
        var key = keys.pop();
        if (key in object) return next.value = key, next.done = !1, next;
      }

      return next.done = !0, next;
    };
  }, exports.values = values, Context.prototype = {
    constructor: Context,
    reset: function (skipTempReset) {
      if (this.prev = 0, this.next = 0, this.sent = this._sent = undefined, this.done = !1, this.delegate = null, this.method = "next", this.arg = undefined, this.tryEntries.forEach(resetTryEntry), !skipTempReset) for (var name in this) "t" === name.charAt(0) && hasOwn.call(this, name) && !isNaN(+name.slice(1)) && (this[name] = undefined);
    },
    stop: function () {
      this.done = !0;
      var rootRecord = this.tryEntries[0].completion;
      if ("throw" === rootRecord.type) throw rootRecord.arg;
      return this.rval;
    },
    dispatchException: function (exception) {
      if (this.done) throw exception;
      var context = this;

      function handle(loc, caught) {
        return record.type = "throw", record.arg = exception, context.next = loc, caught && (context.method = "next", context.arg = undefined), !!caught;
      }

      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i],
            record = entry.completion;
        if ("root" === entry.tryLoc) return handle("end");

        if (entry.tryLoc <= this.prev) {
          var hasCatch = hasOwn.call(entry, "catchLoc"),
              hasFinally = hasOwn.call(entry, "finallyLoc");

          if (hasCatch && hasFinally) {
            if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0);
            if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc);
          } else if (hasCatch) {
            if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0);
          } else {
            if (!hasFinally) throw new Error("try statement without catch or finally");
            if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc);
          }
        }
      }
    },
    abrupt: function (type, arg) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];

        if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) {
          var finallyEntry = entry;
          break;
        }
      }

      finallyEntry && ("break" === type || "continue" === type) && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc && (finallyEntry = null);
      var record = finallyEntry ? finallyEntry.completion : {};
      return record.type = type, record.arg = arg, finallyEntry ? (this.method = "next", this.next = finallyEntry.finallyLoc, ContinueSentinel) : this.complete(record);
    },
    complete: function (record, afterLoc) {
      if ("throw" === record.type) throw record.arg;
      return "break" === record.type || "continue" === record.type ? this.next = record.arg : "return" === record.type ? (this.rval = this.arg = record.arg, this.method = "return", this.next = "end") : "normal" === record.type && afterLoc && (this.next = afterLoc), ContinueSentinel;
    },
    finish: function (finallyLoc) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.finallyLoc === finallyLoc) return this.complete(entry.completion, entry.afterLoc), resetTryEntry(entry), ContinueSentinel;
      }
    },
    catch: function (tryLoc) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];

        if (entry.tryLoc === tryLoc) {
          var record = entry.completion;

          if ("throw" === record.type) {
            var thrown = record.arg;
            resetTryEntry(entry);
          }

          return thrown;
        }
      }

      throw new Error("illegal catch attempt");
    },
    delegateYield: function (iterable, resultName, nextLoc) {
      return this.delegate = {
        iterator: values(iterable),
        resultName: resultName,
        nextLoc: nextLoc
      }, "next" === this.method && (this.arg = undefined), ContinueSentinel;
    }
  }, exports;
}

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
  try {
    var info = gen[key](arg);
    var value = info.value;
  } catch (error) {
    reject(error);
    return;
  }

  if (info.done) {
    resolve(value);
  } else {
    Promise.resolve(value).then(_next, _throw);
  }
}

function _asyncToGenerator(fn) {
  return function () {
    var self = this,
        args = arguments;
    return new Promise(function (resolve, reject) {
      var gen = fn.apply(self, args);

      function _next(value) {
        asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
      }

      function _throw(err) {
        asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
      }

      _next(undefined);
    });
  };
}

function _defineProperties(target, props) {
  for (var i = 0; i < props.length; i++) {
    var descriptor = props[i];
    descriptor.enumerable = descriptor.enumerable || false;
    descriptor.configurable = true;
    if ("value" in descriptor) descriptor.writable = true;
    Object.defineProperty(target, descriptor.key, descriptor);
  }
}

function _createClass(Constructor, protoProps, staticProps) {
  if (protoProps) _defineProperties(Constructor.prototype, protoProps);
  if (staticProps) _defineProperties(Constructor, staticProps);
  Object.defineProperty(Constructor, "prototype", {
    writable: false
  });
  return Constructor;
}

function _inheritsLoose(subClass, superClass) {
  subClass.prototype = Object.create(superClass.prototype);
  subClass.prototype.constructor = subClass;

  _setPrototypeOf(subClass, superClass);
}

function _getPrototypeOf(o) {
  _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function _getPrototypeOf(o) {
    return o.__proto__ || Object.getPrototypeOf(o);
  };
  return _getPrototypeOf(o);
}

function _setPrototypeOf(o, p) {
  _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf(o, p) {
    o.__proto__ = p;
    return o;
  };
  return _setPrototypeOf(o, p);
}

function _isNativeReflectConstruct() {
  if (typeof Reflect === "undefined" || !Reflect.construct) return false;
  if (Reflect.construct.sham) return false;
  if (typeof Proxy === "function") return true;

  try {
    Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {}));
    return true;
  } catch (e) {
    return false;
  }
}

function _construct(Parent, args, Class) {
  if (_isNativeReflectConstruct()) {
    _construct = Reflect.construct.bind();
  } else {
    _construct = function _construct(Parent, args, Class) {
      var a = [null];
      a.push.apply(a, args);
      var Constructor = Function.bind.apply(Parent, a);
      var instance = new Constructor();
      if (Class) _setPrototypeOf(instance, Class.prototype);
      return instance;
    };
  }

  return _construct.apply(null, arguments);
}

function _isNativeFunction(fn) {
  return Function.toString.call(fn).indexOf("[native code]") !== -1;
}

function _wrapNativeSuper(Class) {
  var _cache = typeof Map === "function" ? new Map() : undefined;

  _wrapNativeSuper = function _wrapNativeSuper(Class) {
    if (Class === null || !_isNativeFunction(Class)) return Class;

    if (typeof Class !== "function") {
      throw new TypeError("Super expression must either be null or a function");
    }

    if (typeof _cache !== "undefined") {
      if (_cache.has(Class)) return _cache.get(Class);

      _cache.set(Class, Wrapper);
    }

    function Wrapper() {
      return _construct(Class, arguments, _getPrototypeOf(this).constructor);
    }

    Wrapper.prototype = Object.create(Class.prototype, {
      constructor: {
        value: Wrapper,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
    return _setPrototypeOf(Wrapper, Class);
  };

  return _wrapNativeSuper(Class);
}

function _assertThisInitialized(self) {
  if (self === void 0) {
    throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
  }

  return self;
}

var MissingConfiguration = /*#__PURE__*/function (_Error) {
  _inheritsLoose(MissingConfiguration, _Error);

  function MissingConfiguration(key, value) {
    var _this;

    _this = _Error.call(this, "Missing configuration for " + key + ": " + value) || this;
    Object.setPrototypeOf(_assertThisInitialized(_this), MissingConfiguration.prototype);
    return _this;
  }

  return MissingConfiguration;
}( /*#__PURE__*/_wrapNativeSuper(Error));

var DOMAIN_NAME = 'PermitPost';
var DOMAIN_VERSION = '1';

(function (TokenType) {
  TokenType[TokenType["ERC20"] = 0] = "ERC20";
  TokenType[TokenType["ERC721"] = 1] = "ERC721";
  TokenType[TokenType["ERC1155"] = 2] = "ERC1155";
})(exports.TokenType || (exports.TokenType = {}));

(function (SigType) {
  SigType[SigType["Unordered"] = 0] = "Unordered";
  SigType[SigType["Ordered"] = 1] = "Ordered";
})(exports.SigType || (exports.SigType = {}));

var PermitPost = /*#__PURE__*/function () {
  function PermitPost(chainId, address) {
    this.chainId = void 0;
    this.permitPostAddress = void 0;
    this.chainId = chainId;

    if (address) {
      this.permitPostAddress = address;
    } else if (PERMIT_POST_MAPPING[chainId]) {
      this.permitPostAddress = PERMIT_POST_MAPPING[chainId];
    } else {
      throw new MissingConfiguration('permitPost', chainId.toString());
    }
  }

  var _proto = PermitPost.prototype;

  _proto.getPermitData = function getPermitData(info) {
    return {
      domain: this.domain,
      types: this.types,
      values: info
    };
  };

  _proto.getPermitDigest = function getPermitDigest(info) {
    return ethers.ethers.utils._TypedDataEncoder.hash(this.domain, this.types, info);
  };

  _createClass(PermitPost, [{
    key: "domain",
    get: function get() {
      return {
        name: DOMAIN_NAME,
        version: DOMAIN_VERSION,
        chainId: this.chainId,
        verifyingContract: this.permitPostAddress
      };
    }
  }, {
    key: "types",
    get: function get() {
      return {
        Permit: [{
          name: 'sigType',
          type: 'uint8'
        }, {
          name: 'tokens',
          type: 'TokenDetails[]'
        }, {
          name: 'spender',
          type: 'address'
        }, {
          name: 'deadline',
          type: 'uint256'
        }, {
          name: 'witness',
          type: 'bytes32'
        }, {
          name: 'nonce',
          type: 'uint256'
        }],
        TokenDetails: [{
          name: 'tokenType',
          type: 'uint8'
        }, {
          name: 'token',
          type: 'address'
        }, {
          name: 'maxAmount',
          type: 'uint256'
        }, {
          name: 'id',
          type: 'uint256'
        }]
      };
    }
  }]);

  return PermitPost;
}();

var deploylessMulticall2Abi = [
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

var multicall2Abi = [
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
		inputs: [
		],
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
		inputs: [
		],
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
		inputs: [
		],
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
		inputs: [
		],
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
		inputs: [
		],
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
		inputs: [
		],
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

var _abi = [{
  inputs: [{
    internalType: "address",
    name: "_permitPost",
    type: "address"
  }],
  stateMutability: "nonpayable",
  type: "constructor"
}, {
  inputs: [],
  name: "DeadlineBeforeEndTime",
  type: "error"
}, {
  inputs: [],
  name: "DeadlinePassed",
  type: "error"
}, {
  inputs: [],
  name: "EndTimeBeforeStart",
  type: "error"
}, {
  inputs: [],
  name: "InvalidReactor",
  type: "error"
}, {
  inputs: [],
  name: "OrderAlreadyFilled",
  type: "error"
}, {
  inputs: [],
  name: "OrderCancelled",
  type: "error"
}, {
  anonymous: false,
  inputs: [{
    indexed: false,
    internalType: "bytes32",
    name: "orderHash",
    type: "bytes32"
  }, {
    indexed: false,
    internalType: "address",
    name: "filler",
    type: "address"
  }],
  name: "Fill",
  type: "event"
}, {
  inputs: [{
    components: [{
      internalType: "bytes",
      name: "order",
      type: "bytes"
    }, {
      components: [{
        internalType: "uint8",
        name: "v",
        type: "uint8"
      }, {
        internalType: "bytes32",
        name: "r",
        type: "bytes32"
      }, {
        internalType: "bytes32",
        name: "s",
        type: "bytes32"
      }],
      internalType: "struct Signature",
      name: "sig",
      type: "tuple"
    }],
    internalType: "struct SignedOrder",
    name: "order",
    type: "tuple"
  }, {
    internalType: "address",
    name: "fillContract",
    type: "address"
  }, {
    internalType: "bytes",
    name: "fillData",
    type: "bytes"
  }],
  name: "execute",
  outputs: [],
  stateMutability: "nonpayable",
  type: "function"
}, {
  inputs: [{
    components: [{
      internalType: "bytes",
      name: "order",
      type: "bytes"
    }, {
      components: [{
        internalType: "uint8",
        name: "v",
        type: "uint8"
      }, {
        internalType: "bytes32",
        name: "r",
        type: "bytes32"
      }, {
        internalType: "bytes32",
        name: "s",
        type: "bytes32"
      }],
      internalType: "struct Signature",
      name: "sig",
      type: "tuple"
    }],
    internalType: "struct SignedOrder[]",
    name: "orders",
    type: "tuple[]"
  }, {
    internalType: "address",
    name: "fillContract",
    type: "address"
  }, {
    internalType: "bytes",
    name: "fillData",
    type: "bytes"
  }],
  name: "executeBatch",
  outputs: [],
  stateMutability: "nonpayable",
  type: "function"
}, {
  inputs: [{
    internalType: "bytes32",
    name: "",
    type: "bytes32"
  }],
  name: "orderStatus",
  outputs: [{
    internalType: "bool",
    name: "isCancelled",
    type: "bool"
  }, {
    internalType: "bool",
    name: "isFilled",
    type: "bool"
  }],
  stateMutability: "view",
  type: "function"
}, {
  inputs: [],
  name: "permitPost",
  outputs: [{
    internalType: "contract IPermitPost",
    name: "",
    type: "address"
  }],
  stateMutability: "view",
  type: "function"
}, {
  inputs: [{
    internalType: "bytes",
    name: "order",
    type: "bytes"
  }],
  name: "resolve",
  outputs: [{
    components: [{
      components: [{
        internalType: "address",
        name: "reactor",
        type: "address"
      }, {
        internalType: "uint256",
        name: "nonce",
        type: "uint256"
      }, {
        internalType: "uint256",
        name: "deadline",
        type: "uint256"
      }],
      internalType: "struct OrderInfo",
      name: "info",
      type: "tuple"
    }, {
      components: [{
        internalType: "address",
        name: "token",
        type: "address"
      }, {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }],
      internalType: "struct TokenAmount",
      name: "input",
      type: "tuple"
    }, {
      components: [{
        internalType: "address",
        name: "token",
        type: "address"
      }, {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }, {
        internalType: "address",
        name: "recipient",
        type: "address"
      }],
      internalType: "struct Output[]",
      name: "outputs",
      type: "tuple[]"
    }],
    internalType: "struct ResolvedOrder",
    name: "resolvedOrder",
    type: "tuple"
  }],
  stateMutability: "view",
  type: "function"
}];
var _bytecode = "0x60a060405234801561001057600080fd5b506040516116ee3803806116ee83398101604081905261002f91610040565b6001600160a01b0316608052610070565b60006020828403121561005257600080fd5b81516001600160a01b038116811461006957600080fd5b9392505050565b60805161165d6100916000396000818160f10152610be0015261165d6000f3fe608060405234801561001057600080fd5b50600436106100575760003560e01c80632dff692d1461005c57806386114adf146100a45780638bcaadbd146100b9578063e4056186146100cc578063f45d6b23146100ec575b600080fd5b61008861006a366004610d4a565b60006020819052908152604090205460ff8082169161010090041682565b6040805192151583529015156020830152015b60405180910390f35b6100b76100b2366004610dc7565b61012b565b005b6100b76100c7366004610e78565b61036a565b6100df6100da366004610ef7565b6104b8565b60405161009b9190610fe0565b6101137f000000000000000000000000000000000000000000000000000000000000000081565b6040516001600160a01b03909116815260200161009b565b6000846001600160401b0381111561014557610145610ffa565b60405190808252806020026020018201604052801561017e57816020015b61016b610d00565b8152602001906001900390816101635790505b5090506000856001600160401b0381111561019b5761019b610ffa565b6040519080825280602002602001820160405280156101c4578160200160208202803683370190505b5090506000866001600160401b038111156101e1576101e1610ffa565b60405190808252806020026020018201604052801561022c57816020015b60408051606081018252600080825260208083018290529282015282526000199092019101816101ff5790505b50905060005b878110156103515761026b89898381811061024f5761024f611010565b90506020028101906102619190611026565b6100da9080611046565b84828151811061027d5761027d611010565b602002602001018190525088888281811061029a5761029a611010565b90506020028101906102ac9190611026565b6102b69080611046565b6040516102c492919061108c565b60405180910390208382815181106102de576102de611010565b6020026020010181815250508888828181106102fc576102fc611010565b905060200281019061030e9190611026565b6020018036038101906103219190611138565b82828151811061033357610333611010565b60200260200101819052508080610349906111b5565b915050610232565b506103608382848989896106a5565b5050505050505050565b604080516001808252818301909252600091816020015b610389610d00565b8152602001906001900390816103815790505090506103ab6100da8680611046565b816000815181106103be576103be611010565b60209081029190910101526040805160018082528183019092526000918160200160208202803683370190505090506103f78680611046565b60405161040592919061108c565b60405180910390208160008151811061042057610420611010565b6020908102919091010152604080516001808252818301909252600091816020015b604080516060810182526000808252602080830182905292820152825260001990920191018161044257905050905061048336889003880160208901611138565b8160008151811061049657610496611010565b60200260200101819052506104af8382848989896106a5565b50505050505050565b6104c0610d00565b60006104ce838501856112e9565b90506104d98161094f565b60008160800151516001600160401b038111156104f8576104f8610ffa565b60405190808252806020026020018201604052801561054357816020015b60408051606081018252600080825260208083018290529282015282526000199092019101816105165790505b50905060005b81518110156106815760008360800151828151811061056a5761056a611010565b602002602001015190506000428560400151111580610590575081604001518260200151145b156105a05750604081015161061a565b428560200151106105b65750602081015161061a565b60008560200151426105c891906113bf565b90506000866020015187604001516105e091906113bf565b90506000846040015185602001516105f891906113bf565b90506106058184846109a7565b856020015161061491906113bf565b93505050505b604051806060016040528083600001516001600160a01b0316815260200182815260200183606001516001600160a01b031681525084848151811061066157610661611010565b602002602001018190525050508080610679906111b5565b915050610549565b50604080516060808201835284518252939093015160208401528201529392505050565b60005b8651811015610762576106d78782815181106106c6576106c6611010565b6020026020010151600001516109c6565b6106f98582815181106106ec576106ec611010565b6020026020010151610a15565b61075087828151811061070e5761070e611010565b602002602001015187838151811061072857610728611010565b602002602001015187848151811061074257610742611010565b602002602001015187610aa9565b8061075a816111b5565b9150506106a8565b506040516389930d2760e01b81526001600160a01b038416906389930d2790610793908990869086906004016113d8565b600060405180830381600087803b1580156107ad57600080fd5b505af11580156107c1573d6000803e3d6000fd5b5050505060005b86518110156104af5760005b8782815181106107e6576107e6611010565b602002602001015160400151518110156108d857600088838151811061080e5761080e611010565b602002602001015160400151828151811061082b5761082b611010565b60209081029190910181015180516040808301519383015190516323b872dd60e01b81526001600160a01b038b811660048301529485166024820152604481019190915291935091909116906323b872dd906064016020604051808303816000875af115801561089f573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906108c39190611462565b505080806108d0906111b5565b9150506107d4565b507fba7599121d7877246723714eb403e13928cdbebe980abf7c630c0f9bef83fce185828151811061090c5761090c611010565b6020026020010151336040516109359291909182526001600160a01b0316602082015260400190565b60405180910390a180610947816111b5565b9150506107c8565b806020015181604001511161097757604051630c0b96df60e21b815260040160405180910390fd5b806040015181600001516040015110156109a45760405163773a618760e01b815260040160405180910390fd5b50565b8282028115158415858304851417166109bf57600080fd5b0492915050565b80516001600160a01b031630146109f057604051631377d29960e21b815260040160405180910390fd5b80604001514211156109a45760405163387b2e5560e11b815260040160405180910390fd5b6000818152602081815260409182902082518084019093525460ff808216158015855261010090920416151591830191909152610a68576040516001622a81af60e21b0319815260040160405180910390fd5b806020015115610a8b5760405163ee3b3d4b60e01b815260040160405180910390fd5b506000908152602081905260409020805461ff001916610100179055565b60006040518060800160405280610ac38760200151610c5a565b8152306020820152865160409081015181830152606090910185905280516001808252818301909252919250600091908160200160208202803683370190505090508281600081518110610b1957610b19611010565b6001600160a01b039290921660209283029190910190910152604080516001808252818301909252600091816020016020820280368337019050509050600081600081518110610b6b57610b6b611010565b602090810291909101015260408051600180825281830190925260009181602001602082028036833701905050905087602001516020015181600081518110610bb657610bb6611010565b6020908102919091018101919091528851015160405163771d599360e11b81526001600160a01b037f0000000000000000000000000000000000000000000000000000000000000000169163ee3ab32691610c1e918891889188918891908f906004016114f8565b600060405180830381600087803b158015610c3857600080fd5b505af1158015610c4c573d6000803e3d6000fd5b505050505050505050505050565b604080516001808252818301909252606091816020015b604080516080810182526000808252602080830182905292820181905260608201528252600019909201910181610c71579050506040805160808101909152909150806000815260200183600001516001600160a01b0316815260200183602001518152602001600081525081600081518110610cf057610cf0611010565b6020026020010181905250919050565b6040805160c0810182526000606082018181526080830182905260a08301829052825282518084019093528083526020838101919091529091908201908152602001606081525090565b600060208284031215610d5c57600080fd5b5035919050565b80356001600160a01b0381168114610d7a57600080fd5b919050565b60008083601f840112610d9157600080fd5b5081356001600160401b03811115610da857600080fd5b602083019150836020828501011115610dc057600080fd5b9250929050565b600080600080600060608688031215610ddf57600080fd5b85356001600160401b0380821115610df657600080fd5b818801915088601f830112610e0a57600080fd5b813581811115610e1957600080fd5b8960208260051b8501011115610e2e57600080fd5b60208301975080965050610e4460208901610d63565b94506040880135915080821115610e5a57600080fd5b50610e6788828901610d7f565b969995985093965092949392505050565b60008060008060608587031215610e8e57600080fd5b84356001600160401b0380821115610ea557600080fd5b9086019060808289031215610eb957600080fd5b819550610ec860208801610d63565b94506040870135915080821115610ede57600080fd5b50610eeb87828801610d7f565b95989497509550505050565b60008060208385031215610f0a57600080fd5b82356001600160401b03811115610f2057600080fd5b610f2c85828601610d7f565b90969095509350505050565b600060c08301825160018060a01b038082511686526020808301518188015260408084015181890152818701519350606083855116818a01528285015160808a015281880151945060c060a08a015285855180885260e08b0191508487019750600096505b80871015610fd25787518051871683528581015186840152840151861684830152968401966001969096019590820190610f9d565b509998505050505050505050565b602081526000610ff36020830184610f38565b9392505050565b634e487b7160e01b600052604160045260246000fd5b634e487b7160e01b600052603260045260246000fd5b60008235607e1983360301811261103c57600080fd5b9190910192915050565b6000808335601e1984360301811261105d57600080fd5b8301803591506001600160401b0382111561107757600080fd5b602001915036819003821315610dc057600080fd5b8183823760009101908152919050565b604051608081016001600160401b03811182821017156110be576110be610ffa565b60405290565b60405160a081016001600160401b03811182821017156110be576110be610ffa565b604051606081016001600160401b03811182821017156110be576110be610ffa565b604051601f8201601f191681016001600160401b038111828210171561113057611130610ffa565b604052919050565b60006060828403121561114a57600080fd5b604051606081018181106001600160401b038211171561116c5761116c610ffa565b604052823560ff8116811461118057600080fd5b8152602083810135908201526040928301359281019290925250919050565b634e487b7160e01b600052601160045260246000fd5b6000600182016111c7576111c761119f565b5060010190565b6000604082840312156111e057600080fd5b604051604081018181106001600160401b038211171561120257611202610ffa565b60405290508061121183610d63565b8152602083013560208201525092915050565b600082601f83011261123557600080fd5b813560206001600160401b0382111561125057611250610ffa565b61125e818360051b01611108565b82815260079290921b8401810191818101908684111561127d57600080fd5b8286015b848110156112de576080818903121561129a5760008081fd5b6112a261109c565b6112ab82610d63565b815281850135858201526040808301359082015260606112cc818401610d63565b90820152835291830191608001611281565b509695505050505050565b6000602082840312156112fb57600080fd5b81356001600160401b038082111561131257600080fd5b9083019081850361010081121561132857600080fd5b6113306110c4565b606082121561133e57600080fd5b6113466110e6565b915061135184610d63565b82526020840135602083015260408401356040830152818152606084013560208201526080840135604082015261138b8760a086016111ce565b606082015260e08401359150828211156113a457600080fd5b6113b087838601611224565b60808201529695505050505050565b818103818111156113d2576113d261119f565b92915050565b6000604082016040835280865180835260608501915060608160051b8601019250602080890160005b8381101561142f57605f1988870301855261141d868351610f38565b95509382019390820190600101611401565b5050858403818701528684528688828601376000848801820152601f909601601f19169092019094019695505050505050565b60006020828403121561147457600080fd5b81518015158114610ff357600080fd5b600081518084526020808501945080840160005b838110156114bd5781516001600160a01b031687529582019590820190600101611498565b509495945050505050565b600081518084526020808501945080840160005b838110156114bd578151875295820195908201906001016114dc565b61010080825287516080918301829052805161018084018190526000926101a0850192602092908301919085805b8281101561158557845180516003811061154e57634e487b7160e01b84526021600452602484fd5b8852808701516001600160a01b03168789015260408082015190890152606090810151908801529583019593850193600101611526565b5050508b8301516001600160a01b038116610120880152915060408c015161014087015260608c0151610160870152858403838701526115c5848c611484565b935085840360408701526115d9848b6114c8565b935085840360608701526115ed848a6114c8565b908601889052865160ff1660a0870152602087015160c0870152604087015160e0870152935061161c92505050565b97965050505050505056fea2646970667358221220007f61157eb182a19c6bb2113e137404955ca2226bf9d03355ce8396ddeaa98764736f6c63430008100033";

var isSuperArgs = function isSuperArgs(xs) {
  return xs.length > 1;
};

var DutchLimitOrderReactor__factory = /*#__PURE__*/function (_ContractFactory) {
  _inheritsLoose(DutchLimitOrderReactor__factory, _ContractFactory);

  function DutchLimitOrderReactor__factory() {
    var _this;

    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    if (isSuperArgs(args)) {
      _this = _ContractFactory.call.apply(_ContractFactory, [this].concat(args)) || this;
    } else {
      _this = _ContractFactory.call(this, _abi, _bytecode, args[0]) || this;
    }

    return _assertThisInitialized(_this);
  }

  var _proto = DutchLimitOrderReactor__factory.prototype;

  _proto.deploy = function deploy(_permitPost, overrides) {
    return _ContractFactory.prototype.deploy.call(this, _permitPost, overrides || {});
  };

  _proto.getDeployTransaction = function getDeployTransaction(_permitPost, overrides) {
    return _ContractFactory.prototype.getDeployTransaction.call(this, _permitPost, overrides || {});
  };

  _proto.attach = function attach(address) {
    return _ContractFactory.prototype.attach.call(this, address);
  };

  _proto.connect = function connect(signer) {
    return _ContractFactory.prototype.connect.call(this, signer);
  };

  DutchLimitOrderReactor__factory.createInterface = function createInterface() {
    return new ethers.utils.Interface(_abi);
  };

  DutchLimitOrderReactor__factory.connect = function connect(address, signerOrProvider) {
    return new ethers.Contract(address, _abi, signerOrProvider);
  };

  return DutchLimitOrderReactor__factory;
}(ethers.ContractFactory);
DutchLimitOrderReactor__factory.bytecode = _bytecode;
DutchLimitOrderReactor__factory.abi = _abi;

var _abi$1 = [{
  inputs: [{
    internalType: "bytes",
    name: "order",
    type: "bytes"
  }, {
    components: [{
      internalType: "uint8",
      name: "v",
      type: "uint8"
    }, {
      internalType: "bytes32",
      name: "r",
      type: "bytes32"
    }, {
      internalType: "bytes32",
      name: "s",
      type: "bytes32"
    }],
    internalType: "struct Signature",
    name: "sig",
    type: "tuple"
  }],
  name: "quote",
  outputs: [{
    components: [{
      components: [{
        internalType: "address",
        name: "reactor",
        type: "address"
      }, {
        internalType: "uint256",
        name: "nonce",
        type: "uint256"
      }, {
        internalType: "uint256",
        name: "deadline",
        type: "uint256"
      }],
      internalType: "struct OrderInfo",
      name: "info",
      type: "tuple"
    }, {
      components: [{
        internalType: "address",
        name: "token",
        type: "address"
      }, {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }],
      internalType: "struct TokenAmount",
      name: "input",
      type: "tuple"
    }, {
      components: [{
        internalType: "address",
        name: "token",
        type: "address"
      }, {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }, {
        internalType: "address",
        name: "recipient",
        type: "address"
      }],
      internalType: "struct Output[]",
      name: "outputs",
      type: "tuple[]"
    }],
    internalType: "struct ResolvedOrder",
    name: "result",
    type: "tuple"
  }],
  stateMutability: "nonpayable",
  type: "function"
}, {
  inputs: [{
    components: [{
      components: [{
        internalType: "address",
        name: "reactor",
        type: "address"
      }, {
        internalType: "uint256",
        name: "nonce",
        type: "uint256"
      }, {
        internalType: "uint256",
        name: "deadline",
        type: "uint256"
      }],
      internalType: "struct OrderInfo",
      name: "info",
      type: "tuple"
    }, {
      components: [{
        internalType: "address",
        name: "token",
        type: "address"
      }, {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }],
      internalType: "struct TokenAmount",
      name: "input",
      type: "tuple"
    }, {
      components: [{
        internalType: "address",
        name: "token",
        type: "address"
      }, {
        internalType: "uint256",
        name: "amount",
        type: "uint256"
      }, {
        internalType: "address",
        name: "recipient",
        type: "address"
      }],
      internalType: "struct Output[]",
      name: "outputs",
      type: "tuple[]"
    }],
    internalType: "struct ResolvedOrder[]",
    name: "resolvedOrders",
    type: "tuple[]"
  }, {
    internalType: "bytes",
    name: "",
    type: "bytes"
  }],
  name: "reactorCallback",
  outputs: [],
  stateMutability: "pure",
  type: "function"
}];
var _bytecode$1 = "0x608060405234801561001057600080fd5b50610955806100206000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c806389930d271461003b578063b030bac314610050575b600080fd5b61004e610049366004610426565b610079565b005b61006361005e366004610581565b6100bf565b604051610070919061060b565b60405180910390f35b60008260008151811061008e5761008e6106bd565b60200260200101516040516020016100a6919061060b565b6040516020818303038152906040529050805181602001fd5b6100c76101b7565b60408381015181518083018352858152602080820186905283519081018452600081529251638bcaadbd60e01b81526001600160a01b0390921692638bcaadbd9261011792913091600401610719565b600060405180830381600087803b15801561013157600080fd5b505af1925050508015610142575060015b610183573d808015610170576040519150601f19603f3d011682016040523d82523d6000602084013e610175565b606091505b5061017f81610189565b9150505b92915050565b6101916101b7565b60c0825110156101a357815182602001fd5b818060200190518101906101839190610859565b6040805160c0810182526000606082018181526080830182905260a08301829052825282518084019093528083526020838101919091529091908201908152602001606081525090565b634e487b7160e01b600052604160045260246000fd5b6040805190810167ffffffffffffffff8111828210171561023a5761023a610201565b60405290565b6040516060810167ffffffffffffffff8111828210171561023a5761023a610201565b604051601f8201601f1916810167ffffffffffffffff8111828210171561028c5761028c610201565b604052919050565b600067ffffffffffffffff8211156102ae576102ae610201565b5060051b60200190565b6001600160a01b03811681146102cd57600080fd5b50565b6000604082840312156102e257600080fd5b6102ea610217565b905081356102f7816102b8565b808252506020820135602082015292915050565b600082601f83011261031c57600080fd5b8135602061033161032c83610294565b610263565b8281526060928302850182019282820191908785111561035057600080fd5b8387015b858110156103a95781818a03121561036c5760008081fd5b610374610240565b813561037f816102b8565b81528186013586820152604080830135610398816102b8565b908201528452928401928101610354565b5090979650505050505050565b600082601f8301126103c757600080fd5b813567ffffffffffffffff8111156103e1576103e1610201565b6103f4601f8201601f1916602001610263565b81815284602083860101111561040957600080fd5b816020850160208301376000918101602001919091529392505050565b600080604080848603121561043a57600080fd5b833567ffffffffffffffff8082111561045257600080fd5b818601915086601f83011261046657600080fd5b8135602061047661032c83610294565b82815260059290921b8401810191818101908a84111561049557600080fd5b8286015b84811015610552578035868111156104b057600080fd5b8701808d03601f190160c08112156104c85760008081fd5b6104d0610240565b6060808312156104e05760008081fd5b6104e8610240565b9250878401356104f7816102b8565b8352838c0135888401528301358b8301528181526105188f608085016102d0565b8782015260c08301359150888211156105315760008081fd5b61053f8f888486010161030b565b818c015285525050918301918301610499565b509750508701359350508083111561056957600080fd5b5050610577858286016103b6565b9150509250929050565b600080828403608081121561059557600080fd5b833567ffffffffffffffff8111156105ac57600080fd5b6105b8868287016103b6565b9350506060601f19820112156105cd57600080fd5b506105d6610240565b602084013560ff811681146105ea57600080fd5b81526040848101356020830152606090940135938101939093525092909150565b6020808252825180516001600160a01b039081168484015281830151604080860191909152918201516060808601919091528584015180518316608087015284015160a08601528286015160c080870152805160e0870181905260009594918501938693909290916101008901905b808610156106af578651805186168352888101518984015283015185168383015295870195600195909501949083019061067a565b509998505050505050505050565b634e487b7160e01b600052603260045260246000fd5b6000815180845260005b818110156106f9576020818501810151868301820152016106dd565b506000602082860101526020601f19601f83011685010191505092915050565b60608152600084516080606084015261073560e08401826106d3565b9050602086015160ff8151166080850152602081015160a0850152604081015160c08501525060018060a01b0385166020840152828103604084015261077b81856106d3565b9695505050505050565b60006040828403121561079757600080fd5b61079f610217565b905081516107ac816102b8565b808252506020820151602082015292915050565b600082601f8301126107d157600080fd5b815160206107e161032c83610294565b8281526060928302850182019282820191908785111561080057600080fd5b8387015b858110156103a95781818a03121561081c5760008081fd5b610824610240565b815161082f816102b8565b81528186015186820152604080830151610848816102b8565b908201528452928401928101610804565b60006020828403121561086b57600080fd5b815167ffffffffffffffff8082111561088357600080fd5b9083019081850360c081121561089857600080fd5b6108a0610240565b60608212156108ae57600080fd5b6108b6610240565b915083516108c3816102b8565b8083525060208401516020830152604084015160408301528181526108eb8760608601610785565b602082015260a084015191508282111561090457600080fd5b610910878386016107c0565b6040820152969550505050505056fea2646970667358221220ff9e542de14d43a693a13064b7d6ddb028a4a1fa585b49b01c69e98897b6627b64736f6c63430008100033";

var isSuperArgs$1 = function isSuperArgs(xs) {
  return xs.length > 1;
};

var OrderQuoter__factory = /*#__PURE__*/function (_ContractFactory) {
  _inheritsLoose(OrderQuoter__factory, _ContractFactory);

  function OrderQuoter__factory() {
    var _this;

    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    if (isSuperArgs$1(args)) {
      _this = _ContractFactory.call.apply(_ContractFactory, [this].concat(args)) || this;
    } else {
      _this = _ContractFactory.call(this, _abi$1, _bytecode$1, args[0]) || this;
    }

    return _assertThisInitialized(_this);
  }

  var _proto = OrderQuoter__factory.prototype;

  _proto.deploy = function deploy(overrides) {
    return _ContractFactory.prototype.deploy.call(this, overrides || {});
  };

  _proto.getDeployTransaction = function getDeployTransaction(overrides) {
    return _ContractFactory.prototype.getDeployTransaction.call(this, overrides || {});
  };

  _proto.attach = function attach(address) {
    return _ContractFactory.prototype.attach.call(this, address);
  };

  _proto.connect = function connect(signer) {
    return _ContractFactory.prototype.connect.call(this, signer);
  };

  OrderQuoter__factory.createInterface = function createInterface() {
    return new ethers.utils.Interface(_abi$1);
  };

  OrderQuoter__factory.connect = function connect(address, signerOrProvider) {
    return new ethers.Contract(address, _abi$1, signerOrProvider);
  };

  return OrderQuoter__factory;
}(ethers.ContractFactory);
OrderQuoter__factory.bytecode = _bytecode$1;
OrderQuoter__factory.abi = _abi$1;

var _abi$2 = [{
  inputs: [],
  stateMutability: "nonpayable",
  type: "constructor"
}, {
  inputs: [],
  name: "DeadlinePassed",
  type: "error"
}, {
  inputs: [],
  name: "InvalidAmount",
  type: "error"
}, {
  inputs: [],
  name: "InvalidId",
  type: "error"
}, {
  inputs: [],
  name: "InvalidSignature",
  type: "error"
}, {
  inputs: [],
  name: "NonceUsed",
  type: "error"
}, {
  inputs: [],
  name: "NotSpender",
  type: "error"
}, {
  inputs: [],
  name: "_PERMIT_TYPEHASH",
  outputs: [{
    internalType: "bytes32",
    name: "",
    type: "bytes32"
  }],
  stateMutability: "view",
  type: "function"
}, {
  inputs: [],
  name: "_TOKEN_DETAILS_TYPEHASH",
  outputs: [{
    internalType: "bytes32",
    name: "",
    type: "bytes32"
  }],
  stateMutability: "view",
  type: "function"
}, {
  inputs: [{
    internalType: "uint256",
    name: "nonce",
    type: "uint256"
  }],
  name: "bitmapPositions",
  outputs: [{
    internalType: "uint248",
    name: "wordPos",
    type: "uint248"
  }, {
    internalType: "uint8",
    name: "bitPos",
    type: "uint8"
  }],
  stateMutability: "pure",
  type: "function"
}, {
  inputs: [{
    internalType: "uint256",
    name: "amount",
    type: "uint256"
  }],
  name: "invalidateNonces",
  outputs: [],
  stateMutability: "nonpayable",
  type: "function"
}, {
  inputs: [{
    internalType: "uint248",
    name: "wordPos",
    type: "uint248"
  }, {
    internalType: "uint256",
    name: "mask",
    type: "uint256"
  }],
  name: "invalidateUnorderedNonces",
  outputs: [],
  stateMutability: "nonpayable",
  type: "function"
}, {
  inputs: [{
    internalType: "address",
    name: "from",
    type: "address"
  }, {
    internalType: "uint256",
    name: "nonce",
    type: "uint256"
  }],
  name: "isUsedUnorderedNonce",
  outputs: [{
    internalType: "bool",
    name: "used",
    type: "bool"
  }],
  stateMutability: "view",
  type: "function"
}, {
  inputs: [{
    internalType: "address",
    name: "",
    type: "address"
  }, {
    internalType: "uint248",
    name: "",
    type: "uint248"
  }],
  name: "nonceBitmap",
  outputs: [{
    internalType: "uint256",
    name: "",
    type: "uint256"
  }],
  stateMutability: "view",
  type: "function"
}, {
  inputs: [{
    internalType: "address",
    name: "",
    type: "address"
  }],
  name: "nonces",
  outputs: [{
    internalType: "uint256",
    name: "",
    type: "uint256"
  }],
  stateMutability: "view",
  type: "function"
}, {
  inputs: [{
    components: [{
      components: [{
        internalType: "enum TokenType",
        name: "tokenType",
        type: "uint8"
      }, {
        internalType: "address",
        name: "token",
        type: "address"
      }, {
        internalType: "uint256",
        name: "maxAmount",
        type: "uint256"
      }, {
        internalType: "uint256",
        name: "id",
        type: "uint256"
      }],
      internalType: "struct TokenDetails[]",
      name: "tokens",
      type: "tuple[]"
    }, {
      internalType: "address",
      name: "spender",
      type: "address"
    }, {
      internalType: "uint256",
      name: "deadline",
      type: "uint256"
    }, {
      internalType: "bytes32",
      name: "witness",
      type: "bytes32"
    }],
    internalType: "struct Permit",
    name: "permit",
    type: "tuple"
  }, {
    internalType: "address",
    name: "from",
    type: "address"
  }, {
    internalType: "address[]",
    name: "to",
    type: "address[]"
  }, {
    internalType: "uint256[]",
    name: "ids",
    type: "uint256[]"
  }, {
    internalType: "uint256[]",
    name: "amounts",
    type: "uint256[]"
  }, {
    components: [{
      internalType: "uint8",
      name: "v",
      type: "uint8"
    }, {
      internalType: "bytes32",
      name: "r",
      type: "bytes32"
    }, {
      internalType: "bytes32",
      name: "s",
      type: "bytes32"
    }],
    internalType: "struct Signature",
    name: "sig",
    type: "tuple"
  }],
  name: "transferFrom",
  outputs: [],
  stateMutability: "nonpayable",
  type: "function"
}, {
  inputs: [{
    components: [{
      components: [{
        internalType: "enum TokenType",
        name: "tokenType",
        type: "uint8"
      }, {
        internalType: "address",
        name: "token",
        type: "address"
      }, {
        internalType: "uint256",
        name: "maxAmount",
        type: "uint256"
      }, {
        internalType: "uint256",
        name: "id",
        type: "uint256"
      }],
      internalType: "struct TokenDetails[]",
      name: "tokens",
      type: "tuple[]"
    }, {
      internalType: "address",
      name: "spender",
      type: "address"
    }, {
      internalType: "uint256",
      name: "deadline",
      type: "uint256"
    }, {
      internalType: "bytes32",
      name: "witness",
      type: "bytes32"
    }],
    internalType: "struct Permit",
    name: "permit",
    type: "tuple"
  }, {
    internalType: "address[]",
    name: "to",
    type: "address[]"
  }, {
    internalType: "uint256[]",
    name: "ids",
    type: "uint256[]"
  }, {
    internalType: "uint256[]",
    name: "amounts",
    type: "uint256[]"
  }, {
    internalType: "uint256",
    name: "nonce",
    type: "uint256"
  }, {
    components: [{
      internalType: "uint8",
      name: "v",
      type: "uint8"
    }, {
      internalType: "bytes32",
      name: "r",
      type: "bytes32"
    }, {
      internalType: "bytes32",
      name: "s",
      type: "bytes32"
    }],
    internalType: "struct Signature",
    name: "sig",
    type: "tuple"
  }],
  name: "unorderedTransferFrom",
  outputs: [],
  stateMutability: "nonpayable",
  type: "function"
}];
var _bytecode$2 = "0x61014060405234801561001157600080fd5b50604080518082018252600a81526914195c9b5a5d141bdcdd60b21b6020808301918252835180850190945260018452603160f81b908401528151902060e08190527fc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc66101008190524660a0529192917f8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f6100f18184846040805160208101859052908101839052606081018290524660808201523060a082015260009060c0016040516020818303038152906040528051906020012090509392505050565b6080523060c052610120525061010692505050565b60805160a05160c05160e05161010051610120516113ce6101556000396000610b9701526000610be601526000610bc101526000610b1a01526000610b4401526000610b6e01526113ce6000f3fe608060405234801561001057600080fd5b506004361061009e5760003560e01c80637ecebe00116100665780637ecebe00146101a7578063982aaf6b146101c7578063a44ba4ef146101ee578063b2a2ee671461022b578063ee3ab3261461023e57600080fd5b80631e459b98146100a357806322f888e7146100fa578063350a62b41461010f57806364eb31841461014a5780636a9009ae1461017f575b600080fd5b6100e56100b1366004610e61565b6001600160a01b0391909116600090815260208181526040808320600885901c845290915290205460ff9091161c60011690565b60405190151581526020015b60405180910390f35b61010d610108366004610e8b565b610251565b005b61010d61011d366004610ebb565b336000908152602081815260408083206001600160f81b0390951683529390529190912080549091179055565b6101717f15d73fd3389658d5d3b3e32a847b53c30a229bdcd21f7078cde26cc4d0d3f1cc81565b6040519081526020016100f1565b61017161018d366004610ed7565b600060208181529281526040808220909352908152205481565b6101716101b5366004610f0a565b60016020526000908152604090205481565b6101717f0eb37ebaa42bd9140c20b84947b8f4faa6c3bb28b233e2f3acd91fec0317fe2681565b61020a6101fc366004610e8b565b600881901c9160ff90911690565b604080516001600160f81b03909316835260ff9091166020830152016100f1565b61010d610239366004610fa2565b610278565b61010d61024c366004611083565b6103c3565b3360009081526001602052604081208054839290610270908490611163565b909155505050565b6102858984848888610518565b60006102bb8a8360016102b68d6001600160a01b031660009081526001602081905260409091208054918201905590565b61068a565b9050886001600160a01b0316816001600160a01b0316146102ef57604051638baa579f60e01b815260040160405180910390fd5b60005b6102fc8b80611176565b90508110156103b65760006103118c80611176565b83818110610321576103216111c0565b90506080020180360381019061033791906111ec565b90506103a5816000015182602001518d8d8d87818110610359576103596111c0565b905060200201602081019061036e9190610f0a565b8c8c88818110610380576103806111c0565b905060200201358b8b89818110610399576103996111c0565b90506020020135610855565b506103af81611272565b90506102f2565b5050505050505050505050565b6103d08985858989610518565b60006103df8a8360008661068a565b6001600160a01b038116600090815260208181526040808320600888901c845290915290205490915060ff84161c6001161561042e57604051631f6d5aef60e01b815260040160405180910390fd5b6001600160a01b038116600090815260208181526040808320600887901c845290915281208054600160ff87161b1790555b61046a8b80611176565b90508110156103b657600061047f8c80611176565b8381811061048f5761048f6111c0565b9050608002018036038101906104a591906111ec565b905061050781600001518260200151858e8e878181106104c7576104c76111c0565b90506020020160208101906104dc9190610f0a565b8d8d888181106104ee576104ee6111c0565b905060200201358c8c89818110610399576103996111c0565b5061051181611272565b9050610460565b6105286040860160208701610f0a565b6001600160a01b0316336001600160a01b0316146105595760405163e79dd39160e01b815260040160405180910390fd5b846040013542111561057e5760405163387b2e5560e11b815260040160405180910390fd5b60005b61058b8680611176565b90508110156106005761059e8680611176565b828181106105ae576105ae6111c0565b905060800201604001358585838181106105ca576105ca6111c0565b9050602002013511156105f05760405163162908e360e11b815260040160405180910390fd5b6105f981611272565b9050610581565b5060005b61060e8680611176565b9050811015610682576106218680611176565b82818110610631576106316111c0565b9050608002016060013583838381811061064d5761064d6111c0565b905060200201351461067257604051631bf4348160e31b815260040160405180910390fd5b61067b81611272565b9050610604565b505050505050565b6000806106978680611176565b905067ffffffffffffffff8111156106b1576106b16111d6565b6040519080825280602002602001820160405280156106da578160200160208202803683370190505b50905060005b6106ea8780611176565b90508110156107585761072b6107008880611176565b83818110610710576107106111c0565b90506080020180360381019061072691906111ec565b6109b0565b82828151811061073d5761073d6111c0565b602090810291909101015261075181611272565b90506106e0565b5060006107f67f0eb37ebaa42bd9140c20b84947b8f4faa6c3bb28b233e2f3acd91fec0317fe268684604051602001610791919061128b565b604051602081830303815290604052805190602001208a60200160208101906107ba9190610f0a565b8b604001358c606001358a6040516020016107db97969594939291906112d7565b60405160208183030381529060405280519060200120610a02565b9050600061081a8261080b60208a018a611327565b89602001358a60400135610a56565b90506001600160a01b03811661084357604051638baa579f60e01b815260040160405180910390fd5b925061084d915050565b949350505050565b6000866002811115610869576108696112c1565b03610888576108836001600160a01b038616858584610a7e565b610682565b600186600281111561089c5761089c6112c1565b03610910576040516323b872dd60e01b81526001600160a01b0385811660048301528481166024830152604482018490528616906323b872dd90606401600060405180830381600087803b1580156108f357600080fd5b505af1158015610907573d6000803e3d6000fd5b50505050610682565b6002866002811115610924576109246112c1565b0361068257604051637921219560e11b81526001600160a01b0385811660048301528481166024830152604482018490526064820183905260a06084830152600060a483015286169063f242432a9060c401600060405180830381600087803b15801561099057600080fd5b505af11580156109a4573d6000803e3d6000fd5b50505050505050505050565b60007f15d73fd3389658d5d3b3e32a847b53c30a229bdcd21f7078cde26cc4d0d3f1cc826040516020016109e592919061134a565b604051602081830303815290604052805190602001209050919050565b6000610a50610a0f610b0d565b8360405161190160f01b6020820152602281018390526042810182905260009060620160405160208183030381529060405280519060200120905092915050565b92915050565b6000806000610a6787878787610c34565b91509150610a7481610cf8565b5095945050505050565b60006040516323b872dd60e01b81528460048201528360248201528260448201526020600060648360008a5af13d15601f3d1160016000511416171691505080610b065760405162461bcd60e51b81526020600482015260146024820152731514905394d1915497d19493d357d1905253115160621b60448201526064015b60405180910390fd5b5050505050565b6000306001600160a01b037f000000000000000000000000000000000000000000000000000000000000000016148015610b6657507f000000000000000000000000000000000000000000000000000000000000000046145b15610b9057507f000000000000000000000000000000000000000000000000000000000000000090565b50604080517f00000000000000000000000000000000000000000000000000000000000000006020808301919091527f0000000000000000000000000000000000000000000000000000000000000000828401527f000000000000000000000000000000000000000000000000000000000000000060608301524660808301523060a0808401919091528351808403909101815260c0909201909252805191012090565b6000807f7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0831115610c6b5750600090506003610cef565b6040805160008082526020820180845289905260ff881692820192909252606081018690526080810185905260019060a0016020604051602081039080840390855afa158015610cbf573d6000803e3d6000fd5b5050604051601f1901519150506001600160a01b038116610ce857600060019250925050610cef565b9150600090505b94509492505050565b6000816004811115610d0c57610d0c6112c1565b03610d145750565b6001816004811115610d2857610d286112c1565b03610d755760405162461bcd60e51b815260206004820152601860248201527f45434453413a20696e76616c6964207369676e617475726500000000000000006044820152606401610afd565b6002816004811115610d8957610d896112c1565b03610dd65760405162461bcd60e51b815260206004820152601f60248201527f45434453413a20696e76616c6964207369676e6174757265206c656e677468006044820152606401610afd565b6003816004811115610dea57610dea6112c1565b03610e425760405162461bcd60e51b815260206004820152602260248201527f45434453413a20696e76616c6964207369676e6174757265202773272076616c604482015261756560f01b6064820152608401610afd565b50565b80356001600160a01b0381168114610e5c57600080fd5b919050565b60008060408385031215610e7457600080fd5b610e7d83610e45565b946020939093013593505050565b600060208284031215610e9d57600080fd5b5035919050565b80356001600160f81b0381168114610e5c57600080fd5b60008060408385031215610ece57600080fd5b610e7d83610ea4565b60008060408385031215610eea57600080fd5b610ef383610e45565b9150610f0160208401610ea4565b90509250929050565b600060208284031215610f1c57600080fd5b610f2582610e45565b9392505050565b600060808284031215610f3e57600080fd5b50919050565b60008083601f840112610f5657600080fd5b50813567ffffffffffffffff811115610f6e57600080fd5b6020830191508360208260051b8501011115610f8957600080fd5b9250929050565b600060608284031215610f3e57600080fd5b60008060008060008060008060006101008a8c031215610fc157600080fd5b893567ffffffffffffffff80821115610fd957600080fd5b610fe58d838e01610f2c565b9a50610ff360208d01610e45565b995060408c013591508082111561100957600080fd5b6110158d838e01610f44565b909950975060608c013591508082111561102e57600080fd5b61103a8d838e01610f44565b909750955060808c013591508082111561105357600080fd5b506110608c828d01610f44565b909450925061107490508b60a08c01610f90565b90509295985092959850929598565b60008060008060008060008060006101008a8c0312156110a257600080fd5b893567ffffffffffffffff808211156110ba57600080fd5b6110c68d838e01610f2c565b9a5060208c01359150808211156110dc57600080fd5b6110e88d838e01610f44565b909a50985060408c013591508082111561110157600080fd5b61110d8d838e01610f44565b909850965060608c013591508082111561112657600080fd5b506111338c828d01610f44565b90955093505060808a013591506110748b60a08c01610f90565b634e487b7160e01b600052601160045260246000fd5b80820180821115610a5057610a5061114d565b6000808335601e1984360301811261118d57600080fd5b83018035915067ffffffffffffffff8211156111a857600080fd5b6020019150600781901b3603821315610f8957600080fd5b634e487b7160e01b600052603260045260246000fd5b634e487b7160e01b600052604160045260246000fd5b6000608082840312156111fe57600080fd5b6040516080810181811067ffffffffffffffff8211171561122f57634e487b7160e01b600052604160045260246000fd5b60405282356003811061124157600080fd5b815261124f60208401610e45565b602082015260408301356040820152606083013560608201528091505092915050565b6000600182016112845761128461114d565b5060010190565b815160009082906020808601845b838110156112b557815185529382019390820190600101611299565b50929695505050505050565b634e487b7160e01b600052602160045260246000fd5b87815260e08101600288106112ee576112ee6112c1565b602082019790975260408101959095526001600160a01b03939093166060850152608084019190915260a083015260c090910152919050565b60006020828403121561133957600080fd5b813560ff81168114610f2557600080fd5b828152815160a082019060038110611364576113646112c1565b8060208401525060018060a01b0360208401511660408301526040830151606083015260608301516080830152939250505056fea2646970667358221220c73380fe553c2742f9f7a900d083ac8df57285b022c85d7973d649a06209920364736f6c63430008100033";

var isSuperArgs$2 = function isSuperArgs(xs) {
  return xs.length > 1;
};

var PermitPost__factory = /*#__PURE__*/function (_ContractFactory) {
  _inheritsLoose(PermitPost__factory, _ContractFactory);

  function PermitPost__factory() {
    var _this;

    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    if (isSuperArgs$2(args)) {
      _this = _ContractFactory.call.apply(_ContractFactory, [this].concat(args)) || this;
    } else {
      _this = _ContractFactory.call(this, _abi$2, _bytecode$2, args[0]) || this;
    }

    return _assertThisInitialized(_this);
  }

  var _proto = PermitPost__factory.prototype;

  _proto.deploy = function deploy(overrides) {
    return _ContractFactory.prototype.deploy.call(this, overrides || {});
  };

  _proto.getDeployTransaction = function getDeployTransaction(overrides) {
    return _ContractFactory.prototype.getDeployTransaction.call(this, overrides || {});
  };

  _proto.attach = function attach(address) {
    return _ContractFactory.prototype.attach.call(this, address);
  };

  _proto.connect = function connect(signer) {
    return _ContractFactory.prototype.connect.call(this, signer);
  };

  PermitPost__factory.createInterface = function createInterface() {
    return new ethers.utils.Interface(_abi$2);
  };

  PermitPost__factory.connect = function connect(address, signerOrProvider) {
    return new ethers.Contract(address, _abi$2, signerOrProvider);
  };

  return PermitPost__factory;
}(ethers.ContractFactory);
PermitPost__factory.bytecode = _bytecode$2;
PermitPost__factory.abi = _abi$2;

/* Autogenerated file. Do not edit manually. */
var _abi$3 = [{
  inputs: [{
    components: [{
      internalType: "address",
      name: "target",
      type: "address"
    }, {
      internalType: "bytes",
      name: "callData",
      type: "bytes"
    }],
    internalType: "struct Multicall2.Call[]",
    name: "calls",
    type: "tuple[]"
  }],
  name: "aggregate",
  outputs: [{
    internalType: "uint256",
    name: "blockNumber",
    type: "uint256"
  }, {
    internalType: "bytes[]",
    name: "returnData",
    type: "bytes[]"
  }],
  payable: false,
  stateMutability: "view",
  type: "function"
}, {
  inputs: [{
    components: [{
      internalType: "address",
      name: "target",
      type: "address"
    }, {
      internalType: "bytes",
      name: "callData",
      type: "bytes"
    }],
    internalType: "struct Multicall2.Call[]",
    name: "calls",
    type: "tuple[]"
  }],
  name: "blockAndAggregate",
  outputs: [{
    internalType: "uint256",
    name: "blockNumber",
    type: "uint256"
  }, {
    internalType: "bytes32",
    name: "blockHash",
    type: "bytes32"
  }, {
    components: [{
      internalType: "bool",
      name: "success",
      type: "bool"
    }, {
      internalType: "bytes",
      name: "returnData",
      type: "bytes"
    }],
    internalType: "struct Multicall2.Result[]",
    name: "returnData",
    type: "tuple[]"
  }],
  stateMutability: "nonpayable",
  type: "function"
}, {
  inputs: [{
    internalType: "uint256",
    name: "blockNumber",
    type: "uint256"
  }],
  name: "getBlockHash",
  outputs: [{
    internalType: "bytes32",
    name: "blockHash",
    type: "bytes32"
  }],
  stateMutability: "view",
  type: "function"
}, {
  inputs: [],
  name: "getBlockNumber",
  outputs: [{
    internalType: "uint256",
    name: "blockNumber",
    type: "uint256"
  }],
  stateMutability: "view",
  type: "function"
}, {
  inputs: [],
  name: "getCurrentBlockCoinbase",
  outputs: [{
    internalType: "address",
    name: "coinbase",
    type: "address"
  }],
  stateMutability: "view",
  type: "function"
}, {
  inputs: [],
  name: "getCurrentBlockDifficulty",
  outputs: [{
    internalType: "uint256",
    name: "difficulty",
    type: "uint256"
  }],
  stateMutability: "view",
  type: "function"
}, {
  inputs: [],
  name: "getCurrentBlockGasLimit",
  outputs: [{
    internalType: "uint256",
    name: "gaslimit",
    type: "uint256"
  }],
  stateMutability: "view",
  type: "function"
}, {
  inputs: [],
  name: "getCurrentBlockTimestamp",
  outputs: [{
    internalType: "uint256",
    name: "timestamp",
    type: "uint256"
  }],
  stateMutability: "view",
  type: "function"
}, {
  inputs: [{
    internalType: "address",
    name: "addr",
    type: "address"
  }],
  name: "getEthBalance",
  outputs: [{
    internalType: "uint256",
    name: "balance",
    type: "uint256"
  }],
  stateMutability: "view",
  type: "function"
}, {
  inputs: [],
  name: "getLastBlockHash",
  outputs: [{
    internalType: "bytes32",
    name: "blockHash",
    type: "bytes32"
  }],
  stateMutability: "view",
  type: "function"
}, {
  inputs: [{
    internalType: "bool",
    name: "requireSuccess",
    type: "bool"
  }, {
    components: [{
      internalType: "address",
      name: "target",
      type: "address"
    }, {
      internalType: "bytes",
      name: "callData",
      type: "bytes"
    }],
    internalType: "struct Multicall2.Call[]",
    name: "calls",
    type: "tuple[]"
  }],
  name: "tryAggregate",
  outputs: [{
    components: [{
      internalType: "bool",
      name: "success",
      type: "bool"
    }, {
      internalType: "bytes",
      name: "returnData",
      type: "bytes"
    }],
    internalType: "struct Multicall2.Result[]",
    name: "returnData",
    type: "tuple[]"
  }],
  payable: false,
  stateMutability: "view",
  type: "function"
}, {
  inputs: [{
    internalType: "bool",
    name: "requireSuccess",
    type: "bool"
  }, {
    components: [{
      internalType: "address",
      name: "target",
      type: "address"
    }, {
      internalType: "bytes",
      name: "callData",
      type: "bytes"
    }],
    internalType: "struct Multicall2.Call[]",
    name: "calls",
    type: "tuple[]"
  }],
  name: "tryBlockAndAggregate",
  outputs: [{
    internalType: "uint256",
    name: "blockNumber",
    type: "uint256"
  }, {
    internalType: "bytes32",
    name: "blockHash",
    type: "bytes32"
  }, {
    components: [{
      internalType: "bool",
      name: "success",
      type: "bool"
    }, {
      internalType: "bytes",
      name: "returnData",
      type: "bytes"
    }],
    internalType: "struct Multicall2.Result[]",
    name: "returnData",
    type: "tuple[]"
  }],
  stateMutability: "nonpayable",
  type: "function"
}];
var Multicall2__factory = /*#__PURE__*/function () {
  function Multicall2__factory() {}

  Multicall2__factory.createInterface = function createInterface() {
    return new ethers.utils.Interface(_abi$3);
  };

  Multicall2__factory.connect = function connect(address, signerOrProvider) {
    return new ethers.Contract(address, _abi$3, signerOrProvider);
  };

  return Multicall2__factory;
}();
Multicall2__factory.abi = _abi$3;

var MULTICALL_ADDRESS = '0x5ba1e12693dc8f9c48aad8770482f4739beed696';
var DEPLOYLESS_MULTICALL_BYTECODE = '0x608060405234801561001057600080fd5b5060405161087538038061087583398181016040528101906100329190610666565b6000815167ffffffffffffffff81111561004f5761004e610358565b5b60405190808252806020026020018201604052801561008857816020015b6100756102da565b81526020019060019003908161006d5790505b50905060005b82518110156101d3576000808483815181106100ad576100ac6106c2565b5b60200260200101516000015173ffffffffffffffffffffffffffffffffffffffff168584815181106100e2576100e16106c2565b5b6020026020010151602001516040516100fb9190610738565b6000604051808303816000865af19150503d8060008114610138576040519150601f19603f3d011682016040523d82523d6000602084013e61013d565b606091505b509150915085156101895781610188576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161017f906107d2565b60405180910390fd5b5b60405180604001604052808315158152602001828152508484815181106101b3576101b26106c2565b5b6020026020010181905250505080806101cb9061082b565b91505061008e565b50602081516040028260405103030160408160405103036001835111156102535760005b8351811015610251578060200260208501018160200260400183018261021f57855160200281525b6000831115610244576020808303510151602083510151038060208303510180835250505b50506001810190506101f7565b505b60005b8351811015610281578060200260208501018051516040602083510151035250600181019050610256565b5060005b83518110156102ae57806020026020850101604060208083510151035250600181019050610285565b506001835114156102cb5760208301604082018451602002815250505b60208152825160208201528181f35b6040518060400160405280600015158152602001606081525090565b6000604051905090565b600080fd5b600080fd5b60008115159050919050565b61031f8161030a565b811461032a57600080fd5b50565b60008151905061033c81610316565b92915050565b600080fd5b6000601f19601f8301169050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b61039082610347565b810181811067ffffffffffffffff821117156103af576103ae610358565b5b80604052505050565b60006103c26102f6565b90506103ce8282610387565b919050565b600067ffffffffffffffff8211156103ee576103ed610358565b5b602082029050602081019050919050565b600080fd5b600080fd5b600080fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006104398261040e565b9050919050565b6104498161042e565b811461045457600080fd5b50565b60008151905061046681610440565b92915050565b600080fd5b600067ffffffffffffffff82111561048c5761048b610358565b5b61049582610347565b9050602081019050919050565b60005b838110156104c05780820151818401526020810190506104a5565b838111156104cf576000848401525b50505050565b60006104e86104e384610471565b6103b8565b9050828152602081018484840111156105045761050361046c565b5b61050f8482856104a2565b509392505050565b600082601f83011261052c5761052b610342565b5b815161053c8482602086016104d5565b91505092915050565b60006040828403121561055b5761055a610404565b5b61056560406103b8565b9050600061057584828501610457565b600083015250602082015167ffffffffffffffff81111561059957610598610409565b5b6105a584828501610517565b60208301525092915050565b60006105c46105bf846103d3565b6103b8565b905080838252602082019050602084028301858111156105e7576105e66103ff565b5b835b8181101561062e57805167ffffffffffffffff81111561060c5761060b610342565b5b8086016106198982610545565b855260208501945050506020810190506105e9565b5050509392505050565b600082601f83011261064d5761064c610342565b5b815161065d8482602086016105b1565b91505092915050565b6000806040838503121561067d5761067c610300565b5b600061068b8582860161032d565b925050602083015167ffffffffffffffff8111156106ac576106ab610305565b5b6106b885828601610638565b9150509250929050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b600081519050919050565b600081905092915050565b6000610712826106f1565b61071c81856106fc565b935061072c8185602086016104a2565b80840191505092915050565b60006107448284610707565b915081905092915050565b600082825260208201905092915050565b7f4d756c746963616c6c32206167677265676174653a2063616c6c206661696c6560008201527f6400000000000000000000000000000000000000000000000000000000000000602082015250565b60006107bc60218361074f565b91506107c782610760565b604082019050919050565b600060208201905081810360008301526107eb816107af565b9050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b6000819050919050565b600061083682610821565b91507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff821415610869576108686107f2565b5b60018201905091905056fe'; // Perform multiple on-chain calls in a single http request
// return all results including errors
// Uses deployless method to function properly even on chains with no multicall contract deployed

function multicall(_x, _x2) {
  return _multicall.apply(this, arguments);
}

function _multicall() {
  _multicall = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(provider, params) {
    var address, contractInterface, functionName, functionParams, fragment, calls;
    return _regeneratorRuntime().wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            address = params.address, contractInterface = params.contractInterface, functionName = params.functionName, functionParams = params.functionParams;
            fragment = contractInterface.getFunction(functionName);
            calls = functionParams.map(function (functionParam) {
              var callData = contractInterface.encodeFunctionData(fragment, functionParam);
              return {
                target: address,
                callData: callData
              };
            });
            return _context.abrupt("return", getAggregatedCall(provider, calls));

          case 4:
          case "end":
            return _context.stop();
        }
      }
    }, _callee);
  }));
  return _multicall.apply(this, arguments);
}

function getAggregatedCall(_x3, _x4) {
  return _getAggregatedCall.apply(this, arguments);
}

function _getAggregatedCall() {
  _getAggregatedCall = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(provider, calls) {
    var code, _multicall2, deploylessInterface, args, data, response, multicallInterface;

    return _regeneratorRuntime().wrap(function _callee2$(_context2) {
      while (1) {
        switch (_context2.prev = _context2.next) {
          case 0:
            _context2.next = 2;
            return provider.getCode(MULTICALL_ADDRESS);

          case 2:
            code = _context2.sent;

            if (!(code.length > 2)) {
              _context2.next = 10;
              break;
            }

            _multicall2 = Multicall2__factory.connect(MULTICALL_ADDRESS, provider);
            _context2.next = 7;
            return _multicall2.callStatic.tryAggregate(false, calls);

          case 7:
            return _context2.abrupt("return", _context2.sent);

          case 10:
            deploylessInterface = new abi.Interface(deploylessMulticall2Abi);
            args = deploylessInterface.encodeDeploy([false, calls]);
            data = bytes.hexConcat([DEPLOYLESS_MULTICALL_BYTECODE, args]);
            _context2.next = 15;
            return provider.call({
              data: data
            });

          case 15:
            response = _context2.sent;
            multicallInterface = new abi.Interface(multicall2Abi);
            return _context2.abrupt("return", multicallInterface.decodeFunctionResult('tryAggregate', response).returnData);

          case 18:
          case "end":
            return _context2.stop();
        }
      }
    }, _callee2);
  }));
  return _getAggregatedCall.apply(this, arguments);
}

/**
 * Helper to track PermitPost nonces for addresses
 */

var NonceManager = /*#__PURE__*/function () {
  function NonceManager(provider, chainId, permitPostAddress) {
    this.provider = void 0;
    this.permitPost = void 0;
    this.currentWord = void 0;
    this.currentBitmap = void 0;
    this.provider = provider;

    if (permitPostAddress) {
      this.permitPost = PermitPost__factory.connect(permitPostAddress, provider);
    } else if (PERMIT_POST_MAPPING[chainId]) {
      this.permitPost = PermitPost__factory.connect(PERMIT_POST_MAPPING[chainId], this.provider);
    } else {
      throw new MissingConfiguration('orderQuoter', chainId.toString());
    }

    this.currentWord = new Map();
    this.currentBitmap = new Map();
  }
  /**
   * Finds the next unused nonce and returns it
   * Marks the nonce as used so it won't be returned again from this instance
   * NOTE: if any nonce usages are in-flight and created outside of this instance,
   * this function will not know about them and will return duplicates
   */


  var _proto = NonceManager.prototype;

  _proto.useNonce =
  /*#__PURE__*/
  function () {
    var _useNonce = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(address) {
      var _yield$this$getNextOp, word, bitmap, bitPos;

      return _regeneratorRuntime().wrap(function _callee$(_context) {
        while (1) {
          switch (_context.prev = _context.next) {
            case 0:
              _context.next = 2;
              return this.getNextOpenWord(address);

            case 2:
              _yield$this$getNextOp = _context.sent;
              word = _yield$this$getNextOp.word;
              bitmap = _yield$this$getNextOp.bitmap;
              bitPos = getFirstUnsetBit(bitmap);
              this.currentWord.set(address, word);
              this.currentBitmap.set(address, setBit(bitmap, bitPos));
              return _context.abrupt("return", buildNonce(word, bitPos));

            case 9:
            case "end":
              return _context.stop();
          }
        }
      }, _callee, this);
    }));

    function useNonce(_x) {
      return _useNonce.apply(this, arguments);
    }

    return useNonce;
  }();

  _proto.isUsed = /*#__PURE__*/function () {
    var _isUsed = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(address, nonce) {
      var _splitNonce, word, bitPos, bitmap;

      return _regeneratorRuntime().wrap(function _callee2$(_context2) {
        while (1) {
          switch (_context2.prev = _context2.next) {
            case 0:
              _splitNonce = splitNonce(nonce), word = _splitNonce.word, bitPos = _splitNonce.bitPos;
              _context2.next = 3;
              return this.permitPost.nonceBitmap(address, word);

            case 3:
              bitmap = _context2.sent;
              return _context2.abrupt("return", bitmap.div(ethers.BigNumber.from(2).pow(bitPos)).mod(2).eq(1));

            case 5:
            case "end":
              return _context2.stop();
          }
        }
      }, _callee2, this);
    }));

    function isUsed(_x2, _x3) {
      return _isUsed.apply(this, arguments);
    }

    return isUsed;
  }() // Returns the first word that contains empty bits
  ;

  _proto.getNextOpenWord =
  /*#__PURE__*/
  function () {
    var _getNextOpenWord = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee3(address) {
      var currentWord, bitmap;
      return _regeneratorRuntime().wrap(function _callee3$(_context3) {
        while (1) {
          switch (_context3.prev = _context3.next) {
            case 0:
              currentWord = this.currentWord.get(address) || ethers.BigNumber.from(0);
              _context3.t0 = this.currentBitmap.get(address);

              if (_context3.t0) {
                _context3.next = 6;
                break;
              }

              _context3.next = 5;
              return this.permitPost.nonceBitmap(address, currentWord);

            case 5:
              _context3.t0 = _context3.sent;

            case 6:
              bitmap = _context3.t0;

            case 7:
              if (!bitmap.eq(ethers.ethers.constants.MaxUint256)) {
                _context3.next = 14;
                break;
              }

              currentWord = currentWord.add(1);
              _context3.next = 11;
              return this.permitPost.nonceBitmap(address, currentWord);

            case 11:
              bitmap = _context3.sent;
              _context3.next = 7;
              break;

            case 14:
              return _context3.abrupt("return", {
                word: currentWord,
                bitmap: bitmap
              });

            case 15:
            case "end":
              return _context3.stop();
          }
        }
      }, _callee3, this);
    }));

    function getNextOpenWord(_x4) {
      return _getNextOpenWord.apply(this, arguments);
    }

    return getNextOpenWord;
  }();

  return NonceManager;
}(); // Splits a permitPost nonce into the word and bitPos

function splitNonce(nonce) {
  var word = nonce.div(256);
  var bitPos = nonce.mod(256);
  return {
    word: word,
    bitPos: bitPos
  };
} // Builds a permitPost nonce from the given word and bitPos

function buildNonce(word, bitPos) {
  // word << 8
  var shiftedWord = word.mul(256);
  return shiftedWord.add(bitPos);
} // Returns the position of the first unset bit
// Returns -1 if all bits are set

function getFirstUnsetBit(bitmap) {
  // Optimization if switch to library w/ bitwise operators:
  // return ~bitmap + (bitmap + 1)
  // instead we have to do a loop
  for (var i = 0; i < 256; i++) {
    if (bitmap.div(ethers.BigNumber.from(2).pow(i)).mod(2).eq(0)) {
      return i;
    }
  }

  return -1;
} // Returns the given bignumber with the given bit set
// Does nothing if the given bit is already set

function setBit(bitmap, bitPos) {
  // Optimization if switch to library w/ bitwise operators:
  // return bitmap & (1 << bitPos)
  var mask = ethers.BigNumber.from(2).pow(bitPos);

  if (bitmap.div(mask).mod(2).eq(1)) {
    return bitmap;
  }

  return bitmap.add(mask);
}

(function (OrderValidation) {
  OrderValidation[OrderValidation["Expired"] = 0] = "Expired";
  OrderValidation[OrderValidation["AlreadyFilled"] = 1] = "AlreadyFilled";
  OrderValidation[OrderValidation["Cancelled"] = 2] = "Cancelled";
  OrderValidation[OrderValidation["InsufficientFunds"] = 3] = "InsufficientFunds";
  OrderValidation[OrderValidation["InvalidSignature"] = 4] = "InvalidSignature";
  OrderValidation[OrderValidation["InvalidOrderFields"] = 5] = "InvalidOrderFields";
  OrderValidation[OrderValidation["UnknownError"] = 6] = "UnknownError";
  OrderValidation[OrderValidation["OK"] = 7] = "OK";
})(exports.OrderValidation || (exports.OrderValidation = {}));

var BASIC_ERROR = '0x08c379a0';
var KNOWN_ERRORS = {
  '8baa579f': exports.OrderValidation.InvalidSignature,
  '1f6d5aef': exports.OrderValidation.Cancelled,
  // invalid dutch decay time
  '302e5b7c': exports.OrderValidation.InvalidOrderFields,
  // invalid dutch decay time
  '773a6187': exports.OrderValidation.InvalidOrderFields,
  // invalid reactor address
  '4ddf4a64': exports.OrderValidation.InvalidOrderFields,
  '70f65caa': exports.OrderValidation.Expired,
  ee3b3d4b: exports.OrderValidation.AlreadyFilled,
  TRANSFER_FROM_FAILED: exports.OrderValidation.InsufficientFunds
};
/**
 * Order quoter
 */

var OrderQuoter = /*#__PURE__*/function () {
  function OrderQuoter(provider, chainId, orderQuoterAddress) {
    this.provider = void 0;
    this.chainId = void 0;
    this.orderQuoter = void 0;
    this.provider = provider;
    this.chainId = chainId;

    if (orderQuoterAddress) {
      this.orderQuoter = OrderQuoter__factory.connect(orderQuoterAddress, provider);
    } else if (ORDER_QUOTER_MAPPING[chainId]) {
      this.orderQuoter = OrderQuoter__factory.connect(ORDER_QUOTER_MAPPING[chainId], this.provider);
    } else {
      throw new MissingConfiguration('orderQuoter', chainId.toString());
    }
  }

  var _proto = OrderQuoter.prototype;

  _proto.quote = /*#__PURE__*/function () {
    var _quote = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(order) {
      return _regeneratorRuntime().wrap(function _callee$(_context) {
        while (1) {
          switch (_context.prev = _context.next) {
            case 0:
              _context.next = 2;
              return this.quoteBatch([order]);

            case 2:
              return _context.abrupt("return", _context.sent[0]);

            case 3:
            case "end":
              return _context.stop();
          }
        }
      }, _callee, this);
    }));

    function quote(_x) {
      return _quote.apply(this, arguments);
    }

    return quote;
  }();

  _proto.quoteBatch = /*#__PURE__*/function () {
    var _quoteBatch = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(orders) {
      var _this = this;

      var calls, results, validations, quotes;
      return _regeneratorRuntime().wrap(function _callee2$(_context2) {
        while (1) {
          switch (_context2.prev = _context2.next) {
            case 0:
              calls = orders.map(function (order) {
                var _splitSignature = bytes.splitSignature(order.signature),
                    v = _splitSignature.v,
                    r = _splitSignature.r,
                    s = _splitSignature.s;

                return [order.order.serialize(), {
                  v: v,
                  r: r,
                  s: s
                }];
              });
              _context2.next = 3;
              return multicall(this.provider, {
                address: this.orderQuoter.address,
                contractInterface: this.orderQuoter["interface"],
                functionName: 'quote',
                functionParams: calls
              });

            case 3:
              results = _context2.sent;
              _context2.next = 6;
              return this.getValidations(orders, results);

            case 6:
              validations = _context2.sent;
              quotes = results.map(function (_ref) {
                var success = _ref.success,
                    returnData = _ref.returnData;

                if (!success) {
                  return undefined;
                }

                return _this.orderQuoter["interface"].decodeFunctionResult('quote', returnData).result;
              });
              return _context2.abrupt("return", validations.map(function (validation, i) {
                return {
                  validation: validation,
                  quote: quotes[i]
                };
              }));

            case 9:
            case "end":
              return _context2.stop();
          }
        }
      }, _callee2, this);
    }));

    function quoteBatch(_x2) {
      return _quoteBatch.apply(this, arguments);
    }

    return quoteBatch;
  }();

  _proto.getValidations = /*#__PURE__*/function () {
    var _getValidations = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee3(orders, results) {
      var validations;
      return _regeneratorRuntime().wrap(function _callee3$(_context3) {
        while (1) {
          switch (_context3.prev = _context3.next) {
            case 0:
              validations = results.map(function (result) {
                if (result.success) {
                  return exports.OrderValidation.OK;
                } else {
                  var returnData = result.returnData; // Parse traditional string error messages

                  if (returnData.startsWith(BASIC_ERROR)) {
                    returnData = new ethers.ethers.utils.AbiCoder().decode(['string'], '0x' + returnData.slice(10))[0];
                  }

                  for (var _i = 0, _Object$keys = Object.keys(KNOWN_ERRORS); _i < _Object$keys.length; _i++) {
                    var key = _Object$keys[_i];

                    if (returnData.includes(key)) {
                      return KNOWN_ERRORS[key];
                    }
                  }
                }

                return exports.OrderValidation.UnknownError;
              });
              _context3.next = 3;
              return this.checkTerminalStates(orders, validations);

            case 3:
              return _context3.abrupt("return", _context3.sent);

            case 4:
            case "end":
              return _context3.stop();
          }
        }
      }, _callee3, this);
    }));

    function getValidations(_x3, _x4) {
      return _getValidations.apply(this, arguments);
    }

    return getValidations;
  }() // The quoter contract has a quirk that make validations inaccurate:
  // - checks expiry before anything else, so old but already filled orders will return as canceled
  // so this function takes orders in expired and already filled states and double checks them
  ;

  _proto.checkTerminalStates =
  /*#__PURE__*/
  function () {
    var _checkTerminalStates = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee5(orders, validations) {
      var _this2 = this;

      return _regeneratorRuntime().wrap(function _callee5$(_context5) {
        while (1) {
          switch (_context5.prev = _context5.next) {
            case 0:
              _context5.next = 2;
              return Promise.all(validations.map( /*#__PURE__*/function () {
                var _ref2 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee4(validation, i) {
                  var order, reactor, orderStatus, nonceManager, maker, cancelled;
                  return _regeneratorRuntime().wrap(function _callee4$(_context4) {
                    while (1) {
                      switch (_context4.prev = _context4.next) {
                        case 0:
                          order = orders[i];

                          if (!(validation === exports.OrderValidation.Expired)) {
                            _context4.next = 24;
                            break;
                          }

                          // all reactors have the same orderStatus interface, we just use limitorder to implement the interface
                          reactor = DutchLimitOrderReactor__factory.connect(order.order.info.reactor, _this2.provider);
                          _context4.next = 5;
                          return reactor.orderStatus(order.order.hash());

                        case 5:
                          orderStatus = _context4.sent;

                          if (!orderStatus.isFilled) {
                            _context4.next = 10;
                            break;
                          }

                          return _context4.abrupt("return", exports.OrderValidation.AlreadyFilled);

                        case 10:
                          _context4.t0 = NonceManager;
                          _context4.t1 = _this2.provider;
                          _context4.t2 = _this2.chainId;
                          _context4.next = 15;
                          return reactor.permitPost();

                        case 15:
                          _context4.t3 = _context4.sent;
                          nonceManager = new _context4.t0(_context4.t1, _context4.t2, _context4.t3);
                          maker = order.order.getSigner(order.signature);
                          _context4.next = 20;
                          return nonceManager.isUsed(maker, order.order.info.nonce);

                        case 20:
                          cancelled = _context4.sent;
                          return _context4.abrupt("return", cancelled ? exports.OrderValidation.Cancelled : validation);

                        case 22:
                          _context4.next = 25;
                          break;

                        case 24:
                          return _context4.abrupt("return", validation);

                        case 25:
                        case "end":
                          return _context4.stop();
                      }
                    }
                  }, _callee4);
                }));

                return function (_x7, _x8) {
                  return _ref2.apply(this, arguments);
                };
              }()));

            case 2:
              return _context5.abrupt("return", _context5.sent);

            case 3:
            case "end":
              return _context5.stop();
          }
        }
      }, _callee5);
    }));

    function checkTerminalStates(_x5, _x6) {
      return _checkTerminalStates.apply(this, arguments);
    }

    return checkTerminalStates;
  }();

  return OrderQuoter;
}();

/**
 * Order validator
 */

var OrderValidator = /*#__PURE__*/function (_OrderQuoter) {
  _inheritsLoose(OrderValidator, _OrderQuoter);

  function OrderValidator() {
    return _OrderQuoter.apply(this, arguments) || this;
  }

  var _proto = OrderValidator.prototype;

  _proto.validate = /*#__PURE__*/function () {
    var _validate = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(order) {
      return _regeneratorRuntime().wrap(function _callee$(_context) {
        while (1) {
          switch (_context.prev = _context.next) {
            case 0:
              _context.next = 2;
              return _OrderQuoter.prototype.quote.call(this, order);

            case 2:
              return _context.abrupt("return", _context.sent.validation);

            case 3:
            case "end":
              return _context.stop();
          }
        }
      }, _callee, this);
    }));

    function validate(_x) {
      return _validate.apply(this, arguments);
    }

    return validate;
  }();

  _proto.validateBatch = /*#__PURE__*/function () {
    var _validateBatch = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(orders) {
      return _regeneratorRuntime().wrap(function _callee2$(_context2) {
        while (1) {
          switch (_context2.prev = _context2.next) {
            case 0:
              _context2.next = 2;
              return _OrderQuoter.prototype.quoteBatch.call(this, orders);

            case 2:
              return _context2.abrupt("return", _context2.sent.map(function (order) {
                return order.validation;
              }));

            case 3:
            case "end":
              return _context2.stop();
          }
        }
      }, _callee2, this);
    }));

    function validateBatch(_x2) {
      return _validateBatch.apply(this, arguments);
    }

    return validateBatch;
  }();

  return OrderValidator;
}(OrderQuoter);

function stripHexPrefix(a) {
  if (a.startsWith('0x')) {
    return a.slice(2);
  } else {
    return a;
  }
}

var DUTCH_LIMIT_ORDER_ABI = ['tuple(' + /*#__PURE__*/['tuple(address,uint256,uint256)', 'uint256', 'uint256', 'tuple(address,uint256)', 'tuple(address,uint256,uint256,address)[]'].join(',') + ')'];
var DutchLimitOrder = /*#__PURE__*/function () {
  function DutchLimitOrder(info, chainId, permitPostAddress) {
    this.info = void 0;
    this.chainId = void 0;
    this.permitPostAddress = void 0;
    this.permitPost = void 0;
    this.info = info;
    this.chainId = chainId;
    this.permitPostAddress = permitPostAddress;
    this.permitPost = new PermitPost(chainId, permitPostAddress);
  }

  DutchLimitOrder.parse = function parse(encoded, chainId) {
    var abiCoder = new ethers.ethers.utils.AbiCoder();
    var decoded = abiCoder.decode(DUTCH_LIMIT_ORDER_ABI, encoded);
    var _decoded$ = decoded[0],
        _decoded$$ = _decoded$[0],
        reactor = _decoded$$[0],
        nonce = _decoded$$[1],
        deadline = _decoded$$[2],
        startTime = _decoded$[1],
        endTime = _decoded$[2],
        _decoded$$2 = _decoded$[3],
        inputToken = _decoded$$2[0],
        inputAmount = _decoded$$2[1],
        outputs = _decoded$[4];
    return new DutchLimitOrder({
      reactor: reactor,
      nonce: nonce,
      deadline: deadline.toNumber(),
      startTime: startTime.toNumber(),
      endTime: endTime.toNumber(),
      input: {
        token: inputToken,
        amount: inputAmount
      },
      outputs: outputs.map(function (_ref) {
        var token = _ref[0],
            startAmount = _ref[1],
            endAmount = _ref[2],
            recipient = _ref[3];
        return {
          token: token,
          startAmount: startAmount,
          endAmount: endAmount,
          recipient: recipient
        };
      })
    }, chainId);
  }
  /**
   * @inheritdoc IOrder
   */
  ;

  var _proto = DutchLimitOrder.prototype;

  _proto.serialize = function serialize() {
    var abiCoder = new ethers.ethers.utils.AbiCoder();
    return abiCoder.encode(DUTCH_LIMIT_ORDER_ABI, [[[this.info.reactor, this.info.nonce, this.info.deadline], this.info.startTime, this.info.endTime, [this.info.input.token, this.info.input.amount], this.info.outputs.map(function (output) {
      return [output.token, output.startAmount, output.endAmount, output.recipient];
    })]]);
  }
  /**
   * @inheritdoc IOrder
   */
  ;

  _proto.getSigner = function getSigner(signature) {
    return ethers.ethers.utils.computeAddress(ethers.ethers.utils.recoverPublicKey(this.permitPost.getPermitDigest(this.permitData().values), signature));
  }
  /**
   * @inheritdoc IOrder
   */
  ;

  _proto.permitData = function permitData() {
    return this.permitPost.getPermitData({
      sigType: exports.SigType.Unordered,
      tokens: [{
        tokenType: exports.TokenType.ERC20,
        token: this.info.input.token,
        maxAmount: this.info.input.amount,
        id: ethers.BigNumber.from(0)
      }],
      spender: this.info.reactor,
      deadline: this.info.deadline,
      witness: this.hash(),
      nonce: this.info.nonce
    });
  }
  /**
   * @inheritdoc IOrder
   */
  ;

  _proto.hash = function hash() {
    return ethers.ethers.utils.keccak256(this.serialize());
  };

  return DutchLimitOrder;
}();

/**
 * Parses a given serialized order
 * @return Parsed order object
 */

function parseOrder(order) {
  // reactor address is always the first field in order
  var reactor = '0x' + stripHexPrefix(order).slice(0, 40).toLowerCase();

  if (!REVERSE_REACTOR_MAPPING[reactor]) {
    throw new MissingConfiguration('reactor', reactor);
  }

  var _REVERSE_REACTOR_MAPP = REVERSE_REACTOR_MAPPING[reactor],
      chainId = _REVERSE_REACTOR_MAPP.chainId,
      orderType = _REVERSE_REACTOR_MAPP.orderType;

  switch (orderType) {
    case OrderType.DutchLimit:
      return DutchLimitOrder.parse(order, chainId);

    default:
      throw new MissingConfiguration('orderType', orderType);
  }
}

/**
 * Builder for generating orders
 */

var OrderBuilder = /*#__PURE__*/function () {
  function OrderBuilder() {
    this.orderInfo = void 0;
    this.orderInfo = {};
  }

  var _proto = OrderBuilder.prototype;

  _proto.deadline = function deadline(_deadline) {
    !(_deadline > new Date().getTime() / 1000) ?  invariant(false, "Deadline must be in the future: " + _deadline)  : void 0;
    this.orderInfo.deadline = _deadline;
    return this;
  };

  _proto.nonce = function nonce(_nonce) {
    this.orderInfo.nonce = _nonce;
    return this;
  };

  _proto.reactor = function reactor(_reactor) {
    this.orderInfo.reactor = _reactor;
    return this;
  };

  _proto.getOrderInfo = function getOrderInfo() {
    !(this.orderInfo.reactor !== undefined) ?  invariant(false, 'reactor not set')  : void 0;
    !(this.orderInfo.nonce !== undefined) ?  invariant(false, 'nonce not set')  : void 0;
    !(this.orderInfo.deadline !== undefined) ?  invariant(false, 'deadline not set')  : void 0;
    return {
      reactor: this.orderInfo.reactor,
      nonce: this.orderInfo.nonce,
      deadline: this.orderInfo.deadline
    };
  };

  return OrderBuilder;
}();

/**
 * Helper builder for generating dutch limit orders
 */

var DutchLimitOrderBuilder = /*#__PURE__*/function (_OrderBuilder) {
  _inheritsLoose(DutchLimitOrderBuilder, _OrderBuilder);

  function DutchLimitOrderBuilder(chainId, reactorAddress, permitPostAddress) {
    var _this;

    _this = _OrderBuilder.call(this) || this;
    _this.chainId = void 0;
    _this.permitPostAddress = void 0;
    _this.info = void 0;
    _this.chainId = chainId;
    _this.permitPostAddress = permitPostAddress;

    if (reactorAddress) {
      _this.reactor(reactorAddress);
    } else if (REACTOR_ADDRESS_MAPPING[chainId] && REACTOR_ADDRESS_MAPPING[chainId][OrderType.DutchLimit]) {
      var _reactorAddress = REACTOR_ADDRESS_MAPPING[chainId][OrderType.DutchLimit];

      _this.reactor(_reactorAddress);
    } else {
      throw new MissingConfiguration('reactor', chainId.toString());
    }

    _this.info = {
      outputs: []
    };
    return _this;
  }

  var _proto = DutchLimitOrderBuilder.prototype;

  _proto.startTime = function startTime(_startTime) {
    !(!this.info.endTime || _startTime <= this.info.endTime) ?  invariant(false, "startTime must be before endTime: " + _startTime)  : void 0;
    !(!this.orderInfo.deadline || _startTime <= this.orderInfo.deadline) ?  invariant(false, "startTime must be before deadline: " + _startTime)  : void 0;
    this.info.startTime = _startTime;
    return this;
  };

  _proto.endTime = function endTime(_endTime) {
    !(!this.info.startTime || _endTime >= this.info.startTime) ?  invariant(false, "endTime must be after startTime: " + _endTime)  : void 0;
    !(!this.orderInfo.deadline || _endTime <= this.orderInfo.deadline) ?  invariant(false, "endTime must be before deadline: " + _endTime)  : void 0;
    this.info.endTime = _endTime;
    return this;
  };

  _proto.input = function input(_input) {
    this.info.input = _input;
    return this;
  };

  _proto.output = function output(_output) {
    if (!this.info.outputs) {
      this.info.outputs = [];
    }

    this.info.outputs.push(_output);
    return this;
  };

  _proto.deadline = function deadline(_deadline) {
    _OrderBuilder.prototype.deadline.call(this, _deadline);

    return this;
  };

  _proto.nonce = function nonce(_nonce) {
    _OrderBuilder.prototype.nonce.call(this, _nonce);

    return this;
  };

  _proto.build = function build() {
    !(this.info.startTime !== undefined) ?  invariant(false, 'startTime not set')  : void 0;
    !(this.info.endTime !== undefined) ?  invariant(false, 'endTime not set')  : void 0;
    !(this.info.input !== undefined) ?  invariant(false, 'input not set')  : void 0;
    !(this.info.outputs !== undefined && this.info.outputs.length !== 0) ?  invariant(false, 'outputs not set')  : void 0;
    return new DutchLimitOrder(Object.assign(this.getOrderInfo(), {
      startTime: this.info.startTime,
      endTime: this.info.endTime,
      input: this.info.input,
      outputs: this.info.outputs
    }), this.chainId, this.permitPostAddress);
  };

  return DutchLimitOrderBuilder;
}(OrderBuilder);

exports.DutchLimitOrder = DutchLimitOrder;
exports.DutchLimitOrderBuilder = DutchLimitOrderBuilder;
exports.NonceManager = NonceManager;
exports.OrderBuilder = OrderBuilder;
exports.OrderQuoter = OrderQuoter;
exports.OrderValidator = OrderValidator;
exports.PermitPost = PermitPost;
exports.buildNonce = buildNonce;
exports.getFirstUnsetBit = getFirstUnsetBit;
exports.parseOrder = parseOrder;
exports.setBit = setBit;
exports.splitNonce = splitNonce;
exports.stripHexPrefix = stripHexPrefix;
//# sourceMappingURL=gouda-sdk.cjs.development.js.map
