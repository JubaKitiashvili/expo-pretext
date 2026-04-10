// src/web-backend.ts
// Canvas + Intl.Segmenter measurement backend for Expo Web.
// Implements the same interface as the native iOS/Android module.

import type { FontDescriptor, NativeSegmentResult } from './types'
import { getFontKey } from './font-utils'

type MeasureNativeOptions = {
  whiteSpace?: string
  locale?: string
}

export interface WebBackendModule {
  segmentAndMeasure(text: string, font: FontDescriptor, options?: MeasureNativeOptions): NativeSegmentResult
  batchSegmentAndMeasure(texts: string[], font: FontDescriptor, options?: MeasureNativeOptions): NativeSegmentResult[]
  measureGraphemeWidths(segment: string, font: FontDescriptor): number[]
  remeasureMerged(segments: string[], font: FontDescriptor): number[]
  segmentAndMeasureAsync(text: string, font: FontDescriptor, options?: MeasureNativeOptions): Promise<NativeSegmentResult>
  measureTextHeight(text: string, font: FontDescriptor, maxWidth: number, lineHeight: number): { height: number; lineCount: number }
  clearNativeCache(): void
  setNativeCacheSize(size: number): void
  getFontMetrics(font: FontDescriptor): { ascender: number; descender: number; xHeight: number; capHeight: number; lineGap: number }
}

// ─── Canvas Context (lazy singleton) ─────────────────────
let measureCtx: CanvasRenderingContext2D | null | undefined = undefined

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      measureCtx = new OffscreenCanvas(1, 1).getContext('2d')
      return measureCtx
    }
  } catch {}
  try {
    if (typeof document !== 'undefined') {
      measureCtx = document.createElement('canvas').getContext('2d')
      return measureCtx
    }
  } catch {}
  measureCtx = null
  return null
}

// ─── Font Application ────────────────────────────────────
let lastFontString = ''

function applyFont(ctx: CanvasRenderingContext2D, font: FontDescriptor): void {
  const weight = font.fontWeight ?? '400'
  const style = font.fontStyle === 'italic' ? 'italic' : 'normal'
  const fontString = `${style} ${weight} ${font.fontSize}px "${font.fontFamily}"`
  if (fontString !== lastFontString) {
    ctx.font = fontString
    lastFontString = fontString
  }
}

// ─── Segmentation (Intl.Segmenter) ──────────────────────
const wordSegmenterCache = new Map<string, Intl.Segmenter>()
let graphemeSegmenter: Intl.Segmenter | null = null

function getWordSegmenter(locale?: string): Intl.Segmenter {
  const key = locale ?? ''
  let seg = wordSegmenterCache.get(key)
  if (!seg) {
    seg = new Intl.Segmenter(locale || undefined, { granularity: 'word' })
    wordSegmenterCache.set(key, seg)
  }
  return seg
}

function getGraphemeSegmenter(): Intl.Segmenter {
  if (!graphemeSegmenter) {
    graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  }
  return graphemeSegmenter
}

function segmentText(text: string, locale?: string): { segments: string[]; isWordLike: boolean[] } {
  const segmenter = getWordSegmenter(locale)
  const segments: string[] = []
  const isWordLike: boolean[] = []
  for (const { segment, isWordLike: wl } of segmenter.segment(text)) {
    segments.push(segment)
    isWordLike.push(wl ?? false)
  }
  return { segments, isWordLike }
}

// ─── Width Measurement + LRU Cache ──────────────────────
const WEB_CACHE_DEFAULT = 5000
let webCacheMaxSize = WEB_CACHE_DEFAULT
const webCache = new Map<string, number>()

function measureWidth(ctx: CanvasRenderingContext2D, text: string): number {
  return ctx.measureText(text).width
}

function getCachedOrMeasure(ctx: CanvasRenderingContext2D, font: FontDescriptor, segment: string): number {
  const key = getFontKey({
    fontFamily: font.fontFamily,
    fontSize: font.fontSize,
    fontWeight: font.fontWeight,
    fontStyle: font.fontStyle,
  }) + '|' + segment
  const cached = webCache.get(key)
  if (cached !== undefined) {
    webCache.delete(key)
    webCache.set(key, cached)
    return cached
  }
  const width = measureWidth(ctx, segment)
  if (webCache.size >= webCacheMaxSize) {
    const oldest = webCache.keys().next().value!
    webCache.delete(oldest)
  }
  webCache.set(key, width)
  return width
}

// ─── Public: createWebBackend ────────────────────────────
export function createWebBackend(): WebBackendModule {
  function doSegmentAndMeasure(text: string, font: FontDescriptor, options?: MeasureNativeOptions): NativeSegmentResult {
    if (!text) return { segments: [], isWordLike: [], widths: [] }
    const ctx = getMeasureContext()
    if (!ctx) throw new Error('[expo-pretext] No canvas available for web measurement')
    applyFont(ctx, font)
    const { segments, isWordLike } = segmentText(text, options?.locale)
    const widths = segments.map(seg => getCachedOrMeasure(ctx, font, seg))
    return { segments, isWordLike, widths }
  }

  return {
    segmentAndMeasure: doSegmentAndMeasure,

    batchSegmentAndMeasure(texts, font, options?) {
      return texts.map(text => doSegmentAndMeasure(text, font, options))
    },

    measureGraphemeWidths(segment, font) {
      const ctx = getMeasureContext()
      if (!ctx) return [segment.length * font.fontSize * 0.55]
      applyFont(ctx, font)
      const seg = getGraphemeSegmenter()
      return Array.from(seg.segment(segment), ({ segment: g }) => measureWidth(ctx, g))
    },

    remeasureMerged(segments, font) {
      const ctx = getMeasureContext()
      if (!ctx) return segments.map(s => s.length * font.fontSize * 0.55)
      applyFont(ctx, font)
      return segments.map(seg => measureWidth(ctx, seg))
    },

    measureTextHeight(_text, _font, _maxWidth, _lineHeight) {
      throw new Error('[expo-pretext] measureTextHeight not available on web')
    },

    segmentAndMeasureAsync(text, font, options?) {
      return Promise.resolve(doSegmentAndMeasure(text, font, options))
    },

    clearNativeCache() {
      webCache.clear()
      lastFontString = ''
    },

    setNativeCacheSize(size) {
      webCacheMaxSize = size
    },

    getFontMetrics(font) {
      const ctx = getMeasureContext()
      if (!ctx) {
        // Rough estimates based on fontSize
        return {
          ascender: font.fontSize * 0.8,
          descender: font.fontSize * -0.2,
          xHeight: font.fontSize * 0.52,
          capHeight: font.fontSize * 0.72,
          lineGap: 0,
        }
      }
      applyFont(ctx, font)
      const metrics = ctx.measureText('x')
      return {
        ascender: metrics.fontBoundingBoxAscent ?? font.fontSize * 0.8,
        descender: -(metrics.fontBoundingBoxDescent ?? font.fontSize * 0.2),
        xHeight: metrics.actualBoundingBoxAscent ?? font.fontSize * 0.52,
        capHeight: font.fontSize * 0.72, // Canvas doesn't expose cap-height
        lineGap: 0,
      }
    },
  }
}
