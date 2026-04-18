# expo-pretext

**The text layout primitive React Native was missing.** Native measurement, ~0.0002ms pure-JS layout arithmetic, and full control over how text flows — around shapes, inside gestures, through animations. All with regular `<View>` and `<Text>`. No Skia canvas, no SVG tricks.

**v1.0.0 is here.** Production-ready. Closes [18+ open React Native text bugs](#v100--fixes-for-18-open-rnexpo-text-bugs) — Android cut-off clusters, italic clipping, `numberOfLines` edge cases, font-load races, silent font fallback, and CJK typography.

[![npm](https://img.shields.io/npm/v/expo-pretext.svg)](https://www.npmjs.com/package/expo-pretext)
[![license](https://img.shields.io/npm/l/expo-pretext.svg)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-637%20passing-brightgreen.svg)](./src/__tests__)
[![benchmarks](https://img.shields.io/badge/benchmarks-docs-blue.svg)](./docs/BENCHMARKS.md)
[![live demo](https://img.shields.io/badge/live%20demo-expo--pretext.vercel.app-ffd369.svg)](https://expo-pretext.vercel.app)

<p align="center">
  <img src="https://github.com/JubaKitiashvili/expo-pretext/raw/main/assets/demos/hero.gif" width="720" alt="expo-pretext demo reel" />
</p>

<p align="center">
  <img src="https://github.com/JubaKitiashvili/expo-pretext/raw/main/assets/demos/hero-reel.gif" width="720" alt="expo-pretext creative demos reel" />
</p>

---

## What React Native couldn't do before

Flexbox is rectangular boxes all the way down. iOS TextKit has `NSTextContainer.exclusionPaths`. CSS has `shape-outside`. The native capability exists on every platform — React Native just never exposed it. Even `react-native-skia`'s `Paragraph` API is rectangle-only ([open issue since 2022](https://github.com/Shopify/react-native-skia/issues/968)).

expo-pretext closes that gap:

- **Text reflow around arbitrary shapes** — circles, rectangles, or any polygon. Magazine-style layouts, circular avatars with wrapping captions, text that reacts to moving obstacles.
- **Exact heights before render** — FlashList virtualization with zero `onLayout` jumps, even for 10k messages with rich markdown.
- **Per-frame layout recomputation** — `layout()` runs in ~0.0002ms, fast enough to run 120+ times per frame during gestures, physics, or animations.
- **Streaming AI chat** — cache-aware incremental measurement for token-by-token reveals.
- **Regular RN rendering tree** — A11y, Dynamic Type, selection, copy/paste, VoiceOver, RTL, emoji ZWJ — all work, because you're still using `<Text>`.

## Why it's fast

```
prepare(text, style)         One native measurement call per text
  → Native:  iOS TextKit / Android TextPaint / Web Canvas
  → Returns: cached segment widths + break opportunities
  → Time:    ~15ms for 500 texts in a batch

layout(prepared, maxWidth)   Pure JS arithmetic on cached data
  → No native bridge, no DOM, no reflow
  → Time:    ~0.0002ms per text
  → Safe to call 120+ times per frame
```

The flagship demo is a [Breakout arcade game](./example/components/demos/BreakoutText.tsx) where the live prose background reflows around the ball, the paddle, and every falling brick at 60fps. It exists to prove the performance claim visually, not just in a benchmark.

## Install

```sh
npx expo install expo-pretext
```

Requires Expo SDK 52+, React Native 0.76+, New Architecture / Fabric. Reanimated is an optional peer dependency used only by the animation hooks. Expo Go falls back to JS estimates — use a development build for native measurement.

## Quick start

### Text height before render

```tsx
import { useTextHeight } from 'expo-pretext'

function ChatBubble({ text, maxWidth }) {
  const height = useTextHeight(text, {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 24,
  }, maxWidth)

  return <View style={{ height }}><Text>{text}</Text></View>
}
```

### FlashList with exact heights (v2)

`useFlashListHeights` pre-warms a height cache in the background and returns
`getHeight(item)` — set it as an explicit height on the wrapping View inside
`renderItem`. FlashList v2 skips the measurement pass when the height is known,
eliminating first-paint jitter for plain-text lists.

```tsx
import { useFlashListHeights } from 'expo-pretext'
import { FlashList } from '@shopify/flash-list'
import { View, Text } from 'react-native'

const STYLE = { fontFamily: 'Inter', fontSize: 16, lineHeight: 24 }
const PAD_Y = 10

function ChatScreen({ messages, width }) {
  const { getHeight } = useFlashListHeights(
    messages,
    msg => msg.text,
    STYLE,
    width,
  )

  return (
    <FlashList
      data={messages}
      keyExtractor={m => m.id}
      renderItem={({ item }) => (
        <View style={{ height: getHeight(item) + PAD_Y * 2 }}>
          <Text style={STYLE}>{item.text}</Text>
        </View>
      )}
    />
  )
}
```

> For plain `<Text>` content, `getHeight(item)` returns the exact rendered
> height (FlashList v2 no longer accepts `estimatedItemSize` or a size-bearing
> `overrideItemLayout`). For rich content like Markdown or mixed components,
> let FlashList v2 auto-measure instead.

### Text reflow around a shape

```tsx
import { useObstacleLayout } from 'expo-pretext'

function MagazineLayout({ text, width }) {
  const layout = useObstacleLayout(
    text,
    { fontFamily: 'Georgia', fontSize: 18, lineHeight: 28 },
    { x: 0, y: 0, width, height: 600 },
    // circular avatar to flow around
    [{ cx: 80, cy: 80, r: 64 }],
  )

  return (
    <View style={{ height: layout.height }}>
      {layout.lines.map((line, i) => (
        <Text key={i} style={{ position: 'absolute', left: line.x, top: line.y }}>
          {line.text}
        </Text>
      ))}
      <Image source={avatar} style={{ position: 'absolute', width: 128, height: 128, borderRadius: 64 }} />
    </View>
  )
}
```

### Streaming AI chat with incremental measurement

```tsx
import { useStreamingLayout } from 'expo-pretext'

function StreamingBubble({ text, maxWidth }) {
  // Auto-detects append pattern. Cache-aware. ~2ms per token.
  const { height, lineCount, doesNextTokenWrap } = useStreamingLayout(text, style, maxWidth)
  return (
    <View style={{ minHeight: height }}>
      <Text>{text}</Text>
    </View>
  )
}
```

### Pinch-to-zoom text at 60fps

```tsx
import { usePinchToZoomText } from 'expo-pretext/animated'
import Animated from 'react-native-reanimated'

function ZoomableText({ text, maxWidth }) {
  const zoom = usePinchToZoomText(text, baseStyle, maxWidth, {
    minFontSize: 8,
    maxFontSize: 48,
  })
  // layout() runs per frame. 120+ recalculations/frame possible.
  return <Animated.Text style={[baseStyle, zoom.animatedStyle]}>{text}</Animated.Text>
}
```

### Balanced headlines + widow-free paragraphs (CSS `text-wrap: balance` / `pretty`)

Chrome 114+ shipped `text-wrap: balance`; Safari 17.5 followed. Firefox took a year. On React Native, neither iOS nor Android has any equivalent. `<BalancedText>` / `<PrettyText>` ship both on every platform — pixel-identical across iOS, Android, and Expo Web. Under 10 µs per invocation.

```tsx
import { BalancedText, PrettyText } from 'expo-pretext'

// Balanced — no lonely last word
<BalancedText
  style={{ fontFamily: 'Inter', fontSize: 32, fontWeight: '700', lineHeight: 40 }}
  maxWidth={cardWidth}
>
  {headline}
</BalancedText>

// Pretty — widow-free paragraph tails
<PrettyText
  style={{ fontFamily: 'Georgia', fontSize: 16, lineHeight: 24 }}
  maxWidth={columnWidth}
>
  {articleText}
</PrettyText>
```

See the [live web playground](https://expo-pretext.vercel.app) — same demo on iOS, Android, and a browser at the URL above.

### Line-by-line rendering (bypasses Android wrap/cut-off bugs)

Since RN 0.78, Android's text renderer has regressed in several ways: descender clipping, text disappearing under certain font weights, extra wraps from `letterSpacing`. `<SafeText>` computes line breaks ourselves and emits one `<Text>` per line — RN has no wrap decision left to make, and cut-off goes away.

```tsx
import { SafeText } from 'expo-pretext'

<SafeText
  style={{ fontFamily: 'Inter', fontSize: 16, lineHeight: 24 }}
  maxWidth={containerWidth}
>
  {paragraphText}
</SafeText>
```

Closes [RN #15114](https://github.com/facebook/react-native/issues/15114), [#49886](https://github.com/facebook/react-native/issues/49886), [#53286](https://github.com/facebook/react-native/issues/53286), [#53666](https://github.com/facebook/react-native/issues/53666), [#56402](https://github.com/facebook/react-native/issues/56402), [#48921](https://github.com/facebook/react-native/issues/48921).

### Truncation without `numberOfLines` edge cases

`numberOfLines` + `ellipsizeMode` has long-standing issues: Android's `middle` / `head` modes break for multi-line; iOS drops the ellipsis when the source has `\n`; the ellipsis inherits the trimmed text's background color. `<TruncatedText>` computes the visible substring in JS and renders it as plain text.

```tsx
import { TruncatedText } from 'expo-pretext'

<TruncatedText
  style={{ fontFamily: 'Inter', fontSize: 14 }}
  maxWidth={containerWidth}
  maxLines={3}
  mode="tail"   // or 'head' / 'middle'
>
  {longArticleText}
</TruncatedText>
```

Closes [RN #19117](https://github.com/facebook/react-native/issues/19117), [#41405](https://github.com/facebook/react-native/issues/41405), [#37926](https://github.com/facebook/react-native/issues/37926).

### Auto cache invalidation on font load / Dynamic Type

Call `enableAutoInvalidation()` once at app root; caches clear automatically on system font-scale changes and on `expo-font` load events.

```tsx
import { enableAutoInvalidation, notifyFontsLoaded } from 'expo-pretext'
import { useFonts } from 'expo-font'

export default function App() {
  const [loaded] = useFonts({ Inter: require('./Inter.ttf') })

  useEffect(() => {
    const stop = enableAutoInvalidation()
    return stop
  }, [])

  useEffect(() => {
    if (loaded) notifyFontsLoaded()
  }, [loaded])

  // …
}
```

Addresses [Expo #21885](https://github.com/expo/expo/issues/21885) (82 comments on `useFonts` reliability).

### Detect silent font fallback (RN 0.83 New Arch)

Custom fonts sometimes report as loaded but fall back to System. `verifyFontsLoaded()` measures a reference string with the requested font vs System and reports whether the custom font is actually applied.

```ts
import { verifyFontsLoaded } from 'expo-pretext'

const v = verifyFontsLoaded({ fontFamily: 'Inter', fontSize: 16 })
if (v && !v.applied) {
  console.warn('Inter is not being applied — falling back to System')
}
```

Closes [RN #54934](https://github.com/facebook/react-native/issues/54934), [#56309](https://github.com/facebook/react-native/issues/56309), [#54642](https://github.com/facebook/react-native/issues/54642).

### Skia adapter — `measureRuns()`

For `react-native-skia` users who need precise glyph bounds with font fallback resolved in JS ([Skia #3493](https://github.com/Shopify/react-native-skia/issues/3493), [#3488](https://github.com/Shopify/react-native-skia/issues/3488), [#1736](https://github.com/Shopify/react-native-skia/issues/1736)).

```ts
import { measureRuns } from 'expo-pretext'

const { naturalWidth, naturalHeight, runs } = measureRuns('Hello', style)
// runs: Array<{ text, bounds, advance, font: { family, size, weight, style } }>
```

Pure measurement — doesn't require `react-native-skia` installed.

### Fix italic text clipping (RN #56349)

React Native sizes text containers to advance width, but italic glyphs extend beyond that — causing visual clipping. expo-pretext fixes this with ink-bounds measurement.

**Drop-in fix — one component:**

```tsx
import { InkSafeText } from 'expo-pretext'

// Before (clips):  <Text style={style}>fly</Text>
// After (fixed):
<InkSafeText style={{
  fontFamily: 'Georgia',
  fontSize: 80,
  fontWeight: 'bold',
  fontStyle: 'italic',
}}>
  fly
</InkSafeText>
```

`<InkSafeText>` is a drop-in `<Text>` replacement. Non-italic text renders with zero overhead.

**Custom container sizing — hook:**

```tsx
import { useInkSafeStyle } from 'expo-pretext'

const { style: safeStyle, inkWidth } = useInkSafeStyle(text, baseStyle)

<View style={{ width: inkWidth, overflow: 'hidden' }}>
  <Text style={safeStyle} numberOfLines={1}>{text}</Text>
</View>
```

**FlashList / imperative — pure function:**

```tsx
import { getInkSafePadding } from 'expo-pretext'

const { padding, inkWidth } = getInkSafePadding(text, style)
```

## Feature tour

| Category | What you get |
|---|---|
| **Drop-in components** | `<SafeText>`, `<TruncatedText>`, `<InkSafeText>` |
| **Layout primitives** | `layoutColumn` (obstacles), `useObstacleLayout`, `fitFontSize`, `truncateText`, `customBreakRules`, `measureNaturalWidth`, `measureInkWidth` (italic-safe) |
| **Virtualization** | `useTextHeight`, `useFlashListHeights`, `measureHeights` (batch) |
| **Streaming AI chat** | `useStreamingLayout`, `useMultiStreamLayout`, `prepareStreaming`, `measureCodeBlockHeight` |
| **Animation (Reanimated)** | `useAnimatedTextHeight`, `useCollapsibleHeight`, `usePinchToZoomText`, `useTypewriterLayout`, `useTextMorphing` |
| **Rich inline flow** | `prepareInlineFlow`, `walkInlineFlowLines`, `measureInlineFlow` — mixed fonts, @mentions, pills |
| **Accessibility** | `getFontScale`, `onFontScaleChange`, `clearAllCaches`, `enableAutoInvalidation`, `notifyFontsLoaded` |
| **Cross-platform consistency** | `ENGINE_PROFILES`, `setEngineProfile`, `getEngineProfile` — iOS ≡ Android ≡ Web |
| **Font metrics + fallback** | `getFontMetrics`, `resolveFontFamily`, `validateFont`, `verifyFontsLoaded` |
| **Hyphenation** | `compileHyphenationPatterns`, `hyphenate`, `hyphenateAndJoin` (Liang-Knuth; bring your own TeX patterns) |
| **Skia adapter** | `measureRuns` — per-run bounds + advance + font for Skia Paragraph |
| **Developer tools** | `<PretextDebugOverlay>`, `compareDebugMeasurement`, `buildHeightSnapshot`, `compareHeightSnapshots`, `prepareWithBudget`, `PrepareBudgetTracker` |
| **Power API** | `prepare`, `layout`, `layoutWithLines`, `layoutNextLine`, `walkLineRanges`, `prepareWithSegments` |

See [`src/index.ts`](./src/index.ts) for the full public surface.

## v1.0.0 — fixes for 18+ open RN/Expo text bugs

| # | Feature | Closes |
|---|---------|--------|
| 1 | `letterSpacing` support | [RN #54823](https://github.com/facebook/react-native/issues/54823), [#46436](https://github.com/facebook/react-native/issues/46436) |
| 2 | Auto cache invalidation | [Expo #21885](https://github.com/expo/expo/issues/21885) (82 comments) |
| 3 | `<InkSafeText strict>` | [RN #49886](https://github.com/facebook/react-native/issues/49886), [#53286](https://github.com/facebook/react-native/issues/53286), [#56402](https://github.com/facebook/react-native/issues/56402), [#15114](https://github.com/facebook/react-native/issues/15114) |
| 4 | `<TruncatedText>` | [RN #19117](https://github.com/facebook/react-native/issues/19117), [#41405](https://github.com/facebook/react-native/issues/41405), [#37926](https://github.com/facebook/react-native/issues/37926) |
| 5 | `<SafeText>` (flagship) | [RN #15114](https://github.com/facebook/react-native/issues/15114), [#49886](https://github.com/facebook/react-native/issues/49886), [#53286](https://github.com/facebook/react-native/issues/53286), [#53666](https://github.com/facebook/react-native/issues/53666), [#56402](https://github.com/facebook/react-native/issues/56402), [#48921](https://github.com/facebook/react-native/issues/48921) |
| 6 | Kinsoku Shori (CJK) | Japanese / Chinese line-break correctness |
| 7 | `verifyFontsLoaded()` | [RN #54934](https://github.com/facebook/react-native/issues/54934), [#56309](https://github.com/facebook/react-native/issues/56309), [#54642](https://github.com/facebook/react-native/issues/54642) |
| 8 | `measureRuns()` Skia adapter | [Skia #3493](https://github.com/Shopify/react-native-skia/issues/3493), [#3488](https://github.com/Shopify/react-native-skia/issues/3488), [#1736](https://github.com/Shopify/react-native-skia/issues/1736) |

## Internationalization

Full Unicode via native OS segmenters. No locale hacks, no userland `Intl` polyfills, no manual script detection:

- **CJK** (Chinese, Japanese, Korean) — per-character breaking with Kinsoku Shori (`、。）」` never start a line; `（「『` never end one) — locked in with 13 targeted tests
- **Arabic, Hebrew** — RTL with bidi metadata; full UBA rules covered by 30 tests
- **Thai, Lao, Khmer, Myanmar** — dictionary-based word boundaries
- **Georgian, Devanagari, Armenian, Ethiopic** — all native scripts
- **Emoji** — compound graphemes, flag sequences, ZWJ family joiners
- **Mixed scripts** in a single string, measured correctly
- **Hyphenation** (Liang-Knuth) — user-supplied TeX patterns, any language

## Performance

| Operation | Cost |
|---|---|
| `prepare()` batch | ~15ms for 500 texts |
| `layout()` per call | ~0.0002ms (pure arithmetic) |
| Streaming token | ~2ms (mostly cache hits) |
| Native cache | LRU 5000 segments/font, frequency-based eviction |
| JS cache | Skip native calls entirely when all segments are cached |

## Accuracy

expo-pretext uses native platform text measurement — the same engines that render your text. Two modes:

- **`fast`** (default): sum individual segment widths. Sub-pixel kerning differences absorbed by tolerance.
- **`exact`**: re-measure merged segments. Pixel-perfect at the cost of one extra native call.

Cross-platform drift between iOS, Android, and Web is bounded by `ENGINE_PROFILES` — use `consistent` mode when you need identical layouts across all three.

## Platform support

| Platform | Backend | Status |
|---|---|---|
| iOS | TextKit (`NSLayoutManager`, `NSAttributedString`, `CFStringTokenizer`) | New Architecture / Fabric verified |
| Android | `TextPaint`, `BreakIterator`, `Paint.FontMetrics` | Kotlin native module |
| Expo Web | `CanvasRenderingContext2D.measureText` + `Intl.Segmenter` | Zero API changes |
| Expo Go | JS estimates (no native measurement) | Use a dev build for production |

Verified against FlashList 2.3.1, React Native 0.83, Expo SDK 55.

## Credits

expo-pretext is a React Native / Expo / Web port of [Pretext](https://github.com/chenglou/pretext) by Cheng Lou. The core line-breaking algorithm is ported; the measurement backends are new (iOS TextKit, Android TextPaint, Web Canvas instead of DOM APIs). Pretext itself builds on Sebastian Markbage's [text-layout](https://github.com/nicolo-ribaudo/text-layout) research.

## License

MIT
