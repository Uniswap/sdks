import { expect } from 'chai'
// import { ethers } from 'ethers'
import { V4RouterActionParser, V4RouterCall } from './v4CommandParser'
import { V4Planner, Actions } from './v4Planner'

const addressOne = '0x0000000000000000000000000000000000000001'
const addressTwo = '0x0000000000000000000000000000000000000002'
// const amount = ethers.utils.parseEther('1')

describe('Command Parser', () => {
  type ParserTest = {
    input: V4Planner
    result: V4RouterCall
  }

  const tests: ParserTest[] = [
    {
      input: new V4Planner().addAction(Actions.SWEEP, [addressOne, addressTwo]),
      result: {
        actions: [
          {
            actionName: 'SWEEP',
            actionType: Actions.SWEEP,
            params: [
              { name: 'currency', value: addressOne },
              { name: 'recipient', value: addressTwo },
            ],
          },
        ],
      },
    },
  ]

  for (const test of tests) {
    it(`should parse calldata ${test.input.actions}`, () => {
      const calldata = test.input.finalize()
      const result = V4RouterActionParser.parseCalldata(calldata)
      expect(result).to.deep.equal(test.result)
    })
  }
})
