// hooks.test.ts
// Integration tests for the underlying functions that React hooks call.
//
// We cannot run hooks directly in bun:test (no React renderer), so we test
// the pipeline that each hook delegates to:
//
//   useTextHeight      → prepare() + layout()  (fallback path when native is absent)
//   useFlashListHeights → measureHeights() pre-warm + measureSingleHeight() on miss
//                         (FlashList v2 API — returns { getHeight(item) })
//   usePreparedText    → prepare()
//
// Since prepare.ts imports ExpoPretext → expo-modules-core → react-native,
// we mirror its estimateSegments fallback locally (same logic) and wire it
// through buildPreparedText / buildPreparedTextWithSegments — exactly what
// prepare.ts does at runtime when the native module is unavailable.

// IMPORTANT: __DEV__ must be set before any imports.
globalThis.__DEV__ = false

import { describe, test, expect } from 'bun:test'
import { buildPreparedText, buildPreparedTextWithSegments } from '../build'
import {
  layout,
  layoutWithLines,
  measureNaturalWidth,
} from '../layout'
import { analyzeText } from '../analysis'
import type { TextStyle, NativeSegmentResult, PrepareOptions } from '../types'

// ---------------------------------------------------------------------------
// Shared style — matches the spec
// ---------------------------------------------------------------------------

const STYLE: TextStyle = { fontFamily: 'System', fontSize: 16, lineHeight: 24 }

// ---------------------------------------------------------------------------
// Helpers — mirror prepare.ts fallback (estimateSegments) and buildWidthMap
// ---------------------------------------------------------------------------

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

/** Mirrors prepare(text, style, options) in prepare.ts (no-native fallback). */
function prepare(text: string, style: TextStyle, options?: PrepareOptions) {
  if (!text) {
    const analysis = analyzeText([], [], {}, options?.whiteSpace)
    return buildPreparedText(analysis, new Map(), style)
  }
  const result = estimateSegments(text, style)
  const analysis = analyzeText(result.segments, result.isWordLike, {}, options?.whiteSpace)
  return buildPreparedText(analysis, buildWidthMap(result), style)
}

/** Mirrors prepareWithSegments(text, style) — returns richer handle. */
function prepareWithSegs(text: string, style: TextStyle, options?: PrepareOptions) {
  if (!text) {
    const analysis = analyzeText([], [], {}, options?.whiteSpace)
    return buildPreparedTextWithSegments(analysis, new Map(), style)
  }
  const result = estimateSegments(text, style)
  const analysis = analyzeText(result.segments, result.isWordLike, {}, options?.whiteSpace)
  return buildPreparedTextWithSegments(analysis, buildWidthMap(result), style)
}

/** Mirrors measureSingleHeight fallback used in useFlashListHeights. */
function measureSingleHeight(text: string, style: TextStyle, maxWidth: number): number {
  const prepared = prepare(text, style)
  return layout(prepared, maxWidth).height
}

/** Mirrors measureHeights() from prepare.ts (no-native fallback). */
function measureHeights(texts: string[], style: TextStyle, maxWidth: number): number[] {
  return texts.map(t => {
    const p = prepare(t, style)
    return layout(p, maxWidth).height
  })
}

// ---------------------------------------------------------------------------
// 1. prepare + layout round-trip
// ---------------------------------------------------------------------------

describe('prepare + layout round-trip (useTextHeight pipeline)', () => {
  test('non-empty text at normal width returns positive height', () => {
    const p = prepare('Hello, world!', STYLE)
    const result = layout(p, 320)
    expect(result.height).toBeGreaterThan(0)
    expect(result.lineCount).toBeGreaterThanOrEqual(1)
  })

  test('height equals lineCount * lineHeight', () => {
    const p = prepare('The quick brown fox jumps over the lazy dog', STYLE)
    const result = layout(p, 320)
    expect(result.height).toBe(result.lineCount * STYLE.lineHeight!)
  })
})

// ---------------------------------------------------------------------------
// 2. prepare empty string
// ---------------------------------------------------------------------------

describe('prepare empty string (useTextHeight early-return path)', () => {
  test('empty string returns height = 0', () => {
    // useTextHeight returns 0 early for empty text; same result via pipeline.
    const p = prepare('', STYLE)
    const result = layout(p, 320)
    expect(result.height).toBe(0)
    expect(result.lineCount).toBe(0)
  })

  test('empty string prepared text is a valid handle (no throw)', () => {
    expect(() => {
      const p = prepare('', STYLE)
      layout(p, 320)
    }).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 3. measureHeights batch — all positive heights
// ---------------------------------------------------------------------------

describe('measureHeights batch (useFlashListHeights pre-warm cache pattern)', () => {
  test('all texts in the batch receive positive heights', () => {
    const texts = [
      'Short line',
      'A longer line that may wrap depending on the width',
      'Another item',
      'Yet one more text block in the batch',
    ]
    const heights = measureHeights(texts, STYLE, 200)
    expect(heights).toHaveLength(texts.length)
    for (const h of heights) {
      expect(h).toBeGreaterThan(0)
    }
  })

  test('batch returns one height per input text', () => {
    const texts = ['alpha', 'beta', 'gamma']
    const heights = measureHeights(texts, STYLE, 300)
    expect(heights).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// 4. measureHeights consistency — batch vs individual prepare+layout
// ---------------------------------------------------------------------------

describe('measureHeights consistency', () => {
  test('batch result matches individual prepare+layout for each text', () => {
    const texts = [
      'First item',
      'Second item with more words',
      'Third',
    ]
    const batchHeights = measureHeights(texts, STYLE, 250)
    for (let i = 0; i < texts.length; i++) {
      const individual = layout(prepare(texts[i]!, STYLE), 250).height
      expect(batchHeights[i]).toBe(individual)
    }
  })
})

// ---------------------------------------------------------------------------
// 5. prepare with options — whiteSpace: 'pre-wrap'
// ---------------------------------------------------------------------------

describe('prepare with options (PrepareOptions)', () => {
  test("whiteSpace: 'pre-wrap' produces a valid PreparedText that layouts without throw", () => {
    const opts: PrepareOptions = { whiteSpace: 'pre-wrap' }
    expect(() => {
      const p = prepare('Line one\nLine two\nLine three', STYLE, opts)
      layout(p, 320)
    }).not.toThrow()
  })

  test("whiteSpace: 'pre-wrap' height is positive for multi-line text", () => {
    const opts: PrepareOptions = { whiteSpace: 'pre-wrap' }
    const p = prepare('Line one\nLine two\nLine three', STYLE, opts)
    const result = layout(p, 320)
    expect(result.height).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 6. layout at different widths — same prepared text
// ---------------------------------------------------------------------------

describe('layout at different widths', () => {
  test('narrower width produces more lines (or equal) than wider width', () => {
    const text = 'The quick brown fox jumps over the lazy dog and then some more words'
    const p = prepare(text, STYLE)
    const narrow = layout(p, 100)
    const wide = layout(p, 600)
    expect(narrow.lineCount).toBeGreaterThanOrEqual(wide.lineCount)
  })

  test('narrower width produces greater (or equal) height than wider width', () => {
    const text = 'The quick brown fox jumps over the lazy dog and then some more words'
    const p = prepare(text, STYLE)
    const narrow = layout(p, 100)
    const wide = layout(p, 600)
    expect(narrow.height).toBeGreaterThanOrEqual(wide.height)
  })

  test('same text at very wide width fits in 1 line', () => {
    const text = 'Short text'
    const p = prepare(text, STYLE)
    const result = layout(p, 10_000)
    expect(result.lineCount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 7. prepareWithSegments — returns handle with segments
// ---------------------------------------------------------------------------

describe('prepareWithSegments (rich handle)', () => {
  test('non-empty text produces a handle that layoutWithLines can use', () => {
    const p = prepareWithSegs('Hello World', STYLE)
    const result = layoutWithLines(p, 300)
    expect(result.lineCount).toBeGreaterThanOrEqual(1)
    expect(result.lines).toHaveLength(result.lineCount)
  })

  test('empty string produces a handle that returns 0 lines', () => {
    const p = prepareWithSegs('', STYLE)
    const result = layoutWithLines(p, 300)
    expect(result.lineCount).toBe(0)
    expect(result.lines).toHaveLength(0)
  })

  test('lines array contains start/end cursor ranges', () => {
    const p = prepareWithSegs('Hello World', STYLE)
    const result = layoutWithLines(p, 300)
    for (const line of result.lines) {
      expect(typeof line.start.segmentIndex).toBe('number')
      expect(typeof line.start.graphemeIndex).toBe('number')
      expect(typeof line.end.segmentIndex).toBe('number')
      expect(typeof line.end.graphemeIndex).toBe('number')
    }
  })
})

// ---------------------------------------------------------------------------
// 8. layoutWithLines — lines with start/end ranges
// ---------------------------------------------------------------------------

describe('layoutWithLines', () => {
  test('height equals lineCount * lineHeight', () => {
    const p = prepareWithSegs('The quick brown fox jumps over the lazy dog', STYLE)
    const result = layoutWithLines(p, 200)
    expect(result.height).toBe(result.lineCount * STYLE.lineHeight!)
  })

  test('wrapping text at narrow width produces multiple lines', () => {
    const p = prepareWithSegs('The quick brown fox jumps over the lazy dog', STYLE)
    const result = layoutWithLines(p, 100)
    expect(result.lineCount).toBeGreaterThan(1)
    expect(result.lines.length).toBeGreaterThan(1)
  })

  test('each line has a non-negative width', () => {
    const p = prepareWithSegs('Hello world foo bar', STYLE)
    const result = layoutWithLines(p, 150)
    for (const line of result.lines) {
      expect(line.width).toBeGreaterThanOrEqual(0)
    }
  })
})

// ---------------------------------------------------------------------------
// 9. measureNaturalWidth — returns positive number for non-empty text
// ---------------------------------------------------------------------------

describe('measureNaturalWidth', () => {
  test('returns a positive number for non-empty text', () => {
    const p = prepareWithSegs('Hello', STYLE)
    const width = measureNaturalWidth(p)
    expect(width).toBeGreaterThan(0)
  })

  test('returns 0 for empty text', () => {
    const p = prepareWithSegs('', STYLE)
    const width = measureNaturalWidth(p)
    expect(width).toBe(0)
  })

  test('longer text has greater or equal natural width than a single short word', () => {
    const short = prepareWithSegs('Hi', STYLE)
    const long = prepareWithSegs('This is a much longer sentence without wrapping', STYLE)
    expect(measureNaturalWidth(long)).toBeGreaterThanOrEqual(measureNaturalWidth(short))
  })

  test('natural width is independent of container width (unconstrained layout)', () => {
    const p = prepareWithSegs('Hello world', STYLE)
    // measureNaturalWidth always passes Infinity as container — calling twice is stable
    const w1 = measureNaturalWidth(p)
    const w2 = measureNaturalWidth(p)
    expect(w1).toBe(w2)
  })
})
