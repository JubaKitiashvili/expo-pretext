globalThis.__DEV__ = false

import { describe, test, expect } from 'bun:test'
import { compareDebugMeasurement, DEBUG_ACCURACY_COLORS } from '../debug'

describe('compareDebugMeasurement', () => {
  test('exact match when diff < 1px', () => {
    const m = compareDebugMeasurement(100, 100)
    expect(m.accuracy).toBe('exact')
    expect(m.diff).toBe(0)
    expect(m.diffPercent).toBe(0)
  })

  test('exact match with sub-pixel diff', () => {
    const m = compareDebugMeasurement(100, 100.5)
    expect(m.accuracy).toBe('exact')
  })

  test('close when diff < 5%', () => {
    const m = compareDebugMeasurement(100, 103)
    expect(m.accuracy).toBe('close')
    expect(m.diff).toBe(3)
    expect(m.diffPercent).toBe(3)
  })

  test('loose when diff < 15%', () => {
    const m = compareDebugMeasurement(100, 110)
    expect(m.accuracy).toBe('loose')
    expect(m.diffPercent).toBe(10)
  })

  test('wrong when diff >= 15%', () => {
    const m = compareDebugMeasurement(100, 120)
    expect(m.accuracy).toBe('wrong')
    expect(m.diffPercent).toBe(20)
  })

  test('handles actual > predicted', () => {
    const m = compareDebugMeasurement(100, 150)
    expect(m.diff).toBe(50)
    expect(m.accuracy).toBe('wrong')
  })

  test('handles actual < predicted', () => {
    const m = compareDebugMeasurement(100, 80)
    expect(m.diff).toBe(20)
    expect(m.accuracy).toBe('wrong')
  })

  test('handles zero predicted', () => {
    const m = compareDebugMeasurement(0, 0)
    expect(m.accuracy).toBe('exact')
    expect(m.diffPercent).toBe(0)
  })

  test('returns all required fields', () => {
    const m = compareDebugMeasurement(100, 105)
    expect(typeof m.predicted).toBe('number')
    expect(typeof m.actual).toBe('number')
    expect(typeof m.diff).toBe('number')
    expect(typeof m.diffPercent).toBe('number')
    expect(typeof m.accuracy).toBe('string')
  })
})

describe('DEBUG_ACCURACY_COLORS', () => {
  test('has color for each accuracy level', () => {
    expect(DEBUG_ACCURACY_COLORS.exact).toBe('#22c55e')
    expect(DEBUG_ACCURACY_COLORS.close).toBe('#eab308')
    expect(DEBUG_ACCURACY_COLORS.loose).toBe('#f97316')
    expect(DEBUG_ACCURACY_COLORS.wrong).toBe('#ef4444')
  })
})
