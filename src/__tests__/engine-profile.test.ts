;(globalThis as unknown as Record<string, unknown>).__DEV__ = false

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

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { getEngineProfile, setEngineProfile, ENGINE_PROFILES } from '../engine-profile'

describe('getEngineProfile', () => {
  beforeEach(() => {
    setEngineProfile(null) // reset before each test
  })

  test('returns a profile with all required fields', () => {
    const profile = getEngineProfile()
    expect(typeof profile.lineFitEpsilon).toBe('number')
    expect(typeof profile.carryCJKAfterClosingQuote).toBe('boolean')
    expect(typeof profile.preferPrefixWidthsForBreakableRuns).toBe('boolean')
    expect(typeof profile.preferEarlySoftHyphenBreak).toBe('boolean')
  })

  test('returns ios profile on iOS platform', () => {
    const profile = getEngineProfile()
    expect(profile.lineFitEpsilon).toBe(0.01)
    expect(profile.carryCJKAfterClosingQuote).toBe(true)
  })
})

describe('setEngineProfile', () => {
  beforeEach(() => {
    setEngineProfile(null)
  })

  // beforeEach only cleans up *before* a test, so the last test in this block
  // used to leave its override installed for whatever test file bun ran next
  // (module state is shared across files). That made
  // integration.test.ts's 'engine profile switch to consistent mode' fail
  // depending on file order — which differs between macOS and the Linux CI
  // runner, so it only ever reproduced in CI.
  afterEach(() => {
    setEngineProfile(null)
  })

  test('overrides the default profile', () => {
    setEngineProfile(ENGINE_PROFILES.consistent)
    const profile = getEngineProfile()
    expect(profile.lineFitEpsilon).toBe(0.05)
    expect(profile.carryCJKAfterClosingQuote).toBe(false)
  })

  test('null resets to platform default', () => {
    setEngineProfile(ENGINE_PROFILES.consistent)
    expect(getEngineProfile().lineFitEpsilon).toBe(0.05)
    setEngineProfile(null)
    expect(getEngineProfile().lineFitEpsilon).toBe(0.01) // ios default
  })

  test('custom profile is accepted', () => {
    const custom: typeof ENGINE_PROFILES.ios = {
      lineFitEpsilon: 0.03,
      carryCJKAfterClosingQuote: true,
      preferPrefixWidthsForBreakableRuns: true,
      preferEarlySoftHyphenBreak: true,
    }
    setEngineProfile(custom)
    const profile = getEngineProfile()
    expect(profile.lineFitEpsilon).toBe(0.03)
    expect(profile.preferPrefixWidthsForBreakableRuns).toBe(true)
  })
})

describe('ENGINE_PROFILES', () => {
  test('ios profile exists', () => {
    expect(ENGINE_PROFILES.ios.lineFitEpsilon).toBe(0.01)
  })

  test('android profile exists', () => {
    // Negative by design: an exactly-full line does not fit in StaticLayout.
    // See the comment on ENGINE_PROFILES.android.
    expect(ENGINE_PROFILES.android.lineFitEpsilon).toBe(-0.01)
  })

  test('consistent profile has higher epsilon', () => {
    expect(ENGINE_PROFILES.consistent.lineFitEpsilon).toBeGreaterThan(ENGINE_PROFILES.ios.lineFitEpsilon)
    expect(ENGINE_PROFILES.consistent.lineFitEpsilon).toBeGreaterThan(ENGINE_PROFILES.android.lineFitEpsilon)
  })

  test('consistent profile disables CJK carry', () => {
    expect(ENGINE_PROFILES.consistent.carryCJKAfterClosingQuote).toBe(false)
  })

  test('web profile matches defaults', () => {
    expect(ENGINE_PROFILES.web.lineFitEpsilon).toBe(0.01)
  })
})
