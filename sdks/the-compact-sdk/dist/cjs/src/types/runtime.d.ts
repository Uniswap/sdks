/**
 * Runtime enums and configuration types for The Compact
 */
/**
 * Compact category types
 */
export declare enum CompactCategory {
    Compact = 0,
    BatchCompact = 1,
    MultichainCompact = 2
}
/**
 * Scope of a resource lock
 */
export declare enum Scope {
    Multichain = 0,
    ChainSpecific = 1
}
/**
 * Reset period for resource locks
 * Determines how often the lock can be reset
 */
export declare enum ResetPeriod {
    OneSecond = 0,
    FifteenSeconds = 1,
    OneMinute = 2,
    TenMinutes = 3,
    OneHourAndFiveMinutes = 4,
    OneDay = 5,
    SevenDaysAndOneHour = 6,
    ThirtyDays = 7
}
/**
 * Convert a ResetPeriod enum value to seconds
 * @param resetPeriod - The reset period enum value
 * @returns The number of seconds
 */
export declare function resetPeriodToSeconds(resetPeriod: ResetPeriod): bigint;
/**
 * Convert seconds to the closest ResetPeriod enum value
 * @param seconds - The number of seconds
 * @returns The closest reset period enum value
 */
export declare function secondsToResetPeriod(seconds: bigint): ResetPeriod;
