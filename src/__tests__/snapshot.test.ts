globalThis.__DEV__ = false

import { describe, test, expect } from 'bun:test'
import { buildHeightSnapshot, compareHeightSnapshots } from '../snapshot'
import type { TextStyle } from '../types'

const STYLE: TextStyle = { fontFamily: 'System', fontSize: 16, lineHeight: 24 }

describe('buildHeightSnapshot', () => {
  test('empty texts produces empty snapshot', () => {
    const snap = buildHeightSnapshot([], STYLE, 200)
    expect(snap.entries).toEqual([])
    expect(snap.totalHeight).toBe(0)
  })

  test('single text produces one entry', () => {
    const snap = buildHeightSnapshot(['Hello World'], STYLE, 200)
    expect(snap.entries.length).toBe(1)
    expect(snap.entries[0]!.textPreview).toBe('Hello World')
    expect(snap.entries[0]!.height).toBeGreaterThan(0)
  })

  test('multiple texts preserve order', () => {
    const texts = ['Short', 'Medium length text', 'Very long text that will wrap']
    const snap = buildHeightSnapshot(texts, STYLE, 150)
    expect(snap.entries.length).toBe(3)
    expect(snap.entries[0]!.index).toBe(0)
    expect(snap.entries[1]!.index).toBe(1)
    expect(snap.entries[2]!.index).toBe(2)
  })

  test('textPreview is truncated to 40 chars', () => {
    const longText = 'This is a very long text that should be truncated in the preview field'
    const snap = buildHeightSnapshot([longText], STYLE, 200)
    expect(snap.entries[0]!.textPreview.length).toBe(40)
  })

  test('totalHeight sums all entries', () => {
    const snap = buildHeightSnapshot(['A', 'B', 'C'], STYLE, 200)
    const sum = snap.entries.reduce((acc, e) => acc + e.height, 0)
    expect(snap.totalHeight).toBe(sum)
  })

  test('styleKey includes font family and size', () => {
    const snap = buildHeightSnapshot(['Hello'], STYLE, 200)
    expect(snap.styleKey).toContain('System')
    expect(snap.styleKey).toContain('16')
    expect(snap.styleKey).toContain('24')
  })

  test('width stored in snapshot', () => {
    const snap = buildHeightSnapshot(['Hello'], STYLE, 350)
    expect(snap.width).toBe(350)
  })

  test('deterministic — same inputs produce equal snapshots', () => {
    const texts = ['Hello', 'World']
    const snap1 = buildHeightSnapshot(texts, STYLE, 200)
    const snap2 = buildHeightSnapshot(texts, STYLE, 200)
    expect(JSON.stringify(snap1)).toBe(JSON.stringify(snap2))
  })
})

describe('compareHeightSnapshots', () => {
  test('identical snapshots match', () => {
    const texts = ['Hello', 'World']
    const a = buildHeightSnapshot(texts, STYLE, 200)
    const b = buildHeightSnapshot(texts, STYLE, 200)
    const cmp = compareHeightSnapshots(a, b)
    expect(cmp.match).toBe(true)
    expect(cmp.mismatchCount).toBe(0)
    expect(cmp.mismatches.length).toBe(0)
  })

  test('different widths do not match', () => {
    const a = buildHeightSnapshot(['Hello'], STYLE, 200)
    const b = buildHeightSnapshot(['Hello'], STYLE, 300)
    const cmp = compareHeightSnapshots(a, b)
    expect(cmp.match).toBe(false)
  })

  test('different styles do not match', () => {
    const a = buildHeightSnapshot(['Hello'], { ...STYLE, fontSize: 16 }, 200)
    const b = buildHeightSnapshot(['Hello'], { ...STYLE, fontSize: 20 }, 200)
    const cmp = compareHeightSnapshots(a, b)
    expect(cmp.match).toBe(false)
  })

  test('different text counts produce mismatches', () => {
    const a = buildHeightSnapshot(['Hello'], STYLE, 200)
    const b = buildHeightSnapshot(['Hello', 'World'], STYLE, 200)
    const cmp = compareHeightSnapshots(a, b)
    expect(cmp.match).toBe(false)
    expect(cmp.mismatchCount).toBeGreaterThan(0)
  })

  test('mismatch entries include diff details', () => {
    const longA = ['Short text']
    const longB = ['A much longer text that will wrap to multiple lines in a narrow container']
    const a = buildHeightSnapshot(longA, STYLE, 100)
    const b = buildHeightSnapshot(longB, STYLE, 100)
    const cmp = compareHeightSnapshots(a, b)
    expect(cmp.match).toBe(false)
    expect(cmp.mismatches[0]!.heightDiff).toBeGreaterThan(0)
  })
})
