// src/types.ts
// All shared types for expo-pretext.
// TextStyle uses RN conventions (object, not CSS string).
// Prepared types are opaque — consumers use them as handles.

export type TextStyle = {
  /**
   * Font family name, or a fallback chain.
   *
   * - `'Inter'` — single name. Used as-is.
   * - `['Inter', 'System']` — chain. The first name that reports as
   *   loaded (via `isFontLoaded`) is picked; the rest are ignored.
   *
   * System fonts (`'System'`, `'system'`, `'sans-serif'`, `'serif'`,
   * `'monospace'`, and common built-ins like `'Helvetica'`,
   * `'Georgia'`, `'Menlo'`) are always reported as loaded.
   */
  fontFamily: string | string[]
  fontSize: number
  lineHeight?: number
  fontWeight?: '400' | '500' | '600' | '700' | 'bold' | 'normal'
  fontStyle?: 'normal' | 'italic'
}

export type WhiteSpaceMode = 'normal' | 'pre-wrap'

export type SegmentBreakKind =
  | 'text'
  | 'space'
  | 'preserved-space'
  | 'tab'
  | 'glue'
  | 'zero-width-break'
  | 'soft-hyphen'
  | 'hard-break'

export type PrepareOptions = {
  whiteSpace?: WhiteSpaceMode
  locale?: string
  /**
   * Width-measurement mode.
   *
   * - `'fast'` (default) — sum per-segment widths from the native segmenter.
   *   One native round-trip. Sub-pixel drift possible at inter-segment
   *   boundaries for fonts with heavy kerning; typically imperceptible.
   * - `'exact'` — re-measure merged chunks after analysis so adjacent-
   *   segment kerning is captured natively. One extra native round-trip.
   *   Subsequent calls on the same text hit the shared width cache and
   *   skip the extra call.
   */
  accuracy?: 'fast' | 'exact'
  customBreakRules?: (segment: string, index: number, kind: SegmentBreakKind) => SegmentBreakKind
}

export type LayoutResult = {
  height: number
  lineCount: number
}

export type LayoutCursor = {
  segmentIndex: number
  graphemeIndex: number
}

export type LayoutLine = {
  text: string
  width: number
  start: LayoutCursor
  end: LayoutCursor
}

export type LayoutLineRange = {
  width: number
  start: LayoutCursor
  end: LayoutCursor
}

export type LayoutWithLinesResult = LayoutResult & {
  lines: LayoutLine[]
}

// Opaque prepared handles
declare const preparedTextBrand: unique symbol
export type PreparedText = { readonly [preparedTextBrand]: true }

declare const preparedTextWithSegmentsBrand: unique symbol
export type PreparedTextWithSegments = {
  readonly [preparedTextWithSegmentsBrand]: true
}

// Inline flow types
export type InlineFlowItem = {
  text: string
  style: TextStyle
  atomic?: boolean
  extraWidth?: number
}

declare const preparedInlineFlowBrand: unique symbol
export type PreparedInlineFlow = {
  readonly [preparedInlineFlowBrand]: true
}

export type InlineFlowCursor = {
  itemIndex: number
  segmentIndex: number
  graphemeIndex: number
}

export type InlineFlowFragment = {
  itemIndex: number
  text: string
  gapBefore: number
  occupiedWidth: number
  start: LayoutCursor
  end: LayoutCursor
}

export type InlineFlowLine = {
  fragments: InlineFlowFragment[]
  width: number
  end: InlineFlowCursor
}

export type InkBounds = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export type InkSafePadding = {
  paddingLeft: number
  paddingRight: number
  paddingTop: number
  paddingBottom: number
}

export type InkSafeResult = {
  /** Padding to apply to the Text element */
  padding: InkSafePadding
  /** Total width including ink overshoot (advance + left pad + right pad) */
  inkWidth: number
  /** Advance width (standard cursor-movement width) */
  advance: number
  /** Raw ink bounds from native measurement */
  inkBounds: InkBounds
  /** True if any padding > 0 (text overshoots advance width) */
  isOvershooting: boolean
}

export type InkMeasurementDebug = {
  text: string
  source: string
  requestedFont: FontDescriptor
  resolvedFont: {
    fontName: string
    familyName: string
    pointSize: number
    ascender: number
    descender: number
    leading: number
    capHeight: number
    xHeight: number
    symbolicTraits: number
  }
  typographic: {
    advance: number
    ascent: number
    descent: number
    leading: number
  }
  rasterContext: {
    padding: number
    canvasWidth: number
    canvasHeight: number
    pixelWidth: number
    pixelHeight: number
    scale: number
    originX: number
    originY: number
    contextCreated: boolean
  }
  rasterBounds: InkBounds | null
  vectorBounds: InkBounds | null
  advanceFallbackBounds: InkBounds | null
  finalBounds: InkBounds
}

// Native module types (internal)
export type FontDescriptor = {
  fontFamily: string
  fontSize: number
  fontWeight?: string
  fontStyle?: string
}

export type NativeSegmentResult = {
  segments: string[]
  isWordLike: boolean[]
  widths: number[]
}
