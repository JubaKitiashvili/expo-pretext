;(globalThis as unknown as Record<string, unknown>).__DEV__ = false

import { describe, test, expect } from 'bun:test'
import { measureRuns } from '../skia-adapter'
import type { TextStyle } from '../types'

const STYLE: TextStyle = { fontFamily: 'System', fontSize: 16, lineHeight: 24 }

describe('measureRuns', () => {
  test('empty string returns empty result', () => {
    const r = measureRuns('', STYLE)
    expect(r.naturalWidth).toBe(0)
    expect(r.naturalHeight).toBe(0)
    expect(r.runs).toEqual([])
  })

  test('single-word text returns one run', () => {
    const r = measureRuns('Hello', STYLE)
    expect(r.runs.length).toBeGreaterThan(0)
    expect(r.runs[0]!.text.length).toBeGreaterThan(0)
  })

  test('natural height equals lineCount × lineHeight', () => {
    const r = measureRuns('Hello world', STYLE)
    // Unconstrained width → 1 line. height = 24.
    expect(r.naturalHeight).toBe(24)
  })

  test('each run has bounds and advance', () => {
    const r = measureRuns('Hello world', STYLE)
    for (const run of r.runs) {
      expect(typeof run.advance).toBe('number')
      expect(typeof run.bounds).toBe('object')
      expect(typeof run.bounds.width).toBe('number')
    }
  })

  test('font descriptor reflects the resolved family', () => {
    const r = measureRuns('Hi', { ...STYLE, fontFamily: ['Inter', 'System'] })
    expect(r.runs[0]?.font.family).toBe('Inter')
  })

  test('font descriptor carries weight and style', () => {
    const r = measureRuns('Hi', {
      ...STYLE,
      fontWeight: '700',
      fontStyle: 'italic',
    })
    expect(r.runs[0]?.font.weight).toBe('700')
    expect(r.runs[0]?.font.style).toBe('italic')
  })

  test('run indices are monotonic', () => {
    const r = measureRuns('the quick brown fox', STYLE)
    for (let i = 1; i < r.runs.length; i++) {
      expect(r.runs[i]!.startIndex).toBeGreaterThanOrEqual(r.runs[i - 1]!.endIndex - 1)
    }
  })
})
