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
const BOTTOM_PANEL_HEIGHT = 240
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

      {/* Fixed bottom control panel — chips + slider + footer, always visible */}
      <View style={styles.bottomPanel}>
        <View style={styles.infoRow}>
          <View style={styles.chip}>
            <Text style={styles.chipKey}>scale</Text>
            <Text style={styles.chipVal}>{scale.toFixed(2)}x</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipKey}>fontSize</Text>
            <Text style={styles.chipVal}>{Math.round(zoomedStyle.fontSize)}px</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipKey}>height</Text>
            <Text style={styles.chipVal}>{Math.round(accurateHeight)}px</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipKey}>lines</Text>
            <Text style={styles.chipVal}>{accurateLineCount}</Text>
          </View>
        </View>

        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>{MIN_SCALE.toFixed(1)}x</Text>
          <Text style={styles.sliderLabel}>{MAX_SCALE.toFixed(1)}x</Text>
        </View>
        <View {...sliderPan.panHandlers} style={styles.sliderContainer}>
          <View style={styles.sliderTrack} pointerEvents="none">
            <View style={[styles.sliderFill, { width: thumbPosition + TRACK_PAD / 2 }]} />
            <View style={[styles.sliderThumb, { left: thumbPosition }]} />
          </View>
        </View>

        <Text style={styles.footerText}>
          usePinchToZoomText() · layout() at 0.0002ms per scale change
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
    paddingTop: 16,
    paddingBottom: 20,
    backgroundColor: '#0a0a0c',
    borderTopWidth: 1,
    borderTopColor: '#1a1a1e',
    height: BOTTOM_PANEL_HEIGHT,
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: '#ffd369',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    gap: 10,
    shadowColor: '#ffd369',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  chipKey: {
    fontFamily: 'Menlo',
    fontSize: 13,
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  chipVal: {
    fontFamily: 'Menlo',
    fontSize: 20,
    color: '#ffd369',
    fontWeight: '800',
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingHorizontal: 2,
  },
  sliderLabel: {
    fontFamily: 'Menlo',
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
  },
  sliderContainer: {
    height: 40,
    justifyContent: 'center',
    marginTop: 4,
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
  },
  sliderThumb: {
    position: 'absolute',
    top: -9,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffd369',
    borderWidth: 2,
    borderColor: '#0a0a0c',
    shadowColor: '#ffd369',
    shadowOpacity: 0.6,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  footerText: {
    fontFamily: 'Menlo',
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 8,
    textAlign: 'center',
  },
})
