# expo-pretext

DOM-free multiline text height prediction for React Native. Port of [Pretext](https://github.com/chenglou/pretext).

Predict text heights **before rendering** — no `onLayout`, no layout jumps, no guesswork. Works with FlashList, streaming AI chat, typewriter effects, text-around-obstacles layouts, pinch-to-zoom, Dynamic Type, and any layout that needs text dimensions upfront.

**Production-ready in v0.8.0** — 381 tests, 17 new APIs since v0.6.0, full animation suite, accessibility support, cross-platform reconciliation, and developer tools.

## Demos

<table>
  <tr>
    <td align="center"><strong>AI Chat</strong></td>
    <td align="center"><strong>Accuracy</strong></td>
    <td align="center"><strong>Editorial Engine</strong></td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://github.com/JubaKitiashvili/expo-pretext/raw/main/assets/demos/ai-chat.mp4">
        <img src="https://github.com/JubaKitiashvili/expo-pretext/raw/main/assets/demos/ai-chat-thumb.png" width="240" alt="AI Chat demo" />
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/JubaKitiashvili/expo-pretext/raw/main/assets/demos/accuracy.mp4">
        <img src="https://github.com/JubaKitiashvili/expo-pretext/raw/main/assets/demos/accuracy-thumb.png" width="240" alt="Accuracy demo" />
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/JubaKitiashvili/expo-pretext/raw/main/assets/demos/editorial-engine.mp4">
        <img src="https://github.com/JubaKitiashvili/expo-pretext/raw/main/assets/demos/editorial-engine-thumb.png" width="240" alt="Editorial Engine demo" />
      </a>
    </td>
  </tr>
  <tr>
    <td align="center"><sub>FlashList + streaming + markdown</sub></td>
    <td align="center"><sub>Predicted vs actual height</sub></td>
    <td align="center"><sub>Text reflow around obstacles</sub></td>
  </tr>
</table>

> Click thumbnails to watch videos

## Installation

```sh
npx expo install expo-pretext
```

> Requires Expo SDK 52+ with a development build. Expo Go falls back to JS estimates.

## Quick Start

```tsx
import { useTextHeight } from 'expo-pretext'

function ChatBubble({ text }) {
  const height = useTextHeight(text, {
    fontFamily: 'Inter',
    fontSize: 16,
    lineHeight: 24,
  }, maxWidth)

  return <View style={{ height }}><Text>{text}</Text></View>
}
```

## FlashList Integration

```tsx
import { useFlashListHeights } from 'expo-pretext'

function ChatScreen() {
  const { estimatedItemSize, overrideItemLayout } = useFlashListHeights(
    messages,
    msg => msg.text,
    { fontFamily: 'Inter', fontSize: 16, lineHeight: 24 },
    containerWidth
  )

  return (
    <FlashList
      data={messages}
      estimatedItemSize={estimatedItemSize}
      overrideItemLayout={overrideItemLayout}
      renderItem={renderMessage}
    />
  )
}
```

## Streaming AI Chat

```tsx
function StreamingMessage({ text }) {
  // Automatically detects append pattern, uses incremental measurement
  // Native cache means most segments are instant cache hits
  const height = useTextHeight(text, style, maxWidth)
  return <View style={{ minHeight: height }}><Text>{text}</Text></View>
}
```

## Batch Measurement

```tsx
import { measureHeights } from 'expo-pretext'

// One native call for all texts
const heights = measureHeights(
  ['Hello world', 'Longer paragraph...', '短い文'],
  { fontFamily: 'Inter', fontSize: 16, lineHeight: 24 },
  320
)
```

## API Reference

### Simple API

| Function | Description |
|---|---|
| `useTextHeight(text, style, maxWidth)` | Returns height as number. Auto-optimizes for streaming. |
| `useFlashListHeights(data, getText, style, maxWidth)` | Returns `{ estimatedItemSize, overrideItemLayout }` for FlashList. |
| `usePreparedText(text, style)` | Returns PreparedText handle for manual layout. |
| `measureHeights(texts, style, maxWidth)` | Batch: texts in, heights out. |

### AI Chat & Streaming API

| Function | Description |
|---|---|
| `useStreamingLayout(text, style, maxWidth)` | Returns `{ height, lineCount, lastLineWidth, doesNextTokenWrap }`. |
| `useMultiStreamLayout(streams, style, maxWidth)` | Multiple parallel AI streaming responses with independent tracking. |
| `useTypewriterLayout(text, style, maxWidth)` | Token-by-token reveal with `advance()`, `reset()`, `seekTo()`. |
| `useTextMorphing(fromText, toText, style, maxWidth)` | Line-by-line transition from "Thinking..." to final response. |
| `prepareStreaming(key, text, style, options?)` | Low-level: optimized prepare for growing text. |
| `clearStreamingState(key)` | Clean up streaming state when conversation resets. |
| `measureCodeBlockHeight(code, style, maxWidth)` | Monospace code block height with `pre-wrap` whitespace. |

### Animation API (requires react-native-reanimated)

| Function | Description |
|---|---|
| `useAnimatedTextHeight(text, style, maxWidth, animConfig?)` | Reanimated SharedValue height with timing/spring animation. |
| `useCollapsibleHeight(expanded, collapsed, style, maxWidth, isExpanded)` | Pre-computed expand/collapse heights with smooth animation. |
| `usePinchToZoomText(text, style, maxWidth, options?)` | Per-frame fontSize scaling via pinch gesture. 120+ layouts/frame. |
| `computeZoomLayout(text, style, maxWidth, scale, options?)` | Pure computation: fontSize/height at any zoom scale. |

### Power API (Pretext-compatible)

| Function | Description |
|---|---|
| `prepare(text, style, options?)` | One-time measurement. Returns opaque PreparedText. |
| `layout(prepared, maxWidth)` | Pure arithmetic height calculation. ~0.0002ms. |
| `prepareWithSegments(text, style, options?)` | Rich variant with segment data. |
| `layoutWithLines(prepared, maxWidth)` | Returns `{ height, lineCount, lines }`. |
| `layoutNextLine(prepared, start, maxWidth)` | Iterator for variable-width layouts. |
| `walkLineRanges(prepared, maxWidth, onLine)` | Line walker without string materialization. |
| `measureNaturalWidth(prepared)` | Intrinsic width (widest forced line). |

### Rich Inline API

| Function | Description |
|---|---|
| `prepareInlineFlow(items)` | Mixed fonts, @mention pills, chips. Returns opaque PreparedInlineFlow. |
| `walkInlineFlowLines(prepared, maxWidth, onLine)` | Line walker for inline fragments. |
| `measureInlineFlow(prepared, maxWidth)` | Total height for inline fragment stream. |

### Obstacle Layout API

| Function | Description |
|---|---|
| `useObstacleLayout(text, style, region, circles?, rects?)` | React hook for editorial text-around-obstacles at 60fps. |
| `layoutColumn(prepared, start, region, lineHeight, circles?, rects?)` | Low-level: flow text in a column with obstacles. |
| `carveTextLineSlots(base, blocked, minSlotWidth?)` | Compute available text slots by subtracting obstacles. |
| `circleIntervalForBand(cx, cy, r, bandTop, bandBottom)` | Horizontal interval a circle occupies at a given line band. |
| `rectIntervalForBand(rect, bandTop, bandBottom)` | Horizontal interval a rectangle occupies at a given line band. |

### Text Utilities

| Function | Description |
|---|---|
| `fitFontSize(text, style, boxWidth, boxHeight)` | Binary search for largest font size that fits in a box. |
| `truncateText(text, style, maxWidth, maxLines)` | Truncate to N lines with ellipsis. |
| `buildTypewriterFrames(lines, text, lineHeight)` | Pre-compute typewriter reveal frames from layout lines. |
| `buildTextMorph(fromLines, toLines, lineHeight)` | Compute morph transition data between two text states. |

### Types

```ts
type TextStyle = {
  fontFamily: string
  fontSize: number
  lineHeight?: number
  fontWeight?: '400' | '500' | '600' | '700' | 'bold' | 'normal'
  fontStyle?: 'normal' | 'italic'
}

type PrepareOptions = {
  whiteSpace?: 'normal' | 'pre-wrap'
  locale?: string
  accuracy?: 'fast' | 'exact'
  customBreakRules?: (segment, index, kind) => SegmentBreakKind
}
```

### Utilities

```ts
clearCache()              // Clear all measurement caches
setLocale(locale?: string) // Set locale for text segmentation
```

## How It Works

```
prepare(text, style)
  → Native: segment text + measure widths (one call)
  → JS: analyze segments, build PreparedText
  → Cache everything for next time

layout(prepared, maxWidth)
  → Pure JS arithmetic on cached widths
  → ~0.0002ms per text
  → No native calls, no DOM, no layout reflow
```

### Performance

- **prepare()**: ~15ms for 500 texts (batch)
- **layout()**: ~0.0002ms per text (pure arithmetic)
- **Streaming**: ~2ms per token (mostly cache hits)
- **Native caching**: LRU 5000 segments/font, frequency-based eviction
- **JS caching**: skip native calls entirely when all segments are cached

## Accuracy

expo-pretext uses native platform text measurement (iOS `NSString.size`, Android `TextPaint.measureText`) — the same engines that render your text. Two accuracy modes:

- **`fast`** (default): Sum individual segment widths. Sub-pixel kerning differences absorbed by tolerance.
- **`exact`**: Re-measure merged segments. Pixel-perfect at cost of one extra native call.

## i18n Support

Full Unicode support via native OS segmenters:
- CJK (Chinese, Japanese, Korean) — per-character breaking + kinsoku rules
- Arabic, Hebrew — RTL with bidi metadata
- Thai, Lao, Khmer, Myanmar — dictionary-based word boundaries
- Georgian, Devanagari, and all other scripts
- Emoji — compound graphemes, flags, ZWJ sequences
- Mixed scripts in a single string

## Inspiration & Credits

expo-pretext is a React Native / Expo port of [Pretext](https://github.com/chenglou/pretext) by Cheng Lou. The original Pretext is a web-based text measurement library — expo-pretext brings the same core idea (predict text dimensions before rendering) to the native mobile world, using iOS TextKit and Android TextPaint for measurement instead of DOM APIs.

Key differences from the original:
- **Native measurement** via Expo modules (iOS `NSString.size`, Android `TextPaint.measureText`)
- **React Native hooks** (`useTextHeight`, `useFlashListHeights`) for declarative usage
- **Streaming optimizations** for AI chat use cases
- **Rich inline flow** for mixed-font content (pills, badges, @mentions)

Pretext itself builds on Sebastian Markbage's [text-layout](https://github.com/nicolo-ribaudo/text-layout) research.

## License

MIT
