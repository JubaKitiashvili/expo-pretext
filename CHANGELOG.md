# Changelog

## 1.1.0 — 2026-04-18 — Balance + Pretty

### Added

- **`<BalancedText>`** — CSS `text-wrap: balance` semantics on every
  platform. Eliminates the "lonely last word" pattern in headlines and
  subtitles via a bisection search on container width (≤ 8 layout calls
  per invocation, typically < 10 µs). Works identically on iOS, Android,
  and Expo Web — no browser version drift.
- **`<PrettyText>`** — CSS `text-wrap: pretty` semantics. Detects a
  widowed last line and rewraps the tail so the paragraph doesn't end
  with a single word.
- **`balanceLayout()`, `balanceLayoutWithLines()`, `prettyLayout()`,
  `layoutWithWrap()`** — imperative versions for FlashList cell
  measurement, custom renderers, and per-frame use.

### Why these ship on every platform (not just web CSS)

Chrome 114+ and Safari 17.5+ implement `text-wrap: balance`; Firefox
lagged for a year; Chrome 117+ has `text-wrap: pretty` but Safari and
Firefox don't. On RN, neither iOS nor Android has any equivalent at all.
We implement the algorithm in JS so iOS, Android, and Web all get the
same output — pixel-identical across platforms.

### Example app

- **Balanced Headlines demo** — side-by-side greedy vs. balanced with a
  width slider. Same demo renders identically on iOS simulator, Android
  emulator, and the live web build.
- **Live web playground** deployed at
  [`https://expo-pretext.vercel.app`](https://expo-pretext.vercel.app) —
  every demo accessible in a browser, no install required.

### Tests

- 637 passing (was 621). `tsc --noEmit` clean. Snapshot baseline
  unchanged.

## 1.0.0 — 2026-04-17 — Production Ready 🎉

First production-ready release. Closes the community-priority RN/Expo text-measurement gaps identified in April 2026 ecosystem research.

### Added

- **`letterSpacing` support** — `TextStyle.letterSpacing` now folds into
  segment widths everywhere measurement runs (native + JS fallback + web
  backend). Cache keys include it so different values don't collide.
  Closes [RN #54823], [RN #46436].
- **Auto cache invalidation** — `enableAutoInvalidation()` subscribes to
  system font-scale changes and (optionally) polls `expo-font`'s load
  registry. `notifyFontsLoaded()` for explicit invalidation from
  `useFonts()` effects. No more manual `clearAllCaches()` at the app
  level. Addresses [Expo #21885] (82 comments).
- **`<InkSafeText strict>`** — new `strict` prop measures ink bounds for
  every text, not just italic. Fixes Android 13+ / RN 0.78+ descender
  clipping for non-italic text. Addresses [RN #49886], [RN #53286],
  [RN #56402], [RN #15114].
- **`<TruncatedText>`** — drop-in replacement for `numberOfLines` +
  `ellipsizeMode` that computes the visible substring in JS. Supports
  `tail` / `head` / `middle` modes, no background-color artifact on
  the ellipsis, works identically on iOS / Android. Closes
  [RN #19117], [RN #41405], [RN #37926].
- **`<SafeText>` — FLAGSHIP** — line-by-line renderer that computes line
  breaks via `layoutWithLines` and emits one `<Text>` per line. Bypasses
  the entire Android wrap / cut-off regression cluster introduced in
  RN 0.78+. Accessibility label is preserved on the wrapper View so
  screenreaders read the full paragraph as one unit. Closes the cluster:
  [RN #15114], [RN #49886], [RN #53286], [RN #53666], [RN #56402],
  [RN #48921].
- **Kinsoku Shori (CJK line-break prohibitions)** — comprehensive test
  coverage of Japanese / Chinese line-start and line-end prohibitions.
  Character sets (`kinsokuStart`, `kinsokuEnd`) exposed publicly so
  custom logic can reuse them.
- **`verifyFontsLoaded()`** — diagnostic that compares requested-font
  advance vs System advance for a reference string. Detects the
  silent-fallback regression in RN 0.83 New Arch. Addresses
  [RN #54934], [RN #56309], [RN #54642].
- **Skia adapter (`measureRuns`)** — per-run records (text, bounds,
  advance, font descriptor) ready for a Skia Paragraph builder. Closes
  the precise-glyph-bounds request on [Skia #3493], [Skia #3488],
  [Skia #1736]. Measurement-only — doesn't require react-native-skia.

### Tests

- **621 passing** (was 577). `tsc --noEmit` clean. Snapshot baseline
  unchanged — all additions are transparent to existing consumers.

### Stability commitment

v1.0.0 marks the API stable. All exports documented here are supported
under semantic versioning: breaking changes only in major bumps.

## 0.19.0 — 2026-04-17

### Added

- **Hyphenation utility** — Liang-Knuth hyphenation algorithm exposed as
  a pure function. New exports:
  - `compileHyphenationPatterns(rawPatterns, { leftMin, rightMin, exceptions })`
    — parses TeX-format patterns (`"hy3ph"`, `".un2"`, …) into a fast
    lookup table.
  - `hyphenate(word, patterns)` — returns the positions inside `word`
    where a soft-hyphen break is allowed.
  - `hyphenateAndJoin(word, patterns, separator?)` — convenience that
    inserts U+00AD soft hyphens (or a custom separator) at every break.
  - Supports an exception dictionary (`'as-so-ciate'`) that overrides the
    pattern output for specific lowercased words.

### Design note

No language patterns ship with the library — they're 10–50 KB per
language and most apps need only one. Bring your own via any TeX-format
source (e.g., `hyphenation-patterns-en-us`). Keeps the core bundle tiny.

### Tests

- 577 passing (was 554). `tsc --noEmit` clean. Snapshot baseline
  unchanged — the hyphenation utility is independent of the layout
  engine.

## 0.18.0 — 2026-04-17

### Added

- **Font fallback chain.** `TextStyle.fontFamily` now accepts a single name
  **or** an array (`['Inter', 'System']`). The first loaded candidate is
  picked via `isFontLoaded`; if none is loaded, the last entry is used so
  downstream native measurement always gets a concrete string (RN does
  the same).
- **`validateFont(family)`** — public helper that returns `true` if a
  single name or **any** name in a chain is loaded. Useful at app-startup
  boundaries before kicking off measurement-heavy work.
- **`resolveFontFamily(family)`** — exposed so callers can learn which
  concrete family the chain resolved to (e.g., to match an analytics
  event or a fallback warning).

### Internal changes

- `textStyleToFontDescriptor` and `getFontKey` now normalize arrays to a
  single name; cache keys are stable across equivalent string / chain
  representations.
- `<InkSafeText>` resolves the chain before handing the style to RN's
  `<Text>` (which accepts only `string`).
- Italic-name detection in `getInkSafePadding` now inspects every entry
  in a chain (e.g., `['PlayfairDisplay-BoldItalic', 'Georgia']`).

### Tests

- 554 passing (was 537). `tsc --noEmit` clean. Snapshot baseline
  unchanged — fallback resolution is transparent when the first entry is
  loaded (the common case).

## 0.17.0 — 2026-04-17

### Accuracy

- **Exact-mode kerning cache** — `accuracy: 'exact'` (in `PrepareOptions`)
  now feeds the re-measured merged-chunk widths back into the shared width
  cache. A repeat `prepare(text, style, { accuracy: 'exact' })` on the
  same text hits the cache and skips the extra `remeasureMerged` native
  call. Previously every exact-mode call paid that cost.
- JSDoc on `PrepareOptions.accuracy` now explicitly documents the
  fast-vs-exact tradeoff: fast sums per-segment widths (sub-pixel drift
  at inter-segment boundaries for heavy-kerning fonts); exact captures
  the kerning natively with one extra call that caches after first use.

### Tests

- 537 passing (was 532). `tsc --noEmit` clean. Snapshot baseline
  unchanged (JS-fallback output is deterministic; exact-mode caching is
  a transparent optimization).

## 0.16.0 — 2026-04-17

### Correctness

- **Bidi audit** — 30 targeted tests exercising the UBA rules implemented
  in `src/bidi.ts`: pure LTR/RTL, mixed LTR+RTL with either paragraph
  direction, European numerals in Arabic context (W2, W7), neutrals (N1,
  N2), `AL → R`, NSM inheritance, surrogate-pair emoji, currency +
  digits, tatweel, tri-script sentences (Hebrew + Arabic + Latin). No
  bugs found — the implementation holds up.
- **Height snapshot regression harness** — `scripts/snapshot.ts` writes a
  deterministic 210-entry baseline (14 corpora × 3 styles × 5 widths) and
  `bun run snapshot` checks any future run against it. CI runs this on
  every PR; drift fails the job.
- **`bun run snapshot:update`** — rewrites the baseline after intentional
  engine changes; commit the updated JSON alongside the PR.
- `docs/REGRESSION.md` explains both nets (CI snapshot + on-device Tools
  accuracy check) and when each is authoritative.

### Tests

- 532 passing (was 502). `tsc --noEmit` clean.

## 0.15.0 — 2026-04-17

### Correctness hardening

- **Property-based tests (fast-check)** — 16 new tests × hundreds of random
  inputs assert the layout engine's invariants (height ≥ 0, `height ===
  lineCount * lineHeight`, narrower width ⇒ ≥ lines, `prepare()` never
  throws, etc.). +5,899 assertions.
- **Error-handling audit** — 22 tests covering `maxWidth = {0, -1, NaN,
  Infinity}`, `fontSize = {0, -10}`, lone surrogates, null bytes, 10 KB text,
  whitespace-only, mixed RTL+LTR+CJK. No code changes needed — the engine
  was already robust.

### Cache eviction

- **`widthCache` is now per-font LRU** (was unbounded `Map<Map>`) with a
  configurable budget. Long-running chat sessions no longer grow memory
  without limit.
- New public API:
  - `setCacheBudget(n)` — set the per-font LRU budget (default 10,000
    entries, ~320 KB per font).
  - `getCacheStats()` — introspect cache state for memory profiling.
- New `src/lru.ts` — small generic LRU with recency-bump on hit,
  immediate shrink on `setMaxSize`. Fully unit-tested.

### Tests

- 502 passing (was 447). `tsc --noEmit` clean.

## 0.14.0 — 2026-04-17

### Added

- **Benchmark suite** — `bun run bench` runs a microbenchmark over all the
  hot primitives (`layout`, `prepare`, `measureHeights`, `layoutWithLines`,
  `measureNaturalWidth`) and reports median / p95 / p99 / ops/s. Lives at
  [`scripts/bench.ts`](./scripts/bench.ts); latest numbers + narrative at
  [`docs/BENCHMARKS.md`](./docs/BENCHMARKS.md).
- **GitHub Actions CI** — `.github/workflows/ci.yml` runs typecheck +
  tests + bench smoke on every push and PR to `main`. Tag pushes trigger
  `.github/workflows/publish.yml` for automated `npm publish` (needs
  `NPM_TOKEN` repo secret).
- **Vercel web deploy config** — `vercel.json` at the repo root builds the
  example app for web (`expo export --platform web`) so the live demo can
  be deployed with a single `vercel --prod` from the repo root.

### README

- Badge count: 392 → 447 passing tests; benchmarks badge added.

## 0.13.1 — 2026-04-17

### Fixed

- **TypeScript cleanup** — `tsc --noEmit` now passes with zero errors.
  - `src/build.ts` — narrow `GraphemeSegmenterLike | null` at the final return.
  - `src/text-utils.ts` — `truncateText` now uses `layoutWithLines` instead
    of `layout` so the branded `PreparedTextWithSegments` handle typechecks.
  - Added `react-native-reanimated` and `@types/bun` as dev dependencies so
    the optional-peer hooks and test files resolve types during typecheck.
  - Test-only fixes: `globalThis.__DEV__ = false` now uses the standard
    `(globalThis as unknown as Record<string, unknown>)` cast; `analyzeText`
    test calls now pass a full `AnalysisProfile` instead of `{}`.

No runtime changes. Tests: 447 passing.

## 0.13.0 — 2026-04-17

### Example app

- **Developer Tools** section added to Demos with three new demos:
  - **Dynamic Type** — live re-layout across simulated font scales 1.0–2.0x;
    also subscribes to real system `onFontScaleChange` and clears caches.
  - **Debug Overlay** — wraps rows in `<PretextDebugOverlay>` showing
    predicted vs actual heights with colored borders and an accuracy tally.
  - **Snapshot Testing** — `buildHeightSnapshot` + `compareHeightSnapshots`
    interactively: pick a perturbation (font size, width, line height),
    watch the mismatch diff appear.

Closes TODO "Demo app enhancements" backlog items for Accessibility,
Debug overlay, and Snapshot testing.

## 0.12.0 — 2026-04-17

### Example app

- **Headlines Feed (10K)** — new plain-text FlashList v2 demo showing
  `useFlashListHeights().getHeight()` on 10,000 varying-length rows. Canary
  for the v0.11 hook redesign.
- Dark theme applied to Demos and Tools tabs — matches the glass NativeTabs
  aesthetic already used in Home and Bug Fixes.

## 0.11.0 — 2026-04-17

### Breaking

- **`useFlashListHeights`** redesigned for **FlashList v2**. The v1 API
  (`estimatedItemSize`, `overrideItemLayout` with `layout.size`) is gone in
  FlashList v2, so the hook now returns `{ getHeight(item) }`. Set it as an
  explicit `height` on the wrapping View inside `renderItem`; FlashList v2
  skips a measurement frame and eliminates first-paint jitter.

  ```tsx
  const { getHeight } = useFlashListHeights(data, getText, style, width)

  <FlashList
    data={data}
    renderItem={({ item }) => (
      <View style={{ height: getHeight(item) + PADDING }}>
        <Text style={style}>{getText(item)}</Text>
      </View>
    )}
  />
  ```

  Use the hook for plain-text lists. For rich content (Markdown, mixed
  components) where rendered height differs from text measurement, let
  FlashList v2 auto-measure instead — don't pass an explicit height.

  Closes [#1](https://github.com/JubaKitiashvili/expo-pretext/issues/1).

### Example app

- Removed stale `useFlashListHeights` calls from `MarkdownChat` and the
  `/chat` demo — both render markdown, so FlashList v2's auto-measurement
  is the correct path for them.

### Tests

- 447 automated tests (all passing).

## 0.10.0 — 2026-04-14

### Added

- **`<InkSafeText>`** — drop-in `<Text>` replacement that auto-fixes italic/bold
  text clipping. No wrapper View, no manual padding. Non-italic text renders with
  zero overhead.
- **`useInkSafeStyle(text, style)`** — React hook returning merged style with
  ink-safe padding + `inkWidth` for container sizing.
- **`getInkSafePadding(text, style)`** — pure function for FlashList/imperative
  use. Returns padding, ink width, advance, ink bounds, and overshoot flag.
- **`measureInkSafe`** native function (iOS + Android) — single bridge call
  returning ink bounds + advance width + font metrics. Replaces 3 separate calls.

### Example app

- Restructured from 4 flat tabs to Home / Demos / Bug Fixes / Tools
- Home hero screen with library tagline, key metrics, and featured demo cards
- Demos categorized into 4 sections: Real-World, Text Effects, Advanced Layout, Interactive
- New "Read More / Less" demo with typewriter reveal + speed control
- Upgraded to **Expo SDK 55** with NativeTabs, SF Symbols, and glass blur effect
- AI Chat moved from standalone tab into Demos category

### Tests

- 402 automated tests (was 392)
- New: `src/__tests__/ink-safe.test.ts` (6 tests)
- New: integration tests for `getInkSafePadding` (3 tests)

---

## 0.9.0 — 2026-04-12

### Added

- **`measureInkWidth(text, style)`** — cross-platform ink-bounds text
  measurement. Returns the real glyph image-bound width rather than
  advance width. Use this to size containers for italic and bold-italic
  text where glyph outlines overshoot advance widths, fixing
  [RN #56349](https://github.com/facebook/react-native/issues/56349)-class
  clipping at the measurement layer.

  - iOS: `NSAttributedString.boundingRect` with `.usesDeviceMetrics`
  - Android: `Paint.getTextBounds` (tight ink bounding rect)
  - Web: `TextMetrics.actualBoundingBoxLeft + actualBoundingBoxRight`

### Native module additions

- iOS: `measureInkWidth` function with dedicated `inkMeasureCache`
- Android: `measureInkWidth` function with dedicated `inkMeasureCache`
- `clearNativeCache()` now clears both advance and ink caches

### Tests

- 392 automated tests (was 386)
- New: `src/__tests__/ink-width.test.ts` (5 tests)
- New: integration sanity check for `measureInkWidth`

### Bug fixes

- Fixed TypeScript narrowing error in web-backend.ts for
  `fontWeight`/`fontStyle` string types

## 0.8.3 — 2026-04-11

### Docs

- README: two hero demo reels (720w @ 30fps) replacing the old three-up
  thumbnail grid — one full AI-chat demo, one creative demos reel.
- MarkdownChat example: white assistant bubble on a slightly darker
  page background, user bubbles capped at `laneWidth * 0.78`, container
  sizing matches the `userMax` constraint for both roles.
- Rewrote the production-ready tagline to drop the internal version
  comparison and lead with concrete capabilities.

No library changes — ship `expo-pretext@0.8.3` only if you want the
updated README and example app.

## 0.8.2 — 2026-04-11

### Example app polish (no library changes)

This release is a demo-quality pass on the `example/` app. The library
itself is unchanged from v0.8.1 — ship `expo-pretext@0.8.2` only if you
want the updated demo app as a reference.

**New design language across interactive demos:**
- **Pinch to Zoom** — fixed-height bubble with internal scroll, metrics
  grid (scale / fontSize / height / lines), interactive slider, tap to
  cycle discrete zoom levels. Uses `useTextHeight` for native TextKit
  accuracy instead of JS line-break.
- **Breakout Text (PRETEXT BREAKER)** — full arcade game: score/lives/
  level header card, colored word bricks from a meaningful sentence,
  live prose background that reflows around ball and bricks via
  `layoutColumn()` at 60fps, rigid-body brick physics (gravity, wall
  and paddle bounces), power modifiers (SLOW / MULTI / EXPAND), game
  over overlay.
- **Text Path** — animated sine curve with per-character rotation along
  the tangent, HSL color gradient, draggable amplitude slider, wave
  count cycling, pause/resume.
- **Umbrella Reflow** — pretty layered umbrella (canopy panels, scalloped
  tips, wooden handle with grain, J-shaped hook, top knob) casting a
  full shadow column that blocks the Matrix-style rain at 60fps.

**Bug fixes (all in example app, not library):**
- Fixed `PanResponder` slider/paddle drag oscillation by using
  `gestureState.moveX` (absolute page coordinate) instead of
  `nativeEvent.locationX` which alternates between nested hit targets.
- Fixed onLayout feedback loops that caused scale-change flicker.
- Fixed gesture handler conflicts between `Pressable` and
  `GestureDetector` in the zoom demo.

**Removed:**
- `Rich Inline Flow` demo removed pending a cleaner API-level solution
  to library vs RN Text font metric drift on atomic pills.

### Tests

- 386 automated tests (unchanged from v0.8.1)

## 0.8.1 — 2026-04-11

See git log — prepare() batch throughput optimizations.

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
