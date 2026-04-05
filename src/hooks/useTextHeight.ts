import { useRef, useMemo } from 'react'
import { prepareStreaming } from '../streaming.js'
import { layout } from '../layout.js'
import type { TextStyle, PrepareOptions } from '../types.js'

export function useTextHeight(
  text: string,
  style: TextStyle,
  maxWidth: number,
  options?: PrepareOptions
): number {
  const keyRef = useRef({})

  return useMemo(() => {
    if (!text) return 0
    const prepared = prepareStreaming(keyRef.current, text, style, options)
    const result = layout(prepared, maxWidth)
    return result.height
  }, [text, style.fontFamily, style.fontSize, style.fontWeight,
      style.fontStyle, style.lineHeight, maxWidth,
      options?.whiteSpace, options?.locale, options?.accuracy])
}
