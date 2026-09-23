import { describe, expect, it } from 'vitest'
import { cellStatus } from './capacity'

describe('capacity labels', () => {
  it.each([
    [0, 0, 'none', 'No capacity · no allocation'],
    [4, 0, 'over', '4 h over'],
    [24, 24, 'full', 'At capacity'],
    [30, 24, 'over', '6 h over'],
    [18, 24, 'available', '6 h available'],
    [0.001, 0, 'over', '<0.01 h over'],
  ] as const)('describes %s allocated / %s capacity without percentages', (allocatedHours, capacityHours, kind, label) => {
    expect(cellStatus({ weekStart: '2026-01-05', allocatedHours, capacityHours })).toEqual({ kind, label })
  })
})
