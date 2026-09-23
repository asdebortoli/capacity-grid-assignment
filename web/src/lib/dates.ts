export type DateRange = { from: string; to: string }

const dayMilliseconds = 86_400_000

// API dates are calendar dates, never local instants or timestamps.
export function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1) return null
  return date.toISOString().slice(0, 10) === value ? date : null
}

export function validateRange(range: DateRange): string | null {
  const from = parseDate(range.from)
  const to = parseDate(range.to)
  if (!from || !to) return 'Choose valid start and end dates.'
  if (from > to) return 'The start date must be on or before the end date.'
  if ((to.getTime() - from.getTime()) / dayMilliseconds + 1 > 366) {
    return 'Choose a range of 366 days or fewer, including both dates.'
  }
  return null
}

export function shiftRange(range: DateRange, days: number): DateRange | null {
  const dates = [range.from, range.to].map((value) => {
    const date = parseDate(value)
    if (!date) return null
    date.setUTCDate(date.getUTCDate() + days)
    if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return null
    return date.toISOString().slice(0, 10)
  })
  return dates[0] && dates[1] ? { from: dates[0], to: dates[1] } : null
}

export function formatDate(value: string, includeYear = true): string {
  const date = parseDate(value)
  if (!date) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', ...(includeYear ? { year: 'numeric' } as const : {}), timeZone: 'UTC',
  }).format(date)
}

// DayPicker uses local Date objects. Convert calendar fields explicitly so
// choosing a date does not move it a day forward/backward in another timezone.
export function toCalendarDate(value: string): Date | undefined {
  const utc = parseDate(value)
  if (!utc) return undefined
  const local = new Date(0)
  local.setFullYear(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
  local.setHours(0, 0, 0, 0)
  return local
}

export function fromCalendarDate(date: Date): string {
  return [date.getFullYear().toString().padStart(4, '0'),
    (date.getMonth() + 1).toString().padStart(2, '0'),
    date.getDate().toString().padStart(2, '0')].join('-')
}
