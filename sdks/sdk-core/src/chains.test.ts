import { ChainId, getAverageBlockTimeSecs } from './chains'

describe('getAverageBlockTimeSecs', () => {
  it('returns the registered block time for a known chain', () => {
    expect(getAverageBlockTimeSecs(ChainId.MAINNET)).toEqual(12)
    expect(getAverageBlockTimeSecs(ChainId.ARBITRUM_ONE)).toEqual(0.25)
    expect(getAverageBlockTimeSecs(ChainId.ROBINHOOD)).toEqual(0.1)
  })

  it('throws on unregistered chainId', () => {
    expect(() => getAverageBlockTimeSecs(99999)).toThrow(/unsupported chainId 99999/)
  })
})
