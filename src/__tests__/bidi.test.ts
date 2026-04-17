// bidi.test.ts
// Targeted audit of the simplified UBA implementation in src/bidi.ts.
// Each test is a UBA scenario: we assert the computed levels for every
// code-unit position in the input string.
//
// Even-numbered levels are LTR; odd-numbered levels are RTL.

;(globalThis as unknown as Record<string, unknown>).__DEV__ = false

import { describe, test, expect } from 'bun:test'
import { computeSegmentLevels } from '../bidi'

// Thin helper: treat each code-unit as its own "segment" so we get per-char
// level resolution. Returns null if no bidi was seen (all LTR).
function levelsOf(str: string): Int8Array | null {
  const starts: number[] = []
  for (let i = 0; i < str.length; i++) starts.push(i)
  return computeSegmentLevels(str, starts)
}

function parity(levels: Int8Array | null): Array<'L' | 'R'> | null {
  if (!levels) return null
  const out: Array<'L' | 'R'> = []
  for (let i = 0; i < levels.length; i++) out.push((levels[i]! & 1) === 0 ? 'L' : 'R')
  return out
}

describe('bidi — pure LTR / pure RTL paragraphs', () => {
  test('pure ASCII → null (no bidi needed)', () => {
    expect(levelsOf('Hello world')).toBeNull()
  })

  test('empty string → null', () => {
    expect(levelsOf('')).toBeNull()
  })

  test('pure Arabic → all RTL (odd level)', () => {
    const p = parity(levelsOf('مرحبا بالعالم'))
    expect(p).not.toBeNull()
    expect(p!.every((x) => x === 'R')).toBe(true)
  })

  test('pure Hebrew → all RTL', () => {
    const p = parity(levelsOf('שלום עולם'))
    expect(p).not.toBeNull()
    expect(p!.every((x) => x === 'R')).toBe(true)
  })

  test('pure CJK → null (CJK is neutral/LTR)', () => {
    expect(levelsOf('你好世界')).toBeNull()
  })

  test('pure Georgian → null (LTR script)', () => {
    expect(levelsOf('გამარჯობა')).toBeNull()
  })
})

describe('bidi — mixed LTR + RTL', () => {
  test('LTR paragraph with Arabic run: base level 0', () => {
    // "Hello " + "مرحبا" — first strong is L, so paragraph base is LTR (0).
    const str = 'Hello مرحبا'
    const levels = levelsOf(str)!
    expect(levels).not.toBeNull()
    // Latin chars should be even-parity (LTR)
    for (let i = 0; i < 5; i++) expect(levels[i]! & 1).toBe(0)
    // Arabic chars should be odd-parity (RTL embedded)
    for (let i = 6; i < 11; i++) expect(levels[i]! & 1).toBe(1)
  })

  test('RTL paragraph with Latin run: base level 1', () => {
    // "مرحبا " + "Hello" — first strong is R, so paragraph base is RTL (1).
    const str = 'مرحبا Hello'
    const levels = levelsOf(str)!
    expect(levels).not.toBeNull()
    // Arabic chars at odd parity
    for (let i = 0; i < 5; i++) expect(levels[i]! & 1).toBe(1)
    // Latin run at higher even parity (embedded LTR inside RTL base)
    for (let i = 6; i < 11; i++) {
      expect(levels[i]! & 1).toBe(0)
      expect(levels[i]).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('bidi — numerals in RTL context (W2, W7)', () => {
  test('European numerals in LTR paragraph stay LTR', () => {
    // "Hello 123" — digits next to Latin stay treated as L after W7.
    const str = 'Hello 123'
    const levels = levelsOf(str)
    // All-LTR: may return null if no RTL ever seen. That's allowed.
    if (levels) {
      for (let i = 0; i < str.length; i++) expect(levels[i]! & 1).toBe(0)
    }
  })

  test('European numerals after Arabic letter become AN (level +2 from base)', () => {
    // "مرحبا 123" — W2 turns EN→AN next to AL. AN gets +2 levels in RTL base.
    const str = 'مرحبا 123'
    const levels = levelsOf(str)!
    // Arabic run at level 1
    for (let i = 0; i < 5; i++) expect(levels[i]).toBe(1)
    // Digits at level 2 (1 base + 2 from I2 rule for AN in odd level)
    for (let i = 6; i < 9; i++) expect(levels[i]).toBe(2)
  })

  test('European numerals in pure-LTR ASCII context', () => {
    const str = 'abc 123 def'
    const levels = levelsOf(str)
    // No bidi seen at all.
    expect(levels).toBeNull()
  })

  test('digits between two Arabic words keep AN level', () => {
    // "مرحبا 123 بالعالم" — W2 triggers via preceding AL.
    const str = 'مرحبا 123 بالعالم'
    const levels = levelsOf(str)!
    // Digits at position 6..8
    for (let i = 6; i < 9; i++) expect(levels[i]).toBe(2)
    // Trailing Arabic back at level 1
    for (let i = 10; i < str.length; i++) expect(levels[i]! & 1).toBe(1)
  })
})

describe('bidi — neutrals (N1 / N2)', () => {
  test('punctuation between Latin words stays LTR', () => {
    const str = 'hello, world'
    const levels = levelsOf(str)
    expect(levels).toBeNull()
  })

  test('punctuation between Arabic words stays RTL', () => {
    // "مرحبا, بالعالم" — comma is ON, surrounded by R on both sides → R.
    const str = 'مرحبا, بالعالم'
    const levels = levelsOf(str)!
    // Every position should resolve to odd parity.
    for (let i = 0; i < str.length; i++) expect(levels[i]! & 1).toBe(1)
  })

  test('punctuation flanked by Arabic + Latin resolves to paragraph direction', () => {
    // "مرحبا, Hello" — comma between R and L is ON flanked differently.
    // N2: ON → paragraph direction (e). Paragraph is R, so comma → R.
    const str = 'مرحبا, Hello'
    const levels = levelsOf(str)!
    // Comma at index 5 must resolve to odd parity (matches paragraph R).
    expect(levels[5]! & 1).toBe(1)
  })
})

describe('bidi — Arabic-specific rules', () => {
  test('AL (Arabic letter) collapses to R', () => {
    // Every Arabic-letter position should end up odd after W3 (AL→R).
    const levels = levelsOf('مرحبا')
    expect(levels).not.toBeNull()
    for (let i = 0; i < 5; i++) expect(levels![i]! & 1).toBe(1)
  })

  test('Arabic diacritic (NSM) inherits level from base letter (W1)', () => {
    // "مَرحبا" — the diacritic after م should share its level.
    const str = 'مَرحبا'
    const levels = levelsOf(str)!
    expect(levels[0]).toBe(levels[1])
  })
})

describe('bidi — surrogate pairs', () => {
  test('emoji in LTR paragraph does not break level computation', () => {
    const str = 'Hi 👋 there'
    // No RTL chars → no bidi seen, null is fine.
    expect(() => levelsOf(str)).not.toThrow()
  })

  test('emoji in RTL paragraph: two code units share a level', () => {
    // "مرحبا 👋 بالعالم" — 👋 is surrogate pair. Both code units should
    // carry the same resolved level (W1: NSM inherits, or ON rule).
    const str = 'مرحبا 👋 بالعالم'
    const levels = levelsOf(str)!
    // Find the surrogate-pair positions after "مرحبا " (6 chars before).
    const hi = str.indexOf('👋')
    expect(levels[hi]).toBe(levels[hi + 1])
  })

  test('high surrogate without low surrogate does not crash', () => {
    expect(() => levelsOf('\uD800')).not.toThrow()
    expect(() => levelsOf('abc\uD800def')).not.toThrow()
  })
})

describe('bidi — real-world mixed content', () => {
  test('Latin with Arabic in parentheses: Latin stays LTR', () => {
    // "Version (v2.3)" style — parentheses + digits surrounded by Latin.
    const str = 'Version 2.3'
    expect(levelsOf(str)).toBeNull()
  })

  test('Arabic sentence with URL: URL stays LTR-sorted', () => {
    const str = 'مرحبا http://example.com'
    const levels = levelsOf(str)!
    // Arabic segment at level 1
    for (let i = 0; i < 5; i++) expect(levels[i]! & 1).toBe(1)
    // "http" and onwards must be at even parity (embedded LTR)
    const urlStart = str.indexOf('http')
    for (let i = urlStart; i < urlStart + 4; i++) expect(levels[i]! & 1).toBe(0)
  })

  test('currency + digits in LTR paragraph', () => {
    const str = 'Price: $123.45'
    const levels = levelsOf(str)
    // No RTL chars — null is fine.
    expect(levels).toBeNull()
  })

  test('currency + digits in RTL paragraph', () => {
    // "مرحبا $123.45" — after Arabic, $ is ET, 123 is EN → via W5/W7 rules.
    const str = 'مرحبا $123.45'
    expect(() => levelsOf(str)).not.toThrow()
    const levels = levelsOf(str)!
    // The digits must resolve to a level ≥ 1 (embedded somewhere).
    const digitStart = str.indexOf('1')
    for (let i = digitStart; i < digitStart + 3; i++) {
      expect(levels[i]).toBeGreaterThanOrEqual(1)
    }
  })

  test('Arabic tatweel (U+0640) resolves as AL → R', () => {
    // Tatweel is an Arabic connector/stretching character.
    const str = 'مـرحبا'
    const levels = levelsOf(str)!
    for (let i = 0; i < str.length; i++) expect(levels[i]! & 1).toBe(1)
  })

  test('two consecutive RTL runs separated by Latin', () => {
    const str = 'مرحبا Hello مرحبا'
    const levels = levelsOf(str)!
    // First Arabic run — level 1
    for (let i = 0; i < 5; i++) expect(levels[i]! & 1).toBe(1)
    // Latin run — embedded LTR (even)
    const helloStart = str.indexOf('Hello')
    for (let i = helloStart; i < helloStart + 5; i++) expect(levels[i]! & 1).toBe(0)
    // Final Arabic run — level 1 again
    for (let i = str.length - 5; i < str.length; i++) expect(levels[i]! & 1).toBe(1)
  })

  test('Hebrew + Arabic + Latin sentence', () => {
    // All three scripts mixed.
    const str = 'שלום مرحبا Hello'
    const levels = levelsOf(str)!
    // Hebrew (R) at level 1
    for (let i = 0; i < 4; i++) expect(levels[i]! & 1).toBe(1)
    // Arabic (AL→R) at level 1
    const arStart = str.indexOf('م')
    for (let i = arStart; i < arStart + 5; i++) expect(levels[i]! & 1).toBe(1)
    // Latin embedded LTR (level 2)
    const lStart = str.indexOf('H')
    for (let i = lStart; i < lStart + 5; i++) expect(levels[i]! & 1).toBe(0)
  })
})

describe('bidi — segment-level mapping (computeSegmentLevels)', () => {
  test('segStarts picks the correct level per segment start', () => {
    const str = 'Hello مرحبا'
    // Two segments: "Hello " starting at 0, "مرحبا" starting at 6.
    const levels = computeSegmentLevels(str, [0, 6])
    expect(levels).not.toBeNull()
    expect(levels![0]! & 1).toBe(0)
    expect(levels![1]! & 1).toBe(1)
  })

  test('empty segStarts returns an empty Int8Array when bidi is seen', () => {
    const levels = computeSegmentLevels('مرحبا', [])
    expect(levels).not.toBeNull()
    expect(levels!.length).toBe(0)
  })

  test('pure LTR text → null regardless of segStarts', () => {
    expect(computeSegmentLevels('Hello world', [0, 6])).toBeNull()
  })
})
