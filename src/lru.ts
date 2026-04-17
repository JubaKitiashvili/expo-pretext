// src/lru.ts
// Simple LRU cache built on top of Map's insertion-order guarantee.
// - get() bumps the entry to most-recent (O(1) via delete+set).
// - set() evicts the oldest entry when size exceeds the budget.
// - setMaxSize() reshrinks immediately if the new budget is smaller.

export class LRUCache<K, V> {
  private map = new Map<K, V>()

  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    const v = this.map.get(key)
    if (v !== undefined) {
      // Re-insert to bump recency. This is O(1) for Map.
      this.map.delete(key)
      this.map.set(key, v)
    }
    return v
  }

  has(key: K): boolean {
    return this.map.has(key)
  }

  set(key: K, value: V): void {
    if (this.maxSize <= 0) return
    if (this.map.has(key)) {
      this.map.delete(key)
    } else if (this.map.size >= this.maxSize) {
      // Evict oldest — first key in insertion order.
      const oldestIter = this.map.keys().next()
      if (!oldestIter.done) this.map.delete(oldestIter.value)
    }
    this.map.set(key, value)
  }

  delete(key: K): boolean {
    return this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }

  get size(): number {
    return this.map.size
  }

  setMaxSize(n: number): void {
    this.maxSize = n
    while (this.map.size > n) {
      const oldestIter = this.map.keys().next()
      if (oldestIter.done) break
      this.map.delete(oldestIter.value)
    }
  }
}
