import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { Actions, URVersion } from '@uniswap/v4-sdk'
import { v4ActionToParams } from '../../src/utils/encodeV4Action'
import { V4Settle, V4Take, V4SwapExactIn } from '../../src/types/encodeSwaps'

describe('encodeV4Action', () => {
  describe('v4ActionToParams', () => {
    it('maps SETTLE action to correct params', () => {
      const action: V4Settle = {
        action: 'SETTLE',
        currency: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        amount: '1000000',
        payerIsUser: false,
      }
      const result = v4ActionToParams(action)
      expect(result.action).to.equal(Actions.SETTLE)
      expect(result.params).to.deep.equal([
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        '1000000',
        false,
      ])
    })

    it('maps TAKE action to correct params', () => {
      const action: V4Take = {
        action: 'TAKE',
        currency: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        recipient: '0x0000000000000000000000000000000000000002',
        amount: 0,
      }
      const result = v4ActionToParams(action)
      expect(result.action).to.equal(Actions.TAKE)
      expect(result.params).to.deep.equal([
        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        '0x0000000000000000000000000000000000000002',
        0,
      ])
    })

    it('maps SWAP_EXACT_IN action to struct param (V2.0)', () => {
      const action: V4SwapExactIn = {
        action: 'SWAP_EXACT_IN',
        currencyIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        path: [
          {
            intermediateCurrency: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            fee: 3000,
            tickSpacing: 60,
            hooks: '0x0000000000000000000000000000000000000000',
            hookData: '0x',
          },
        ],
        amountIn: 0,
        amountOutMinimum: 0,
      }
      const result = v4ActionToParams(action)
      expect(result.action).to.equal(Actions.SWAP_EXACT_IN)
      expect(result.params).to.have.length(1)
      expect(result.params[0].currencyIn).to.equal('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
      expect(result.params[0].path).to.have.length(1)
      expect(result.params[0].amountIn).to.equal(0)
      expect(result.params[0].amountOutMinimum).to.equal(0)
      // V2.0: no maxHopSlippage field
      expect(result.params[0].maxHopSlippage).to.be.undefined
    })

    it('maps SWAP_EXACT_IN action with maxHopSlippage (V2.1)', () => {
      const action: V4SwapExactIn = {
        action: 'SWAP_EXACT_IN',
        currencyIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        path: [
          {
            intermediateCurrency: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            fee: 3000,
            tickSpacing: 60,
            hooks: '0x0000000000000000000000000000000000000000',
            hookData: '0x',
          },
        ],
        amountIn: 0,
        amountOutMinimum: 0,
        maxHopSlippage: [BigNumber.from('1000000000000000000')],
      }
      const result = v4ActionToParams(action, URVersion.V2_1)
      expect(result.params[0].maxHopSlippage).to.deep.equal([BigNumber.from('1000000000000000000')])
    })
  })
})
