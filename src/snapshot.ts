// src/snapshot.ts
// Snapshot testing utilities for CI regression detection.
// Computes deterministic height snapshots that can be stored and compared.

import { prepare } from './prepare'
import { layout } from './layout'
import type { TextStyle, PrepareOptions } from './types'

/**
 * A single entry in a height snapshot.
 */
export type HeightSnapshotEntry = {
  /** Index in the original texts array */
  index: number
  /** First 40 characters of the text (for identification) */
  textPreview: string
  /** Predicted height in pixels */
  height: number
  /** Number of lines */
  lineCount: number
}

/**
 * A complete height snapshot for a set of texts at a specific style + width.
 */
export type HeightSnapshot = {
  /** Width used for measurement */
  width: number
  /** Style fingerprint (fontFamily_fontSize_lineHeight) */
  styleKey: string
  /** Per-text measurements */
  entries: HeightSnapshotEntry[]
  /** Sum of all heights */
  totalHeight: number
}

/**
 * Build a height snapshot for a set of texts.
 *
 * Use this in CI tests to detect regressions in text measurement accuracy.
 * Store the snapshot on disk, then compare against new snapshots on each release.
 *
 * @param texts - Array of text strings to measure
 * @param style - Text style
 * @param width - Container width in pixels
 * @param options - Optional prepare options
 * @returns Deterministic snapshot of all heights
 *
 * @example
 * ```ts
 * import { buildHeightSnapshot } from 'expo-pretext'
 *
 * const texts = ['Hello', 'World', 'Longer message here']
 * const style = { fontFamily: 'Inter', fontSize: 16, lineHeight: 24 }
 * const snapshot = buildHeightSnapshot(texts, style, 300)
 *
 * // Store or compare: JSON.stringify(snapshot) is stable for equal inputs
 * ```
 */
export function buildHeightSnapshot(
  texts: string[],
  style: TextStyle,
  width: number,
  options?: PrepareOptions,
): HeightSnapshot {
  const styleKey = `${style.fontFamily}_${style.fontSize}_${style.lineHeight ?? 'auto'}`
  const entries: HeightSnapshotEntry[] = []
  let totalHeight = 0

  for (let i = 0; i < texts.length; i++) {
    const text = texts[i]!
    const prepared = prepare(text, style, options)
    const result = layout(prepared, width)
    entries.push({
      index: i,
      textPreview: text.slice(0, 40),
      height: result.height,
      lineCount: result.lineCount,
    })
    totalHeight += result.height
  }

  return { width, styleKey, entries, totalHeight }
}

/**
 * Result of comparing two height snapshots.
 */
export type SnapshotComparison = {
  /** True if snapshots match exactly */
  match: boolean
  /** Number of entries that differ */
  mismatchCount: number
  /** Per-entry differences (only mismatches included) */
  mismatches: Array<{
    index: number
    textPreview: string
    expectedHeight: number
    actualHeight: number
    heightDiff: number
  }>
}

/**
 * Compare two height snapshots and return a detailed comparison.
 *
 * Use this in tests to detect when text heights drift between runs:
 *
 * ```ts
 * const baseline = JSON.parse(readFileSync('snapshot.json', 'utf-8'))
 * const current = buildHeightSnapshot(texts, style, width)
 * const comparison = compareHeightSnapshots(baseline, current)
 *
 * if (!comparison.match) {
 *   console.error(`Height regression: ${comparison.mismatchCount} mismatches`)
 *   comparison.mismatches.forEach(m => console.error(m))
 *   throw new Error('Height snapshot mismatch')
 * }
 * ```
 *
 * @param expected - Baseline snapshot (from previous run)
 * @param actual - Current snapshot to compare against baseline
 * @returns Comparison result with mismatch details
 */
export function compareHeightSnapshots(
  expected: HeightSnapshot,
  actual: HeightSnapshot,
): SnapshotComparison {
  const mismatches: SnapshotComparison['mismatches'] = []

  // Check if the snapshots are comparable
  if (expected.width !== actual.width || expected.styleKey !== actual.styleKey) {
    return {
      match: false,
      mismatchCount: Math.max(expected.entries.length, actual.entries.length),
      mismatches: [],
    }
  }

  const maxLen = Math.max(expected.entries.length, actual.entries.length)
  for (let i = 0; i < maxLen; i++) {
    const exp = expected.entries[i]
    const act = actual.entries[i]
    if (!exp || !act || exp.height !== act.height) {
      mismatches.push({
        index: i,
        textPreview: act?.textPreview ?? exp?.textPreview ?? '',
        expectedHeight: exp?.height ?? 0,
        actualHeight: act?.height ?? 0,
        heightDiff: Math.abs((act?.height ?? 0) - (exp?.height ?? 0)),
      })
    }
  }

  return {
    match: mismatches.length === 0,
    mismatchCount: mismatches.length,
    mismatches,
  }
}
