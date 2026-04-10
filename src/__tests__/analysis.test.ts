import { describe, test, expect } from 'bun:test'
import { analyzeText } from '../analysis'

const profile = { carryCJKAfterClosingQuote: true }

describe('analysis performance', () => {
  test('repeated punctuation does not hang (1000 dots)', () => {
    const segments = Array.from({ length: 1000 }, () => '.')
    const isWordLike = segments.map(() => false)

    const start = performance.now()
    const result = analyzeText(segments, isWordLike, profile)
    const elapsed = performance.now() - start
    expect(result.len).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(500)
  })

  test('CJK keep-all with many segments does not hang', () => {
    const segments = Array.from({ length: 500 }, (_, i) => i % 2 === 0 ? '\u6F22' : '\u5B57')
    const isWordLike = segments.map(() => false)

    const start = performance.now()
    const result = analyzeText(segments, isWordLike, profile)
    const elapsed = performance.now() - start
    expect(result.len).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(500)
  })

  test('Arabic text with punctuation does not hang', () => {
    const segments = Array.from({ length: 500 }, (_, i) =>
      i % 3 === 0 ? '\u0645\u0631\u062D\u0628\u0627' : i % 3 === 1 ? '\u060C' : ' '
    )
    const isWordLike = segments.map((_, i) => i % 3 === 0)

    const start = performance.now()
    const result = analyzeText(segments, isWordLike, profile)
    const elapsed = performance.now() - start
    expect(result.len).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(500)
  })

  test('long repeated exclamation marks (2000 chars)', () => {
    const segments = Array.from({ length: 2000 }, () => '!')
    const isWordLike = segments.map(() => false)

    const start = performance.now()
    const result = analyzeText(segments, isWordLike, profile)
    const elapsed = performance.now() - start
    expect(result.len).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(500)
  })

  test('mixed CJK and Latin does not hang', () => {
    const segments = Array.from({ length: 500 }, (_, i) =>
      i % 3 === 0 ? 'hello' : i % 3 === 1 ? '\u4F60\u597D' : ' '
    )
    const isWordLike = segments.map((_, i) => i % 3 !== 2)

    const start = performance.now()
    const result = analyzeText(segments, isWordLike, profile)
    const elapsed = performance.now() - start
    expect(result.len).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(500)
  })
})

describe('merge pipeline efficiency (upstream #119 triage)', () => {
  test('plain text without URLs/numbers passes through merge pipeline', () => {
    const plainText = 'The quick brown fox jumps over the lazy dog'
    const segments = plainText.split(/(\s+)/)
    const isWordLike = segments.map(s => !/^\s+$/.test(s))
    const profile = { carryCJKAfterClosingQuote: false }

    const result = analyzeText(segments, isWordLike, profile)
    expect(result.texts.length).toBeGreaterThan(0)
  })

  test('URL-containing text runs URL merge pass', () => {
    // Simulate how a segmenter splits a URL: scheme, separator, and host/path
    // as separate segments — mergeUrlLikeRuns should collapse them into one
    const segments = ['Visit', ' ', 'https:', '//', 'example.com', '/path', ' ', 'for', ' ', 'info']
    const isWordLike = segments.map(s => !/^\s+$/.test(s))
    const profile = { carryCJKAfterClosingQuote: false }

    const result = analyzeText(segments, isWordLike, profile)
    // mergeUrlLikeRuns collapses 'https:', '//', 'example.com', '/path' into one segment
    expect(result.texts.length).toBeLessThan(segments.length)
  })
})
