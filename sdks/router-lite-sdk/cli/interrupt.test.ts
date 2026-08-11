import { afterEach, expect, test } from 'bun:test'

import { resetInterruptForTests, startBudget } from './commands/context'
import { onTerminationSignal, resetTerminationForTests, type TerminationIO } from './interrupt'

// ---------------------------------------------------------------------------
// The ^C contract (`interrupt.ts`), unit-tested with an injected flush/exit.
//
// The one behavior worth guarding hard is the SECOND signal: the first
// version of this handler re-entered the same flush on every ^C, so a user
// whose cache save was the slow part had NO way to leave — the exact
// "infinite hang" this module's header describes. Each test here injects its
// own `exit` because the real one never returns; the assertions read what the
// handler DID, not what it printed.
// ---------------------------------------------------------------------------

afterEach(() => {
  resetTerminationForTests()
  resetInterruptForTests()
})

/** An IO whose every effect is a recording: `flush` resolves when the test says so (immediately by
 * default), `exit` only notes the code, `warn` only collects the line. */
function recordingIO(opts: { flushGate?: Promise<void> } = {}): {
  io: TerminationIO
  flushes: () => number
  exits: number[]
  warnings: string[]
} {
  let flushes = 0
  const exits: number[] = []
  const warnings: string[] = []
  const io: TerminationIO = {
    flush: async () => {
      flushes++
      await opts.flushGate
    },
    exit: (code) => {
      exits.push(code)
    },
    warn: (line) => {
      warnings.push(line)
    },
  }
  return { io, flushes: () => flushes, exits, warnings }
}

test('the first signal aborts the shared interrupt, says so once, flushes, and exits 128+signo', async () => {
  // The search's own signal is how "the search actually stops" is observable from outside the
  // handler: `startBudget` composed the shared interrupt into it, so a running command's signal
  // aborting IS the handler reaching the search.
  const running = startBudget(undefined)
  expect(running.signal.aborted).toBe(false)
  const { io, flushes, exits, warnings } = recordingIO()

  await onTerminationSignal(2, io)

  expect(running.signal.aborted).toBe(true) // the shared controller fired — the search stops
  expect(warnings).toHaveLength(1)
  expect(warnings[0]).toContain('press ^C again to exit immediately')
  expect(flushes()).toBe(1) // the cache was banked...
  expect(exits).toEqual([130]) // ...and the exit is the shell's 128+signo for SIGINT
})

test('the second signal exits immediately — no second flush, even while the first is still flushing', async () => {
  // The user's second ^C means "now". The first call is parked INSIDE its flush (the gate below
  // never releases until the test does), which is exactly when a slow cache save makes the second
  // press matter — and when the old handler would have started flushing all over again.
  let releaseFlush!: () => void
  const gate = new Promise<void>((resolve) => (releaseFlush = resolve))
  const { io, flushes, exits } = recordingIO({ flushGate: gate })

  const first = onTerminationSignal(2, io)
  await onTerminationSignal(2, io)

  expect(exits).toEqual([130]) // the second call exited without waiting on anything
  expect(flushes()).toBe(1) // and started no flush of its own

  releaseFlush()
  await first
  expect(exits).toEqual([130, 130]) // the first call's own exit still lands after its flush
})

test('SIGTERM carries its own signo: 128+15', async () => {
  const { io, exits } = recordingIO()
  await onTerminationSignal(15, io)
  expect(exits).toEqual([143])
})
