// src/cache.ts
// JS-side width cache — per-font LRU with a configurable per-font budget.
//
// Prior to v0.15 this was an unbounded Map<string, Map<string, number>>,
// which grew without limit in long-running sessions (chat apps, feeds).
// Each font key now owns its own LRU so common segments stay hot and
// stale ones get evicted when the budget is reached.

import { LRUCache } from './lru'

// Default per-font segment budget. ~320 KB per font at ~32 bytes/entry.
// Tune via setCacheBudget() if you use many fonts or very long corpora.
const DEFAULT_PER_FONT_BUDGET = 10_000

let perFontBudget = DEFAULT_PER_FONT_BUDGET
const widthCache = new Map<string, LRUCache<string, number>>()

function getFontCache(fontKey: string): LRUCache<string, number> {
  let cache = widthCache.get(fontKey)
  if (!cache) {
    cache = new LRUCache<string, number>(perFontBudget)
    widthCache.set(fontKey, cache)
  }
  return cache
}

export function getCachedWidth(
  fontKey: string,
  segment: string,
): number | undefined {
  return widthCache.get(fontKey)?.get(segment)
}

export function setCachedWidth(
  fontKey: string,
  segment: string,
  width: number,
): void {
  getFontCache(fontKey).set(segment, width)
}

export function cacheNativeResult(
  fontKey: string,
  segments: string[],
  widths: number[],
): void {
  const cache = getFontCache(fontKey)
  for (let i = 0; i < segments.length; i++) {
    cache.set(segments[i]!, widths[i]!)
  }
}

export function tryResolveAllFromCache(
  fontKey: string,
  segments: string[],
): number[] | null {
  const fontCache = widthCache.get(fontKey)
  if (!fontCache) return null

  const widths: number[] = new Array(segments.length)
  for (let i = 0; i < segments.length; i++) {
    const w = fontCache.get(segments[i]!)
    if (w === undefined) return null
    widths[i] = w
  }
  return widths
}

export function clearJSCache(): void {
  widthCache.clear()
}

/**
 * Set the per-font LRU budget for the JS width cache.
 *
 * Default is 10,000 entries per font (~320 KB). Increase if you use many
 * distinct segments per font; decrease if you need a tighter memory budget.
 *
 * Existing fonts shrink immediately if `n` is smaller than their current size.
 *
 * @param n  max entries per font (≥ 0)
 */
export function setCacheBudget(n: number): void {
  perFontBudget = Math.max(0, n | 0)
  for (const cache of widthCache.values()) {
    cache.setMaxSize(perFontBudget)
  }
}

/**
 * Introspect cache state — useful for memory-profiling long-running apps.
 */
export function getCacheStats(): {
  fonts: number
  totalEntries: number
  perFontBudget: number
  perFont: Array<{ fontKey: string; entries: number }>
} {
  let total = 0
  const perFont: Array<{ fontKey: string; entries: number }> = []
  for (const [fontKey, cache] of widthCache) {
    total += cache.size
    perFont.push({ fontKey, entries: cache.size })
  }
  return { fonts: widthCache.size, totalEntries: total, perFontBudget, perFont }
}
