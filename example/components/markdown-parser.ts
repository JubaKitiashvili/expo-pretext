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

// ─── Parse cache ─────────────────────────────────────────
const parseCache = new Map<string, MdBlock[]>()

export function parseMarkdown(md: string): MdBlock[] {
  const cached = parseCache.get(md)
  if (cached) return cached
  const result = parseBlocks(md)
  parseCache.set(md, result)
  return result
}

export function clearParseCache() { parseCache.clear() }

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

    // (blockquotes, lists, tables, images — added in later tasks)

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
