import { encodeAbiParameters, encodeFunctionData } from 'viem';

// src/smart-wallet/constants.ts
var DELEGATION_MAGIC_PREFIX = "0xef0100";
var SELF_CALL_TARGET = "0x0000000000000000000000000000000000000000";
var ModeType = /* @__PURE__ */ ((ModeType2) => {
  ModeType2["BATCHED_CALL"] = "0x0100000000000000000000000000000000000000000000000000000000000000";
  ModeType2["BATCHED_CALL_CAN_REVERT"] = "0x0101000000000000000000000000000000000000000000000000000000000000";
  return ModeType2;
})(ModeType || {});
var SupportedChainIds = ((SupportedChainIds2) => {
  SupportedChainIds2[SupportedChainIds2["MAINNET"] = 1 /* MAINNET */] = "MAINNET";
  SupportedChainIds2[SupportedChainIds2["UNICHAIN"] = 130 /* UNICHAIN */] = "UNICHAIN";
  SupportedChainIds2[SupportedChainIds2["UNICHAIN_SEPOLIA"] = 1301 /* UNICHAIN_SEPOLIA */] = "UNICHAIN_SEPOLIA";
  SupportedChainIds2[SupportedChainIds2["SEPOLIA"] = 11155111 /* SEPOLIA */] = "SEPOLIA";
  SupportedChainIds2[SupportedChainIds2["BASE"] = 8453 /* BASE */] = "BASE";
  SupportedChainIds2[SupportedChainIds2["OPTIMISM"] = 10 /* OPTIMISM */] = "OPTIMISM";
  SupportedChainIds2[SupportedChainIds2["BNB"] = 56 /* BNB */] = "BNB";
  SupportedChainIds2[SupportedChainIds2["ARBITRUM_ONE"] = 42161 /* ARBITRUM_ONE */] = "ARBITRUM_ONE";
  SupportedChainIds2[SupportedChainIds2["XLAYER"] = 196 /* XLAYER */] = "XLAYER";
  return SupportedChainIds2;
})(SupportedChainIds || {});
var SmartWalletVersion = /* @__PURE__ */ ((SmartWalletVersion2) => {
  SmartWalletVersion2["LATEST"] = "latest";
  SmartWalletVersion2["v1_0_0"] = "v1.0.0";
  SmartWalletVersion2["v1_0_0_staging"] = "v1.0.0-staging";
  return SmartWalletVersion2;
})(SmartWalletVersion || {});
var SMART_WALLET_VERSIONS = {
  [SupportedChainIds.MAINNET]: {
    ["latest" /* LATEST */]: "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00",
    ["v1.0.0" /* v1_0_0 */]: "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00",
    ["v1.0.0-staging" /* v1_0_0_staging */]: "0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5"
  },
  [SupportedChainIds.UNICHAIN]: {
    ["latest" /* LATEST */]: "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00",
    ["v1.0.0" /* v1_0_0 */]: "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00",
    ["v1.0.0-staging" /* v1_0_0_staging */]: "0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5"
  },
  [SupportedChainIds.BASE]: {
    ["latest" /* LATEST */]: "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00",
    ["v1.0.0" /* v1_0_0 */]: "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00",
    ["v1.0.0-staging" /* v1_0_0_staging */]: "0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5"
  },
  [SupportedChainIds.OPTIMISM]: {
    ["latest" /* LATEST */]: "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00",
    ["v1.0.0" /* v1_0_0 */]: "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00",
    ["v1.0.0-staging" /* v1_0_0_staging */]: "0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5"
  },
  [SupportedChainIds.BNB]: {
    ["latest" /* LATEST */]: "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00",
    ["v1.0.0" /* v1_0_0 */]: "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00",
    ["v1.0.0-staging" /* v1_0_0_staging */]: "0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5"
  },
  [SupportedChainIds.ARBITRUM_ONE]: {
    ["latest" /* LATEST */]: "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00",
    ["v1.0.0" /* v1_0_0 */]: "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00"
  },
  [SupportedChainIds.UNICHAIN_SEPOLIA]: {
    ["latest" /* LATEST */]: "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00",
    ["v1.0.0" /* v1_0_0 */]: "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00",
    ["v1.0.0-staging" /* v1_0_0_staging */]: "0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5"
  },
  [SupportedChainIds.SEPOLIA]: {
    ["latest" /* LATEST */]: "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00",
    ["v1.0.0" /* v1_0_0 */]: "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00",
    ["v1.0.0-staging" /* v1_0_0_staging */]: "0x3cbad1e3b9049ecdb9588fb48dd61d80faf41bd5"
  },
  [SupportedChainIds.XLAYER]: {
    ["latest" /* LATEST */]: "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00",
    ["v1.0.0" /* v1_0_0 */]: "0x000000009B1D0aF20D8C6d0A44e162d11F9b8f00"
  }
};
var SMART_WALLET_ADDRESSES = (() => {
  const entries = Object.entries(SMART_WALLET_VERSIONS).map(([chainId, versions]) => [
    chainId,
    versions["latest" /* LATEST */]
  ]);
  const map = Object.fromEntries(entries);
  Object.setPrototypeOf(map, null);
  return map;
})();
var getAllSmartWalletVersions = (chainId) => {
  return Object.values(SMART_WALLET_VERSIONS[chainId]);
};
function getSmartWalletAddress(chainIdLike) {
  const normalized = typeof chainIdLike === "string" ? Number(chainIdLike) : chainIdLike;
  const isValid = typeof normalized === "number" && Number.isFinite(normalized) && Number.isInteger(normalized);
  if (!isValid || !Object.prototype.hasOwnProperty.call(SMART_WALLET_ADDRESSES, normalized)) {
    throw new Error(`Smart wallet not found for chainId: ${chainIdLike}`);
  }
  return SMART_WALLET_ADDRESSES[normalized];
}
var CALL_ABI_PARAMS = [
  {
    type: "tuple[]",
    components: [
      { type: "address", name: "to" },
      { type: "uint256", name: "value" },
      { type: "bytes", name: "data" }
    ]
  }
];
var CallPlanner = class {
  /**
   * Create a new CallPlanner
   * @param calls optionally initialize with a list of calls
   */
  constructor(calls = []) {
    this.calls = calls;
  }
  /**
   * Get the total value of the calls
   */
  get value() {
    return this.calls.reduce((acc, call) => {
      const callValue = typeof call.value === "string" ? BigInt(call.value || "0") : call.value || 0n;
      return acc + callValue;
    }, 0n);
  }
  /**
   * abi encode the Calls[]
   */
  encode() {
    if (this.calls.length === 0) {
      throw new Error("No calls to encode");
    }
    return encodeAbiParameters(CALL_ABI_PARAMS, [this.calls]);
  }
  /**
   * Add a command to execute a call
   * @param to The target address of the call
   * @param value The ETH value to send with the call
   * @param data The calldata for the call
   */
  add(to, value, data) {
    this.calls.push({ to, value, data });
    return this;
  }
};

// src/smart-wallet/abis/MinimalDelegationEntry.json
var MinimalDelegationEntry_default = [
  {
    type: "fallback",
    stateMutability: "payable"
  },
  {
    type: "receive",
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "CUSTOM_STORAGE_ROOT",
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
    name: "ENTRY_POINT",
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
    name: "allowance",
    inputs: [
      {
        name: "spender",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "allowance",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "approveNative",
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
    name: "approveNativeTransient",
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
    name: "domainBytes",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "domainSeparator",
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
    name: "eip712Domain",
    inputs: [],
    outputs: [
      {
        name: "fields",
        type: "bytes1",
        internalType: "bytes1"
      },
      {
        name: "name",
        type: "string",
        internalType: "string"
      },
      {
        name: "version",
        type: "string",
        internalType: "string"
      },
      {
        name: "chainId",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "verifyingContract",
        type: "address",
        internalType: "address"
      },
      {
        name: "salt",
        type: "bytes32",
        internalType: "bytes32"
      },
      {
        name: "extensions",
        type: "uint256[]",
        internalType: "uint256[]"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "erc1271CallerIsSafe",
    inputs: [
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
    name: "execute",
    inputs: [
      {
        name: "signedBatchedCall",
        type: "tuple",
        internalType: "struct SignedBatchedCall",
        components: [
          {
            name: "batchedCall",
            type: "tuple",
            internalType: "struct BatchedCall",
            components: [
              {
                name: "calls",
                type: "tuple[]",
                internalType: "struct Call[]",
                components: [
                  {
                    name: "to",
                    type: "address",
                    internalType: "address"
                  },
                  {
                    name: "value",
                    type: "uint256",
                    internalType: "uint256"
                  },
                  {
                    name: "data",
                    type: "bytes",
                    internalType: "bytes"
                  }
                ]
              },
              {
                name: "revertOnFailure",
                type: "bool",
                internalType: "bool"
              }
            ]
          },
          {
            name: "nonce",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "keyHash",
            type: "bytes32",
            internalType: "bytes32"
          },
          {
            name: "executor",
            type: "address",
            internalType: "address"
          }
        ]
      },
      {
        name: "wrappedSignature",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    outputs: [],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "execute",
    inputs: [
      {
        name: "batchedCall",
        type: "tuple",
        internalType: "struct BatchedCall",
        components: [
          {
            name: "calls",
            type: "tuple[]",
            internalType: "struct Call[]",
            components: [
              {
                name: "to",
                type: "address",
                internalType: "address"
              },
              {
                name: "value",
                type: "uint256",
                internalType: "uint256"
              },
              {
                name: "data",
                type: "bytes",
                internalType: "bytes"
              }
            ]
          },
          {
            name: "revertOnFailure",
            type: "bool",
            internalType: "bool"
          }
        ]
      }
    ],
    outputs: [],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "execute",
    inputs: [
      {
        name: "mode",
        type: "bytes32",
        internalType: "bytes32"
      },
      {
        name: "executionData",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    outputs: [],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "executeUserOp",
    inputs: [
      {
        name: "userOp",
        type: "tuple",
        internalType: "struct PackedUserOperation",
        components: [
          {
            name: "sender",
            type: "address",
            internalType: "address"
          },
          {
            name: "nonce",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "initCode",
            type: "bytes",
            internalType: "bytes"
          },
          {
            name: "callData",
            type: "bytes",
            internalType: "bytes"
          },
          {
            name: "accountGasLimits",
            type: "bytes32",
            internalType: "bytes32"
          },
          {
            name: "preVerificationGas",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "gasFees",
            type: "bytes32",
            internalType: "bytes32"
          },
          {
            name: "paymasterAndData",
            type: "bytes",
            internalType: "bytes"
          },
          {
            name: "signature",
            type: "bytes",
            internalType: "bytes"
          }
        ]
      },
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "getKey",
    inputs: [
      {
        name: "keyHash",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct Key",
        components: [
          {
            name: "keyType",
            type: "uint8",
            internalType: "enum KeyType"
          },
          {
            name: "publicKey",
            type: "bytes",
            internalType: "bytes"
          }
        ]
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getKeySettings",
    inputs: [
      {
        name: "keyHash",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "Settings"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getSeq",
    inputs: [
      {
        name: "key",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "seq",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "hashTypedData",
    inputs: [
      {
        name: "hash",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
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
    name: "invalidateNonce",
    inputs: [
      {
        name: "newNonce",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "isRegistered",
    inputs: [
      {
        name: "keyHash",
        type: "bytes32",
        internalType: "bytes32"
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
    name: "isValidSignature",
    inputs: [
      {
        name: "digest",
        type: "bytes32",
        internalType: "bytes32"
      },
      {
        name: "wrappedSignature",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bytes4",
        internalType: "bytes4"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "keyAt",
    inputs: [
      {
        name: "i",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct Key",
        components: [
          {
            name: "keyType",
            type: "uint8",
            internalType: "enum KeyType"
          },
          {
            name: "publicKey",
            type: "bytes",
            internalType: "bytes"
          }
        ]
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "keyCount",
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
    name: "namespaceAndVersion",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string"
      }
    ],
    stateMutability: "pure"
  },
  {
    type: "function",
    name: "register",
    inputs: [
      {
        name: "key",
        type: "tuple",
        internalType: "struct Key",
        components: [
          {
            name: "keyType",
            type: "uint8",
            internalType: "enum KeyType"
          },
          {
            name: "publicKey",
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
    name: "revoke",
    inputs: [
      {
        name: "keyHash",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setERC1271CallerIsSafe",
    inputs: [
      {
        name: "caller",
        type: "address",
        internalType: "address"
      },
      {
        name: "isSafe",
        type: "bool",
        internalType: "bool"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "supportsExecutionMode",
    inputs: [
      {
        name: "mode",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
    outputs: [
      {
        name: "result",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "pure"
  },
  {
    type: "function",
    name: "transferFromNative",
    inputs: [
      {
        name: "from",
        type: "address",
        internalType: "address"
      },
      {
        name: "recipient",
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
    name: "transferFromNativeTransient",
    inputs: [
      {
        name: "from",
        type: "address",
        internalType: "address"
      },
      {
        name: "recipient",
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
    name: "transientAllowance",
    inputs: [
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
    name: "update",
    inputs: [
      {
        name: "keyHash",
        type: "bytes32",
        internalType: "bytes32"
      },
      {
        name: "settings",
        type: "uint256",
        internalType: "Settings"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "updateEntryPoint",
    inputs: [
      {
        name: "entryPoint",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "validateUserOp",
    inputs: [
      {
        name: "userOp",
        type: "tuple",
        internalType: "struct PackedUserOperation",
        components: [
          {
            name: "sender",
            type: "address",
            internalType: "address"
          },
          {
            name: "nonce",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "initCode",
            type: "bytes",
            internalType: "bytes"
          },
          {
            name: "callData",
            type: "bytes",
            internalType: "bytes"
          },
          {
            name: "accountGasLimits",
            type: "bytes32",
            internalType: "bytes32"
          },
          {
            name: "preVerificationGas",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "gasFees",
            type: "bytes32",
            internalType: "bytes32"
          },
          {
            name: "paymasterAndData",
            type: "bytes",
            internalType: "bytes"
          },
          {
            name: "signature",
            type: "bytes",
            internalType: "bytes"
          }
        ]
      },
      {
        name: "userOpHash",
        type: "bytes32",
        internalType: "bytes32"
      },
      {
        name: "missingAccountFunds",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "validationData",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "event",
    name: "ApproveNative",
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
    name: "ApproveNativeTransient",
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
    name: "EIP712DomainChanged",
    inputs: [],
    anonymous: false
  },
  {
    type: "event",
    name: "EntryPointUpdated",
    inputs: [
      {
        name: "newEntryPoint",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "NonceInvalidated",
    inputs: [
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
    type: "event",
    name: "Registered",
    inputs: [
      {
        name: "keyHash",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32"
      },
      {
        name: "key",
        type: "tuple",
        indexed: false,
        internalType: "struct Key",
        components: [
          {
            name: "keyType",
            type: "uint8",
            internalType: "enum KeyType"
          },
          {
            name: "publicKey",
            type: "bytes",
            internalType: "bytes"
          }
        ]
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Revoked",
    inputs: [
      {
        name: "keyHash",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "TransferFromNative",
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
    type: "event",
    name: "TransferFromNativeTransient",
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
    name: "AllowanceExceeded",
    inputs: []
  },
  {
    type: "error",
    name: "CallFailed",
    inputs: [
      {
        name: "reason",
        type: "bytes",
        internalType: "bytes"
      }
    ]
  },
  {
    type: "error",
    name: "CannotRegisterRootKey",
    inputs: []
  },
  {
    type: "error",
    name: "CannotUpdateRootKey",
    inputs: []
  },
  {
    type: "error",
    name: "ECDSAInvalidSignature",
    inputs: []
  },
  {
    type: "error",
    name: "ECDSAInvalidSignatureLength",
    inputs: [
      {
        name: "length",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "ECDSAInvalidSignatureS",
    inputs: [
      {
        name: "s",
        type: "bytes32",
        internalType: "bytes32"
      }
    ]
  },
  {
    type: "error",
    name: "ExcessiveInvalidation",
    inputs: []
  },
  {
    type: "error",
    name: "FnSelectorNotRecognized",
    inputs: []
  },
  {
    type: "error",
    name: "IncorrectSender",
    inputs: []
  },
  {
    type: "error",
    name: "IndexOutOfBounds",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidHookResponse",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidNonce",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidSignature",
    inputs: []
  },
  {
    type: "error",
    name: "KeyDoesNotExist",
    inputs: []
  },
  {
    type: "error",
    name: "KeyExpired",
    inputs: [
      {
        name: "expiration",
        type: "uint40",
        internalType: "uint40"
      }
    ]
  },
  {
    type: "error",
    name: "NotEntryPoint",
    inputs: []
  },
  {
    type: "error",
    name: "OnlyAdminCanSelfCall",
    inputs: []
  },
  {
    type: "error",
    name: "TransferNativeFailed",
    inputs: []
  },
  {
    type: "error",
    name: "Unauthorized",
    inputs: []
  },
  {
    type: "error",
    name: "UnsupportedExecutionMode",
    inputs: []
  }
];
var BATCHED_CALL_ABI_PARAMS = [
  {
    type: "tuple",
    components: [
      {
        type: "tuple[]",
        components: [
          { type: "address", name: "to" },
          { type: "uint256", name: "value" },
          { type: "bytes", name: "data" }
        ],
        name: "calls"
      },
      { type: "bool", name: "revertOnFailure" }
    ]
  }
];
var BatchedCallPlanner = class {
  /**
   * Create a new BatchedCallPlanner
   * @param callPlanner optionally initialize with a CallPlanner
   * @param revertOnFailure optionally initialize with a boolean for revertOnFailure
   */
  constructor(callPlanner, revertOnFailure = true) {
    this.callPlanner = callPlanner;
    this.revertOnFailure = revertOnFailure;
  }
  /**
   * Get the total value of the calls
   */
  get value() {
    return this.callPlanner.value;
  }
  /**
   * Add a command to execute a call
   * @param to The target address of the call
   * @param value The ETH value to send with the call
   * @param data The calldata for the call
   */
  add(to, value, data) {
    this.callPlanner.add(to, value, data);
    return this;
  }
  /**
   * Encode the BatchedCall
   */
  encode() {
    return encodeAbiParameters(BATCHED_CALL_ABI_PARAMS, [
      {
        calls: this.callPlanner.calls,
        revertOnFailure: this.revertOnFailure
      }
    ]);
  }
  toBatchedCall() {
    return {
      calls: this.callPlanner.calls,
      revertOnFailure: this.revertOnFailure
    };
  }
};

// src/smart-wallet/smartWallet.ts
var SmartWallet = class {
  /**
   * Creates method parameters for executing a simple batch of calls through a smart wallet
   * @param calls Array of calls to encode
   * @param options Basic options for the execution
   * @returns Method parameters with calldata and value
   */
  static encodeBatchedCall(calls, options = {}) {
    const planner = new CallPlanner(calls);
    const batchedCallPlanner = new BatchedCallPlanner(planner, options.revertOnFailure);
    const encoded = encodeFunctionData({
      abi: MinimalDelegationEntry_default,
      functionName: "0x99e1d016",
      // execute(((address,uint256,bytes)[],bool))
      args: [batchedCallPlanner.toBatchedCall()]
    });
    return {
      calldata: encoded,
      value: planner.value
    };
  }
  /**
   * ERC7821 compatible entrypoint for executing batched calls through the contract
   * @deprecated use encodeBatchedCall instead unless you need to use the ERC7821 entrypoint
   */
  static encodeERC7821BatchedCall(calls, options = {}) {
    const mode = this.getModeFromOptions(options);
    if (mode != "0x0100000000000000000000000000000000000000000000000000000000000000" /* BATCHED_CALL */ && mode != "0x0101000000000000000000000000000000000000000000000000000000000000" /* BATCHED_CALL_CAN_REVERT */) {
      throw new Error(`Invalid mode: ${mode}`);
    }
    const planner = new CallPlanner(calls);
    const executionData = planner.encode();
    const encoded = this._encodeERC7821Execute(mode, executionData);
    return {
      calldata: encoded,
      value: planner.value
    };
  }
  /**
   * Creates a call to execute a method through a smart wallet
   * @dev can be refactored to return a Transaction object as well
   * @param methodParameters The method parameters to execute
   * @param chainId The chain ID for the smart wallet
   * @returns The call to execute
   */
  static createExecute(methodParameters, chainId) {
    const address = getSmartWalletAddress(chainId);
    return {
      to: address,
      data: methodParameters.calldata,
      value: methodParameters.value
    };
  }
  /**
   * Get the mode type from the options
   */
  static getModeFromOptions(options) {
    if (options.revertOnFailure) {
      return "0x0100000000000000000000000000000000000000000000000000000000000000" /* BATCHED_CALL */;
    }
    return "0x0101000000000000000000000000000000000000000000000000000000000000" /* BATCHED_CALL_CAN_REVERT */;
  }
  /** Internal methods */
  static _encodeERC7821Execute(mode, data) {
    return encodeFunctionData({
      abi: MinimalDelegationEntry_default,
      functionName: "0xe9ae5c53",
      // execute(bytes32,bytes)
      args: [mode, data]
    });
  }
};

// src/smart-wallet/index.ts
var VERSION = "0.1.0";

export { CALL_ABI_PARAMS, CallPlanner, DELEGATION_MAGIC_PREFIX, ModeType, SELF_CALL_TARGET, SMART_WALLET_ADDRESSES, SMART_WALLET_VERSIONS, SmartWallet, SmartWalletVersion, SupportedChainIds, VERSION, getAllSmartWalletVersions, getSmartWalletAddress };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map