// src/components/TruncatedText.tsx
// Drop-in truncation primitive that avoids RN's numberOfLines edge cases:
//   - Android "ellipsizeMode=middle/head" broken for numberOfLines>1
//   - iOS ellipsis missing when text contains '\n'
//   - Ellipsis carries the trimmed text's background color
//
// We compute the visible substring in JS via `truncateText()` and render it
// through a plain <Text>. No background artifact, no platform asymmetry.
//
// Related upstream issues: [RN #19117], [RN #41405], [RN #37926].

import React, { useMemo } from 'react'
import { Text, type TextProps } from 'react-native'
import { truncateText } from '../text-utils'
import { resolveFontFamily } from '../font-utils'
import type { TextStyle } from '../types'

export type TruncatedTextProps = Omit<TextProps, 'style'> & {
  /** Text style — must include `fontFamily` and `fontSize`. */
  style: TextStyle
  /** The full text. A string, not nested `<Text>`. */
  children: string
  /**
   * Maximum number of lines before truncation kicks in. Default: 1.
   */
  maxLines?: number
  /**
   * Container width for line-fit computation. Typically the width of the
   * parent `<View>` (measure with `onLayout` and pass through).
   */
  maxWidth: number
  /**
   * Ellipsis character inserted at the truncation point. Default: `…` (U+2026).
   */
  ellipsis?: string
  /**
   * Truncation mode.
   * - `'tail'` (default) — keep the start, drop the end: "The quick brown…"
   * - `'head'` — drop the start, keep the end: "…over the lazy dog"
   * - `'middle'` — keep both ends: "The quick…the lazy dog"
   */
  mode?: 'tail' | 'head' | 'middle'
  /**
   * Callback fired when truncation state changes. Useful for "Read more"
   * toggles that only show the button when truncation actually happened.
   */
  onTruncate?: (truncated: boolean) => void
}

/**
 * Truncate a string to fit `maxLines` at `maxWidth` and render it via a
 * plain `<Text>`. Avoids every edge case of RN's built-in `numberOfLines`
 * + `ellipsizeMode` pair.
 *
 * @example
 * ```tsx
 * <TruncatedText
 *   style={{ fontFamily: 'Inter', fontSize: 14 }}
 *   maxWidth={containerWidth}
 *   maxLines={3}
 *   mode="tail"
 * >
 *   {longArticleText}
 * </TruncatedText>
 * ```
 */
export function TruncatedText({
  children,
  style,
  maxLines = 1,
  maxWidth,
  ellipsis = '\u2026',
  mode = 'tail',
  onTruncate,
  ...textProps
}: TruncatedTextProps) {
  const resolved = useMemo(() => {
    if (!children || maxWidth <= 0 || maxLines <= 0) {
      return { text: '', truncated: false }
    }
    if (mode === 'tail') {
      const r = truncateText(children, style, maxWidth, maxLines, { ellipsis })
      return { text: r.text, truncated: r.truncated }
    }
    if (mode === 'head') {
      // Reverse the text, tail-truncate, then un-reverse.
      const reversed = [...children].reverse().join('')
      const r = truncateText(reversed, style, maxWidth, maxLines, { ellipsis: '' })
      if (!r.truncated) return { text: children, truncated: false }
      const keptTail = [...r.text].reverse().join('')
      return { text: ellipsis + keptTail, truncated: true }
    }
    // middle
    const head = truncateText(children, style, maxWidth, Math.max(1, Math.ceil(maxLines / 2)), {
      ellipsis: '',
    })
    if (!head.truncated) return { text: children, truncated: false }
    const reversed = [...children].reverse().join('')
    const tail = truncateText(reversed, style, maxWidth, Math.max(1, Math.floor(maxLines / 2)), {
      ellipsis: '',
    })
    const tailText = [...tail.text].reverse().join('')
    return { text: head.text + ellipsis + tailText, truncated: true }
  }, [children, style.fontFamily, style.fontSize, style.fontWeight, style.fontStyle, style.lineHeight, style.letterSpacing, maxLines, maxWidth, ellipsis, mode])

  if (onTruncate) {
    // Fire the callback on every commit where `truncated` flips. Cheap
    // enough that we don't bother memoizing — React's prop-equality
    // short-circuits parent re-renders that aren't relevant.
    onTruncate(resolved.truncated)
  }

  // Resolve fontFamily chain before passing to RN's <Text>.
  const rnStyle = {
    ...style,
    fontFamily: resolveFontFamily(style.fontFamily),
  }

  return (
    <Text style={rnStyle} {...textProps}>
      {resolved.text}
    </Text>
  )
}
