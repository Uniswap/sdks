import type { Hex, Log } from 'viem'
import { decodeEventLog, toEventSelector } from 'viem'

import type { DecodedFeedLog, FeedLogRef, LogFilter } from '../types'

export interface LogBookEntry {
  ref: FeedLogRef
  log: DecodedFeedLog
}

/** Immutable snapshot of delivered logs within the trailing window. */
export interface LogBook {
  /** key = `${txHash}:${logIndex}` */
  entries: ReadonlyMap<string, LogBookEntry>
}

/** A book with no delivered logs. */
export const emptyLogBook: LogBook = { entries: new Map() }

/** Stable per-log identity used as the book key. */
function logKey(ref: FeedLogRef): string {
  return `${ref.txHash}:${ref.logIndex}`
}

function refOf(log: DecodedFeedLog): FeedLogRef {
  return { txHash: log.txHash, logIndex: log.logIndex, blockNumber: log.blockNumber }
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

/**
 * Value equality for indexed-arg filtering. bigints/strings compared strictly, except address-shaped
 * strings which compare case-insensitively (topic-decoded addresses are checksummed; filters may not be).
 */
function argEquals(filterVal: unknown, logVal: unknown): boolean {
  if (typeof filterVal === 'string' && typeof logVal === 'string') {
    if (ADDRESS_RE.test(filterVal) && ADDRESS_RE.test(logVal)) {
      return filterVal.toLowerCase() === logVal.toLowerCase()
    }
    return filterVal === logVal
  }
  return filterVal === logVal
}

function addressEquals(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

/** True iff the decoded log satisfies the filter: same address, same event, and all specified args match. */
function filterMatches(filter: LogFilter, log: DecodedFeedLog): boolean {
  if (!addressEquals(filter.address, log.address)) return false
  if (filter.event.name !== log.eventName) return false
  if (filter.args) {
    for (const [key, val] of Object.entries(filter.args)) {
      if (!argEquals(val, log.args[key])) return false
    }
  }
  return true
}

/** Keep only decoded logs matching at least one filter (address + eventName + all specified args). */
export function matchLogsToFilters(logs: DecodedFeedLog[], filters: LogFilter[]): DecodedFeedLog[] {
  return logs.filter((log) => filters.some((filter) => filterMatches(filter, log)))
}

/**
 * Decode raw viem logs against the filters' events and keep only those matching a filter.
 * A raw log with `removed: true` is skipped entirely. A log is decoded against the first filter whose
 * address (case-insensitive) and event selector (topic0) match; the decoded set is then narrowed by
 * `matchLogsToFilters` so indexed-arg filters apply. Unmatched or undecodable logs are dropped.
 */
export function decodeFeedLogs(filters: LogFilter[], rawLogs: Log[]): DecodedFeedLog[] {
  const meta = filters.map((filter) => ({
    filter,
    selector: toEventSelector(filter.event),
    address: filter.address.toLowerCase(),
  }))

  const decoded: DecodedFeedLog[] = []
  for (const raw of rawLogs) {
    if (raw.removed) continue
    const topic0 = raw.topics[0]
    if (!topic0) continue
    const address = raw.address.toLowerCase()

    const hit = meta.find((m) => m.address === address && m.selector === topic0)
    if (!hit) continue

    // A log without full identity cannot be reconciled; drop it (pending logs have null fields).
    if (raw.transactionHash == null || raw.logIndex == null || raw.blockNumber == null) continue

    let eventName: string
    let args: Record<string, unknown>
    try {
      const result = decodeEventLog({ abi: [hit.filter.event], data: raw.data, topics: raw.topics })
      eventName = result.eventName as string
      args = (result.args as Record<string, unknown> | undefined) ?? {}
    } catch {
      continue
    }

    decoded.push({
      txHash: raw.transactionHash as Hex,
      logIndex: raw.logIndex,
      blockNumber: raw.blockNumber,
      address: raw.address,
      eventName,
      args,
    })
  }

  return matchLogsToFilters(decoded, filters)
}

/**
 * Reconcile a re-scanned trailing window against the prior book. Returns a NEW book (never mutates the
 * input) plus the new logs and retractions this tick.
 *
 * - `newLogs`: observed logs within `[fromBlock, toBlock]` whose key is not already in the book.
 * - `retractions`: prior book entries within `[fromBlock, toBlock]` that are absent from `observed` — the
 *   window re-scanned their block and they are gone (a reorg dropped them).
 * - Prior entries older than `fromBlock` are evicted silently (outside the window, no longer verifiable).
 * - Prior entries ABOVE `toBlock` (blockNumber > toBlock) are carried forward unchanged: this tick's
 *   re-scan did not cover their block, so they are neither re-confirmed nor retractable. Dropping them
 *   would re-emit them as "new" once the head re-advances (head regression / reorg).
 * - The returned book contains observed entries within `[fromBlock, toBlock]` plus carried-forward
 *   above-window entries.
 */
export function reconcileLogs(args: {
  book: LogBook
  /** All decoded logs observed in [fromBlock, toBlock] this tick. */
  observed: DecodedFeedLog[]
  fromBlock: bigint
  toBlock: bigint
}): { book: LogBook; newLogs: DecodedFeedLog[]; retractions: FeedLogRef[] } {
  const { book, observed, fromBlock, toBlock } = args

  const observedKeys = new Set(observed.map((log) => logKey(log)))
  const withinWindow = (blockNumber: bigint): boolean => blockNumber >= fromBlock && blockNumber <= toBlock

  // Defense in depth: a racing getLogs can return logs outside the requested window; an observed log
  // beyond [fromBlock, toBlock] must never be emitted (the engine also pre-windows `observed`).
  const newLogs = observed.filter((log) => withinWindow(log.blockNumber) && !book.entries.has(logKey(log)))

  const retractions: FeedLogRef[] = []
  for (const entry of book.entries.values()) {
    if (withinWindow(entry.ref.blockNumber) && !observedKeys.has(logKey(entry.ref))) {
      retractions.push(entry.ref)
    }
  }

  // New book: carry forward prior entries ABOVE the window unchanged (their block was not re-scanned this
  // tick, so they are neither re-confirmed nor retractable — dropping them would re-emit on re-advance),
  // then add every observed log within the window. This re-confirms surviving entries, admits new ones,
  // drops retracted ones (absent from observed), and evicts pre-window entries (never re-added).
  const nextEntries = new Map<string, LogBookEntry>()
  for (const entry of book.entries.values()) {
    if (entry.ref.blockNumber > toBlock) nextEntries.set(logKey(entry.ref), entry)
  }
  for (const log of observed) {
    if (!withinWindow(log.blockNumber)) continue
    nextEntries.set(logKey(log), { ref: refOf(log), log })
  }

  return { book: { entries: nextEntries }, newLogs, retractions }
}
