// src/components/InkSafeText.tsx
// Drop-in <Text> replacement with automatic italic-safe padding.
// No wrapper View — just <Text> with computed padding.
// Non-italic text renders identically to plain <Text> (zero overhead).

import React, { useMemo } from 'react'
import { Text, type TextProps } from 'react-native'
import { getInkSafePadding } from '../ink-safe'
import { resolveFontFamily } from '../font-utils'
import type { TextStyle } from '../types'

export type InkSafeTextProps = Omit<TextProps, 'style'> & {
  /** Text style — must include fontFamily and fontSize */
  style: TextStyle
  children: string | number | false | null | undefined
  /**
   * Measure ink bounds for every text, not just italic. Set to `true` on
   * Android 13+ with RN 0.78+ where non-italic descenders can clip. See
   * [RN #49886], [RN #53286], [RN #56402]. Default: `false`.
   */
  strict?: boolean
}

/**
 * Drop-in `<Text>` replacement that prevents italic/bold text clipping.
 *
 * Automatically measures ink bounds and applies padding so glyphs
 * that extend beyond their advance width are not cut off.
 * Non-italic text renders with zero overhead (no measurement, no padding).
 *
 * For complex children (nested `<Text>`), use `useInkSafeStyle` instead.
 *
 * @example
 * ```tsx
 * import { InkSafeText } from 'expo-pretext'
 *
 * <InkSafeText style={{ fontFamily: 'Georgia', fontSize: 80, fontWeight: 'bold', fontStyle: 'italic' }}>
 *   fly
 * </InkSafeText>
 * ```
 */
export function InkSafeText({ children, style, strict, ...textProps }: InkSafeTextProps) {
  const text = typeof children === 'string' ? children : String(children ?? '')

  // Memoize only the padding on font properties. Spread style fresh so
  // non-font props (color, lineHeight, etc.) are never stale.
  const { padding, isOvershooting } = useMemo(
    () => getInkSafePadding(text, style, { strict }),
    [text, style.fontFamily, style.fontSize, style.fontWeight, style.fontStyle, strict],
  )

  // RN's Text accepts fontFamily as string — resolve any fallback chain
  // down to a single name before handing the style off.
  const resolvedFamily = resolveFontFamily(style.fontFamily)
  const rnStyle = { ...style, fontFamily: resolvedFamily }
  const mergedStyle = isOvershooting ? { ...rnStyle, ...padding } : rnStyle

  return (
    <Text style={mergedStyle} {...textProps}>
      {children}
    </Text>
  )
}
