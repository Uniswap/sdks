import { type Address, type Hex, concatHex, encodeAbiParameters, getCreate2Address, keccak256 } from 'viem'

import { CANONICAL_CREATE2_DEPLOYER } from './constants'
import { LauncherSdkError } from './errors'
import { LOCK_RECIPIENT_CREATION_BYTECODE } from './lockRecipientBytecode'

/**
 * Liquidity-lock recipients. After an auction migrates, its LP position is sent to a per-launch
 * recipient contract that holds the liquidity until a timelock expires. Three modes:
 *  - `timelock` — plain hold-until-block, then the operator may move the position;
 *  - `feesForwarder` — same, but LP fees are claimable to a fee recipient meanwhile;
 *  - `buybackBurn` — same, but accrued currency buys back and burns the token.
 *
 * The recipient is deployed deterministically (CREATE2 via the canonical deployer), so its address
 * is known at auction-creation time and baked into `MigratorParameters.positionRecipient`; the
 * contract itself only needs to exist by migration.
 */

/**
 * Discriminated lock-recipient request: each `mode` carries only its own fields, so a caller can't
 * set (e.g.) a fee recipient on a plain timelock. Common fields apply to every mode.
 */
export type LockRecipientInput = {
  positionManager: Address
  /** Granted transfer rights over the position once the timelock expires (the pool owner). */
  operator: Address
  timelockBlockNumber: bigint
  /** CREATE2 salt; derive once per launch (e.g. `computeLauncherSalt(wallet, userSalt)`). */
  lockSalt: Hex
} & (
  | { mode: 'timelock' }
  | { mode: 'feesForwarder'; feeRecipient: Address }
  | { mode: 'buybackBurn'; token: Address; currency: Address; minTokenBurnAmount: bigint }
)

export interface LockRecipient {
  predictedAddress: Address
  /** Calldata for {@link CANONICAL_CREATE2_DEPLOYER}: `salt(32 bytes) ++ initCode`. */
  deployData: Hex
}

/**
 * Computes the deterministic CREATE2 address of a per-launch lock-recipient contract and the calldata
 * to deploy it via the canonical deployer. Pure (no RPC), so it's unit-testable and usable client- or
 * server-side.
 */
export function buildLockRecipient(input: LockRecipientInput): LockRecipient {
  const initCode = buildInitCode(input)
  const predictedAddress = getCreate2Address({
    from: CANONICAL_CREATE2_DEPLOYER,
    salt: input.lockSalt,
    bytecodeHash: keccak256(initCode),
  })
  return { predictedAddress, deployData: concatHex([input.lockSalt, initCode]) }
}

function buildInitCode(input: LockRecipientInput): Hex {
  switch (input.mode) {
    case 'timelock':
      // constructor(IPositionManager, address operator, uint256 timelockBlockNumber)
      return concatHex([
        LOCK_RECIPIENT_CREATION_BYTECODE.TIMELOCK,
        encodeAbiParameters(
          [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }],
          [input.positionManager, input.operator, input.timelockBlockNumber]
        ),
      ])
    case 'feesForwarder':
      // constructor(IPositionManager, address operator, uint256 timelockBlockNumber, address feeRecipient)
      return concatHex([
        LOCK_RECIPIENT_CREATION_BYTECODE.FEES_FORWARDER,
        encodeAbiParameters(
          [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'address' }],
          [input.positionManager, input.operator, input.timelockBlockNumber, input.feeRecipient]
        ),
      ])
    case 'buybackBurn':
      // constructor(address token, address currency, address operator, IPositionManager,
      //   uint256 timelockBlockNumber, uint256 minTokenBurnAmount)
      return concatHex([
        LOCK_RECIPIENT_CREATION_BYTECODE.BUYBACK_BURN,
        encodeAbiParameters(
          [
            { type: 'address' },
            { type: 'address' },
            { type: 'address' },
            { type: 'address' },
            { type: 'uint256' },
            { type: 'uint256' },
          ],
          [
            input.token,
            input.currency,
            input.operator,
            input.positionManager,
            input.timelockBlockNumber,
            input.minTokenBurnAmount,
          ]
        ),
      ])
    default:
      throw new LauncherSdkError('INVALID_INPUT', 'Unsupported liquidity lock mode')
  }
}

export { LOCK_RECIPIENT_CREATION_BYTECODE }
