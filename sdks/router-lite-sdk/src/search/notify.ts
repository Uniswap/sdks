// ---------------------------------------------------------------------------
// Notifier: a coalescing wake latch for the event-driven search loop. Any
// number of `poke()` calls between two `next()` awaits collapse into one
// wake — the loop only ever needs to know "something changed", not how many
// times or what. No timers, no queues: a pending latch plus a set of waiters
// for whoever is already awaiting `next()`.
// ---------------------------------------------------------------------------

export type Notifier = { poke(): void; next(): Promise<void> }

export function createNotifier(): Notifier {
  let pending = false
  let waiters: (() => void)[] = []

  return {
    poke() {
      if (waiters.length > 0) {
        const toWake = waiters
        waiters = []
        for (const wake of toWake) wake()
      } else {
        pending = true
      }
    },
    next() {
      if (pending) {
        pending = false
        return Promise.resolve()
      }
      return new Promise<void>((resolve) => {
        waiters.push(resolve)
      })
    },
  }
}

// ---------------------------------------------------------------------------
// SourceSet: the sources feeding one search — each launched as a promise that
// settles into `failures()` rather than a throw, so one source's rejection
// never becomes an unhandled rejection or aborts its siblings. Every source
// shares one AbortSignal so the caller can stop them all with `abortAll()`.
// ---------------------------------------------------------------------------

export class SourceSet {
  readonly signal: AbortSignal
  private readonly wake: Notifier
  private readonly controller = new AbortController()
  private launched = 0
  private finished = 0
  private readonly errors: { name: string; error: unknown }[] = []

  constructor(wake: Notifier) {
    this.wake = wake
    this.signal = this.controller.signal
  }

  launch(name: string, run: (signal: AbortSignal) => Promise<void>): void {
    this.launched++
    run(this.signal)
      .catch((error: unknown) => {
        this.errors.push({ name, error })
      })
      .finally(() => {
        this.finished++
        this.wake.poke()
      })
  }

  settled(): boolean {
    return this.finished === this.launched
  }

  failures(): { name: string; error: unknown }[] {
    return [...this.errors]
  }

  abortAll(): void {
    this.controller.abort()
  }
}
