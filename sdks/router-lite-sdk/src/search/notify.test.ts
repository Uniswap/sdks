import { expect, test } from 'bun:test'

import { createNotifier, SourceSet } from './notify'

// ---------------------------------------------------------------------------
// Notifier: a coalescing wake latch. `poke()` never queues more than one wake,
// and `next()` never misses a poke that happened before it was called.
// ---------------------------------------------------------------------------

test('poke before next: next() resolves immediately', async () => {
  const notifier = createNotifier()
  notifier.poke()

  let resolved = false
  await notifier.next().then(() => {
    resolved = true
  })
  expect(resolved).toBe(true)
})

test('N pokes coalesce to one wake: only one pending next() resolves per burst', async () => {
  const notifier = createNotifier()
  notifier.poke()
  notifier.poke()
  notifier.poke()

  await notifier.next() // consumes the coalesced wake

  let secondResolved = false
  const secondNext = notifier.next().then(() => {
    secondResolved = true
  })
  await Promise.resolve()
  await Promise.resolve()
  expect(secondResolved).toBe(false) // no poke since the first next() — nothing to resolve

  notifier.poke()
  await secondNext
  expect(secondResolved).toBe(true)
})

test('poke while a next() is pending resolves it', async () => {
  const notifier = createNotifier()
  let resolved = false
  const pending = notifier.next().then(() => {
    resolved = true
  })

  await Promise.resolve()
  expect(resolved).toBe(false)

  notifier.poke()
  await pending
  expect(resolved).toBe(true)
})

test('multiple concurrent next() awaiters all resolve on one poke', async () => {
  const notifier = createNotifier()
  let firstResolved = false
  let secondResolved = false
  const first = notifier.next().then(() => {
    firstResolved = true
  })
  const second = notifier.next().then(() => {
    secondResolved = true
  })

  notifier.poke()
  await Promise.all([first, second])
  expect(firstResolved).toBe(true)
  expect(secondResolved).toBe(true)
})

// ---------------------------------------------------------------------------
// SourceSet: launched sources report through the notifier, never as rejections.
// ---------------------------------------------------------------------------

test('a resolving source pokes the notifier and flips settled()', async () => {
  const notifier = createNotifier()
  const set = new SourceSet(notifier)

  let released: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    released = resolve
  })

  set.launch('one', async () => {
    await gate
  })

  expect(set.settled()).toBe(false)

  const woken = notifier.next()
  released()
  await woken

  expect(set.settled()).toBe(true)
  expect(set.failures()).toEqual([])
})

test('a rejecting source lands in failures(), never rethrown, never an unhandled rejection', async () => {
  const unhandled: unknown[] = []
  const onUnhandled = (reason: unknown) => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)

  // `unhandledRejection` is dispatched on a MACROTASK — the runtime decides a rejection is unhandled
  // only after the microtask queue has drained and nothing attached a handler. Awaiting resolved
  // promises (which is what this test did until C4-T14) never leaves the microtask queue, so the
  // listener above could not have fired no matter what the code under test did, and
  // `expect(unhandled).toEqual([])` was decorative: it asserted that a detector which had not yet been
  // given a chance to run had not run. This hops a real macrotask instead.
  const nextMacrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

  try {
    const notifier = createNotifier()
    const set = new SourceSet(notifier)
    const boom = new Error('source blew up')

    const woken = notifier.next()
    set.launch('bad', async () => {
      throw boom
    })
    await woken
    await nextMacrotask()

    expect(set.settled()).toBe(true)
    expect(set.failures()).toEqual([{ name: 'bad', error: boom }])
    expect(unhandled).toEqual([])

    // WHY THERE IS NO POSITIVE CONTROL HERE, since the obvious next move is to leak a rejection
    // deliberately and watch the listener catch it: it was tried (C4-T14) and it cannot work under
    // this runner. `void Promise.reject(new Error(...))` inside a bun test does not reach a
    // `process.on('unhandledRejection')` listener — bun's test runner intercepts it first and fails
    // the test outright. Which is the reassuring version of the answer: a `SourceSet` that leaked a
    // rejection would fail this test through the RUNNER even if the listener above never fired, so the
    // claim in this test's name rests on two independent detectors rather than on the weaker one.
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
})

test('a synchronously-throwing run() is recorded as a failure, counted settled, and pokes', async () => {
  const notifier = createNotifier()
  const set = new SourceSet(notifier)
  const boom = new Error('threw before the first await')

  // `launch` must stay a synchronous start (a source's first request goes out on the caller's own
  // stack), so a `run` that throws BEFORE its first await cannot be allowed to escape `launch` —
  // it settles exactly like an async rejection: recorded, counted, woken.
  expect(() =>
    set.launch('sync-boom', () => {
      throw boom
    }),
  ).not.toThrow()

  expect(set.settled()).toBe(true)
  expect(set.failures()).toEqual([{ name: 'sync-boom', error: boom }])
  await notifier.next() // the poke was latched — a pending next() resolves without another poke
})

test('settled() is false while any launched source is still running', async () => {
  const notifier = createNotifier()
  const set = new SourceSet(notifier)

  let releaseSlow: () => void = () => {}
  const slowGate = new Promise<void>((resolve) => {
    releaseSlow = resolve
  })

  set.launch('fast', async () => {})
  set.launch('slow', async () => {
    await slowGate
  })

  await notifier.next() // the fast source's wake
  expect(set.settled()).toBe(false)

  const woken = notifier.next()
  releaseSlow()
  await woken

  expect(set.settled()).toBe(true)
})

test('abortAll() delivers an aborted signal to a running source', async () => {
  const notifier = createNotifier()
  const set = new SourceSet(notifier)

  let sawAbort = false
  let releaseGate: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve
  })

  set.launch('one', async (signal) => {
    signal.addEventListener('abort', () => {
      sawAbort = true
      releaseGate()
    })
    await gate
  })

  set.abortAll()
  await notifier.next()

  expect(sawAbort).toBe(true)
  expect(set.signal.aborted).toBe(true)
})

test('abortAll() is idempotent', () => {
  const notifier = createNotifier()
  const set = new SourceSet(notifier)

  set.abortAll()
  expect(() => set.abortAll()).not.toThrow()
  expect(set.signal.aborted).toBe(true)
})
