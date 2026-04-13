// src/hooks/useInkSafeStyle.ts
// React hook that returns a merged style with ink-safe padding.
// Memoized by individual style properties (not object reference).

import { useMemo } from 'react'
import { getInkSafePadding } from '../ink-safe'
import type { TextStyle, InkBounds } from '../types'

type InkSafeStyleResult = {
  /** Base style merged with ink-safe padding — apply directly to <Text> */
  style: TextStyle & { paddingLeft: number; paddingRight: number; paddingTop: number; paddingBottom: number }
  /** Total width including ink overshoot */
  inkWidth: number
  /** True if text overshoots advance width */
  isOvershooting: boolean
  /** Raw ink bounds (for advanced use) */
  inkBounds: InkBounds
}

/**
 * Returns a merged text style with ink-safe padding.
 *
 * Use this when you need the ink width for container sizing.
 * For simple drop-in usage, prefer `<InkSafeText>` instead.
 *
 * @param text - The text string to measure
 * @param style - TextStyle to augment with padding
 * @returns Merged style, ink width, overshoot flag, and ink bounds
 *
 * @example
 * ```tsx
 * const { style: safeStyle, inkWidth } = useInkSafeStyle('fly', baseStyle)
 *
 * <View style={{ width: inkWidth, overflow: 'hidden' }}>
 *   <Text style={safeStyle} numberOfLines={1}>fly</Text>
 * </View>
 * ```
 */
export function useInkSafeStyle(text: string, style: TextStyle): InkSafeStyleResult {
  // Memoize only the padding computation on font properties that affect measurement.
  // The full style is spread fresh each call so non-font props (color, lineHeight, etc.)
  // are never stale.
  const result = useMemo(
    () => getInkSafePadding(text, style),
    [text, style.fontFamily, style.fontSize, style.fontWeight, style.fontStyle],
  )

  return {
    style: { ...style, ...result.padding },
    inkWidth: result.inkWidth,
    isOvershooting: result.isOvershooting,
    inkBounds: result.inkBounds,
  }
}
