// src/debug.ts
// Debug utilities for comparing predicted vs actual text heights.

/**
 * Result of comparing a predicted text height against the actual rendered height.
 */
export type DebugMeasurement = {
  /** Predicted height from prepare() + layout() */
  predicted: number
  /** Actual height from onLayout callback */
  actual: number
  /** Absolute difference in pixels */
  diff: number
  /** Percent difference relative to predicted */
  diffPercent: number
  /** Accuracy category: 'exact' (<1px), 'close' (<5%), 'loose' (<15%), 'wrong' (>15%) */
  accuracy: 'exact' | 'close' | 'loose' | 'wrong'
}

/**
 * Compare predicted and actual text heights, categorizing the accuracy.
 *
 * @param predicted - Height predicted by prepare() + layout()
 * @param actual - Height measured by onLayout
 * @returns Debug measurement with diff and accuracy category
 *
 * @example
 * ```ts
 * const measurement = compareDebugMeasurement(120, 122)
 * // { predicted: 120, actual: 122, diff: 2, diffPercent: 1.67, accuracy: 'close' }
 * ```
 */
export function compareDebugMeasurement(predicted: number, actual: number): DebugMeasurement {
  const diff = Math.abs(actual - predicted)
  const diffPercent = predicted === 0 ? 0 : (diff / predicted) * 100

  let accuracy: DebugMeasurement['accuracy']
  if (diff < 1) accuracy = 'exact'
  else if (diffPercent < 5) accuracy = 'close'
  else if (diffPercent < 15) accuracy = 'loose'
  else accuracy = 'wrong'

  return { predicted, actual, diff, diffPercent, accuracy }
}

/**
 * Colors for each accuracy category (hex, suitable for borders).
 */
export const DEBUG_ACCURACY_COLORS = {
  exact: '#22c55e', // green
  close: '#eab308', // yellow
  loose: '#f97316', // orange
  wrong: '#ef4444', // red
} as const
