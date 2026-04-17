// src/verify-font.ts
// Diagnostic: detect the "silent font fallback" case — when expo-font
// or the native font registry reports a font as loaded, yet RN's Text
// renderer falls back to System. This regression hit RN 0.83 New Arch
// for custom fonts and app extensions (see [RN #54934], [RN #56309]).
//
// Technique: measure a reference string with the requested font, then
// with an explicit System fallback. If the widths agree within a small
// tolerance, the requested font almost certainly isn't applied.
//
// Requires the native module. Returns `null` on environments without one
// (JS fallback / SSR / tests) — can't distinguish there.

import type { TextStyle, FontDescriptor } from './types'
import { getNativeModule } from './ExpoPretext'
import { textStyleToFontDescriptor, resolveFontFamily } from './font-utils'

export type FontLoadVerification = {
  /**
   * `true` if the requested font is applied. Either the requested family
   * matches the System font (trivially applied) or its measured width
   * differs from System by more than `widthTolerance`.
   */
  applied: boolean
  /** The concrete family name resolved from the style's `fontFamily` chain. */
  resolvedFamily: string
  /** `true` if the resolved family is a generic system font. */
  isSystemFont: boolean
  /** Advance sum for the reference string using the requested font. */
  requestedWidth: number
  /** Advance sum for the reference string using the explicit System font. */
  systemWidth: number
  /** Absolute width difference in points. */
  widthDifference: number
}

const SYSTEM_FAMILIES = /^(System|system|sans-serif|serif|monospace)$/

/**
 * A mix of ascenders, descenders, capitals, and a diacritic — maximizes the
 * chance of catching a fallback silently applied by the OS.
 */
const DEFAULT_REFERENCE = 'HqgpyjÁjz'

/**
 * Diagnostic for the silent font-fallback case. Call at app startup after
 * your `useFonts()` hook flips to `loaded`.
 *
 * @returns `null` if the native module can't be reached (JS fallback).
 *          Otherwise a report with `applied`, the width comparison, and
 *          enough metadata to print a helpful warning.
 *
 * @example
 * ```ts
 * const [loaded] = useFonts({ Inter: require('./Inter.ttf') })
 * useEffect(() => {
 *   if (!loaded) return
 *   const v = verifyFontsLoaded({ fontFamily: 'Inter', fontSize: 16 })
 *   if (v && !v.applied) {
 *     console.warn('Inter is not being applied — falling back to System')
 *   }
 * }, [loaded])
 * ```
 */
export function verifyFontsLoaded(
  style: TextStyle,
  options?: { reference?: string; widthTolerance?: number },
): FontLoadVerification | null {
  const native = getNativeModule()
  if (!native || typeof native.segmentAndMeasure !== 'function') return null

  const reference = options?.reference ?? DEFAULT_REFERENCE
  const tolerance = options?.widthTolerance ?? 0.5

  const resolvedFamily = resolveFontFamily(style.fontFamily)
  const isSystemFont = SYSTEM_FAMILIES.test(resolvedFamily)

  const requestedFont = textStyleToFontDescriptor(style)

  let requestedWidth = 0
  try {
    const r = native.segmentAndMeasure(reference, requestedFont)
    requestedWidth = sumWidths(r.widths)
  } catch {
    return null
  }

  const systemFont: FontDescriptor = { ...requestedFont, fontFamily: 'System' }
  let systemWidth = 0
  try {
    const r = native.segmentAndMeasure(reference, systemFont)
    systemWidth = sumWidths(r.widths)
  } catch {
    return null
  }

  const widthDifference = Math.abs(requestedWidth - systemWidth)
  const widthMatches = widthDifference < tolerance
  const applied = isSystemFont || !widthMatches

  return {
    applied,
    resolvedFamily,
    isSystemFont,
    requestedWidth,
    systemWidth,
    widthDifference,
  }
}

function sumWidths(widths: number[]): number {
  let total = 0
  for (const w of widths) total += w
  return total
}
