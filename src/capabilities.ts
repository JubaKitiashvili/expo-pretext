// src/capabilities.ts
// Self-reported manifest of named behavior fixes shipped in this version of
// expo-pretext, intended for downstream integrations that want to skip legacy
// workarounds when the fix is present. Consumers detect via
// `'someBehaviorFix' in PRETEXT_BEHAVIOR_FIXES` — this works across versions
// because the binding itself is `undefined` on versions before this file
// existed.

export const PRETEXT_BEHAVIOR_FIXES = Object.freeze({
  nullableFontFamily: true,
  webCanvasSystemFontStack: true,
  webCanvasCssFontStack: true,
  webClearNativeCacheResetsCanvas: true,
  preferredDashBreaksInBreakableRuns: true,
  noSpaceWordInternalSymbolChains: true,
} as const)
