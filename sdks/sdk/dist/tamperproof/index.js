import { webcrypto as webcrypto$1 } from 'crypto';
import dohjs from 'dohjs';

// src/tamperproof/algorithms.ts
var SIGNING_ALGORITHM_IMPORT_PARAMS = {
  ES256: {
    name: "ECDSA",
    namedCurve: "P-256"
  },
  ES384: {
    name: "ECDSA",
    namedCurve: "P-384"
  },
  ES512: {
    name: "ECDSA",
    namedCurve: "P-521"
  },
  EdDSA: {
    name: "Ed25519"
  },
  PS256: {
    name: "RSA-PSS",
    hash: { name: "SHA-256" }
  },
  PS384: {
    name: "RSA-PSS",
    hash: { name: "SHA-384" }
  },
  PS512: {
    name: "RSA-PSS",
    hash: { name: "SHA-512" }
  },
  RS256: {
    name: "RSASSA-PKCS1-v1_5",
    hash: { name: "SHA-256" }
  },
  RS384: {
    name: "RSASSA-PKCS1-v1_5",
    hash: { name: "SHA-384" }
  },
  RS512: {
    name: "RSASSA-PKCS1-v1_5",
    hash: { name: "SHA-512" }
  }
};
var SIGNING_ALGORITHM_CONFIG = {
  ES256: {
    name: "ECDSA",
    hash: { name: "SHA-256" },
    namedCurve: "P-256",
    ecdsaCoordinateLength: 32
  },
  ES384: {
    name: "ECDSA",
    hash: { name: "SHA-384" },
    namedCurve: "P-384",
    ecdsaCoordinateLength: 48
  },
  ES512: {
    name: "ECDSA",
    hash: { name: "SHA-512" },
    namedCurve: "P-521",
    ecdsaCoordinateLength: 66
  },
  EdDSA: {
    name: "Ed25519"
  },
  PS256: {
    name: "RSA-PSS",
    hash: { name: "SHA-256" },
    saltLength: 32
  },
  PS384: {
    name: "RSA-PSS",
    hash: { name: "SHA-384" },
    saltLength: 48
  },
  PS512: {
    name: "RSA-PSS",
    hash: { name: "SHA-512" },
    saltLength: 64
  },
  RS256: {
    name: "RSASSA-PKCS1-v1_5",
    hash: { name: "SHA-256" }
  },
  RS384: {
    name: "RSASSA-PKCS1-v1_5",
    hash: { name: "SHA-384" }
  },
  RS512: {
    name: "RSASSA-PKCS1-v1_5",
    hash: { name: "SHA-512" }
  }
};

// src/tamperproof/constants/errors.ts
var ERROR_ALGORITHM_NOT_SUPPORTED = (alg) => `Algorithm is not supported: ${String(alg)}`;
var ERROR_NO_TXT_RECORDS_FOR_HOST = (host) => `No TXT records found for host ${host}`;
var ERROR_NO_TXT_WITH_PREFIX_FOR_HOST = (prefix, host) => `No TXT record found with prefix ${prefix} for host ${host}`;
var ERROR_MULTIPLE_TXT_WITH_PREFIX_FOR_HOST = (prefix, host) => `Multiple TXT records found with prefix ${prefix} for host ${host}. Only one is allowed.`;
var ERROR_TWIST_PATH_TOO_LONG = "TWIST path too long";
var ERROR_MANIFEST_HTTPS_ONLY = "Manifest must be fetched over HTTPS";
var ERROR_MANIFEST_FETCH_FAILED = (status) => `Failed to fetch manifest: HTTP ${status}`;
var ERROR_MANIFEST_CONTENT_TYPE = "Manifest Content-Type must be application/json";
var ERROR_MANIFEST_TOO_LARGE = "Manifest too large";
var ERROR_PUBLIC_KEY_ID_NOT_FOUND = (id) => `Public key with id ${id} not found`;
var ERROR_MULTIPLE_PUBLIC_KEYS_WITH_ID = (id) => `Multiple public keys found with id ${id}. Key IDs must be unique.`;
var ERROR_INVALID_TXT_RECORD_FORMAT = "Invalid TXT record format: length exceeds buffer size";
var ERROR_INVALID_HEX_LENGTH_EVEN = "Invalid hex string: length must be even";
var ERROR_INVALID_HEX_STRING = (hex) => `Invalid hex string: ${hex}`;

// src/tamperproof/utils/hex.ts
function fromHex(hex) {
  const cleanHex = hex.replace(/^0x/i, "").replace(/\s/g, "");
  if (cleanHex.length % 2 !== 0) {
    throw new Error(ERROR_INVALID_HEX_LENGTH_EVEN);
  }
  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new Error(ERROR_INVALID_HEX_STRING(cleanHex));
  }
  const out = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    out[i / 2] = Number.parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return out;
}
function toHex(buffer) {
  const uint8Array = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  return Array.from(uint8Array).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function normalizeHex(input, with0x = true) {
  const cleaned = input.replace(/^0x/i, "").replace(/\s/g, "");
  const padded = cleaned.length % 2 === 1 ? `0${cleaned}` : cleaned;
  const bytes = fromHex(padded);
  const hex = toHex(bytes);
  return with0x ? `0x${hex}` : hex;
}

// src/tamperproof/generate.ts
function generate(...publicKeys) {
  const pubKeys = publicKeys.map((publicKey, index) => {
    if (!Object.prototype.hasOwnProperty.call(
      SIGNING_ALGORITHM_CONFIG,
      publicKey.algorithm
    )) {
      throw new Error(ERROR_ALGORITHM_NOT_SUPPORTED(publicKey.algorithm));
    }
    return {
      // EIP states 1-indexed string
      id: (index + 1).toString(),
      alg: publicKey.algorithm,
      publicKey: normalizeHex(publicKey.key)
    };
  });
  return JSON.stringify({
    publicKeys: pubKeys
  });
}
function resolveWebcrypto() {
  if (globalThis.crypto?.subtle) return globalThis.crypto;
  return webcrypto$1;
}
var webcrypto = resolveWebcrypto();

// src/tamperproof/utils/canonicalJson.ts
function isPlainObject(value) {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}
function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (isPlainObject(value)) {
    const sortedKeys = Object.keys(value).sort();
    const result = {};
    for (const key of sortedKeys) {
      const v = value[key];
      if (v === void 0) continue;
      result[key] = canonicalize(v);
    }
    return result;
  }
  return value;
}
function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}
function serializeRequestPayload(requestPayload) {
  return new TextEncoder().encode(canonicalStringify(requestPayload));
}

// src/tamperproof/sign.ts
var encoder = new TextEncoder();
var PRIVATE_KEY_FORMAT = "pkcs8";
async function sign(data, privateKey, algorithm) {
  if (typeof algorithm !== "string" || !Object.prototype.hasOwnProperty.call(SIGNING_ALGORITHM_CONFIG, algorithm)) {
    throw new Error(ERROR_ALGORITHM_NOT_SUPPORTED(algorithm));
  }
  const bufferData = typeof data === "string" ? encoder.encode(data) : serializeRequestPayload(data);
  const key = await webcrypto.subtle.importKey(
    PRIVATE_KEY_FORMAT,
    fromHex(privateKey),
    SIGNING_ALGORITHM_IMPORT_PARAMS[algorithm],
    false,
    ["sign"]
  );
  const signature = await webcrypto.subtle.sign(
    SIGNING_ALGORITHM_CONFIG[algorithm],
    key,
    bufferData
  );
  return `0x${toHex(signature)}`;
}

// src/tamperproof/utils/txtRecord.ts
function parseTxtRecord(buffer) {
  const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const decoder = new TextDecoder();
  let result = "";
  let offset = 0;
  while (offset < view.length) {
    const length = view[offset];
    offset += 1;
    if (offset + length > view.length) {
      throw new Error(ERROR_INVALID_TXT_RECORD_FORMAT);
    }
    const slice = view.subarray(offset, offset + length);
    result += decoder.decode(slice);
    offset += length;
  }
  return result;
}
function processTxtRecordData(data) {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    return parseTxtRecord(data);
  }
  return String(data);
}
var { DohResolver } = dohjs;
var PREFIX = "TWIST=";
var quadOneResolver = new DohResolver("https://1.1.1.1/dns-query");
var TIMEOUT = 1e3;
var MAX_MANIFEST_BYTES = 64 * 1024;
var MAX_TWIST_PATH = 1024;
var PUBLIC_KEY_FORMAT = "spki";
async function verifyAsyncDns(calldata, signature, host, id, thisResolver = quadOneResolver) {
  const response = await thisResolver.query(
    host,
    "TXT",
    "GET",
    {
      Accept: "application/dns-message"
    },
    TIMEOUT
  );
  if (!response.answers || response.answers.length === 0) {
    throw new Error(ERROR_NO_TXT_RECORDS_FOR_HOST(host));
  }
  let twistRecord;
  for (const answer of response.answers) {
    const recordData = processTxtRecordData(answer.data);
    if (recordData.startsWith(PREFIX)) {
      if (twistRecord) {
        throw new Error(ERROR_MULTIPLE_TXT_WITH_PREFIX_FOR_HOST(PREFIX, host));
      } else {
        twistRecord = recordData.slice(PREFIX.length);
      }
    }
  }
  if (!twistRecord) {
    throw new Error(ERROR_NO_TXT_WITH_PREFIX_FOR_HOST(PREFIX, host));
  }
  twistRecord = twistRecord.replace(/^\/+/, "");
  if (twistRecord.length > MAX_TWIST_PATH) {
    throw new Error(ERROR_TWIST_PATH_TOO_LONG);
  }
  const encodedPath = twistRecord.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  const url = new URL(`https://${host}/${encodedPath}`);
  return await verifyAsyncJson(calldata, signature, url, id);
}
async function verifyAsyncJson(calldata, signature, url, id) {
  if (url.protocol !== "https:") {
    throw new Error(ERROR_MANIFEST_HTTPS_ONLY);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  let response;
  try {
    response = await fetch(url, {
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(ERROR_MANIFEST_FETCH_FAILED(response.status));
  }
  const ct = response.headers.get("content-type") || "";
  if (!/^application\/json(?:;|$)/i.test(ct)) {
    throw new Error(ERROR_MANIFEST_CONTENT_TYPE);
  }
  const cl = response.headers.get("content-length");
  if (cl && Number(cl) > MAX_MANIFEST_BYTES) {
    throw new Error(ERROR_MANIFEST_TOO_LARGE);
  }
  const data = await response.json();
  const matchingKeys = data.publicKeys.filter((pk) => pk.id === id.toString());
  if (matchingKeys.length === 0) {
    throw new Error(ERROR_PUBLIC_KEY_ID_NOT_FOUND(id));
  }
  if (matchingKeys.length > 1) {
    throw new Error(ERROR_MULTIPLE_PUBLIC_KEYS_WITH_ID(id));
  }
  const publicKey = matchingKeys[0];
  if (!Object.prototype.hasOwnProperty.call(
    SIGNING_ALGORITHM_IMPORT_PARAMS,
    publicKey.alg
  )) {
    throw new Error(ERROR_ALGORITHM_NOT_SUPPORTED(publicKey.alg));
  }
  const algorithmKey = publicKey.alg;
  const publicKeyObject = await webcrypto.subtle.importKey(
    PUBLIC_KEY_FORMAT,
    fromHex(publicKey.publicKey),
    SIGNING_ALGORITHM_IMPORT_PARAMS[algorithmKey],
    false,
    ["verify"]
  );
  return await verify(calldata, signature, publicKeyObject, algorithmKey);
}
async function verify(calldata, signature, publicKey, alg) {
  const bufferData = new TextEncoder().encode(calldata);
  const signatureBytes = fromHex(signature);
  if (!Object.prototype.hasOwnProperty.call(SIGNING_ALGORITHM_CONFIG, alg)) {
    throw new Error(ERROR_ALGORITHM_NOT_SUPPORTED(alg));
  }
  const algConfig = SIGNING_ALGORITHM_CONFIG[alg];
  const verifyParams = algConfig;
  let signatureForVerify = signatureBytes;
  if (algConfig.name === "ECDSA") {
    const coordLen = algConfig.ecdsaCoordinateLength;
    if (!coordLen) {
      throw new Error("ECDSA algorithm missing ecdsaCoordinateLength");
    }
    if (signatureBytes.length !== coordLen * 2) {
      return false;
    }
    signatureForVerify = signatureBytes;
  }
  const verified = await webcrypto.subtle.verify(
    verifyParams,
    publicKey,
    signatureForVerify,
    bufferData
  );
  return verified;
}

export { PREFIX, SIGNING_ALGORITHM_CONFIG, SIGNING_ALGORITHM_IMPORT_PARAMS, canonicalStringify, generate, serializeRequestPayload, sign, verify, verifyAsyncDns, verifyAsyncJson };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map