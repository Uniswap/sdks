// ---------------------------------------------------------------------------
// Ctrl-C: stop the search, bank the cache, exit — and mean it.
//
// A default-terminating SIGINT never unwinds the stack, so `main`'s `finally`
// never runs and everything the interrupted run learned is discarded. That is
// not an edge case here: interrupting is the single most common way a long
// `discover` ends (the output has scrolled, the answer is visible, the search
// is still draining), and it was precisely the run with the most coverage to
// bank. So the handler makes the exit deliberate — but the FIRST version of it
// only flushed and exited, without stopping the search, and to the user that
// read as an infinite hang: progress kept streaming (the search never saw an
// abort), the cache flush serialized a potentially ~900k-pool snapshot behind
// it, and a second ^C re-entered the exact same handler.
//
// The contract now, the standard CLI one:
//
//   FIRST SIGINT/SIGTERM — abort the process-wide interrupt controller
//   (`commands/context.ts` composes it into every search signal, so the search
//   actually stops and its own drain banks the coverage it already paid for),
//   say so on stderr in one line, flush the cache, exit 128+signo.
//
//   SECOND — exit 128+signo immediately, no flush. The user has said "now"
//   twice; a cache write, however valuable, does not get a veto.
//
// SIGTERM gets the same treatment for the same reason — a `timeout 30s rl …`
// or a killed CI step should not be uniquely punished by losing its progress.
//
// The body lives here, not inline in `rl.ts`'s `process.on` closure, so the
// two-signal contract is unit-testable with an injected flush/exit
// (`interrupt.test.ts`); `rl.ts` stays untested glue.
// ---------------------------------------------------------------------------

import { flushCacheSave } from './cache'
import { triggerInterrupt } from './commands/context'

export type TerminationIO = {
  /** The cache flush — `flushCacheSave` in production, injected by tests. */
  flush: () => Promise<void>
  /** The process exit — `process.exit` in production, injected by tests. */
  exit: (code: number) => void
  /** One stderr line — `console.error` in production, injected by tests. */
  warn: (line: string) => void
}

let entries = 0

/** Test seam: forgets prior signal deliveries so each test starts at "no ^C yet". */
export function resetTerminationForTests(): void {
  entries = 0
}

/**
 * The SIGINT/SIGTERM handler body — see this file's header for the two-signal contract.
 *
 * `entries` is counted at ENTRY, before any await: a second signal arriving while the first call is
 * still flushing takes the immediate-exit arm rather than starting a second flush. `flushCacheSave`
 * never throws and clears its own registration, so the `finally` in `main` — if it ever gets to
 * run — is a no-op rather than a second write.
 */
export async function onTerminationSignal(signo: number, io: TerminationIO = defaultIO): Promise<void> {
  entries++
  if (entries > 1) {
    io.exit(128 + signo)
    return
  }
  triggerInterrupt() // the search sees this between cycles and stops issuing requests
  io.warn('interrupted — finishing up and banking the cache; press ^C again to exit immediately')
  await io.flush()
  io.exit(128 + signo)
}

const defaultIO: TerminationIO = {
  flush: flushCacheSave,
  exit: (code) => process.exit(code),
  warn: (line) => console.error(line),
}
