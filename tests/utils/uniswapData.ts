import { ethers } from 'ethers'
import JSBI from 'jsbi'
import { CurrencyAmount, Token } from '@uniswap/sdk-core'
import { computePairAddress, Pair } from '@uniswap/v2-sdk'
import { Pool, nearestUsableTick, TickMath, TICK_SPACINGS, FeeAmount } from '@uniswap/v3-sdk'
import IUniswapV3Pool from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json'

const V2_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'
const V2_ABI = [
  {
    constant: true,
    inputs: [],
    name: 'getReserves',
    outputs: [
      {
        internalType: 'uint112',
        name: 'reserve0',
        type: 'uint112',
      },
      {
        internalType: 'uint112',
        name: 'reserve1',
        type: 'uint112',
      },
      {
        internalType: 'uint32',
        name: 'blockTimestampLast',
        type: 'uint32',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
]

function getProvider(): ethers.providers.BaseProvider {
  return new ethers.providers.JsonRpcProvider(process.env['FORK_URL'])
}

export async function getPair(tokenA: Token, tokenB: Token, blockNumber: number): Promise<Pair> {
  const pairAddress = computePairAddress({ factoryAddress: V2_FACTORY, tokenA, tokenB })
  const contract = new ethers.Contract(pairAddress, V2_ABI, getProvider())
  const { reserve0, reserve1 } = await contract.getReserves({ blockTag: blockNumber })
  const [token0, token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA] // does safety checks
  return new Pair(CurrencyAmount.fromRawAmount(token0, reserve0), CurrencyAmount.fromRawAmount(token1, reserve1))
}

export async function getPool(tokenA: Token, tokenB: Token, feeAmount: FeeAmount, blockNumber: number): Promise<Pool> {
  const [token0, token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA] // does safety checks
  const poolAddress = Pool.getAddress(token0, token1, feeAmount)
  const contract = new ethers.Contract(poolAddress, IUniswapV3Pool.abi, getProvider())
  let liquidity = await contract.liquidity({ blockTag: blockNumber })
  let { sqrtPriceX96 } = await contract.slot0({ blockTag: blockNumber })
  liquidity = JSBI.BigInt(liquidity.toString())
  sqrtPriceX96 = JSBI.BigInt(sqrtPriceX96.toString())

  return new Pool(token0, token1, feeAmount, sqrtPriceX96, liquidity, TickMath.getTickAtSqrtRatio(sqrtPriceX96), [
    {
      index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACINGS[feeAmount]),
      liquidityNet: liquidity,
      liquidityGross: liquidity,
    },
    {
      index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACINGS[feeAmount]),
      liquidityNet: JSBI.multiply(liquidity, JSBI.BigInt('-1')),
      liquidityGross: liquidity,
    },
  ])
}
