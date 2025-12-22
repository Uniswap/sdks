import { ethers } from 'ethers'
import { PoolKey } from '../entities/pool'
import { PathKey } from './encodeRouteToPath'
import { Actions, Subparser, V4_BASE_ACTIONS_ABI_DEFINITION } from './v4Planner'

export type Param = {
  readonly name: string
  readonly value: any
}

export type V4RouterAction = {
  readonly actionName: string
  readonly actionType: Actions
  readonly params: readonly Param[]
}

export type V4RouterCall = {
  readonly actions: readonly V4RouterAction[]
}

export type SwapExactInSingle = {
  readonly poolKey: PoolKey
  readonly zeroForOne: boolean
  readonly amountIn: string
  readonly amountOutMinimum: string
  readonly hookData: string
}

export type SwapExactIn = {
  readonly currencyIn: string
  readonly path: readonly PathKey[]
  readonly amountIn: string
  readonly amountOutMinimum: string
}

export type SwapExactOutSingle = {
  readonly poolKey: PoolKey
  readonly zeroForOne: boolean
  readonly amountOut: string
  readonly amountInMaximum: string
  readonly hookData: string
}

export type SwapExactOut = {
  readonly currencyOut: string
  readonly path: readonly PathKey[]
  readonly amountOut: string
  readonly amountInMaximum: string
}

// Parses V4Router actions
export abstract class V4BaseActionsParser {
  public static parseCalldata(calldata: string): V4RouterCall {
    const [actions, inputs] = ethers.utils.defaultAbiCoder.decode(['bytes', 'bytes[]'], calldata)

    const actionTypes = V4BaseActionsParser.getActions(actions)

    return {
      actions: actionTypes.map((actionType: Actions, i: number) => {
        const abiDef = V4_BASE_ACTIONS_ABI_DEFINITION[actionType]
        const rawParams = ethers.utils.defaultAbiCoder.decode(
          abiDef.map((command) => command.type),
          inputs[i]
        )
        const params = rawParams.map((param, j) => {
          switch (abiDef[j].subparser) {
            case Subparser.V4SwapExactInSingle:
              return {
                name: abiDef[j].name,
                value: parseV4ExactInSingle(param),
              }
            case Subparser.V4SwapExactIn:
              return {
                name: abiDef[j].name,
                value: parseV4ExactIn(param),
              }
            case Subparser.V4SwapExactOutSingle:
              return {
                name: abiDef[j].name,
                value: parseV4ExactOutSingle(param),
              }
            case Subparser.V4SwapExactOut:
              return {
                name: abiDef[j].name,
                value: parseV4ExactOut(param),
              }
            case Subparser.PoolKey:
              return {
                name: abiDef[j].name,
                value: parsePoolKey(param),
              }
            default:
              return {
                name: abiDef[j].name,
                value: param,
              }
          }
        })

        return {
          actionName: Actions[actionType],
          actionType,
          params,
        }
      }),
    }
  }

  // parse command types from bytes string
  private static getActions(actions: string): Actions[] {
    const actionTypes = []

    for (let i = 2; i < actions.length; i += 2) {
      const byte = actions.substring(i, i + 2)
      actionTypes.push(parseInt(byte, 16) as Actions)
    }

    return actionTypes
  }
}

function parsePoolKey(data: string): PoolKey {
  const [currency0, currency1, fee, tickSpacing, hooks] = data

  return {
    currency0,
    currency1,
    fee: parseInt(fee),
    tickSpacing: parseInt(tickSpacing),
    hooks,
  }
}

function parsePathKey(data: string): PathKey {
  const [intermediateCurrency, fee, tickSpacing, hooks, hookData] = data

  return {
    intermediateCurrency,
    fee: parseInt(fee),
    tickSpacing: parseInt(tickSpacing),
    hooks,
    hookData,
  }
}

function parseV4ExactInSingle(data: any[]): SwapExactInSingle {
  const [poolKey, zeroForOne, amountIn, amountOutMinimum, hookData] = data
  const [currency0, currency1, fee, tickSpacing, hooks] = poolKey
  return {
    poolKey: {
      currency0,
      currency1,
      fee,
      tickSpacing,
      hooks,
    },
    zeroForOne,
    amountIn,
    amountOutMinimum,
    hookData,
  }
}

function parseV4ExactIn(data: any[]): SwapExactIn {
  const [currencyIn, path, amountIn, amountOutMinimum] = data
  const paths: readonly PathKey[] = path.map((pathKey: string) => parsePathKey(pathKey))

  return {
    path: paths,
    currencyIn,
    amountIn,
    amountOutMinimum,
  }
}

function parseV4ExactOutSingle(data: any[]): SwapExactOutSingle {
  const [poolKey, zeroForOne, amountOut, amountInMaximum, hookData] = data
  const { currency0, currency1, fee, tickSpacing, hooks } = poolKey

  return {
    poolKey: {
      currency0,
      currency1,
      fee,
      tickSpacing,
      hooks,
    },
    zeroForOne,
    amountOut,
    amountInMaximum,
    hookData,
  }
}

function parseV4ExactOut(data: any[]): SwapExactOut {
  const [currencyOut, path, amountOut, amountInMaximum] = data
  const paths: readonly PathKey[] = path.map((pathKey: string) => parsePathKey(pathKey))

  return {
    path: paths,
    currencyOut,
    amountOut,
    amountInMaximum,
  }
}
