import { ethers } from 'ethers'
import UniversalRouter from '@uniswap/universal-router/artifacts/contracts/UniversalRouter.sol/UniversalRouter.json'
import { Interface } from '@ethersproject/abi'
import { V4BaseActionsParser, V4RouterAction } from '@uniswap/v4-sdk'
import { CommandType, CommandDefinition, COMMAND_DEFINITION, Subparser, Parser } from '../utils/routerCommands'

export type Param = {
  readonly name: string
  readonly value: any
}

export type UniversalRouterCommand = {
  readonly commandName: string
  readonly commandType: CommandType
  readonly params: readonly Param[]
}

export type UniversalRouterCall = {
  readonly commands: readonly UniversalRouterCommand[]
}

export type V3PathItem = {
  readonly tokenIn: string
  readonly tokenOut: string
  readonly fee: number
}

export interface CommandsDefinition {
  [key: number]: CommandDefinition
}

// Parses UniversalRouter V2 commands
export abstract class CommandParser {
  public static INTERFACE: Interface = new Interface(UniversalRouter.abi)

  public static parseCalldata(calldata: string): UniversalRouterCall {
    const genericParser = new GenericCommandParser(COMMAND_DEFINITION)
    const txDescription = CommandParser.INTERFACE.parseTransaction({ data: calldata })
    const { commands, inputs } = txDescription.args
    return genericParser.parse(commands, inputs)
  }
}

// Parses commands based on given command definition
export class GenericCommandParser {
  constructor(private readonly commandDefinition: CommandsDefinition) {}

  public parse(commands: string, inputs: string[]): UniversalRouterCall {
    const commandTypes = GenericCommandParser.getCommands(commands)

    return {
      commands: commandTypes.map((commandType: CommandType, i: number) => {
        const commandDef = this.commandDefinition[commandType]

        if (commandDef.parser === Parser.V4Actions) {
          const { actions } = V4BaseActionsParser.parseCalldata(inputs[i])
          return {
            commandName: CommandType[commandType],
            commandType,
            params: v4RouterCallToParams(actions),
          }
        } else if (commandDef.parser === Parser.Abi) {
          const abiDef = commandDef.params
          const rawParams = ethers.utils.defaultAbiCoder.decode(
            abiDef.map((command) => command.type),
            inputs[i]
          )

          const params = rawParams.map((param: any, j: number) => {
            switch (abiDef[j].subparser) {
              case Subparser.V3PathExactIn:
                return {
                  name: abiDef[j].name,
                  value: parseV3PathExactIn(param),
                }
              case Subparser.V3PathExactOut:
                return {
                  name: abiDef[j].name,
                  value: parseV3PathExactOut(param),
                }
              default:
                return {
                  name: abiDef[j].name,
                  value: param,
                }
            }
          })
          return {
            commandName: CommandType[commandType],
            commandType,
            params,
          }
        } else if (commandDef.parser === Parser.V3Actions) {
          // TODO: implement better parsing here
          return {
            commandName: CommandType[commandType],
            commandType,
            params: inputs.map((input) => ({ name: 'command', value: input })),
          }
        } else {
          throw new Error(`Unsupported parser: ${commandDef}`)
        }
      }),
    }
  }

  // parse command types from bytes string
  private static getCommands(commands: string): CommandType[] {
    const commandTypes: CommandType[] = []

    for (let i = 2; i < commands.length; i += 2) {
      const byte = commands.substring(i, i + 2)
      commandTypes.push(parseInt(byte, 16) as CommandType)
    }

    return commandTypes
  }
}

export function parseV3PathExactIn(path: string): readonly V3PathItem[] {
  const strippedPath = path.replace('0x', '')
  let tokenIn = ethers.utils.getAddress(strippedPath.substring(0, 40))
  let loc = 40
  const res: V3PathItem[] = []
  while (loc < strippedPath.length) {
    const feeAndTokenOut = strippedPath.substring(loc, loc + 46)
    const fee = parseInt(feeAndTokenOut.substring(0, 6), 16)
    const tokenOut = ethers.utils.getAddress(feeAndTokenOut.substring(6, 46))

    res.push({
      tokenIn,
      tokenOut,
      fee,
    })
    tokenIn = tokenOut
    loc += 46
  }

  return res
}

export function parseV3PathExactOut(path: string): readonly V3PathItem[] {
  const strippedPath = path.replace('0x', '')
  let tokenIn = ethers.utils.getAddress(strippedPath.substring(strippedPath.length - 40))
  let loc = strippedPath.length - 86 // 86 = (20 addr + 3 fee + 20 addr) * 2 (for hex characters)
  const res: V3PathItem[] = []
  while (loc >= 0) {
    const feeAndTokenOut = strippedPath.substring(loc, loc + 46)
    const tokenOut = ethers.utils.getAddress(feeAndTokenOut.substring(0, 40))
    const fee = parseInt(feeAndTokenOut.substring(40, 46), 16)

    res.push({
      tokenIn,
      tokenOut,
      fee,
    })
    tokenIn = tokenOut

    loc -= 46
  }

  return res
}

function v4RouterCallToParams(actions: readonly V4RouterAction[]): readonly Param[] {
  return actions.map((action) => {
    return {
      name: action.actionName,
      value: action.params.map((param) => {
        return {
          name: param.name,
          value: param.value,
        }
      }),
    }
  })
}
