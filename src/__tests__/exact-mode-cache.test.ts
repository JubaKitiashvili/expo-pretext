// exact-mode-cache.test.ts
// Verify that exact-mode re-measured widths are fed back into the shared
// width cache so repeat exact-mode prepare() calls on the same text skip
// the extra native round-trip.

;(globalThis as unknown as Record<string, unknown>).__DEV__ = false

import { describe, test, expect, beforeEach } from 'bun:test'
import {
  cacheNativeResult,
  tryResolveAllFromCache,
  clearJSCache,
  getCacheStats,
} from '../cache'

describe('exact-mode merged width cache integration', () => {
  beforeEach(() => {
    clearJSCache()
  })

  test('merged chunks can be cached and resolved by the same cache used for segments', () => {
    const fontKey = 'System_16_400_normal'
    // Simulate what exact mode does: feed the merged chunks + their widths
    // back into the shared cache after the native remeasureMerged call.
    const mergedChunks = ['Hello', ' ', 'world']
    const mergedWidths = [42.5, 4.2, 38.1]
    cacheNativeResult(fontKey, mergedChunks, mergedWidths)

    // A second exact-mode call on the same text sees the same merged chunks
    // after analysis, and the cache resolves them in one shot.
    const resolved = tryResolveAllFromCache(fontKey, mergedChunks)
    expect(resolved).toEqual(mergedWidths)
  })

  test('merged chunks are independent of per-word segment widths in the cache', () => {
    const fontKey = 'System_16_400_normal'
    // First, fast-mode caches the per-word widths.
    cacheNativeResult(fontKey, ['Hello', ' ', 'world'], [42.5, 4.2, 38.1])

    // Then exact mode produces a different merged grouping — e.g. analysis
    // joined the trailing-space segment with the next word.
    cacheNativeResult(fontKey, ['Hello ', 'world'], [46.8, 38.1])

    expect(tryResolveAllFromCache(fontKey, ['Hello', ' ', 'world'])).toEqual([42.5, 4.2, 38.1])
    expect(tryResolveAllFromCache(fontKey, ['Hello ', 'world'])).toEqual([46.8, 38.1])
  })

  test('mixed fast + exact segments share the same font cache', () => {
    const fontKey = 'System_16_400_normal'
    cacheNativeResult(fontKey, ['Hello', ' ', 'world'], [42.5, 4.2, 38.1])
    cacheNativeResult(fontKey, ['Hello world'], [85.4])

    expect(getCacheStats().totalEntries).toBe(4)
    expect(tryResolveAllFromCache(fontKey, ['Hello world'])).toEqual([85.4])
  })

  test('cache miss on merged chunks signals the native round-trip is required', () => {
    const fontKey = 'System_16_400_normal'
    // First exact-mode call: cache has nothing for these merged chunks yet.
    const resolved = tryResolveAllFromCache(fontKey, ['Hello world', 'goodbye'])
    expect(resolved).toBeNull()
  })

  test('partially-cached merged chunks return null (all-or-nothing)', () => {
    const fontKey = 'System_16_400_normal'
    cacheNativeResult(fontKey, ['Hello world'], [85.4])
    // 'goodbye' is not cached → whole lookup fails.
    expect(tryResolveAllFromCache(fontKey, ['Hello world', 'goodbye'])).toBeNull()
  })
})
