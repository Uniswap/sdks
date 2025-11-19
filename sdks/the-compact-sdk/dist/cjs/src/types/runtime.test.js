"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const runtime_1 = require("./runtime");
describe('runtime types', () => {
    describe('resetPeriodToSeconds', () => {
        it('should convert reset periods to seconds correctly', () => {
            expect((0, runtime_1.resetPeriodToSeconds)(runtime_1.ResetPeriod.OneSecond)).toBe(1n);
            expect((0, runtime_1.resetPeriodToSeconds)(runtime_1.ResetPeriod.FifteenSeconds)).toBe(15n);
            expect((0, runtime_1.resetPeriodToSeconds)(runtime_1.ResetPeriod.OneMinute)).toBe(60n);
            expect((0, runtime_1.resetPeriodToSeconds)(runtime_1.ResetPeriod.TenMinutes)).toBe(600n);
            expect((0, runtime_1.resetPeriodToSeconds)(runtime_1.ResetPeriod.OneHourAndFiveMinutes)).toBe(3900n);
            expect((0, runtime_1.resetPeriodToSeconds)(runtime_1.ResetPeriod.OneDay)).toBe(86400n);
            expect((0, runtime_1.resetPeriodToSeconds)(runtime_1.ResetPeriod.SevenDaysAndOneHour)).toBe(608400n);
            expect((0, runtime_1.resetPeriodToSeconds)(runtime_1.ResetPeriod.ThirtyDays)).toBe(2592000n);
        });
    });
    describe('secondsToResetPeriod', () => {
        it('should convert seconds to closest reset period', () => {
            expect((0, runtime_1.secondsToResetPeriod)(1n)).toBe(runtime_1.ResetPeriod.OneSecond);
            expect((0, runtime_1.secondsToResetPeriod)(15n)).toBe(runtime_1.ResetPeriod.FifteenSeconds);
            expect((0, runtime_1.secondsToResetPeriod)(60n)).toBe(runtime_1.ResetPeriod.OneMinute);
            expect((0, runtime_1.secondsToResetPeriod)(86400n)).toBe(runtime_1.ResetPeriod.OneDay);
            expect((0, runtime_1.secondsToResetPeriod)(3000000n)).toBe(runtime_1.ResetPeriod.ThirtyDays);
        });
        it('should round to closest period', () => {
            expect((0, runtime_1.secondsToResetPeriod)(30n)).toBe(runtime_1.ResetPeriod.OneMinute);
            expect((0, runtime_1.secondsToResetPeriod)(300n)).toBe(runtime_1.ResetPeriod.TenMinutes);
        });
    });
});
//# sourceMappingURL=runtime.test.js.map