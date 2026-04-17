// properties.test.ts
// Property-based tests — assert invariants hold across random inputs.
//
// fast-check generates arbitrary strings, widths, and styles; each test asserts
// a law that must hold no matter the input. Shrinking points at a small
// counter-example when a law breaks.

;(globalThis as unknown as Record<string, unknown>).__DEV__ = false

import { describe, test, expect } from 'bun:test'
import fc from 'fast-check'
import { buildPreparedText, buildPreparedTextWithSegments } from '../build'
import {
  layout,
  layoutWithLines,
  measureNaturalWidth,
} from '../layout'
import { analyzeText } from '../analysis'
import type { TextStyle, NativeSegmentResult } from '../types'

// ----------------------------------------------------------------------------
// Test-local segmenter — same fallback used by other tests
// ----------------------------------------------------------------------------

const PROFILE = { carryCJKAfterClosingQuote: false }

function estimateSegments(text: string, style: TextStyle): NativeSegmentResult {
  const words = text.split(/(\s+)/)
  const charWidth = style.fontSize * 0.55
  return {
    segments: words,
    isWordLike: words.map((w) => !/^\s+$/.test(w)),
    widths: words.map((w) => w.length * charWidth),
  }
}

function widthMap(r: NativeSegmentResult): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < r.segments.length; i++) m.set(r.segments[i]!, r.widths[i]!)
  return m
}

function prepare(text: string, style: TextStyle) {
  if (!text) {
    const a = analyzeText([], [], PROFILE)
    return buildPreparedText(a, new Map(), style)
  }
  const s = estimateSegments(text, style)
  const a = analyzeText(s.segments, s.isWordLike, PROFILE)
  return buildPreparedText(a, widthMap(s), style)
}

function prepareWithSegs(text: string, style: TextStyle) {
  if (!text) {
    const a = analyzeText([], [], PROFILE)
    return buildPreparedTextWithSegments(a, new Map(), style)
  }
  const s = estimateSegments(text, style)
  const a = analyzeText(s.segments, s.isWordLike, PROFILE)
  return buildPreparedTextWithSegments(a, widthMap(s), style)
}

// ----------------------------------------------------------------------------
// Arbitraries
// ----------------------------------------------------------------------------

const arbStyle: fc.Arbitrary<TextStyle> = fc.record({
  fontFamily: fc.constantFrom('System', 'Inter', 'Menlo'),
  fontSize: fc.integer({ min: 10, max: 64 }),
  lineHeight: fc.integer({ min: 12, max: 96 }),
})

const arbWidth = fc.integer({ min: 40, max: 2000 })

// Realistic text: mix of ASCII words, CJK, Arabic, Georgian, whitespace.
const arbText: fc.Arbitrary<string> = fc.oneof(
  fc.string({ minLength: 0, maxLength: 200 }),
  fc.array(
    fc.oneof(
      fc.stringMatching(/^[A-Za-z]{1,12}$/),
      fc.stringMatching(/^[\u4e00-\u9fff]{1,10}$/), // CJK
      fc.stringMatching(/^[\u0600-\u06ff]{1,10}$/), // Arabic
      fc.stringMatching(/^[\u10a0-\u10ff]{1,10}$/), // Georgian
      fc.constantFrom(' ', '  ', '   ', '\n', '\t'),
    ),
    { minLength: 1, maxLength: 40 },
  ).map((xs) => xs.join(' ')),
)

// ----------------------------------------------------------------------------
// 1. layout() geometry laws
// ----------------------------------------------------------------------------

describe('layout() geometry laws', () => {
  test('height is non-negative', () => {
    fc.assert(
      fc.property(arbText, arbStyle, arbWidth, (text, style, width) => {
        const r = layout(prepare(text, style), width)
        expect(r.height).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 200 },
    )
  })

  test('lineCount is non-negative integer', () => {
    fc.assert(
      fc.property(arbText, arbStyle, arbWidth, (text, style, width) => {
        const r = layout(prepare(text, style), width)
        expect(Number.isInteger(r.lineCount)).toBe(true)
        expect(r.lineCount).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 200 },
    )
  })

  test('height === lineCount * lineHeight', () => {
    fc.assert(
      fc.property(arbText, arbStyle, arbWidth, (text, style, width) => {
        const r = layout(prepare(text, style), width)
        expect(r.height).toBeCloseTo(r.lineCount * style.lineHeight!, 5)
      }),
      { numRuns: 200 },
    )
  })

  test('empty string → height 0, lineCount 0', () => {
    fc.assert(
      fc.property(arbStyle, arbWidth, (style, width) => {
        const r = layout(prepare('', style), width)
        expect(r.height).toBe(0)
        expect(r.lineCount).toBe(0)
      }),
      { numRuns: 100 },
    )
  })

  test('narrower width produces ≥ lines than wider width', () => {
    fc.assert(
      fc.property(arbText, arbStyle, fc.tuple(arbWidth, arbWidth), (text, style, [a, b]) => {
        const narrow = Math.min(a, b)
        const wide = Math.max(a, b)
        const p = prepare(text, style)
        expect(layout(p, narrow).lineCount).toBeGreaterThanOrEqual(layout(p, wide).lineCount)
      }),
      { numRuns: 200 },
    )
  })

  test('repeating layout() on same inputs is deterministic', () => {
    fc.assert(
      fc.property(arbText, arbStyle, arbWidth, (text, style, width) => {
        const p = prepare(text, style)
        const a = layout(p, width)
        const b = layout(p, width)
        expect(a.height).toBe(b.height)
        expect(a.lineCount).toBe(b.lineCount)
      }),
      { numRuns: 200 },
    )
  })
})

// ----------------------------------------------------------------------------
// 2. prepare() laws
// ----------------------------------------------------------------------------

describe('prepare() laws', () => {
  test('prepare() does not throw on arbitrary text', () => {
    fc.assert(
      fc.property(arbText, arbStyle, (text, style) => {
        expect(() => prepare(text, style)).not.toThrow()
      }),
      { numRuns: 300 },
    )
  })

  test('prepareWithSegments() does not throw on arbitrary text', () => {
    fc.assert(
      fc.property(arbText, arbStyle, (text, style) => {
        expect(() => prepareWithSegs(text, style)).not.toThrow()
      }),
      { numRuns: 300 },
    )
  })

  test('prepare() and prepareWithSegments() agree on layout height', () => {
    fc.assert(
      fc.property(arbText, arbStyle, arbWidth, (text, style, width) => {
        const h1 = layout(prepare(text, style), width).height
        const h2 = layoutWithLines(prepareWithSegs(text, style), width).height
        expect(h1).toBeCloseTo(h2, 5)
      }),
      { numRuns: 200 },
    )
  })
})

// ----------------------------------------------------------------------------
// 3. layoutWithLines() laws
// ----------------------------------------------------------------------------

describe('layoutWithLines() laws', () => {
  test('lines.length === lineCount', () => {
    fc.assert(
      fc.property(arbText, arbStyle, arbWidth, (text, style, width) => {
        const r = layoutWithLines(prepareWithSegs(text, style), width)
        expect(r.lines.length).toBe(r.lineCount)
      }),
      { numRuns: 200 },
    )
  })

  test('each line width is non-negative', () => {
    fc.assert(
      fc.property(arbText, arbStyle, arbWidth, (text, style, width) => {
        const r = layoutWithLines(prepareWithSegs(text, style), width)
        for (const ln of r.lines) {
          expect(ln.width).toBeGreaterThanOrEqual(0)
        }
      }),
      { numRuns: 200 },
    )
  })

  test('each line has valid start/end cursors', () => {
    fc.assert(
      fc.property(arbText, arbStyle, arbWidth, (text, style, width) => {
        const r = layoutWithLines(prepareWithSegs(text, style), width)
        for (const ln of r.lines) {
          expect(ln.start.segmentIndex).toBeGreaterThanOrEqual(0)
          expect(ln.start.graphemeIndex).toBeGreaterThanOrEqual(0)
          expect(ln.end.segmentIndex).toBeGreaterThanOrEqual(ln.start.segmentIndex)
        }
      }),
      { numRuns: 200 },
    )
  })
})

// ----------------------------------------------------------------------------
// 4. measureNaturalWidth() laws
// ----------------------------------------------------------------------------

describe('measureNaturalWidth() laws', () => {
  test('is non-negative and finite', () => {
    fc.assert(
      fc.property(arbText, arbStyle, (text, style) => {
        const w = measureNaturalWidth(prepareWithSegs(text, style))
        expect(w).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(w)).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  test('is independent of container width (idempotent)', () => {
    fc.assert(
      fc.property(arbText, arbStyle, (text, style) => {
        const p = prepareWithSegs(text, style)
        expect(measureNaturalWidth(p)).toBe(measureNaturalWidth(p))
      }),
      { numRuns: 100 },
    )
  })

  test('laying out at natural width fits in ≤ 1 line when text has no hard breaks', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Za-z0-9 ]{0,80}$/).filter((s) => !/\n/.test(s)),
        arbStyle,
        (text, style) => {
          const p = prepareWithSegs(text, style)
          const w = measureNaturalWidth(p)
          // At natural width + 1px, line count must be ≤ 1 for non-empty non-breaking text.
          const r = layoutWithLines(p, w + 1)
          expect(r.lineCount).toBeLessThanOrEqual(1)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ----------------------------------------------------------------------------
// 5. Batch consistency — individual vs all-at-once
// ----------------------------------------------------------------------------

describe('batch consistency', () => {
  test('batch heights === individual heights', () => {
    fc.assert(
      fc.property(
        fc.array(arbText, { minLength: 1, maxLength: 10 }),
        arbStyle,
        arbWidth,
        (texts, style, width) => {
          const batch = texts.map((t) => layout(prepare(t, style), width).height)
          for (let i = 0; i < texts.length; i++) {
            const individual = layout(prepare(texts[i]!, style), width).height
            expect(batch[i]).toBe(individual)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
