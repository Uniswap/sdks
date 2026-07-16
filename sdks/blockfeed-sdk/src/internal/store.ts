import type { FeedEvent, FeedSnapshot, FeedStore, SourceEmission, TickIdentity } from '../types'

/**
 * The consumer surface (`subscribe`/`getSnapshot`) plus the engine-side controls. Extends the public
 * {@link FeedStore} with `publish` (used by the engine to apply a batch of events atomically) and the
 * subscriber-count refcounting hooks the engine uses to start/stop polling.
 */
export interface InternalStore<T> extends FeedStore<T> {
  /** Engine-side: dispatch events and update snapshot atomically. */
  publish(events: FeedEvent<T>[]): void
  readonly subscriberCount: number
  /** Called with subscriber-count transitions so engine can refcount. */
  onSubscriberChange(cb: (count: number) => void): void
}

/**
 * Create a feed store shaped for React's `useSyncExternalStore`.
 *
 * `getSnapshot()` returns a referentially-stable object: the same reference is returned until a
 * `publish` actually mutates state (`tick`/`phase`/`stale`), at which point exactly one new snapshot
 * is built. A `publish([])` — or a publish carrying only fan-out-only events (`log`/`retraction`/`gap`)
 * — never mints a new snapshot. `tick` events append to a rolling buffer capped at `bufferSize`
 * (oldest dropped first); each changed snapshot carries a fresh buffer array so consumers can treat it
 * as immutable.
 *
 * `publish` applies every event to state first, builds at most one new snapshot, then fans the events
 * out to each listener once per event in event order — so a listener reading `getSnapshot()` during
 * notification always sees the fully-applied state. A throwing listener is isolated: the error is
 * caught so remaining listeners still run, then rethrown asynchronously via `queueMicrotask` so it
 * surfaces to the host's unhandled-error handling.
 */
export function createInternalStore<T>(opts: { bufferSize: number }): InternalStore<T> {
  const { bufferSize } = opts

  // Mutable working state; the snapshot is a frozen view rebuilt only when this changes.
  let current: SourceEmission<T> | undefined
  const buffer: SourceEmission<T>[] = []
  let phase: string | undefined
  let stale = false
  let lastTick: TickIdentity | undefined

  const listeners = new Set<(e: FeedEvent<T>) => void>()
  const subscriberChangeCbs = new Set<(count: number) => void>()

  function buildSnapshot(): FeedSnapshot<T> {
    return { current, buffer: buffer.slice(), phase, stale, lastTick }
  }

  // Referentially-stable cache; only reassigned by a publish that changes state.
  let snapshot: FeedSnapshot<T> = buildSnapshot()

  function notifySubscriberChange(): void {
    const count = listeners.size
    for (const cb of subscriberChangeCbs) cb(count)
  }

  function applyEvent(event: FeedEvent<T>): boolean {
    switch (event.type) {
      case 'tick':
        current = event.emission
        buffer.push(event.emission)
        if (buffer.length > bufferSize) buffer.splice(0, buffer.length - bufferSize)
        lastTick = event.emission.identity
        return true
      case 'phase':
        phase = event.to
        return true
      case 'stale':
        stale = event.stale
        return true
      // 'log' | 'retraction' | 'gap' are fan-out-only: they do not mutate the snapshot.
      default:
        return false
    }
  }

  function publish(events: FeedEvent<T>[]): void {
    let changed = false
    for (const event of events) {
      // Apply unconditionally; `||=` would short-circuit and skip later mutations.
      if (applyEvent(event)) changed = true
    }

    if (changed) snapshot = buildSnapshot()

    // Snapshot the listener set so subscribes/unsubscribes triggered mid-fan-out don't perturb this
    // delivery. Fan out event-by-event so every listener observes events in event order.
    const recipients = [...listeners]
    for (const event of events) {
      for (const listener of recipients) {
        try {
          listener(event)
        } catch (err) {
          queueMicrotask(() => {
            throw err
          })
        }
      }
    }
  }

  return {
    subscribe(listener) {
      const before = listeners.size
      listeners.add(listener)
      if (listeners.size !== before) notifySubscriberChange()

      let active = true
      return () => {
        if (!active) return
        active = false
        listeners.delete(listener)
        notifySubscriberChange()
      }
    },
    getSnapshot() {
      return snapshot
    },
    publish,
    get subscriberCount() {
      return listeners.size
    },
    onSubscriberChange(cb) {
      subscriberChangeCbs.add(cb)
    },
  }
}
