import { ResetPeriod, resetPeriodToSeconds, secondsToResetPeriod } from './runtime'

describe('runtime types', () => {
  describe('resetPeriodToSeconds', () => {
    it('should convert reset periods to seconds correctly', () => {
      expect(resetPeriodToSeconds(ResetPeriod.OneSecond)).toBe(1n)
      expect(resetPeriodToSeconds(ResetPeriod.FifteenSeconds)).toBe(15n)
      expect(resetPeriodToSeconds(ResetPeriod.OneMinute)).toBe(60n)
      expect(resetPeriodToSeconds(ResetPeriod.TenMinutes)).toBe(600n)
      expect(resetPeriodToSeconds(ResetPeriod.OneHourAndFiveMinutes)).toBe(3900n)
      expect(resetPeriodToSeconds(ResetPeriod.OneDay)).toBe(86400n)
      expect(resetPeriodToSeconds(ResetPeriod.SevenDaysAndOneHour)).toBe(608400n)
      expect(resetPeriodToSeconds(ResetPeriod.ThirtyDays)).toBe(2592000n)
    })
  })

  describe('secondsToResetPeriod', () => {
    it('should convert seconds to closest reset period', () => {
      expect(secondsToResetPeriod(1n)).toBe(ResetPeriod.OneSecond)
      expect(secondsToResetPeriod(15n)).toBe(ResetPeriod.FifteenSeconds)
      expect(secondsToResetPeriod(60n)).toBe(ResetPeriod.OneMinute)
      expect(secondsToResetPeriod(86400n)).toBe(ResetPeriod.OneDay)
      expect(secondsToResetPeriod(3000000n)).toBe(ResetPeriod.ThirtyDays)
    })

    it('should round to closest period', () => {
      expect(secondsToResetPeriod(30n)).toBe(ResetPeriod.OneMinute)
      expect(secondsToResetPeriod(300n)).toBe(ResetPeriod.TenMinutes)
    })
  })
})

