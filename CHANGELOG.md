# Changelog

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
