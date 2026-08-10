// Build prepared text handles from pre-analyzed + pre-measured data.
// Extracted from layout.ts — contains the factory logic that constructs
// the internal PreparedText structures consumed by the line-breaking engine.

import { computeSegmentLevels } from './bidi'
import {
  canContinueKeepAllTextRun,
  endsWithClosingQuote,
  isCJK,
  isNumericRunSegment,
  kinsokuEnd,
  kinsokuStart,
  leftStickyPunctuation,
  type AnalysisChunk,
  type SegmentBreakKind,
  type TextAnalysis,
  type WhiteSpaceMode,
  type WordBreakMode,
} from './analysis'
import { getEngineProfile } from './engine-profile'
import type {
  TextStyle,
  PreparedText,
  PreparedTextWithSegments as PublicPreparedTextWithSegments,
} from './types'

// --- Grapheme segmenter ---
// Intl.Segmenter may not be available in Hermes — use a fallback
// that splits on Unicode code points via spread operator.

export interface GraphemeSegmenterLike {
  segment(text: string): Iterable<{ segment: string; index: number }>
}

let sharedGraphemeSegmenter: GraphemeSegmenterLike | null = null

export function getSharedGraphemeSegmenter(): GraphemeSegmenterLike {
  if (sharedGraphemeSegmenter === null) {
    if (typeof Intl !== 'undefined' && typeof (Intl as any).Segmenter === 'function') {
      sharedGraphemeSegmenter = new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' })
    } else {
      // Fallback: split on code points via spread operator.
      // This handles most cases correctly (including astral plane),
      // but may not perfectly handle complex grapheme clusters (ZWJ emoji).
      sharedGraphemeSegmenter = {
        segment(text: string): Iterable<{ segment: string; index: number }> {
          const chars = [...text]
          let idx = 0
          return chars.map(ch => {
            const entry = { segment: ch, index: idx }
            idx += ch.length
            return entry
          })
        },
      }
    }
  }
  return sharedGraphemeSegmenter!
}

export function clearGraphemeSegmenter(): void {
  sharedGraphemeSegmenter = null
}

// --- Internal types ---

// The core parallel-array structure that the line-breaking engine operates on.
// Identical to Pretext's internal representation.
export type PreparedCore = {
  widths: number[]
  lineEndFitAdvances: number[]
  lineEndPaintAdvances: number[]
  kinds: SegmentBreakKind[]
  simpleLineWalkFastPath: boolean
  segLevels: Int8Array | null
  breakableFitAdvances: (number[] | null)[]
  breakablePreferredBreaks: (number[] | null)[]
  discretionaryHyphenWidth: number
  tabStopAdvance: number
  chunks: PreparedLineChunk[]
  style: TextStyle | null
}

export type InternalPreparedText = PreparedText & PreparedCore

export type InternalPreparedTextWithSegments = InternalPreparedText & {
  segments: string[]
}

export type PreparedLineChunk = {
  startSegmentIndex: number
  endSegmentIndex: number
  consumedEndSegmentIndex: number
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
    breakableFitAdvances: [],
    breakablePreferredBreaks: [],
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
  let unitParts: string[] = []
  let unitStart = 0
  let unitContainsCJK = false
  let unitEndsWithClosingQuote = false
  let unitIsSingleKinsokuEnd = false

  function pushUnit(): void {
    if (unitParts.length === 0) return
    units.push({
      text: unitParts.length === 1 ? unitParts[0]! : unitParts.join(''),
      start: unitStart,
    })
    unitParts = []
    unitContainsCJK = false
    unitEndsWithClosingQuote = false
    unitIsSingleKinsokuEnd = false
  }

  function startUnit(grapheme: string, start: number, graphemeContainsCJK: boolean): void {
    unitParts = [grapheme]
    unitStart = start
    unitContainsCJK = graphemeContainsCJK
    unitEndsWithClosingQuote = endsWithClosingQuote(grapheme)
    unitIsSingleKinsokuEnd = kinsokuEnd.has(grapheme)
  }

  function appendToUnit(grapheme: string, graphemeContainsCJK: boolean): void {
    unitParts.push(grapheme)
    unitContainsCJK = unitContainsCJK || graphemeContainsCJK
    const graphemeEndsWithClosingQuote = endsWithClosingQuote(grapheme)
    if (grapheme.length === 1 && leftStickyPunctuation.has(grapheme)) {
      unitEndsWithClosingQuote = unitEndsWithClosingQuote || graphemeEndsWithClosingQuote
    } else {
      unitEndsWithClosingQuote = graphemeEndsWithClosingQuote
    }
    unitIsSingleKinsokuEnd = false
  }

  for (const gs of getSharedGraphemeSegmenter().segment(segText)) {
    const grapheme = gs.segment
    const graphemeContainsCJK = isCJK(grapheme)

    if (unitParts.length === 0) {
      startUnit(grapheme, gs.index, graphemeContainsCJK)
      continue
    }

    if (
      unitIsSingleKinsokuEnd ||
      kinsokuStart.has(grapheme) ||
      leftStickyPunctuation.has(grapheme) ||
      (engineProfile.carryCJKAfterClosingQuote &&
        graphemeContainsCJK &&
        unitEndsWithClosingQuote)
    ) {
      appendToUnit(grapheme, graphemeContainsCJK)
      continue
    }

    if (!unitContainsCJK && !graphemeContainsCJK) {
      appendToUnit(grapheme, graphemeContainsCJK)
      continue
    }

    pushUnit()
    startUnit(grapheme, gs.index, graphemeContainsCJK)
  }

  pushUnit()
  return units
}

function mergeKeepAllTextUnits(
  segText: string,
  units: MeasuredTextUnit[],
  breakAfterPunctuation: boolean,
): MeasuredTextUnit[] {
  if (units.length <= 1) return units

  const merged: MeasuredTextUnit[] = []
  let groupStart = -1
  let groupContainsCJK = false

  function pushMergedUnit(start: number, end: number): void {
    const sourceStart = units[start]!.start
    const sourceEnd = end < units.length ? units[end]!.start : segText.length
    merged.push({
      text: segText.slice(sourceStart, sourceEnd),
      start: sourceStart,
    })
  }

  function flushGroup(end: number): void {
    if (groupStart < 0) return

    if (groupContainsCJK) {
      if (groupStart + 1 === end) {
        merged.push(units[groupStart]!)
      } else {
        pushMergedUnit(groupStart, end)
      }
    } else {
      for (let i = groupStart; i < end; i++) merged.push(units[i]!)
    }

    groupStart = -1
    groupContainsCJK = false
  }

  for (let i = 0; i < units.length; i++) {
    const unit = units[i]!
    if (
      groupStart >= 0 &&
      !canContinueKeepAllTextRun(units[i - 1]!.text, breakAfterPunctuation)
    ) {
      flushGroup(i)
    }
    if (groupStart < 0) groupStart = i
    groupContainsCJK = groupContainsCJK || isCJK(unit.text)
  }

  flushGroup(units.length)
  return merged
}

// Distinct key lengths of a width map, longest first. Cached per map so the
// decomposition below stays cheap across the many lookups in one build.
const widthMapKeyLengths = new WeakMap<Map<string, number>, number[]>()

function getWidthMapKeyLengths(widthMap: Map<string, number>): number[] {
  let lengths = widthMapKeyLengths.get(widthMap)
  if (lengths === undefined) {
    const seen = new Set<number>()
    for (const key of widthMap.keys()) {
      if (key.length > 0) seen.add(key.length)
    }
    lengths = Array.from(seen).sort((a, b) => b - a)
    widthMapKeyLengths.set(widthMap, lengths)
  }
  return lengths
}

// Rebuild a merged segment's width by splitting it back into the measured
// pieces it was concatenated from.
//
// `analyzeText()` merges adjacent native segments (sentence-final punctuation,
// URL runs, numeric runs, no-space symbol chains, …), but the width map is
// keyed by the *pre-merge* segment text, so the merged text is never a key.
// Left unhandled that scored those segments as zero-width — a sentence-final
// `"dog."` cost 31px of line budget on Android — and the engine packed far too
// much onto each line.
//
// Longest-prefix decomposition reconstructs them: `"dog."` → `"dog"` + `"."`.
// Returns null when the text cannot be fully decomposed, so callers keep their
// existing approximation.
function decomposeWidth(text: string, widthMap: Map<string, number>): number | null {
  const lengths = getWidthMapKeyLengths(widthMap)
  if (lengths.length === 0) return null

  let total = 0
  let i = 0
  outer: while (i < text.length) {
    const remaining = text.length - i
    for (const len of lengths) {
      if (len > remaining) continue
      const w = widthMap.get(text.slice(i, i + len))
      if (w !== undefined) {
        total += w
        i += len
        continue outer
      }
    }
    return null
  }
  return total
}

// Look up width of a sub-segment from the pre-measured width map.
function lookupWidth(
  text: string,
  widthMap: Map<string, number>,
  parentText: string,
  parentWidth: number,
): number {
  const cached = widthMap.get(text)
  if (cached !== undefined) return cached

  const decomposed = decomposeWidth(text, widthMap)
  if (decomposed !== null) return decomposed

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

// Grapheme indices inside a breakable run where a line may start.
//
// When a run has to be split, RN/Android does not break at an arbitrary
// grapheme — it breaks at the separators. Measured against `onTextLayout` on a
// Pixel 9 Pro, `https://alpha-beta-gamma-delta.example.test/path?query=1&lang=en`
// at 192px wraps as:
//
//     See https://alpha-beta
//     -gamma-delta.example
//     .test/path?query=1&lang=
//     en for details.
//
// so the break lands *before* `-`, `.` and `/` (the separator opens the next
// line) and *after* `=`. Note line 1 could have fitted a trailing `-` and did
// not, which is what rules out breaking after a hyphen.
//
// Returned indices are line-start positions. Null when the text has no
// separator, which leaves ordinary long words breaking anywhere as before.
const BREAK_BEFORE_CHARS = new Set(['-', '\u2010', '\u2012', '\u2013', '\u2014', '.', '/'])
const BREAK_AFTER_CHARS = new Set(['='])

function getBreakablePreferredBreaks(text: string): number[] | null {
  // Scoped to URL-like runs — a path separator is the marker. This is the only
  // shape the behaviour was measured against, and widening it to every run
  // containing a dot or hyphen would also turn an O(1) "does this word fit"
  // decision into a grapheme walk for ordinary punctuated prose.
  if (!text.includes('/')) return null
  if (!/[-\u2010\u2012\u2013\u2014./=]/.test(text)) return null

  const breaks: number[] = []
  let index = 0
  let previousWasBreakAfter = false

  for (const gs of getSharedGraphemeSegmenter().segment(text)) {
    const g = gs.segment
    // A break at index 0 is not a break, it is the run's own start.
    if (index > 0 && (previousWasBreakAfter || BREAK_BEFORE_CHARS.has(g))) {
      if (breaks[breaks.length - 1] !== index) breaks.push(index)
    }
    previousWasBreakAfter = BREAK_AFTER_CHARS.has(g)
    index++
  }

  return breaks.length === 0 ? null : breaks
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

function buildFromAnalysis(
  analysis: TextAnalysis,
  widthMap: Map<string, number>,
  includeSegments: boolean,
  wordBreak: WordBreakMode,
  style: TextStyle | null,
): InternalPreparedText | InternalPreparedTextWithSegments {
  const engineProfile = getEngineProfile()

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
  const breakableFitAdvances: (number[] | null)[] = []
  const breakablePreferredBreaks: (number[] | null)[] = []
  const segments = includeSegments ? [] as string[] : null
  const preparedStartByAnalysisIndex = Array.from<number>({ length: analysis.len })

  function pushSegment(
    text: string,
    width: number,
    lineEndFitAdvance: number,
    lineEndPaintAdvance: number,
    kind: SegmentBreakKind,
    start: number,
    breakableFitAdvance: number[] | null,
    breakablePreferredBreak: number[] | null,
  ): void {
    if (kind !== 'text' && kind !== 'space' && kind !== 'zero-width-break') {
      simpleLineWalkFastPath = false
    }
    widths.push(width)
    lineEndFitAdvances.push(lineEndFitAdvance)
    lineEndPaintAdvances.push(lineEndPaintAdvance)
    kinds.push(kind)
    segStarts?.push(start)
    breakableFitAdvances.push(breakableFitAdvance)
    breakablePreferredBreaks.push(breakablePreferredBreak)
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
      const fitAdvances = getGraphemeWidthsFromMap(text, width, widthMap)
      const preferredBreaks = wordBreak === 'keep-all' ? null : getBreakablePreferredBreaks(text)
      pushSegment(
        text,
        width,
        lineEndFitAdvance,
        lineEndPaintAdvance,
        kind,
        start,
        fitAdvances,
        preferredBreaks,
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

    const containsCJK = isCJK(segText)

    if (segKind === 'text' && containsCJK) {
      // segText may be a merged analysis segment (e.g. "景象。"), which is never
      // a width-map key — the map holds the pre-merge native segments. Fall back
      // to decomposition, or every CJK unit below inherits a zero-width parent.
      const parentWidth = widthMap.get(segText) ?? decomposeWidth(segText, widthMap) ?? 0
      const baseUnits = buildBaseCjkUnits(segText, engineProfile)
      const measuredUnits = wordBreak === 'keep-all'
        ? mergeKeepAllTextUnits(segText, baseUnits, engineProfile.breakKeepAllAfterPunctuation ?? true)
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
    breakableFitAdvances,
    breakablePreferredBreaks,
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

export function buildPreparedText(
  analysis: TextAnalysis,
  widthMap: Map<string, number>,
  style: TextStyle,
  options?: PrepareOptions,
): PreparedText {
  const wordBreak = options?.wordBreak ?? 'normal'
  return buildFromAnalysis(analysis, widthMap, false, wordBreak, style) as PreparedText
}

export function buildPreparedTextWithSegments(
  analysis: TextAnalysis,
  widthMap: Map<string, number>,
  style: TextStyle,
  options?: PrepareOptions,
): PublicPreparedTextWithSegments {
  const wordBreak = options?.wordBreak ?? 'normal'
  return buildFromAnalysis(analysis, widthMap, true, wordBreak, style) as unknown as PublicPreparedTextWithSegments
}
