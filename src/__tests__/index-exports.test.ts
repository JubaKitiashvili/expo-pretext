// The package entry must expose everything layout.ts marks public.
//
// layoutNextLineRange, measureLineGeometry, materializeLineRange,
// LineGeometry and LayoutLinesResult were all `export`ed from src/layout.ts
// but absent from the './layout' re-export in src/index.ts, so they were
// unreachable through the published '.' entry. Reported by @ahundt in #6.
//
// These assertions import through the entry point rather than reading its
// source, so reformatting the export list cannot break them, and a symbol
// that is re-exported but broken still fails.

import { describe, test, expect } from 'bun:test'
import * as pretext from '../index'
import type { LineGeometry, LayoutLinesResult } from '../index'

const LAYOUT_FUNCTIONS = [
  'layout',
  'layoutWithLines',
  'layoutNextLine',
  'layoutNextLineRange',
  'walkLineRanges',
  'measureNaturalWidth',
  'measureLineGeometry',
  'getLastLineWidth',
  'materializeLineRange',
  'clearCache',
  'setLocale',
] as const

describe('package entry — ./layout re-exports', () => {
  for (const name of LAYOUT_FUNCTIONS) {
    test(`${name} is reachable from the package entry`, () => {
      expect(typeof (pretext as unknown as Record<string, unknown>)[name]).toBe('function')
    })
  }

  test('the layout types are nameable through the entry', () => {
    // Compile-time coverage: tsc --noEmit fails if either type stops being
    // exported from './index'.
    const geometry: LineGeometry = {} as LineGeometry
    const lines: LayoutLinesResult = {} as LayoutLinesResult
    expect(geometry).toBeDefined()
    expect(lines).toBeDefined()
  })
})
