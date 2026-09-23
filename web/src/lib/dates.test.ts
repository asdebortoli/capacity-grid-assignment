import { describe, expect, it } from 'vitest'
import { formatDate, fromCalendarDate, parseDate, shiftRange, toCalendarDate, validateRange } from './dates'

describe('date ranges', () => {
  it.each(['', '2026-2-03', '2026-02-29', '0000-01-01', '2026-01-05T00:00:00Z'])('rejects invalid date %s', (value) => {
    expect(parseDate(value)).toBeNull()
  })

  it('accepts leap days, single days, and weekends', () => {
    expect(validateRange({ from: '2024-02-29', to: '2024-02-29' })).toBeNull()
    expect(validateRange({ from: '2026-01-10', to: '2026-01-11' })).toBeNull()
  })

  it('enforces ordering and the inclusive 366-day boundary', () => {
    expect(validateRange({ from: '2026-01-04', to: '2027-01-04' })).toBeNull()
    expect(validateRange({ from: '2026-01-04', to: '2027-01-05' })).not.toBeNull()
    expect(validateRange({ from: '2026-01-08', to: '2026-01-06' })).not.toBeNull()
  })

  it('shifts both endpoints across month/year boundaries without changing the selection length', () => {
    expect(shiftRange({ from: '2025-12-29', to: '2026-01-16' }, 7)).toEqual({ from: '2026-01-05', to: '2026-01-23' })
    expect(shiftRange({ from: '2026-01-06', to: '2026-01-08' }, -7)).toEqual({ from: '2025-12-30', to: '2026-01-01' })
    expect(shiftRange({ from: '2026-03-06', to: '2026-03-10' }, 7)).toEqual({ from: '2026-03-13', to: '2026-03-17' })
    expect(shiftRange({ from: '9999-12-31', to: '9999-12-31' }, 7)).toBeNull()
    expect(shiftRange({ from: '0001-01-01', to: '0001-01-01' }, -7)).toBeNull()
  })

  it('round-trips local calendar dates without UTC serialization shifts', () => {
    for (const value of ['2025-12-29', '2026-01-06', '2026-03-08', '2026-11-01', '0099-01-01']) {
      expect(fromCalendarDate(toCalendarDate(value)!)).toBe(value)
    }
    expect(formatDate('2026-01-06')).toBe('Jan 6, 2026')
  })
})
