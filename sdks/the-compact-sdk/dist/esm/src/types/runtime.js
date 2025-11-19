/**
 * Runtime enums and configuration types for The Compact
 */
/**
 * Compact category types
 */
export var CompactCategory;
(function (CompactCategory) {
    CompactCategory[CompactCategory["Compact"] = 0] = "Compact";
    CompactCategory[CompactCategory["BatchCompact"] = 1] = "BatchCompact";
    CompactCategory[CompactCategory["MultichainCompact"] = 2] = "MultichainCompact";
})(CompactCategory || (CompactCategory = {}));
/**
 * Scope of a resource lock
 */
export var Scope;
(function (Scope) {
    Scope[Scope["Multichain"] = 0] = "Multichain";
    Scope[Scope["ChainSpecific"] = 1] = "ChainSpecific";
})(Scope || (Scope = {}));
/**
 * Reset period for resource locks
 * Determines how often the lock can be reset
 */
export var ResetPeriod;
(function (ResetPeriod) {
    ResetPeriod[ResetPeriod["OneSecond"] = 0] = "OneSecond";
    ResetPeriod[ResetPeriod["FifteenSeconds"] = 1] = "FifteenSeconds";
    ResetPeriod[ResetPeriod["OneMinute"] = 2] = "OneMinute";
    ResetPeriod[ResetPeriod["TenMinutes"] = 3] = "TenMinutes";
    ResetPeriod[ResetPeriod["OneHourAndFiveMinutes"] = 4] = "OneHourAndFiveMinutes";
    ResetPeriod[ResetPeriod["OneDay"] = 5] = "OneDay";
    ResetPeriod[ResetPeriod["SevenDaysAndOneHour"] = 6] = "SevenDaysAndOneHour";
    ResetPeriod[ResetPeriod["ThirtyDays"] = 7] = "ThirtyDays";
})(ResetPeriod || (ResetPeriod = {}));
/**
 * Convert a ResetPeriod enum value to seconds
 * @param resetPeriod - The reset period enum value
 * @returns The number of seconds
 */
export function resetPeriodToSeconds(resetPeriod) {
    switch (resetPeriod) {
        case ResetPeriod.OneSecond:
            return 1n;
        case ResetPeriod.FifteenSeconds:
            return 15n;
        case ResetPeriod.OneMinute:
            return 60n;
        case ResetPeriod.TenMinutes:
            return 600n;
        case ResetPeriod.OneHourAndFiveMinutes:
            return 3900n;
        case ResetPeriod.OneDay:
            return 86400n;
        case ResetPeriod.SevenDaysAndOneHour:
            return 608400n;
        case ResetPeriod.ThirtyDays:
            return 2592000n;
        default:
            throw new Error(`Unknown reset period: ${resetPeriod}`);
    }
}
/**
 * Convert seconds to the closest ResetPeriod enum value
 * @param seconds - The number of seconds
 * @returns The closest reset period enum value
 */
export function secondsToResetPeriod(seconds) {
    if (seconds <= 1n)
        return ResetPeriod.OneSecond;
    if (seconds <= 15n)
        return ResetPeriod.FifteenSeconds;
    if (seconds <= 60n)
        return ResetPeriod.OneMinute;
    if (seconds <= 600n)
        return ResetPeriod.TenMinutes;
    if (seconds <= 3900n)
        return ResetPeriod.OneHourAndFiveMinutes;
    if (seconds <= 86400n)
        return ResetPeriod.OneDay;
    if (seconds <= 608400n)
        return ResetPeriod.SevenDaysAndOneHour;
    return ResetPeriod.ThirtyDays;
}
//# sourceMappingURL=runtime.js.map