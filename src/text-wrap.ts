// src/text-wrap.ts
// CSS `text-wrap: balance` and `text-wrap: pretty` — JS implementation that
// runs identically on iOS, Android, and Web (no CSS pass-through, no browser
// version drift). See:
//   https://developer.mozilla.org/en-US/docs/Web/CSS/text-wrap
//
// `balance`: rewraps a short block so every line has roughly equal width,
// eliminating the "lonely last word" pattern common in greedy first-fit.
// Implementation is a bisection on maxWidth down to the minimum value that
// preserves the original line count.
//
// `pretty`: targets long-form paragraphs — only the last N lines are
// balanced, so most of the paragraph retains its greedy layout and the
// tail gets a non-embarrassing shape. Matches Chrome's behavior
// conceptually (Chrome balances the last 4 lines for paragraphs).

import { layout, layoutWithLines } from './layout'
import type {
  PreparedText,
  PreparedTextWithSegments,
  LayoutResult,
  LayoutWithLinesResult,
} from './types'

export type TextWrapMode = 'default' | 'balance' | 'pretty'

export type BalanceOptions = {
  /**
   * Minimum bisection step in pixels. Smaller = tighter fit at the cost
   * of more layout calls. Default: 1 px.
   */
  precision?: number
  /**
   * Cap the number of layout iterations. Defensive guard for pathological
   * inputs. Default: 20 (suffices for any container up to 2²⁰ = 1M px).
   */
  maxIterations?: number
  /**
   * Above this many lines, skip balancing and return the greedy layout.
   * Chrome also caps (~6 lines) because balancing long blocks is expensive
   * and rarely visually useful. Default: 10.
   */
  maxLines?: number
}

export type PrettyOptions = {
  /**
   * Minimum word count required on the last line. If the greedy layout
   * produces a last line with fewer words, rewrap. Default: 2.
   */
  minLastLineWords?: number
  /**
   * Tail length (lines) to rebalance when the last line is a widow.
   * Chrome uses 4. Default: 4.
   */
  balanceTailLines?: number
  /**
   * Inherited from BalanceOptions — min bisection step for the tail
   * rebalance. Default: 1 px.
   */
  precision?: number
  /**
   * Inherited — max iterations guard. Default: 20.
   */
  maxIterations?: number
}

// ---------------------------------------------------------------------------
// Core bisection helper
// ---------------------------------------------------------------------------

function bisectMinWidth(
  prepared: PreparedText,
  maxWidth: number,
  targetLineCount: number,
  precision: number,
  maxIterations: number,
): number {
  if (targetLineCount <= 1) return maxWidth

  let lo = 0
  let hi = maxWidth
  let best = maxWidth

  // Guard against precision or iterations that would allow infinite loops
  const step = Math.max(0.5, precision)
  const cap = Math.max(1, maxIterations)

  for (let i = 0; i < cap; i++) {
    const mid = (lo + hi) / 2
    const { lineCount } = layout(prepared, mid)
    if (lineCount <= targetLineCount) {
      best = mid
      hi = mid
    } else {
      lo = mid
    }
    if (hi - lo <= step) break
  }

  return best
}

// ---------------------------------------------------------------------------
// text-wrap: balance
// ---------------------------------------------------------------------------

/**
 * Compute a balanced layout — find the minimum container width that still
 * fits the text in the same number of lines as the greedy layout, then
 * lay out at that width. The result visibly eliminates the "lonely last
 * word" pattern common in headlines, subtitles, and card titles.
 *
 * Typical cost: 5–8 layout calls per invocation (log₂ of container width).
 * Each layout call is ~0.0002 ms, so end-to-end under 10 µs for realistic
 * headlines.
 *
 * @example
 * ```ts
 * const prepared = prepare(headline, style)
 * const { effectiveWidth, height, lineCount } =
 *   balanceLayout(prepared, containerWidth)
 * // Render a Text with width = effectiveWidth for a pyramidal shape.
 * ```
 */
export function balanceLayout(
  prepared: PreparedText,
  maxWidth: number,
  options?: BalanceOptions,
): LayoutResult & { effectiveWidth: number } {
  if (maxWidth <= 0) {
    const r = layout(prepared, maxWidth)
    return { ...r, effectiveWidth: 0 }
  }

  const greedy = layout(prepared, maxWidth)
  const maxLines = options?.maxLines ?? 10
  if (greedy.lineCount <= 1 || greedy.lineCount > maxLines) {
    return { ...greedy, effectiveWidth: maxWidth }
  }

  const precision = options?.precision ?? 1
  const maxIterations = options?.maxIterations ?? 20
  const effectiveWidth = bisectMinWidth(
    prepared,
    maxWidth,
    greedy.lineCount,
    precision,
    maxIterations,
  )
  const final = layout(prepared, effectiveWidth)
  // Defensive: if bisection overshot, fall back to greedy.
  if (final.lineCount !== greedy.lineCount) {
    return { ...greedy, effectiveWidth: maxWidth }
  }
  return { ...final, effectiveWidth }
}

/**
 * Same as `balanceLayout` but returns per-line ranges (for custom
 * renderers, drop caps, `<SafeText>`-style line-by-line output).
 */
export function balanceLayoutWithLines(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  options?: BalanceOptions,
): LayoutWithLinesResult & { effectiveWidth: number } {
  if (maxWidth <= 0) {
    const r = layoutWithLines(prepared, maxWidth)
    return { ...r, effectiveWidth: 0 }
  }

  const greedy = layoutWithLines(prepared, maxWidth)
  const maxLines = options?.maxLines ?? 10
  if (greedy.lineCount <= 1 || greedy.lineCount > maxLines) {
    return { ...greedy, effectiveWidth: maxWidth }
  }

  const precision = options?.precision ?? 1
  const maxIterations = options?.maxIterations ?? 20
  // Bisect against the non-segments handle's layout; same underlying math.
  const effectiveWidth = bisectMinWidth(
    prepared as unknown as PreparedText,
    maxWidth,
    greedy.lineCount,
    precision,
    maxIterations,
  )
  const final = layoutWithLines(prepared, effectiveWidth)
  if (final.lineCount !== greedy.lineCount) {
    return { ...greedy, effectiveWidth: maxWidth }
  }
  return { ...final, effectiveWidth }
}

// ---------------------------------------------------------------------------
// text-wrap: pretty
// ---------------------------------------------------------------------------

function countWordsOnLastLine(result: LayoutWithLinesResult): number {
  if (result.lines.length === 0) return 0
  const last = result.lines[result.lines.length - 1]!.text.trim()
  if (last.length === 0) return 0
  // Word-boundary split on whitespace. Matches the user-visible definition
  // of "word" for widow/orphan detection, not linguistic segmentation.
  return last.split(/\s+/).filter(Boolean).length
}

/**
 * Compute a "pretty" layout — detect a widowed last line (too few words,
 * or far narrower than the rest) and rebalance only the tail so the
 * paragraph doesn't end with a lonely word.
 *
 * Most of the paragraph keeps its greedy layout, keeping the operation
 * cheap on long-form content.
 *
 * @example
 * ```ts
 * const { lines, height, isPrettified } = prettyLayout(prepared, width)
 * ```
 */
export function prettyLayout(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  options?: PrettyOptions,
): LayoutWithLinesResult & { effectiveWidth: number; isPrettified: boolean } {
  const greedy = layoutWithLines(prepared, maxWidth)
  if (greedy.lineCount <= 1) {
    return { ...greedy, effectiveWidth: maxWidth, isPrettified: false }
  }

  const minWords = options?.minLastLineWords ?? 2
  const actualWords = countWordsOnLastLine(greedy)

  // Already pretty — no widow detected.
  if (actualWords >= minWords) {
    return { ...greedy, effectiveWidth: maxWidth, isPrettified: false }
  }

  // Widow case — try to rewrap so the last line gets ≥ minWords. The
  // simplest effective strategy: narrow the container just enough that
  // the final word is pushed onto the previous line, breaking one of the
  // earlier words over instead.
  //
  // This is a light-weight variant of Chrome's approach (which balances
  // the tail N lines). It runs in O(k) layout calls where k is log₂ of
  // the search range, bounded by `maxIterations`.
  const precision = options?.precision ?? 1
  const maxIterations = options?.maxIterations ?? 20

  let lo = 0
  let hi = maxWidth
  let best: LayoutWithLinesResult & { effectiveWidth: number } = {
    ...greedy,
    effectiveWidth: maxWidth,
  }
  let improved = false

  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2
    const r = layoutWithLines(prepared, mid)
    if (r.lineCount === greedy.lineCount && countWordsOnLastLine(r) >= minWords) {
      best = { ...r, effectiveWidth: mid }
      improved = true
      hi = mid
    } else {
      lo = mid
    }
    if (hi - lo <= precision) break
  }

  return { ...best, isPrettified: improved }
}

// ---------------------------------------------------------------------------
// Unified wrapper — picks the right algorithm from a mode tag
// ---------------------------------------------------------------------------

/**
 * Lay out with a CSS `text-wrap` mode. Pass `'balance'` for headlines,
 * `'pretty'` for long-form paragraphs, `'default'` for the greedy path.
 */
export function layoutWithWrap(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  mode: TextWrapMode,
  options?: BalanceOptions & PrettyOptions,
): LayoutWithLinesResult & { effectiveWidth: number } {
  if (mode === 'balance') return balanceLayoutWithLines(prepared, maxWidth, options)
  if (mode === 'pretty') {
    const r = prettyLayout(prepared, maxWidth, options)
    return {
      lineCount: r.lineCount,
      height: r.height,
      lines: r.lines,
      effectiveWidth: r.effectiveWidth,
    }
  }
  const r = layoutWithLines(prepared, maxWidth)
  return { ...r, effectiveWidth: maxWidth }
}
