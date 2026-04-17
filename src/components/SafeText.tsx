// src/components/SafeText.tsx
// Line-by-line text renderer — bypasses the cluster of Android wrap / cut-off
// bugs that surfaced in RN 0.78+ and Android 13–16:
//   - [RN #15114] Oppo / OnePlus clip descenders
//   - [RN #49886] descender clipping after RN 0.78 on Android
//   - [RN #53286] Android cut-off with New Arch
//   - [RN #53666] text hidden in RN 0.81
//   - [RN #56402] Android 15/16 cut-off
//   - [RN #48921] selectable text breaks truncation
//   - [RN #46436] extra wrap from letterSpacing
//
// Strategy: we compute line breaks ourselves via `layoutWithLines` and emit
// one `<Text>` per line. Each inner `<Text>` receives a string that already
// fits the container width, so RN's wrapper has no wrap decision to make.
// Heights are predictable (we own them); vertical spacing follows the
// supplied `lineHeight`; the <View> wrapper carries the a11y label so
// screenreaders still read the whole paragraph.

import React, { useMemo } from 'react'
import { View, Text, type TextProps, type ViewProps } from 'react-native'
import { prepareWithSegments } from '../prepare'
import { layoutWithLines } from '../layout'
import { resolveFontFamily } from '../font-utils'
import type { TextStyle } from '../types'

export type SafeTextProps = Omit<TextProps, 'style'> & {
  /** Text style — must include `fontFamily` and `fontSize`. */
  style: TextStyle
  /** The full text. A string, not nested `<Text>`. */
  children: string
  /**
   * Container width for line-fit computation. Required — pass the width
   * you measured with `onLayout` on the parent View.
   */
  maxWidth: number
  /**
   * Optional cap on rendered lines. Extra lines are dropped (no ellipsis).
   * Use `<TruncatedText>` if you want ellipsis tail/head/middle modes.
   */
  maxLines?: number
  /**
   * Props forwarded to the outer `<View>` wrapper (styling, testID, etc.).
   */
  containerProps?: Omit<ViewProps, 'children'>
}

/**
 * Line-by-line rendered Text that bypasses Android wrap/cut-off regressions.
 *
 * Renders every line in its own `<Text>` using line breaks pre-computed by
 * `layoutWithLines`. The wrapper `<View>` carries the accessibility label
 * so screenreaders read the full paragraph as one unit.
 *
 * @example
 * ```tsx
 * function Paragraph({ text, width }: { text: string; width: number }) {
 *   return (
 *     <SafeText
 *       style={{ fontFamily: 'Inter', fontSize: 16, lineHeight: 24 }}
 *       maxWidth={width}
 *     >
 *       {text}
 *     </SafeText>
 *   )
 * }
 * ```
 */
export function SafeText({
  children,
  style,
  maxWidth,
  maxLines,
  containerProps,
  ...textProps
}: SafeTextProps) {
  const lines = useMemo(() => {
    if (!children || maxWidth <= 0) return [] as string[]
    const prepared = prepareWithSegments(children, style)
    const result = layoutWithLines(prepared, maxWidth)
    const extracted = result.lines.map((ln) => ln.text)
    if (maxLines !== undefined && maxLines > 0 && extracted.length > maxLines) {
      return extracted.slice(0, maxLines)
    }
    return extracted
  }, [
    children,
    maxWidth,
    maxLines,
    style.fontFamily,
    style.fontSize,
    style.fontWeight,
    style.fontStyle,
    style.lineHeight,
    style.letterSpacing,
  ])

  // RN's <Text> wants a single-string fontFamily.
  const rnStyle = useMemo(
    () => ({ ...style, fontFamily: resolveFontFamily(style.fontFamily) }),
    [style],
  )

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={children}
      {...containerProps}
    >
      {lines.map((text, i) => (
        <Text
          key={i}
          style={rnStyle}
          // Each line already fits — suppress any residual wrap decision.
          numberOfLines={1}
          // Children Text elements should not be individually focused by
          // screenreaders — the outer View carries the label.
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          {...textProps}
        >
          {text}
        </Text>
      ))}
    </View>
  )
}
