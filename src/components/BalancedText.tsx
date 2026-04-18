// src/components/BalancedText.tsx
// Drop-in <Text> replacement that applies CSS `text-wrap: balance` semantics
// on every platform (iOS, Android, Web) via line-by-line JS rendering.
//
// Balanced layout eliminates the "lonely last word" pattern common in
// greedy first-fit wrapping — every line in a headline ends up roughly
// the same width, giving a pyramidal shape. Runs in ~log₂ of the container
// width, typically 5–8 layout calls under 10 µs total.

import React, { useMemo } from 'react'
import { View, Text, type TextProps, type ViewProps } from 'react-native'
import { prepareWithSegments } from '../prepare'
import { balanceLayoutWithLines, type BalanceOptions } from '../text-wrap'
import { resolveFontFamily } from '../font-utils'
import type { TextStyle } from '../types'

export type BalancedTextProps = Omit<TextProps, 'style'> & {
  /** Text style — must include `fontFamily` and `fontSize`. */
  style: TextStyle
  /** The full text. A string, not nested `<Text>`. */
  children: string
  /** Container width for line-fit computation. Required. */
  maxWidth: number
  /** Options for the balance algorithm (precision, max lines, max iterations). */
  balanceOptions?: BalanceOptions
  /** Props forwarded to the outer `<View>` wrapper. */
  containerProps?: Omit<ViewProps, 'children'>
}

/**
 * Balanced-wrap text — equivalent to CSS `text-wrap: balance`.
 *
 * Headlines and subtitles rendered via `<BalancedText>` end up pyramid-
 * shaped instead of greedy-shaped with a lonely last word. Works
 * identically on iOS, Android, and Web.
 *
 * @example
 * ```tsx
 * <BalancedText
 *   style={{ fontFamily: 'Inter', fontSize: 32, lineHeight: 40, fontWeight: '700' }}
 *   maxWidth={containerWidth}
 * >
 *   React Native was missing a great text layout primitive
 * </BalancedText>
 * ```
 */
export function BalancedText({
  children,
  style,
  maxWidth,
  balanceOptions,
  containerProps,
  ...textProps
}: BalancedTextProps) {
  const result = useMemo(() => {
    if (!children || maxWidth <= 0) return null
    const prepared = prepareWithSegments(children, style)
    return balanceLayoutWithLines(prepared, maxWidth, balanceOptions)
  }, [
    children,
    maxWidth,
    style.fontFamily,
    style.fontSize,
    style.fontWeight,
    style.fontStyle,
    style.lineHeight,
    style.letterSpacing,
    balanceOptions?.precision,
    balanceOptions?.maxIterations,
    balanceOptions?.maxLines,
  ])

  const rnStyle = useMemo(
    () => ({ ...style, fontFamily: resolveFontFamily(style.fontFamily) }),
    [style],
  )

  if (!result) return null

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={children}
      style={{ width: result.effectiveWidth }}
      {...containerProps}
    >
      {result.lines.map((line, i) => (
        <Text
          key={i}
          style={rnStyle}
          numberOfLines={1}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          {...textProps}
        >
          {line.text}
        </Text>
      ))}
    </View>
  )
}
