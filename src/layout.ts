// Layout engine for expo-pretext, ported from chenglou/pretext src/layout.ts.
//
// In the original Pretext, prepare() did text analysis + Canvas measurement in
// one step. In expo-pretext, measurement happens on the native side (iOS/Android
// text layout engines) and analysis happens in JS on pre-segmented data from
// the native module. This file receives the pre-analyzed + pre-measured data
// and builds the same internal PreparedText structure that the line-breaking
// algorithm operates on.
//
// The line-breaking algorithm, line walking, and all layout math are unchanged
// from Pretext. The public API surface is preserved:
//   layout(prepared, maxWidth)           -> { height, lineCount }
//   layoutWithLines(prepared, maxWidth)  -> { height, lineCount, lines }
//   layoutNextLine(prepared, start, maxWidth) -> LayoutLine | null
//   walkLineRanges(prepared, maxWidth, onLine) -> number
//   measureNaturalWidth(prepared)        -> number
//   clearCache()                         — clears internal + JS caches
//   setLocale(locale?)                   — sets locale for analysis

import { computeSegmentLevels } from './bidi'
import {
  canContinueKeepAllTextRun,
  clearAnalysisCaches,
  endsWithClosingQuote,
  isCJK,
  isNumericRunSegment,
  kinsokuEnd,
  kinsokuStart,
  leftStickyPunctuation,
  setAnalysisLocale,
  type AnalysisChunk,
  type SegmentBreakKind,
  type TextAnalysis,
  type WhiteSpaceMode,
  type WordBreakMode,
} from './analysis'
import { getEngineProfile } from './engine-profile'
import {
  countPreparedLines,
  layoutNextLineRange as stepPreparedLineRange,
  measurePreparedLineGeometry,
  walkPreparedLines,
  type InternalLayoutLine,
} from './line-break'
import { clearJSCache } from './cache'
import type {
  TextStyle,
  LayoutCursor,
  LayoutResult,
  LayoutLine,
  LayoutLineRange,
  PreparedText,
  PreparedTextWithSegments as PublicPreparedTextWithSegments,
} from './types'

// Grapheme segmenter for rich-path text materialization.
// Intl.Segmenter may not be available in Hermes — use a fallback
// that splits on Unicode code points via spread operator.
interface GraphemeSegmenterLike {
  segment(text: string): Iterable<{ segment: string }>
}

let sharedGraphemeSegmenter: GraphemeSegmenterLike | null = null
// Rich-path only. Reuses grapheme splits while materializing multiple lines
// from the same prepared handle, without pushing that cache into the API.
let sharedLineTextCaches = new WeakMap<InternalPreparedTextWithSegments, Map<number, string[]>>()

function getSharedGraphemeSegmenter(): GraphemeSegmenterLike {
  if (sharedGraphemeSegmenter === null) {
    if (typeof Intl !== 'undefined' && typeof (Intl as any).Segmenter === 'function') {
      sharedGraphemeSegmenter = new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' })
    } else {
      // Fallback: split on code points via spread operator.
      // This handles most cases correctly (including astral plane),
      // but may not perfectly handle complex grapheme clusters (ZWJ emoji).
      sharedGraphemeSegmenter = {
        segment(text: string): Iterable<{ segment: string }> {
          return [...text].map(ch => ({ segment: ch }))
        },
      }
    }
  }
  return sharedGraphemeSegmenter
}

// --- Internal types ---

// The core parallel-array structure that the line-breaking engine operates on.
// Identical to Pretext's internal representation.
type PreparedCore = {
  widths: number[]
  lineEndFitAdvances: number[]
  lineEndPaintAdvances: number[]
  kinds: SegmentBreakKind[]
  simpleLineWalkFastPath: boolean
  segLevels: Int8Array | null
  breakableWidths: (number[] | null)[]
  breakablePrefixWidths: (number[] | null)[]
  discretionaryHyphenWidth: number
  tabStopAdvance: number
  chunks: PreparedLineChunk[]
  style: TextStyle | null
}

type InternalPreparedText = PreparedText & PreparedCore

type InternalPreparedTextWithSegments = InternalPreparedText & {
  segments: string[]
}

export type PreparedLineChunk = {
  startSegmentIndex: number
  endSegmentIndex: number
  consumedEndSegmentIndex: number
}

export type LineGeometry = {
  lineCount: number
  maxLineWidth: number
}

export type LayoutLinesResult = LayoutResult & {
  lines: LayoutLine[]
}

export type PrepareOptions = {
  whiteSpace?: WhiteSpaceMode
  wordBreak?: WordBreakMode
}

// --- Internal helpers ---

type MeasuredTextUnit = {
  text: string
  start: number
}

function createEmptyPrepared(
  includeSegments: boolean,
  style: TextStyle | null,
): InternalPreparedText | InternalPreparedTextWithSegments {
  const base: PreparedCore = {
    widths: [],
    lineEndFitAdvances: [],
    lineEndPaintAdvances: [],
    kinds: [],
    simpleLineWalkFastPath: true,
    segLevels: null,
    breakableWidths: [],
    breakablePrefixWidths: [],
    discretionaryHyphenWidth: 0,
    tabStopAdvance: 0,
    chunks: [],
    style,
  }
  if (includeSegments) {
    return { ...base, segments: [] } as unknown as InternalPreparedTextWithSegments
  }
  return base as unknown as InternalPreparedText
}

function buildBaseCjkUnits(
  segText: string,
  engineProfile: ReturnType<typeof getEngineProfile>,
): MeasuredTextUnit[] {
  const units: MeasuredTextUnit[] = []
  let unitText = ''
  let unitStart = 0

  function pushUnit(): void {
    if (unitText.length === 0) return
    units.push({ text: unitText, start: unitStart })
    unitText = ''
  }

  for (const gs of getSharedGraphemeSegmenter().segment(segText)) {
    const grapheme = gs.segment

    if (unitText.length === 0) {
      unitText = grapheme
      unitStart = gs.index
      continue
    }

    if (
      kinsokuEnd.has(unitText) ||
      kinsokuStart.has(grapheme) ||
      leftStickyPunctuation.has(grapheme) ||
      (engineProfile.carryCJKAfterClosingQuote &&
        isCJK(grapheme) &&
        endsWithClosingQuote(unitText))
    ) {
      unitText += grapheme
      continue
    }

    if (!isCJK(unitText) && !isCJK(grapheme)) {
      unitText += grapheme
      continue
    }

    pushUnit()
    unitText = grapheme
    unitStart = gs.index
  }

  pushUnit()
  return units
}

function mergeKeepAllTextUnits(units: MeasuredTextUnit[]): MeasuredTextUnit[] {
  if (units.length <= 1) return units

  const merged: MeasuredTextUnit[] = [{ ...units[0]! }]
  for (let i = 1; i < units.length; i++) {
    const next = units[i]!
    const previous = merged[merged.length - 1]!

    if (
      canContinueKeepAllTextRun(previous.text) &&
      isCJK(previous.text)
    ) {
      previous.text += next.text
      continue
    }

    merged.push({ ...next })
  }

  return merged
}

// Look up width of a sub-segment from the pre-measured width map.
// If the exact text was measured by native, return that width.
// Otherwise fall back to proportional estimation from the parent segment.
function lookupWidth(
  text: string,
  widthMap: Map<string, number>,
  parentText: string,
  parentWidth: number,
): number {
  const cached = widthMap.get(text)
  if (cached !== undefined) return cached

  // Proportional fallback: scale parent width by character ratio.
  // This is a rough heuristic; for CJK where each grapheme is ~equal width
  // it's a reasonable approximation.
  if (parentText.length > 0 && parentWidth > 0) {
    return (text.length / parentText.length) * parentWidth
  }
  return 0
}

// Get grapheme widths for a text segment by splitting it and looking up
// individual grapheme widths from the width map, falling back to equal
// distribution from the total width.
function getGraphemeWidthsFromMap(
  text: string,
  totalWidth: number,
  widthMap: Map<string, number>,
): number[] {
  const graphemeSegmenter = getSharedGraphemeSegmenter()
  const graphemes: string[] = []
  for (const gs of graphemeSegmenter.segment(text)) {
    graphemes.push(gs.segment)
  }
  if (graphemes.length <= 1) return [totalWidth]

  const widths: number[] = []
  let knownTotal = 0
  let unknownCount = 0
  for (const g of graphemes) {
    const w = widthMap.get(g)
    if (w !== undefined) {
      widths.push(w)
      knownTotal += w
    } else {
      widths.push(-1)
      unknownCount++
    }
  }

  if (unknownCount > 0) {
    const remaining = Math.max(0, totalWidth - knownTotal)
    const perUnknown = remaining / unknownCount
    for (let i = 0; i < widths.length; i++) {
      if (widths[i]! < 0) widths[i] = perUnknown
    }
  }

  return widths
}

// Build cumulative prefix widths from per-grapheme widths.
function buildPrefixWidths(graphemeWidths: number[]): number[] {
  const prefixWidths: number[] = new Array(graphemeWidths.length)
  let sum = 0
  for (let i = 0; i < graphemeWidths.length; i++) {
    sum += graphemeWidths[i]!
    prefixWidths[i] = sum
  }
  return prefixWidths
}

function mapAnalysisChunksToPreparedChunks(
  chunks: AnalysisChunk[],
  preparedStartByAnalysisIndex: number[],
  preparedEndSegmentIndex: number,
): PreparedLineChunk[] {
  const preparedChunks: PreparedLineChunk[] = []
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!
    const startSegmentIndex =
      chunk.startSegmentIndex < preparedStartByAnalysisIndex.length
        ? preparedStartByAnalysisIndex[chunk.startSegmentIndex]!
        : preparedEndSegmentIndex
    const endSegmentIndex =
      chunk.endSegmentIndex < preparedStartByAnalysisIndex.length
        ? preparedStartByAnalysisIndex[chunk.endSegmentIndex]!
        : preparedEndSegmentIndex
    const consumedEndSegmentIndex =
      chunk.consumedEndSegmentIndex < preparedStartByAnalysisIndex.length
        ? preparedStartByAnalysisIndex[chunk.consumedEndSegmentIndex]!
        : preparedEndSegmentIndex

    preparedChunks.push({
      startSegmentIndex,
      endSegmentIndex,
      consumedEndSegmentIndex,
    })
  }
  return preparedChunks
}

// --- Build prepared handles from pre-measured data ---

// Build the internal PreparedText structure from a TextAnalysis and a width map.
// The width map is keyed by segment text -> measured width from native.
// This replaces the original Pretext's measureAnalysis() which used Canvas.
function buildFromAnalysis(
  analysis: TextAnalysis,
  widthMap: Map<string, number>,
  includeSegments: boolean,
  wordBreak: WordBreakMode,
  style: TextStyle | null,
): InternalPreparedText | InternalPreparedTextWithSegments {
  const engineProfile = getEngineProfile()

  // Get hyphen and space widths from the map, or estimate
  const discretionaryHyphenWidth = widthMap.get('-') ?? (widthMap.get(' ') ?? 0) * 0.6
  const spaceWidth = widthMap.get(' ') ?? 0
  const tabStopAdvance = spaceWidth * 8

  if (analysis.len === 0) return createEmptyPrepared(includeSegments, style)

  const widths: number[] = []
  const lineEndFitAdvances: number[] = []
  const lineEndPaintAdvances: number[] = []
  const kinds: SegmentBreakKind[] = []
  let simpleLineWalkFastPath = analysis.chunks.length <= 1
  const segStarts = includeSegments ? [] as number[] : null
  const breakableWidths: (number[] | null)[] = []
  const breakablePrefixWidths: (number[] | null)[] = []
  const segments = includeSegments ? [] as string[] : null
  const preparedStartByAnalysisIndex = Array.from<number>({ length: analysis.len })

  function pushSegment(
    text: string,
    width: number,
    lineEndFitAdvance: number,
    lineEndPaintAdvance: number,
    kind: SegmentBreakKind,
    start: number,
    breakable: number[] | null,
    breakablePrefix: number[] | null,
  ): void {
    if (kind !== 'text' && kind !== 'space' && kind !== 'zero-width-break') {
      simpleLineWalkFastPath = false
    }
    widths.push(width)
    lineEndFitAdvances.push(lineEndFitAdvance)
    lineEndPaintAdvances.push(lineEndPaintAdvance)
    kinds.push(kind)
    segStarts?.push(start)
    breakableWidths.push(breakable)
    breakablePrefixWidths.push(breakablePrefix)
    if (segments !== null) segments.push(text)
  }

  function pushTextSegment(
    text: string,
    kind: SegmentBreakKind,
    start: number,
    wordLike: boolean,
    allowOverflowBreaks: boolean,
    parentText: string,
    parentWidth: number,
  ): void {
    const width = lookupWidth(text, widthMap, parentText, parentWidth)
    const lineEndFitAdvance =
      kind === 'space' || kind === 'preserved-space' || kind === 'zero-width-break'
        ? 0
        : width
    const lineEndPaintAdvance =
      kind === 'space' || kind === 'zero-width-break'
        ? 0
        : width

    if (allowOverflowBreaks && wordLike && text.length > 1) {
      const graphemeWidths = getGraphemeWidthsFromMap(text, width, widthMap)
      const graphemePrefixWidths =
        engineProfile.preferPrefixWidthsForBreakableRuns || isNumericRunSegment(text)
          ? buildPrefixWidths(graphemeWidths)
          : null
      pushSegment(
        text,
        width,
        lineEndFitAdvance,
        lineEndPaintAdvance,
        kind,
        start,
        graphemeWidths,
        graphemePrefixWidths,
      )
      return
    }

    pushSegment(
      text,
      width,
      lineEndFitAdvance,
      lineEndPaintAdvance,
      kind,
      start,
      null,
      null,
    )
  }

  for (let mi = 0; mi < analysis.len; mi++) {
    preparedStartByAnalysisIndex[mi] = widths.length
    const segText = analysis.texts[mi]!
    const segWordLike = analysis.isWordLike[mi]!
    const segKind = analysis.kinds[mi]!
    const segStart = analysis.starts[mi]!

    if (segKind === 'soft-hyphen') {
      pushSegment(
        segText,
        0,
        discretionaryHyphenWidth,
        discretionaryHyphenWidth,
        segKind,
        segStart,
        null,
        null,
      )
      continue
    }

    if (segKind === 'hard-break') {
      pushSegment(segText, 0, 0, 0, segKind, segStart, null, null)
      continue
    }

    if (segKind === 'tab') {
      pushSegment(segText, 0, 0, 0, segKind, segStart, null, null)
      continue
    }

    // Check if this segment contains CJK and needs per-grapheme splitting
    const containsCJK = isCJK(segText)

    if (segKind === 'text' && containsCJK) {
      const parentWidth = widthMap.get(segText) ?? 0
      const baseUnits = buildBaseCjkUnits(segText, engineProfile)
      const measuredUnits = wordBreak === 'keep-all'
        ? mergeKeepAllTextUnits(baseUnits)
        : baseUnits

      for (let i = 0; i < measuredUnits.length; i++) {
        const unit = measuredUnits[i]!
        pushTextSegment(
          unit.text,
          'text',
          segStart + unit.start,
          segWordLike,
          wordBreak === 'keep-all' || !isCJK(unit.text),
          segText,
          parentWidth,
        )
      }
      continue
    }

    pushTextSegment(segText, segKind, segStart, segWordLike, true, segText, 0)
  }

  const chunks = mapAnalysisChunksToPreparedChunks(analysis.chunks, preparedStartByAnalysisIndex, widths.length)
  const segLevels = segStarts === null ? null : computeSegmentLevels(analysis.normalized, segStarts)

  const core: PreparedCore = {
    widths,
    lineEndFitAdvances,
    lineEndPaintAdvances,
    kinds,
    simpleLineWalkFastPath,
    segLevels,
    breakableWidths,
    breakablePrefixWidths,
    discretionaryHyphenWidth,
    tabStopAdvance,
    chunks,
    style,
  }

  if (segments !== null) {
    return { ...core, segments } as unknown as InternalPreparedTextWithSegments
  }
  return core as unknown as InternalPreparedText
}

// --- Public build functions (called by prepare.ts) ---

// Build a PreparedText handle from pre-analyzed text and a width map.
// This is the expo-pretext equivalent of Pretext's prepare().
//
// Parameters:
//   analysis  — TextAnalysis from analyzeText() (segments, kinds, chunks, etc.)
//   widthMap  — Map<string, number> of segment text -> measured width from native
//   style     — TextStyle used for measurement (stored for lineHeight access)
//   options   — optional wordBreak mode
export function buildPreparedText(
  analysis: TextAnalysis,
  widthMap: Map<string, number>,
  style: TextStyle,
  options?: PrepareOptions,
): PreparedText {
  const wordBreak = options?.wordBreak ?? 'normal'
  return buildFromAnalysis(analysis, widthMap, false, wordBreak, style) as PreparedText
}

// Rich variant that exposes segment data for custom rendering.
export function buildPreparedTextWithSegments(
  analysis: TextAnalysis,
  widthMap: Map<string, number>,
  style: TextStyle,
  options?: PrepareOptions,
): PublicPreparedTextWithSegments {
  const wordBreak = options?.wordBreak ?? 'normal'
  return buildFromAnalysis(analysis, widthMap, true, wordBreak, style) as unknown as PublicPreparedTextWithSegments
}

// --- Internal helpers for public API ---

function getInternalPrepared(prepared: PreparedText): InternalPreparedText {
  return prepared as InternalPreparedText
}

function getInternalPreparedWithSegments(prepared: PublicPreparedTextWithSegments): InternalPreparedTextWithSegments {
  return prepared as unknown as InternalPreparedTextWithSegments
}

function getLineHeight(prepared: InternalPreparedText, lineHeightOverride?: number): number {
  if (lineHeightOverride !== undefined) return lineHeightOverride
  const style = prepared.style
  if (style !== null && style.lineHeight !== undefined) return style.lineHeight
  if (style !== null) return style.fontSize * 1.2
  return 0
}

// --- Public layout API ---

// Layout prepared text at a given max width. Pure arithmetic on cached widths —
// no native calls, no string operations, no allocations.
// ~0.0002ms per text block. Call on every resize.
//
// lineHeight is optional: if omitted, it is read from the prepared handle's
// TextStyle (style.lineHeight, or fontSize * 1.2 as fallback).
export function layout(prepared: PreparedText, maxWidth: number, lineHeight?: number): LayoutResult {
  const internal = getInternalPrepared(prepared)
  const lineCount = countPreparedLines(internal, maxWidth)
  const lh = getLineHeight(internal, lineHeight)
  return { lineCount, height: lineCount * lh }
}

function getSegmentGraphemes(
  segmentIndex: number,
  segments: string[],
  cache: Map<number, string[]>,
): string[] {
  let graphemes = cache.get(segmentIndex)
  if (graphemes !== undefined) return graphemes

  graphemes = []
  const graphemeSegmenter = getSharedGraphemeSegmenter()
  for (const gs of graphemeSegmenter.segment(segments[segmentIndex]!)) {
    graphemes.push(gs.segment)
  }
  cache.set(segmentIndex, graphemes)
  return graphemes
}

function getLineTextCache(prepared: InternalPreparedTextWithSegments): Map<number, string[]> {
  let cache = sharedLineTextCaches.get(prepared)
  if (cache !== undefined) return cache

  cache = new Map<number, string[]>()
  sharedLineTextCaches.set(prepared, cache)
  return cache
}

function lineHasDiscretionaryHyphen(
  kinds: SegmentBreakKind[],
  startSegmentIndex: number,
  startGraphemeIndex: number,
  endSegmentIndex: number,
): boolean {
  return (
    endSegmentIndex > 0 &&
    kinds[endSegmentIndex - 1] === 'soft-hyphen' &&
    !(startSegmentIndex === endSegmentIndex && startGraphemeIndex > 0)
  )
}

function buildLineTextFromRange(
  segments: string[],
  kinds: SegmentBreakKind[],
  cache: Map<number, string[]>,
  startSegmentIndex: number,
  startGraphemeIndex: number,
  endSegmentIndex: number,
  endGraphemeIndex: number,
): string {
  let text = ''
  const endsWithDiscretionaryHyphen = lineHasDiscretionaryHyphen(
    kinds,
    startSegmentIndex,
    startGraphemeIndex,
    endSegmentIndex,
  )

  for (let i = startSegmentIndex; i < endSegmentIndex; i++) {
    if (kinds[i] === 'soft-hyphen' || kinds[i] === 'hard-break') continue
    if (i === startSegmentIndex && startGraphemeIndex > 0) {
      text += getSegmentGraphemes(i, segments, cache).slice(startGraphemeIndex).join('')
    } else {
      text += segments[i]!
    }
  }

  if (endGraphemeIndex > 0) {
    if (endsWithDiscretionaryHyphen) text += '-'
    text += getSegmentGraphemes(endSegmentIndex, segments, cache).slice(
      startSegmentIndex === endSegmentIndex ? startGraphemeIndex : 0,
      endGraphemeIndex,
    ).join('')
  } else if (endsWithDiscretionaryHyphen) {
    text += '-'
  }

  return text
}

function createLayoutLine(
  prepared: InternalPreparedTextWithSegments,
  cache: Map<number, string[]>,
  width: number,
  startSegmentIndex: number,
  startGraphemeIndex: number,
  endSegmentIndex: number,
  endGraphemeIndex: number,
): LayoutLine {
  return {
    text: buildLineTextFromRange(
      prepared.segments,
      prepared.kinds,
      cache,
      startSegmentIndex,
      startGraphemeIndex,
      endSegmentIndex,
      endGraphemeIndex,
    ),
    width,
    start: {
      segmentIndex: startSegmentIndex,
      graphemeIndex: startGraphemeIndex,
    },
    end: {
      segmentIndex: endSegmentIndex,
      graphemeIndex: endGraphemeIndex,
    },
  }
}

function materializeLayoutLine(
  prepared: InternalPreparedTextWithSegments,
  cache: Map<number, string[]>,
  line: InternalLayoutLine,
): LayoutLine {
  return createLayoutLine(
    prepared,
    cache,
    line.width,
    line.startSegmentIndex,
    line.startGraphemeIndex,
    line.endSegmentIndex,
    line.endGraphemeIndex,
  )
}

function toLayoutLineRange(line: InternalLayoutLine): LayoutLineRange {
  return {
    width: line.width,
    start: {
      segmentIndex: line.startSegmentIndex,
      graphemeIndex: line.startGraphemeIndex,
    },
    end: {
      segmentIndex: line.endSegmentIndex,
      graphemeIndex: line.endGraphemeIndex,
    },
  }
}

function stepLineRange(
  prepared: InternalPreparedTextWithSegments,
  start: LayoutCursor,
  maxWidth: number,
): LayoutLineRange | null {
  const line = stepPreparedLineRange(prepared, start, maxWidth)
  if (line === null) return null
  return toLayoutLineRange(line)
}

function materializeLine(
  prepared: InternalPreparedTextWithSegments,
  line: LayoutLineRange,
): LayoutLine {
  return createLayoutLine(
    prepared,
    getLineTextCache(prepared),
    line.width,
    line.start.segmentIndex,
    line.start.graphemeIndex,
    line.end.segmentIndex,
    line.end.graphemeIndex,
  )
}

export function materializeLineRange(
  prepared: PublicPreparedTextWithSegments,
  line: LayoutLineRange,
): LayoutLine {
  return materializeLine(getInternalPreparedWithSegments(prepared), line)
}

// Batch low-level line geometry pass. Non-materializing counterpart to
// layoutWithLines(), useful for shrinkwrap and other aggregate geometry work.
export function walkLineRanges(
  prepared: PublicPreparedTextWithSegments,
  maxWidth: number,
  onLine: (line: LayoutLineRange) => void,
): number {
  const internal = getInternalPreparedWithSegments(prepared)
  if (internal.widths.length === 0) return 0

  return walkPreparedLines(internal, maxWidth, line => {
    onLine(toLayoutLineRange(line))
  })
}

export function measureLineGeometry(
  prepared: PublicPreparedTextWithSegments,
  maxWidth: number,
): LineGeometry {
  return measurePreparedLineGeometry(getInternalPreparedWithSegments(prepared), maxWidth)
}

// Intrinsic-width helper for rich/userland layout work. Returns the widest
// forced line when container width is unconstrained.
export function measureNaturalWidth(prepared: PublicPreparedTextWithSegments): number {
  let maxWidth = 0
  walkLineRanges(prepared, Number.POSITIVE_INFINITY, line => {
    if (line.width > maxWidth) maxWidth = line.width
  })
  return maxWidth
}

export function layoutNextLine(
  prepared: PublicPreparedTextWithSegments,
  start: LayoutCursor,
  maxWidth: number,
): LayoutLine | null {
  const line = layoutNextLineRange(prepared, start, maxWidth)
  if (line === null) return null
  return materializeLineRange(prepared, line)
}

export function layoutNextLineRange(
  prepared: PublicPreparedTextWithSegments,
  start: LayoutCursor,
  maxWidth: number,
): LayoutLineRange | null {
  return stepLineRange(getInternalPreparedWithSegments(prepared), start, maxWidth)
}

// Rich layout API for callers that want the actual line contents and widths.
// lineHeight is optional: if omitted, read from the prepared handle's style.
export function layoutWithLines(
  prepared: PublicPreparedTextWithSegments,
  maxWidth: number,
  lineHeight?: number,
): LayoutLinesResult {
  const internal = getInternalPreparedWithSegments(prepared)
  const lines: LayoutLine[] = []
  if (internal.widths.length === 0) return { lineCount: 0, height: 0, lines }

  const graphemeCache = getLineTextCache(internal)
  const lineCount = walkPreparedLines(internal, maxWidth, line => {
    lines.push(materializeLayoutLine(internal, graphemeCache, line))
  })

  const lh = getLineHeight(internal, lineHeight)
  return { lineCount, height: lineCount * lh, lines }
}

// --- Inline-flow compatibility ---

// Re-export the public PreparedTextWithSegments under the alias the inline-flow
// module expects.  The underlying type is the same opaque branded handle.
export type { PublicPreparedTextWithSegments as PreparedTextWithSegments }
export type { LayoutCursor, LayoutResult, LayoutLineRange, LayoutLine }

// prepareWithSegments is now provided by prepare.ts, which wires the full
// pipeline: native segmentation + measurement → analysis → buildPreparedTextWithSegments.
// Import from './prepare' instead of layout.js for this function.

// --- Cache management ---

export function clearCache(): void {
  clearAnalysisCaches()
  sharedGraphemeSegmenter = null
  sharedLineTextCaches = new WeakMap<InternalPreparedTextWithSegments, Map<number, string[]>>()
  clearJSCache()
}

export function setLocale(locale?: string): void {
  setAnalysisLocale(locale)
  clearCache()
}
