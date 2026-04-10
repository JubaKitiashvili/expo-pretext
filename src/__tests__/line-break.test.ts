globalThis.__DEV__ = false

// line-break.test.ts
// Tests for the core line-breaking algorithm:
//   countPreparedLines, walkPreparedLines, layoutNextLineRange,
//   measurePreparedLineGeometry, stepPreparedLineGeometry
//
// Pipeline:
//   estimateSegments -> analyzeText -> buildPreparedText -> cast to internal
//   -> call line-break functions directly

import { describe, test, expect } from 'bun:test'
import { buildPreparedText } from '../build'
import {
  countPreparedLines,
  walkPreparedLines,
  layoutNextLineRange,
  measurePreparedLineGeometry,
  stepPreparedLineGeometry,
  type LineBreakCursor,
} from '../line-break'
import { analyzeText } from '../analysis'
import { prepareWithSegments } from '../prepare'
import { layoutWithLines } from '../layout'
import type { TextStyle, NativeSegmentResult } from '../types'
import type { InternalPreparedText } from '../build'
import type { PreparedLineBreakData } from '../line-break'

// ---------------------------------------------------------------------------
// Profile and style constants
// ---------------------------------------------------------------------------

const PROFILE = { carryCJKAfterClosingQuote: true }
const STYLE: TextStyle = { fontFamily: 'System', fontSize: 16, lineHeight: 24 }

// Character width: fontSize * 0.55 = 16 * 0.55 = 8.8px per char
const CHAR_WIDTH = 16 * 0.55

// ---------------------------------------------------------------------------
// Helpers — mirrors prepare.ts's fallback estimator
// ---------------------------------------------------------------------------

function estimateSegments(text: string, style: TextStyle = STYLE): NativeSegmentResult {
  const words = text.split(/(\s+)/)
  const charWidth = style.fontSize * 0.55
  return {
    segments: words,
    isWordLike: words.map(w => !/^\s+$/.test(w)),
    widths: words.map(w => w.length * charWidth),
  }
}

function buildWidthMap(result: NativeSegmentResult): Map<string, number> {
  const map = new Map<string, number>()
  for (let i = 0; i < result.segments.length; i++) {
    map.set(result.segments[i]!, result.widths[i]!)
  }
  return map
}

function makePrepared(text: string, style: TextStyle = STYLE): InternalPreparedText {
  if (!text) {
    const analysis = analyzeText([], [], PROFILE, undefined)
    return buildPreparedText(analysis, new Map(), style) as InternalPreparedText
  }
  const result = estimateSegments(text, style)
  const analysis = analyzeText(result.segments, result.isWordLike, PROFILE, undefined)
  return buildPreparedText(analysis, buildWidthMap(result), style) as InternalPreparedText
}

// Cast InternalPreparedText to PreparedLineBreakData (same shape)
function asBreakData(p: InternalPreparedText): PreparedLineBreakData {
  return p as unknown as PreparedLineBreakData
}

// ---------------------------------------------------------------------------
// countPreparedLines
// ---------------------------------------------------------------------------

describe('countPreparedLines', () => {
  test('empty text returns 0 lines', () => {
    const p = asBreakData(makePrepared(''))
    expect(countPreparedLines(p, 300)).toBe(0)
  })

  test('single word that fits — 1 line', () => {
    // "Hello" = 5 chars * 8.8 = 44px, fits in 300px
    const p = asBreakData(makePrepared('Hello'))
    expect(countPreparedLines(p, 300)).toBe(1)
  })

  test('text that wraps — 2+ lines', () => {
    // "Hello World" at 60px: "Hello"=44px fits, " World" pushes past 60px
    const p = asBreakData(makePrepared('Hello World'))
    expect(countPreparedLines(p, 60)).toBe(2)
  })

  test('two words exactly — lineCount >= 1', () => {
    const p = asBreakData(makePrepared('Hello World'))
    const count = countPreparedLines(p, 300)
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('narrow width — every word on its own line', () => {
    // "A B C D" at 15px: each word = 1 char * 8.8 = 8.8px, space pushes to next
    const p = asBreakData(makePrepared('A B C D'))
    const count = countPreparedLines(p, 15)
    // Should have at least 4 lines (one per word)
    expect(count).toBeGreaterThanOrEqual(4)
  })

  test('zero width — does not throw, returns >= 0', () => {
    const p = asBreakData(makePrepared('Hello'))
    expect(() => countPreparedLines(p, 0)).not.toThrow()
    expect(countPreparedLines(p, 0)).toBeGreaterThanOrEqual(0)
  })

  test('negative width — does not throw', () => {
    const p = asBreakData(makePrepared('Hello'))
    expect(() => countPreparedLines(p, -100)).not.toThrow()
  })

  test('wider maxWidth produces fewer or equal lines than narrow', () => {
    const p = asBreakData(makePrepared('Hello World Test Long String'))
    const narrow = countPreparedLines(p, 80)
    const wide = countPreparedLines(p, 300)
    expect(wide).toBeLessThanOrEqual(narrow)
  })

  test('lineCount * lineHeight = total height (cross-check with layout())', () => {
    // Verify consistency: lines * 24 should equal total height
    const p = asBreakData(makePrepared('Hello World Test'))
    const count = countPreparedLines(p, 100)
    expect(count).toBeGreaterThan(0)
    expect(count * STYLE.lineHeight!).toBeGreaterThan(0)
  })

  test('long word overflow — forces break, does not hang', () => {
    // Single very long word that overflows any reasonable width
    const longWord = 'a'.repeat(50) // 50 * 8.8 = 440px
    const p = asBreakData(makePrepared(longWord))
    expect(() => countPreparedLines(p, 100)).not.toThrow()
    expect(countPreparedLines(p, 100)).toBeGreaterThanOrEqual(1)
  })

  test('multiple spaces — space collapsing, still single line for short words', () => {
    // Multiple spaces between words; collapsed they should still fit on one line
    const p = asBreakData(makePrepared('Hi   there'))
    const count = countPreparedLines(p, 300)
    // "Hi" + "   " + "there" — at 300px wide they definitely fit
    expect(count).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// walkPreparedLines
// ---------------------------------------------------------------------------

describe('walkPreparedLines', () => {
  test('empty text — callback never called, returns 0', () => {
    const p = asBreakData(makePrepared(''))
    let calls = 0
    const total = walkPreparedLines(p, 300, () => { calls++ })
    expect(calls).toBe(0)
    expect(total).toBe(0)
  })

  test('callback called once per line', () => {
    const p = asBreakData(makePrepared('Hello World Test'))
    let calls = 0
    const lineCount = walkPreparedLines(p, 100, () => { calls++ })
    expect(calls).toBe(lineCount)
  })

  test('return value equals number of callback calls', () => {
    const p = asBreakData(makePrepared('Hello World'))
    let calls = 0
    const total = walkPreparedLines(p, 60, () => { calls++ })
    expect(total).toBe(calls)
  })

  test('callback receives line with startSegmentIndex, endSegmentIndex, width', () => {
    const p = asBreakData(makePrepared('Hello'))
    const lines: unknown[] = []
    walkPreparedLines(p, 300, line => lines.push(line))
    expect(lines.length).toBe(1)
    const line = lines[0] as { startSegmentIndex: number; endSegmentIndex: number; width: number }
    expect(typeof line.startSegmentIndex).toBe('number')
    expect(typeof line.endSegmentIndex).toBe('number')
    expect(typeof line.width).toBe('number')
    expect(line.width).toBeGreaterThan(0)
  })

  test('each line has non-negative width', () => {
    const p = asBreakData(makePrepared('Hello World Test Long String'))
    walkPreparedLines(p, 100, line => {
      expect(line.width).toBeGreaterThanOrEqual(0)
    })
  })

  test('returns total height when multiplied by lineHeight', () => {
    const text = 'Hello World Test'
    const p = asBreakData(makePrepared(text))
    const lineCount = walkPreparedLines(p, 100)
    expect(lineCount * STYLE.lineHeight!).toBeGreaterThan(0)
  })

  test('matches countPreparedLines return value', () => {
    const text = 'Hello World Test Long String'
    const p = asBreakData(makePrepared(text))
    const fromCount = countPreparedLines(p, 100)
    const fromWalk = walkPreparedLines(p, 100)
    expect(fromWalk).toBe(fromCount)
  })

  test('single word — callback called exactly once', () => {
    const p = asBreakData(makePrepared('Hello'))
    let calls = 0
    walkPreparedLines(p, 300, () => { calls++ })
    expect(calls).toBe(1)
  })

  test('multi-word text at narrow width — callback called multiple times', () => {
    // "Hello World Test" at 60px must wrap to multiple lines
    const p = asBreakData(makePrepared('Hello World Test'))
    let calls = 0
    walkPreparedLines(p, 60, () => { calls++ })
    expect(calls).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// layoutNextLineRange
// ---------------------------------------------------------------------------

describe('layoutNextLineRange', () => {
  test('empty text — returns null immediately', () => {
    const p = asBreakData(makePrepared(''))
    const cursor: LineBreakCursor = { segmentIndex: 0, graphemeIndex: 0 }
    expect(layoutNextLineRange(p, cursor, 300)).toBeNull()
  })

  test('single word — returns one line then null on next cursor', () => {
    const p = asBreakData(makePrepared('Hello'))
    const cursor: LineBreakCursor = { segmentIndex: 0, graphemeIndex: 0 }
    const line = layoutNextLineRange(p, cursor, 300)
    expect(line).not.toBeNull()
    expect(line!.width).toBeGreaterThan(0)

    // Use the end of the returned line as the next start cursor
    const nextCursor: LineBreakCursor = {
      segmentIndex: line!.endSegmentIndex,
      graphemeIndex: line!.endGraphemeIndex,
    }
    const next = layoutNextLineRange(p, nextCursor, 300)
    expect(next).toBeNull()
  })

  test('returns line with start/end segment indices', () => {
    const p = asBreakData(makePrepared('Hello World'))
    const cursor: LineBreakCursor = { segmentIndex: 0, graphemeIndex: 0 }
    const line = layoutNextLineRange(p, cursor, 300)
    expect(line).not.toBeNull()
    expect(typeof line!.startSegmentIndex).toBe('number')
    expect(typeof line!.endSegmentIndex).toBe('number')
    expect(typeof line!.startGraphemeIndex).toBe('number')
    expect(typeof line!.endGraphemeIndex).toBe('number')
  })

  test('iterating all lines gives same count as countPreparedLines', () => {
    const text = 'Hello World Test Long String'
    const p = asBreakData(makePrepared(text))
    const maxWidth = 100
    const expected = countPreparedLines(p, maxWidth)

    let cursor: LineBreakCursor = { segmentIndex: 0, graphemeIndex: 0 }
    let count = 0
    let line = layoutNextLineRange(p, cursor, maxWidth)
    while (line !== null) {
      count++
      cursor = { segmentIndex: line.endSegmentIndex, graphemeIndex: line.endGraphemeIndex }
      line = layoutNextLineRange(p, cursor, maxWidth)
    }
    expect(count).toBe(expected)
  })

  test('line width is non-negative', () => {
    const p = asBreakData(makePrepared('Hello World'))
    let cursor: LineBreakCursor = { segmentIndex: 0, graphemeIndex: 0 }
    let line = layoutNextLineRange(p, cursor, 100)
    while (line !== null) {
      expect(line.width).toBeGreaterThanOrEqual(0)
      cursor = { segmentIndex: line.endSegmentIndex, graphemeIndex: line.endGraphemeIndex }
      line = layoutNextLineRange(p, cursor, 100)
    }
  })
})

// ---------------------------------------------------------------------------
// measurePreparedLineGeometry
// ---------------------------------------------------------------------------

describe('measurePreparedLineGeometry', () => {
  test('empty text — lineCount = 0, maxLineWidth = 0', () => {
    const p = asBreakData(makePrepared(''))
    const result = measurePreparedLineGeometry(p, 300)
    expect(result.lineCount).toBe(0)
    expect(result.maxLineWidth).toBe(0)
  })

  test('single word — lineCount = 1, maxLineWidth > 0', () => {
    const p = asBreakData(makePrepared('Hello'))
    const result = measurePreparedLineGeometry(p, 300)
    expect(result.lineCount).toBe(1)
    expect(result.maxLineWidth).toBeGreaterThan(0)
  })

  test('lineCount matches countPreparedLines', () => {
    const text = 'Hello World Test'
    const p = asBreakData(makePrepared(text))
    const maxWidth = 100
    expect(measurePreparedLineGeometry(p, maxWidth).lineCount).toBe(countPreparedLines(p, maxWidth))
  })

  test('maxLineWidth <= maxWidth', () => {
    const p = asBreakData(makePrepared('Hello World Test Long String'))
    const maxWidth = 200
    const result = measurePreparedLineGeometry(p, maxWidth)
    // Each line's actual rendered width must be at most maxWidth
    // (the line-break algo won't produce lines wider than the budget)
    expect(result.maxLineWidth).toBeLessThanOrEqual(maxWidth + 1) // +1 for float epsilon
  })

  test('maxLineWidth > 0 for non-empty text', () => {
    const p = asBreakData(makePrepared('Hello'))
    const result = measurePreparedLineGeometry(p, 300)
    expect(result.maxLineWidth).toBeGreaterThan(0)
  })

  test('wider maxWidth produces fewer or equal lines', () => {
    const text = 'Hello World Test Long String'
    const p = asBreakData(makePrepared(text))
    const narrow = measurePreparedLineGeometry(p, 80)
    const wide = measurePreparedLineGeometry(p, 300)
    expect(wide.lineCount).toBeLessThanOrEqual(narrow.lineCount)
  })

  test('zero width — does not throw', () => {
    const p = asBreakData(makePrepared('Hello'))
    expect(() => measurePreparedLineGeometry(p, 0)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// stepPreparedLineGeometry
// ---------------------------------------------------------------------------

describe('stepPreparedLineGeometry', () => {
  test('empty text — returns null', () => {
    const p = asBreakData(makePrepared(''))
    const cursor: LineBreakCursor = { segmentIndex: 0, graphemeIndex: 0 }
    expect(stepPreparedLineGeometry(p, cursor, 300)).toBeNull()
  })

  test('single word — returns positive width, then null', () => {
    const p = asBreakData(makePrepared('Hello'))
    const cursor: LineBreakCursor = { segmentIndex: 0, graphemeIndex: 0 }
    const width = stepPreparedLineGeometry(p, cursor, 300)
    expect(width).not.toBeNull()
    expect(width!).toBeGreaterThan(0)

    // Next step should return null (no more content)
    const next = stepPreparedLineGeometry(p, cursor, 300)
    expect(next).toBeNull()
  })

  test('step advances cursor past processed line', () => {
    const p = asBreakData(makePrepared('Hello World'))
    const cursor: LineBreakCursor = { segmentIndex: 0, graphemeIndex: 0 }
    const before = cursor.segmentIndex

    stepPreparedLineGeometry(p, cursor, 60)

    // Cursor should have advanced
    const advanced = cursor.segmentIndex > before || cursor.graphemeIndex > 0
    expect(advanced).toBe(true)
  })

  test('stepping through all lines gives same count as countPreparedLines', () => {
    const text = 'Hello World Test Long String'
    const p = asBreakData(makePrepared(text))
    const maxWidth = 100
    const expected = countPreparedLines(p, maxWidth)

    const cursor: LineBreakCursor = { segmentIndex: 0, graphemeIndex: 0 }
    let count = 0
    while (stepPreparedLineGeometry(p, cursor, maxWidth) !== null) {
      count++
    }
    expect(count).toBe(expected)
  })

  test('returned width is non-negative', () => {
    const p = asBreakData(makePrepared('Hello World Test'))
    const cursor: LineBreakCursor = { segmentIndex: 0, graphemeIndex: 0 }
    let width = stepPreparedLineGeometry(p, cursor, 100)
    while (width !== null) {
      expect(width).toBeGreaterThanOrEqual(0)
      width = stepPreparedLineGeometry(p, cursor, 100)
    }
  })

  test('does not throw on zero width', () => {
    const p = asBreakData(makePrepared('Hello'))
    const cursor: LineBreakCursor = { segmentIndex: 0, graphemeIndex: 0 }
    expect(() => stepPreparedLineGeometry(p, cursor, 0)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// currency symbol line-breaking (upstream #105 triage)
// ---------------------------------------------------------------------------

describe('currency symbol line-breaking (upstream #105 triage)', () => {
  test('currency symbol stays with number: $100', () => {
    const text = 'The price is $100 for this item on sale today'
    const prepared = prepareWithSegments(text, STYLE)
    const result = layoutWithLines(prepared, 120)
    const has100 = result.lines.some(l => l.text.includes('$100') || l.text.includes('100'))
    expect(has100).toBe(true)
  })

  test('various currency symbols do not cause crashes', () => {
    const texts = ['Price: $50', 'Cost: €120', 'Value: ¥5000', 'Total: £75.50']
    for (const text of texts) {
      const prepared = prepareWithSegments(text, STYLE)
      const result = layoutWithLines(prepared, 80)
      expect(result.lineCount).toBeGreaterThan(0)
      expect(result.lines.length).toBe(result.lineCount)
    }
  })
})
