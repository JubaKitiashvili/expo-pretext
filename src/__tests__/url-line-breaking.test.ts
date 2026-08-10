// URL line breaking against RN's own output.
//
// Ground truth captured from `onTextLayout`'s `nativeEvent.lines` on a Pixel 9
// Pro (API 37, Expo 55, RN 0.83.4), and the segment widths below are real
// android TextPaint advances from expo-pretext's native module on that device —
// so this exercises the same numbers the engine sees on a real Android run.
//
// RN breaks a URL *before* `-`, `.` and `/`, and after `=`:
//
//     See https://alpha-beta
//     -gamma-delta.example
//     .test/path?query=1&lang=
//     en for details.
//
// Note line one had room for a trailing `-` and did not take it, which is what
// rules out breaking after a hyphen. Before this was modelled, `analyzeText()`
// merged the whole URL into one atomic run: the engine could only split it at
// arbitrary grapheme boundaries, so `See ` was pushed onto a line of its own
// (one line too many) while a bare URL packed every line flush (one too few).

import { describe, test, expect, afterAll } from 'bun:test'
import { buildPreparedTextWithSegments } from '../build'
import { analyzeText } from '../analysis'
import { layoutWithLines } from '../layout'
import { setEngineProfile, ENGINE_PROFILES } from '../engine-profile'
import type { TextStyle } from '../types'

const STYLE: TextStyle = { fontFamily: 'System', fontSize: 16, lineHeight: 24 }
const PROFILE = { carryCJKAfterClosingQuote: false }

type Measured = { segments: string[], isWordLike: boolean[], widths: number[] }

const URL: Measured = {
  segments: ['See', ' ', 'https', ':', '/', '/', 'alpha', '-', 'beta', '-', 'gamma', '-', 'delta.example.test', '/', 'path', '?', 'query', '=', '1', '&', 'lang', '=', 'en', ' ', 'for', ' ', 'details', '.'],
  isWordLike: [true, false, true, false, false, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
  widths: [26, 4, 36, 4, 7, 7, 40, 4, 31, 4, 55, 4, 129, 7, 32, 8, 40, 9, 9, 10, 31, 9, 17, 4, 20, 4, 47, 4],
}

const URL_BARE: Measured = {
  segments: ['https', ':', '/', '/', 'sub.domain.example.test', '/', 'a', '/', 'b', '/', 'c', '/', 'd', '/', 'e', '/', 'f', '/', 'g', '/', 'h', '/', 'i', '/', 'j', '/', 'k', '/', 'l', '/', 'm', '/', 'n', '/', 'o', '/', 'p', '/', 'q', '/', 'r', '/', 's', '/', 't'],
  isWordLike: [true, false, false, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true],
  widths: [36, 4, 7, 7, 178, 7, 9, 7, 9, 7, 8, 7, 9, 7, 8, 7, 6, 7, 9, 7, 9, 7, 4, 7, 4, 7, 8, 7, 4, 7, 14, 7, 9, 7, 9, 7, 9, 7, 9, 7, 5, 7, 8, 7, 5],
}

function lineCountAt(measured: Measured, width: number): number {
  const map = new Map<string, number>()
  for (let i = 0; i < measured.segments.length; i++) map.set(measured.segments[i]!, measured.widths[i]!)
  const analysis = analyzeText(measured.segments, measured.isWordLike, PROFILE)
  const prepared = buildPreparedTextWithSegments(analysis, map, STYLE)
  return layoutWithLines(prepared as never, width).lines.length
}

function firstLineAt(measured: Measured, width: number): string {
  const map = new Map<string, number>()
  for (let i = 0; i < measured.segments.length; i++) map.set(measured.segments[i]!, measured.widths[i]!)
  const analysis = analyzeText(measured.segments, measured.isWordLike, PROFILE)
  const prepared = buildPreparedTextWithSegments(analysis, map, STYLE)
  return layoutWithLines(prepared as never, width).lines[0]?.text ?? ''
}

describe('URL line breaking vs RN Text', () => {
  setEngineProfile(ENGINE_PROFILES.android)
  afterAll(() => setEngineProfile(null))

  // Container widths are the accuracy harness's 200/280/360 minus its 4px
  // horizontal padding on each side.
  test('a URL in a sentence produces RN"s line count', () => {
    expect(lineCountAt(URL, 192)).toBe(4)
    expect(lineCountAt(URL, 272)).toBe(3)
    expect(lineCountAt(URL, 352)).toBe(2)
  })

  test('a bare URL produces RN"s line count', () => {
    expect(lineCountAt(URL_BARE, 192)).toBe(4)
    expect(lineCountAt(URL_BARE, 272)).toBe(2)
    expect(lineCountAt(URL_BARE, 352)).toBe(2)
  })

  test('the URL shares the first line rather than being pushed down whole', () => {
    // The defect this replaced left "See " alone on line one.
    expect(firstLineAt(URL, 192)).toBe('See https://alpha-beta')
    expect(firstLineAt(URL, 272)).toBe('See https://alpha-beta-gamma-delta')
  })

  test('a bare URL breaks before the path separator', () => {
    expect(firstLineAt(URL_BARE, 192)).toBe('https://sub.domain')
    expect(firstLineAt(URL_BARE, 272)).toBe('https://sub.domain.example.test/a/b')
  })
})
