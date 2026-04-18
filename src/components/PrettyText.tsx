// src/components/PrettyText.tsx
// Drop-in <Text> replacement that applies CSS `text-wrap: pretty` semantics
// — detects a widowed last line and rewraps the tail so the paragraph
// doesn't end with a lonely word. Runs identically on iOS, Android, Web.

import React, { useMemo } from 'react'
import { View, Text, type TextProps, type ViewProps } from 'react-native'
import { prepareWithSegments } from '../prepare'
import { prettyLayout, type PrettyOptions } from '../text-wrap'
import { resolveFontFamily } from '../font-utils'
import type { TextStyle } from '../types'

export type PrettyTextProps = Omit<TextProps, 'style'> & {
  /** Text style — must include `fontFamily` and `fontSize`. */
  style: TextStyle
  /** The full text. A string, not nested `<Text>`. */
  children: string
  /** Container width for line-fit computation. Required. */
  maxWidth: number
  /** Options for the pretty algorithm (minLastLineWords, precision, etc.). */
  prettyOptions?: PrettyOptions
  /** Props forwarded to the outer `<View>` wrapper. */
  containerProps?: Omit<ViewProps, 'children'>
}

/**
 * Widow-free paragraph text — equivalent to CSS `text-wrap: pretty`.
 *
 * Long-form paragraphs rendered via `<PrettyText>` never end with a
 * single-word last line (a "widow"). Most of the paragraph keeps its
 * greedy layout — only the tail is rewrapped.
 *
 * @example
 * ```tsx
 * <PrettyText
 *   style={{ fontFamily: 'Georgia', fontSize: 16, lineHeight: 24 }}
 *   maxWidth={containerWidth}
 * >
 *   {articleParagraph}
 * </PrettyText>
 * ```
 */
export function PrettyText({
  children,
  style,
  maxWidth,
  prettyOptions,
  containerProps,
  ...textProps
}: PrettyTextProps) {
  const result = useMemo(() => {
    if (!children || maxWidth <= 0) return null
    const prepared = prepareWithSegments(children, style)
    return prettyLayout(prepared, maxWidth, prettyOptions)
  }, [
    children,
    maxWidth,
    style.fontFamily,
    style.fontSize,
    style.fontWeight,
    style.fontStyle,
    style.lineHeight,
    style.letterSpacing,
    prettyOptions?.minLastLineWords,
    prettyOptions?.balanceTailLines,
    prettyOptions?.precision,
    prettyOptions?.maxIterations,
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
