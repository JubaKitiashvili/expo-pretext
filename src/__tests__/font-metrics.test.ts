globalThis.__DEV__ = false

import { mock } from 'bun:test'

mock.module('react-native', () => ({
  Platform: { OS: 'ios', select: (obj: Record<string, unknown>) => obj.ios ?? obj.default },
  PixelRatio: { getFontScale: () => 1.0 },
  AccessibilityInfo: { addEventListener: () => ({ remove: () => {} }) },
  Dimensions: { addEventListener: () => ({ remove: () => {} }) },
  NativeModules: {},
  NativeEventEmitter: class {},
}))

mock.module('expo-modules-core', () => ({
  NativeModule: class {},
  requireNativeModule: () => null,
}))

import { describe, test, expect } from 'bun:test'
import { getFontMetrics } from '../font-utils'
import type { TextStyle } from '../types'

const STYLE: TextStyle = { fontFamily: 'System', fontSize: 16, lineHeight: 24 }

describe('getFontMetrics', () => {
  test('returns all required fields', () => {
    const metrics = getFontMetrics(STYLE)
    expect(typeof metrics.ascender).toBe('number')
    expect(typeof metrics.descender).toBe('number')
    expect(typeof metrics.xHeight).toBe('number')
    expect(typeof metrics.capHeight).toBe('number')
    expect(typeof metrics.lineGap).toBe('number')
  })

  test('ascender is positive', () => {
    const metrics = getFontMetrics(STYLE)
    expect(metrics.ascender).toBeGreaterThan(0)
  })

  test('descender is negative', () => {
    const metrics = getFontMetrics(STYLE)
    expect(metrics.descender).toBeLessThan(0)
  })

  test('xHeight is less than capHeight', () => {
    const metrics = getFontMetrics(STYLE)
    expect(metrics.xHeight).toBeLessThan(metrics.capHeight)
  })

  test('capHeight is less than ascender', () => {
    const metrics = getFontMetrics(STYLE)
    expect(metrics.capHeight).toBeLessThan(metrics.ascender)
  })

  test('metrics scale with fontSize', () => {
    const small = getFontMetrics({ ...STYLE, fontSize: 12 })
    const large = getFontMetrics({ ...STYLE, fontSize: 24 })
    expect(large.ascender).toBeGreaterThan(small.ascender)
    expect(large.capHeight).toBeGreaterThan(small.capHeight)
    expect(large.xHeight).toBeGreaterThan(small.xHeight)
  })

  test('lineGap is non-negative', () => {
    const metrics = getFontMetrics(STYLE)
    expect(metrics.lineGap).toBeGreaterThanOrEqual(0)
  })

  test('different fonts may give different metrics', () => {
    const system = getFontMetrics({ fontFamily: 'System', fontSize: 16 })
    const mono = getFontMetrics({ fontFamily: 'Menlo', fontSize: 16 })
    // Both should have valid metrics (actual values may be same in fallback mode)
    expect(system.ascender).toBeGreaterThan(0)
    expect(mono.ascender).toBeGreaterThan(0)
  })
})
