// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapacityGrid } from './CapacityGrid'
import type { CapacityResponse } from './lib/capacity'

const initialRange = { from: '2026-01-06', to: '2026-01-08' }
const nextRange = { from: '2026-01-13', to: '2026-01-15' }

function data(weeklyHours = 40, range = initialRange): CapacityResponse {
  const weekStart = range === initialRange ? '2026-01-05' : '2026-01-12'
  return {
    weeks: [{ weekStart, ...range, workingDays: 3 }],
    people: [{ id: 4, name: 'Dee Okafor', weeklyHours,
      weeks: [{ weekStart, allocatedHours: 28, capacityHours: weeklyHours * 3 / 5 }] }],
  }
}

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
function deferredResponse() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((done) => { resolve = done })
  return { promise, resolve }
}
async function edit(value: string) {
  fireEvent.click(await screen.findByRole('button', { name: /^Edit weekly capacity for Dee Okafor:/ }))
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Hours per week' }), { target: { value } })
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('weekly capacity editing', () => {
  it('includes the visible hours and person in the edit button name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(data())))
    render(<CapacityGrid {...initialRange} />)
    expect(await screen.findByRole('button', { name: 'Edit weekly capacity for Dee Okafor: 40 h / week' })).toBeTruthy()
  })

  it('saves decimals once, then waits for server totals before showing updated capacity', async () => {
    const patch = deferredResponse()
    const refresh = deferredResponse()
    const fetch = vi.fn().mockResolvedValueOnce(json(data())).mockReturnValueOnce(patch.promise).mockReturnValueOnce(refresh.promise)
    vi.stubGlobal('fetch', fetch)
    render(<CapacityGrid {...initialRange} />)
    await edit('32.5')
    const save = screen.getByRole('button', { name: 'Save capacity' })
    fireEvent.click(save)
    fireEvent.click(save)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1]).toEqual(['/api/people/4', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"weeklyHours":32.5}',
    }])
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('cell', { name: /^28 \/ 24 h\s*4 h over$/ })).toBeTruthy()
    await act(async () => patch.resolve(json({ weeklyHours: 32.5 })))
    expect(screen.queryByRole('cell', { name: /^28 \/ 24 h\s*4 h over$/ })).toBeNull()
    expect(screen.getByText(/Refreshing the grid/)).toBeTruthy()
    await act(async () => refresh.resolve(json(data(32.5))))
    expect(await screen.findByRole('cell', { name: /^28 \/ 19\.5 h\s*8\.5 h over$/ })).toBeTruthy()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Edit weekly capacity for Dee Okafor:/ }))
  })

  it.each(['', '-1', '121'])('rejects invalid hours %j without a PATCH', async (value) => {
    const fetch = vi.fn().mockResolvedValue(json(data()))
    vi.stubGlobal('fetch', fetch)
    render(<CapacityGrid {...initialRange} />)
    await edit(value)
    fireEvent.click(screen.getByRole('button', { name: 'Save capacity' }))
    expect(screen.getByRole('alert').textContent).toContain('between 0 and 120')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('cancels edits without saving and reopens with the original value', async () => {
    const fetch = vi.fn().mockResolvedValue(json(data()))
    vi.stubGlobal('fetch', fetch)
    render(<CapacityGrid {...initialRange} />)
    await edit('32.5')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Edit weekly capacity for Dee Okafor:/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Edit weekly capacity for Dee Okafor:/ }))
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('40')
    fireEvent.keyDown(screen.getByRole('spinbutton'), { key: 'Escape' })
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('preserves a failed save for retry and accepts explicit zero', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json(data()))
      .mockResolvedValueOnce(json({ error: 'Unable to update weekly capacity.' }, 500))
      .mockResolvedValueOnce(json({ weeklyHours: 0 })).mockResolvedValueOnce(json(data(0)))
    vi.stubGlobal('fetch', fetch)
    render(<CapacityGrid {...initialRange} />)
    await edit('0')
    fireEvent.click(screen.getByRole('button', { name: 'Save capacity' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Unable to update weekly capacity.')
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('0')
    expect(document.activeElement).toBe(screen.getByRole('spinbutton'))
    expect(screen.getByRole('cell', { name: /^28 \/ 24 h\s*4 h over$/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save capacity' }))
    expect(await screen.findByRole('cell', { name: /^28 \/ 0 h\s*28 h over$/ })).toBeTruthy()
  })

  it('distinguishes a saved value from a failed refresh and retries only the GET', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json(data())).mockResolvedValueOnce(json({ weeklyHours: 32.5 }))
      .mockResolvedValueOnce(new Response('proxy unavailable', { status: 502 })).mockResolvedValueOnce(json(data(32.5)))
    vi.stubGlobal('fetch', fetch)
    render(<CapacityGrid {...initialRange} />)
    await edit('32.5')
    fireEvent.click(screen.getByRole('button', { name: 'Save capacity' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Weekly capacity was saved, but the grid could not be refreshed.')
    expect(screen.queryByRole('spinbutton')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading capacity' }))
    expect(await screen.findByRole('cell', { name: /^28 \/ 19\.5 h\s*8\.5 h over$/ })).toBeTruthy()
    expect(fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1)
  })

  it('refreshes the current range after navigating during a save, ignoring an older GET', async () => {
    const patch = deferredResponse()
    const oldGet = deferredResponse()
    const fetch = vi.fn().mockResolvedValueOnce(json(data())).mockReturnValueOnce(patch.promise)
      .mockReturnValueOnce(oldGet.promise).mockResolvedValueOnce(json(data(32.5, nextRange)))
    vi.stubGlobal('fetch', fetch)
    const view = render(<CapacityGrid {...initialRange} />)
    await edit('32.5')
    fireEvent.click(screen.getByRole('button', { name: 'Save capacity' }))
    view.rerender(<CapacityGrid {...nextRange} />)
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(screen.getByRole('spinbutton')).toBeTruthy()
    await act(async () => patch.resolve(json({ weeklyHours: 32.5 })))
    expect(await screen.findByRole('cell', { name: /^28 \/ 19\.5 h\s*8\.5 h over$/ })).toBeTruthy()
    expect(fetch.mock.calls[3][0]).toBe('/api/capacity?from=2026-01-13&to=2026-01-15')
    await act(async () => oldGet.resolve(json(data(40, nextRange))))
    expect(screen.getByRole('cell', { name: /^28 \/ 19\.5 h\s*8\.5 h over$/ })).toBeTruthy()
    expect(screen.queryByRole('cell', { name: /^28 \/ 24 h\s*4 h over$/ })).toBeNull()
  })
})
