// src/engine-profile.ts
// Platform-specific layout tuning for iOS TextKit vs Android TextPaint.
// Controls sub-pixel tolerance, CJK rules, and cross-platform consistency.

import { Platform } from 'react-native'

/**
 * Engine profile controlling platform-specific layout behavior.
 *
 * Different native text engines (iOS TextKit, Android TextPaint) produce
 * slightly different segment widths for the same text/font. The engine
 * profile compensates for these differences.
 */
export type EngineProfile = {
  /** Sub-pixel tolerance for line fitting. Lines within this margin of maxWidth are not wrapped. */
  lineFitEpsilon: number
  /** Whether to carry CJK text after closing quotes to the same line (iOS TextKit behavior). */
  carryCJKAfterClosingQuote: boolean
  /** Whether keep-all text may break after punctuation-like boundaries. */
  breakKeepAllAfterPunctuation?: boolean
  /** Prefer prefix-width accumulation for breakable runs (experimental). */
  preferPrefixWidthsForBreakableRuns: boolean
  /** Break at soft hyphens earlier when close to the line limit (experimental). */
  preferEarlySoftHyphenBreak: boolean
}

/**
 * Pre-defined engine profiles for different use cases.
 */
export const ENGINE_PROFILES = {
  /** iOS-optimized profile — matches TextKit behavior. */
  ios: {
    lineFitEpsilon: 0.01,
    carryCJKAfterClosingQuote: true,
    breakKeepAllAfterPunctuation: true,
    preferPrefixWidthsForBreakableRuns: false,
    preferEarlySoftHyphenBreak: false,
  } as EngineProfile,

  /** Android-optimized profile — matches TextPaint behavior. */
  android: {
    lineFitEpsilon: 0.02,
    carryCJKAfterClosingQuote: false,
    breakKeepAllAfterPunctuation: true,
    preferPrefixWidthsForBreakableRuns: false,
    preferEarlySoftHyphenBreak: false,
  } as EngineProfile,

  /**
   * Cross-platform consistent profile.
   * Uses conservative settings that produce the same line breaks on both platforms.
   * Trade-off: slightly less accurate per-platform, but heights match across iOS/Android.
   */
  consistent: {
    lineFitEpsilon: 0.05,
    carryCJKAfterClosingQuote: false,
    breakKeepAllAfterPunctuation: true,
    preferPrefixWidthsForBreakableRuns: false,
    preferEarlySoftHyphenBreak: false,
  } as EngineProfile,

  /** Web/default profile. */
  web: {
    lineFitEpsilon: 0.01,
    carryCJKAfterClosingQuote: false,
    breakKeepAllAfterPunctuation: true,
    preferPrefixWidthsForBreakableRuns: false,
    preferEarlySoftHyphenBreak: false,
  } as EngineProfile,
} as const

let cachedProfile: EngineProfile | null = null
let userOverride: EngineProfile | null = null

/**
 * Get the current engine profile.
 *
 * Returns the user-set override if one exists, otherwise the platform default.
 *
 * @example
 * ```ts
 * import { getEngineProfile } from 'expo-pretext'
 *
 * const profile = getEngineProfile()
 * console.log(profile.lineFitEpsilon) // 0.01 on iOS, 0.02 on Android
 * ```
 */
export function getEngineProfile(): EngineProfile {
  if (userOverride !== null) return userOverride
  if (cachedProfile !== null) return cachedProfile

  cachedProfile = Platform.select({
    ios: { ...ENGINE_PROFILES.ios },
    android: { ...ENGINE_PROFILES.android },
    default: { ...ENGINE_PROFILES.web },
  })!

  return cachedProfile
}

/**
 * Override the engine profile for cross-platform consistency or custom tuning.
 *
 * Pass a pre-defined profile from `ENGINE_PROFILES` or a custom object.
 * Pass `null` to reset to the platform default.
 *
 * **Important:** Call this before any `prepare()` calls. Changing the profile
 * after measurements have been cached may produce inconsistent results —
 * call `clearAllCaches()` after changing the profile.
 *
 * @param profile - Engine profile to use, or `null` to reset to platform default
 *
 * @example
 * ```ts
 * import { setEngineProfile, ENGINE_PROFILES, clearAllCaches } from 'expo-pretext'
 *
 * // Force consistent heights across iOS and Android
 * setEngineProfile(ENGINE_PROFILES.consistent)
 *
 * // Reset to platform-native behavior
 * setEngineProfile(null)
 * clearAllCaches()
 * ```
 *
 * @example
 * ```ts
 * // Custom tuning for a specific font
 * setEngineProfile({
 *   lineFitEpsilon: 0.03,
 *   carryCJKAfterClosingQuote: true,
 *   breakKeepAllAfterPunctuation: true,
 *   preferPrefixWidthsForBreakableRuns: false,
 *   preferEarlySoftHyphenBreak: false,
 * })
 * ```
 */
export function setEngineProfile(profile: EngineProfile | null): void {
  userOverride = profile
  cachedProfile = null
}
