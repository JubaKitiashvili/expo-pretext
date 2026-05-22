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

// Look up width of a sub-segment from the pre-measured width map.
function lookupWidth(
  text: string,
  widthMap: Map<string, number>,
  parentText: string,
  parentWidth: number,
): number {
  const cached = widthMap.get(text)
  if (cached !== undefined) return cached

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

function isPreferredBreakGrapheme(grapheme: string): boolean {
  return (
    grapheme === '-' ||
    grapheme === '\u058A' ||
    grapheme === '\u2010' ||
    grapheme === '\u2012' ||
    grapheme === '\u2013' ||
    grapheme === '\u2014'
  )
}

function getBreakablePreferredBreaks(text: string): number[] | null {
  if (!/[-\u058A\u2010\u2012\u2013\u2014]/u.test(text)) return null

  const breaks: number[] = []
  let graphemeIndex = 0
  for (const gs of getSharedGraphemeSegmenter().segment(text)) {
    graphemeIndex++
    if (isPreferredBreakGrapheme(gs.segment)) breaks.push(graphemeIndex)
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
      const parentWidth = widthMap.get(segText) ?? 0
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
