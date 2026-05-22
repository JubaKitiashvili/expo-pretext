// src/__tests__/web-backend.test.ts
;(globalThis as unknown as Record<string, unknown>).__DEV__ = false

import { describe, test, expect } from 'bun:test'
import { createWebBackend, type WebBackendModule } from '../web-backend'

const FONT = { fontFamily: 'System', fontSize: 16 }

type FakeCanvasContext = {
  font: string
  measureText: (text: string) => {
    width: number
    actualBoundingBoxLeft?: number
    actualBoundingBoxRight?: number
    actualBoundingBoxAscent?: number
    actualBoundingBoxDescent?: number
    fontBoundingBoxAscent?: number
    fontBoundingBoxDescent?: number
  }
}

function installFakeCanvasContext(): {
  readonly ctx: FakeCanvasContext
  readonly restore: () => void
} {
  const g = globalThis as unknown as Record<string, unknown>
  const previous = g.OffscreenCanvas
  const ctx: FakeCanvasContext = {
    font: '',
    measureText: (text: string) => ({
      width: text.length * 10,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: text.length * 10,
      actualBoundingBoxAscent: 12,
      actualBoundingBoxDescent: 4,
      fontBoundingBoxAscent: 12,
      fontBoundingBoxDescent: 4,
    }),
  }
  Object.defineProperty(g, 'OffscreenCanvas', {
    configurable: true,
    writable: true,
    value: class {
    constructor(_width: number, _height: number) {}
    getContext(type: string): FakeCanvasContext | null {
      return type === '2d' ? ctx : null
    }
    },
  })
  return {
    ctx,
    restore: () => {
      if (previous === undefined) {
        delete g.OffscreenCanvas
      } else {
        Object.defineProperty(g, 'OffscreenCanvas', {
          configurable: true,
          writable: true,
          value: previous,
        })
      }
    },
  }
}

describe('createWebBackend', () => {
  test('returns object with all required methods', () => {
    const backend = createWebBackend()
    expect(typeof backend.segmentAndMeasure).toBe('function')
    expect(typeof backend.batchSegmentAndMeasure).toBe('function')
    expect(typeof backend.measureGraphemeWidths).toBe('function')
    expect(typeof backend.remeasureMerged).toBe('function')
    expect(typeof backend.measureTextHeight).toBe('function')
    expect(typeof backend.segmentAndMeasureAsync).toBe('function')
    expect(typeof backend.clearNativeCache).toBe('function')
    expect(typeof backend.setNativeCacheSize).toBe('function')
  })
})

describe('segmentAndMeasure', () => {
  test('empty text returns empty arrays', () => {
    const backend = createWebBackend()
    const result = backend.segmentAndMeasure('', FONT)
    expect(result.segments).toEqual([])
    expect(result.isWordLike).toEqual([])
    expect(result.widths).toEqual([])
  })

  test('non-empty text throws without canvas (Bun has no canvas)', () => {
    const backend = createWebBackend()
    expect(() => backend.segmentAndMeasure('hello', FONT)).toThrow('No canvas available')
  })
})

describe('batchSegmentAndMeasure', () => {
  test('empty texts array returns empty array', () => {
    const backend = createWebBackend()
    const results = backend.batchSegmentAndMeasure([], FONT)
    expect(results).toEqual([])
  })

  test('batch with empty strings', () => {
    const backend = createWebBackend()
    const results = backend.batchSegmentAndMeasure(['', ''], FONT)
    expect(results).toHaveLength(2)
    expect(results[0]!.segments).toEqual([])
    expect(results[1]!.segments).toEqual([])
  })
})

describe('measureTextHeight', () => {
  test('throws on web', () => {
    const backend = createWebBackend()
    expect(() => backend.measureTextHeight('hello', FONT, 100, 24)).toThrow('not available on web')
  })
})

describe('segmentAndMeasureAsync', () => {
  test('empty text resolves to empty arrays', async () => {
    const backend = createWebBackend()
    const result = await backend.segmentAndMeasureAsync('', FONT)
    expect(result.segments).toEqual([])
  })
})

describe('clearNativeCache', () => {
  test('does not throw', () => {
    const backend = createWebBackend()
    expect(() => backend.clearNativeCache()).not.toThrow()
  })

  test('lets the backend pick up a canvas that appears after an earlier no-canvas lookup', () => {
    const backend = createWebBackend()
    expect(() => backend.segmentAndMeasure('hello', FONT)).toThrow('No canvas available')

    const { restore } = installFakeCanvasContext()
    try {
      backend.clearNativeCache()
      const result = backend.segmentAndMeasure('hello', FONT)
      expect(result.segments.length).toBeGreaterThan(0)
      expect(result.widths[0]).toBeGreaterThan(0)
    } finally {
      restore()
      backend.clearNativeCache()
    }
  })
})

describe('setNativeCacheSize', () => {
  test('does not throw', () => {
    const backend = createWebBackend()
    expect(() => backend.setNativeCacheSize(1000)).not.toThrow()
  })
})

describe('measureGraphemeWidths without canvas', () => {
  test('falls back to estimated widths', () => {
    const backend = createWebBackend()
    const widths = backend.measureGraphemeWidths('Hi', FONT)
    expect(widths).toHaveLength(1) // fallback: [2 * 16 * 0.55]
    expect(widths[0]).toBeGreaterThan(0)
  })
})

describe('web Canvas font string', () => {
  test('maps System to the unquoted RN Web system stack', () => {
    const backend = createWebBackend()
    const { ctx, restore } = installFakeCanvasContext()
    try {
      backend.clearNativeCache()
      backend.measureGraphemeWidths('Hi', { fontFamily: 'System', fontSize: 16 })
      expect(ctx.font).toContain('system-ui')
      expect(ctx.font).not.toContain('"System"')
    } finally {
      restore()
      backend.clearNativeCache()
    }
  })

  test('does not quote CSS fallback stacks or generic font families', () => {
    const backend = createWebBackend()
    const { ctx, restore } = installFakeCanvasContext()
    try {
      backend.clearNativeCache()
      backend.measureGraphemeWidths('Hi', { fontFamily: 'Arial, sans-serif', fontSize: 16 })
      expect(ctx.font).toContain('Arial, sans-serif')
      expect(ctx.font).not.toContain('"Arial, sans-serif"')

      backend.measureGraphemeWidths('Hi', { fontFamily: 'sans-serif', fontSize: 16 })
      expect(ctx.font).toContain('sans-serif')
      expect(ctx.font).not.toContain('"sans-serif"')
    } finally {
      restore()
      backend.clearNativeCache()
    }
  })

  test('keeps quoting concrete custom font names with spaces', () => {
    const backend = createWebBackend()
    const { ctx, restore } = installFakeCanvasContext()
    try {
      backend.clearNativeCache()
      backend.measureGraphemeWidths('Hi', { fontFamily: 'Helvetica Neue', fontSize: 16 })
      expect(ctx.font).toContain('"Helvetica Neue"')
    } finally {
      restore()
      backend.clearNativeCache()
    }
  })
})

describe('remeasureMerged without canvas', () => {
  test('falls back to estimated widths', () => {
    const backend = createWebBackend()
    const widths = backend.remeasureMerged(['Hello', 'World'], FONT)
    expect(widths).toHaveLength(2)
    expect(widths[0]).toBeGreaterThan(0)
    expect(widths[1]).toBeGreaterThan(0)
  })
})

describe('Intl.Segmenter availability', () => {
  test('word segmenter works', () => {
    const seg = new Intl.Segmenter(undefined, { granularity: 'word' })
    const results = Array.from(seg.segment('Hello World'))
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.segment).toBe('Hello')
  })

  test('grapheme segmenter works', () => {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    const results = Array.from(seg.segment('Hi'))
    expect(results).toHaveLength(2)
  })

  test('CJK word segmentation', () => {
    const seg = new Intl.Segmenter('zh', { granularity: 'word' })
    const results = Array.from(seg.segment('你好世界'))
    expect(results.length).toBeGreaterThan(0)
  })

  test('emoji grapheme segmentation', () => {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    const results = Array.from(seg.segment('👩‍🚀'))
    expect(results).toHaveLength(1)
  })
})
