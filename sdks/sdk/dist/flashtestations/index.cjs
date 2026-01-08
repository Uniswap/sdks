'use strict';

var utils = require('viem/utils');
var viem = require('viem');

// src/flashtestations/types/index.ts
var NetworkError = class _NetworkError extends Error {
  constructor(message, cause) {
    super(message);
    this.cause = cause;
    this.name = "NetworkError";
    Object.setPrototypeOf(this, _NetworkError.prototype);
  }
};
var BlockNotFoundError = class _BlockNotFoundError extends Error {
  constructor(blockParameter) {
    super(`Block not found: ${blockParameter}`);
    this.blockParameter = blockParameter;
    this.name = "BlockNotFoundError";
    Object.setPrototypeOf(this, _BlockNotFoundError.prototype);
  }
};
var ValidationError = class _ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.field = field;
    this.name = "ValidationError";
    Object.setPrototypeOf(this, _ValidationError.prototype);
  }
};
var ChainNotSupportedError = class _ChainNotSupportedError extends Error {
  constructor(chainId, supportedChains) {
    super(
      `Chain ${chainId} not supported. Supported chains: ${supportedChains.join(
        ", "
      )}`
    );
    this.chainId = chainId;
    this.supportedChains = supportedChains;
    this.name = "ChainNotSupportedError";
    Object.setPrototypeOf(this, _ChainNotSupportedError.prototype);
  }
};

// src/flashtestations/config/chains.ts
var CHAIN_CONFIGS = {
  // Unichain Mainnet
  130: {
    chainId: 130,
    name: "Unichain Mainnet",
    slug: "unichain-mainnet",
    contractAddress: "0xd44f9d1331659F417a3E22C9e29529D498B66A29",
    defaultRpcUrl: process.env.RPC_URL || "https://mainnet.unichain.org",
    blockExplorerUrl: "https://uniscan.xyz"
  },
  // Unichain Sepolia (Testnet)
  1301: {
    chainId: 1301,
    name: "Unichain Sepolia",
    slug: "unichain-sepolia",
    contractAddress: "0x3b03b3caabd49ca12de9eba46a6a2950700b1db4",
    defaultRpcUrl: process.env.RPC_URL || "https://sepolia.unichain.org",
    blockExplorerUrl: "https://sepolia.uniscan.xyz"
  },
  // Unichain Alphanet (Testnet)
  22444422: {
    chainId: 22444422,
    name: "Unichain Alphanet",
    slug: "unichain-alphanet",
    contractAddress: "0x8d0e3f57052f33CEF1e6BE98B65aad1794dc95a5",
    defaultRpcUrl: process.env.RPC_URL || "",
    // note, we don't include the RPC URL for alphanet because Unichain doesn't want to expose it to the public
    blockExplorerUrl: ""
  },
  // Unichain Experimental (Testnet)
  420120005: {
    chainId: 420120005,
    name: "Unichain Experimental",
    slug: "unichain-experimental",
    contractAddress: "0x80dcdE10eE31E0A32B8944b39e8AE21d47984b4e",
    defaultRpcUrl: process.env.RPC_URL || "",
    // note, we don't include the RPC URL for experimental because Unichain doesn't want to expose it to the public
    blockExplorerUrl: ""
  }
};
function getContractAddress(chainId) {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new ChainNotSupportedError(chainId, getSupportedChains());
  }
  return config.contractAddress;
}
function getRpcUrl(chainId) {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new ChainNotSupportedError(chainId, getSupportedChains());
  }
  return config.defaultRpcUrl;
}
function getBlockExplorerUrl(chainId) {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new ChainNotSupportedError(chainId, getSupportedChains());
  }
  return config.blockExplorerUrl;
}
function getChainConfig(chainId) {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new ChainNotSupportedError(chainId, getSupportedChains());
  }
  return config;
}
function getSupportedChains() {
  return Object.keys(CHAIN_CONFIGS).map(Number);
}
function isChainSupported(chainId) {
  return chainId in CHAIN_CONFIGS;
}

// src/flashtestations/types/validation.ts
function isValidHex(value, expectedLength) {
  const cleanHex = value.startsWith("0x") ? value.slice(2) : value;
  const hexRegex = /^[0-9a-fA-F]+$/;
  if (!hexRegex.test(cleanHex)) {
    return false;
  }
  if (expectedLength && cleanHex.length !== expectedLength) {
    return false;
  }
  return true;
}
function validateHex(value, expectedLength, fieldName) {
  if (!isValidHex(value, expectedLength)) {
    const cleanHex = value.startsWith("0x") ? value.slice(2) : value;
    throw new ValidationError(
      `Invalid ${fieldName}: expected ${expectedLength} hex characters, got ${cleanHex.length}`,
      fieldName
    );
  }
}
function validateWorkloadMeasurementRegisters(registers) {
  validateHex(registers.tdattributes, 16, "tdattributes");
  validateHex(registers.xfam, 16, "xfam");
  if (Array.isArray(registers.mrtd)) {
    if (registers.mrtd.length === 0) {
      throw new ValidationError("mrtd array cannot be empty", "mrtd");
    }
    registers.mrtd.forEach((value, index) => {
      validateHex(value, 96, `mrtd[${index}]`);
    });
  } else {
    validateHex(registers.mrtd, 96, "mrtd");
  }
  validateHex(registers.mrconfigid, 96, "mrconfigid");
  if (Array.isArray(registers.rtmr0)) {
    if (registers.rtmr0.length === 0) {
      throw new ValidationError("rtmr0 array cannot be empty", "rtmr0");
    }
    registers.rtmr0.forEach((value, index) => {
      validateHex(value, 96, `rtmr0[${index}]`);
    });
  } else {
    validateHex(registers.rtmr0, 96, "rtmr0");
  }
  validateHex(registers.rtmr1, 96, "rtmr1");
  validateHex(registers.rtmr2, 96, "rtmr2");
  validateHex(registers.rtmr3, 96, "rtmr3");
}
function validateSingularWorkloadMeasurementRegisters(registers) {
  if (Array.isArray(registers.mrtd)) {
    throw new ValidationError("mrtd must be a single value, not an array", "mrtd");
  }
  if (Array.isArray(registers.rtmr0)) {
    throw new ValidationError("rtmr0 must be a single value, not an array", "rtmr0");
  }
  validateWorkloadMeasurementRegisters(registers);
}

// src/flashtestations/crypto/workload.ts
function hexToBytes(hex) {
  const unprefixedHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (unprefixedHex.length % 2 !== 0) throw new Error("Invalid hex string");
  return Uint8Array.from(unprefixedHex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
}
function concatBytes(...arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
function computeWorkloadId(registers) {
  validateSingularWorkloadMeasurementRegisters(registers);
  const mrTd = hexToBytes(registers.mrtd);
  const rtMr0 = hexToBytes(registers.rtmr0);
  const rtMr1 = hexToBytes(registers.rtmr1);
  const rtMr2 = hexToBytes(registers.rtmr2);
  const rtMr3 = hexToBytes(registers.rtmr3);
  const mrConfigId = hexToBytes(registers.mrconfigid);
  const xFAM = hexToBytes(registers.xfam);
  const tdAttributes = hexToBytes(registers.tdattributes);
  return utils.keccak256(
    concatBytes(mrTd, rtMr0, rtMr1, rtMr2, rtMr3, mrConfigId, xFAM, tdAttributes)
  );
}
function expandToSingularRegisters(registers) {
  validateWorkloadMeasurementRegisters(registers);
  const mrTdValues = Array.isArray(registers.mrtd) ? registers.mrtd : [registers.mrtd];
  const rtMr0Values = Array.isArray(registers.rtmr0) ? registers.rtmr0 : [registers.rtmr0];
  const result = [];
  for (const mrtd of mrTdValues) {
    for (const rtmr0 of rtMr0Values) {
      result.push({
        tdattributes: registers.tdattributes,
        xfam: registers.xfam,
        mrtd,
        mrconfigid: registers.mrconfigid,
        rtmr0,
        rtmr1: registers.rtmr1,
        rtmr2: registers.rtmr2,
        rtmr3: registers.rtmr3
      });
    }
  }
  return result;
}
function computeAllWorkloadIds(registers) {
  const singularRegisters = expandToSingularRegisters(registers);
  return singularRegisters.map((singular) => computeWorkloadId(singular));
}

// src/flashtestations/rpc/abi.ts
var flashtestationAbi = [
  {
    type: "event",
    name: "BlockBuilderProofVerified",
    inputs: [
      {
        indexed: false,
        name: "caller",
        type: "address"
      },
      {
        indexed: false,
        name: "workloadId",
        type: "bytes32"
      },
      {
        indexed: false,
        name: "version",
        type: "uint8"
      },
      {
        indexed: false,
        name: "blockContentHash",
        type: "bytes32"
      },
      {
        indexed: false,
        name: "commitHash",
        type: "string"
      }
    ]
  },
  {
    type: "function",
    name: "getWorkloadMetadata",
    inputs: [
      {
        name: "workloadId",
        type: "bytes32",
        internalType: "WorkloadId"
      }
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct IBlockBuilderPolicy.WorkloadMetadata",
        components: [
          {
            name: "commitHash",
            type: "string",
            internalType: "string"
          },
          {
            name: "sourceLocators",
            type: "string[]",
            internalType: "string[]"
          }
        ]
      }
    ],
    stateMutability: "view"
  }
];

// src/flashtestations/rpc/client.ts
var clientCache = /* @__PURE__ */ new Map();
function getClientKey(chainId, rpcUrl) {
  return `${chainId}:${rpcUrl}`;
}
function createChainFromId(chainId) {
  const config = getChainConfig(chainId);
  return {
    id: chainId,
    name: config.name,
    nativeCurrency: {
      name: "Ether",
      symbol: "ETH",
      decimals: 18
    },
    rpcUrls: {
      default: {
        http: [config.defaultRpcUrl]
      }
    },
    blockExplorers: {
      default: {
        name: "Explorer",
        url: config.blockExplorerUrl
      }
    }
  };
}
function toViemBlockParameter(blockParam) {
  if (blockParam === "earliest" || blockParam === "latest" || blockParam === "safe" || blockParam === "finalized" || blockParam === "pending") {
    return { blockTag: blockParam };
  }
  if (typeof blockParam === "bigint") {
    return { blockNumber: blockParam };
  }
  if (typeof blockParam === "string") {
    if (blockParam.startsWith("0x")) {
      if (blockParam.length === 66) {
        return { blockHash: blockParam };
      }
      return { blockNumber: BigInt(blockParam) };
    }
    return { blockNumber: BigInt(blockParam) };
  }
  return { blockNumber: BigInt(blockParam) };
}
async function retry(fn, maxRetries, initialDelay) {
  let lastError;
  let delay = initialDelay;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (lastError instanceof BlockNotFoundError) {
        throw lastError;
      }
      if (attempt === maxRetries) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new NetworkError(
    `Failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
    lastError
  );
}
var RpcClient = class {
  /**
   * Create a new RPC client
   * @param config - Configuration for the RPC client
   */
  constructor(config) {
    this.config = {
      chainId: config.chainId,
      rpcUrl: config.rpcUrl || getRpcUrl(config.chainId),
      maxRetries: config.maxRetries ?? 3,
      initialRetryDelay: config.initialRetryDelay ?? 1e3
    };
    if (!this.config.rpcUrl) {
      throw new Error("rpcUrl argument is required in RpcClient constructor, but was not provided");
    }
    const cacheKey = getClientKey(this.config.chainId, this.config.rpcUrl);
    const cachedClient = clientCache.get(cacheKey);
    if (cachedClient) {
      this.client = cachedClient;
    } else {
      const chain = createChainFromId(this.config.chainId);
      this.client = viem.createPublicClient({
        chain,
        transport: viem.http(this.config.rpcUrl, {
          timeout: 3e4
          // 30 second timeout
        })
      });
      clientCache.set(cacheKey, this.client);
    }
  }
  /**
   * Get a block by block parameter
   * @param blockParameter - Block identifier (tag, number, hash, or hex)
   * @returns Block data
   * @throws BlockNotFoundError if block doesn't exist
   * @throws NetworkError if RPC connection fails
   */
  async getBlock(blockParameter) {
    return retry(
      async () => {
        try {
          const viemBlockParam = toViemBlockParameter(blockParameter);
          const block = await this.client.getBlock(viemBlockParam);
          if (!block) {
            throw new BlockNotFoundError(blockParameter);
          }
          return block;
        } catch (error) {
          if (error instanceof BlockNotFoundError) {
            throw error;
          }
          const err = error;
          if (err.message?.includes("not found") || err.message?.includes("does not exist")) {
            throw new BlockNotFoundError(blockParameter);
          }
          throw error;
        }
      },
      this.config.maxRetries,
      this.config.initialRetryDelay
    );
  }
  /**
   * Get a transaction receipt by transaction hash
   * @param txHash - Transaction hash
   * @returns Transaction receipt
   * @throws NetworkError if RPC connection fails
   */
  async getTransactionReceipt(txHash) {
    return retry(
      async () => {
        const receipt = await this.client.getTransactionReceipt({
          hash: txHash
        });
        if (!receipt) {
          throw new Error(`Transaction receipt not found: ${txHash}`);
        }
        return receipt;
      },
      this.config.maxRetries,
      this.config.initialRetryDelay
    );
  }
  /**
   * Get source locators for a workload ID from the BlockBuilderPolicy contract
   * @param workloadId - The workload ID (bytes32 hex string)
   * @returns Array of source locator strings
   * @throws NetworkError if RPC connection fails
   */
  async getSourceLocators(workloadId) {
    return retry(
      async () => {
        const contractAddress = getContractAddress(this.config.chainId);
        const result = await this.client.readContract({
          address: contractAddress,
          abi: flashtestationAbi,
          functionName: "getWorkloadMetadata",
          args: [workloadId]
        });
        return result.sourceLocators;
      },
      this.config.maxRetries,
      this.config.initialRetryDelay
    );
  }
  /**
   * Get a flashtestation event by transaction hash
   * Checks if the transaction emitted a BlockBuilderProofVerified event
   * @param txHash - Transaction hash
   * @returns FlashtestationEvent data if it's a flashtestation tx, null otherwise
   * @throws NetworkError if RPC connection fails
   */
  async getFlashtestationEvent(blockParameter = "latest") {
    return retry(
      async () => {
        const block = await this.getBlock(blockParameter);
        if (!block.transactions || block.transactions.length === 0) {
          return null;
        }
        const txHash = block.transactions[block.transactions.length - 1];
        const receipt = await this.client.getTransactionReceipt({
          hash: txHash
        });
        if (!receipt) {
          return null;
        }
        const parsedLogs = viem.parseEventLogs({
          abi: flashtestationAbi,
          eventName: "BlockBuilderProofVerified",
          logs: receipt.logs
        });
        if (parsedLogs.length > 0) {
          if (parsedLogs.length !== 1) {
            throw new Error("Expected exactly one BlockBuilderProofVerified event");
          }
          const log = parsedLogs[0];
          const args = log.args;
          const sourceLocators = await this.getSourceLocators(args.workloadId);
          return {
            caller: args.caller,
            workloadId: args.workloadId,
            version: args.version,
            blockContentHash: args.blockContentHash,
            commitHash: args.commitHash,
            sourceLocators
          };
        }
        return null;
      },
      this.config.maxRetries,
      this.config.initialRetryDelay
    );
  }
  /**
   * Get the underlying viem PublicClient
   * @returns The viem PublicClient instance
   */
  getClient() {
    return this.client;
  }
  /**
   * Clear the client cache (useful for testing)
   */
  static clearCache() {
    clientCache.clear();
  }
};

// src/flashtestations/verification/service.ts
async function getFlashtestationEvent(blockParameter = "latest", config) {
  const client = new RpcClient({
    chainId: config.chainId,
    rpcUrl: config.rpcUrl
  });
  return await client.getFlashtestationEvent(blockParameter);
}
async function verifyFlashtestationInBlock(workloadIdOrRegisters, blockParameter, config) {
  let workloadIds;
  if (typeof workloadIdOrRegisters === "string") {
    workloadIds = [workloadIdOrRegisters];
  } else {
    workloadIds = computeAllWorkloadIds(workloadIdOrRegisters);
  }
  workloadIds = workloadIds.map((id) => {
    if (!id.startsWith("0x")) {
      id = "0x" + id;
    }
    return id.toLowerCase();
  });
  const client = new RpcClient({
    chainId: config.chainId,
    rpcUrl: config.rpcUrl
  });
  const flashtestationEvent = await client.getFlashtestationEvent(blockParameter);
  if (!flashtestationEvent) {
    return {
      isBuiltByExpectedTee: false,
      blockExplorerLink: null,
      workloadMetadata: null
    };
  }
  const blockExplorerBaseUrl = getBlockExplorerUrl(config.chainId);
  const block = await client.getBlock(blockParameter);
  let blockExplorerLink = null;
  if (blockExplorerBaseUrl) {
    blockExplorerLink = `${blockExplorerBaseUrl}/block/${block.number}`;
  }
  const eventWorkloadId = flashtestationEvent.workloadId.toLowerCase();
  const workloadMatches = workloadIds.includes(eventWorkloadId);
  if (!workloadMatches) {
    return {
      isBuiltByExpectedTee: false,
      blockExplorerLink,
      workloadMetadata: {
        workloadId: flashtestationEvent.workloadId,
        commitHash: flashtestationEvent.commitHash,
        builderAddress: flashtestationEvent.caller,
        version: flashtestationEvent.version,
        sourceLocators: flashtestationEvent.sourceLocators
      }
    };
  }
  return {
    isBuiltByExpectedTee: true,
    blockExplorerLink,
    workloadMetadata: {
      workloadId: flashtestationEvent.workloadId,
      commitHash: flashtestationEvent.commitHash,
      builderAddress: flashtestationEvent.caller,
      version: flashtestationEvent.version,
      sourceLocators: flashtestationEvent.sourceLocators
    }
  };
}

exports.BlockNotFoundError = BlockNotFoundError;
exports.ChainNotSupportedError = ChainNotSupportedError;
exports.NetworkError = NetworkError;
exports.ValidationError = ValidationError;
exports.computeWorkloadId = computeWorkloadId;
exports.expandToSingularRegisters = expandToSingularRegisters;
exports.getChainConfig = getChainConfig;
exports.getFlashtestationEvent = getFlashtestationEvent;
exports.getSupportedChains = getSupportedChains;
exports.isChainSupported = isChainSupported;
exports.verifyFlashtestationInBlock = verifyFlashtestationInBlock;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map