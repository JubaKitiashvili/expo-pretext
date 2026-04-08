// layout.test.ts
// Tests for the core layout engine: layout(), layoutWithLines(),
// walkLineRanges(), measureNaturalWidth(), and the prepare() fallback path.
//
// We bypass prepare.ts (which imports ExpoPretext → expo-modules-core →
// react-native) and instead directly wire the same estimateSegments fallback
// that prepare() uses when the native module is unavailable.

import { describe, test, expect } from 'bun:test'
import {
  buildPreparedText,
  buildPreparedTextWithSegments,
  layout,
  layoutWithLines,
  walkLineRanges,
  measureNaturalWidth,
} from '../layout'
import { analyzeText } from '../analysis'
import type { TextStyle, NativeSegmentResult } from '../types'

const STYLE: TextStyle = { fontFamily: 'System', fontSize: 16, lineHeight: 24 }

// ---------------------------------------------------------------------------
// Helpers — mirrors prepare.ts's fallback when native module is unavailable
// ---------------------------------------------------------------------------

// Same logic as estimateSegments() in prepare.ts
function estimateSegments(text: string, style: TextStyle): NativeSegmentResult {
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

function makePrepared(text: string, style: TextStyle = STYLE) {
  if (!text) {
    const analysis = analyzeText([], [], {}, undefined)
    return buildPreparedText(analysis, new Map(), style)
  }
  const result = estimateSegments(text, style)
  const analysis = analyzeText(result.segments, result.isWordLike, {}, undefined)
  return buildPreparedText(analysis, buildWidthMap(result), style)
}

function makePreparedWithSegments(text: string, style: TextStyle = STYLE) {
  if (!text) {
    const analysis = analyzeText([], [], {}, undefined)
    return buildPreparedTextWithSegments(analysis, new Map(), style)
  }
  const result = estimateSegments(text, style)
  const analysis = analyzeText(result.segments, result.isWordLike, {}, undefined)
  return buildPreparedTextWithSegments(analysis, buildWidthMap(result), style)
}

// ---------------------------------------------------------------------------
// layout() basics
// ---------------------------------------------------------------------------

describe('layout() basics', () => {
  test('empty string returns height = 0 and lineCount = 0', () => {
    const p = makePrepared('')
    const result = layout(p, 300)
    expect(result.height).toBe(0)
    expect(result.lineCount).toBe(0)
  })

  test('single short word: 1 line, height = lineHeight', () => {
    // "Hello" = 5 chars * 8.8px = 44px → fits in 300px → 1 line
    const p = makePrepared('Hello')
    const result = layout(p, 300)
    expect(result.lineCount).toBe(1)
    expect(result.height).toBe(24)
  })

  test('text that wraps at narrow width: lineCount > 1', () => {
    // "Hello World Test" = 16 chars * 8.8px = 140.8px → wraps at 100px
    const p = makePrepared('Hello World Test')
    const result = layout(p, 100)
    expect(result.lineCount).toBeGreaterThan(1)
    expect(result.height).toBeGreaterThan(24)
  })

  test('wider maxWidth produces fewer or equal lines and less or equal height', () => {
    const p = makePrepared('Hello World Test')
    const narrow = layout(p, 100)
    const wide = layout(p, 300)
    expect(wide.lineCount).toBeLessThanOrEqual(narrow.lineCount)
    expect(wide.height).toBeLessThanOrEqual(narrow.height)
  })

  test('height equals lineCount * lineHeight', () => {
    const p = makePrepared('Hello World Test Long Line')
    const result = layout(p, 100)
    expect(result.height).toBe(result.lineCount * STYLE.lineHeight!)
  })

  test('zero width handled gracefully — does not throw', () => {
    const p = makePrepared('Hello')
    expect(() => layout(p, 0)).not.toThrow()
  })

  test('negative width handled gracefully — does not throw', () => {
    const p = makePrepared('Hello')
    expect(() => layout(p, -100)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// layoutWithLines()
// ---------------------------------------------------------------------------

describe('layoutWithLines()', () => {
  test('empty string returns empty lines array, height = 0', () => {
    const p = makePreparedWithSegments('')
    const result = layoutWithLines(p, 300)
    expect(result.lines).toEqual([])
    expect(result.lineCount).toBe(0)
    expect(result.height).toBe(0)
  })

  test('single word: 1 line with text', () => {
    const p = makePreparedWithSegments('Hello')
    const result = layoutWithLines(p, 300)
    expect(result.lines.length).toBe(1)
    expect(typeof result.lines[0]!.text).toBe('string')
    expect(result.lines[0]!.text.length).toBeGreaterThan(0)
  })

  test('returns lines with start/end cursor objects', () => {
    const p = makePreparedWithSegments('Hello')
    const result = layoutWithLines(p, 300)
    const line = result.lines[0]!
    expect(line).toHaveProperty('start')
    expect(line).toHaveProperty('end')
    expect(line.start).toHaveProperty('segmentIndex')
    expect(line.start).toHaveProperty('graphemeIndex')
    expect(line.end).toHaveProperty('segmentIndex')
    expect(line.end).toHaveProperty('graphemeIndex')
  })

  test('lineCount matches lines.length', () => {
    const p = makePreparedWithSegments('Hello World Test')
    const result = layoutWithLines(p, 100)
    expect(result.lineCount).toBe(result.lines.length)
  })

  test('height matches layout() result', () => {
    const text = 'Hello World Test'
    const p1 = makePrepared(text)
    const p2 = makePreparedWithSegments(text)
    const r1 = layout(p1, 100)
    const r2 = layoutWithLines(p2, 100)
    expect(r2.height).toBe(r1.height)
    expect(r2.lineCount).toBe(r1.lineCount)
  })

  test('each line has a non-negative width', () => {
    const p = makePreparedWithSegments('Hello World Test')
    const result = layoutWithLines(p, 100)
    for (const line of result.lines) {
      expect(line.width).toBeGreaterThanOrEqual(0)
    }
  })
})

// ---------------------------------------------------------------------------
// walkLineRanges()
// ---------------------------------------------------------------------------

describe('walkLineRanges()', () => {
  test('empty string: callback never called, returns 0', () => {
    const p = makePreparedWithSegments('')
    let calls = 0
    const total = walkLineRanges(p, 300, () => { calls++ })
    expect(calls).toBe(0)
    expect(total).toBe(0)
  })

  test('callback called once per line', () => {
    const p = makePreparedWithSegments('Hello World Test')
    const p2 = makePrepared('Hello World Test')
    const lines: unknown[] = []
    walkLineRanges(p, 100, line => lines.push(line))
    const { lineCount } = layout(p2, 100)
    expect(lines.length).toBe(lineCount)
  })

  test('each line range has start, end, and width properties', () => {
    const p = makePreparedWithSegments('Hello World')
    walkLineRanges(p, 300, line => {
      expect(line).toHaveProperty('start')
      expect(line).toHaveProperty('end')
      expect(line).toHaveProperty('width')
      expect(line.width).toBeGreaterThanOrEqual(0)
    })
  })

  test('total callback count matches layout() lineCount', () => {
    const text = 'Hello World Test Long String'
    const p = makePreparedWithSegments(text)
    const p2 = makePrepared(text)
    let count = 0
    walkLineRanges(p, 100, () => { count++ })
    expect(count).toBe(layout(p2, 100).lineCount)
  })
})

// ---------------------------------------------------------------------------
// measureNaturalWidth()
// ---------------------------------------------------------------------------

describe('measureNaturalWidth()', () => {
  test('returns 0 for empty string', () => {
    const p = makePreparedWithSegments('')
    expect(measureNaturalWidth(p)).toBe(0)
  })

  test('returns positive number for non-empty text', () => {
    const p = makePreparedWithSegments('Hello')
    expect(measureNaturalWidth(p)).toBeGreaterThan(0)
  })

  test('"Hello" (5 chars * 8.8px) natural width ≈ 44px — within reasonable bounds', () => {
    const p = makePreparedWithSegments('Hello')
    const w = measureNaturalWidth(p)
    // estimator: 5 * 8.8 = 44
    expect(w).toBeGreaterThan(0)
    expect(w).toBeLessThan(200)
  })

  test('longer single-word text has greater natural width than shorter', () => {
    const short = makePreparedWithSegments('Hi')
    const long = makePreparedWithSegments('Hello')
    expect(measureNaturalWidth(long)).toBeGreaterThan(measureNaturalWidth(short))
  })
})

// ---------------------------------------------------------------------------
// prepare() fallback path — edge cases via estimateSegments
// ---------------------------------------------------------------------------

describe('prepare() fallback edge cases', () => {
  test('empty string — height = 0', () => {
    const p = makePrepared('')
    expect(layout(p, 300).height).toBe(0)
  })

  test('single character — 1 line', () => {
    const p = makePrepared('A')
    const result = layout(p, 300)
    expect(result.lineCount).toBe(1)
    expect(result.height).toBe(24)
  })

  test('very long string — wraps into multiple lines', () => {
    const long = 'abcdefghij '.repeat(30)
    const p = makePrepared(long)
    const result = layout(p, 300)
    expect(result.lineCount).toBeGreaterThan(1)
    expect(result.height).toBeGreaterThan(24)
  })

  test('CJK characters — does not throw, returns at least 1 line', () => {
    expect(() => makePrepared('你好世界')).not.toThrow()
    const p = makePrepared('你好世界')
    expect(layout(p, 300).lineCount).toBeGreaterThanOrEqual(1)
  })

  test('emoji — does not throw, returns at least 1 line', () => {
    expect(() => makePrepared('🎉🎊🎈')).not.toThrow()
    const p = makePrepared('🎉🎊🎈')
    expect(layout(p, 300).lineCount).toBeGreaterThanOrEqual(1)
  })

  test('mixed scripts (Latin + CJK + emoji) — does not throw, positive height', () => {
    const mixed = 'Hello 你好 World 🎉'
    expect(() => makePrepared(mixed)).not.toThrow()
    const p = makePrepared(mixed)
    const result = layout(p, 300)
    expect(result.lineCount).toBeGreaterThanOrEqual(1)
    expect(result.height).toBeGreaterThan(0)
  })

  test('Unicode RTL text — does not throw', () => {
    const arabic = 'مرحبا بالعالم'
    expect(() => makePrepared(arabic)).not.toThrow()
    const p = makePrepared(arabic)
    expect(layout(p, 300).lineCount).toBeGreaterThanOrEqual(1)
  })
})
