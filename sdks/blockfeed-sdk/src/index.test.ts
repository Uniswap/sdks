import { describe, expect, it } from 'bun:test'

import { BLOCKFEED_SDK_VERSION } from './index'

describe('BLOCKFEED_SDK_VERSION', () => {
  it('exposes the placeholder version', () => {
    expect(BLOCKFEED_SDK_VERSION).toBe('0.0.0')
  })
})
