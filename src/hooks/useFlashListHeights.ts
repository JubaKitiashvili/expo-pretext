import { useMemo, useEffect, useRef } from 'react'
import { prepare, measureHeights } from '../prepare.js'
import { layout } from '../layout.js'
import type { TextStyle } from '../types.js'

type FlashListLayoutResult = {
  estimatedItemSize: number
  overrideItemLayout: (layout: { size?: number }, item: any, index: number) => void
}

export function useFlashListHeights<T>(
  data: T[],
  getText: (item: T) => string,
  style: TextStyle,
  maxWidth: number
): FlashListLayoutResult {
  const heightsRef = useRef<Map<string, number>>(new Map())
  const lineHeight = style.lineHeight ?? style.fontSize * 1.2

  // Pre-warm cache for visible + buffer items
  useEffect(() => {
    const texts = data.map(getText)
    const batchSize = 50

    let offset = 0
    function warmNext() {
      const batch = texts.slice(offset, offset + batchSize)
      if (batch.length === 0) return

      const heights = measureHeights(batch, style, maxWidth)
      batch.forEach((text, i) => {
        heightsRef.current.set(text, heights[i]!)
      })

      offset += batchSize
      if (typeof requestIdleCallback !== 'undefined' && offset < texts.length) {
        requestIdleCallback(warmNext)
      }
    }

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(warmNext)
    } else {
      // Fallback: compute all synchronously
      const heights = measureHeights(texts, style, maxWidth)
      texts.forEach((text, i) => {
        heightsRef.current.set(text, heights[i]!)
      })
    }
  }, [data.length, style.fontFamily, style.fontSize, maxWidth])

  const estimatedItemSize = useMemo(() => {
    return lineHeight * 2 // reasonable default: 2-line message
  }, [lineHeight])

  const overrideItemLayout = useMemo(() => {
    return (layoutObj: { size?: number }, item: T, _index: number) => {
      const text = getText(item)

      // Check pre-warmed cache
      const cached = heightsRef.current.get(text)
      if (cached !== undefined) {
        layoutObj.size = cached
        return
      }

      // Compute on demand
      const prepared = prepare(text, style)
      const result = layout(prepared, maxWidth)
      heightsRef.current.set(text, result.height)
      layoutObj.size = result.height
    }
  }, [getText, style, maxWidth])

  return { estimatedItemSize, overrideItemLayout }
}
