// hyphenation.test.ts
// Unit tests for the Liang-Knuth hyphenation utility. Uses a tiny curated
// pattern set instead of bundling a full language dictionary.

;(globalThis as unknown as Record<string, unknown>).__DEV__ = false

import { describe, test, expect } from 'bun:test'
import {
  compileHyphenationPatterns,
  hyphenate,
  hyphenateAndJoin,
} from '../hyphenation'

// A minimal handcrafted pattern set — just enough to exercise every rule.
// Real apps would bundle a full TeX dictionary.
const MINI_PATTERNS = [
  'hy3ph',
  'he2n',
  'hena4',
  'hen5at',
  'n2at',
  '1na',
  '.com5put',
  'pu3t3er',
  'as1so',
  'so1ci',
  'ci1ate',
]

describe('compileHyphenationPatterns', () => {
  test('extracts letters and per-position levels from each pattern', () => {
    const patterns = compileHyphenationPatterns(['hy3ph'])
    expect(patterns.entries.get('hyph')).toEqual([0, 0, 3, 0, 0])
  })

  test('handles patterns with multiple levels', () => {
    const patterns = compileHyphenationPatterns(['pu3t3er'])
    // 5 letters → 6 gaps. Two 3's stand at (u,t) and (t,e) boundaries.
    expect(patterns.entries.get('puter')).toEqual([0, 0, 3, 3, 0, 0])
  })

  test('handles pattern with leading dot (word start anchor)', () => {
    const patterns = compileHyphenationPatterns(['.com5put'])
    // .comput has 7 letters and 8 positional levels; the 5 sits between
    // 'm' and 'p' → index 4.
    expect(patterns.entries.get('.comput')).toEqual([0, 0, 0, 0, 5, 0, 0, 0])
  })

  test('defaults leftMin/rightMin to 2', () => {
    const patterns = compileHyphenationPatterns(['hy3ph'])
    expect(patterns.leftMin).toBe(2)
    expect(patterns.rightMin).toBe(2)
  })

  test('honors custom leftMin/rightMin', () => {
    const patterns = compileHyphenationPatterns(['hy3ph'], { leftMin: 3, rightMin: 4 })
    expect(patterns.leftMin).toBe(3)
    expect(patterns.rightMin).toBe(4)
  })

  test('clamps leftMin/rightMin to ≥ 1', () => {
    const patterns = compileHyphenationPatterns([], { leftMin: 0, rightMin: -5 })
    expect(patterns.leftMin).toBe(1)
    expect(patterns.rightMin).toBe(1)
  })

  test('compiles exception words from dashed form', () => {
    const patterns = compileHyphenationPatterns([], { exceptions: ['as-so-ciate'] })
    expect(patterns.exceptions.get('associate')).toEqual([2, 4])
  })
})

describe('hyphenate', () => {
  const patterns = compileHyphenationPatterns(MINI_PATTERNS)

  test('returns empty for words shorter than leftMin + rightMin', () => {
    expect(hyphenate('hi', patterns)).toEqual([])
    expect(hyphenate('abc', patterns)).toEqual([])
  })

  test('finds a single break on odd-weight pattern', () => {
    // "hyphenation": patterns hit hy3ph (break between y and p at pos 2)
    // and hen5at (break between n and a at pos 6).
    const positions = hyphenate('hyphenation', patterns)
    expect(positions).toContain(2)
    expect(positions).toContain(6)
  })

  test('no break where patterns produce even weights', () => {
    // he2n → level 2 (even) → forbidden. If that's the only pattern around
    // "hen", no break there.
    const small = compileHyphenationPatterns(['he2n'])
    expect(hyphenate('hen', small)).toEqual([])
  })

  test('higher level wins (max per position)', () => {
    // Two patterns disagree on the same break position; the max wins.
    // Word "abcdef" with leftMin=1/rightMin=1 allows breaks at 1..5.
    const overlap = compileHyphenationPatterns(['ab2cd', 'bc3de'], {
      leftMin: 1,
      rightMin: 1,
    })
    // "abcdef" padded: ".abcdef."
    //   ab2cd → level 2 at the "c-d" boundary → between word[2]='c' and [3]='d' (p=3)
    //   bc3de → level 3 at the "c-d" boundary → higher, wins and is odd
    expect(hyphenate('abcdef', overlap)).toContain(3)
  })

  test('leftMin / rightMin gates output', () => {
    const liberal = compileHyphenationPatterns(['a1b', 'b1c', 'c1d'], {
      leftMin: 1, rightMin: 1,
    })
    expect(hyphenate('abcd', liberal).length).toBeGreaterThan(0)

    const strict = compileHyphenationPatterns(['a1b', 'b1c', 'c1d'], {
      leftMin: 3, rightMin: 3,
    })
    // Word length 4, leftMin=3, rightMin=3 → no valid positions.
    expect(hyphenate('abcd', strict)).toEqual([])
  })

  test('case-insensitive lookup, preserves word case', () => {
    const positions = hyphenate('Hyphenation', patterns)
    expect(positions).toContain(2)
  })

  test('exceptions override pattern output', () => {
    const withException = compileHyphenationPatterns(MINI_PATTERNS, {
      exceptions: ['as-so-ciate'],
    })
    // Exception says break at 2 and 4.
    expect(hyphenate('associate', withException)).toEqual([2, 4])
  })

  test('exception filter respects leftMin/rightMin', () => {
    const withException = compileHyphenationPatterns([], {
      leftMin: 3,
      rightMin: 3,
      exceptions: ['as-so-ciate'],
    })
    // Only break position 4 is ≥ 3 and ≤ 9-3=6.
    expect(hyphenate('associate', withException)).toEqual([4])
  })

  test('does not throw on words with non-letter characters', () => {
    expect(() => hyphenate('hello-world', patterns)).not.toThrow()
    expect(() => hyphenate("don't", patterns)).not.toThrow()
  })

  test('returns empty for words with no matching patterns', () => {
    const noPatterns = compileHyphenationPatterns([])
    expect(hyphenate('anything', noPatterns)).toEqual([])
  })

  test('positions are strictly increasing', () => {
    const positions = hyphenate('hyphenation', patterns)
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]!).toBeGreaterThan(positions[i - 1]!)
    }
  })
})

describe('hyphenateAndJoin', () => {
  const patterns = compileHyphenationPatterns(MINI_PATTERNS)

  test('inserts soft hyphens at break positions', () => {
    const result = hyphenateAndJoin('hyphenation', patterns)
    // Contains at least one SOFT HYPHEN (U+00AD)
    expect(result).toContain('\u00AD')
    // Reconstructed text without soft hyphens matches input
    expect(result.replace(/\u00AD/g, '')).toBe('hyphenation')
  })

  test('supports custom separator', () => {
    const result = hyphenateAndJoin('hyphenation', patterns, '|')
    expect(result).toContain('|')
    expect(result.replace(/\|/g, '')).toBe('hyphenation')
  })

  test('returns input unchanged when no break positions found', () => {
    const noPatterns = compileHyphenationPatterns([])
    expect(hyphenateAndJoin('anything', noPatterns)).toBe('anything')
  })

  test('works on short words (returns unchanged)', () => {
    expect(hyphenateAndJoin('hi', patterns)).toBe('hi')
  })
})

describe('hyphenation — performance sanity', () => {
  const patterns = compileHyphenationPatterns(MINI_PATTERNS)

  test('handles a batch of 1000 words without throwing', () => {
    const words = new Array(1000).fill('hyphenation')
    expect(() => words.map((w) => hyphenate(w, patterns))).not.toThrow()
  })
})
