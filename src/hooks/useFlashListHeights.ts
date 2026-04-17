import { useEffect, useRef, useCallback } from 'react'
import { getNativeModule } from '../ExpoPretext'
import { textStyleToFontDescriptor, getLineHeight } from '../font-utils'
import { prepare, measureHeights } from '../prepare'
import { layout } from '../layout'
import type { TextStyle } from '../types'

export type FlashListHeightsResult<T> = {
  /**
   * Synchronous cached height lookup. Returns the measured text height for
   * the given item. If missing from the cache, falls back to a single
   * native (or JS) measurement and memoizes the result.
   *
   * Use this inside `renderItem` to set an explicit height on the wrapping
   * View, which lets FlashList v2 skip a measurement frame and eliminates
   * first-paint jitter.
   */
  getHeight: (item: T) => number
}

function measureSingleHeight(text: string, style: TextStyle, maxWidth: number): number {
  const native = getNativeModule()
  if (native) {
    try {
      const font = textStyleToFontDescriptor(style)
      const lh = getLineHeight(style)
      return native.measureTextHeight(text, font, maxWidth, lh).height
    } catch {}
  }
  const prepared = prepare(text, style)
  return layout(prepared, maxWidth).height
}

/**
 * FlashList v2 height prediction helper.
 *
 * Pre-warms a height cache in the background (batched via `measureHeights`
 * and `requestIdleCallback`) and returns `getHeight(item)` for synchronous
 * lookup inside `renderItem`.
 *
 * FlashList v2 no longer accepts `estimatedItemSize` or a size-bearing
 * `overrideItemLayout`. Instead, set `height` explicitly on the wrapper
 * view in `renderItem` — that's what this hook makes fast.
 *
 * @example
 * ```tsx
 * const { getHeight } = useFlashListHeights(
 *   messages,
 *   (m) => m.text,
 *   { fontFamily: 'System', fontSize: 16, lineHeight: 24 },
 *   bubbleMaxWidth,
 * )
 *
 * <FlashList
 *   data={messages}
 *   keyExtractor={(m) => m.id}
 *   renderItem={({ item }) => (
 *     <View style={{ height: getHeight(item) + VERTICAL_PADDING }}>
 *       <Text>{item.text}</Text>
 *     </View>
 *   )}
 * />
 * ```
 *
 * @param data      — full list dataset (used for background pre-warming)
 * @param getText   — extracts the text to measure from each item
 * @param style     — text style (fontFamily, fontSize, lineHeight, etc.)
 * @param maxWidth  — wrapping width in pixels
 */
export function useFlashListHeights<T>(
  data: T[],
  getText: (item: T) => string,
  style: TextStyle,
  maxWidth: number
): FlashListHeightsResult<T> {
  const heightsRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const allTexts = data.map(getText)
    const batchSize = 50
    let offset = 0

    function warmNext() {
      const uncached: string[] = []
      const end = Math.min(offset + batchSize, allTexts.length)
      for (let i = offset; i < end; i++) {
        const text = allTexts[i]!
        if (!heightsRef.current.has(text)) uncached.push(text)
      }

      if (uncached.length > 0) {
        const heights = measureHeights(uncached, style, maxWidth)
        for (let i = 0; i < uncached.length; i++) {
          heightsRef.current.set(uncached[i]!, heights[i]!)
        }
      }

      offset = end
      if (typeof requestIdleCallback !== 'undefined' && offset < allTexts.length) {
        requestIdleCallback(warmNext)
      }
    }

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(warmNext)
    } else {
      const uncached: string[] = []
      for (const text of allTexts) {
        if (!heightsRef.current.has(text)) uncached.push(text)
      }
      if (uncached.length > 0) {
        const heights = measureHeights(uncached, style, maxWidth)
        for (let i = 0; i < uncached.length; i++) {
          heightsRef.current.set(uncached[i]!, heights[i]!)
        }
      }
    }
  }, [data.length, getText, style.fontFamily, style.fontSize, maxWidth])

  const getHeight = useCallback(
    (item: T): number => {
      const text = getText(item)
      const cached = heightsRef.current.get(text)
      if (cached !== undefined) return cached
      const height = measureSingleHeight(text, style, maxWidth)
      heightsRef.current.set(text, height)
      return height
    },
    [getText, style, maxWidth]
  )

  return { getHeight }
}
