import { useEffect, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { fromCalendarDate, shiftRange, toCalendarDate, validateRange, type DateRange } from '@/lib/dates'

type Props = { range: DateRange; onChange: (range: DateRange) => void }

export function DateRangeControls({ range, onChange }: Props) {
  const [draft, setDraft] = useState(range)
  const [error, setError] = useState('')
  const [calendarOpen, setCalendarOpen] = useState(false)

  useEffect(() => {
    setDraft(range)
    setError('')
  }, [range.from, range.to])

  const previous = shiftRange(range, -7)
  const next = shiftRange(range, 7)

  function apply() {
    setCalendarOpen(false)
    const message = validateRange(draft)
    setError(message ?? '')
    if (!message) onChange(draft)
  }

  return (
    <section aria-label="Date range controls" className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <form noValidate onSubmit={(event) => { event.preventDefault(); apply() }} className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="range-from">From</Label>
            <Input id="range-from" type="date" min="0001-01-01" max="9999-12-31" value={draft.from}
              className="h-10 w-40" aria-invalid={!!error} aria-describedby={error ? 'range-error' : undefined}
              onChange={(event) => { setDraft({ ...draft, from: event.target.value }); setError('') }} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="range-to">To</Label>
            <Input id="range-to" type="date" min="0001-01-01" max="9999-12-31" value={draft.to}
              className="h-10 w-40" aria-invalid={!!error} aria-describedby={error ? 'range-error' : undefined}
              onChange={(event) => { setDraft({ ...draft, to: event.target.value }); setError('') }} />
          </div>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="size-10" aria-label="Choose dates on calendar" title="Choose dates on calendar">
                <CalendarDays aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="max-h-[85vh] w-auto overflow-y-auto p-3" aria-label="Choose date range">
              <Calendar mode="range" weekStartsOn={1}
                defaultMonth={toCalendarDate(draft.from) ?? toCalendarDate(range.from)}
                selected={{ from: toCalendarDate(draft.from), to: toCalendarDate(draft.to) }}
                startMonth={toCalendarDate('0001-01-01')} endMonth={toCalendarDate('9999-12-31')}
                className="[--cell-size:--spacing(9)]"
                onSelect={(selection) => {
                  setDraft({ from: selection?.from ? fromCalendarDate(selection.from) : '', to: selection?.to ? fromCalendarDate(selection.to) : '' })
                  setError('')
                }} />
              <div className="space-y-3 border-t pt-3">
                <p className="text-xs text-muted-foreground">Hours count Monday–Friday.</p>
                <Button type="button" className="w-full" onClick={apply} disabled={!draft.from || !draft.to}>Apply dates</Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button type="submit" className="h-10 px-5">Apply</Button>
        </form>
        <div className="flex gap-2" role="group" aria-label="Move selected range by one week">
          <Button variant="outline" className="h-10" disabled={!previous} onClick={() => previous && onChange(previous)}>
            <ChevronLeft aria-hidden="true" /> Previous week
          </Button>
          <Button variant="outline" className="h-10" disabled={!next} onClick={() => next && onChange(next)}>
            Next week <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
      {error && <p id="range-error" role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  )
}
