import { SIGNING_ALGORITHM_CONFIG } from "./algorithms.js";
import { ERROR_ALGORITHM_NOT_SUPPORTED } from "./constants/errors.js";
import { normalizeHex } from "./utils/hex.js";

export type PublicKey = {
  key: string; // hex string
  algorithm: keyof typeof SIGNING_ALGORITHM_CONFIG;
};

export type EnforcementMode = "none" | "lax" | "strict";

export function generate(
  enforcement: EnforcementMode,
  ...publicKeys: PublicKey[]
): string {
  const pubKeys: object[] = publicKeys.map((publicKey, index) => {
    if (
      !Object.prototype.hasOwnProperty.call(
        SIGNING_ALGORITHM_CONFIG,
        publicKey.algorithm
      )
    ) {
      throw new Error(ERROR_ALGORITHM_NOT_SUPPORTED(publicKey.algorithm));
    }

    return {
      // EIP states 1-indexed string
      id: (index + 1).toString(),
      alg: publicKey.algorithm,
      publicKey: normalizeHex(publicKey.key),
    };
  });

  const manifest: { publicKeys: object[]; enforcement: EnforcementMode } = {
    publicKeys: pubKeys,
    enforcement,
  };

  return JSON.stringify(manifest);
}
