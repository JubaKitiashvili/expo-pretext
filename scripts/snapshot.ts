// scripts/snapshot.ts
//
// Regression harness — builds a deterministic height snapshot of a curated
// corpus × widths × styles and either writes it to the baseline file or
// compares against the stored baseline. Runs in CI to catch unintended
// drift in the layout engine.
//
//   bun run snapshot         # check against baseline (exits non-zero on drift)
//   bun run snapshot update  # rewrite baseline after intentional changes
//
// JS fallback path (native backends are measured separately on-device).

;(globalThis as unknown as Record<string, unknown>).__DEV__ = false

import { buildPreparedText } from '../src/build'
import { analyzeText } from '../src/analysis'
import { layout } from '../src/layout'
import type { TextStyle, NativeSegmentResult } from '../src/types'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

// ---------------------------------------------------------------------------
// Corpus — mirrors example/data/sample-texts.ts plus edge cases
// ---------------------------------------------------------------------------

const CORPUS: Record<string, string> = {
  english: 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.',
  arabic: 'بدأت الرحلة في يوم مشمس من أيام الربيع، حين كانت الأزهار تتفتح في كل مكان.',
  chinese: '春天到了，万物复苏，到处都是生机勃勃的景象。小鸟在枝头歌唱，花儿在微风中摇曳。',
  japanese: '羅生門の下で雨やみを待っていた。広い門の下にはこの男のほかに誰もいない。',
  georgian: 'საქართველო მდიდარი ისტორიისა და კულტურის ქვეყანაა. კავკასიის მთების ძირას განლაგებული.',
  thai: 'ในวันหนึ่ง มีชายหนุ่มคนหนึ่งออกเดินทางไปยังเมืองที่ห่างไกล เพื่อค้นหาความจริงของชีวิต',
  emoji: 'AGI 春天到了 🚀 Hello مرحبا 🇬🇪🇯🇵 テスト 测试 한국어 สวัสดี',
  mixed: 'React Native is 🔥 and expo-pretext measures text heights accurately across العربية, 中文, 日本語, and ქართული!',
  short: 'Hello.',
  empty: '',
  single_word: 'Supercalifragilisticexpialidocious',
  many_newlines: 'Line 1\nLine 2\nLine 3\nLine 4',
  only_whitespace: '     ',
  mixed_scripts_rtl_ltr: 'Hello مرحبا שלום 你好',
}

const WIDTHS = [160, 240, 320, 420, 640]

const STYLES: Array<{ key: string; style: TextStyle }> = [
  { key: '16/24', style: { fontFamily: 'System', fontSize: 16, lineHeight: 24 } },
  { key: '14/20', style: { fontFamily: 'System', fontSize: 14, lineHeight: 20 } },
  { key: '20/30', style: { fontFamily: 'System', fontSize: 20, lineHeight: 30 } },
]

const PROFILE = { carryCJKAfterClosingQuote: false }

// ---------------------------------------------------------------------------
// Same JS-fallback segmenter as the tests
// ---------------------------------------------------------------------------

function estimateSegments(text: string, style: TextStyle): NativeSegmentResult {
  if (!text) return { segments: [], isWordLike: [], widths: [] }
  const words = text.split(/(\s+)/)
  const charWidth = style.fontSize * 0.55
  return {
    segments: words,
    isWordLike: words.map((w) => !/^\s+$/.test(w)),
    widths: words.map((w) => w.length * charWidth),
  }
}

function widthMap(r: NativeSegmentResult): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < r.segments.length; i++) m.set(r.segments[i]!, r.widths[i]!)
  return m
}

function prepareHeight(text: string, style: TextStyle, width: number): { height: number; lineCount: number } {
  const s = estimateSegments(text, style)
  const a = analyzeText(s.segments, s.isWordLike, PROFILE)
  const p = buildPreparedText(a, widthMap(s), style)
  return layout(p, width)
}

// ---------------------------------------------------------------------------
// Snapshot build + compare
// ---------------------------------------------------------------------------

type Entry = {
  key: string       // `${corpusKey}_${styleKey}_${width}`
  corpus: string
  style: string
  width: number
  height: number
  lineCount: number
}

type Snapshot = {
  version: 1
  createdAt: string
  total: number
  entries: Entry[]
}

function buildSnapshot(): Snapshot {
  const entries: Entry[] = []
  for (const corpusKey of Object.keys(CORPUS)) {
    const text = CORPUS[corpusKey]!
    for (const { key: styleKey, style } of STYLES) {
      for (const width of WIDTHS) {
        const { height, lineCount } = prepareHeight(text, style, width)
        entries.push({
          key: `${corpusKey}_${styleKey}_${width}`,
          corpus: corpusKey,
          style: styleKey,
          width,
          height,
          lineCount,
        })
      }
    }
  }
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    total: entries.length,
    entries,
  }
}

type Diff = {
  key: string
  field: 'height' | 'lineCount'
  expected: number
  actual: number
  delta: number
}

function compareSnapshots(baseline: Snapshot, current: Snapshot): Diff[] {
  const diffs: Diff[] = []
  const baselineByKey = new Map(baseline.entries.map((e) => [e.key, e] as const))
  const currentByKey = new Map(current.entries.map((e) => [e.key, e] as const))

  for (const [key, curr] of currentByKey) {
    const base = baselineByKey.get(key)
    if (!base) {
      diffs.push({ key, field: 'height', expected: 0, actual: curr.height, delta: curr.height })
      continue
    }
    if (base.height !== curr.height) {
      diffs.push({
        key, field: 'height',
        expected: base.height, actual: curr.height,
        delta: curr.height - base.height,
      })
    }
    if (base.lineCount !== curr.lineCount) {
      diffs.push({
        key, field: 'lineCount',
        expected: base.lineCount, actual: curr.lineCount,
        delta: curr.lineCount - base.lineCount,
      })
    }
  }
  for (const key of baselineByKey.keys()) {
    if (!currentByKey.has(key)) {
      const base = baselineByKey.get(key)!
      diffs.push({ key, field: 'height', expected: base.height, actual: 0, delta: -base.height })
    }
  }
  return diffs
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const BASELINE_PATH = join(import.meta.dir, '..', 'docs', 'snapshots', 'baseline.json')
const MODE = process.argv[2] === 'update' ? 'update' : 'check'

function writeBaseline(snapshot: Snapshot): void {
  mkdirSync(dirname(BASELINE_PATH), { recursive: true })
  writeFileSync(BASELINE_PATH, JSON.stringify(snapshot, null, 2) + '\n')
}

function readBaseline(): Snapshot | null {
  if (!existsSync(BASELINE_PATH)) return null
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as Snapshot
}

const current = buildSnapshot()

if (MODE === 'update') {
  writeBaseline(current)
  console.log(`✓ Baseline written: ${BASELINE_PATH}`)
  console.log(`  ${current.total} entries · ${Object.keys(CORPUS).length} corpora × ${STYLES.length} styles × ${WIDTHS.length} widths`)
  process.exit(0)
}

// check mode
const baseline = readBaseline()
if (!baseline) {
  console.log('No baseline found — creating one.')
  writeBaseline(current)
  console.log(`✓ Baseline written: ${BASELINE_PATH}`)
  process.exit(0)
}

const diffs = compareSnapshots(baseline, current)

if (diffs.length === 0) {
  console.log(`✓ Snapshot matches baseline (${current.total} entries)`)
  process.exit(0)
}

console.error(`✗ Snapshot mismatch: ${diffs.length} differences vs baseline`)
console.error('')
for (const d of diffs.slice(0, 30)) {
  const sign = d.delta > 0 ? '+' : ''
  console.error(`  ${d.key.padEnd(45)} ${d.field.padEnd(10)} ${String(d.expected).padStart(6)} → ${String(d.actual).padStart(6)}  (${sign}${d.delta})`)
}
if (diffs.length > 30) console.error(`  ... and ${diffs.length - 30} more`)
console.error('')
console.error('If the drift is intentional, update the baseline:')
console.error('  bun run snapshot update')
process.exit(1)
