// src/index.ts
// Public API for expo-pretext.
// Simple API (hooks) + Power API (Pretext 1:1) + Utilities.

// --- Types ---
export type {
  TextStyle,
  SegmentBreakKind,
  PrepareOptions,
  PreparedText,
  PreparedTextWithSegments,
  LayoutResult,
  LayoutLine,
  LayoutLineRange,
  LayoutCursor,
  LayoutWithLinesResult,
  InlineFlowItem,
  PreparedInlineFlow,
  InlineFlowCursor,
  InlineFlowFragment,
  InlineFlowLine,
} from './types'

// --- Simple API ---
export { useTextHeight } from './hooks/useTextHeight'
export { usePreparedText } from './hooks/usePreparedText'
export { useFlashListHeights } from './hooks/useFlashListHeights'
export { useStreamingLayout } from './hooks/useStreamingLayout'
export { useMultiStreamLayout } from './hooks/useMultiStreamLayout'
export { measureHeights, measureTokenWidth } from './prepare'

// --- Core API ---
export { prepare, prepareWithSegments } from './prepare'
export { layout, layoutWithLines, layoutNextLine, walkLineRanges, measureNaturalWidth, getLastLineWidth } from './layout'

// --- Rich Inline (formerly inline-flow) ---
export { prepareInlineFlow, walkInlineFlowLines, measureInlineFlow } from './rich-inline'

// --- Obstacle Layout ---
export {
  carveTextLineSlots,
  circleIntervalForBand,
  rectIntervalForBand,
  layoutColumn,
} from './obstacle-layout'
export type {
  Interval,
  CircleObstacle,
  RectObstacle,
  LayoutRegion,
  PositionedLine,
  LayoutColumnResult,
} from './obstacle-layout'

// --- Streaming ---
export { prepareStreaming, clearStreamingState } from './streaming'

// --- Text Utilities ---
export { fitFontSize, truncateText } from './text-utils'
export type { TruncationResult } from './text-utils'

// --- Typewriter ---
export { buildTypewriterFrames } from './typewriter'
export type { TypewriterFrame } from './typewriter'
export { useTypewriterLayout } from './hooks/useTypewriterLayout'
export type { TypewriterLayoutResult } from './hooks/useTypewriterLayout'

// --- Utilities ---
export { clearCache, setLocale } from './layout'
