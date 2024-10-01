import { defaultAbiCoder } from 'ethers/lib/utils'

/**
 * CommandTypes
 * @description Flags that modify a command's execution
 * @enum {number}
 */
export enum CommandType {
  V3_SWAP_EXACT_IN = 0x00,
  V3_SWAP_EXACT_OUT = 0x01,
  PERMIT2_TRANSFER_FROM = 0x02,
  PERMIT2_PERMIT_BATCH = 0x03,
  SWEEP = 0x04,
  TRANSFER = 0x05,
  PAY_PORTION = 0x06,

  V2_SWAP_EXACT_IN = 0x08,
  V2_SWAP_EXACT_OUT = 0x09,
  PERMIT2_PERMIT = 0x0a,
  WRAP_ETH = 0x0b,
  UNWRAP_WETH = 0x0c,
  PERMIT2_TRANSFER_FROM_BATCH = 0x0d,
  BALANCE_CHECK_ERC20 = 0x0e,

  V4_SWAP = 0x10,
  V3_POSITION_MANAGER_PERMIT = 0x11,
  V3_POSITION_MANAGER_CALL = 0x12,
  V4_POSITION_CALL = 0x13,

  EXECUTE_SUB_PLAN = 0x21,
}

export enum Subparser {
  V3PathExactIn,
  V3PathExactOut,
}

export type ParamType = {
  readonly name: string
  readonly type: string
  readonly subparser?: Subparser
}

const ALLOW_REVERT_FLAG = 0x80
const REVERTIBLE_COMMANDS = new Set<CommandType>([CommandType.EXECUTE_SUB_PLAN])

const PERMIT_STRUCT =
  '((address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline)'

const PERMIT_BATCH_STRUCT =
  '((address token,uint160 amount,uint48 expiration,uint48 nonce)[] details,address spender,uint256 sigDeadline)'

const PERMIT2_TRANSFER_FROM_STRUCT = '(address from,address to,uint160 amount,address token)'
const PERMIT2_TRANSFER_FROM_BATCH_STRUCT = PERMIT2_TRANSFER_FROM_STRUCT + '[]'

export const COMMAND_ABI_DEFINITION: { [key in CommandType]: readonly ParamType[] } = {
  // Batch Reverts
  [CommandType.EXECUTE_SUB_PLAN]: [
    { name: 'commands', type: 'bytes' },
    { name: 'inputs', type: 'bytes[]' },
  ],

  // Permit2 Actions
  [CommandType.PERMIT2_PERMIT]: [
    { name: 'permit', type: PERMIT_STRUCT },
    { name: 'signature', type: 'bytes' },
  ],
  [CommandType.PERMIT2_PERMIT_BATCH]: [
    { name: 'permit', type: PERMIT_BATCH_STRUCT },
    { name: 'signature', type: 'bytes' },
  ],
  [CommandType.PERMIT2_TRANSFER_FROM]: [
    { name: 'token', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint160' },
  ],
  [CommandType.PERMIT2_TRANSFER_FROM_BATCH]: [
    {
      name: 'transferFrom',
      type: PERMIT2_TRANSFER_FROM_BATCH_STRUCT,
    },
  ],

  // Uniswap Actions
  [CommandType.V3_SWAP_EXACT_IN]: [
    { name: 'recipient', type: 'address' },
    { name: 'amountIn', type: 'uint256' },
    { name: 'amountOutMin', type: 'uint256' },
    { name: 'path', subparser: Subparser.V3PathExactIn, type: 'bytes' },
    { name: 'payerIsUser', type: 'bool' },
  ],
  [CommandType.V3_SWAP_EXACT_OUT]: [
    { name: 'recipient', type: 'address' },
    { name: 'amountOut', type: 'uint256' },
    { name: 'amountInMax', type: 'uint256' },
    { name: 'path', subparser: Subparser.V3PathExactOut, type: 'bytes' },
    { name: 'payerIsUser', type: 'bool' },
  ],
  [CommandType.V2_SWAP_EXACT_IN]: [
    { name: 'recipient', type: 'address' },
    { name: 'amountIn', type: 'uint256' },
    { name: 'amountOutMin', type: 'uint256' },
    { name: 'path', type: 'address[]' },
    { name: 'payerIsUser', type: 'bool' },
  ],
  [CommandType.V2_SWAP_EXACT_OUT]: [
    { name: 'recipient', type: 'address' },
    { name: 'amountOut', type: 'uint256' },
    { name: 'amountInMax', type: 'uint256' },
    { name: 'path', type: 'address[]' },
    { name: 'payerIsUser', type: 'bool' },
  ],
  [CommandType.V4_SWAP]: [{ name: 'command', type: 'bytes' }],

  // Token Actions and Checks
  [CommandType.WRAP_ETH]: [
    { name: 'recipient', type: 'address' },
    { name: 'amountMin', type: 'uint256' },
  ],
  [CommandType.UNWRAP_WETH]: [
    { name: 'recipient', type: 'address' },
    { name: 'amountMin', type: 'uint256' },
  ],
  [CommandType.SWEEP]: [
    { name: 'token', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'amountMin', type: 'uint256' },
  ],
  [CommandType.TRANSFER]: [
    { name: 'token', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'value', type: 'uint256' },
  ],
  [CommandType.PAY_PORTION]: [
    { name: 'token', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'bips', type: 'uint256' },
  ],
  [CommandType.BALANCE_CHECK_ERC20]: [
    { name: 'owner', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'minBalance', type: 'uint256' },
  ],

  // Position Actions
  [CommandType.V3_POSITION_MANAGER_PERMIT]: [{ name: 'calldata', type: 'bytes' }],
  [CommandType.V3_POSITION_MANAGER_CALL]: [{ name: 'calldata', type: 'bytes' }],
  [CommandType.V4_POSITION_CALL]: [{ name: 'calldata', type: 'bytes' }],
}

export class RoutePlanner {
  commands: string
  inputs: string[]

  constructor() {
    this.commands = '0x'
    this.inputs = []
  }

  addSubPlan(subplan: RoutePlanner): RoutePlanner {
    this.addCommand(CommandType.EXECUTE_SUB_PLAN, [subplan.commands, subplan.inputs], true)
    return this
  }

  addCommand(type: CommandType, parameters: any[], allowRevert = false): RoutePlanner {
    let command = createCommand(type, parameters)
    this.inputs.push(command.encodedInput)
    if (allowRevert) {
      if (!REVERTIBLE_COMMANDS.has(command.type)) {
        throw new Error(`command type: ${command.type} cannot be allowed to revert`)
      }
      command.type = command.type | ALLOW_REVERT_FLAG
    }

    this.commands = this.commands.concat(command.type.toString(16).padStart(2, '0'))
    return this
  }
}

export type RouterCommand = {
  type: CommandType
  encodedInput: string
}

export function createCommand(type: CommandType, parameters: any[]): RouterCommand {
  if (type === CommandType.V4_SWAP) {
    return { type, encodedInput: parameters[0] }
  }
  const encodedInput = defaultAbiCoder.encode(
    COMMAND_ABI_DEFINITION[type].map((abi) => abi.type),
    parameters
  )
  return { type, encodedInput }
}
