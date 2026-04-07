import { useMemo, useEffect, useRef, useCallback } from 'react'
import { getNativeModule } from '../ExpoPretext'
import { textStyleToFontDescriptor, getLineHeight } from '../font-utils'
import { prepare } from '../prepare'
import { layout } from '../layout'
import type { TextStyle } from '../types'

type FlashListLayoutResult = {
  estimatedItemSize: number
  overrideItemLayout: (layout: { size?: number }, item: any, index: number) => void
}

// Measure single text height — TextKit primary, segment fallback
function measureSingleHeight(text: string, style: TextStyle, maxWidth: number): number {
  const native = getNativeModule()
  if (native) {
    try {
      const font = textStyleToFontDescriptor(style)
      const lh = getLineHeight(style)
      return native.measureTextHeight(text, font, maxWidth, lh).height
    } catch {}
  }
  // Fallback: segment-based
  const prepared = prepare(text, style)
  return layout(prepared, maxWidth).height
}

export function useFlashListHeights<T>(
  data: T[],
  getText: (item: T) => string,
  style: TextStyle,
  maxWidth: number
): FlashListLayoutResult {
  const heightsRef = useRef<Map<string, number>>(new Map())
  const lineHeight = getLineHeight(style)

  // Pre-warm cache
  useEffect(() => {
    const texts = data.map(getText)
    const batchSize = 50
    let offset = 0

    function warmNext() {
      const batch = texts.slice(offset, offset + batchSize)
      if (batch.length === 0) return

      for (const text of batch) {
        if (!heightsRef.current.has(text)) {
          heightsRef.current.set(text, measureSingleHeight(text, style, maxWidth))
        }
      }

      offset += batchSize
      if (typeof requestIdleCallback !== 'undefined' && offset < texts.length) {
        requestIdleCallback(warmNext)
      }
    }

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(warmNext)
    } else {
      for (const text of texts) {
        if (!heightsRef.current.has(text)) {
          heightsRef.current.set(text, measureSingleHeight(text, style, maxWidth))
        }
      }
    }
  }, [data.length, style.fontFamily, style.fontSize, maxWidth])

  const estimatedItemSize = useMemo(() => lineHeight * 2, [lineHeight])

  const overrideItemLayout = useCallback(
    (layoutObj: { size?: number }, item: T, _index: number) => {
      const text = getText(item)
      const cached = heightsRef.current.get(text)
      if (cached !== undefined) {
        layoutObj.size = cached
        return
      }
      const height = measureSingleHeight(text, style, maxWidth)
      heightsRef.current.set(text, height)
      layoutObj.size = height
    },
    [getText, style, maxWidth]
  )

  return { estimatedItemSize, overrideItemLayout }
}
