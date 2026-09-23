import { CapacityGrid } from './CapacityGrid'
import { useState } from 'react'
import { DateRangeControls } from './DateRangeControls'
import { formatDate, type DateRange } from './lib/dates'

const initialRange: DateRange = { from: '2025-12-29', to: '2026-01-16' }

export function App() {
  const [range, setRange] = useState(initialRange)

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-8 sm:py-10">
      <header className="mb-7">
        <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-primary uppercase">Team overview</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Team capacity</h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">See planned work against your team’s availability, week by week.</p>
      </header>
      <DateRangeControls range={range} onChange={setRange} />
      <section aria-labelledby="allocation-heading" className="mt-7">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="allocation-heading" className="text-lg font-semibold">Weekly allocation</h2>
            <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
              Showing {formatDate(range.from)} – {formatDate(range.to)}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">Allocated / capacity, in hours</p>
        </div>
        <CapacityGrid from={range.from} to={range.to} />
      </section>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Weeks start Monday. Capacity is spread evenly across five working days and adjusted to your selected dates.
      </p>
    </main>
  )
}
