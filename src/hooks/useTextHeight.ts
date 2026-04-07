import { useRef, useMemo } from 'react'
import { getNativeModule } from '../ExpoPretext'
import { textStyleToFontDescriptor, getLineHeight } from '../font-utils'
import { prepareStreaming } from '../streaming'
import { layout } from '../layout'
import type { TextStyle, PrepareOptions } from '../types'

export function useTextHeight(
  text: string,
  style: TextStyle,
  maxWidth: number,
  options?: PrepareOptions
): number {
  const keyRef = useRef({})

  return useMemo(() => {
    if (!text) return 0

    // Primary: TextKit (NSLayoutManager) — pixel-perfect match with RN Text
    const native = getNativeModule()
    if (native) {
      try {
        const font = textStyleToFontDescriptor(style)
        const lh = getLineHeight(style)
        const result = native.measureTextHeight(text, font, maxWidth, lh)
        return result.height
      } catch {
        // Fall through to segment-based
      }
    }

    // Fallback: segment-based prepare + layout
    try {
      const prepared = prepareStreaming(keyRef.current, text, style, options)
      return layout(prepared, maxWidth).height
    } catch {
      // Last resort: rough estimate
      const lh = getLineHeight(style)
      const charsPerLine = Math.max(1, maxWidth / (style.fontSize * 0.5))
      return Math.ceil(text.length / charsPerLine) * lh
    }
  }, [text, style.fontFamily, style.fontSize, style.fontWeight,
      style.fontStyle, style.lineHeight, maxWidth,
      options?.whiteSpace, options?.locale, options?.accuracy])
}
