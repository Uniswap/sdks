import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

import { describe, expect, it } from 'bun:test'

import type { BlockFeed } from '../engine'

import { attachVisibilityPlugin, DEFAULT_MAX_CATCHUP_BLOCKS, type VisibilityTarget } from './visibility'

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** Minimal EventTarget-ish document stand-in with a settable visibilityState. */
function createFakeTarget(initial: 'visible' | 'hidden' = 'visible') {
  const listeners = new Set<() => void>()
  const target: VisibilityTarget & { emit(): void; listenerCount(): number } = {
    visibilityState: initial,
    addEventListener(_type, cb) {
      listeners.add(cb)
    },
    removeEventListener(_type, cb) {
      listeners.delete(cb)
    },
    emit() {
      for (const cb of [...listeners]) cb()
    },
    listenerCount: () => listeners.size,
  }
  return target
}

/** Records pause/resume calls against a BlockFeed. */
function createFakeFeed() {
  const calls: Array<{ kind: 'pause' } | { kind: 'resume'; logWindowOverride?: number }> = []
  const feed: BlockFeed = {
    watch: () => {
      throw new Error('not used')
    },
    pause() {
      calls.push({ kind: 'pause' })
    },
    resume(opts) {
      calls.push({ kind: 'resume', logWindowOverride: opts?.logWindowOverride })
    },
    stop() {},
    running: true,
  }
  return { feed, calls }
}

// ---------------------------------------------------------------------------
// Behavior
// ---------------------------------------------------------------------------

describe('attachVisibilityPlugin', () => {
  it('does not pause when the target starts visible', () => {
    const target = createFakeTarget('visible')
    const { feed, calls } = createFakeFeed()
    attachVisibilityPlugin(feed, { target })
    expect(calls).toEqual([])
  })

  it('pauses immediately when the target starts hidden', () => {
    const target = createFakeTarget('hidden')
    const { feed, calls } = createFakeFeed()
    attachVisibilityPlugin(feed, { target })
    expect(calls).toEqual([{ kind: 'pause' }])
  })

  it('pauses on hidden and resumes on visible with the default catch-up window', () => {
    const target = createFakeTarget('visible')
    const { feed, calls } = createFakeFeed()
    attachVisibilityPlugin(feed, { target })

    target.visibilityState = 'hidden'
    target.emit()
    target.visibilityState = 'visible'
    target.emit()

    expect(calls).toEqual([{ kind: 'pause' }, { kind: 'resume', logWindowOverride: DEFAULT_MAX_CATCHUP_BLOCKS }])
  })

  it('resumes with a custom maxCatchupBlocks override', () => {
    const target = createFakeTarget('hidden')
    const { feed, calls } = createFakeFeed()
    attachVisibilityPlugin(feed, { target, maxCatchupBlocks: 5 })

    target.visibilityState = 'visible'
    target.emit()

    expect(calls).toEqual([{ kind: 'pause' }, { kind: 'resume', logWindowOverride: 5 }])
  })

  it('detach removes the listener and is idempotent', () => {
    const target = createFakeTarget('visible')
    const { feed, calls } = createFakeFeed()
    const detach = attachVisibilityPlugin(feed, { target })
    expect(target.listenerCount()).toBe(1)

    detach()
    expect(target.listenerCount()).toBe(0)

    // Idempotent: a second call is a no-op, and post-detach events are ignored.
    detach()
    expect(target.listenerCount()).toBe(0)
    target.visibilityState = 'hidden'
    target.emit()
    expect(calls).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Design invariant: only src/plugins/ may reference browser globals.
// ---------------------------------------------------------------------------

/** Blank out line/block comments and string/template literals so prose like "trailing log window"
 * (and camelCase identifiers such as `logWindow`) never masquerade as a browser-global reference. */
function stripCommentsAndStrings(src: string): string {
  let out = ''
  const n = src.length
  for (let i = 0; i < n; ) {
    const c = src[i]
    const next = src[i + 1]
    if (c === '/' && next === '/') {
      i += 2
      while (i < n && src[i] !== '\n') i++
    } else if (c === '/' && next === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
    } else if (c === '"' || c === "'" || c === '`') {
      const quote = c
      i++
      while (i < n && src[i] !== quote) i += src[i] === '\\' ? 2 : 1
      i++
      out += ' '
    } else {
      out += c
      i++
    }
  }
  return out
}

describe('core has zero browser API references', () => {
  it('no src/ file outside plugins/ references `document` or `window`', () => {
    const srcRoot = join(import.meta.dir, '..')
    const offenders: string[] = []
    // Bare globals as whole words, in code only (comments/strings already stripped). camelCase
    // identifiers like `logWindow` don't match — their `W` is capitalized.
    const browserGlobal = /\b(document|window)\b/

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === 'plugins' || entry.name === 'node_modules') continue
          walk(full)
        } else if (entry.name.endsWith('.ts')) {
          if (browserGlobal.test(stripCommentsAndStrings(readFileSync(full, 'utf8')))) offenders.push(full)
        }
      }
    }
    walk(srcRoot)

    expect(offenders).toEqual([])
  })
})
