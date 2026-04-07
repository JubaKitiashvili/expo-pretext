import { getNativeModule } from './ExpoPretext'
import { analyzeText, type AnalysisProfile } from './analysis'
import {
  buildPreparedText,
  buildPreparedTextWithSegments,
  layout,
  type PrepareOptions as LayoutPrepareOptions,
} from './layout'
import { cacheNativeResult, tryResolveAllFromCache, clearJSCache } from './cache'
import { textStyleToFontDescriptor, getFontKey, getLineHeight, warnIfFontNotLoaded } from './font-utils'
import { getEngineProfile } from './engine-profile'
import type {
  TextStyle,
  PreparedText,
  PreparedTextWithSegments,
  PrepareOptions,
  NativeSegmentResult,
  LayoutResult,
} from './types'

const SYNC_THRESHOLD = 5000

// --- Analysis profile bridge ---

function getAnalysisProfile(): AnalysisProfile {
  const engine = getEngineProfile()
  return { carryCJKAfterClosingQuote: engine.carryCJKAfterClosingQuote }
}

// --- Auto-batch scheduler ---

type PendingItem = {
  text: string
  style: TextStyle
  options?: PrepareOptions
  resolve: (result: NativeSegmentResult) => void
  reject: (error: Error) => void
}

let pendingItems: PendingItem[] = []
let flushScheduled = false

function scheduleFlush(): void {
  if (flushScheduled) return
  flushScheduled = true
  queueMicrotask(flushPending)
}

function flushPending(): void {
  flushScheduled = false
  const items = pendingItems
  pendingItems = []
  if (items.length === 0) return

  const native = getNativeModule()
  if (!native) {
    for (const item of items) {
      item.resolve(estimateSegments(item.text, item.style))
    }
    return
  }

  // Group by font key for efficient batching
  const groups = new Map<string, PendingItem[]>()
  for (const item of items) {
    const key = getFontKey(item.style)
    let group = groups.get(key)
    if (!group) {
      group = []
      groups.set(key, group)
    }
    group.push(item)
  }

  for (const [, group] of groups) {
    const font = textStyleToFontDescriptor(group[0]!.style)
    const opts = group[0]!.options
    const nativeOpts = opts
      ? { whiteSpace: opts.whiteSpace, locale: opts.locale }
      : undefined

    try {
      const results = native.batchSegmentAndMeasure(
        group.map(g => g.text),
        font,
        nativeOpts
      )
      const fontKey = getFontKey(group[0]!.style)
      for (let i = 0; i < group.length; i++) {
        const result = results[i]!
        cacheNativeResult(fontKey, result.segments, result.widths)
        group[i]!.resolve(result)
      }
    } catch (err) {
      for (const item of group) {
        item.reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
  }
}

// --- Native call with cache check ---

function segmentAndMeasureWithCache(
  text: string,
  style: TextStyle,
  options?: PrepareOptions
): NativeSegmentResult {
  const native = getNativeModule()
  if (!native) {
    return estimateSegments(text, style)
  }

  const font = textStyleToFontDescriptor(style)
  const nativeOptions = options
    ? { whiteSpace: options.whiteSpace, locale: options.locale }
    : undefined

  const result = text.length > SYNC_THRESHOLD
    ? native.segmentAndMeasure(text, font, nativeOptions)
    : native.segmentAndMeasure(text, font, nativeOptions)

  const fontKey = getFontKey(style)
  cacheNativeResult(fontKey, result.segments, result.widths)

  // Exact mode: re-measure merged segments after analysis
  if (options?.accuracy === 'exact') {
    const profile = getAnalysisProfile()
    const analysis = analyzeText(
      result.segments,
      result.isWordLike,
      profile,
      options?.whiteSpace,
    )
    const mergedWidths = native.remeasureMerged(analysis.texts, font)
    return {
      segments: analysis.texts,
      isWordLike: analysis.isWordLike,
      widths: mergedWidths,
    }
  }

  return result
}

// --- Fallback estimate when native is unavailable ---

function estimateSegments(text: string, style: TextStyle): NativeSegmentResult {
  const words = text.split(/(\s+)/)
  const charWidth = style.fontSize * 0.55
  return {
    segments: words,
    isWordLike: words.map(w => !/^\s+$/.test(w)),
    widths: words.map(w => w.length * charWidth),
  }
}

// --- Build width map from native result ---

function buildWidthMap(result: NativeSegmentResult): Map<string, number> {
  const map = new Map<string, number>()
  for (let i = 0; i < result.segments.length; i++) {
    map.set(result.segments[i]!, result.widths[i]!)
  }
  return map
}

// --- Bridge PrepareOptions (types.ts) to LayoutPrepareOptions (layout.ts) ---

function toLayoutOptions(options?: PrepareOptions): LayoutPrepareOptions | undefined {
  if (!options) return undefined
  return { whiteSpace: options.whiteSpace }
}

// --- Public API ---

export function prepare(
  text: string,
  style: TextStyle,
  options?: PrepareOptions
): PreparedText {
  warnIfFontNotLoaded(style)
  if (!text) {
    const profile = getAnalysisProfile()
    const analysis = analyzeText([], [], profile, options?.whiteSpace)
    return buildPreparedText(analysis, new Map(), style, toLayoutOptions(options))
  }
  const result = segmentAndMeasureWithCache(text, style, options)
  const profile = getAnalysisProfile()
  const analysis = analyzeText(
    result.segments,
    result.isWordLike,
    profile,
    options?.whiteSpace,
  )
  const widthMap = buildWidthMap(result)
  return buildPreparedText(analysis, widthMap, style, toLayoutOptions(options))
}

export function prepareWithSegments(
  text: string,
  style: TextStyle,
  options?: PrepareOptions
): PreparedTextWithSegments {
  warnIfFontNotLoaded(style)
  if (!text) {
    const profile = getAnalysisProfile()
    const analysis = analyzeText([], [], profile, options?.whiteSpace)
    return buildPreparedTextWithSegments(analysis, new Map(), style, toLayoutOptions(options))
  }
  const result = segmentAndMeasureWithCache(text, style, options)
  const profile = getAnalysisProfile()
  const analysis = analyzeText(
    result.segments,
    result.isWordLike,
    profile,
    options?.whiteSpace,
  )
  const widthMap = buildWidthMap(result)
  return buildPreparedTextWithSegments(analysis, widthMap, style, toLayoutOptions(options))
}

export function measureHeights(
  texts: string[],
  style: TextStyle,
  maxWidth: number
): number[] {
  const native = getNativeModule()
  if (!native) {
    return texts.map(t => {
      const p = prepare(t, style)
      return layout(p, maxWidth).height
    })
  }

  // Primary: TextKit for pixel-perfect height
  const font = textStyleToFontDescriptor(style)
  const lh = getLineHeight(style)
  return texts.map(text => {
    try {
      return native.measureTextHeight(text, font, maxWidth, lh).height
    } catch {
      // Fallback to segment-based
      const p = prepare(text, style)
      return layout(p, maxWidth).height
    }
  })
}

export { clearJSCache }
