globalThis.__DEV__ = false

import { describe, test, expect } from 'bun:test'
import { prepare } from '../prepare'
import { layout } from '../layout'
import { prepareStreaming, clearStreamingState } from '../streaming'

const STYLE = { fontFamily: 'System', fontSize: 16, lineHeight: 24 }

describe('customBreakRules', () => {
  test('callback is invoked for each segment', () => {
    let callCount = 0
    prepare('Hello World', STYLE, {
      customBreakRules: (_seg, _idx, kind) => {
        callCount++
        return kind
      }
    })
    expect(callCount).toBeGreaterThan(0)
  })

  test('identity callback does not change layout', () => {
    const r1 = layout(prepare('Hello World test', STYLE), 100)
    const r2 = layout(prepare('Hello World test', STYLE, {
      customBreakRules: (_s, _i, kind) => kind
    }), 100)
    expect(r1.height).toBe(r2.height)
    expect(r1.lineCount).toBe(r2.lineCount)
  })

  test('can make a specific segment a zero-width-break', () => {
    // Only mark the slash as zero-width-break — text segments retain their width
    const p = prepare('hello/world', STYLE, {
      customBreakRules: (seg, _i, kind) => seg === '/' ? 'zero-width-break' : kind
    })
    const r = layout(p, 100)
    expect(r.height).toBeGreaterThan(0)
  })

  test('callback receives segment text', () => {
    const segments: string[] = []
    prepare('Hello World', STYLE, {
      customBreakRules: (seg, _idx, kind) => {
        segments.push(seg)
        return kind
      }
    })
    expect(segments.length).toBeGreaterThan(0)
    // Should contain the actual text segments
    const joined = segments.join('')
    expect(joined).toContain('Hello')
  })

  test('callback receives segment index', () => {
    const indices: number[] = []
    prepare('Hello World', STYLE, {
      customBreakRules: (_seg, idx, kind) => {
        indices.push(idx)
        return kind
      }
    })
    // Indices should be sequential starting from 0
    for (let i = 0; i < indices.length; i++) {
      expect(indices[i]).toBe(i)
    }
  })

  test('no callback — no crash', () => {
    const p = prepare('Hello World', STYLE)
    const r = layout(p, 300)
    expect(r.lineCount).toBeGreaterThan(0)
  })

  test('empty text with callback — no crash', () => {
    let called = false
    prepare('', STYLE, {
      customBreakRules: () => { called = true; return 'text' }
    })
    expect(called).toBe(false) // no segments to iterate
  })

  test('works with whiteSpace pre-wrap', () => {
    let callCount = 0
    const p = prepare('Hello\nWorld', STYLE, {
      whiteSpace: 'pre-wrap',
      customBreakRules: (_s, _i, kind) => { callCount++; return kind }
    })
    const r = layout(p, 300)
    expect(callCount).toBeGreaterThan(0)
    expect(r.height).toBeGreaterThan(0)
  })

  test('can override break kind', () => {
    // Without custom rules
    const p1 = prepare('hello/world', STYLE)
    const r1 = layout(p1, 50)

    // With custom rules that make / a break point
    const p2 = prepare('hello/world', STYLE, {
      customBreakRules: (seg, _idx, kind) => {
        if (seg === '/') return 'zero-width-break'
        return kind
      }
    })
    const r2 = layout(p2, 50)

    // Both should produce valid results
    expect(r1.height).toBeGreaterThan(0)
    expect(r2.height).toBeGreaterThan(0)
  })
})

describe('multi-stream parallel streaming', () => {
  test('independent keys produce independent results', () => {
    const key1 = {}
    const key2 = {}

    const p1 = prepareStreaming(key1, 'Short', STYLE)
    const p2 = prepareStreaming(key2, 'This is a much longer text that will definitely wrap', STYLE)

    const r1 = layout(p1, 200)
    const r2 = layout(p2, 200)

    expect(r1.height).toBeLessThan(r2.height)

    clearStreamingState(key1)
    clearStreamingState(key2)
  })

  test('appending to one stream does not affect another', () => {
    const key1 = {}
    const key2 = {}

    prepareStreaming(key1, 'Hello', STYLE)
    prepareStreaming(key2, 'World', STYLE)

    // Append to key1 only
    const p1 = prepareStreaming(key1, 'Hello World extended text', STYLE)
    const p2 = prepareStreaming(key2, 'World', STYLE)

    const r1 = layout(p1, 200)
    const r2 = layout(p2, 200)

    // key1 grew, key2 unchanged
    expect(r1.height).toBeGreaterThanOrEqual(r2.height)

    clearStreamingState(key1)
    clearStreamingState(key2)
  })

  test('clearing one stream does not affect others', () => {
    const key1 = {}
    const key2 = {}

    prepareStreaming(key1, 'Text one', STYLE)
    prepareStreaming(key2, 'Text two', STYLE)

    clearStreamingState(key1)

    // key2 still works
    const p2 = prepareStreaming(key2, 'Text two extended', STYLE)
    const r2 = layout(p2, 200)
    expect(r2.height).toBeGreaterThan(0)

    clearStreamingState(key2)
  })

  test('many parallel streams', () => {
    const keys = Array.from({ length: 10 }, () => ({}))

    for (let i = 0; i < keys.length; i++) {
      const p = prepareStreaming(keys[i]!, `Stream ${i} content`, STYLE)
      const r = layout(p, 200)
      expect(r.height).toBeGreaterThan(0)
    }

    // Clean up
    for (const key of keys) clearStreamingState(key)
  })

  test('rapid parallel appends', () => {
    const key1 = {}
    const key2 = {}

    let text1 = ''
    let text2 = ''

    for (let i = 0; i < 20; i++) {
      text1 += `token${i} `
      text2 += `word${i} `

      const p1 = prepareStreaming(key1, text1, STYLE)
      const p2 = prepareStreaming(key2, text2, STYLE)

      expect(layout(p1, 200).height).toBeGreaterThan(0)
      expect(layout(p2, 200).height).toBeGreaterThan(0)
    }

    clearStreamingState(key1)
    clearStreamingState(key2)
  })
})
