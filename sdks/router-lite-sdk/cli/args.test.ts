import { describe, expect, it } from 'bun:test'

import { parseArgs, UsageError, type FlagSpec } from './args'

const SPEC: FlagSpec = {
  chain: { kind: 'string', alias: 'c' },
  watch: { kind: 'boolean', alias: 'w' },
  hint: { kind: 'strings' },
}

describe('parseArgs', () => {
  it('separates positionals from flags in any order', () => {
    const parsed = parseArgs(['eth', '--chain', 'base', 'usdc', '1.5', '--watch'], SPEC)
    expect(parsed.positionals).toEqual(['eth', 'usdc', '1.5'])
    expect(parsed.strings.get('chain')).toBe('base')
    expect(parsed.booleans.has('watch')).toBe(true)
  })

  it('supports --flag=value and short aliases', () => {
    const parsed = parseArgs(['--chain=unichain', '-w'], SPEC)
    expect(parsed.strings.get('chain')).toBe('unichain')
    expect(parsed.booleans.has('watch')).toBe(true)
  })

  it('accumulates repeatable flags', () => {
    const parsed = parseArgs(['--hint', 'v2', '--hint', 'v3@500'], SPEC)
    expect(parsed.lists.get('hint')).toEqual(['v2', 'v3@500'])
  })

  it('rejects unknown flags — a typo must never silently change behaviour', () => {
    expect(() => parseArgs(['--budjet', '10s'], SPEC)).toThrow(UsageError)
  })

  it("strips Node's misleading positional-argument advice from unknown-flag errors", () => {
    expect(() => parseArgs(['--budjet', '10s'], SPEC)).toThrow(/^Unknown option '--budjet'\.?$/)
  })

  it('rejects a value-flag with no value', () => {
    expect(() => parseArgs(['--chain'], SPEC)).toThrow(UsageError)
  })
})
