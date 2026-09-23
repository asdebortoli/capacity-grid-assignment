import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseWeeklyHours, type PersonCapacity } from '@/lib/capacity'

type Props = {
  person: Pick<PersonCapacity, 'id' | 'name' | 'weeklyHours'>
  onSave: (weeklyHours: number) => Promise<void>
  onCancel: () => void
}

export function WeeklyCapacityEditor({ person, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState(String(person.weeklyHours))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (error && !saving) input.current?.focus()
  }, [error, saving])

  async function submit() {
    if (pending.current) return
    const weeklyHours = parseWeeklyHours(draft)
    if (weeklyHours === null) {
      setError('Enter weekly hours between 0 and 120. Decimals are allowed.')
      return
    }
    pending.current = true
    setSaving(true)
    setError('')
    try {
      await onSave(weeklyHours)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Could not save weekly capacity. Please try again.')
      setSaving(false)
      pending.current = false
    }
  }

  return <form noValidate aria-label={`Edit weekly capacity for ${person.name}`} aria-busy={saving}
    className="rounded-xl border border-primary/25 bg-card p-4 shadow-xs sm:p-5"
    onSubmit={(event) => { event.preventDefault(); void submit() }}
    onKeyDown={(event) => {
      if (event.key === 'Escape' && !pending.current) { event.preventDefault(); onCancel() }
    }}>
    <p className="mb-1 text-sm font-semibold">Weekly capacity for <bdi>{person.name}</bdi></p>
    <p id="capacity-edit-help" className="mb-4 text-xs text-muted-foreground">
      Applies to every week, including past weeks. Assignments stay unchanged.
    </p>
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-2">
        <Label htmlFor="weekly-hours">Hours per week</Label>
        <Input ref={input} autoFocus id="weekly-hours" type="number" min="0" max="120" step="any"
          className="h-10 w-40" value={draft} disabled={saving} aria-invalid={!!error}
          aria-describedby={`capacity-edit-help${error ? ' capacity-edit-error' : ''}`}
          onChange={(event) => { setDraft(event.target.value); setError('') }} />
      </div>
      <Button type="submit" className="h-10" disabled={saving}>{saving ? 'Saving…' : 'Save capacity'}</Button>
      <Button type="button" variant="outline" className="h-10" disabled={saving} onClick={onCancel}>Cancel</Button>
    </div>
    {saving && <p role="status" className="mt-3 text-sm text-muted-foreground">Saving weekly capacity…</p>}
    {error && <p id="capacity-edit-error" role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </form>
}
