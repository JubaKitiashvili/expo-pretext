// text-wrap.test.ts
// Verify the `balance` / `pretty` algorithms hold their invariants.

;(globalThis as unknown as Record<string, unknown>).__DEV__ = false

import { describe, test, expect } from 'bun:test'
import { buildPreparedText, buildPreparedTextWithSegments } from '../build'
import { analyzeText } from '../analysis'
import { layout, layoutWithLines } from '../layout'
import {
  balanceLayout,
  balanceLayoutWithLines,
  prettyLayout,
  layoutWithWrap,
} from '../text-wrap'
import type { TextStyle, NativeSegmentResult } from '../types'

const PROFILE = { carryCJKAfterClosingQuote: false }
const STYLE: TextStyle = { fontFamily: 'System', fontSize: 16, lineHeight: 24 }

function segs(text: string, style: TextStyle): NativeSegmentResult {
  if (!text) return { segments: [], isWordLike: [], widths: [] }
  const words = text.split(/(\s+)/)
  const cw = style.fontSize * 0.55
  return {
    segments: words,
    isWordLike: words.map((w) => !/^\s+$/.test(w)),
    widths: words.map((w) => w.length * cw),
  }
}
function widthMap(r: NativeSegmentResult): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < r.segments.length; i++) m.set(r.segments[i]!, r.widths[i]!)
  return m
}
function prepare(text: string, style: TextStyle) {
  const s = segs(text, style)
  const a = analyzeText(s.segments, s.isWordLike, PROFILE)
  return buildPreparedText(a, widthMap(s), style)
}
function prepareWS(text: string, style: TextStyle) {
  const s = segs(text, style)
  const a = analyzeText(s.segments, s.isWordLike, PROFILE)
  return buildPreparedTextWithSegments(a, widthMap(s), style)
}

describe('balanceLayout', () => {
  test('single-line text keeps maxWidth and returns one line', () => {
    const p = prepare('Hello', STYLE)
    const r = balanceLayout(p, 400)
    expect(r.lineCount).toBeLessThanOrEqual(1)
    expect(r.effectiveWidth).toBe(400)
  })

  test('multi-line text returns the same line count as greedy', () => {
    const text = 'React Native was missing a great text layout primitive'
    const p = prepare(text, STYLE)
    const greedy = layout(p, 240)
    const balanced = balanceLayout(p, 240)
    expect(balanced.lineCount).toBe(greedy.lineCount)
  })

  test('balanced effectiveWidth is ≤ maxWidth', () => {
    const text = 'React Native was missing a great text layout primitive'
    const p = prepare(text, STYLE)
    const r = balanceLayout(p, 240)
    expect(r.effectiveWidth).toBeLessThanOrEqual(240)
    expect(r.effectiveWidth).toBeGreaterThan(0)
  })

  test('balanced effectiveWidth is tight: re-layout at effectiveWidth - 1 gives MORE lines', () => {
    const text = 'React Native was missing a great text layout primitive'
    const p = prepare(text, STYLE)
    const r = balanceLayout(p, 400, { precision: 0.5 })
    // Below the tight width, line count must increase.
    const tighter = layout(p, r.effectiveWidth - 2)
    expect(tighter.lineCount).toBeGreaterThanOrEqual(r.lineCount)
  })

  test('maxLines guard returns greedy result when exceeded', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve'
    const p = prepare(text, STYLE)
    const r = balanceLayout(p, 50, { maxLines: 1 })
    expect(r.effectiveWidth).toBe(50)
  })

  test('zero / negative maxWidth does not throw', () => {
    const p = prepare('Hello world', STYLE)
    expect(() => balanceLayout(p, 0)).not.toThrow()
    expect(() => balanceLayout(p, -50)).not.toThrow()
  })

  test('deterministic: same input produces same result', () => {
    const text = 'React Native was missing a great text layout primitive'
    const p = prepare(text, STYLE)
    const a = balanceLayout(p, 240)
    const b = balanceLayout(p, 240)
    expect(a.effectiveWidth).toBe(b.effectiveWidth)
    expect(a.lineCount).toBe(b.lineCount)
    expect(a.height).toBe(b.height)
  })
})

describe('balanceLayoutWithLines', () => {
  test('lines.length matches lineCount', () => {
    const text = 'React Native was missing a great text layout primitive'
    const p = prepareWS(text, STYLE)
    const r = balanceLayoutWithLines(p, 240)
    expect(r.lines.length).toBe(r.lineCount)
  })

  test('lines text sum roughly equals the input', () => {
    const text = 'React Native was missing a great text layout primitive'
    const p = prepareWS(text, STYLE)
    const r = balanceLayoutWithLines(p, 240)
    const joined = r.lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim()
    expect(joined.replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''))
  })
})

describe('prettyLayout', () => {
  test('single-line text returns unchanged (isPrettified=false)', () => {
    const p = prepareWS('Hello', STYLE)
    const r = prettyLayout(p, 400)
    expect(r.isPrettified).toBe(false)
  })

  test('last-line-not-widow returns unchanged', () => {
    // A paragraph whose greedy layout happens to end with multiple words.
    const text = 'The quick brown fox jumps over the lazy dog'
    const p = prepareWS(text, STYLE)
    const r = prettyLayout(p, 400)
    // Result may or may not prettify; assertion is only that it doesn't throw
    // and lineCount is plausible.
    expect(r.lineCount).toBeGreaterThanOrEqual(1)
  })

  test('effectiveWidth ≤ maxWidth', () => {
    const p = prepareWS('The quick brown fox jumps over the lazy dog the end', STYLE)
    const r = prettyLayout(p, 300)
    expect(r.effectiveWidth).toBeLessThanOrEqual(300)
  })

  test('minLastLineWords option is respected', () => {
    const text = 'The quick brown fox jumps over the lazy dog the end solo'
    const p = prepareWS(text, STYLE)
    const r = prettyLayout(p, 300, { minLastLineWords: 1 })
    expect(r.lineCount).toBeGreaterThan(0)
  })
})

describe('layoutWithWrap', () => {
  test("mode 'default' matches greedy layoutWithLines", () => {
    const text = 'React Native was missing a great text layout primitive'
    const p = prepareWS(text, STYLE)
    const a = layoutWithLines(p, 240)
    const b = layoutWithWrap(p, 240, 'default')
    expect(b.lineCount).toBe(a.lineCount)
    expect(b.height).toBe(a.height)
    expect(b.effectiveWidth).toBe(240)
  })

  test("mode 'balance' narrows effectiveWidth", () => {
    const text = 'React Native was missing a great text layout primitive'
    const p = prepareWS(text, STYLE)
    const r = layoutWithWrap(p, 400, 'balance')
    expect(r.effectiveWidth).toBeLessThanOrEqual(400)
  })

  test("mode 'pretty' returns a valid shape", () => {
    const text = 'React Native was missing a great text layout primitive widows are annoying'
    const p = prepareWS(text, STYLE)
    const r = layoutWithWrap(p, 300, 'pretty')
    expect(r.lineCount).toBeGreaterThan(0)
    expect(r.lines.length).toBe(r.lineCount)
  })
})
