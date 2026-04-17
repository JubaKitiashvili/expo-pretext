;(globalThis as unknown as Record<string, unknown>).__DEV__ = false

import { describe, test, expect } from 'bun:test'
import { verifyFontsLoaded } from '../verify-font'

describe('verifyFontsLoaded', () => {
  test('returns null in JS-only environments (no native module)', () => {
    // setup-mocks.ts installs a null native module for the test env.
    const result = verifyFontsLoaded({ fontFamily: 'Inter', fontSize: 16 })
    expect(result).toBeNull()
  })

  test('accepts a custom reference string and tolerance', () => {
    expect(() =>
      verifyFontsLoaded(
        { fontFamily: 'Inter', fontSize: 16 },
        { reference: 'Hello', widthTolerance: 1.0 },
      ),
    ).not.toThrow()
  })

  test('accepts a fontFamily chain', () => {
    expect(() =>
      verifyFontsLoaded({ fontFamily: ['Inter', 'System'], fontSize: 16 }),
    ).not.toThrow()
  })
})
