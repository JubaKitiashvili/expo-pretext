# MarkdownRenderer Enhancement Design

**Date:** 2026-04-08
**Status:** Approved

## Summary

Enhance the example app's `MarkdownRenderer` from a basic paragraph+code renderer into a full-featured markdown component. Split into two files: a pure parser (`markdown-parser.ts`) and a React renderer (`MarkdownRenderer.tsx`). Integrate expo-pretext tight-wrap as an optional feature. Refactor MarkdownChat demo to use the shared renderer.

## Decisions

| Topic | Decision |
|-------|----------|
| Block types | Full set: headings, lists (nested + task), blockquotes (nested), code fences, tables, image placeholders, horizontal rules |
| Style control | Preset variants (`light`/`dark`) + optional theme overrides |
| Tight-wrap | In MarkdownRenderer via optional `tightWrap` prop, uses expo-pretext `prepare`+`layout` |
| Architecture | Two files: `markdown-parser.ts` (pure logic) + `MarkdownRenderer.tsx` (React) |
| MarkdownChat demo | Rewrite to use MarkdownRenderer, remove duplicated parser/renderer code |

## File Structure

```
example/components/
├── markdown-parser.ts      # Pure logic: parse + height estimation
└── MarkdownRenderer.tsx    # React component: rendering + tight-wrap
```

## API Surface

### MarkdownRenderer Props

```ts
type MarkdownRendererProps = {
  content: string
  variant?: 'light' | 'dark'       // default: 'light'
  tightWrap?: boolean               // optional, uses expo-pretext prepare+layout
  maxWidth?: number                  // required when tightWrap=true
  overrides?: Partial<MarkdownTheme> // optional color/style overrides
}

type MarkdownTheme = {
  textColor: string
  linkColor: string
  codeBackground: string
  codeTextColor: string
  inlineCodeBackground: string
  inlineCodeColor: string
  quoteBarColor: string
  quoteTextColor: string
  headingColor: string
  hrColor: string
  checkboxColor: string
  tableBorderColor: string
}
```

### Usage Examples

```tsx
// Simple — default light
<MarkdownRenderer content={msg.text} />

// User bubble — dark variant
<MarkdownRenderer content={msg.text} variant="dark" />

// Tight-wrap user bubble
<MarkdownRenderer content={msg.text} variant="dark" tightWrap maxWidth={280} />

// Custom overrides
<MarkdownRenderer content={msg.text} overrides={{ linkColor: '#ff6600' }} />
```

## Parser (markdown-parser.ts)

### Types

```ts
type MdBlock =
  | { type: 'paragraph'; spans: MdSpan[] }
  | { type: 'heading'; level: 1 | 2 | 3; spans: MdSpan[] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'quote'; blocks: MdBlock[] }
  | { type: 'list'; ordered: boolean; items: MdListItem[] }
  | { type: 'table'; headers: MdSpan[][]; rows: MdSpan[][] }
  | { type: 'image'; alt: string; url: string }
  | { type: 'rule' }

type MdListItem = {
  blocks: MdBlock[]
  checked?: boolean    // undefined = normal, true/false = task list
}

type MdSpan =
  | { t: 'text'; v: string }
  | { t: 'bold'; v: string }
  | { t: 'italic'; v: string }
  | { t: 'bolditalic'; v: string }
  | { t: 'strike'; v: string }
  | { t: 'code'; v: string }
  | { t: 'link'; v: string; url: string }
```

### Exports

```ts
export function parseMarkdown(md: string): MdBlock[]
export function parseSpans(text: string): MdSpan[]
export function estimateBlocksHeight(blocks: MdBlock[], width: number, config?: Partial<HeightConfig>): number

// HeightConfig with sensible defaults:
type HeightConfig = {
  blockGap: number       // default: 10
  listIndent: number     // default: 18
  quoteIndent: number    // default: 18
  codeBlockPad: number   // default: 12
  bodyFontSize: number   // default: 14
  bodyLineHeight: number // default: 22
}
export function blocksToPlainText(blocks: MdBlock[]): string
```

### Parse Priority (top to bottom)

1. Code fence
2. Heading
3. Horizontal rule
4. Table
5. Blockquote
6. Task list
7. Ordered list
8. Unordered list
9. Image
10. Paragraph (fallback)

## Renderer (MarkdownRenderer.tsx)

### Component Hierarchy

```
MarkdownRenderer
├── RenderBlocks          # block loop, gap management
│   ├── RenderParagraph   # inline spans → <Text> nesting
│   ├── RenderHeading     # h1/h2/h3 styled text
│   ├── RenderCodeBlock   # dark bg, lang label, monospace
│   ├── RenderQuote       # left border + recursive RenderBlocks
│   ├── RenderList        # ordered/unordered/task, recursive items
│   ├── RenderTable       # header row + data rows, borders
│   ├── RenderImage       # chip/placeholder (icon + alt text)
│   └── RenderRule        # horizontal line
└── RenderSpans           # inline: bold, italic, code, link, strike
```

### Tight-wrap Logic

When `tightWrap=true` and `maxWidth` provided:
1. `blocksToPlainText(blocks)` to get plain string
2. `prepare(plainText, textStyle)` via expo-pretext
3. Binary search: minimum width that keeps same lineCount
4. Wrapper View gets `width={tightWidth}`

When `tightWrap=false` (default): no width constraint on wrapper.

### Theme Presets

Two built-in presets: `light` and `dark`. User can override any individual property via `overrides` prop. Final theme = `{ ...preset, ...overrides }`.

### Memo Strategy

- `MarkdownRenderer` — `memo` by `content` + `variant` + `maxWidth`
- Sub-components — `memo` per block reference

## MarkdownChat Demo Refactor

### Removed from MarkdownChat
- Custom parser (parseMarkdown, parseSpans, types)
- Custom renderer (RenderSpans, RenderBlock, RenderBlocks)
- Height estimation functions

### Kept in MarkdownChat
- BASE_MESSAGES data
- ChatBubble component (uses MarkdownRenderer)
- FlatList setup, 10k message generation
- Layout constants

### New ChatBubble Shape

```tsx
const ChatBubble = memo(function ChatBubble({ msg, maxWidth }) {
  const isUser = msg.role === 'user'
  if (isUser) {
    return (
      <View style={[s.bubble, s.userBubble]}>
        <MarkdownRenderer content={msg.markdown} variant="dark" tightWrap maxWidth={maxWidth} />
      </View>
    )
  }
  return (
    <View style={[s.assistantRow, { width: maxWidth + BUBBLE_PAD_X }]}>
      <MarkdownRenderer content={msg.markdown} variant="light" />
    </View>
  )
})
```

### Main Chat (chat.tsx)
Minimal change — already uses MarkdownRenderer. Benefits automatically from enhanced parser.
