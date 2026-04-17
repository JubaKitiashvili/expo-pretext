// kinsoku.test.ts
// Verify Kinsoku Shori (CJK line-breaking prohibitions) behavior in the
// layout engine. Characters like `、` `。` `）` `」` must never start a
// line; `（` `「` `『` must never end a line.
//
// The engine ships with a conservative built-in set (see kinsokuStart /
// kinsokuEnd in src/analysis.ts). These tests lock in the behavior so
// future engine refactors don't regress Japanese / Chinese typography.

;(globalThis as unknown as Record<string, unknown>).__DEV__ = false

import { describe, test, expect } from 'bun:test'
import { buildPreparedTextWithSegments } from '../build'
import { analyzeText, kinsokuStart, kinsokuEnd } from '../analysis'
import { layoutWithLines } from '../layout'
import type { TextStyle, NativeSegmentResult } from '../types'

const PROFILE = { carryCJKAfterClosingQuote: true }
const STYLE: TextStyle = { fontFamily: 'System', fontSize: 16, lineHeight: 24 }

// Minimal CJK-aware segmenter — per-character segments, since CJK has
// break opportunities between any two characters.
//
// Mirrors real native segmenter behavior: punctuation (ASCII + CJK)
// reports isWordLike=false so the line-breaker can apply sticky rules.
const PUNCTUATION_RE = /[\s\p{P}\p{S}]/u

function cjkSegments(text: string, style: TextStyle): NativeSegmentResult {
  const segments: string[] = []
  const isWordLike: boolean[] = []
  const widths: number[] = []
  const charWidth = style.fontSize // CJK is roughly square
  for (const ch of text) {
    segments.push(ch)
    isWordLike.push(!PUNCTUATION_RE.test(ch))
    widths.push(/\s/.test(ch) ? charWidth * 0.3 : charWidth)
  }
  return { segments, isWordLike, widths }
}

function widthMap(r: NativeSegmentResult): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < r.segments.length; i++) m.set(r.segments[i]!, r.widths[i]!)
  return m
}

function prepareWS(text: string, style: TextStyle) {
  const s = cjkSegments(text, style)
  const a = analyzeText(s.segments, s.isWordLike, PROFILE)
  return buildPreparedTextWithSegments(a, widthMap(s), style)
}

describe('Kinsoku — character set exports', () => {
  test('kinsokuStart contains common Japanese line-start prohibitions', () => {
    expect(kinsokuStart.has('。')).toBe(true) // ideographic full stop
    expect(kinsokuStart.has('、')).toBe(true) // ideographic comma
    expect(kinsokuStart.has('）')).toBe(true) // fullwidth right paren
    expect(kinsokuStart.has('」')).toBe(true) // right corner bracket
    expect(kinsokuStart.has('』')).toBe(true) // right white corner bracket
  })

  test('kinsokuEnd contains common Japanese line-end prohibitions', () => {
    expect(kinsokuEnd.has('（')).toBe(true) // fullwidth left paren
    expect(kinsokuEnd.has('「')).toBe(true) // left corner bracket
    expect(kinsokuEnd.has('『')).toBe(true) // left white corner bracket
    expect(kinsokuEnd.has('"')).toBe(true)  // opening double quote
  })

  test('regular CJK characters are NOT in the prohibition sets', () => {
    expect(kinsokuStart.has('あ')).toBe(false)
    expect(kinsokuStart.has('中')).toBe(false)
    expect(kinsokuEnd.has('あ')).toBe(false)
    expect(kinsokuEnd.has('中')).toBe(false)
  })
})

describe('Kinsoku — closing punctuation never starts a line', () => {
  test('ideographic comma 、 stays on previous line (Japanese)', () => {
    // Width just enough for "こんにちは" (5 chars) but not "こんにちは、" (6)
    const p = prepareWS('こんにちは、世界', STYLE)
    const r = layoutWithLines(p, STYLE.fontSize * 5.5)
    for (const ln of r.lines) {
      expect(ln.text.startsWith('、')).toBe(false)
    }
  })

  test('ideographic full stop 。 stays on previous line', () => {
    const p = prepareWS('こんにちは。世界', STYLE)
    const r = layoutWithLines(p, STYLE.fontSize * 5.5)
    for (const ln of r.lines) {
      expect(ln.text.startsWith('。')).toBe(false)
    }
  })

  test('fullwidth right parenthesis ） stays on previous line', () => {
    const p = prepareWS('テスト（サンプル）です', STYLE)
    const r = layoutWithLines(p, STYLE.fontSize * 6.5)
    for (const ln of r.lines) {
      expect(ln.text.startsWith('）')).toBe(false)
    }
  })

  test('Chinese period 。 stays on previous line (Chinese)', () => {
    const p = prepareWS('你好世界。这是测试', STYLE)
    const r = layoutWithLines(p, STYLE.fontSize * 4.5)
    for (const ln of r.lines) {
      expect(ln.text.startsWith('。')).toBe(false)
    }
  })
})

describe('Kinsoku — opening punctuation never ends a line', () => {
  test('fullwidth left parenthesis （ stays with next-line content', () => {
    const p = prepareWS('文字列（サンプル', STYLE)
    const r = layoutWithLines(p, STYLE.fontSize * 4.5)
    for (const ln of r.lines) {
      expect(ln.text.endsWith('（')).toBe(false)
    }
  })

  test('left corner bracket 「 stays with next-line content', () => {
    const p = prepareWS('彼は「はい」と', STYLE)
    const r = layoutWithLines(p, STYLE.fontSize * 3.5)
    for (const ln of r.lines) {
      expect(ln.text.endsWith('「')).toBe(false)
    }
  })
})

describe('Kinsoku — mixed ASCII punctuation near CJK', () => {
  test('ASCII comma after CJK text stays attached', () => {
    const p = prepareWS('東京, 北京, 首爾', STYLE)
    const r = layoutWithLines(p, STYLE.fontSize * 3.5)
    for (const ln of r.lines) {
      expect(ln.text.startsWith(',')).toBe(false)
    }
  })

  test('ASCII period after CJK text stays attached', () => {
    const p = prepareWS('東京.北京.首爾', STYLE)
    const r = layoutWithLines(p, STYLE.fontSize * 3.5)
    for (const ln of r.lines) {
      expect(ln.text.startsWith('.')).toBe(false)
    }
  })
})

describe('Kinsoku — no single-segment line lock-in', () => {
  test('text wider than a single CJK char still wraps somewhere', () => {
    // The engine must still break somewhere, just not at a forbidden spot.
    const p = prepareWS('こんにちは、世界こんにちは、世界', STYLE)
    const r = layoutWithLines(p, STYLE.fontSize * 7)
    expect(r.lineCount).toBeGreaterThan(1)
  })

  test('layout is deterministic for the same CJK text and width', () => {
    const p = prepareWS('日本語のテストです。', STYLE)
    const a = layoutWithLines(p, 200)
    const b = layoutWithLines(p, 200)
    expect(a.lineCount).toBe(b.lineCount)
    expect(a.lines.length).toBe(b.lines.length)
  })
})
