import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'

// Locks the public surface that re-exports the layout module's public symbols
// from the package entry. Each name below is implemented as `export function`
// or `export type` in src/layout.ts but was previously absent from the
// './layout' re-export in src/index.ts, leaving the symbol unreachable through
// the published '.' entry of the package.
const VALUE_REEXPORTS = [
  'layout',
  'layoutWithLines',
  'layoutNextLine',
  'layoutNextLineRange',
  'walkLineRanges',
  'measureNaturalWidth',
  'measureLineGeometry',
  'getLastLineWidth',
  'materializeLineRange',
]

const TYPE_REEXPORTS = ['LineGeometry']

describe('public surface re-exports from ./layout', () => {
  test('index.ts re-exports every public value symbol from ./layout', () => {
    const index = readFileSync(new URL('../index.ts', import.meta.url), 'utf8')
    // Match both single-line and multi-line export-from forms.
    const valueBlock = index.match(
      /export\s*\{([^}]+)\}\s*from\s*['"]\.\/layout['"]/,
    )
    expect(valueBlock).not.toBeNull()
    const names = valueBlock![1]
    for (const name of VALUE_REEXPORTS) {
      expect(names).toContain(name)
    }
  })

  test('index.ts re-exports every public type symbol from ./layout', () => {
    const index = readFileSync(new URL('../index.ts', import.meta.url), 'utf8')
    for (const name of TYPE_REEXPORTS) {
      expect(index).toMatch(
        new RegExp(
          `export\\s+type\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]\\./layout['"]`,
        ),
      )
    }
  })

  test('layout.ts defines each re-exported value as `export function`', () => {
    const layout = readFileSync(new URL('../layout.ts', import.meta.url), 'utf8')
    for (const name of VALUE_REEXPORTS) {
      expect(layout).toMatch(new RegExp(`^export\\s+function\\s+${name}\\b`, 'm'))
    }
  })

  test('layout.ts defines each re-exported type as `export type`', () => {
    const layout = readFileSync(new URL('../layout.ts', import.meta.url), 'utf8')
    for (const name of TYPE_REEXPORTS) {
      expect(layout).toMatch(new RegExp(`^export\\s+type\\s+${name}\\b`, 'm'))
    }
  })
})
