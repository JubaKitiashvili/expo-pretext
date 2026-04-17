// src/font-utils.ts
import type { TextStyle, FontDescriptor } from './types'
import { getNativeModule } from './ExpoPretext'

/**
 * Pick the first available font from a name or fallback chain.
 *
 * Accepts a single name or an array. System fonts (see `SYSTEM_FONTS`)
 * are always considered available; custom fonts are checked via
 * `expo-font`'s `isLoaded`. If none of the candidates is loaded, falls
 * back to the last entry so that downstream native measurement still
 * gets a concrete string (RN's text renderer does the same).
 *
 * @example
 * ```ts
 * resolveFontFamily('Inter')                     // → 'Inter'
 * resolveFontFamily(['Inter', 'System'])         // → 'Inter' if loaded, else 'System'
 * resolveFontFamily(['NotLoaded1', 'NotLoaded2']) // → 'NotLoaded2' (last entry)
 * ```
 */
export function resolveFontFamily(family: string | string[]): string {
  if (typeof family === 'string') return family
  if (family.length === 0) return 'System'
  for (const name of family) {
    if (isFontLoaded(name)) return name
  }
  return family[family.length - 1]!
}

export function textStyleToFontDescriptor(style: TextStyle): FontDescriptor {
  return {
    fontFamily: resolveFontFamily(style.fontFamily),
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    letterSpacing: style.letterSpacing,
  }
}

export function getFontKey(style: TextStyle): string {
  const weight = style.fontWeight ?? '400'
  const fStyle = style.fontStyle ?? 'normal'
  const family = resolveFontFamily(style.fontFamily)
  const ls = style.letterSpacing ?? 0
  return `${family}_${style.fontSize}_${weight}_${fStyle}_${ls}`
}

export function getLineHeight(style: TextStyle): number {
  return style.lineHeight ?? style.fontSize * 1.2
}

/**
 * Count code points in a string (surrogate-pair safe).
 * Used to distribute `letterSpacing` across a segment's glyphs.
 */
export function codePointCount(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1)
      if (next >= 0xDC00 && next <= 0xDFFF) i++
    }
    n++
  }
  return n
}

/**
 * Adjust raw segment widths for `letterSpacing`.
 *
 * Mutates `widths` in place, adding `letterSpacing × codePointCount(segment)`
 * to each segment. RN adds `letterSpacing` after every glyph — including
 * the last one on a line (visible as trailing space), so we distribute it
 * across all code points uniformly. The line-breaking engine tolerates
 * the trailing-letterSpacing overhang via `lineFitEpsilon`.
 *
 * No-op when `letterSpacing` is 0 or undefined — the common case.
 */
export function applyLetterSpacingInPlace(
  widths: number[],
  segments: string[],
  letterSpacing: number | undefined,
): void {
  if (!letterSpacing) return
  for (let i = 0; i < widths.length; i++) {
    widths[i]! += letterSpacing * codePointCount(segments[i]!)
  }
}

const SYSTEM_FONTS = [
  'System', 'system', 'sans-serif', 'serif', 'monospace',
  // iOS built-in fonts
  'Helvetica', 'Helvetica Neue', 'Arial', 'Courier', 'Courier New',
  'Georgia', 'Times New Roman', 'Trebuchet MS', 'Verdana',
  'American Typewriter', 'Avenir', 'Avenir Next', 'Baskerville',
  'Didot', 'Futura', 'Gill Sans', 'Menlo', 'Optima', 'Palatino',
]

/**
 * Check whether a font name is loaded (or a built-in system font).
 *
 * Queries `expo-font`'s registry when available; otherwise conservatively
 * returns `true` so non-expo apps don't spam warnings.
 */
export function isFontLoaded(fontFamily: string): boolean {
  if (SYSTEM_FONTS.includes(fontFamily)) return true
  try {
    const Font = require('expo-font')
    return Font.isLoaded(fontFamily)
  } catch {
    return true
  }
}

/**
 * Public alias of `isFontLoaded` — useful at app-startup boundaries.
 *
 * Accepts a single name or a fallback chain. For a chain, returns `true`
 * if **any** candidate is loaded.
 *
 * @example
 * ```ts
 * if (!validateFont(['Inter', 'System'])) {
 *   console.warn('No usable font — waiting for font load')
 * }
 * ```
 */
export function validateFont(family: string | string[]): boolean {
  if (typeof family === 'string') return isFontLoaded(family)
  for (const name of family) {
    if (isFontLoaded(name)) return true
  }
  return false
}

export function warnIfFontNotLoaded(style: TextStyle): void {
  if (!__DEV__) return
  const family = style.fontFamily
  if (typeof family === 'string') {
    if (!isFontLoaded(family)) {
      console.warn(
        `[expo-pretext] Font "${family}" not loaded. ` +
        `Heights will be inaccurate. Use Font.loadAsync() first.`
      )
    }
    return
  }
  // Chain: warn only if every candidate is missing.
  for (const name of family) {
    if (isFontLoaded(name)) return
  }
  console.warn(
    `[expo-pretext] None of the fallback fonts [${family.map((n) => `"${n}"`).join(', ')}] ` +
    `are loaded. Heights will be inaccurate. Use Font.loadAsync() first.`
  )
}

/**
 * Font metrics from the native text engine.
 */
export type FontMetrics = {
  /** Distance from baseline to top of tallest ascender (positive) */
  ascender: number
  /** Distance from baseline to bottom of lowest descender (negative) */
  descender: number
  /** Height of lowercase 'x' character */
  xHeight: number
  /** Height of uppercase capital letters */
  capHeight: number
  /** Extra leading between lines (often 0) */
  lineGap: number
}

/**
 * Get font metrics (ascender, descender, x-height, cap-height) from the native text engine.
 *
 * Returns metrics for the exact font as rendered by iOS TextKit / Android TextPaint.
 * Useful for precise baseline alignment, vertical centering, and custom text decoration.
 *
 * @param style - Text style to get metrics for
 * @returns Native font metrics, or estimates if native module unavailable
 *
 * @example
 * ```ts
 * import { getFontMetrics } from 'expo-pretext'
 *
 * const metrics = getFontMetrics({ fontFamily: 'Inter', fontSize: 16 })
 * console.log(metrics.ascender)  // ~12.8 (positive, above baseline)
 * console.log(metrics.descender) // ~-3.2 (negative, below baseline)
 * console.log(metrics.capHeight) // ~11.5 (height of 'H')
 * ```
 *
 * @example
 * ```tsx
 * // Vertically center an icon with text baseline
 * const metrics = getFontMetrics(style)
 * const iconOffset = metrics.ascender - metrics.capHeight / 2 - iconSize / 2
 * ```
 */
export function getFontMetrics(style: TextStyle): FontMetrics {
  const native = getNativeModule()
  if (native) {
    try {
      const font = textStyleToFontDescriptor(style)
      return native.getFontMetrics(font)
    } catch {}
  }
  // Fallback estimates
  return {
    ascender: style.fontSize * 0.8,
    descender: style.fontSize * -0.2,
    xHeight: style.fontSize * 0.52,
    capHeight: style.fontSize * 0.72,
    lineGap: 0,
  }
}
