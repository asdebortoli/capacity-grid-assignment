export type CapacityWeek = {
  weekStart: string
  from: string
  to: string
  workingDays: number
}

export type CapacityCell = {
  weekStart: string
  allocatedHours: number
  capacityHours: number
}

export type PersonCapacity = {
  id: number
  name: string
  weeklyHours: number
  weeks: CapacityCell[]
}

export type CapacityResponse = {
  weeks: CapacityWeek[]
  people: PersonCapacity[]
}

export async function fetchCapacity(from: string, to: string, signal: AbortSignal): Promise<CapacityResponse> {
  const response = await fetch(`/api/capacity?${new URLSearchParams({ from, to })}`, { signal })
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error : 'Could not load team capacity. Please try again.'
    throw new Error(message)
  }
  return response.json() as Promise<CapacityResponse>
}

const hoursFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
export const formatHours = (hours: number): string => hoursFormatter.format(hours)

export function cellStatus({ allocatedHours, capacityHours }: CapacityCell): {
  kind: 'over' | 'full' | 'available' | 'none'
  label: string
} {
  const difference = allocatedHours - capacityHours
  const amount = Math.abs(difference) < 0.01 && difference !== 0 ? '<0.01' : formatHours(Math.abs(difference))
  if (difference > 0) return { kind: 'over', label: `${amount} h over` }
  if (capacityHours === 0) return { kind: 'none', label: 'No capacity · no allocation' }
  if (difference === 0) return { kind: 'full', label: 'At capacity' }
  return { kind: 'available', label: `${amount} h available` }
}
