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

  try {
    const notifier = createNotifier()
    const set = new SourceSet(notifier)
    const boom = new Error('source blew up')

    const woken = notifier.next()
    set.launch('bad', async () => {
      throw boom
    })
    await woken

    // give the runtime a turn to flag any unhandled rejection before asserting none happened
    await Promise.resolve()
    await Promise.resolve()

    expect(set.settled()).toBe(true)
    expect(set.failures()).toEqual([{ name: 'bad', error: boom }])
    expect(unhandled).toEqual([])
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
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
