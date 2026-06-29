import { type Address, type Hex, encodeAbiParameters, keccak256 } from 'viem'

import { MIGRATOR_PARAMETERS_PARAM } from './encode'
import type { MigratorParameters } from './types'

/**
 * Salt derivation matching the launcher's on-chain CREATE2 scheme. A caller supplies a `userSalt`
 * (any bytes32); the launcher and strategy derive the deeper salts from it.
 */

/** Salt the launcher passes to the strategy: `keccak256(abi.encode(msg.sender, userSalt))`. */
export function computeLauncherSalt(wallet: Address, userSalt: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [wallet, userSalt]))
}

/** Salt the strategy derives for the initializer: `keccak256(abi.encode(launcherSalt, migratorParams))`. */
export function computeInitializerSalt(wallet: Address, userSalt: Hex, migrator: MigratorParameters): Hex {
  const launcherSalt = computeLauncherSalt(wallet, userSalt)
  return keccak256(encodeAbiParameters([{ type: 'bytes32' }, MIGRATOR_PARAMETERS_PARAM], [launcherSalt, migrator]))
}
