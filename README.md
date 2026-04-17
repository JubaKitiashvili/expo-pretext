# expo-pretext

**The text layout primitive React Native was missing.** Native measurement, ~0.0002ms pure-JS layout arithmetic, and full control over how text flows — around shapes, inside gestures, through animations. All with regular `<View>` and `<Text>`. No Skia canvas, no SVG tricks.

[![npm](https://img.shields.io/npm/v/expo-pretext.svg)](https://www.npmjs.com/package/expo-pretext)
[![license](https://img.shields.io/npm/l/expo-pretext.svg)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-621%20passing-brightgreen.svg)](./src/__tests__)
[![benchmarks](https://img.shields.io/badge/benchmarks-docs-blue.svg)](./docs/BENCHMARKS.md)

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
| **Layout primitives** | `layoutColumn` (obstacles), `useObstacleLayout`, `fitFontSize`, `truncateText`, `customBreakRules`, `measureNaturalWidth`, `measureInkWidth` (italic-safe) |
| `<InkSafeText>` | Drop-in `<Text>` replacement — auto-fixes italic/bold clipping |
| **Virtualization** | `useTextHeight`, `useFlashListHeights`, `measureHeights` (batch) |
| **Streaming AI chat** | `useStreamingLayout`, `useMultiStreamLayout`, `prepareStreaming`, `measureCodeBlockHeight` |
| **Animation (Reanimated)** | `useAnimatedTextHeight`, `useCollapsibleHeight`, `usePinchToZoomText`, `useTypewriterLayout`, `useTextMorphing` |
| **Rich inline flow** | `prepareInlineFlow`, `walkInlineFlowLines`, `measureInlineFlow` — mixed fonts, @mentions, pills |
| **Accessibility** | `getFontScale`, `onFontScaleChange`, `clearAllCaches` — Dynamic Type reactive |
| **Cross-platform consistency** | `ENGINE_PROFILES`, `setEngineProfile`, `getEngineProfile` — iOS ≡ Android ≡ Web |
| **Font metrics** | `getFontMetrics` — native `UIFont` / `Paint.FontMetrics` / Web Canvas fallback |
| **Developer tools** | `<PretextDebugOverlay>`, `compareDebugMeasurement`, `buildHeightSnapshot`, `compareHeightSnapshots`, `prepareWithBudget`, `PrepareBudgetTracker` |
| **Power API** | `prepare`, `layout`, `layoutWithLines`, `layoutNextLine`, `walkLineRanges`, `prepareWithSegments` |

See [`src/index.ts`](./src/index.ts) for the full public surface.

## Internationalization

Full Unicode via native OS segmenters. No locale hacks, no userland `Intl` polyfills, no manual script detection:

- **CJK** (Chinese, Japanese, Korean) — per-character breaking with kinsoku rules
- **Arabic, Hebrew** — RTL with bidi metadata
- **Thai, Lao, Khmer, Myanmar** — dictionary-based word boundaries
- **Georgian, Devanagari, Armenian, Ethiopic** — all native scripts
- **Emoji** — compound graphemes, flag sequences, ZWJ family joiners
- **Mixed scripts** in a single string, measured correctly

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
