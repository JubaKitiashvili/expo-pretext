// src/hyphenation.ts
// Liang-Knuth hyphenation — a pure utility independent of the layout engine.
//
// The algorithm finds "soft-hyphen" break positions inside a word by matching
// substrings against a pattern dictionary (TeX format). Each pattern carries
// digits encoding the relative strength of a break opportunity at each
// position; odd weights allow a break, even weights forbid it.
//
// We don't ship pattern data here — patterns are language-specific and
// typically 10–50 KB each. Bring your own via `compileHyphenationPatterns`,
// e.g. from the `hyphenation-patterns-en-us` npm package or any TeX-format
// source.
//
// Usage:
// ```ts
// const patterns = compileHyphenationPatterns([
//   'hy3ph', 'phen5ation', // ... thousands more
// ])
// hyphenate('hyphenation', patterns)  // → [2, 6]
// // Meaning: "hy-phen-ation"
// ```

/**
 * Compiled pattern dictionary ready for fast `hyphenate()` lookups.
 *
 * Treat as opaque — produced by `compileHyphenationPatterns`, consumed by
 * `hyphenate`.
 */
export type CompiledHyphenationPatterns = {
  /** Pattern letters → per-position level array (length = letters + 1). */
  readonly entries: Map<string, readonly number[]>
  /** Minimum letters required before a break (default 2). */
  readonly leftMin: number
  /** Minimum letters required after a break (default 2). */
  readonly rightMin: number
  /**
   * Optional exception dictionary for words that don't follow patterns.
   * Maps lowercased word → explicit break positions.
   */
  readonly exceptions: Map<string, readonly number[]>
}

export type CompileOptions = {
  /** Min letters before a break (default 2). English typography uses 2. */
  leftMin?: number
  /** Min letters after a break (default 2). English typography uses 3. */
  rightMin?: number
  /**
   * Exception words written with explicit hyphens, e.g. `'as-so-ciate'`.
   * Override pattern-based output for these exact lowercased words.
   */
  exceptions?: string[]
}

/**
 * Compile TeX-format hyphenation patterns into a fast lookup dictionary.
 *
 * Each raw pattern is a string of letters interspersed with digits, e.g.
 * `"hy3ph"` means: weight 3 between `y` and `p` (odd → break allowed).
 * Dots mark word boundaries, e.g. `".un2"` means: weight 2 right after a
 * leading `u-n-` prefix (even → forbid the break).
 *
 * @example
 * ```ts
 * const patterns = compileHyphenationPatterns(
 *   ['hy3ph', 'phen5ation', '.com5put'],
 *   { leftMin: 2, rightMin: 3, exceptions: ['as-so-ciate'] },
 * )
 * ```
 */
export function compileHyphenationPatterns(
  rawPatterns: string[],
  options: CompileOptions = {},
): CompiledHyphenationPatterns {
  const entries = new Map<string, readonly number[]>()
  for (const raw of rawPatterns) {
    const chars: string[] = []
    const levels: number[] = []
    let pending = 0
    for (let i = 0; i < raw.length; i++) {
      const c = raw.charCodeAt(i)
      if (c >= 48 && c <= 57) {
        pending = c - 48
      } else {
        chars.push(raw[i]!)
        levels.push(pending)
        pending = 0
      }
    }
    levels.push(pending)
    const key = chars.join('')
    entries.set(key, levels)
  }

  const exceptions = new Map<string, readonly number[]>()
  if (options.exceptions) {
    for (const raw of options.exceptions) {
      const word = raw.replace(/-/g, '').toLowerCase()
      const breaks: number[] = []
      let plain = 0
      for (let i = 0; i < raw.length; i++) {
        if (raw[i] === '-') breaks.push(plain)
        else plain++
      }
      exceptions.set(word, breaks)
    }
  }

  return {
    entries,
    leftMin: Math.max(1, options.leftMin ?? 2),
    rightMin: Math.max(1, options.rightMin ?? 2),
    exceptions,
  }
}

/**
 * Return the set of positions inside `word` where a soft-hyphen break is
 * allowed. Position `p` means "break between `word[p-1]` and `word[p]`",
 * i.e. the break splits the word into `word.slice(0, p)` + `word.slice(p)`.
 *
 * Preserves case in the output positions — only the lookup is lowercased.
 * Non-letter characters anchor to the surrounding pattern as-is.
 *
 * Returns an empty array when:
 * - the word is shorter than `leftMin + rightMin` letters, or
 * - no pattern matches (common for very short or very rare words).
 *
 * @example
 * ```ts
 * hyphenate('hyphenation', patterns)  // → [2, 6, 9]  (hy-phen-a-tion)
 * hyphenate('hi', patterns)            // → []         (too short)
 * ```
 */
export function hyphenate(
  word: string,
  patterns: CompiledHyphenationPatterns,
): number[] {
  if (word.length < patterns.leftMin + patterns.rightMin) return []

  // Exception lookup first — overrides pattern output entirely.
  const lower = word.toLowerCase()
  const exception = patterns.exceptions.get(lower)
  if (exception !== undefined) return filterByMins(exception, word.length, patterns)

  const padded = '.' + lower + '.'
  const n = padded.length
  const result: number[] = new Array(n + 1).fill(0)

  // For every substring, check if any pattern matches and apply max levels.
  // O(W^2) substrings × O(W) slice cost = O(W^3) per word. Fine for W ≤ ~30.
  for (let start = 0; start < n; start++) {
    for (let end = start + 1; end <= n; end++) {
      const key = padded.slice(start, end)
      const levels = patterns.entries.get(key)
      if (!levels) continue
      for (let i = 0; i < levels.length; i++) {
        const lvl = levels[i]!
        if (lvl > result[start + i]!) result[start + i] = lvl
      }
    }
  }

  // Collect break positions inside the word. Position p (1 ≤ p ≤ len-1)
  // means "break between word[p-1] and word[p]". In the padded string, the
  // level between padded[p] and padded[p+1] lives at result[p+1].
  const out: number[] = []
  const min = patterns.leftMin
  const max = word.length - patterns.rightMin
  for (let p = min; p <= max; p++) {
    if ((result[p + 1]! & 1) === 1) out.push(p)
  }
  return out
}

function filterByMins(
  breaks: readonly number[],
  wordLength: number,
  patterns: CompiledHyphenationPatterns,
): number[] {
  const min = patterns.leftMin
  const max = wordLength - patterns.rightMin
  const out: number[] = []
  for (const p of breaks) {
    if (p >= min && p <= max) out.push(p)
  }
  return out
}

/**
 * Convenience: insert `sep` (default U+00AD SOFT HYPHEN) at every allowed
 * break position. Handy for handing a string to any renderer that honors
 * soft hyphens (e.g., web browsers, Android `<Text>` with hyphenationFrequency).
 */
export function hyphenateAndJoin(
  word: string,
  patterns: CompiledHyphenationPatterns,
  separator = '\u00AD',
): string {
  const positions = hyphenate(word, patterns)
  if (positions.length === 0) return word
  let out = ''
  let last = 0
  for (const p of positions) {
    out += word.slice(last, p) + separator
    last = p
  }
  out += word.slice(last)
  return out
}
