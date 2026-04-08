// ─── Types ───────────────────────────────────────────────
export type MdBlock =
  | { type: 'paragraph'; spans: MdSpan[] }
  | { type: 'heading'; level: 1 | 2 | 3; spans: MdSpan[] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'quote'; blocks: MdBlock[] }
  | { type: 'list'; ordered: boolean; items: MdListItem[] }
  | { type: 'table'; headers: MdSpan[][]; rows: MdSpan[][][] }
  | { type: 'image'; alt: string; url: string }
  | { type: 'rule' }

export type MdListItem = {
  blocks: MdBlock[]
  checked?: boolean
}

export type MdSpan =
  | { t: 'text'; v: string }
  | { t: 'bold'; v: string }
  | { t: 'italic'; v: string }
  | { t: 'bolditalic'; v: string }
  | { t: 'strike'; v: string }
  | { t: 'code'; v: string }
  | { t: 'link'; v: string; url: string }

// ─── Parse cache (LRU, max 500 entries) ─────────────────
const PARSE_CACHE_MAX = 500
const parseCache = new Map<string, MdBlock[]>()

export function parseMarkdown(md: string): MdBlock[] {
  const cached = parseCache.get(md)
  if (cached) {
    // Move to end (most recently used)
    parseCache.delete(md)
    parseCache.set(md, cached)
    return cached
  }
  const result = parseBlocks(md)
  if (parseCache.size >= PARSE_CACHE_MAX) {
    // Evict oldest entry
    const oldest = parseCache.keys().next().value!
    parseCache.delete(oldest)
  }
  parseCache.set(md, result)
  return result
}

export function clearParseCache() { parseCache.clear() }

function extractTaskCheck(text: string): { checked?: boolean; content: string } {
  if (text.startsWith('[ ] ')) return { checked: false, content: text.slice(4) }
  if (text.startsWith('[x] ') || text.startsWith('[X] ')) return { checked: true, content: text.slice(4) }
  return { content: text }
}

function parseBlocks(md: string): MdBlock[] {
  const lines = md.split('\n')
  const blocks: MdBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    // Empty line
    if (line.trim() === '') { i++; continue }

    // Code fence
    const fence = line.match(/^```(\w*)/)
    if (fence) {
      const lang = fence[1] || ''
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        code.push(lines[i]!)
        i++
      }
      i++ // skip closing
      blocks.push({ type: 'code', lang, text: code.join('\n') })
      continue
    }

    // Heading
    const hm = line.match(/^(#{1,3})\s+(.+)/)
    if (hm) {
      blocks.push({ type: 'heading', level: Math.min(3, hm[1]!.length) as 1 | 2 | 3, spans: parseSpans(hm[2]!) })
      i++
      continue
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: 'rule' })
      i++
      continue
    }

    // Blockquote
    if (line.startsWith('>')) {
      const qLines: string[] = []
      while (i < lines.length && (lines[i]!.startsWith('>') || lines[i]!.trim() === '')) {
        if (lines[i]!.startsWith('>')) {
          qLines.push(lines[i]!.replace(/^>\s?/, ''))
        } else {
          let peek = i + 1
          while (peek < lines.length && lines[peek]!.trim() === '') peek++
          if (peek < lines.length && lines[peek]!.startsWith('>')) {
            qLines.push('')
          } else {
            break
          }
        }
        i++
      }
      blocks.push({ type: 'quote', blocks: parseBlocks(qLines.join('\n')) })
      continue
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: MdListItem[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i]!)) {
        const text = lines[i]!.replace(/^\d+\.\s/, '')
        const { checked, content } = extractTaskCheck(text)
        const itemLines: string[] = [content]
        i++
        while (i < lines.length && lines[i]!.startsWith('  ') && !/^\d+\.\s/.test(lines[i]!)) {
          itemLines.push(lines[i]!.slice(2))
          i++
        }
        items.push({ blocks: parseBlocks(itemLines.join('\n')), checked })
      }
      blocks.push({ type: 'list', ordered: true, items })
      continue
    }

    // Unordered list
    if (/^[-*]\s/.test(line)) {
      const items: MdListItem[] = []
      while (i < lines.length && (/^[-*]\s/.test(lines[i]!) || (lines[i]!.startsWith('  ') && items.length > 0))) {
        if (/^[-*]\s/.test(lines[i]!)) {
          const text = lines[i]!.replace(/^[-*]\s/, '')
          const { checked, content } = extractTaskCheck(text)
          const itemLines: string[] = [content]
          i++
          while (i < lines.length && lines[i]!.startsWith('  ') && !/^[-*]\s/.test(lines[i]!.trim())) {
            itemLines.push(lines[i]!.slice(2))
            i++
          }
          items.push({ blocks: parseBlocks(itemLines.join('\n')), checked })
        } else {
          if (items.length > 0) {
            const lastItem = items[items.length - 1]!
            const sub = parseBlocks(lines[i]!.slice(2))
            lastItem.blocks.push(...sub)
          }
          i++
        }
      }
      blocks.push({ type: 'list', ordered: false, items })
      continue
    }

    // Table
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s-:|]+\|$/.test(lines[i + 1]!.trim())) {
      const headerCells = parseTableRow(line)
      i += 2 // skip header + separator
      const rows: MdSpan[][][] = []
      while (i < lines.length && /^\|/.test(lines[i]!)) {
        rows.push(parseTableRow(lines[i]!))
        i++
      }
      blocks.push({ type: 'table', headers: headerCells, rows })
      continue
    }

    // Image (standalone line)
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (imgMatch) {
      blocks.push({ type: 'image', alt: imgMatch[1] || '', url: imgMatch[2]! })
      i++
      continue
    }

    // Paragraph — collect until blank line or block-level start
    const pLines: string[] = []
    while (i < lines.length && lines[i]!.trim() !== '' && !lines[i]!.startsWith('```') &&
      !lines[i]!.startsWith('#') && !lines[i]!.startsWith('>') &&
      !/^[-*]\s/.test(lines[i]!) && !/^\d+\.\s/.test(lines[i]!) && !/^---+$/.test(lines[i]!.trim()) &&
      !/^\|/.test(lines[i]!) && !/^!\[/.test(lines[i]!)) {
      pLines.push(lines[i]!)
      i++
    }
    if (pLines.length > 0) {
      blocks.push({ type: 'paragraph', spans: parseSpans(pLines.join(' ')) })
    }
  }

  return blocks
}

function parseTableRow(line: string): MdSpan[][] {
  return line
    .replace(/^\||\|$/g, '')
    .split('|')
    .map(cell => parseSpans(cell.trim()))
}

// ─── Height estimation config ────────────────────────────
export type HeightConfig = {
  blockGap: number
  listIndent: number
  quoteIndent: number
  codeBlockPad: number
  bodyFontSize: number
  bodyLineHeight: number
}

const DEFAULT_CONFIG: HeightConfig = {
  blockGap: 10,
  listIndent: 18,
  quoteIndent: 18,
  codeBlockPad: 12,
  bodyFontSize: 14,
  bodyLineHeight: 22,
}

export function estimateBlocksHeight(
  blocks: MdBlock[],
  width: number,
  config?: Partial<HeightConfig>,
): number {
  const c = { ...DEFAULT_CONFIG, ...config }
  let h = 0
  for (let i = 0; i < blocks.length; i++) {
    if (i > 0) h += c.blockGap
    h += estimateBlockHeight(blocks[i]!, width, c)
  }
  return h
}

function estimateBlockHeight(block: MdBlock, width: number, c: HeightConfig): number {
  switch (block.type) {
    case 'paragraph': {
      const text = spansToPlain(block.spans)
      return estimateLines(text, c.bodyFontSize, width) * c.bodyLineHeight
    }
    case 'heading': {
      const text = spansToPlain(block.spans)
      const fs = block.level === 1 ? 20 : block.level === 2 ? 17 : 15
      const lh = block.level === 1 ? 28 : block.level === 2 ? 25 : 22
      return estimateLines(text, fs, width) * lh
    }
    case 'code': {
      const lineCount = block.text.split('\n').length
      return lineCount * 18 + c.codeBlockPad * 2 + (block.lang ? 18 : 0)
    }
    case 'quote':
      return estimateBlocksHeight(block.blocks, width - c.quoteIndent, c)
    case 'list': {
      let total = 0
      for (let i = 0; i < block.items.length; i++) {
        if (i > 0) total += 4
        total += estimateBlocksHeight(block.items[i]!.blocks, width - c.listIndent, c)
      }
      return total
    }
    case 'table': {
      const rowHeight = c.bodyLineHeight
      return rowHeight + block.rows.length * rowHeight + (block.rows.length + 1)
    }
    case 'image':
      return 48
    case 'rule':
      return 18
  }
}

function estimateLines(text: string, fontSize: number, width: number): number {
  if (width <= 0 || text.length === 0) return 1
  const avgCharWidth = fontSize * 0.48
  const charsPerLine = Math.max(1, Math.floor(width / avgCharWidth))
  return Math.max(1, Math.ceil(text.length / charsPerLine))
}

function spansToPlain(spans: MdSpan[]): string {
  return spans.map(s => s.v).join('')
}

// ─── Utility ─────────────────────────────────────────────
export function blocksToPlainText(blocks: MdBlock[]): string {
  return blocks.map(blockToPlain).join('\n')
}

function blockToPlain(block: MdBlock): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
      return spansToPlain(block.spans)
    case 'code':
      return block.text
    case 'quote':
      return blocksToPlainText(block.blocks)
    case 'list':
      return block.items.map(item => blocksToPlainText(item.blocks)).join('\n')
    case 'table':
      return [
        block.headers.map(h => spansToPlain(h)).join(' | '),
        ...block.rows.map(r => r.map(c => spansToPlain(c)).join(' | ')),
      ].join('\n')
    case 'image':
      return block.alt
    case 'rule':
      return ''
  }
}

// ─── Inline span parser ──────────────────────────────────
export function parseSpans(text: string): MdSpan[] {
  const spans: MdSpan[] = []
  const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) spans.push({ t: 'text', v: text.slice(last, m.index) })
    if (m[2]) spans.push({ t: 'bolditalic', v: m[2] })
    else if (m[3]) spans.push({ t: 'bold', v: m[3] })
    else if (m[4]) spans.push({ t: 'italic', v: m[4] })
    else if (m[5]) spans.push({ t: 'strike', v: m[5] })
    else if (m[6]) spans.push({ t: 'code', v: m[6] })
    else if (m[7] && m[8]) spans.push({ t: 'link', v: m[7], url: m[8] })
    last = m.index + m[0].length
  }
  if (last < text.length) spans.push({ t: 'text', v: text.slice(last) })
  return spans
}
