;(globalThis as unknown as Record<string, unknown>).__DEV__ = false

import { describe, test, expect } from 'bun:test'
import { LRUCache } from '../lru'

describe('LRUCache', () => {
  test('stores and retrieves values', () => {
    const c = new LRUCache<string, number>(3)
    c.set('a', 1)
    c.set('b', 2)
    expect(c.get('a')).toBe(1)
    expect(c.get('b')).toBe(2)
    expect(c.size).toBe(2)
  })

  test('returns undefined for missing keys', () => {
    const c = new LRUCache<string, number>(3)
    expect(c.get('missing')).toBeUndefined()
  })

  test('evicts the oldest entry when budget exceeded', () => {
    const c = new LRUCache<string, number>(3)
    c.set('a', 1)
    c.set('b', 2)
    c.set('c', 3)
    c.set('d', 4) // should evict 'a'
    expect(c.has('a')).toBe(false)
    expect(c.has('b')).toBe(true)
    expect(c.has('c')).toBe(true)
    expect(c.has('d')).toBe(true)
    expect(c.size).toBe(3)
  })

  test('get() bumps recency so eviction skips the hit key', () => {
    const c = new LRUCache<string, number>(3)
    c.set('a', 1)
    c.set('b', 2)
    c.set('c', 3)
    c.get('a') // bump 'a'
    c.set('d', 4) // should evict 'b' (now oldest), not 'a'
    expect(c.has('a')).toBe(true)
    expect(c.has('b')).toBe(false)
  })

  test('set() on existing key updates value without eviction', () => {
    const c = new LRUCache<string, number>(3)
    c.set('a', 1)
    c.set('b', 2)
    c.set('a', 10)
    expect(c.get('a')).toBe(10)
    expect(c.size).toBe(2)
  })

  test('set() on existing key bumps recency', () => {
    const c = new LRUCache<string, number>(3)
    c.set('a', 1)
    c.set('b', 2)
    c.set('c', 3)
    c.set('a', 100) // re-set 'a' bumps it
    c.set('d', 4) // should evict 'b' (oldest), not 'a'
    expect(c.has('a')).toBe(true)
    expect(c.has('b')).toBe(false)
  })

  test('delete() removes an entry', () => {
    const c = new LRUCache<string, number>(3)
    c.set('a', 1)
    expect(c.delete('a')).toBe(true)
    expect(c.has('a')).toBe(false)
    expect(c.delete('a')).toBe(false)
  })

  test('clear() empties the cache', () => {
    const c = new LRUCache<string, number>(3)
    c.set('a', 1)
    c.set('b', 2)
    c.clear()
    expect(c.size).toBe(0)
  })

  test('setMaxSize(smaller) evicts from the oldest end immediately', () => {
    const c = new LRUCache<string, number>(5)
    for (const k of ['a', 'b', 'c', 'd', 'e']) c.set(k, 1)
    c.setMaxSize(2)
    expect(c.size).toBe(2)
    expect(c.has('a')).toBe(false)
    expect(c.has('b')).toBe(false)
    expect(c.has('c')).toBe(false)
    expect(c.has('d')).toBe(true)
    expect(c.has('e')).toBe(true)
  })

  test('setMaxSize(larger) does not touch existing entries', () => {
    const c = new LRUCache<string, number>(3)
    c.set('a', 1); c.set('b', 2); c.set('c', 3)
    c.setMaxSize(10)
    expect(c.size).toBe(3)
    expect(c.has('a')).toBe(true)
  })

  test('maxSize 0 keeps cache always empty', () => {
    const c = new LRUCache<string, number>(0)
    c.set('a', 1)
    expect(c.size).toBe(0)
    expect(c.has('a')).toBe(false)
  })
})
