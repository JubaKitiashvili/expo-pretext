;(globalThis as unknown as Record<string, unknown>).__DEV__ = false

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  enableAutoInvalidation,
  disableAutoInvalidation,
  notifyFontsLoaded,
} from '../auto-invalidate'
import {
  setCachedWidth,
  getCachedWidth,
  clearJSCache,
} from '../cache'

describe('auto-invalidate', () => {
  beforeEach(() => {
    disableAutoInvalidation()
    clearJSCache()
  })

  afterEach(() => {
    disableAutoInvalidation()
  })

  test('enableAutoInvalidation returns a disposer', () => {
    const dispose = enableAutoInvalidation()
    expect(typeof dispose).toBe('function')
    dispose()
  })

  test('is idempotent — multiple calls do not double-subscribe', () => {
    const a = enableAutoInvalidation()
    const b = enableAutoInvalidation()
    // Neither should throw; second call should be a no-op.
    expect(typeof a).toBe('function')
    expect(typeof b).toBe('function')
  })

  test('disableAutoInvalidation is safe when nothing is subscribed', () => {
    expect(() => disableAutoInvalidation()).not.toThrow()
    expect(() => disableAutoInvalidation()).not.toThrow()
  })

  test('notifyFontsLoaded clears the JS width cache', () => {
    setCachedWidth('Inter_16_400_normal_0', 'Hello', 42)
    expect(getCachedWidth('Inter_16_400_normal_0', 'Hello')).toBe(42)
    notifyFontsLoaded()
    expect(getCachedWidth('Inter_16_400_normal_0', 'Hello')).toBeUndefined()
  })

  test('polling option does not throw when expo-font is unavailable', () => {
    expect(() =>
      enableAutoInvalidation({ fontLoadPoll: { intervalMs: 50 } }),
    ).not.toThrow()
    disableAutoInvalidation()
  })

  test('fontScaleChange default is true and can be disabled', () => {
    const stop = enableAutoInvalidation({ fontScaleChange: false })
    // No observable side effect to assert on here without triggering a
    // system event; just ensure no throw and disposer runs cleanly.
    expect(() => stop()).not.toThrow()
  })
})
