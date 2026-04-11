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

mock.module('react-native-reanimated', () => ({
  useSharedValue: (v: number) => ({ value: v }),
  withTiming: (v: number) => v,
  withSpring: (v: number) => v,
}))

import { describe, test, expect } from 'bun:test'
// Import from individual modules to avoid pulling in react-native-reanimated
// (which is an optional peer dep and not available in test env)
import { prepare, prepareWithSegments } from '../prepare'
import { layout, layoutWithLines, clearCache } from '../layout'
import { buildTypewriterFrames } from '../typewriter'
import { measureCodeBlockHeight } from '../text-utils'
import { buildTextMorph } from '../morphing'
import { computeZoomLayout } from '../zoom'
import { getEngineProfile, setEngineProfile, ENGINE_PROFILES } from '../engine-profile'
import { getFontScale, clearAllCaches } from '../accessibility'
import { getFontMetrics } from '../font-utils'
import { compareDebugMeasurement } from '../debug'
import { buildHeightSnapshot, compareHeightSnapshots } from '../snapshot'
import { prepareWithBudget, PrepareBudgetTracker } from '../perf-budget'

const STYLE = { fontFamily: 'System', fontSize: 16, lineHeight: 24 }
const TEXT = 'The quick brown fox jumps over the lazy dog near the river on a sunny day'

describe('v0.7.x integration — all APIs work together', () => {
  test('core prepare + layout', () => {
    const prepared = prepare(TEXT, STYLE)
    const result = layout(prepared, 200)
    expect(result.lineCount).toBeGreaterThan(0)
    expect(result.height).toBe(result.lineCount * 24)
  })

  test('typewriter frames from layout lines', () => {
    const prepared = prepareWithSegments(TEXT, STYLE)
    const { lines } = layoutWithLines(prepared, 200)
    const frames = buildTypewriterFrames(lines, TEXT, 24)
    expect(frames.length).toBe(TEXT.length)
    expect(frames[frames.length - 1]!.isComplete).toBe(true)
  })

  test('code block height', () => {
    const code = 'function hello() {\n  console.log("world")\n}'
    const result = measureCodeBlockHeight(code, { fontFamily: 'Menlo', fontSize: 14, lineHeight: 20 }, 300)
    expect(result.lineCount).toBeGreaterThan(0)
    expect(result.height).toBe(result.lineCount * 20)
  })

  test('text morphing between states', () => {
    const fromLines = layoutWithLines(prepareWithSegments('Thinking...', STYLE), 200).lines
    const toLines = layoutWithLines(prepareWithSegments(TEXT, STYLE), 200).lines
    const morph = buildTextMorph(fromLines, toLines, 24)
    expect(morph.toLineCount).toBeGreaterThan(morph.fromLineCount)
    expect(morph.heightAt(0)).toBe(morph.fromHeight)
    expect(morph.heightAt(1)).toBe(morph.toHeight)
    expect(morph.heightAt(0.5)).toBe((morph.fromHeight + morph.toHeight) / 2)
  })

  test('zoom layout at different scales', () => {
    const z1 = computeZoomLayout(TEXT, STYLE, 200, 1.0)
    const z2 = computeZoomLayout(TEXT, STYLE, 200, 2.0)
    expect(z2.fontSize).toBe(32)
    expect(z2.height).toBeGreaterThan(z1.height)
  })

  test('engine profile switch to consistent mode', () => {
    const original = getEngineProfile()
    setEngineProfile(ENGINE_PROFILES.consistent)
    expect(getEngineProfile().lineFitEpsilon).toBe(0.05)
    setEngineProfile(null)
    expect(getEngineProfile().lineFitEpsilon).toBe(original.lineFitEpsilon)
  })

  test('accessibility — getFontScale', () => {
    expect(getFontScale()).toBe(1.0)
  })

  test('clearAllCaches does not throw', () => {
    // Prepare some data to cache
    prepare(TEXT, STYLE)
    layout(prepare(TEXT, STYLE), 200)
    // Clear everything
    expect(() => clearAllCaches()).not.toThrow()
    // Still works after clear
    const result = layout(prepare(TEXT, STYLE), 200)
    expect(result.lineCount).toBeGreaterThan(0)
  })

  test('full pipeline: prepare → typewriter → morph → zoom', () => {
    // Simulate AI chat flow:
    // 1. Show "Thinking..." with typewriter
    const thinkingPrep = prepareWithSegments('Thinking...', STYLE)
    const thinkingLayout = layoutWithLines(thinkingPrep, 200)
    const thinkingFrames = buildTypewriterFrames(thinkingLayout.lines, 'Thinking...', 24)
    expect(thinkingFrames.length).toBe('Thinking...'.length) // 11

    // 2. Morph from thinking to response
    const responsePrep = prepareWithSegments(TEXT, STYLE)
    const responseLayout = layoutWithLines(responsePrep, 200)
    const morph = buildTextMorph(thinkingLayout.lines, responseLayout.lines, 24)
    expect(morph.heightAt(0.5)).toBeGreaterThan(0)

    // 3. User pinch-zooms the response
    const zoomed = computeZoomLayout(TEXT, STYLE, 200, 1.5)
    expect(zoomed.fontSize).toBe(24)
    expect(zoomed.height).toBeGreaterThan(responseLayout.height)
  })

  test('font metrics', () => {
    const metrics = getFontMetrics(STYLE)
    expect(metrics.ascender).toBeGreaterThan(0)
    expect(metrics.descender).toBeLessThan(0)
    expect(metrics.xHeight).toBeGreaterThan(0)
    expect(metrics.capHeight).toBeGreaterThan(metrics.xHeight)
  })

  test('debug measurement comparison', () => {
    const prepared = prepare(TEXT, STYLE)
    const predicted = layout(prepared, 200).height
    const exact = compareDebugMeasurement(predicted, predicted)
    expect(exact.accuracy).toBe('exact')
    const wrong = compareDebugMeasurement(predicted, predicted * 1.5)
    expect(wrong.accuracy).toBe('wrong')
  })

  test('snapshot build + compare', () => {
    const texts = ['Hello', 'World', TEXT]
    const a = buildHeightSnapshot(texts, STYLE, 200)
    const b = buildHeightSnapshot(texts, STYLE, 200)
    const cmp = compareHeightSnapshots(a, b)
    expect(cmp.match).toBe(true)
    expect(a.entries.length).toBe(3)
  })

  test('performance budget', () => {
    const result = prepareWithBudget(TEXT, STYLE, 100)
    expect(result.prepared).toBeDefined()
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(typeof result.budgetExceeded).toBe('boolean')

    const tracker = new PrepareBudgetTracker()
    tracker.record(result.elapsedMs)
    expect(tracker.sampleCount).toBe(1)
    expect(tracker.averageMs()).toBe(result.elapsedMs)
  })
})
