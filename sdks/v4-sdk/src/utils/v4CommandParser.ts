import { ethers } from 'ethers'
import {
  Actions,
  Subparser,
  V4_SWAP_ABI_DEFINITION,
  POOL_KEY_STRUCT,
  PATH_KEY_STRUCT,
  SWAP_EXACT_IN_SINGLE_STRUCT,
  SWAP_EXACT_IN_STRUCT,
  SWAP_EXACT_OUT_SINGLE_STRUCT,
  SWAP_EXACT_OUT_STRUCT,
} from './v4Planner'

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

export type V3PathItem = {
  readonly tokenIn: string
  readonly tokenOut: string
  readonly fee: number
}

export type PoolKey = {
  readonly currency0: string
  readonly currency1: string
  readonly fee: number
  readonly tickSpacing: number
  readonly hooks: string
}

export type PathKey = {
  readonly intermediateCurrency: string
  readonly fee: number
  readonly tickSpacing: number
  readonly hooks: string
  readonly hookData: string
}

export type SwapExactInSingle = {
  readonly poolKey: PoolKey
  readonly zeroForOne: boolean
  readonly amountIn: number
  readonly amountOutMinimum: number
  readonly sqrtPriceLimitX96: number
  readonly hookData: string
}

export type SwapExactIn = {
  readonly currencyIn: string
  readonly path: readonly PathKey[]
  readonly amountIn: number
  readonly amountOutMinimum: number
}

export type SwapExactOutSingle = {
  readonly poolKey: PoolKey
  readonly zeroForOne: boolean
  readonly amountOut: number
  readonly amountInMaximum: number
  readonly sqrtPriceLimitX96: number
  readonly hookData: string
}

export type SwapExactOut = {
  readonly currencyOut: string
  readonly path: readonly PathKey[]
  readonly amountOut: number
  readonly amountInMaximum: number
}

// Parses V4Router actions
export abstract class V4RouterActionParser {
  public static parseCalldata(calldata: string): V4RouterCall {
    const [actions, inputs] = ethers.utils.defaultAbiCoder.decode(['bytes', 'bytes[]'], calldata)

    const actionTypes = V4RouterActionParser.getActions(actions)

    return {
      actions: actionTypes.map((actionType: Actions, i: number) => {
        const abiDef = V4_SWAP_ABI_DEFINITION[actionType]
        const rawParams = ethers.utils.defaultAbiCoder.decode(
          abiDef.map((command) => command.type),
          inputs[i]
        )
        const params = rawParams.map((param: string, j: number) => {
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
  const [currency0, currency1, fee, tickSpacing, hooks] = ethers.utils.defaultAbiCoder.decode([POOL_KEY_STRUCT], data)

  return {
    currency0,
    currency1,
    fee,
    tickSpacing,
    hooks,
  }
}

function parsePathKey(data: string): PathKey {
  const [intermediateCurrency, fee, tickSpacing, hooks, hookData] = ethers.utils.defaultAbiCoder.decode(
    [PATH_KEY_STRUCT],
    data
  )

  return {
    intermediateCurrency,
    fee,
    tickSpacing,
    hooks,
    hookData,
  }
}

function parseV4ExactInSingle(data: string): SwapExactInSingle {
  const [poolKey, zeroForOne, amountIn, amountOutMinimum, sqrtPriceLimitX96, hookData] =
    ethers.utils.defaultAbiCoder.decode([SWAP_EXACT_IN_SINGLE_STRUCT], data)

  return {
    poolKey: parsePoolKey(poolKey),
    zeroForOne,
    amountIn,
    amountOutMinimum,
    sqrtPriceLimitX96,
    hookData,
  }
}

function parseV4ExactIn(data: string): SwapExactIn {
  const [currencyIn, path, amountIn, amountOutMinimum] = ethers.utils.defaultAbiCoder.decode(
    [SWAP_EXACT_IN_STRUCT],
    data
  )
  const paths: readonly PathKey[] = path.map((pathKey: string) => parsePathKey(pathKey))

  return {
    path: paths,
    currencyIn,
    amountIn,
    amountOutMinimum,
  }
}

function parseV4ExactOutSingle(data: string): SwapExactOutSingle {
  const [poolKey, zeroForOne, amountOut, amountInMaximum, sqrtPriceLimitX96, hookData] =
    ethers.utils.defaultAbiCoder.decode([SWAP_EXACT_OUT_SINGLE_STRUCT], data)

  return {
    poolKey: parsePoolKey(poolKey),
    zeroForOne,
    amountOut,
    amountInMaximum,
    sqrtPriceLimitX96,
    hookData,
  }
}

function parseV4ExactOut(data: string): SwapExactOut {
  const [currencyOut, path, amountOut, amountInMaximum] = ethers.utils.defaultAbiCoder.decode(
    [SWAP_EXACT_OUT_STRUCT],
    data
  )
  const paths: readonly PathKey[] = path.map((pathKey: string) => parsePathKey(pathKey))

  return {
    path: paths,
    currencyOut,
    amountOut,
    amountInMaximum,
  }
}
