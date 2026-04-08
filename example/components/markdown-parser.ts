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
