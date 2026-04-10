// src/font-utils.ts
import type { TextStyle, FontDescriptor } from './types'
import { getNativeModule } from './ExpoPretext'

export function textStyleToFontDescriptor(style: TextStyle): FontDescriptor {
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
  }
}

export function getFontKey(style: TextStyle): string {
  const weight = style.fontWeight ?? '400'
  const fStyle = style.fontStyle ?? 'normal'
  return `${style.fontFamily}_${style.fontSize}_${weight}_${fStyle}`
}

export function getLineHeight(style: TextStyle): number {
  return style.lineHeight ?? style.fontSize * 1.2
}

const SYSTEM_FONTS = [
  'System', 'system', 'sans-serif', 'serif', 'monospace',
  // iOS built-in fonts
  'Helvetica', 'Helvetica Neue', 'Arial', 'Courier', 'Courier New',
  'Georgia', 'Times New Roman', 'Trebuchet MS', 'Verdana',
  'American Typewriter', 'Avenir', 'Avenir Next', 'Baskerville',
  'Didot', 'Futura', 'Gill Sans', 'Menlo', 'Optima', 'Palatino',
]

export function isFontLoaded(fontFamily: string): boolean {
  // System fonts are always available
  if (SYSTEM_FONTS.includes(fontFamily)) return true
  try {
    const Font = require('expo-font')
    return Font.isLoaded(fontFamily)
  } catch {
    return true
  }
}

export function warnIfFontNotLoaded(style: TextStyle): void {
  if (__DEV__ && !isFontLoaded(style.fontFamily)) {
    console.warn(
      `[expo-pretext] Font "${style.fontFamily}" not loaded. ` +
      `Heights will be inaccurate. Use Font.loadAsync() first.`
    )
  }
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
