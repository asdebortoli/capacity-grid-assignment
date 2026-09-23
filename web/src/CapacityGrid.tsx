import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cellStatus, fetchCapacity, formatHours, updateWeeklyHours, type CapacityResponse, type CapacityWeek, type PersonCapacity } from '@/lib/capacity'
import { formatDate } from '@/lib/dates'
import { WeeklyCapacityEditor } from './WeeklyCapacityEditor'

type Props = { from: string; to: string }
type LoadState =
  | { key: string; status: 'loading' }
  | { key: string; status: 'error'; message: string }
  | { key: string; status: 'ready'; data: CapacityResponse }

export function CapacityGrid({ from, to }: Props) {
  const [retry, setRetry] = useState(0)
  const key = `${from}:${to}:${retry}`
  const [state, setState] = useState<LoadState>({ key, status: 'loading' })
  const [editing, setEditing] = useState<PersonCapacity | null>(null)
  const [saved, setSaved] = useState<{ name: string; weeklyHours: number } | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  const returnFocusTo = useRef<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setState({ key, status: 'loading' })
    fetchCapacity(from, to, controller.signal).then(
      (data) => { if (active) setState({ key, status: 'ready', data }) },
      (error: unknown) => {
        if (active) setState({ key, status: 'error', message: error instanceof Error ? error.message : 'Could not load team capacity.' })
      },
    )
    return () => { active = false; controller.abort() }
  }, [from, to, key, retry])

  // Hide old numbers immediately after a range change or a successful save.
  const current: LoadState = state.key === key ? state : { key, status: 'loading' }

  useEffect(() => {
    if (!editing && current.status === 'ready' && returnFocusTo.current !== null) {
      grid.current?.querySelector<HTMLButtonElement>(`[data-edit-person="${returnFocusTo.current}"]`)?.focus({ preventScroll: true })
      returnFocusTo.current = null
    }
  }, [editing, current.status])

  async function save(weeklyHours: number) {
    if (!editing) return
    await updateWeeklyHours(editing.id, weeklyHours)
    setSaved({ name: editing.name, weeklyHours })
    setEditing(null)
    // Incrementing a revision refetches whichever range is current when the
    // PATCH completes, even if the user navigated during the save.
    setRetry((value) => value + 1)
  }

  return <div ref={grid} className="space-y-4">
    {editing && <WeeklyCapacityEditor key={editing.id} person={editing} onSave={save} onCancel={() => setEditing(null)} />}
    {saved && current.status !== 'error' && <p role="status" className="text-sm text-primary">
      Weekly capacity for <bdi>{saved.name}</bdi> saved at {formatHours(saved.weeklyHours)} h/week.
      {current.status === 'loading' ? ' Refreshing the grid…' : ''}
    </p>}
    <CapacityContent state={current} saved={!!saved} onRetry={() => setRetry((value) => value + 1)}
      editingDisabled={editing !== null} onEdit={(person) => {
        returnFocusTo.current = person.id
        setSaved(null)
        setEditing(person)
      }} />
  </div>
}

type ContentProps = {
  state: LoadState
  saved: boolean
  onRetry: () => void
  onEdit: (person: PersonCapacity) => void
  editingDisabled: boolean
}

function CapacityContent({ state, saved, onRetry, onEdit, editingDisabled }: ContentProps) {
  if (state.status === 'loading') {
    return <div role="status" className="flex min-h-60 items-center justify-center gap-2 rounded-xl border bg-card text-sm text-muted-foreground">
      <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" /> Loading capacity…
    </div>
  }
  if (state.status === 'error') {
    return <div className="rounded-xl border bg-card p-6">
      <p role="alert" className="mb-4 text-sm text-destructive">
        {saved ? 'Weekly capacity was saved, but the grid could not be refreshed. ' : ''}{state.message}
      </p>
      <Button variant="outline" onClick={onRetry}>Retry loading capacity</Button>
    </div>
  }
  const { people, weeks } = state.data
  if (people.length === 0) {
    return <p className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">There are no people in this team yet.</p>
  }
  return (
    <div className="capacity-grid overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 text-xs text-muted-foreground">
        <span>{people.length} people · {weeks.length} {weeks.length === 1 ? 'week' : 'weeks'}</span>
        <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-red-600" aria-hidden="true" /> Over capacity</span>
      </div>
      <Table containerProps={{ tabIndex: 0, role: 'region', 'aria-label': 'Scrollable team capacity table' }}>
        <TableCaption className="sr-only">Weekly allocated hours compared with capacity. Red cells include a text description of hours over capacity.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="person-column">Person</TableHead>
            <TableHead scope="col" className="weekly-column">Weekly capacity</TableHead>
            {weeks.map((week) => <TableHead scope="col" key={week.weekStart} className="week-column"
              title={`Week of ${formatDate(week.weekStart)}`}>
              <span className="block font-semibold">{formatDate(week.from, false)} – {formatDate(week.to, false)}</span>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                {week.workingDays < 5 ? 'Partial week · ' : ''}{week.workingDays} {week.workingDays === 1 ? 'workday' : 'workdays'}
              </span>
            </TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {people.map((person) => <PersonRow key={person.id} person={person} weeks={weeks} onEdit={onEdit} editingDisabled={editingDisabled} />)}
        </TableBody>
      </Table>
    </div>
  )
}

function PersonRow({ person, weeks, onEdit, editingDisabled }: {
  person: PersonCapacity; weeks: CapacityWeek[]; onEdit: (person: PersonCapacity) => void; editingDisabled: boolean
}) {
  const cells = new Map(person.weeks.map((cell) => [cell.weekStart, cell]))
  return <TableRow>
    <th scope="row" className="person-column text-left font-medium"><bdi>{person.name}</bdi></th>
    <TableCell className="weekly-column">
      <Button variant="ghost" className="-ml-2 tabular-nums" disabled={editingDisabled}
        data-edit-person={person.id}
        aria-label={`Edit weekly capacity for ${person.name}`} onClick={() => onEdit(person)}>
        {formatHours(person.weeklyHours)} <span className="text-xs font-normal text-muted-foreground">h / week</span>
        <Pencil className="size-3 text-muted-foreground" aria-hidden="true" />
      </Button>
    </TableCell>
    {weeks.map((week) => {
      const cell = cells.get(week.weekStart)
      if (!cell) return <TableCell key={week.weekStart}>Unavailable</TableCell>
      const status = cellStatus(cell)
      return <TableCell key={week.weekStart} className={`week-column capacity-cell capacity-${status.kind}`}>
        <span className="block font-medium tabular-nums">{formatHours(cell.allocatedHours)} <span className="font-normal opacity-60">/ {formatHours(cell.capacityHours)} h</span></span>
        <span className="mt-1 block text-xs">{status.label}</span>
      </TableCell>
    })}
  </TableRow>
}
