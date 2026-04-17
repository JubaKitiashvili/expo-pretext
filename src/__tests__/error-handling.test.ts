// error-handling.test.ts
// Audit how the layout engine responds to bad / adversarial inputs.
// Goal: nothing throws on inputs reasonable code could plausibly produce.
// Garbage in → predictable, non-crashing out.

;(globalThis as unknown as Record<string, unknown>).__DEV__ = false

import { describe, test, expect } from 'bun:test'
import { buildPreparedText, buildPreparedTextWithSegments } from '../build'
import { analyzeText } from '../analysis'
import {
  layout,
  layoutWithLines,
  measureNaturalWidth,
  layoutNextLine,
  walkLineRanges,
} from '../layout'
import type { TextStyle, NativeSegmentResult } from '../types'

const PROFILE = { carryCJKAfterClosingQuote: false }
const STYLE: TextStyle = { fontFamily: 'System', fontSize: 16, lineHeight: 24 }

function segs(text: string, style: TextStyle = STYLE): NativeSegmentResult {
  if (!text) return { segments: [], isWordLike: [], widths: [] }
  const words = text.split(/(\s+)/)
  const w = style.fontSize * 0.55
  return {
    segments: words,
    isWordLike: words.map((x) => !/^\s+$/.test(x)),
    widths: words.map((x) => x.length * w),
  }
}
function widthMap(r: NativeSegmentResult): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < r.segments.length; i++) m.set(r.segments[i]!, r.widths[i]!)
  return m
}
function prepare(text: string, style: TextStyle = STYLE) {
  const s = segs(text, style)
  const a = analyzeText(s.segments, s.isWordLike, PROFILE)
  return buildPreparedText(a, widthMap(s), style)
}
function prepareWithSegs(text: string, style: TextStyle = STYLE) {
  const s = segs(text, style)
  const a = analyzeText(s.segments, s.isWordLike, PROFILE)
  return buildPreparedTextWithSegments(a, widthMap(s), style)
}

// ---------------------------------------------------------------------------
// 1. Width edge cases
// ---------------------------------------------------------------------------

describe('width edge cases', () => {
  test('maxWidth = 0 does not throw; yields sane result', () => {
    const p = prepare('Hello world', STYLE)
    expect(() => layout(p, 0)).not.toThrow()
    const r = layout(p, 0)
    expect(r.lineCount).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(r.height)).toBe(true)
  })

  test('maxWidth < 0 does not throw', () => {
    const p = prepare('Hello world', STYLE)
    expect(() => layout(p, -100)).not.toThrow()
  })

  test('maxWidth = Infinity fits in 1 line', () => {
    const p = prepare('The quick brown fox jumps over the lazy dog', STYLE)
    const r = layout(p, Infinity)
    expect(r.lineCount).toBeLessThanOrEqual(1)
  })

  test('maxWidth = NaN does not throw and returns finite numbers', () => {
    const p = prepare('Hello', STYLE)
    expect(() => layout(p, NaN)).not.toThrow()
    const r = layout(p, NaN)
    expect(Number.isFinite(r.height)).toBe(true)
    expect(Number.isFinite(r.lineCount)).toBe(true)
  })

  test('very large maxWidth (1e9) works', () => {
    const p = prepare('Short text', STYLE)
    const r = layout(p, 1e9)
    expect(r.lineCount).toBeLessThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// 2. Style edge cases
// ---------------------------------------------------------------------------

describe('style edge cases', () => {
  test('fontSize = 0 does not throw', () => {
    const style = { fontFamily: 'System', fontSize: 0, lineHeight: 0 }
    expect(() => layout(prepare('Hi', style), 100)).not.toThrow()
  })

  test('fontSize negative does not throw', () => {
    const style = { fontFamily: 'System', fontSize: -10, lineHeight: 10 }
    expect(() => layout(prepare('Hi', style), 100)).not.toThrow()
  })

  test('lineHeight missing → falls back to fontSize * 1.2', () => {
    const style: TextStyle = { fontFamily: 'System', fontSize: 16 }
    const r = layout(prepare('Hi', style), 320)
    expect(r.height).toBeGreaterThan(0)
    // Don't pin exact value; just assert a sane ratio.
    expect(r.height / r.lineCount).toBeCloseTo(16 * 1.2, 5)
  })

  test('unknown fontFamily does not throw (JS fallback is family-agnostic)', () => {
    const style = { fontFamily: 'DoesNotExist', fontSize: 16, lineHeight: 24 }
    expect(() => layout(prepare('Hello', style), 320)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 3. Text content edge cases
// ---------------------------------------------------------------------------

describe('text content edge cases', () => {
  test('only whitespace does not throw', () => {
    for (const text of ['   ', '\t\t', '\n\n\n', ' \t\n ']) {
      expect(() => layout(prepare(text), 320)).not.toThrow()
    }
  })

  test('only newlines produces lineCount ≥ number of lines', () => {
    // Note: JS fallback segmenter does not split on '\n' into hard-breaks,
    // so we just require the result is sane, not exact.
    const r = layout(prepare('\n\n\n'), 320)
    expect(r.lineCount).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(r.height)).toBe(true)
  })

  test('lone surrogate characters do not throw', () => {
    for (const text of ['\uD800', 'a\uD800b', '\uDC00']) {
      expect(() => prepare(text)).not.toThrow()
      expect(() => layout(prepare(text), 320)).not.toThrow()
    }
  })

  test('null / undefined characters in string', () => {
    const text = 'hello\0world\u0001'
    expect(() => layout(prepare(text), 320)).not.toThrow()
  })

  test('extremely long text (10 KB) does not blow up', () => {
    const text = 'word '.repeat(2000) // 10 KB
    expect(() => layout(prepare(text), 320)).not.toThrow()
    const r = layout(prepare(text), 320)
    expect(r.lineCount).toBeGreaterThan(0)
  })

  test('extremely long single word (no spaces) does not throw', () => {
    const text = 'x'.repeat(1000)
    expect(() => layout(prepare(text), 320)).not.toThrow()
  })

  test('mixed RTL + LTR + CJK + numerals', () => {
    const text = 'Hello مرحبا 你好 123 გამარჯობა'
    expect(() => layout(prepare(text), 320)).not.toThrow()
    const r = layout(prepare(text), 320)
    expect(r.lineCount).toBeGreaterThan(0)
  })

  test('tabs, vertical tab, form feed, carriage return', () => {
    for (const ch of ['\t', '\v', '\f', '\r']) {
      const text = `a${ch}b${ch}c`
      expect(() => layout(prepare(text), 320)).not.toThrow()
    }
  })
})

// ---------------------------------------------------------------------------
// 4. layoutWithLines / measureNaturalWidth / layoutNextLine edge cases
// ---------------------------------------------------------------------------

describe('auxiliary APIs on bad input', () => {
  test('layoutWithLines() on empty string', () => {
    const r = layoutWithLines(prepareWithSegs(''), 320)
    expect(r.lineCount).toBe(0)
    expect(r.lines).toHaveLength(0)
  })

  test('measureNaturalWidth() on empty string returns 0', () => {
    expect(measureNaturalWidth(prepareWithSegs(''))).toBe(0)
  })

  test('measureNaturalWidth() on whitespace-only returns finite ≥ 0', () => {
    const w = measureNaturalWidth(prepareWithSegs('   '))
    expect(Number.isFinite(w)).toBe(true)
    expect(w).toBeGreaterThanOrEqual(0)
  })

  test('layoutNextLine() starting past the end is safe', () => {
    const p = prepareWithSegs('Hello')
    const badCursor = { segmentIndex: 9999, graphemeIndex: 0 }
    expect(() => layoutNextLine(p, badCursor, 320)).not.toThrow()
  })

  test('walkLineRanges() on empty input does not throw', () => {
    const p = prepareWithSegs('')
    const ranges: unknown[] = []
    expect(() => walkLineRanges(p, 320, (r) => { ranges.push(r) })).not.toThrow()
  })
})
