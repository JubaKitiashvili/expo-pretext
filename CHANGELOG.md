# Changelog

## 0.8.0 — 2026-04-11

### Production Ready Milestone

This milestone release completes Tier 3 (Production Readiness) and Tier 4 (DX)
of the v0.7 roadmap. expo-pretext is now ready for shipping to App Store and
Play Store with full animation suite, accessibility support, cross-platform
consistency mode, font metrics API, and developer tools.

### Added (v0.7.1–v0.7.4)

**Tier 3 — Production Readiness:**
- **`getFontScale()`** — Snapshot of current system font scale
- **`onFontScaleChange(callback)`** — Listener for iOS Dynamic Type / Android Font Size changes. Returns unsubscribe function.
- **`clearAllCaches()`** — Full JS + native cache invalidation (more thorough than `clearCache()`)
- **`ENGINE_PROFILES`** — Pre-defined profiles: `ios`, `android`, `consistent`, `web`
- **`setEngineProfile(profile)`** — Override platform defaults for cross-platform consistency or custom tuning
- **`getEngineProfile()`** — Now exported as public API
- **`EngineProfile`** type exported
- **`getFontMetrics(style)`** — Native font metrics (ascender, descender, xHeight, capHeight, lineGap) from iOS UIFont and Android Paint.FontMetrics with web Canvas fallback
- **`FontMetrics`** type exported

**Tier 4 — Developer Tools:**
- **`<PretextDebugOverlay>`** — React component showing predicted vs actual text heights with colored borders (green/yellow/orange/red by accuracy)
- **`compareDebugMeasurement(predicted, actual)`** — Pure accuracy comparison with `exact`/`close`/`loose`/`wrong` categorization
- **`DEBUG_ACCURACY_COLORS`** — Color constants for each accuracy level
- **`buildHeightSnapshot(texts, style, width)`** — Deterministic snapshot for CI regression detection
- **`compareHeightSnapshots(expected, actual)`** — Snapshot diff with per-entry mismatch details
- **`prepareWithBudget(text, style, budgetMs)`** — Timing-bounded prepare() with elapsed time metadata
- **`PrepareBudgetTracker`** — Running average tracker for prepare() timings

### Native Module Additions

- iOS: `getFontMetrics` function using UIFont ascender/descender/xHeight/capHeight/leading
- Android: `getFontMetrics` function using Paint.FontMetrics with textSize-based xHeight/capHeight approximation

### Tests

- 381 automated tests (was 324 at v0.7.0)
- New integration test suite verifying all v0.7.x APIs work together

## 0.7.0 — 2026-04-10

### Animation & AI Suite

This milestone release completes Tier 1 (AI Chat) and Tier 2 (Flagship Demos) of the v0.7 roadmap.

### Added (v0.6.1–v0.6.5)

- **`useTypewriterLayout(text, style, maxWidth)`** — Token-by-token text reveal hook with `advance()`, `reset()`, `seekTo()`. Pre-computes all frames from layout lines.
- **`buildTypewriterFrames(lines, text, lineHeight)`** — Pure computation for typewriter animation frames.
- **`measureCodeBlockHeight(code, style, maxWidth)`** — Monospace code block height prediction with `whiteSpace: 'pre-wrap'`.
- **`useObstacleLayout(text, style, region, circles?, rects?)`** — React hook wrapping `layoutColumn()` for editorial text-around-obstacles at 60fps.
- **`useTextMorphing(fromText, toText, style, maxWidth)`** — Line-by-line text transition animation between two states (e.g., "Thinking..." to final response).
- **`buildTextMorph(fromLines, toLines, lineHeight)`** — Pure morph transition computation with `heightAt(progress)` and `visibleLinesAt(progress)` interpolation.
- **`useAnimatedTextHeight(text, style, maxWidth, animConfig?)`** — Reanimated SharedValue height with timing/spring animation for streaming text.
- **`useCollapsibleHeight(expanded, collapsed, style, maxWidth, isExpanded)`** — Pre-computed expand/collapse heights with Reanimated animation.
- **`usePinchToZoomText(text, style, maxWidth, options?)`** — Per-frame fontSize scaling via pinch gesture. `layout()` at 0.0002ms = 120+ recalculations per frame. First on React Native.
- **`computeZoomLayout(text, style, maxWidth, scale, options?)`** — Pure fontSize/height computation at any zoom scale with min/max clamping.

### Dependencies

- **`react-native-reanimated >= 3.0.0`** added as optional peer dependency (for animated hooks only).

### Upstream Triage

Triaged 4 upstream chenglou/pretext issues against our native-backed implementation:
- #120 (CJK inline overflow) — not reproducible (native segmenters handle correctly)
- #121 (layoutNextLine mismatch) — not reproducible (16/16 consistency tests pass)
- #119 (analysis merge optimization) — low-priority port, safe but not urgent
- #105 (currency symbol line-break) — not applicable (no currency logic needed)

### Tests

- 308 automated tests (was 231 at v0.6.0)

## 0.6.0 — 2026-04-09

### Added

- **`fitFontSize(text, style, boxWidth, boxHeight)`** — Find the largest font size that fits text in a box. Binary search over prepare()+layout().
- **`truncateText(text, style, maxWidth, maxLines)`** — Truncate text to fit N lines with ellipsis. Returns `{ text, truncated, lineCount }`.
- **`customBreakRules`** option in `PrepareOptions` — Post-processing callback to override line break opportunities (e.g., break at `/` in URLs).
- **`useMultiStreamLayout(streams, style, maxWidth)`** — Hook for multiple parallel AI streaming responses with independent height tracking.
- **`SegmentBreakKind`** type exported for use with customBreakRules callback.
- **`TruncationResult`** type exported.

### Tests

- 259 automated tests (was 245)

## 0.5.0 — 2026-04-09

### Added

- **Expo Web support** — Canvas + Intl.Segmenter measurement backend. All existing hooks and functions work on web with zero API changes. `Platform.OS === 'web'` auto-detected.
- Web example app configuration (`app.json` platforms, `react-native-web`, `react-dom`)

### How it works on web

- `prepare()` uses `CanvasRenderingContext2D.measureText()` for segment widths
- `Intl.Segmenter` for word/grapheme boundaries (locale-aware for CJK/Thai)
- `layout()` runs pure JS arithmetic (same as native)
- All hooks (`useTextHeight`, `useFlashListHeights`, `useStreamingLayout`) work unchanged
- LRU cache (5000 entries) for measured widths
- `OffscreenCanvas` preferred, DOM canvas fallback, SSR graceful degradation
- `react-native-web` added as optional peer dependency

### Tests

- 245 automated tests (was 230)
- Web backend: interface shape, empty text, Intl.Segmenter, fallbacks

## 0.4.0 — 2026-04-09

### Added

- **Token-level streaming layout API** — O(1) per-token line check for AI chat streaming:
  - `getLastLineWidth(prepared, maxWidth)` — width of the last laid-out line
  - `measureTokenWidth(token, style)` — cached natural width of a token
  - `useStreamingLayout(text, style, maxWidth)` — hook returning `{ height, lineCount, lastLineWidth, doesNextTokenWrap }`

### Performance

- **useFlashListHeights batch pre-warming** — uses `measureHeights()` batch API instead of individual calls. 1 native call per 50 texts instead of 50.

### Compatibility

- Verified: FlashList 2.3.1, React Native 0.79.6 (Fabric/New Architecture), Expo SDK 53

### Tests

- 230 automated tests (was 220)

## 0.3.1 — 2026-04-09

### Tests

- **220 automated tests** (was 111) — comprehensive coverage for all core modules:
  - `line-break.ts`: 38 tests (wrapping, overflow, spaces, walk, step)
  - `streaming.ts`: 24 tests (append detection, cache, multi-key, rapid tokens)
  - `rich-inline.ts`: 25 tests (atomic, extraWidth, mixed fonts, fragments)
  - `hooks.ts`: 22 tests (prepare+layout pipeline, batch, segments, natural width)

## 0.3.0 — 2026-04-08

### Performance

Port of 8 upstream fixes from chenglou/pretext v0.0.5 addressing O(n^2) → O(n) regressions:

- Structural punctuation merge tracker — O(1) per merge instead of re-scanning
- Deferred punctuation materialization — `ch.repeat(n)` at flush instead of incremental concat
- CJK keep-all merges linear — deferred-join with cached containsCJK/canContinue flags
- Arabic no-space merges linear — per-slot metadata tracking arrays replace re-scanning
- Prepare worst-case linear — reverse-pass forward-sticky carry, cached CJK unit flags
- Breakable runs unified — `breakableWidths` + `breakablePrefixWidths` → single `breakableFitAdvances`
- Pre-wrap fast-path — remove no-op string replace

### Added

- `prepareStreaming()` and `clearStreamingState()` exported for power users (streaming without hooks)
- Performance regression tests for analysis module (repeated punctuation, CJK, Arabic)

### Architecture

- Extracted `build.ts` from `layout.ts` (852 → 353 + 503 lines)
- Removed `as any` casts in rich-inline.ts — typed `PreparedLineBreakData` bridge
- Consolidated duplicate types between `types.ts` and `rich-inline.ts`
- Renamed `getLineHeight` → `resolveLineHeight` in layout.ts to fix naming collision

### Tests

- 111 automated tests (was 106)

## 0.2.0 — 2026-04-08

### Added

- **obstacle-layout module** — `carveTextLineSlots`, `circleIntervalForBand`, `rectIntervalForBand`, `layoutColumn` for text reflow around obstacles
- **TextKit primary measurement** — `useTextHeight`, `useFlashListHeights`, `measureHeights` now use NSLayoutManager for pixel-perfect accuracy matching RN Text
- **8 demo screens** — Editorial Engine, Tight Bubbles, Accordion, Masonry, i18n, Markdown Chat, Justification Comparison, ASCII Art
- **`measureTextHeight` native function** — NSLayoutManager-based height measurement on iOS

### Fixed

- CJK/Georgian/Mixed text accuracy — TextKit measurement matches RN Text exactly
- Intl.Segmenter fallback for Hermes — grapheme splitting works without polyfill
- System font detection — no false warnings for built-in iOS fonts
- iOS native module CFLocale type mismatch

## 0.1.0 — 2026-04-05

### Added

- Initial release of expo-pretext
- Core API: `prepare()`, `layout()`, `prepareWithSegments()`, `layoutWithLines()`, `layoutNextLine()`, `walkLineRanges()`, `measureNaturalWidth()`
- React hooks: `useTextHeight()`, `usePreparedText()`, `useFlashListHeights()`
- Rich inline: `prepareInlineFlow()`, `walkInlineFlowLines()`, `measureInlineFlow()`
- Batch: `measureHeights()`
- iOS native module (Swift) — CFStringTokenizer + CTLine measurement
- Android native module (Kotlin) — BreakIterator + TextPaint measurement
- Auto-batching, JS-side caching, incremental streaming extend
- Ported from Pretext v0.0.4 (chenglou/pretext)
