// Width-map lookups for segments that analyzeText() merged.
//
// The native backends return one entry per *pre-merge* segment, and
// buildWidthMap() keys them by text. analyzeText() then merges adjacent
// segments (sentence-final punctuation, no-space symbol chains, CJK runs, …),
// so a merged segment's text is never a key. Before the decomposition fallback
// these scored as zero-width and the line breaker packed far too much onto
// each line — on a Pixel 9 Pro the sample corpus lost 65px (English) to 202px
// (Georgian) of line budget, and predicted heights came out one to two lines
// short of what RN Text actually rendered.
//
// Widths below are real android TextPaint advances at fontSize 16, captured
// from expo-pretext's own native module on that device.

import { describe, test, expect } from 'bun:test'
import { buildPreparedText } from '../build'
import { analyzeText } from '../analysis'
import type { TextStyle } from '../types'

const STYLE: TextStyle = { fontFamily: 'System', fontSize: 16, lineHeight: 24 }
const PROFILE = { carryCJKAfterClosingQuote: false }

function widthMap(segments: string[], widths: number[]): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < segments.length; i++) m.set(segments[i]!, widths[i]!)
  return m
}

function preparedWidths(
  segments: string[],
  isWordLike: boolean[],
  widths: number[],
): number[] {
  const analysis = analyzeText(segments, isWordLike, PROFILE)
  const prepared = buildPreparedText(analysis, widthMap(segments, widths), STYLE)
  return Array.from((prepared as unknown as { widths: number[] }).widths)
}

const sum = (ns: number[]): number => ns.reduce((a, b) => a + b, 0)

describe('width map — merged segments', () => {
  test('sentence-final punctuation merged into the word keeps its width', () => {
    const segments = ['dog', '.']
    const widths = [27, 4]
    const prepared = preparedWidths(segments, [true, false], widths)

    // "dog" + "." merges to "dog.", which is not a key in the width map.
    expect(sum(prepared)).toBe(31)
    expect(prepared).not.toContain(0)
  })

  test('total prepared width equals total measured width for a Latin sentence', () => {
    const segments = ['The', ' ', 'lazy', ' ', 'dog', '.', ' ', 'Pack', ' ', 'it', '.']
    const isWordLike = [true, false, true, false, true, false, false, true, false, true, false]
    const widths = [27, 4, 29, 4, 27, 4, 4, 35, 4, 12, 4]

    expect(sum(preparedWidths(segments, isWordLike, widths))).toBe(sum(widths))
  })

  test('total prepared width equals total measured width for a Georgian sentence', () => {
    const segments = ['კულტურის', ' ', 'ქვეყანაა', '.', ' ', 'კავკასიის']
    const isWordLike = [true, false, true, false, false, true]
    const widths = [90, 4, 74, 4, 4, 83]

    expect(sum(preparedWidths(segments, isWordLike, widths))).toBe(sum(widths))
  })

  test('CJK units inherit a decomposed parent width instead of zero', () => {
    // "景象" + "。" merges; the CJK path then splits the merged text into
    // per-character units, which are not width-map keys either.
    const segments = ['景象', '。']
    const widths = [32, 16]
    const prepared = preparedWidths(segments, [true, false], widths)

    expect(sum(prepared)).toBe(48)
    expect(prepared.every((w) => w > 0)).toBe(true)
  })

  test('total prepared width equals total measured width for a CJK sentence', () => {
    const segments = ['春天', '到了', '，', '万物', '复苏', '。']
    const isWordLike = [true, true, false, true, true, false]
    const widths = [32, 32, 16, 32, 32, 16]

    expect(sum(preparedWidths(segments, isWordLike, widths))).toBe(sum(widths))
  })

  test('an undecomposable segment still falls back rather than throwing', () => {
    // Nothing in the map can spell "zzz"; the parent-proportional fallback and
    // the zero default must both remain reachable.
    const segments = ['zzz']
    const widths = [40]
    expect(sum(preparedWidths(segments, [true], widths))).toBe(40)
  })
})
