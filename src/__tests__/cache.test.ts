import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  getCachedWidth,
  setCachedWidth,
  cacheNativeResult,
  tryResolveAllFromCache,
  clearJSCache,
  setCacheBudget,
  getCacheStats,
} from '../cache'

describe('JS-side width cache', () => {
  beforeEach(() => {
    clearJSCache()
  })

  test('set and get single width', () => {
    setCachedWidth('Inter_16_400_normal', 'Hello', 42.5)
    expect(getCachedWidth('Inter_16_400_normal', 'Hello')).toBe(42.5)
  })

  test('returns undefined for cache miss', () => {
    expect(getCachedWidth('Inter_16_400_normal', 'missing')).toBeUndefined()
  })

  test('returns undefined for unknown font key', () => {
    setCachedWidth('Inter_16_400_normal', 'Hello', 42.5)
    expect(getCachedWidth('Arial_16_400_normal', 'Hello')).toBeUndefined()
  })

  test('cacheNativeResult stores all segments', () => {
    cacheNativeResult('Inter_16_400_normal', ['Hello', ' ', 'world'], [42.5, 4.2, 38.1])
    expect(getCachedWidth('Inter_16_400_normal', 'Hello')).toBe(42.5)
    expect(getCachedWidth('Inter_16_400_normal', ' ')).toBe(4.2)
    expect(getCachedWidth('Inter_16_400_normal', 'world')).toBe(38.1)
  })

  test('tryResolveAllFromCache returns widths when all cached', () => {
    cacheNativeResult('Inter_16_400_normal', ['Hello', ' ', 'world'], [42.5, 4.2, 38.1])
    const result = tryResolveAllFromCache('Inter_16_400_normal', ['Hello', ' ', 'world'])
    expect(result).toEqual([42.5, 4.2, 38.1])
  })

  test('tryResolveAllFromCache returns null on partial miss', () => {
    cacheNativeResult('Inter_16_400_normal', ['Hello', ' '], [42.5, 4.2])
    const result = tryResolveAllFromCache('Inter_16_400_normal', ['Hello', ' ', 'world'])
    expect(result).toBeNull()
  })

  test('tryResolveAllFromCache returns null for unknown font', () => {
    const result = tryResolveAllFromCache('Unknown_16_400_normal', ['Hello'])
    expect(result).toBeNull()
  })

  test('clearJSCache clears everything', () => {
    cacheNativeResult('Inter_16_400_normal', ['Hello'], [42.5])
    clearJSCache()
    expect(getCachedWidth('Inter_16_400_normal', 'Hello')).toBeUndefined()
  })

  test('multiple font keys are independent', () => {
    setCachedWidth('Inter_16_400_normal', 'Hello', 42.5)
    setCachedWidth('Inter_16_700_normal', 'Hello', 44.0)
    expect(getCachedWidth('Inter_16_400_normal', 'Hello')).toBe(42.5)
    expect(getCachedWidth('Inter_16_700_normal', 'Hello')).toBe(44.0)
  })

  test('overwriting a cached value', () => {
    setCachedWidth('Inter_16_400_normal', 'Hello', 42.5)
    setCachedWidth('Inter_16_400_normal', 'Hello', 43.0)
    expect(getCachedWidth('Inter_16_400_normal', 'Hello')).toBe(43.0)
  })
})

describe('JS-side width cache — LRU eviction', () => {
  beforeEach(() => {
    clearJSCache()
    setCacheBudget(3)
  })

  afterEach(() => {
    setCacheBudget(10_000) // restore default
  })

  test('evicts oldest segment when per-font budget is exceeded', () => {
    const font = 'Inter_16_400_normal'
    setCachedWidth(font, 'alpha', 1)
    setCachedWidth(font, 'beta', 2)
    setCachedWidth(font, 'gamma', 3)
    setCachedWidth(font, 'delta', 4) // evicts 'alpha'
    expect(getCachedWidth(font, 'alpha')).toBeUndefined()
    expect(getCachedWidth(font, 'beta')).toBe(2)
    expect(getCachedWidth(font, 'gamma')).toBe(3)
    expect(getCachedWidth(font, 'delta')).toBe(4)
  })

  test('recently-read segment is protected from eviction', () => {
    const font = 'Inter_16_400_normal'
    setCachedWidth(font, 'alpha', 1)
    setCachedWidth(font, 'beta', 2)
    setCachedWidth(font, 'gamma', 3)
    getCachedWidth(font, 'alpha') // bump 'alpha' to most-recent
    setCachedWidth(font, 'delta', 4) // evicts 'beta' (now oldest)
    expect(getCachedWidth(font, 'alpha')).toBe(1)
    expect(getCachedWidth(font, 'beta')).toBeUndefined()
  })

  test('budget is per-font, not global', () => {
    setCachedWidth('A', 'a1', 1)
    setCachedWidth('A', 'a2', 2)
    setCachedWidth('A', 'a3', 3)
    setCachedWidth('B', 'b1', 10)
    setCachedWidth('B', 'b2', 20)
    setCachedWidth('B', 'b3', 30)
    // Neither font has exceeded its own budget yet.
    expect(getCachedWidth('A', 'a1')).toBe(1)
    expect(getCachedWidth('B', 'b1')).toBe(10)
  })

  test('setCacheBudget(smaller) shrinks existing fonts immediately', () => {
    const font = 'Inter_16_400_normal'
    setCacheBudget(5)
    for (const seg of ['a', 'b', 'c', 'd', 'e']) setCachedWidth(font, seg, 1)
    expect(getCacheStats().totalEntries).toBe(5)
    setCacheBudget(2)
    const stats = getCacheStats()
    expect(stats.totalEntries).toBe(2)
    expect(stats.perFontBudget).toBe(2)
    // oldest two evicted
    expect(getCachedWidth(font, 'a')).toBeUndefined()
    expect(getCachedWidth(font, 'd')).toBe(1)
    expect(getCachedWidth(font, 'e')).toBe(1)
  })

  test('getCacheStats reports per-font entry counts', () => {
    setCacheBudget(100)
    setCachedWidth('A', 'x', 1)
    setCachedWidth('A', 'y', 2)
    setCachedWidth('B', 'z', 3)
    const stats = getCacheStats()
    expect(stats.fonts).toBe(2)
    expect(stats.totalEntries).toBe(3)
    const a = stats.perFont.find((p) => p.fontKey === 'A')
    const b = stats.perFont.find((p) => p.fontKey === 'B')
    expect(a?.entries).toBe(2)
    expect(b?.entries).toBe(1)
  })

  test('cacheNativeResult respects budget', () => {
    const font = 'Inter_16_400_normal'
    cacheNativeResult(font, ['a', 'b', 'c', 'd', 'e'], [1, 2, 3, 4, 5])
    expect(getCacheStats().totalEntries).toBe(3) // budget is 3
    expect(getCachedWidth(font, 'e')).toBe(5) // newest kept
    expect(getCachedWidth(font, 'a')).toBeUndefined() // oldest evicted
  })
})
