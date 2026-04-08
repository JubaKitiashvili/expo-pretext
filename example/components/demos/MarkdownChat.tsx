// example/components/demos/MarkdownChat.tsx
import { useCallback, memo } from 'react'
import { View, Text, StyleSheet, useWindowDimensions, FlatList } from 'react-native'
import { MarkdownRenderer } from '../MarkdownRenderer'

// ─── Constants ───────────────────────────────────────────
const BUBBLE_PAD_X = 16
const BUBBLE_PAD_Y = 10
const BUBBLE_MAX_RATIO = 0.78

// ─── Message data ─────────────────────────────────────────
type MarkdownSeed = { role: 'user' | 'assistant'; markdown: string }

function msg(role: 'user' | 'assistant', ...lines: string[]): MarkdownSeed {
  return { role, markdown: lines.join('\n') }
}

const BASE_MESSAGES: MarkdownSeed[] = [
  msg(
    'user',
    'Can we treat the rich-text inline flow helper (`rich-inline`) as a real primitive, or is it only good for one tiny demo?',
    '',
    'I mostly care about:',
    '- exact bubble heights',
    '- virtualization without layout reads',
    '- markdown-ish inline styling',
  ),
  msg(
    'assistant',
    'Short answer: **yes, inside a bounded corridor**.',
    '',
    'It already handles rich-text inline flow, `code`, and links like [expo-pretext](https://github.com/JubaKitiashvili/expo-pretext), while keeping pills and badges atomic. The real pressure starts once a chat bubble stops being one paragraph.',
  ),
  msg(
    'user',
    'Right. My side is usually short, but your side has the weird stuff: Beijing \u5317\u4EAC, Arabic \u0645\u0631\u062D\u0628\u0627, emoji \uD83D\uDE80, and long URLs like https://example.com/reports/q3?lang=ar&mode=full',
  ),
  msg(
    'assistant',
    '### What a chat renderer actually needs',
    '',
    '1. Parse markdown somewhere else.',
    '2. Normalize it into blocks and inline runs.',
    '3. Use the rich-text inline flow helper (`rich-inline`) for paragraph-ish content.',
    '4. Use the `pre-wrap` path for fenced code.',
  ),
  msg(
    'user',
    "Then let's stress it with **real markdown**: ***nested emphasis***, ~~deletions~~, `inline code`, [links](https://openai.com/), and a couple messages that are obviously richer on the AI side than on mine.",
  ),
  msg(
    'assistant',
    '> If we know the exact height in advance, then virtualization is no longer guesswork.',
    '>',
    '> It becomes geometry.',
    '',
    'That is the whole reason to keep the primitive low-level and composable.',
  ),
  msg(
    'user',
    'Okay, but the design matters too. The left side should feel lighter and more editorial, while my side can stay bubble-y.',
  ),
  msg(
    'assistant',
    '```ts',
    'const heights = await measureHeights(messages, style, width)',
    'const { estimatedItemSize, overrideItemLayout } = useFlashListHeights(',
    '  messages, getText, style, width',
    ')',
    '```',
  ),
  msg(
    'user',
    'I also want code fences, quotes, and lists to show up often enough that the 10k-thread run actually teaches us something.',
  ),
  msg(
    'assistant',
    'That part is important.',
    '',
    '- paragraph layout is one leaf',
    '- code fences are another leaf',
    '- the chat message is the block-level container above both',
    '',
    'The assistant side is the real stress test because it keeps hitting headings, bullets, quotes, code fences, and occasional long explanations.',
  ),
  msg(
    'user',
    'Try a checklist too. A product chat is full of little status updates.',
  ),
  msg(
    'assistant',
    'Current polish pass:',
    '',
    '- [x] lighter body copy is in',
    '- [x] the assistant lane is bubble-less',
    '- [x] exact height prediction is wired up',
    '- [ ] mobile screenshot smoke tests still remain',
  ),
  msg(
    'user',
    'Can we keep top-level bullets flush? I do not want them shoved way in from the left like an old email client.',
  ),
  msg(
    'assistant',
    'Yes. The top-level list should read almost like paragraph rhythm with markers, not like a nested document outline.',
    '',
    'Nested lists can still step in when they actually nest.',
  ),
  msg(
    'user',
    'I want a structured status block too. It does not need table syntax if we are not really rendering tables here.',
  ),
  msg(
    'assistant',
    '| Component | Status | Owner |',
    '| --- | --- | --- |',
    '| paragraph_leaf | ready | layout |',
    '| code_leaf | ready | pre-wrap |',
    '| quote_wrapper | in progress | block shell |',
    '| virtualization | testing | exact-height |',
  ),
  msg(
    'user',
    'What about images or chips? Even if they are fake, I want to know the primitive can hold an atomic thing.',
  ),
  msg(
    'assistant',
    'It can. Something like `![diagram](mock.png)` behaves more like an inline chip than a splittable word, which is exactly the right stress case.',
    '',
    '![architecture diagram](https://example.com/diagram.png)',
  ),
  msg(
    'user',
    'Throw in a messy status message too: deploys, timestamps, a ticket number, and maybe one escaped quote.',
  ),
  msg(
    'assistant',
    'Status snapshot:',
    '',
    '- deploy window 7:00-9:00',
    '- owner `RICH-431`',
    '- locale mix `24\u00D77` and `\u0968\u096A\u00D7\u096D`',
    '- comment: "ship it" after the Safari check',
  ),
  msg(
    'user',
    'I still think the width negotiation matters more than the parser. If widths are wrong, everything feels fake.',
  ),
  msg(
    'assistant',
    'Agreed. The parser is just an upstream producer.',
    '',
    'The hard contract is: once width and fonts are known, the layout layer should answer height exactly enough that virtualization never has to ask for `onLayout` help.',
  ),
  msg(
    'user',
    'Give me one answer that feels more structured, almost like a mini design review.',
  ),
  msg(
    'assistant',
    '## Design review',
    '',
    'The strongest signal so far is that **assistant messages want a different presentation contract from user messages**. The human side reads well as compact bubbles. The assistant side reads better as content on a surface with room to breathe.',
    '',
    'That split also maps nicely to the measurement model because user messages are usually short and AI responses are much more likely to hit rich block transitions.',
  ),
  msg(
    'user',
    'And one answer that feels operational, like we are handing this to another engineer.',
  ),
  msg(
    'assistant',
    '```json',
    '{',
    '  "heightEngine": "expo-pretext",',
    '  "paragraphLeaf": "prepare + layout",',
    '  "codeLeaf": "pre-wrap",',
    '  "virtualization": "FlashList + overrideItemLayout",',
    '  "openRisk": "long-scroll-device-smoke"',
    '}',
    '```',
  ),
  msg(
    'user',
    'We should probably include a short answer too, otherwise every assistant message looks essay-shaped.',
  ),
  msg(
    'assistant',
    'Yep. Short answers are a useful canary because they should not inherit giant block spacing or overbuilt chrome.',
  ),
  msg(
    'user',
    'Try a message with HTML-ish content too. Not because we love it, just because users paste odd things.',
  ),
  msg(
    'assistant',
    'Escaped HTML still needs a stable fallback path.',
    '',
    'If it comes through as a block token, we can still route it through a plain-text or code-like presentation instead of pretending we have a full browser renderer.',
  ),
  msg(
    'user',
    'I also want more than one quote style in the loop. Otherwise we are tuning for a single canned example.',
  ),
  msg(
    'assistant',
    '> The nice version of exact measurement is smooth scrolling.',
    '>',
    '> The brutal version is that every wrong guess accumulates.',
    '',
    '> In a 10k thread, accumulation is the enemy.',
  ),
  msg(
    'user',
    'Can you make one answer about search or citations? AI chats have that vibe a lot now.',
  ),
  msg(
    'assistant',
    'Sure. A citation-heavy answer is mostly the same inline problem with a little more link density:',
    '',
    '- [spec note](https://example.com/spec)',
    '- [issue thread](https://example.com/issues/431)',
    '- [benchmark doc](https://example.com/benchmarks)',
  ),
  msg(
    'user',
    'Maybe a message that mixes scripts more aggressively: English, \u65E5\u672C\u8A9E, \u0627\u0644\u0639\u0631\u0628\u064A\u0629, and a little emoji.',
  ),
  msg(
    'assistant',
    'Mixed-script sample: English for the framing, \u65E5\u672C\u8A9E for compact line breaks, \u0627\u0644\u0639\u0631\u0628\u064A\u0629 for punctuation clusters, and emoji like \uD83E\uDDEA\uD83D\uDCD0 to keep the grapheme path honest.',
  ),
  msg(
    'user',
    'I want at least one answer that uses nested bullets so we can see whether the second level still reads okay.',
  ),
  msg(
    'assistant',
    'Things to watch:',
    '',
    '- top-level bullets should feel close to body text',
    '- nested bullets can indent, but only when they truly nest',
    '  - this second level should not explode the width math',
    '  - the marker still needs a clean left gutter',
    '- quotes and code fences should tuck closer to the lead-in paragraph',
  ),
  msg(
    'user',
    'Can we include a very plain human message too? Real threads have those.',
  ),
  msg(
    'assistant',
    'Absolutely.',
  ),
  msg(
    'user',
    'cool. also make sure the scroll still feels stable when widths change',
  ),
  msg(
    'assistant',
    'That is one of the better parts of the demo right now: width changes rebuild the frame, preserve relative scroll intent, and remount only the visible window.',
  ),
  msg(
    'user',
    'One last thing: mention the hypothesis space. I still care a lot about not painting ourselves into a corner.',
  ),
  msg(
    'assistant',
    'The good version of this API is not "we solved rich text." It is "we found a low-level paragraph leaf that keeps the hypothesis space open for a richer block model above it."',
  ),
]

const TOTAL_COUNT = 10_000

// ─── Message generation ───────────────────────────────────
type ChatMsg = {
  id: string
  role: 'user' | 'assistant'
  markdown: string
}

function generateMessages(): ChatMsg[] {
  const msgs: ChatMsg[] = new Array(TOTAL_COUNT)
  const baseLen = BASE_MESSAGES.length
  for (let i = 0; i < TOTAL_COUNT; i++) {
    const seed = BASE_MESSAGES[i % baseLen]!
    msgs[i] = {
      id: String(i),
      role: seed.role,
      markdown: seed.markdown,
    }
  }
  return msgs
}

const allMessages = generateMessages()

// ─── Bubble component ─────────────────────────────────────
const ChatBubble = memo(function ChatBubble({
  msg, maxWidth,
}: {
  msg: ChatMsg
  maxWidth: number
}) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <View style={[s.bubble, s.userBubble]}>
        <MarkdownRenderer
          content={msg.markdown}
          variant="dark"
          tightWrap
          maxWidth={maxWidth}
        />
      </View>
    )
  }

  return (
    <View style={[s.assistantRow, { width: maxWidth + BUBBLE_PAD_X }]}>
      <MarkdownRenderer content={msg.markdown} variant="light" />
    </View>
  )
})

// ─── Main component ───────────────────────────────────────
export function MarkdownChatDemo() {
  const { width } = useWindowDimensions()
  const laneWidth = width - 32
  const userMax = Math.floor(laneWidth * BUBBLE_MAX_RATIO)
  const assistantMax = laneWidth

  const renderItem = useCallback(
    ({ item }: { item: ChatMsg }) => (
      <ChatBubble msg={item} maxWidth={item.role === 'user' ? userMax : assistantMax} />
    ),
    [userMax, assistantMax],
  )

  return (
    <View style={s.container}>
      <View style={s.infoBanner}>
        <Text style={s.infoText}>
          {TOTAL_COUNT.toLocaleString()} messages · virtualized · tight-wrap · rich markdown
        </Text>
      </View>
      <FlatList
        data={allMessages}
        renderItem={renderItem}
        keyExtractor={m => m.id}
        windowSize={7}
        maxToRenderPerBatch={10}
        initialNumToRender={12}
        removeClippedSubviews
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f8' },
  infoBanner: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: '#eee',
  },
  infoText: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
    fontFamily: 'Menlo',
  },
  bubble: {
    padding: BUBBLE_PAD_X,
    paddingVertical: BUBBLE_PAD_Y,
    borderRadius: 18,
    marginBottom: 8,
    marginHorizontal: 16,
  },
  userBubble: {
    backgroundColor: '#007AFF',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantRow: {
    paddingHorizontal: 16,
    paddingVertical: BUBBLE_PAD_Y,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
})
