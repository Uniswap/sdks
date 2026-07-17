import { describe, expect, it } from 'bun:test'
import type { AbiEvent, Hex, Log } from 'viem'
import { encodeAbiParameters, encodeEventTopics, parseAbiItem } from 'viem'

import type { DecodedFeedLog, FeedLogRef, LogFilter } from '../types'

import { decodeFeedLogs, emptyLogBook, matchLogsToFilters, reconcileLogs } from './logWindow'
import type { LogBook } from './logWindow'

const TRANSFER = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
) as AbiEvent
const APPROVAL = parseAbiItem(
  'event Approval(address indexed owner, address indexed spender, uint256 value)'
) as AbiEvent

const TOKEN = '0x1111111111111111111111111111111111111111' as const
const ALICE = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa' as const
const BOB = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' as const

/** Build a viem-shaped raw Log for TRANSFER with the given indexed args + value. */
function transferLog(args: {
  address?: string
  from: `0x${string}`
  to: `0x${string}`
  value: bigint
  txHash: Hex
  logIndex: number
  blockNumber: bigint
  removed?: boolean
}): Log {
  const topics = encodeEventTopics({
    abi: [TRANSFER],
    eventName: 'Transfer',
    args: { from: args.from, to: args.to },
  })
  const data = encodeAbiParameters([{ type: 'uint256' }], [args.value])
  return {
    address: args.address ?? TOKEN,
    topics,
    data,
    transactionHash: args.txHash,
    logIndex: args.logIndex,
    blockNumber: args.blockNumber,
    blockHash: '0xblock',
    transactionIndex: 0,
    removed: args.removed ?? false,
  } as unknown as Log
}

const transferFilter = (args?: Record<string, unknown>): LogFilter => ({
  address: TOKEN,
  event: TRANSFER,
  args,
})

/** Convenience: build a decoded log directly for reconcile tests. */
const decoded = (over: Partial<DecodedFeedLog> & Pick<DecodedFeedLog, 'txHash' | 'logIndex' | 'blockNumber'>): DecodedFeedLog => ({
  address: TOKEN,
  eventName: 'Transfer',
  args: {},
  ...over,
})

describe('decodeFeedLogs', () => {
  it('decodes a matching log into a DecodedFeedLog and preserves identity', () => {
    const raw = transferLog({ from: ALICE, to: BOB, value: 5n, txHash: '0xtx1', logIndex: 3, blockNumber: 100n })
    const out = decodeFeedLogs([transferFilter()], [raw])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      txHash: '0xtx1',
      logIndex: 3,
      blockNumber: 100n,
      eventName: 'Transfer',
    })
    expect((out[0]!.args as { value: bigint }).value).toBe(5n)
  })

  it('drops a log whose topic0 matches no filter event', () => {
    const raw = transferLog({ from: ALICE, to: BOB, value: 5n, txHash: '0xtx1', logIndex: 0, blockNumber: 100n })
    const out = decodeFeedLogs([{ address: TOKEN, event: APPROVAL }], [raw])
    expect(out).toHaveLength(0)
  })

  it('drops a log emitted by a different address', () => {
    const raw = transferLog({
      address: '0x2222222222222222222222222222222222222222',
      from: ALICE,
      to: BOB,
      value: 5n,
      txHash: '0xtx1',
      logIndex: 0,
      blockNumber: 100n,
    })
    expect(decodeFeedLogs([transferFilter()], [raw])).toHaveLength(0)
  })

  it('skips logs flagged removed:true entirely', () => {
    const raw = transferLog({
      from: ALICE,
      to: BOB,
      value: 5n,
      txHash: '0xtx1',
      logIndex: 0,
      blockNumber: 100n,
      removed: true,
    })
    expect(decodeFeedLogs([transferFilter()], [raw])).toHaveLength(0)
  })

  it('matches on an indexed arg filter (from == ALICE) and drops non-matching', () => {
    const hit = transferLog({ from: ALICE, to: BOB, value: 1n, txHash: '0xa', logIndex: 0, blockNumber: 100n })
    const miss = transferLog({ from: BOB, to: ALICE, value: 2n, txHash: '0xb', logIndex: 1, blockNumber: 100n })
    const out = decodeFeedLogs([transferFilter({ from: ALICE })], [hit, miss])
    expect(out.map((l) => l.txHash)).toEqual(['0xa'])
  })

  it('matches address case-insensitively (filter address lower-cased vs checksummed log)', () => {
    const raw = transferLog({
      address: TOKEN.toUpperCase().replace('0X', '0x'),
      from: ALICE,
      to: BOB,
      value: 1n,
      txHash: '0xa',
      logIndex: 0,
      blockNumber: 100n,
    })
    const out = decodeFeedLogs([{ address: TOKEN, event: TRANSFER }], [raw])
    expect(out).toHaveLength(1)
  })
})

describe('matchLogsToFilters', () => {
  it('keeps only decoded logs matching some filter args + eventName + address', () => {
    const logs: DecodedFeedLog[] = [
      decoded({ txHash: '0xa', logIndex: 0, blockNumber: 100n, args: { from: ALICE, to: BOB, value: 1n } }),
      decoded({ txHash: '0xb', logIndex: 1, blockNumber: 100n, args: { from: BOB, to: ALICE, value: 2n } }),
    ]
    const out = matchLogsToFilters(logs, [transferFilter({ from: ALICE })])
    expect(out.map((l) => l.txHash)).toEqual(['0xa'])
  })

  it('compares address args case-insensitively', () => {
    const logs = [decoded({ txHash: '0xa', logIndex: 0, blockNumber: 100n, args: { from: ALICE.toLowerCase() } })]
    const out = matchLogsToFilters(logs, [transferFilter({ from: ALICE })])
    expect(out).toHaveLength(1)
  })
})

describe('reconcileLogs', () => {
  const log = (txHash: Hex, blockNumber: bigint, logIndex = 0): DecodedFeedLog =>
    decoded({ txHash, logIndex, blockNumber, args: { value: blockNumber } })

  const bookOf = (...logs: DecodedFeedLog[]): LogBook => {
    const entries = new Map(logs.map((l) => [`${l.txHash}:${l.logIndex}`, { ref: refOf(l), log: l }]))
    return { entries }
  }
  const refOf = (l: DecodedFeedLog): FeedLogRef => ({ txHash: l.txHash, logIndex: l.logIndex, blockNumber: l.blockNumber })

  it('detects new logs not present in the book', () => {
    const a = log('0xa', 100n)
    const { newLogs, retractions, book } = reconcileLogs({
      book: emptyLogBook,
      observed: [a],
      fromBlock: 98n,
      toBlock: 100n,
    })
    expect(newLogs.map((l) => l.txHash)).toEqual(['0xa'])
    expect(retractions).toHaveLength(0)
    expect(book.entries.has('0xa:0')).toBe(true)
  })

  it('dedupes a log already in the book across overlapping windows', () => {
    const a = log('0xa', 99n)
    const first = reconcileLogs({ book: emptyLogBook, observed: [a], fromBlock: 98n, toBlock: 100n })
    // Next tick window slides forward, still covering block 99; same log re-observed.
    const second = reconcileLogs({ book: first.book, observed: [a], fromBlock: 99n, toBlock: 101n })
    expect(second.newLogs).toHaveLength(0)
    expect(second.retractions).toHaveLength(0)
    expect(second.book.entries.has('0xa:0')).toBe(true)
  })

  it('retracts a book entry that vanished from a re-scanned block within the window', () => {
    const a = log('0xa', 100n)
    const first = reconcileLogs({ book: emptyLogBook, observed: [a], fromBlock: 98n, toBlock: 100n })
    // Same window re-scanned; the log is gone (reorg replaced block 100).
    const second = reconcileLogs({ book: first.book, observed: [], fromBlock: 98n, toBlock: 100n })
    expect(second.retractions).toEqual([refOf(a)])
    expect(second.book.entries.has('0xa:0')).toBe(false)
  })

  it('evicts entries older than fromBlock WITHOUT retraction when the window slides past', () => {
    const old = log('0xold', 90n)
    const first = reconcileLogs({ book: emptyLogBook, observed: [old], fromBlock: 88n, toBlock: 90n })
    // Window slides forward past block 90; the old entry is no longer verifiable.
    const second = reconcileLogs({ book: first.book, observed: [], fromBlock: 95n, toBlock: 97n })
    expect(second.retractions).toHaveLength(0)
    expect(second.book.entries.has('0xold:0')).toBe(false)
  })

  it('returned book contains only entries within [fromBlock, toBlock]', () => {
    const inWin = log('0xin', 100n)
    const observedOut = log('0xout', 200n) // pathological: outside declared window
    const { book } = reconcileLogs({
      book: emptyLogBook,
      observed: [inWin, observedOut],
      fromBlock: 98n,
      toBlock: 100n,
    })
    expect(book.entries.has('0xin:0')).toBe(true)
    expect(book.entries.has('0xout:0')).toBe(false)
  })

  it('(A3) carries forward a prior entry ABOVE toBlock unchanged (head regression), no retraction', () => {
    const a = log('0xa', 100n)
    const first = reconcileLogs({ book: emptyLogBook, observed: [a], fromBlock: 98n, toBlock: 100n })
    // Head regresses to 99: block 100 is above the window and was not re-scanned this tick.
    const second = reconcileLogs({ book: first.book, observed: [], fromBlock: 97n, toBlock: 99n })
    expect(second.retractions).toHaveLength(0) // NOT falsely retracted
    expect(second.book.entries.has('0xa:0')).toBe(true) // carried forward
    // Head re-advances to 100 and re-observes the same log: deduped, not re-emitted.
    const third = reconcileLogs({ book: second.book, observed: [a], fromBlock: 98n, toBlock: 100n })
    expect(third.newLogs).toHaveLength(0)
    expect(third.retractions).toHaveLength(0)
  })

  it('(A3) never emits an observed log outside [fromBlock, toBlock] as new (defense in depth)', () => {
    const inWin = log('0xin', 100n)
    const outWin = log('0xout', 200n)
    const { newLogs } = reconcileLogs({
      book: emptyLogBook,
      observed: [inWin, outWin],
      fromBlock: 98n,
      toBlock: 100n,
    })
    expect(newLogs.map((l) => l.txHash)).toEqual(['0xin'])
  })

  it('is immutable: does not mutate the input book map and returns a new book', () => {
    const a = log('0xa', 100n)
    const input = bookOf(a)
    const before = input.entries.size
    const b = log('0xb', 100n)
    const { book } = reconcileLogs({ book: input, observed: [a, b], fromBlock: 98n, toBlock: 100n })
    expect(input.entries.size).toBe(before)
    expect(book).not.toBe(input)
    expect(book.entries).not.toBe(input.entries)
    expect(book.entries.size).toBe(2)
  })

  it('emptyLogBook has no entries', () => {
    expect(emptyLogBook.entries.size).toBe(0)
  })
})
