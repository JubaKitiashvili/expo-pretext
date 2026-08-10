// src/web-backend.ts
// Canvas + Intl.Segmenter measurement backend for Expo Web.
// Implements the same interface as the native iOS/Android module.

import type { FontDescriptor, InkBounds, NativeSegmentResult, TextStyle } from './types'
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
  measureInkWidth(text: string, font: FontDescriptor): number
  measureInkBounds(text: string, font: FontDescriptor): InkBounds
  getFontMetrics(font: FontDescriptor): { ascender: number; descender: number; xHeight: number; capHeight: number; lineGap: number }
}

// ─── Canvas Context (lazy singleton) ─────────────────────
type MeasureContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

let measureCtx: MeasureContext | null | undefined = undefined

function getMeasureContext(): MeasureContext | null {
  if (measureCtx !== undefined) return measureCtx
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      measureCtx = new OffscreenCanvas(1, 1).getContext('2d') as MeasureContext | null
      return measureCtx
    }
  } catch {}
  try {
    if (typeof document !== 'undefined') {
      measureCtx = document.createElement('canvas').getContext('2d') as MeasureContext | null
      return measureCtx
    }
  } catch {}
  measureCtx = null
  return null
}

// ─── Font Application ────────────────────────────────────
let lastFontString = ''

// What react-native-web resolves `fontFamily: 'System'` to.
const WEB_SYSTEM_FONT_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

const WEB_GENERIC_FONT_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
])

// Render a family name into the `font` shorthand.
//
// A concrete family has to be quoted or a name containing spaces is parsed as
// several families. A CSS keyword must NOT be quoted — `"sans-serif"` is a
// request for a font literally named "sans-serif", which does not exist, so the
// browser silently falls back and every measurement is taken in the wrong font.
// The same applies to a comma-separated stack and to RN's `'System'`, which is
// not a real family at all.
function canvasFontFamily(family: string | undefined | null): string {
  if (family == null) return WEB_SYSTEM_FONT_STACK

  const trimmed = family.trim()
  if (trimmed === '') return WEB_SYSTEM_FONT_STACK
  if (trimmed === 'System' || trimmed === 'system') return WEB_SYSTEM_FONT_STACK
  if (trimmed.includes(',')) return trimmed
  if (WEB_GENERIC_FONT_FAMILIES.has(trimmed.toLowerCase())) return trimmed

  return `"${trimmed}"`
}

function applyFont(ctx: MeasureContext, font: FontDescriptor): void {
  const weight = font.fontWeight ?? '400'
  const style = font.fontStyle === 'italic' ? 'italic' : 'normal'
  const fontString = `${style} ${weight} ${font.fontSize}px ${canvasFontFamily(font.fontFamily)}`
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
const webInkCache = new Map<string, InkBounds>()

function measureWidth(ctx: MeasureContext, text: string): number {
  return ctx.measureText(text).width
}

function getCachedOrMeasure(ctx: MeasureContext, font: FontDescriptor, segment: string): number {
  const key = getFontKey({
    fontFamily: font.fontFamily,
    fontSize: font.fontSize,
    fontWeight: font.fontWeight as TextStyle['fontWeight'],
    fontStyle: font.fontStyle as TextStyle['fontStyle'],
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

    measureInkBounds(text: string, font: FontDescriptor): InkBounds {
      if (!text) {
        return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
      }
      const ctx = getMeasureContext()
      if (!ctx) {
        const italic = font.fontStyle === 'italic'
        const left = italic ? -font.fontSize * 0.12 : 0
        const right = text.length * font.fontSize * 0.55 * (italic ? 1.08 : 1)
        const top = -font.fontSize * 0.8
        const bottom = font.fontSize * 0.2
        return {
          left,
          top,
          right,
          bottom,
          width: right - left,
          height: bottom - top,
        }
      }
      applyFont(ctx, font)
      const fontString = ctx.font
      const key = fontString + '|ink|' + text
      const hit = webInkCache.get(key)
      if (hit !== undefined) return hit

      const metrics = ctx.measureText(text)
      const left = metrics.actualBoundingBoxLeft ?? 0
      const right = metrics.actualBoundingBoxRight ?? metrics.width
      const ascent = metrics.actualBoundingBoxAscent ?? metrics.fontBoundingBoxAscent ?? font.fontSize * 0.8
      const descent = metrics.actualBoundingBoxDescent ?? metrics.fontBoundingBoxDescent ?? font.fontSize * 0.2
      const bounds = {
        left: -left,
        top: -ascent,
        right: right,
        bottom: descent,
        width: Math.ceil(left + right) + 1,
        height: Math.ceil(ascent + descent) + 1,
      }

      if (webInkCache.size >= webCacheMaxSize) {
        const firstKey = webInkCache.keys().next().value
        if (firstKey !== undefined) webInkCache.delete(firstKey)
      }
      webInkCache.set(key, bounds)
      return bounds
    },

    measureInkWidth(text: string, font: FontDescriptor): number {
      if (!text) return 0
      return this.measureInkBounds(text, font).width
    },

    clearNativeCache() {
      webCache.clear()
      webInkCache.clear()
      // getMeasureContext() memoises a null result too, so a backend created
      // before a canvas existed — SSR, or a hydration pass that runs ahead of
      // the DOM — would keep estimating forever. Dropping the memo lets the
      // next call look again.
      measureCtx = undefined
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
