// src/ink-safe.ts
// Pure function to compute italic-safe padding for Text elements.
// No React dependency — usable in FlashList callbacks, loops, non-React code.

import type { TextStyle, InkBounds, InkSafeResult, InkSafePadding } from './types'
import { getNativeModule } from './ExpoPretext'
import { textStyleToFontDescriptor, getFontMetrics } from './font-utils'
import { measureInkBounds } from './ink-width'
import { Platform } from 'react-native'

const ZERO_PADDING: InkSafePadding = {
  paddingLeft: 0,
  paddingRight: 0,
  paddingTop: 0,
  paddingBottom: 0,
}

const ZERO_RESULT: InkSafeResult = {
  padding: ZERO_PADDING,
  inkWidth: 0,
  advance: 0,
  inkBounds: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
  isOvershooting: false,
}

/**
 * Compute italic-safe padding for a text string.
 *
 * Returns padding values to apply to a `<Text>` element so italic/bold
 * glyphs don't get clipped at container boundaries.
 *
 * Fast path: non-italic text returns zero padding with no native calls.
 *
 * @param text - The text string to measure
 * @param style - TextStyle with fontFamily, fontSize, fontWeight, fontStyle
 * @returns Padding, ink width, advance width, ink bounds, and overshoot flag
 *
 * @example
 * ```ts
 * const { padding } = getInkSafePadding('fly', {
 *   fontFamily: 'Georgia', fontSize: 80, fontWeight: 'bold', fontStyle: 'italic',
 * })
 * // padding = { paddingLeft: 2.1, paddingRight: 5.3, paddingTop: 0, paddingBottom: 0 }
 * ```
 */
export function getInkSafePadding(text: string, style: TextStyle): InkSafeResult {
  if (!text) return ZERO_RESULT

  // Fast path: non-italic text almost never overshoots.
  // Also check if the font family name contains "italic" (case-insensitive)
  // to catch custom fonts like "PlayfairDisplay-BoldItalic" where italic is
  // baked into the font file, not the fontStyle property.
  const familyNames = typeof style.fontFamily === 'string'
    ? [style.fontFamily]
    : style.fontFamily
  const isItalic = style.fontStyle === 'italic' ||
    familyNames.some((name) => /italic|oblique/i.test(name))

  if (!isItalic) {
    const advance = estimateAdvance(text, style)
    return {
      padding: ZERO_PADDING,
      inkWidth: advance,
      advance,
      inkBounds: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
      isOvershooting: false,
    }
  }

  const native = getNativeModule()
  const font = textStyleToFontDescriptor(style)

  // Best path: single native call
  if (native && typeof native.measureInkSafe === 'function') {
    try {
      const r = native.measureInkSafe(text, font)
      return computePadding(
        { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
        r.advance,
        r.ascender,
        Math.abs(r.descender),
      )
    } catch {}
  }

  // Fallback: existing separate calls
  const inkBounds = measureInkBounds(text, style)
  const metrics = getFontMetrics(style)
  const advance = inkBounds.width > 0
    ? Math.max(inkBounds.right, inkBounds.width - Math.max(0, -inkBounds.left))
    : estimateAdvance(text, style)

  return computePadding(
    inkBounds,
    advance,
    Math.max(0, metrics.ascender),
    Math.max(0, Math.abs(metrics.descender)),
  )
}

// iOS raster scanning can underestimate ink bounds by up to 1pt due to
// anti-aliasing at the glyph edge. Add a small safety inset on iOS.
const IOS_SAFETY_INSET = Platform.OS === 'ios' ? 1 : 0

function computePadding(
  inkBounds: InkBounds,
  advance: number,
  ascender: number,
  descender: number,
): InkSafeResult {
  const paddingLeft = Math.max(0, Math.ceil(-inkBounds.left)) + IOS_SAFETY_INSET
  const inkRightExtent = Math.max(advance, inkBounds.right)
  const paddingRight = Math.max(0, Math.ceil(inkRightExtent - advance)) + IOS_SAFETY_INSET
  const paddingTop = Math.max(0, Math.ceil(-inkBounds.top - ascender))
  const paddingBottom = Math.max(0, Math.ceil(inkBounds.bottom - descender)) + IOS_SAFETY_INSET
  const inkWidth = Math.max(0, Math.ceil(advance + paddingLeft + paddingRight))

  const isOvershooting = paddingLeft > 0 || paddingRight > 0 || paddingTop > 0 || paddingBottom > 0

  return {
    padding: { paddingLeft, paddingRight, paddingTop, paddingBottom },
    inkWidth,
    advance,
    inkBounds,
    isOvershooting,
  }
}

function estimateAdvance(text: string, style: TextStyle): number {
  return text.length * style.fontSize * 0.55
}
