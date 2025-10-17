import { webcrypto } from "./utils/webcrypto.js";
import {
  SigningAlgorithmConfig,
  SIGNING_ALGORITHM_CONFIG,
  SIGNING_ALGORITHM_IMPORT_PARAMS,
} from "./algorithms.js";
import {
  ERROR_ALGORITHM_NOT_SUPPORTED,
  ERROR_MANIFEST_CONTENT_TYPE,
  ERROR_MANIFEST_FETCH_FAILED,
  ERROR_MANIFEST_HTTPS_ONLY,
  ERROR_MANIFEST_TOO_LARGE,
  ERROR_MULTIPLE_PUBLIC_KEYS_WITH_ID,
  ERROR_MULTIPLE_TXT_WITH_PREFIX_FOR_HOST,
  ERROR_NO_TXT_RECORDS_FOR_HOST,
  ERROR_NO_TXT_WITH_PREFIX_FOR_HOST,
  ERROR_PUBLIC_KEY_ID_NOT_FOUND,
  ERROR_TWIST_PATH_TOO_LONG,
} from "./constants/errors.js";
import { fromHex } from "./utils/hex.js";
import { processTxtRecordData } from "./utils/txtRecord.js";
import dohjs from "dohjs";

const { DohResolver } = dohjs;
export const PREFIX = "TWIST=";
const quadOneResolver = new DohResolver("https://1.1.1.1/dns-query");
const TIMEOUT = 1000;
const MAX_MANIFEST_BYTES = 64 * 1024; // 64KB
const MAX_TWIST_PATH = 1024;
const PUBLIC_KEY_FORMAT = "spki";

export async function verifyAsyncDns(
  calldata: string,
  signature: string,
  host: string,
  id: string,
  thisResolver: InstanceType<typeof DohResolver> = quadOneResolver
): Promise<boolean> {
  // Use DNS over HTTPS to resolve TXT records
  const response = await thisResolver.query(
    host,
    "TXT",
    "GET",
    {
      Accept: "application/dns-message",
    },
    TIMEOUT
  );

  if (!response.answers || response.answers.length === 0) {
    throw new Error(ERROR_NO_TXT_RECORDS_FOR_HOST(host));
  }

  let twistRecord: string | undefined;

  // Scan all TXT records; capture the first with PREFIX and throw if another is found
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

  // Normalize and bound TWIST path; encode path segments
  twistRecord = twistRecord.replace(/^\/+/, "");
  if (twistRecord.length > MAX_TWIST_PATH) {
    throw new Error(ERROR_TWIST_PATH_TOO_LONG);
  }
  const encodedPath = twistRecord
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const url = new URL(`https://${host}/${encodedPath}`);

  return await verifyAsyncJson(calldata, signature, url, id);
}

export async function verifyAsyncJson(
  calldata: string,
  signature: string,
  url: URL,
  id: string
): Promise<boolean> {
  if (url.protocol !== "https:") {
    throw new Error(ERROR_MANIFEST_HTTPS_ONLY);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: "application/json" },
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

  const data = (await response.json()) as {
    publicKeys: Array<{
      id: string;
      alg: string;
      publicKey: string;
    }>;
  };
  const matchingKeys = data.publicKeys.filter((pk) => pk.id === id.toString());

  if (matchingKeys.length === 0) {
    throw new Error(ERROR_PUBLIC_KEY_ID_NOT_FOUND(id));
  }

  if (matchingKeys.length > 1) {
    throw new Error(ERROR_MULTIPLE_PUBLIC_KEYS_WITH_ID(id));
  }

  const publicKey = matchingKeys[0];

  if (
    !Object.prototype.hasOwnProperty.call(
      SIGNING_ALGORITHM_IMPORT_PARAMS,
      publicKey.alg
    )
  ) {
    throw new Error(ERROR_ALGORITHM_NOT_SUPPORTED(publicKey.alg));
  }
  const algorithmKey =
    publicKey.alg as keyof typeof SIGNING_ALGORITHM_IMPORT_PARAMS;

  const publicKeyObject = await webcrypto.subtle.importKey(
    PUBLIC_KEY_FORMAT,
    fromHex(publicKey.publicKey) as BufferSource,
    SIGNING_ALGORITHM_IMPORT_PARAMS[algorithmKey],
    false,
    ["verify"]
  );

  return await verify(calldata, signature, publicKeyObject, algorithmKey);
}

export async function verify(
  calldata: string,
  signature: string,
  publicKey: CryptoKey,
  alg: keyof typeof SIGNING_ALGORITHM_CONFIG
): Promise<boolean> {
  const bufferData = new TextEncoder().encode(calldata);

  const signatureBytes = fromHex(signature);

  if (!Object.prototype.hasOwnProperty.call(SIGNING_ALGORITHM_CONFIG, alg)) {
    throw new Error(ERROR_ALGORITHM_NOT_SUPPORTED(alg));
  }
  const algConfig: SigningAlgorithmConfig = SIGNING_ALGORITHM_CONFIG[alg];

  // Use algorithm params directly from configuration
  const verifyParams = algConfig as unknown as
    | Algorithm
    | EcdsaParams
    | RsaPssParams;

  let signatureForVerify: Uint8Array = signatureBytes;
  if (algConfig.name === "ECDSA") {
    // Only accept raw r||s for ECDSA signatures and pass raw to verify
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
    signatureForVerify as BufferSource,
    bufferData as BufferSource
  );
  return verified;
}
