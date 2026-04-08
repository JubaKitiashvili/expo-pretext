// example/components/MarkdownRenderer.tsx
import { memo, useMemo } from 'react'
import { View, Text, Linking } from 'react-native'
import { prepare, layout } from 'expo-pretext'
import { parseMarkdown, blocksToPlainText } from './markdown-parser'
import type { MdBlock, MdSpan } from './markdown-parser'

// ─── Theme ───────────────────────────────────────────────
export type MarkdownTheme = {
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

const LIGHT: MarkdownTheme = {
  textColor: '#1a1a1a',
  linkColor: '#007AFF',
  codeBackground: '#1e1e1e',
  codeTextColor: '#d4d4d4',
  inlineCodeBackground: 'rgba(0,0,0,0.06)',
  inlineCodeColor: '#d63384',
  quoteBarColor: '#ddd',
  quoteTextColor: '#555',
  headingColor: '#1a1a1a',
  hrColor: '#ddd',
  checkboxColor: '#007AFF',
  tableBorderColor: '#ddd',
}

const DARK: MarkdownTheme = {
  textColor: '#ffffff',
  linkColor: '#a0d8ff',
  codeBackground: 'rgba(255,255,255,0.1)',
  codeTextColor: '#e0e0e0',
  inlineCodeBackground: 'rgba(255,255,255,0.2)',
  inlineCodeColor: '#ffd6e8',
  quoteBarColor: 'rgba(255,255,255,0.3)',
  quoteTextColor: 'rgba(255,255,255,0.8)',
  headingColor: '#ffffff',
  hrColor: 'rgba(255,255,255,0.2)',
  checkboxColor: '#a0d8ff',
  tableBorderColor: 'rgba(255,255,255,0.2)',
}

// ─── Props ───────────────────────────────────────────────
type Props = {
  content: string
  variant?: 'light' | 'dark'
  tightWrap?: boolean
  maxWidth?: number
  overrides?: Partial<MarkdownTheme>
  onLinkPress?: (url: string) => void
}

// ─── Constants ───────────────────────────────────────────
const BLOCK_GAP = 10
const LIST_INDENT = 18
const QUOTE_INDENT = 18
const CODE_BLOCK_PAD = 12

const BODY_STYLE = { fontFamily: 'System', fontSize: 14, lineHeight: 22 }

const STATUS_COLORS: Record<string, string> = {
  ready: '#34C759',
  done: '#34C759',
  complete: '#34C759',
  passed: '#34C759',
  'in progress': '#FF9500',
  pending: '#FF9500',
  testing: '#007AFF',
  review: '#007AFF',
  failed: '#FF3B30',
  blocked: '#FF3B30',
  error: '#FF3B30',
}

function getStatusColor(text: string): string | undefined {
  return STATUS_COLORS[text]
}

// ─── Inline Spans ────────────────────────────────────────
function RenderSpans({
  spans, theme, onLinkPress,
}: {
  spans: MdSpan[]
  theme: MarkdownTheme
  onLinkPress: (url: string) => void
}) {
  return (
    <Text style={{ fontSize: 14, lineHeight: 22, color: theme.textColor }}>
      {spans.map((span, i) => {
        switch (span.t) {
          case 'bold':
            return <Text key={i} style={{ fontWeight: '700' }}>{span.v}</Text>
          case 'italic':
            return <Text key={i} style={{ fontStyle: 'italic' }}>{span.v}</Text>
          case 'bolditalic':
            return <Text key={i} style={{ fontWeight: '700', fontStyle: 'italic' }}>{span.v}</Text>
          case 'strike':
            return <Text key={i} style={{ textDecorationLine: 'line-through', color: '#999' }}>{span.v}</Text>
          case 'code':
            return (
              <Text key={i} style={{
                fontFamily: 'Menlo', fontSize: 12,
                backgroundColor: theme.inlineCodeBackground,
                color: theme.inlineCodeColor,
                borderRadius: 3, paddingHorizontal: 4,
              }}>{span.v}</Text>
            )
          case 'link':
            return (
              <Text key={i}
                style={{ color: theme.linkColor, textDecorationLine: 'underline' }}
                onPress={() => onLinkPress(span.url)}
              >{span.v}</Text>
            )
          default:
            return <Text key={i}>{span.v}</Text>
        }
      })}
    </Text>
  )
}

// ─── Block Renderers ─────────────────────────────────────
const RenderBlock = memo(function RenderBlock({
  block, theme, onLinkPress, depth = 0,
}: {
  block: MdBlock
  theme: MarkdownTheme
  onLinkPress: (url: string) => void
  depth?: number
}) {
  switch (block.type) {
    case 'paragraph':
      return <RenderSpans spans={block.spans} theme={theme} onLinkPress={onLinkPress} />

    case 'heading': {
      const style =
        block.level === 1 ? { fontFamily: 'Georgia', fontSize: 20, lineHeight: 28, fontWeight: '700' as const } :
        block.level === 2 ? { fontFamily: 'Georgia', fontSize: 17, lineHeight: 25, fontWeight: '700' as const } :
        { fontSize: 15, lineHeight: 22, fontWeight: '700' as const }
      return (
        <Text style={[style, { color: theme.headingColor }]}>
          {block.spans.map((span, i) => {
            if (span.t === 'code') return <Text key={i} style={{ fontFamily: 'Menlo', fontSize: 12, backgroundColor: theme.inlineCodeBackground, color: theme.inlineCodeColor }}>{span.v}</Text>
            return <Text key={i}>{span.v}</Text>
          })}
        </Text>
      )
    }

    case 'code':
      return (
        <View style={{ backgroundColor: theme.codeBackground, borderRadius: 8, padding: CODE_BLOCK_PAD }}>
          {block.lang ? <Text style={{ fontSize: 10, color: '#666', marginBottom: 4, fontFamily: 'Menlo', fontWeight: '600' }}>{block.lang}</Text> : null}
          <Text style={{ fontFamily: 'Menlo', fontSize: 12, lineHeight: 18, color: theme.codeTextColor }}>{block.text}</Text>
        </View>
      )

    case 'quote':
      return (
        <View style={{ borderLeftWidth: 3, borderLeftColor: theme.quoteBarColor, paddingLeft: QUOTE_INDENT - 3 }}>
          {block.blocks.map((b, i) => (
            <View key={i} style={i > 0 ? { marginTop: 4 } : undefined}>
              <RenderBlock block={b} theme={{ ...theme, textColor: theme.quoteTextColor }} onLinkPress={onLinkPress} depth={depth + 1} />
            </View>
          ))}
        </View>
      )

    case 'list':
      return (
        <View>
          {block.items.map((item, idx) => (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: idx > 0 ? 4 : 0 }}>
              <Text style={{ fontFamily: 'Menlo', fontSize: 11, fontWeight: '600', width: LIST_INDENT, lineHeight: 22, color: '#999' }}>
                {item.checked === true ? '\u2611' : item.checked === false ? '\u2610' :
                  block.ordered ? `${idx + 1}.` : '\u2022'}
              </Text>
              <View style={{ flex: 1 }}>
                {item.blocks.map((b, i) => (
                  <View key={i} style={i > 0 ? { marginTop: 4 } : undefined}>
                    <RenderBlock block={b} theme={theme} onLinkPress={onLinkPress} depth={depth + 1} />
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      )

    case 'table':
      return (
        <View style={{ borderWidth: 1, borderColor: theme.tableBorderColor, borderRadius: 4, overflow: 'hidden' }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', backgroundColor: theme.textColor === '#ffffff' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }}>
            {block.headers.map((cell, ci) => (
              <View key={ci} style={{ flex: 1, padding: 8, borderRightWidth: ci < block.headers.length - 1 ? 1 : 0, borderRightColor: theme.tableBorderColor }}>
                <Text style={{ fontSize: 13, lineHeight: 20, fontWeight: '600', color: theme.textColor }}>
                  {cell.map(s => s.v).join('')}
                </Text>
              </View>
            ))}
          </View>
          {/* Rows */}
          {block.rows.map((row, ri) => (
            <View key={ri} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: theme.tableBorderColor, backgroundColor: ri % 2 === 1 ? (theme.textColor === '#ffffff' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)') : undefined }}>
              {row.map((cell, ci) => {
                const text = cell.map(s => s.v).join('').toLowerCase()
                const statusColor = getStatusColor(text)
                return (
                  <View key={ci} style={{ flex: 1, padding: 8, borderRightWidth: ci < row.length - 1 ? 1 : 0, borderRightColor: theme.tableBorderColor }}>
                    {statusColor ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor }} />
                        <RenderSpans spans={cell} theme={theme} onLinkPress={onLinkPress} />
                      </View>
                    ) : (
                      <RenderSpans spans={cell} theme={theme} onLinkPress={onLinkPress} />
                    )}
                  </View>
                )
              })}
            </View>
          ))}
        </View>
      )

    case 'image':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.inlineCodeBackground, borderRadius: 8, padding: 12, gap: 8 }}>
          <Text style={{ fontSize: 18 }}>{'\uD83D\uDDBC'}</Text>
          <Text style={{ fontSize: 13, color: theme.textColor, flex: 1 }} numberOfLines={1}>{block.alt || block.url}</Text>
        </View>
      )

    case 'rule':
      return <View style={{ height: 1, backgroundColor: theme.hrColor, marginVertical: 8 }} />
  }
})

// ─── Block List ──────────────────────────────────────────
const RenderBlocks = memo(function RenderBlocks({
  blocks, theme, onLinkPress,
}: {
  blocks: MdBlock[]
  theme: MarkdownTheme
  onLinkPress: (url: string) => void
}) {
  return (
    <View>
      {blocks.map((block, i) => (
        <View key={i} style={i > 0 ? { marginTop: BLOCK_GAP } : undefined}>
          <RenderBlock block={block} theme={theme} onLinkPress={onLinkPress} />
        </View>
      ))}
    </View>
  )
})

// ─── Main Component ──────────────────────────────────────
function MarkdownRendererInner({
  content,
  variant = 'light',
  tightWrap = false,
  maxWidth,
  overrides,
  onLinkPress,
}: Props) {
  const theme = useMemo(() => {
    const base = variant === 'dark' ? DARK : LIGHT
    return overrides ? { ...base, ...overrides } : base
  }, [variant, overrides])

  const handleLinkPress = useMemo(
    () => onLinkPress || ((url: string) => Linking.openURL(url)),
    [onLinkPress],
  )

  const blocks = useMemo(() => parseMarkdown(content), [content])

  // Tight-wrap: only for paragraph-only content
  const tightWidth = useMemo(() => {
    if (!tightWrap || !maxWidth) return undefined
    const hasMixedContent = blocks.some(b => b.type !== 'paragraph')
    if (hasMixedContent) return undefined
    try {
      const plainText = blocksToPlainText(blocks)
      const p = prepare(plainText, BODY_STYLE)
      const full = layout(p, maxWidth)
      if (full.lineCount <= 1) return undefined
      let lo = 60, hi = maxWidth
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        const r = layout(p, mid)
        if (r.lineCount <= full.lineCount) hi = mid
        else lo = mid
      }
      return hi
    } catch {
      return undefined
    }
  }, [blocks, tightWrap, maxWidth])

  return (
    <View style={tightWidth ? { width: tightWidth } : undefined}>
      <RenderBlocks blocks={blocks} theme={theme} onLinkPress={handleLinkPress} />
    </View>
  )
}

export const MarkdownRenderer = memo(MarkdownRendererInner)
