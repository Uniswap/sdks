import {
  type Address,
  type Hex,
  concatHex,
  encodeAbiParameters,
  getAddress,
  isAddressEqual,
  keccak256,
  numberToHex,
  zeroAddress,
} from 'viem'

import { getMarginAddresses } from './addresses.js'
import { ADDRESS_THIS, MSG_SENDER } from './constants.js'
import { MarginSdkError } from './errors.js'

/**
 * Offchain mirror of `MarginRouter.accountOf`: the deterministic MarginAccount address for an
 * `(owner, subId)` pair, computable without an RPC. Accounts are Solady clone-with-immutable-args
 * (CWIA) CREATE2 deploys with `(owner, manager)` baked into the clone bytecode and a salt binding
 * `(owner, manager, subId)`, so the address is a pure function of those inputs. Verified against
 * the live mainnet router's `accountOf` (see account.test.ts).
 */

/**
 * Offchain mirror of `MarginAccount._requireReceiver`: every fund-out primitive on the account
 * (`withdrawCollateral`, `borrow`, `sweep`) constrains its recipient to the clone's baked-in
 * `{owner, manager}` and otherwise reverts `ReceiverNotAllowed(to)`.
 *
 * Critically, the router does **not** run these recipients through `_mapRecipient` — the
 * `ACCOUNT_*` handlers pass `to` straight into the account (`MarginRouter._handleAction`), unlike
 * the router-level `SWEEP`/`TAKE` opcodes which do resolve it. So the v4 sentinels that work
 * everywhere else in a plan (`MSG_SENDER`, `ADDRESS_THIS`) arrive at the account as the literal
 * addresses `0x…01` / `0x…02`, match neither owner nor manager, and revert. Rejecting them here
 * turns a mid-plan onchain revert into a build-time error.
 *
 * Pass the resolved owner EOA (funds to the user) or the MarginRouter address (funds staged for a
 * later action in the same plan).
 */
export function validateAccountRecipient(to: Address, label: string): void {
  if (isAddressEqual(to, zeroAddress)) {
    throw new MarginSdkError('INVALID_RECIPIENT', `${label} recipient must not be the zero address`)
  }
  if (isAddressEqual(to, MSG_SENDER) || isAddressEqual(to, ADDRESS_THIS)) {
    throw new MarginSdkError(
      'INVALID_RECIPIENT',
      `${label} does not resolve the MSG_SENDER/ADDRESS_THIS sentinels — the account requires a literal ` +
        `recipient and reverts ReceiverNotAllowed for anything but its owner or the MarginRouter. ` +
        `Pass the owner address or the router address explicitly.`
    )
  }
}

/** The immutable args baked into an account clone: `abi.encode(owner, manager)`. */
export function marginAccountArgs(owner: Address, manager: Address): Hex {
  return encodeAbiParameters([{ type: 'address' }, { type: 'address' }], [owner, manager])
}

/** The CREATE2 salt for an account: `keccak256(abi.encode(owner, manager, subId))`. */
export function marginAccountSalt(owner: Address, manager: Address, subId: bigint): Hex {
  return keccak256(
    encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint256' }], [owner, manager, subId])
  )
}

/**
 * The Solady CWIA initcode for a clone of `implementation` carrying `args`:
 * `0x61{0x2d+len(args):2} 3d81600a3d39f3 363d3d373d3d3d363d73 {implementation} 5af43d82803e903d91602b57fd5bf3 {args}`
 * (creation prologue, runtime prefix, delegate target, runtime suffix, immutable args).
 */
export function cloneInitCode(implementation: Address, args: Hex): Hex {
  const argsLength = (args.length - 2) / 2
  // Solady reverts deployment when args exceed 0xffff - 0x2d; mirror that bound here.
  if (!Number.isInteger(argsLength) || argsLength > 0xffd2) {
    throw new MarginSdkError('INVALID_INPUT', `invalid immutable args length: ${argsLength}`)
  }
  return concatHex([
    '0x61',
    numberToHex(0x2d + argsLength, { size: 2 }),
    '0x3d81600a3d39f3363d3d373d3d3d363d73',
    implementation,
    '0x5af43d82803e903d91602b57fd5bf3',
    args,
  ])
}

export interface PredictAccountParams {
  /** The position owner (the address that calls the router entry points). */
  owner: Address
  /** The sub-account index (one owner can hold many independent positions). */
  subId: bigint
  /** The MarginRouter: both the CREATE2 deployer and the manager baked into the clone. */
  marginRouter: Address
  /** The MarginAccount implementation the clone delegates to. */
  accountImplementation: Address
}

/**
 * Predicts the MarginAccount address for `(owner, subId)` under a given router deployment,
 * whether or not the account has been deployed yet. Equivalent to `router.accountOf(owner, subId)`.
 */
export function predictMarginAccountAddress(params: PredictAccountParams): Address {
  const { owner, subId, marginRouter, accountImplementation } = params
  const initCodeHash = keccak256(cloneInitCode(accountImplementation, marginAccountArgs(owner, marginRouter)))
  const digest = keccak256(
    concatHex(['0xff', marginRouter, marginAccountSalt(owner, marginRouter, subId), initCodeHash])
  )
  return getAddress(`0x${digest.slice(26)}`)
}

/**
 * Chain-aware convenience over {@link predictMarginAccountAddress} using the canonical deployment
 * addresses for `chainId`. Throws `UNSUPPORTED_CHAIN` where the margin stack is not deployed.
 */
export function getMarginAccountAddress(chainId: number, owner: Address, subId = 0n): Address {
  const addresses = getMarginAddresses(chainId)
  if (!addresses) {
    throw new MarginSdkError('UNSUPPORTED_CHAIN', `margin trading is not deployed on chain ${chainId}`)
  }
  return predictMarginAccountAddress({
    owner,
    subId,
    marginRouter: addresses.marginRouter,
    accountImplementation: addresses.marginAccountImplementation,
  })
}
