/**
 * Runtime enums and configuration types for The Compact
 */

/**
 * Compact category types
 */
export enum CompactCategory {
  Compact = 0,
  BatchCompact = 1,
  MultichainCompact = 2,
}

/**
 * Scope of a resource lock
 */
export enum Scope {
  Multichain = 0,
  ChainSpecific = 1,
}

/**
 * Reset period for resource locks
 * Determines how often the lock can be reset
 */
export enum ResetPeriod {
  OneSecond = 0,
  FifteenSeconds = 1,
  OneMinute = 2,
  TenMinutes = 3,
  OneHourAndFiveMinutes = 4,
  OneDay = 5,
  SevenDaysAndOneHour = 6,
  ThirtyDays = 7,
}

/**
 * Convert a ResetPeriod enum value to seconds
 * @param resetPeriod - The reset period enum value
 * @returns The number of seconds
 */
export function resetPeriodToSeconds(resetPeriod: ResetPeriod): bigint {
  switch (resetPeriod) {
    case ResetPeriod.OneSecond:
      return 1n
    case ResetPeriod.FifteenSeconds:
      return 15n
    case ResetPeriod.OneMinute:
      return 60n
    case ResetPeriod.TenMinutes:
      return 600n
    case ResetPeriod.OneHourAndFiveMinutes:
      return 3900n
    case ResetPeriod.OneDay:
      return 86400n
    case ResetPeriod.SevenDaysAndOneHour:
      return 608400n
    case ResetPeriod.ThirtyDays:
      return 2592000n
    default:
      throw new Error(`Unknown reset period: ${resetPeriod}`)
  }
}

/**
 * Convert seconds to the closest ResetPeriod enum value
 * @param seconds - The number of seconds
 * @returns The closest reset period enum value
 */
export function secondsToResetPeriod(seconds: bigint): ResetPeriod {
  if (seconds <= 1n) return ResetPeriod.OneSecond
  if (seconds <= 15n) return ResetPeriod.FifteenSeconds
  if (seconds <= 60n) return ResetPeriod.OneMinute
  if (seconds <= 600n) return ResetPeriod.TenMinutes
  if (seconds <= 3900n) return ResetPeriod.OneHourAndFiveMinutes
  if (seconds <= 86400n) return ResetPeriod.OneDay
  if (seconds <= 608400n) return ResetPeriod.SevenDaysAndOneHour
  return ResetPeriod.ThirtyDays
}
