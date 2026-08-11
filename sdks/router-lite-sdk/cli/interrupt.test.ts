import { afterEach, expect, test } from 'bun:test'

import { resetInterruptForTests, startBudget } from './commands/context'
import { onTerminationSignal, resetTerminationForTests, terminationExitCode, type TerminationIO } from './interrupt'

// ---------------------------------------------------------------------------
// The ^C contract (`interrupt.ts`), unit-tested with an injected exit.
//
// Two behaviors are worth guarding hard, one per wrong version this handler
// has already shipped as:
//   - the FIRST signal must NOT exit (v2 exited right here, killing the
//     process between the stream's last line and the command's result panel);
//   - the SECOND must exit immediately with no cleanup of its own (v1
//     re-entered the flush on every ^C, so a slow cache save read as an
//     infinite hang).
// Each test injects its own `exit` because the real one never returns; the
// assertions read what the handler DID, not what it printed.
// ---------------------------------------------------------------------------

afterEach(() => {
  resetTerminationForTests()
  resetInterruptForTests()
})

/** An IO whose every effect is a recording: `exit` only notes the code, `warn` only collects. */
function recordingIO(): { io: TerminationIO; exits: number[]; warnings: string[] } {
  const exits: number[] = []
  const warnings: string[] = []
  return {
    io: {
      exit: (code) => {
        exits.push(code)
      },
      warn: (line) => {
        warnings.push(line)
      },
    },
    exits,
    warnings,
  }
}

test('the first signal aborts the shared interrupt, says so once, and does NOT exit — the command finishes and renders', () => {
  // The search's own signal is how "the search actually stops" is observable from outside the
  // handler: `startBudget` composed the shared interrupt into it, so a running command's signal
  // aborting IS the handler reaching the search. NOT exiting is the rest of the contract: control
  // returns to the command, which drains, renders its final panel, and exits through `main` (whose
  // `finally` banks the cache) with the code `terminationExitCode` dictates.
  const running = startBudget(undefined)
  expect(running.signal.aborted).toBe(false)
  expect(terminationExitCode()).toBeUndefined() // no ^C yet: main's own code stands
  const { io, exits, warnings } = recordingIO()

  onTerminationSignal(2, io)

  expect(running.signal.aborted).toBe(true) // the shared controller fired — the search stops
  expect(running.cause()).toBe('interrupt') // and the run will be LABELLED interrupted, not budgeted
  expect(exits).toEqual([]) // no exit: the render is still owed to the user
  expect(warnings).toHaveLength(1)
  // Signal-agnostic: this same arm serves SIGTERM, where "press ^C" is advice nobody can take.
  expect(warnings[0]).toContain('signal again to exit immediately')
  expect(terminationExitCode()).toBe(130) // what rl.ts overrides main's code with, after the render
})

test('the second signal exits immediately, without a second notice', () => {
  const { io, exits, warnings } = recordingIO()

  onTerminationSignal(2, io)
  expect(exits).toEqual([])
  onTerminationSignal(2, io)

  expect(exits).toEqual([130]) // "now" means now: no flush, no render, no waiting
  expect(warnings).toHaveLength(1) // the how-to-leave line prints once, on the first signal
})

test('SIGTERM carries its own signo: terminationExitCode 143, immediate second exit 143', () => {
  const { io, exits } = recordingIO()
  onTerminationSignal(15, io)
  expect(exits).toEqual([])
  expect(terminationExitCode()).toBe(143)
  onTerminationSignal(15, io)
  expect(exits).toEqual([143])
})
