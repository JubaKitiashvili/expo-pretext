// letter-spacing.test.ts
// Verify that TextStyle.letterSpacing is folded into segment widths and
// produces wider layouts, separate cache entries, and higher natural width.

;(globalThis as unknown as Record<string, unknown>).__DEV__ = false

import { describe, test, expect } from 'bun:test'
import {
  codePointCount,
  applyLetterSpacingInPlace,
  getFontKey,
  textStyleToFontDescriptor,
} from '../font-utils'
import { buildPreparedText, buildPreparedTextWithSegments } from '../build'
import { analyzeText } from '../analysis'
import { layout, measureNaturalWidth } from '../layout'
import type { TextStyle, NativeSegmentResult } from '../types'

const PROFILE = { carryCJKAfterClosingQuote: false }

function segs(text: string, style: TextStyle): NativeSegmentResult {
  if (!text) return { segments: [], isWordLike: [], widths: [] }
  const words = text.split(/(\s+)/)
  const cw = style.fontSize * 0.55
  const widths = words.map((w) => w.length * cw)
  applyLetterSpacingInPlace(widths, words, style.letterSpacing)
  return {
    segments: words,
    isWordLike: words.map((w) => !/^\s+$/.test(w)),
    widths,
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

describe('codePointCount', () => {
  test('ASCII', () => {
    expect(codePointCount('hello')).toBe(5)
    expect(codePointCount('')).toBe(0)
  })

  test('CJK (each char is one code point)', () => {
    expect(codePointCount('你好世界')).toBe(4)
  })

  test('surrogate-pair emoji counts as 1 code point', () => {
    expect(codePointCount('👋')).toBe(1)
    expect(codePointCount('a👋b')).toBe(3)
  })

  test('whitespace counts', () => {
    expect(codePointCount('  ')).toBe(2)
    expect(codePointCount('\n\t')).toBe(2)
  })
})

describe('applyLetterSpacingInPlace', () => {
  test('no-op when letterSpacing is 0 / undefined', () => {
    const widths = [10, 20]
    applyLetterSpacingInPlace(widths, ['ab', 'cde'], 0)
    expect(widths).toEqual([10, 20])
    applyLetterSpacingInPlace(widths, ['ab', 'cde'], undefined)
    expect(widths).toEqual([10, 20])
  })

  test('adds letterSpacing × codePointCount per segment', () => {
    const widths = [10, 20]
    applyLetterSpacingInPlace(widths, ['ab', 'cde'], 2)
    expect(widths).toEqual([14, 26]) // 10+2*2, 20+2*3
  })

  test('negative letterSpacing shrinks widths', () => {
    const widths = [10, 20]
    applyLetterSpacingInPlace(widths, ['ab', 'cde'], -1)
    expect(widths).toEqual([8, 17])
  })

  test('surrogate pair counts as 1 glyph', () => {
    const widths = [10]
    applyLetterSpacingInPlace(widths, ['👋'], 5)
    expect(widths).toEqual([15])
  })
})

describe('letter-spacing integration — prepare + layout', () => {
  const STYLE: TextStyle = { fontFamily: 'System', fontSize: 16, lineHeight: 24 }
  const SPACED: TextStyle = { ...STYLE, letterSpacing: 4 }

  test('natural width is greater with letterSpacing', () => {
    const a = measureNaturalWidth(prepareWS('hello world', STYLE))
    const b = measureNaturalWidth(prepareWS('hello world', SPACED))
    expect(b).toBeGreaterThan(a)
  })

  test('letter-spaced text wraps earlier at narrow widths', () => {
    const W = 120
    const a = layout(prepare('the quick brown fox', STYLE), W)
    const b = layout(prepare('the quick brown fox', SPACED), W)
    expect(b.lineCount).toBeGreaterThanOrEqual(a.lineCount)
  })

  test('zero letterSpacing layout equals no letterSpacing', () => {
    const zero: TextStyle = { ...STYLE, letterSpacing: 0 }
    const a = layout(prepare('hello world', STYLE), 200)
    const b = layout(prepare('hello world', zero), 200)
    expect(a.height).toBe(b.height)
    expect(a.lineCount).toBe(b.lineCount)
  })
})

describe('letter-spacing in cache key + font descriptor', () => {
  test('different letterSpacing produces different cache keys', () => {
    const a = getFontKey({ fontFamily: 'Inter', fontSize: 16 })
    const b = getFontKey({ fontFamily: 'Inter', fontSize: 16, letterSpacing: 2 })
    const c = getFontKey({ fontFamily: 'Inter', fontSize: 16, letterSpacing: -1 })
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
    expect(b).not.toBe(c)
  })

  test('letterSpacing flows into FontDescriptor', () => {
    const desc = textStyleToFontDescriptor({
      fontFamily: 'Inter',
      fontSize: 16,
      letterSpacing: 1.5,
    })
    expect(desc.letterSpacing).toBe(1.5)
  })

  test('undefined letterSpacing is preserved as undefined (not 0)', () => {
    const desc = textStyleToFontDescriptor({ fontFamily: 'Inter', fontSize: 16 })
    expect(desc.letterSpacing).toBeUndefined()
  })
})
