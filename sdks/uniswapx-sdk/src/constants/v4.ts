import { ethers } from "ethers";

/**
 * V4-specific type hashes and constants
 */

/**
 * EIP-712 Domain type hash for Permit2
 */
export const PERMIT2_DOMAIN_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes(
    "EIP712Domain(string name,uint256 chainId,address verifyingContract)"
  )
);

/**
 * EIP-712 Domain type hash for DCAHook
 */
export const DCA_HOOK_DOMAIN_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
  )
);

/**
 * Permit2 Witness Transfer From type hash
 */
export const PERMIT_WITNESS_TRANSFER_FROM_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes(
    "PermitWitnessTransferFrom(" +
      "TokenPermissions permitted," +
      "address spender," +
      "uint256 nonce," +
      "uint256 deadline," +
      "GenericOrder witness)" +
      "GenericOrder(address resolver,bytes32 orderHash)" +
      "TokenPermissions(address token,uint256 amount)"
  )
);

/**
 * TokenPermissions type hash
 */
export const TOKEN_PERMISSIONS_TYPE_HASH = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("TokenPermissions(address token,uint256 amount)")
);

/**
 * OrderInfoV4 type hash (exported from hashing.ts)
 */
export {
  ORDER_INFO_V4_TYPE_HASH,
  ORDER_INFO_V4_TYPE,
} from "../order/v4/hashing";

/**
 * DCA Intent type hash (exported from hashing.ts)
 */
export { DCA_COSIGNER_DATA_TYPE_HASH } from "../order/v4/hashing";

/**
 * DCAHook domain name
 */
export const DCA_HOOK_DOMAIN_NAME = "DCAHook";

/**
 * DCAHook domain version
 */
export const DCA_HOOK_DOMAIN_VERSION = "1";

/**
 * Permit2 domain name
 */
export const PERMIT2_DOMAIN_NAME = "Permit2";
