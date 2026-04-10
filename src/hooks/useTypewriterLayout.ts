// src/hooks/useTypewriterLayout.ts
// React hook for typewriter-style text reveal with pre-computed layout.

import { useMemo, useState, useCallback } from 'react'
import { prepareWithSegments } from '../prepare'
import { layoutWithLines } from '../layout'
import { getLineHeight } from '../font-utils'
import { buildTypewriterFrames, type TypewriterFrame } from '../typewriter'
import type { TextStyle } from '../types'

/**
 * Result returned by {@link useTypewriterLayout}.
 */
export type TypewriterLayoutResult = {
  /** All pre-computed frames (one per character). Recomputed when text/style/width changes. */
  frames: TypewriterFrame[]
  /** Current frame based on revealIndex, or `null` before first `advance()` call. */
  current: TypewriterFrame | null
  /** Total number of frames (equals text length). */
  totalFrames: number
  /** Current reveal position (-1 = nothing revealed, 0 = first char, etc.). */
  revealIndex: number
  /** Reveal one more character. Returns `false` if already at the end. */
  advance: () => boolean
  /** Reset to initial state (nothing revealed). */
  reset: () => void
  /** Jump to a specific character index. Clamped to valid range. */
  seekTo: (index: number) => void
  /** `true` when all characters have been revealed. */
  isComplete: boolean
  /** Height in pixels at current reveal position (0 before first advance). */
  height: number
  /** Number of visible lines at current reveal position (0 before first advance). */
  lineCount: number
}

/**
 * React hook for typewriter-style character-by-character text reveal.
 *
 * Pre-computes all layout frames on text/style/width change, then provides
 * `advance()`, `reset()`, and `seekTo()` to control the reveal position.
 * Height and lineCount update correctly as text wraps to new lines.
 *
 * Ideal for AI chat streaming responses where tokens arrive incrementally
 * and you want a smooth typing animation with accurate height transitions.
 *
 * @param text - The full text to reveal (can grow over time for streaming)
 * @param style - Text style (fontFamily, fontSize, lineHeight, etc.)
 * @param maxWidth - Container width in pixels
 * @returns Typewriter state with advance/reset/seekTo controls
 *
 * @example
 * ```tsx
 * import { useTypewriterLayout } from 'expo-pretext'
 *
 * function TypewriterMessage({ text }: { text: string }) {
 *   const typewriter = useTypewriterLayout(text, {
 *     fontFamily: 'Inter',
 *     fontSize: 16,
 *     lineHeight: 24,
 *   }, containerWidth)
 *
 *   useEffect(() => {
 *     const timer = setInterval(() => {
 *       if (!typewriter.advance()) clearInterval(timer)
 *     }, 30)
 *     return () => clearInterval(timer)
 *   }, [typewriter.totalFrames])
 *
 *   return (
 *     <View style={{ height: typewriter.height }}>
 *       <Text>{typewriter.current?.revealedText ?? ''}</Text>
 *     </View>
 *   )
 * }
 * ```
 *
 * @example
 * ```tsx
 * // With AI streaming: text grows as tokens arrive
 * function StreamingChat({ streamedText }: { streamedText: string }) {
 *   const { height, current, advance, totalFrames } = useTypewriterLayout(
 *     streamedText,
 *     chatStyle,
 *     bubbleWidth,
 *   )
 *
 *   // Auto-advance as new tokens arrive
 *   useEffect(() => {
 *     const timer = setInterval(() => { advance() }, 20)
 *     return () => clearInterval(timer)
 *   }, [totalFrames])
 *
 *   return (
 *     <View style={{ height }}>
 *       <Text>{current?.revealedText}</Text>
 *     </View>
 *   )
 * }
 * ```
 */
export function useTypewriterLayout(
  text: string,
  style: TextStyle,
  maxWidth: number,
): TypewriterLayoutResult {
  const [revealIndex, setRevealIndex] = useState(-1)

  const frames = useMemo(() => {
    if (!text) return []
    const prepared = prepareWithSegments(text, style)
    const result = layoutWithLines(prepared, maxWidth)
    const lh = getLineHeight(style)
    return buildTypewriterFrames(result.lines, text, lh)
  }, [text, style.fontFamily, style.fontSize, style.fontWeight,
      style.fontStyle, style.lineHeight, maxWidth])

  const current = revealIndex >= 0 && revealIndex < frames.length
    ? frames[revealIndex]!
    : null

  const advance = useCallback((): boolean => {
    setRevealIndex(prev => {
      if (prev >= frames.length - 1) return prev
      return prev + 1
    })
    return revealIndex < frames.length - 1
  }, [frames.length, revealIndex])

  const reset = useCallback(() => {
    setRevealIndex(-1)
  }, [])

  const seekTo = useCallback((index: number) => {
    setRevealIndex(Math.max(-1, Math.min(index, frames.length - 1)))
  }, [frames.length])

  const isComplete = revealIndex >= frames.length - 1 && frames.length > 0

  return {
    frames,
    current,
    totalFrames: frames.length,
    revealIndex,
    advance,
    reset,
    seekTo,
    isComplete,
    height: current?.height ?? 0,
    lineCount: current?.lineCount ?? 0,
  }
}
