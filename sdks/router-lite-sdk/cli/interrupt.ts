// ---------------------------------------------------------------------------
// Ctrl-C: stop the search, let the command FINISH, exit 128+signo — and a
// second ^C means "now".
//
// A default-terminating SIGINT never unwinds the stack, so `main`'s `finally`
// never runs and everything the interrupted run learned is discarded. That is
// not an edge case here: interrupting is the single most common way a long
// search ends (the output has scrolled, the answer is visible, the search is
// still draining), and it was precisely the run with the most coverage to
// bank — and the most ANSWER to show.
//
// The contract, and how it got here in two steps:
//
//   FIRST SIGINT/SIGTERM — abort the process-wide interrupt controller
//   (`commands/context.ts` composes it into every search signal, so the
//   running search actually stops), print one stderr line, and RETURN. No
//   flush, no exit: the search drains its in-flight round, the command
//   renders its final panel (best route, runners-up, confidence — the answer
//   the user interrupted FOR), and control flows back through `main`, whose
//   `finally` banks the cache exactly as on any other exit. `rl.ts` then
//   overrides the exit code with 128+signo (`terminationExitCode`), which is
//   what a shell expects from an interrupted process however gracefully it
//   wound down. The first version of this handler flushed and exited RIGHT
//   HERE, which killed the process in the gap between the stream's last line
//   and the command's result panel — the user watched "search complete — 434
//   of 3,425 legs priced" scroll past and never got the route it was
//   completing toward.
//
//   SECOND — exit 128+signo immediately: no flush, no render. The user has
//   said "now" twice; nothing gets a veto. (The v1 handler simply re-entered
//   the flush on every ^C, which is why a slow cache save used to read as an
//   infinite hang.)
//
// SIGTERM gets the same treatment for the same reason — a `timeout 30s rl …`
// or a killed CI step should not be uniquely punished by losing its progress.
//
// The body lives here, not inline in `rl.ts`'s `process.on` closure, so the
// two-signal contract is unit-testable with an injected exit
// (`interrupt.test.ts`); `rl.ts` stays untested glue.
// ---------------------------------------------------------------------------

import { triggerInterrupt } from './commands/context'

export type TerminationIO = {
  /** The process exit — `process.exit` in production, injected by tests. Only the SECOND signal
   * ever calls it; the first finishes gracefully through `main`. */
  exit: (code: number) => void
  /** One stderr line — `console.error` in production, injected by tests. */
  warn: (line: string) => void
}

let firstSigno: number | undefined

/** The 128+signo exit code an interrupted run must finish with, or `undefined` when no signal ever
 * landed. `rl.ts` reads it AFTER `main` returns, so the override happens after the command rendered
 * its result and `main`'s `finally` banked the cache. */
export function terminationExitCode(): number | undefined {
  return firstSigno === undefined ? undefined : 128 + firstSigno
}

/** Test seam: forgets prior signal deliveries so each test starts at "no ^C yet". */
export function resetTerminationForTests(): void {
  firstSigno = undefined
}

/**
 * The SIGINT/SIGTERM handler body — see this file's header for the two-signal contract.
 *
 * Synchronous on purpose: the first arm's whole job is to abort the shared controller and get out
 * of the way of the command that is now finishing, and an arm with no awaits cannot race a second
 * delivery of itself.
 */
export function onTerminationSignal(signo: number, io: TerminationIO = defaultIO): void {
  if (firstSigno !== undefined) {
    io.exit(128 + signo)
    return
  }
  firstSigno = signo
  triggerInterrupt() // the search sees this between cycles and stops issuing requests
  io.warn('interrupted — finishing up and banking the cache; press ^C again to exit immediately')
}

const defaultIO: TerminationIO = {
  exit: (code) => process.exit(code),
  warn: (line) => console.error(line),
}
