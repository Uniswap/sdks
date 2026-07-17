import { type BlockFeed, type BlockFeedOptions, createBlockFeed } from './engine'
import { BlockfeedError } from './errors'
import type { BlockfeedClient } from './types'

export interface FeedRegistry {
  /**
   * Return the shared {@link BlockFeed} for a `(client, chainId)` pair, creating it on first request.
   * `chainId` defaults to `client.chain?.id`; throws {@link BlockfeedError} if neither is available.
   * Subsequent calls with the same client reference and resolved chainId return the SAME feed, so a
   * whole app shares one heartbeat per chain instead of accidentally spinning up several.
   */
  getFeed(client: BlockfeedClient, opts?: Omit<BlockFeedOptions, 'client'>): BlockFeed
  /** Stop every feed this registry created and forget them. */
  stopAll(): void
}

/**
 * Create a {@link FeedRegistry} that memoizes one {@link BlockFeed} per `(client reference, resolved
 * chainId)`. There is NO module-level global: each registry is an explicit object the app owns, which
 * is what keeps the "one heartbeat per chain" invariant honest across a codebase (see the README's
 * double-feed footgun note). `opts` (other than `client`) are read only when a feed is first created
 * for a key; later calls for the same key return the existing feed and ignore `opts`.
 */
export function createFeedRegistry(): FeedRegistry {
  const byClient = new Map<BlockfeedClient, Map<number, BlockFeed>>()

  return {
    getFeed(client, opts) {
      const chainId = opts?.chainId ?? client.chain?.id
      if (chainId === undefined) {
        throw new BlockfeedError('getFeed requires a chainId (option) when the client carries no chain.id')
      }
      let byChain = byClient.get(client)
      if (!byChain) {
        byChain = new Map<number, BlockFeed>()
        byClient.set(client, byChain)
      }
      const existing = byChain.get(chainId)
      if (existing) return existing
      const feed = createBlockFeed({ client, ...opts, chainId })
      byChain.set(chainId, feed)
      return feed
    },
    stopAll() {
      for (const byChain of byClient.values()) {
        for (const feed of byChain.values()) feed.stop()
      }
      byClient.clear()
    },
  }
}
