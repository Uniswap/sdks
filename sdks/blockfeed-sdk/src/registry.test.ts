import { describe, expect, it } from 'bun:test'

import { createFakeClient } from './internal/testing'
import { createFeedRegistry } from './registry'

describe('createFeedRegistry', () => {
  it('memoizes one feed per (client, chainId) and hands the same instance back', () => {
    const { client } = createFakeClient()
    const registry = createFeedRegistry()
    const a = registry.getFeed(client, { chainId: 1 })
    const b = registry.getFeed(client, { chainId: 1 })
    expect(a).toBe(b)
  })

  it('defaults chainId to client.chain.id', () => {
    const { client } = createFakeClient({ chainId: 8453 })
    const registry = createFeedRegistry()
    // No explicit chainId → resolves from the client; a second call returns the same feed.
    expect(registry.getFeed(client)).toBe(registry.getFeed(client))
  })

  it('keys by resolved chainId: different chains get different feeds', () => {
    const { client } = createFakeClient()
    const registry = createFeedRegistry()
    expect(registry.getFeed(client, { chainId: 1 })).not.toBe(registry.getFeed(client, { chainId: 8453 }))
  })

  it('throws when no chainId is resolvable', () => {
    const { client } = createFakeClient({ chainId: null })
    const registry = createFeedRegistry()
    expect(() => registry.getFeed(client)).toThrow()
  })

  it('stopAll stops every feed and forgets them (a later getFeed returns a fresh feed)', () => {
    const { client } = createFakeClient()
    const registry = createFeedRegistry()
    const feed = registry.getFeed(client, { chainId: 1 })
    registry.stopAll()
    // The stopped feed rejects further watches.
    expect(() => feed.watch({ key: 's', calls: () => ({}), derive: (t) => ({ value: 1, identity: t.identity }) })).toThrow()
    // The registry forgot it: a new request mints a fresh, non-stopped feed.
    const fresh = registry.getFeed(client, { chainId: 1 })
    expect(fresh).not.toBe(feed)
    expect(() =>
      fresh.watch({ key: 's', calls: () => ({}), derive: (t) => ({ value: 1, identity: t.identity }) })
    ).not.toThrow()
  })
})
