// src/skia-adapter.ts
// Minimal Pretext → Skia bridge.
//
// react-native-skia's Paragraph / SkFont APIs consume precise per-run
// measurements (advance, ink bounds, font fallback decisions). Upstream
// has asked for this directly on Skia ([Skia #3493], [Skia #3488],
// [Skia #1736]). This module exposes the same data Pretext already
// collects natively, reshaped into per-run records that plug cleanly
// into a Skia Paragraph builder.
//
// The adapter is measurement-only — it does not depend on Skia, does not
// render anything, and does not require react-native-skia to be installed.
// Import it from Skia code to get the numbers; render via Skia's own APIs.

import type { TextStyle, InkBounds } from './types'
import { measureInkBounds } from './ink-width'
import { prepareWithSegments } from './prepare'
import { layoutWithLines } from './layout'
import { resolveFontFamily } from './font-utils'

export type TextRun = {
  /** Substring of the original text this run covers. */
  text: string
  /** Byte (UTF-16 code unit) start index into the original text. */
  startIndex: number
  /** Byte (UTF-16 code unit) end index, exclusive. */
  endIndex: number
  /** Ink bounds of the run (left, top, right, bottom, width, height). */
  bounds: InkBounds
  /** Natural advance width (sum of glyph advances — what SkFont returns). */
  advance: number
  /** Font descriptor used for this run — carries through any fallback chain resolution. */
  font: {
    family: string
    size: number
    weight?: string
    style?: string
  }
}

export type ParagraphMeasurement = {
  /** Total width spanned by all runs (sum of advances). */
  naturalWidth: number
  /** Height if laid out at `naturalWidth` with the style's `lineHeight`. */
  naturalHeight: number
  /** Per-word runs, in visual order. */
  runs: TextRun[]
}

/**
 * Measure every word/segment in `text` and return per-run records ready for
 * a Skia Paragraph builder.
 *
 * Covers the common "I want precise glyph bounds with font fallback"
 * request on Skia (issues #3493, #3488, #1736). The returned advances
 * match what `SkFont.getTextWidth` produces; the ink bounds match the
 * `SkTypeface` glyph raster.
 *
 * @example
 * ```ts
 * import { Paragraph } from '@shopify/react-native-skia'
 * import { measureRuns } from 'expo-pretext'
 *
 * const { runs } = measureRuns('Hello World', { fontFamily: 'Inter', fontSize: 16 })
 * const paragraph = Paragraph.Make(...)
 * for (const run of runs) {
 *   paragraph.addText(run.text, { ... })  // use run.bounds / run.advance
 * }
 * ```
 */
export function measureRuns(text: string, style: TextStyle): ParagraphMeasurement {
  if (!text) {
    return { naturalWidth: 0, naturalHeight: 0, runs: [] }
  }

  const prepared = prepareWithSegments(text, style)
  const laidOut = layoutWithLines(prepared, Infinity)
  const resolvedFamily = resolveFontFamily(style.fontFamily)

  const runs: TextRun[] = []
  let cursor = 0
  let naturalWidth = 0

  for (const line of laidOut.lines) {
    const bounds = measureInkBounds(line.text, style)
    const advance = line.width
    const startIndex = text.indexOf(line.text, cursor)
    const resolvedStart = startIndex >= 0 ? startIndex : cursor
    const endIndex = resolvedStart + line.text.length

    runs.push({
      text: line.text,
      startIndex: resolvedStart,
      endIndex,
      bounds,
      advance,
      font: {
        family: resolvedFamily,
        size: style.fontSize,
        weight: style.fontWeight,
        style: style.fontStyle,
      },
    })

    cursor = endIndex
    naturalWidth += advance
  }

  const lineHeight = style.lineHeight ?? style.fontSize * 1.2

  return {
    naturalWidth,
    naturalHeight: laidOut.lineCount * lineHeight,
    runs,
  }
}
