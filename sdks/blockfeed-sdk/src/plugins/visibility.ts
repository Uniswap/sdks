import type { BlockFeed } from '../engine'

/**
 * Structural subset of the DOM `Document` this plugin needs. The core engine references ZERO browser
 * APIs (design doc §8); this file is the ONLY place that knows about visibility semantics, and even
 * here the document is injected as this structural type — never read from a global. The caller passes
 * it: `attachVisibilityPlugin(feed, { target: document })`.
 */
export interface VisibilityTarget {
  addEventListener(type: 'visibilitychange', cb: () => void): void
  removeEventListener(type: 'visibilitychange', cb: () => void): void
  visibilityState: 'visible' | 'hidden'
}

/** Default catch-up window (blocks re-scanned on the first tick after resume). */
export const DEFAULT_MAX_CATCHUP_BLOCKS = 20

/**
 * Bridge page visibility to a {@link BlockFeed}: pause the heartbeat while the document is hidden and
 * resume it (with a bounded catch-up log window) when the document becomes visible again. If the
 * target is already hidden at attach time, the feed is paused immediately.
 *
 * @returns a detach function that removes the listener. Idempotent — calling it more than once is a
 *   no-op after the first.
 */
export function attachVisibilityPlugin(
  feed: BlockFeed,
  opts: { target: VisibilityTarget; maxCatchupBlocks?: number }
): () => void {
  const { target } = opts
  const maxCatchupBlocks = opts.maxCatchupBlocks ?? DEFAULT_MAX_CATCHUP_BLOCKS

  const onVisibilityChange = (): void => {
    if (target.visibilityState === 'hidden') feed.pause()
    else feed.resume({ logWindowOverride: maxCatchupBlocks })
  }

  target.addEventListener('visibilitychange', onVisibilityChange)

  // Honor the initial state: a document that mounts hidden should not run the heartbeat.
  if (target.visibilityState === 'hidden') feed.pause()

  let detached = false
  return () => {
    if (detached) return
    detached = true
    target.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
