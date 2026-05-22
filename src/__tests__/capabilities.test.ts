import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { PRETEXT_BEHAVIOR_FIXES } from '../capabilities'

// Snapshot of the keys this manifest currently advertises. The test asserts
// each key is present and `true`. It does NOT encode any rules about how the
// set is allowed to evolve over time — that is the maintainer's call. Adding
// or removing keys later requires editing this snapshot in the same commit.
const CURRENT_KEYS = [
  'nullableFontFamily',
  'webCanvasSystemFontStack',
  'webCanvasCssFontStack',
  'webClearNativeCacheResetsCanvas',
  'preferredDashBreaksInBreakableRuns',
  'noSpaceWordInternalSymbolChains',
] as const

describe('behavior-fix manifest', () => {
  test('manifest is frozen so consumers cannot mutate the shared object', () => {
    expect(Object.isFrozen(PRETEXT_BEHAVIOR_FIXES)).toBe(true)
  })

  test('manifest advertises each currently-shipped behavior fix', () => {
    for (const key of CURRENT_KEYS) {
      expect(key in PRETEXT_BEHAVIOR_FIXES).toBe(true)
      expect(PRETEXT_BEHAVIOR_FIXES[key]).toBe(true)
    }
  })

  test('manifest publishes via the package entrypoint', () => {
    const index = readFileSync(new URL('../index.ts', import.meta.url), 'utf8')
    expect(index).toContain(
      "export { PRETEXT_BEHAVIOR_FIXES } from './capabilities'",
    )
  })
})
