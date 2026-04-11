// src/components/PretextDebugOverlay.tsx
// React component that wraps text and shows predicted vs actual height diff.

import React, { useState, type ReactNode } from 'react'
import { View, Text, type LayoutChangeEvent } from 'react-native'
import { compareDebugMeasurement, DEBUG_ACCURACY_COLORS, type DebugMeasurement } from '../debug'

export type PretextDebugOverlayProps = {
  /** Predicted height from prepare() + layout() */
  predictedHeight: number
  /** Children to wrap (the actual text content) */
  children: ReactNode
  /** Show label with diff info (default: true) */
  showLabel?: boolean
  /** Custom label formatter */
  labelFormatter?: (m: DebugMeasurement) => string
  /** Callback when measurement is captured */
  onMeasurement?: (m: DebugMeasurement) => void
}

/**
 * Visual debug overlay showing predicted vs actual text height.
 *
 * Wraps children in a bordered container, measures actual height via onLayout,
 * compares against the provided predicted height, and shows a colored border:
 * - Green: exact match (<1px)
 * - Yellow: close (<5% diff)
 * - Orange: loose (<15% diff)
 * - Red: wrong (>15% diff)
 *
 * Production-safe: only renders overlay chrome in __DEV__ mode.
 *
 * @example
 * ```tsx
 * import { PretextDebugOverlay } from 'expo-pretext'
 *
 * function Message({ text, style, width }) {
 *   const predictedHeight = useTextHeight(text, style, width)
 *   return (
 *     <PretextDebugOverlay predictedHeight={predictedHeight}>
 *       <Text style={style}>{text}</Text>
 *     </PretextDebugOverlay>
 *   )
 * }
 * ```
 */
export function PretextDebugOverlay({
  predictedHeight,
  children,
  showLabel = true,
  labelFormatter,
  onMeasurement,
}: PretextDebugOverlayProps) {
  const [measurement, setMeasurement] = useState<DebugMeasurement | null>(null)

  const handleLayout = (event: LayoutChangeEvent) => {
    const actualHeight = event.nativeEvent.layout.height
    const m = compareDebugMeasurement(predictedHeight, actualHeight)
    setMeasurement(m)
    onMeasurement?.(m)
  }

  // In production, render children without debug chrome
  if (typeof __DEV__ !== 'undefined' && !__DEV__) {
    return <>{children}</>
  }

  const borderColor = measurement
    ? DEBUG_ACCURACY_COLORS[measurement.accuracy]
    : '#6b7280'

  const label = measurement
    ? (labelFormatter ? labelFormatter(measurement) : defaultLabel(measurement))
    : `predicted: ${predictedHeight}px`

  return (
    <View onLayout={handleLayout} style={{ borderWidth: 1, borderColor, position: 'relative' }}>
      {children}
      {showLabel && (
        <View style={{
          position: 'absolute',
          top: -1,
          right: -1,
          backgroundColor: borderColor,
          paddingHorizontal: 4,
          paddingVertical: 1,
        }}>
          <Text style={{ fontSize: 9, color: '#fff', fontFamily: 'Menlo' }}>{label}</Text>
        </View>
      )}
    </View>
  )
}

function defaultLabel(m: DebugMeasurement): string {
  return `${m.predicted}→${m.actual.toFixed(0)} (${m.diff.toFixed(1)}px, ${m.diffPercent.toFixed(1)}%)`
}
