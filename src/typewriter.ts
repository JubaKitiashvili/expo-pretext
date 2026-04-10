// src/typewriter.ts
// Typewriter effect: pre-compute reveal frames from layoutWithLines() output.
// Each frame represents one more character revealed, with correct lineCount and height.

import type { LayoutLine } from './types'

/**
 * A single frame in a typewriter animation sequence.
 * Each frame represents the state after revealing one additional character.
 *
 * @example
 * ```ts
 * // Frame 0: "H"  → lineCount: 1, height: 24
 * // Frame 1: "He" → lineCount: 1, height: 24
 * // Frame 5: "Hello " → lineCount: 1, height: 24
 * // Frame 10: "Hello Worl" → lineCount: 2, height: 48 (wrapped to next line)
 * ```
 */
export type TypewriterFrame = {
  /** Text revealed so far (e.g., "Hel" on frame 3 of "Hello") */
  revealedText: string
  /** Number of visible lines at this reveal point — monotonically increases */
  lineCount: number
  /** Total height in pixels at this point (lineCount * lineHeight) */
  height: number
  /** True only on the final frame when all text has been revealed */
  isComplete: boolean
}

/**
 * Build an array of typewriter frames from pre-computed layout lines.
 * Each frame represents one more character of text revealed, with the correct
 * line count and height at that point in the animation.
 *
 * Use this with `prepareWithSegments()` + `layoutWithLines()` to pre-compute
 * the exact layout, then animate the reveal without any additional measurement.
 *
 * @param lines - Output from `layoutWithLines().lines`
 * @param text - The original source text
 * @param lineHeight - Height per line in pixels
 * @returns One frame per character in the text, or `[]` for empty text
 *
 * @example
 * ```ts
 * import { prepareWithSegments, layoutWithLines, buildTypewriterFrames } from 'expo-pretext'
 *
 * const prepared = prepareWithSegments(text, style)
 * const { lines } = layoutWithLines(prepared, containerWidth)
 * const frames = buildTypewriterFrames(lines, text, style.lineHeight ?? 24)
 *
 * // Animate: reveal one frame per interval
 * let i = 0
 * const timer = setInterval(() => {
 *   const frame = frames[i]
 *   setDisplayText(frame.revealedText)
 *   setHeight(frame.height) // smooth height growth as lines wrap
 *   if (frame.isComplete) clearInterval(timer)
 *   i++
 * }, 30)
 * ```
 */
export function buildTypewriterFrames(
  lines: LayoutLine[],
  text: string,
  lineHeight: number,
): TypewriterFrame[] {
  if (!text || lines.length === 0) return []

  const frames: TypewriterFrame[] = []
  const totalChars = text.length

  // Build a map: for each character index, which line is it on?
  let charOffset = 0
  const charToLine: number[] = new Array(totalChars)

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineText = lines[lineIdx]!.text
    for (let j = 0; j < lineText.length; j++) {
      if (charOffset < totalChars) {
        charToLine[charOffset] = lineIdx
        charOffset++
      }
    }
  }

  // Fill any remaining characters (spaces consumed between lines)
  while (charOffset < totalChars) {
    charToLine[charOffset] = lines.length - 1
    charOffset++
  }

  // Build frames
  for (let i = 0; i < totalChars; i++) {
    const lineIdx = charToLine[i]!
    const lineCount = lineIdx + 1
    frames.push({
      revealedText: text.slice(0, i + 1),
      lineCount,
      height: lineCount * lineHeight,
      isComplete: i === totalChars - 1,
    })
  }

  return frames
}
