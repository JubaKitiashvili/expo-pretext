// src/index.ts
// Public API for expo-pretext.
// Simple API (hooks) + Power API (Pretext 1:1) + Utilities.

// --- Types ---
export type {
  TextStyle,
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
export { measureHeights } from './prepare'

// --- Core API ---
export { prepare, prepareWithSegments } from './prepare'
export { layout, layoutWithLines, layoutNextLine, walkLineRanges, measureNaturalWidth } from './layout'

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

// --- Utilities ---
export { clearCache, setLocale } from './layout'
