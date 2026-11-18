import { expect } from 'chai'
import { encodeSwapStep as encodeSwapStepFromRoot, RoutePlanner, UniversalRouterVersion } from '../../src'
import { encodeSwapStep } from '../../src/utils/encodeSwapStep'
import { V3SwapExactIn } from '../../src/types/encodeSwaps'
import { ROUTER_AS_RECIPIENT } from '../../src/utils/constants'
import { CommandType } from '../../src/utils/routerCommands'

describe('package exports', () => {
  it('re-exports encodeSwapStep from the package root', () => {
    expect(encodeSwapStepFromRoot).to.equal(encodeSwapStep)

    // Sanity: the export is usable standalone — one step, one command, no envelope.
    const planner = new RoutePlanner()
    const step: V3SwapExactIn = {
      type: 'V3_SWAP_EXACT_IN',
      recipient: ROUTER_AS_RECIPIENT,
      amountIn: '1000000',
      amountOutMin: '0',
      // USDC -(500)-> WETH packed path
      path: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb480001f4c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    }
    encodeSwapStepFromRoot(planner, step, UniversalRouterVersion.V2_0)
    expect(planner.commands).to.equal('0x' + CommandType.V3_SWAP_EXACT_IN.toString(16).padStart(2, '0'))
    expect(planner.inputs.length).to.equal(1)
  })
})
