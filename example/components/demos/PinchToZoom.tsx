import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, useWindowDimensions, PanResponder, Pressable, ScrollView } from 'react-native'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import { usePinchToZoomText } from 'expo-pretext/animated'
import { useTextHeight } from 'expo-pretext'

// Tag all logs so you can filter Metro output: `grep PINCH` or use Metro filter
const LOG_TAG = '[PINCH]'

function log(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23) // HH:MM:SS.mmm
  // eslint-disable-next-line no-console
  console.log(LOG_TAG, ts, ...args)
}

const SAMPLE_TEXT = "Pinch or drag the slider to zoom this text. On every scale change, the fontSize is scaled and the layout is recomputed in pure arithmetic. layout() runs in 0.0002ms — 120+ recalculations per frame, no reflow, no thrashing."

const BASE_STYLE = { fontFamily: 'Helvetica Neue', fontSize: 16, lineHeight: 24 }
const MIN_SCALE = 0.5
const MAX_SCALE = 3.0

// Reserved space at the bottom for the control panel (chips + slider + footer)
const BOTTOM_PANEL_HEIGHT = 280
const CONTAINER_PADDING = 16

export function PinchToZoomDemo() {
  const { width } = useWindowDimensions()

  // Fixed text content width: container padding 16 + bubble border 1 +
  // scrollView padding 16 = 33 per side = 66 total. Using a stable value
  // avoids an onLayout feedback loop that caused flicker on scale changes.
  const maxWidth = width - 66

  const [scale, setScale] = useState(1)

  const zoom = usePinchToZoomText(SAMPLE_TEXT, BASE_STYLE, maxWidth, {
    minFontSize: 8,
    maxFontSize: 48,
  })

  // Tap to cycle discrete zoom levels — works on Simulator and any device.
  const cycleZoom = useCallback(() => {
    setScale(prev => {
      const levels = [1.0, 1.5, 2.0, 2.5, 0.8, 1.0]
      const idx = levels.findIndex(v => v > prev + 0.001)
      const next = idx === -1 ? levels[0]! : levels[idx]!
      log('TAP cycleZoom', { from: prev.toFixed(3), to: next.toFixed(3) })
      zoom.onPinchUpdate(next)
      return next
    })
  }, [zoom])

  // Slider drag — continuous scale control
  const SLIDER_W = width - 64
  const TRACK_PAD = 12
  const trackWidth = SLIDER_W - TRACK_PAD * 2

  const updateFromSlider = useCallback((locationX: number, phase: 'grant' | 'move') => {
    const x = Math.max(0, Math.min(trackWidth, locationX - TRACK_PAD))
    const t = x / trackWidth
    const s = MIN_SCALE + t * (MAX_SCALE - MIN_SCALE)
    log(`SLIDER ${phase}`, { locationX: locationX.toFixed(1), t: t.toFixed(3), scale: s.toFixed(3) })
    setScale(s)
    zoom.onPinchUpdate(s)
  }, [trackWidth, zoom])

  const sliderPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      // Use pageX minus container padding — avoids locationX oscillation caused
      // by the nested thumb view capturing hit-test events at different origins.
      const x = e.nativeEvent.pageX - CONTAINER_PADDING
      updateFromSlider(x, 'grant')
    },
    onPanResponderMove: (_e, gestureState) => {
      const x = gestureState.moveX - CONTAINER_PADDING
      updateFromSlider(x, 'move')
    },
    onPanResponderTerminationRequest: () => false,
  }), [updateFromSlider])

  const textStyle = useAnimatedStyle(() => ({
    fontSize: zoom.animatedFontSize.value,
    lineHeight: zoom.animatedLineHeight.value,
  }))

  const thumbPosition = ((scale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE)) * trackWidth

  // Use useTextHeight (native TextKit path) for accurate height reporting that
  // matches the rendered text. computeZoomLayout uses the JS line-break
  // algorithm which can disagree with TextKit by a line or two on iOS.
  const zoomedStyle = useMemo(() => {
    const fontSize = Math.max(8, Math.min(48, BASE_STYLE.fontSize * scale))
    const lineHeight = BASE_STYLE.lineHeight * (fontSize / BASE_STYLE.fontSize)
    return { ...BASE_STYLE, fontSize, lineHeight }
  }, [scale])
  const accurateHeight = useTextHeight(SAMPLE_TEXT, zoomedStyle, maxWidth)
  const accurateLineCount = Math.max(1, Math.round(accurateHeight / zoomedStyle.lineHeight))

  // Render-tracking log: fires on every state change so we can see flicker sequences.
  const renderCountRef = useRef(0)
  renderCountRef.current++
  const mountTimeRef = useRef<number>(Date.now())
  const elapsed = Date.now() - mountTimeRef.current

  useEffect(() => {
    log('RENDER', {
      renderN: renderCountRef.current,
      elapsedMs: elapsed,
      scale: scale.toFixed(3),
      fontSize: zoomedStyle.fontSize.toFixed(2),
      lineHeight: zoomedStyle.lineHeight.toFixed(2),
      height: accurateHeight.toFixed(1),
      lines: accurateLineCount,
      maxWidth,
    })
  }, [scale, zoomedStyle.fontSize, zoomedStyle.lineHeight, accurateHeight, accurateLineCount, maxWidth, elapsed])

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>Tap the bubble or drag the slider to zoom</Text>

      {/* Scrollable bubble region — grows with text, reserves bottom space for panel */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={cycleZoom}>
          <View style={styles.bubble}>
            <Animated.Text style={[styles.bubbleText, textStyle]}>
              {SAMPLE_TEXT}
            </Animated.Text>
          </View>
        </Pressable>
      </ScrollView>

      {/* Fixed bottom control panel — metrics grid + slider + footer */}
      <View style={styles.bottomPanel}>
        {/* Top divider bar */}
        <View style={styles.panelHandle} />

        {/* Metrics header */}
        <View style={styles.metricsHeader}>
          <Text style={styles.metricsTitle}>LAYOUT METRICS</Text>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE · 0.0002ms</Text>
          </View>
        </View>

        {/* Metrics grid — 4 cells in a row */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>SCALE</Text>
            <Text style={styles.metricValue}>{scale.toFixed(2)}<Text style={styles.metricUnit}>x</Text></Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>FONT</Text>
            <Text style={styles.metricValue}>{Math.round(zoomedStyle.fontSize)}<Text style={styles.metricUnit}>px</Text></Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>HEIGHT</Text>
            <Text style={styles.metricValue}>{Math.round(accurateHeight)}<Text style={styles.metricUnit}>px</Text></Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>LINES</Text>
            <Text style={styles.metricValue}>{accurateLineCount}</Text>
          </View>
        </View>

        {/* Slider with inline value */}
        <View style={styles.sliderSection}>
          <View style={styles.sliderHeader}>
            <Text style={styles.sliderTitle}>ZOOM</Text>
            <View style={styles.sliderValueBadge}>
              <Text style={styles.sliderValueText}>{scale.toFixed(2)}x</Text>
            </View>
          </View>

          <View {...sliderPan.panHandlers} style={styles.sliderContainer}>
            <View style={styles.sliderTrack} pointerEvents="none">
              <View style={[styles.sliderFill, { width: thumbPosition + TRACK_PAD / 2 }]} />
              <View style={[styles.sliderThumb, { left: thumbPosition }]}>
                <View style={styles.sliderThumbInner} />
              </View>
            </View>
          </View>

          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>{MIN_SCALE.toFixed(1)}x</Text>
            <Text style={styles.sliderLabelMid}>1.0x</Text>
            <Text style={styles.sliderLabel}>{MAX_SCALE.toFixed(1)}x</Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footerText}>
          usePinchToZoomText() → native TextKit measurement
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    paddingHorizontal: CONTAINER_PADDING,
    paddingTop: CONTAINER_PADDING,
  },
  hint: {
    fontFamily: 'Menlo',
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginBottom: 12,
  },
  scrollArea: {
    flex: 1,
    marginBottom: BOTTOM_PANEL_HEIGHT,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  bubble: {
    backgroundColor: '#1a1a1e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a32',
    padding: 16,
  },
  bubbleText: {
    fontFamily: 'Helvetica Neue',
    color: '#e8e4dc',
  },
  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: CONTAINER_PADDING,
    paddingTop: 8,
    paddingBottom: 20,
    backgroundColor: '#0d0d12',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,211,105,0.15)',
    height: BOTTOM_PANEL_HEIGHT,
    shadowColor: '#000',
    shadowOpacity: 0.8,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -8 },
  },
  panelHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,211,105,0.25)',
    marginBottom: 14,
  },
  metricsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  metricsTitle: {
    fontFamily: 'Menlo',
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.5,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(74,158,93,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(74,158,93,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4a9e5d',
  },
  liveText: {
    fontFamily: 'Menlo',
    fontSize: 9,
    fontWeight: '700',
    color: '#6dd184',
    letterSpacing: 0.5,
  },
  metricsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a22',
    borderWidth: 1,
    borderColor: 'rgba(255,211,105,0.18)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 4,
    shadowColor: '#ffd369',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  metricCell: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  metricDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  metricLabel: {
    fontFamily: 'Menlo',
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    marginBottom: 4,
  },
  metricValue: {
    fontFamily: 'Menlo',
    fontSize: 19,
    fontWeight: '800',
    color: '#ffd369',
    letterSpacing: -0.3,
  },
  metricUnit: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,211,105,0.6)',
  },
  sliderSection: {
    marginTop: 16,
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sliderTitle: {
    fontFamily: 'Menlo',
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.5,
  },
  sliderValueBadge: {
    backgroundColor: '#ffd369',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  sliderValueText: {
    fontFamily: 'Menlo',
    fontSize: 11,
    fontWeight: '800',
    color: '#0a0a0c',
    letterSpacing: 0.3,
  },
  sliderContainer: {
    height: 32,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    position: 'relative',
  },
  sliderFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 6,
    backgroundColor: '#ffd369',
    borderRadius: 3,
    shadowColor: '#ffd369',
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  sliderThumb: {
    position: 'absolute',
    top: -11,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffd369',
    borderWidth: 3,
    borderColor: '#0a0a0c',
    shadowColor: '#ffd369',
    shadowOpacity: 0.7,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    justifyContent: 'center',
    alignItems: 'center',
  },
  sliderThumbInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0a0a0c',
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  sliderLabel: {
    fontFamily: 'Menlo',
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
  },
  sliderLabelMid: {
    fontFamily: 'Menlo',
    fontSize: 9,
    color: 'rgba(255,211,105,0.6)',
    fontWeight: '700',
  },
  footerText: {
    fontFamily: 'Menlo',
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 10,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
})
