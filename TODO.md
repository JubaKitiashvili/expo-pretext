# expo-pretext TODO

> Ordered by priority. Checked items are shipped.

---

## ~~P0 — v0.3.x (DONE)~~ ✅

- [x] 8 upstream O(n²)→O(n) perf fixes ported
- [x] 220→270 automated tests, all core modules covered

## ~~P1 — v0.4.0-0.5.0 (DONE)~~ ✅

- [x] Token-level streaming API (getLastLineWidth, measureTokenWidth, useStreamingLayout)
- [x] useFlashListHeights batch pre-warming via measureHeights
- [x] FlashList 2.3.1 + RN 0.79 Fabric + Expo SDK 53 verified
- [x] Expo Web support (Canvas + Intl.Segmenter backend)

## ~~P2 API Additions — v0.6.0 (DONE)~~ ✅

- [x] fitFontSize — binary search for optimal font size in a box
- [x] truncateText — truncate to N lines with ellipsis
- [x] customBreakRules — callback to override line break opportunities
- [x] useMultiStreamLayout — parallel AI streaming hook

---

## ~~Tier 1: AI Chat Experience — v0.6.1–v0.6.2 (DONE)~~ ✅

- [x] Upstream JS triage (#120, #121, #119, #105) — 4 upstream issues checked, none reproducible
- [x] **Typewriter effect** — `useTypewriterLayout` hook + `buildTypewriterFrames`
- [x] **Code block syntax-aware height** — `measureCodeBlockHeight` utility

## ~~Tier 2: Flagship Demos — v0.6.3–v0.7.0 (DONE)~~ ✅

- [x] **useObstacleLayout hook** — Editorial Engine pattern promoted to hook
- [x] **Text morphing** — `useTextMorphing` + `buildTextMorph`
- [x] **useAnimatedTextHeight** — Reanimated SharedValue integration
- [x] **Collapsible sections** — `useCollapsibleHeight` with pre-computed expanded/collapsed
- [x] **Pinch-to-zoom text** — `usePinchToZoomText` + `computeZoomLayout`
- [x] v0.7.0 milestone: Animation & AI Suite complete

## ~~Tier 3: Production Readiness — v0.7.1–v0.7.3 (DONE)~~ ✅

- [x] **Dynamic Type / Accessibility** — `getFontScale`, `onFontScaleChange`, `clearAllCaches`
- [x] **iOS/Android reconciliation** — `ENGINE_PROFILES`, `setEngineProfile`, consistent mode
- [x] **Font metrics API** — `getFontMetrics` with iOS UIFont + Android Paint.FontMetrics + Web Canvas

## ~~Tier 4: DX & Developer Tools — v0.7.4 (DONE)~~ ✅

- [x] **Debug overlay** — `<PretextDebugOverlay>` + `compareDebugMeasurement`
- [x] **Snapshot testing** — `buildHeightSnapshot` + `compareHeightSnapshots` for CI
- [x] **Performance budget** — `prepareWithBudget` + `PrepareBudgetTracker`
- [x] v0.8.0 milestone: Production Ready

## ~~Tier 5: Engine Optimization — v0.8.1 (DONE)~~ ✅

- [x] **prepare() batch throughput** — measureHeights pre-warm, flushPending dedup, getAnalysisProfile hoist

## ~~Example App Polish — v0.8.2 (DONE)~~ ✅

- [x] **Pinch to Zoom** redesigned — fixed-height bubble + internal scroll, metrics grid, interactive slider, tap-to-cycle, `useTextHeight` for native TextKit accuracy
- [x] **Breakout Text (PRETEXT BREAKER)** arcade game — live prose background reflowing around ball and bricks via `layoutColumn()` at 60fps, rigid-body brick physics, power modifiers, game over overlay
- [x] **Text Path** — animated sine curve with per-character tangent rotation, HSL gradient, amplitude slider, wave cycling
- [x] **Umbrella Reflow** — layered umbrella casting shadow column that blocks Matrix rain at 60fps
- [x] Fixed `PanResponder` slider drag oscillation across 3 demos (use `gestureState.moveX`, not `nativeEvent.locationX`)
- [x] Fixed onLayout feedback loops and gesture handler conflicts
- [x] Removed Rich Inline Flow demo pending cleaner API solution

## ~~Ink-bounds Measurement — v0.9.0 (DONE)~~ ✅

- [x] **`measureInkWidth(text, style)`** — cross-platform ink-bounds API for italic/bold-italic container sizing. Fixes RN #56349 at measurement layer.
  - iOS: `NSAttributedString.boundingRect(.usesDeviceMetrics)`
  - Android: `Paint.getTextBounds`
  - Web: `TextMetrics.actualBoundingBoxLeft + actualBoundingBoxRight`
- [x] Separate native `inkMeasureCache` with LRU eviction on all platforms
- [x] Fixed TypeScript fontWeight/fontStyle narrowing in web-backend.ts

## ~~README & Docs — v0.8.3 (DONE)~~ ✅

- [x] Two hero demo reels (720w @ 30fps) replacing three-up thumbnail grid
- [x] MarkdownChat example polish — white assistant bubble, darker background, proper max-width cap
- [x] Rewrote production-ready tagline for outside readers

## ~~FlashList v2 migration — v0.11.0 (DONE)~~ ✅

- [x] **`useFlashListHeights`** redesigned — returns `{ getHeight(item) }` for v2
- [x] Removed stale hook usage from MarkdownChat and /chat demos (markdown ≠ text height)
- [x] README updated with new pattern + guidance on plain-text vs rich content
- [x] Closes GitHub issue #1

## ~~InkSafeText API + App Restructure — v0.10.0 (DONE)~~ ✅

- [x] **`<InkSafeText>`** — drop-in `<Text>` replacement with auto italic-safe padding
- [x] **`useInkSafeStyle`** — hook returning merged style + inkWidth
- [x] **`getInkSafePadding`** — pure function for FlashList/imperative use
- [x] **`measureInkSafe`** — single native call (ink bounds + advance + metrics)
- [x] iOS safety insets for raster scanning anti-aliasing
- [x] Font name italic detection (e.g. PlayfairDisplay-BoldItalic)
- [x] Example app restructured: Home / Demos (categorized) / Bug Fixes / Tools
- [x] Read More / Less demo with typewriter reveal + speed control
- [x] Upgraded to Expo SDK 55 — NativeTabs, SF Symbols, glass blur
- [x] README "Fix Italic Clipping" section with 3-layer API docs

---

## Deferred (wait for user feedback before implementing)

These were originally in Tier 5 but deferred — the current implementation is
good enough for typical use cases, and real-world impact is unproven.

- [ ] **Hermes Intl.Segmenter C++ fallback** — only affects ZWJ emoji edge cases; current spread-operator fallback works for 99% of cases. Reconsider if users report emoji rendering issues.
- [ ] **iPad split-screen / foldable optimization** — `layout()` is already 0.0002ms; batch re-layout on Dimensions change is a convenience hook, not a performance necessity. Reconsider if users report slow width transitions.

---

## Follow-up work (post-v0.8.x)

### Demo app enhancements

- [x] Typewriter demo using `useTypewriterLayout`
- [x] Text morphing demo ("Thinking..." → response transition)
- [x] Pinch-to-zoom demo using `usePinchToZoomText`
- [x] Breakout Text arcade game (flagship `layoutColumn()` demo)
- [x] Text Path with per-character tangent rotation
- [x] Umbrella Reflow (Matrix rain + shadow blocking)
- [ ] Accessibility demo with `onFontScaleChange`
- [ ] Debug overlay demo showing predicted vs actual
- [ ] Snapshot testing example in CI

### Documentation

- [ ] Dedicated docs site (inspired by pretextjs.dev)
- [ ] Migration guide from v0.6 → v0.8
- [ ] API reference with all 22+ public exports
- [ ] Performance benchmarks page
- [ ] Ecosystem page (companion packages, community demos)

### Ecosystem

- [ ] Companion package: `expo-pretext-markdown` (extracted from example/components/MarkdownRenderer)
- [ ] Companion package: `expo-pretext-flashlist` (FlashList-specific helpers)
- [ ] Blog post / announcement about v0.8.0 production release
- [ ] Submit to awesome-react-native

---

## Principles (not tasks)

- Accuracy demo = primary canary. Every release: PASS on all test widths.
- CJK most sensitive, Arabic/Georgian/Thai secondary canaries.
- AI chat demo = primary dogfood. Editorial demos = rich line API dogfood.
- Native measurement = ground truth. JS fallback = safety net.
- Keep layout() allocation-light. prepare() is the bottleneck.
- Never blindly port upstream web fixes — our native backends differ fundamentally.
- Each task: analyze code → implement → audit → test → verify → commit → next.
- Every version: git push + npm publish. Never leave local-only.
- Every task: full test suite + integration tests. Never unit tests alone.

## Not worth doing

- Full markdown renderer in core (extract to companion package instead)
- Measurement in layout()
- Font loading/management (expo-font's job)
- Text rendering (RN Text's job)
- Cache tuning knobs in public API
- Pixel-perfect accuracy as product claim
- onLayout fallback reconciliation
- Camera/AR/ML integration (application-layer, not library concern)

## Open design questions

- Whether prepareStreaming should carry forward line-break state
- Whether whiteSpace: 'pre-wrap' should handle configurable tab stops
- Whether obstacle layout should support arbitrary shapes (upstream #99)
- Whether measureNaturalWidth should extend to rich inline flow
- Whether a validateFont utility should be exported
- Whether a diagnostic verify mode (JS vs native comparison) is worth having
- Whether typewriter and morphing hooks need a shared animation primitive
