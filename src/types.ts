// src/types.ts
// All shared types for expo-pretext.
// TextStyle uses RN conventions (object, not CSS string).
// Prepared types are opaque — consumers use them as handles.

export type TextStyle = {
  fontFamily: string
  fontSize: number
  lineHeight?: number
  fontWeight?: '400' | '500' | '600' | '700' | 'bold' | 'normal'
  fontStyle?: 'normal' | 'italic'
}

export type WhiteSpaceMode = 'normal' | 'pre-wrap'

export type PrepareOptions = {
  whiteSpace?: WhiteSpaceMode
  locale?: string
  accuracy?: 'fast' | 'exact'
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
