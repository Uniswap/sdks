/**
 * Injectable time source for the engine heartbeat. The engine never touches `setTimeout`/`Date`
 * directly — it goes through a {@link Scheduler} so tests can drive time deterministically with a fake.
 * Handles are opaque (`unknown`): the real scheduler returns a Node/DOM timer handle, a fake may return
 * a numeric id.
 */
export interface Scheduler {
  setTimeout(cb: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  now(): number
}

/** The production scheduler, backed by the host's real timers and clock. */
export const realScheduler: Scheduler = {
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
}
