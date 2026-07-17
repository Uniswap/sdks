import type { Hex, Log } from 'viem'
import { decodeEventLog, toEventSelector } from 'viem'

import type { DecodedFeedLog, LogFilter } from '../types'

import { eqAddress } from './currency'

/** Immutable snapshot of delivered logs within the trailing window. */
export interface LogBook {
  /** key = `${txHash}:${logIndex}` → the full decoded log. */
  entries: ReadonlyMap<string, DecodedFeedLog>
}

/** A book with no delivered logs. */
export const emptyLogBook: LogBook = { entries: new Map() }

/**
 * Pure window/gap math for one tick's union `getLogs`. Any block span that goes un-scanned this tick —
 * whether from a stall beyond the catch-up ceiling or a plain tick that skipped blocks — is reported as
 * a single `gap` so no source silently misses logs (unified gap semantics). Given
 * the head block, the last fully-processed block, the book window, and the catch-up ceiling, compute
 * the `[fromBlock, toBlock]` to scan and any gap span that went un-scanned.
 *
 * The look-back is always-on and self-adjusting (no pause/resume override): a steady tick looks back
 * `bookWindow` blocks; after a stall it grows toward `blocksSinceLastProcessed`, capped at
 * `maxCatchupBlocks`, so a long gap recovers recent logs without an unbounded scan.
 *
 * - `bookWindow` (= trailingLogWindow) is the coverage each source's book was last built with; scanning
 *   below `lastProcessedBlock − (bookWindow − 1)` would re-observe logs the book never recorded and
 *   re-deliver them as new (the resume-duplication bug). The book's lower edge is a hard floor on
 *   `fromBlock`.
 * - effective look-back `tickWindow = min(max(bookWindow, blocksSinceLastProcessed), maxCatchupBlocks)`.
 * - `fromBlock = max(head − (tickWindow − 1), lastProcessedBlock − (bookWindow − 1), 0)`.
 * - Gap: whenever `lastProcessedBlock !== undefined && fromBlock > lastProcessedBlock + 1`, the span
 *   `[lastProcessedBlock + 1, fromBlock − 1]` was NOT re-scanned (a stall longer than the catch-up
 *   ceiling, or a plain tick that skipped blocks, both surface it).
 */
export function planLogWindow(args: {
  head: bigint
  lastProcessedBlock: bigint | undefined
  bookWindow: number
  maxCatchupBlocks: number
}): { fromBlock: bigint; toBlock: bigint; gap?: { fromBlock: bigint; toBlock: bigint } } {
  const { head, lastProcessedBlock, bookWindow, maxCatchupBlocks } = args
  const bookLookback = BigInt(Math.max(0, bookWindow - 1))

  // Effective look-back: bookWindow in steady state, growing toward the stall length, capped at the
  // catch-up ceiling. `blocksSinceLastProcessed` clamps at bookWindow when unknown/regressed.
  const blocksSinceLastProcessed =
    lastProcessedBlock !== undefined && head > lastProcessedBlock ? Number(head - lastProcessedBlock) : bookWindow
  const tickWindow = Math.min(Math.max(bookWindow, blocksSinceLastProcessed), maxCatchupBlocks)
  const tickLookback = BigInt(Math.max(0, tickWindow - 1))

  let fromBlock = head - tickLookback
  if (lastProcessedBlock !== undefined) {
    const bookFloor = lastProcessedBlock - bookLookback
    if (bookFloor > fromBlock) fromBlock = bookFloor
  }
  if (fromBlock < 0n) fromBlock = 0n
  const toBlock = head

  if (lastProcessedBlock !== undefined && fromBlock > lastProcessedBlock + 1n) {
    return { fromBlock, toBlock, gap: { fromBlock: lastProcessedBlock + 1n, toBlock: fromBlock - 1n } }
  }
  return { fromBlock, toBlock }
}

/** Stable per-log identity used as the book key. */
function logKey(log: Pick<DecodedFeedLog, 'txHash' | 'logIndex'>): string {
  return `${log.txHash}:${log.logIndex}`
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

/** True iff the decoded log satisfies the filter: same address, same event, and all specified args match. */
function filterMatches(filter: LogFilter, log: DecodedFeedLog): boolean {
  if (!eqAddress(filter.address, log.address)) return false
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
}): { book: LogBook; newLogs: DecodedFeedLog[]; retractions: DecodedFeedLog[] } {
  const { book, observed, fromBlock, toBlock } = args

  const observedKeys = new Set(observed.map((log) => logKey(log)))
  const withinWindow = (blockNumber: bigint): boolean => blockNumber >= fromBlock && blockNumber <= toBlock

  // Defense in depth: a racing getLogs can return logs outside the requested window; an observed log
  // beyond [fromBlock, toBlock] must never be emitted (the engine also pre-windows `observed`).
  const newLogs = observed.filter((log) => withinWindow(log.blockNumber) && !book.entries.has(logKey(log)))

  // Retractions carry the FULL prior log (not just a ref) so consumers can reconcile without a lookup.
  const retractions: DecodedFeedLog[] = []
  for (const entry of book.entries.values()) {
    if (withinWindow(entry.blockNumber) && !observedKeys.has(logKey(entry))) {
      retractions.push(entry)
    }
  }

  // New book: carry forward prior entries ABOVE the window unchanged (their block was not re-scanned this
  // tick, so they are neither re-confirmed nor retractable — dropping them would re-emit on re-advance),
  // then add every observed log within the window. This re-confirms surviving entries, admits new ones,
  // drops retracted ones (absent from observed), and evicts pre-window entries (never re-added).
  const nextEntries = new Map<string, DecodedFeedLog>()
  for (const entry of book.entries.values()) {
    if (entry.blockNumber > toBlock) nextEntries.set(logKey(entry), entry)
  }
  for (const log of observed) {
    if (!withinWindow(log.blockNumber)) continue
    nextEntries.set(logKey(log), log)
  }

  return { book: { entries: nextEntries }, newLogs, retractions }
}
