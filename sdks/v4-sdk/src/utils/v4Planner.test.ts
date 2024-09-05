import { BigNumber } from 'ethers'
import { Token, WETH9 } from '@uniswap/sdk-core'
import { encodeSqrtRatioX96 } from '@uniswap/v3-sdk'
import { Pool } from '../entities/pool'
import {
  ADDRESS_ZERO,
  FEE_AMOUNT_MEDIUM,
  TICK_SPACING_TEN,
} from './internalConstants'

import { Actions, V4Planner } from './v4Planner'

const ONE_ETHER = BigNumber.from(1).pow(18)

const USDC = new Token(1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6, 'USDC', 'USD Coin')
const DAI = new Token(1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 18, 'DAI', 'DAI Stablecoin')
const USDC_WETH = new Pool(
  USDC,
  WETH9[1],
  FEE_AMOUNT_MEDIUM,
  TICK_SPACING_TEN,
  ADDRESS_ZERO,
  encodeSqrtRatioX96(1, 1),
  0,
  0,
  []
)

describe.only('RouterPlanner', () => {
  let planner: V4Planner

  beforeEach(() => {
    planner = new V4Planner()
  })

  it('encodes a v4 exactInSingle swap', async () => {
    planner.addAction(Actions.SWAP_EXACT_IN_SINGLE, [
      {
        poolKey: USDC_WETH.poolKey,
        zeroForOne: true,
        amountIn: ONE_ETHER,
        amountOutMinimum: ONE_ETHER.div(2),
        sqrtPriceLimitX96: 0,
        hookData: '0x',
      },
    ])
    planner.addAction(Actions.SETTLE_TAKE_PAIR, [USDC.address, WETH9[1].address])

    expect(planner.actions).toEqual('0x0416')
    expect(planner.params[0]).toEqual('0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001400000000000000000000000000000000000000000000000000000000000000000')
    expect(planner.params[1]).toEqual('0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
  })

  it.only('completes a v4 exactIn 2 hop swap', async () => {
    v4Planner.addAction(Actions.SWAP_EXACT_IN, [
      {
        DAI.address,
        path: encodeMultihopExactInPath([DAI_USDC.poolKey, USDC_WETH.poolKey], currencyIn),
        amountIn: amountInDAI,
        amountOutMinimum: minAmountOutNative,
      },
    ])
    v4Planner.addAction(Actions.SETTLE_TAKE_PAIR, [currencyIn, wethContract.address])

    planner.addCommand(CommandType.V4_SWAP, [v4Planner.actions, v4Planner.params])

    const { daiBalanceBefore, daiBalanceAfter, wethBalanceBefore, wethBalanceAfter } = await executeRouter(
      planner,
      bob,
      router,
      wethContract,
      daiContract,
      usdcContract
    )
    console.log(planner)


    expect(wethBalanceAfter.sub(wethBalanceBefore)).to.be.gte(minAmountOutNative)
    expect(daiBalanceBefore.sub(daiBalanceAfter)).to.be.eq(amountInDAI)
  })

})
