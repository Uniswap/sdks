import { describe, expect, it } from 'bun:test'

import { isLauncherSdkError, LauncherSdkError } from './errors'

describe('LauncherSdkError', () => {
  it('carries a stable code and a user-facing message', () => {
    const err = new LauncherSdkError('INVALID_FLOOR_PRICE', 'Floor price must be greater than zero')
    expect(err.code).toBe('INVALID_FLOOR_PRICE')
    expect(err.message).toBe('Floor price must be greater than zero')
    expect(err instanceof Error).toBe(true)
  })
})

describe('isLauncherSdkError', () => {
  it('recognizes a LauncherSdkError', () => {
    expect(isLauncherSdkError(new LauncherSdkError('INVALID_FEE', 'nope'))).toBe(true)
  })

  it('recognizes a structurally-equivalent error across a dual cjs/esm boundary', () => {
    const lookalike = Object.assign(new Error('nope'), { name: 'LauncherSdkError', code: 'INVALID_FEE' })
    expect(isLauncherSdkError(lookalike)).toBe(true)
  })

  it('rejects ordinary errors and non-errors', () => {
    expect(isLauncherSdkError(new Error('plain'))).toBe(false)
    expect(isLauncherSdkError(undefined)).toBe(false)
    expect(isLauncherSdkError({ code: 'INVALID_FEE' })).toBe(false)
  })
})
