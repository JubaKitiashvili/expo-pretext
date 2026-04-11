import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, useWindowDimensions, PanResponder, Pressable } from 'react-native'
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import { usePinchToZoomText } from 'expo-pretext/animated'

const SAMPLE_TEXT = "Pinch or drag the slider to zoom this text. On every scale change, the fontSize is scaled and the layout is recomputed in pure arithmetic. layout() runs in 0.0002ms — 120+ recalculations per frame, no reflow, no thrashing."

const BASE_STYLE = { fontFamily: 'Helvetica Neue', fontSize: 16, lineHeight: 24 }
const MIN_SCALE = 0.5
const MAX_SCALE = 3.0

export function PinchToZoomDemo() {
  const { width } = useWindowDimensions()
  // container padding 16 + bubble padding 16 per side = 64 total
  const maxWidth = width - 64

  const [scale, setScale] = useState(1)

  const zoom = usePinchToZoomText(SAMPLE_TEXT, BASE_STYLE, maxWidth, {
    minFontSize: 8,
    maxFontSize: 48,
  })

  // Tap to cycle discrete zoom levels — works on Simulator and any device.
  // Uses functional state update so we always read the latest scale.
  const cycleZoom = useCallback(() => {
    setScale(prev => {
      const levels = [1.0, 1.5, 2.0, 2.5, 0.8, 1.0]
      const idx = levels.findIndex(v => v > prev + 0.001)
      const next = idx === -1 ? levels[0]! : levels[idx]!
      zoom.onPinchUpdate(next)
      return next
    })
  }, [zoom])

  // Pinch gesture — works on real devices with 2 fingers. On Simulator, use
  // Option+click to emulate pinch, or tap the bubble to cycle discrete levels.
  const pinchGesture = Gesture.Pinch()
    .onUpdate(e => {
      const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, e.scale))
      runOnJS(setScale)(clamped)
      runOnJS(zoom.onPinchUpdate)(clamped)
    })

  // Slider drag — continuous scale control
  const SLIDER_W = width - 64
  const TRACK_PAD = 12
  const trackWidth = SLIDER_W - TRACK_PAD * 2

  const updateFromSlider = useCallback((locationX: number) => {
    const x = Math.max(0, Math.min(trackWidth, locationX - TRACK_PAD))
    const t = x / trackWidth
    const s = MIN_SCALE + t * (MAX_SCALE - MIN_SCALE)
    setScale(s)
    zoom.onPinchUpdate(s)
  }, [trackWidth, zoom])

  const sliderPan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => updateFromSlider(e.nativeEvent.locationX),
    onPanResponderMove: (e) => updateFromSlider(e.nativeEvent.locationX),
  })

  const textStyle = useAnimatedStyle(() => ({
    fontSize: zoom.animatedFontSize.value,
    lineHeight: zoom.animatedLineHeight.value,
  }))

  const thumbPosition = ((scale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE)) * trackWidth
  const currentLayout = zoom.layoutAtScale(scale)

  return (
    <GestureHandlerRootView style={styles.container}>
      <Text style={styles.hint}>Tap the bubble or drag the slider to zoom</Text>

      <Pressable onPress={cycleZoom}>
        <GestureDetector gesture={pinchGesture}>
          <Animated.View style={styles.bubble}>
            <Animated.Text style={[styles.bubbleText, textStyle]}>
              {SAMPLE_TEXT}
            </Animated.Text>
          </Animated.View>
        </GestureDetector>
      </Pressable>

      {/* Info chips */}
      <View style={styles.infoRow}>
        <View style={styles.chip}>
          <Text style={styles.chipKey}>scale</Text>
          <Text style={styles.chipVal}>{scale.toFixed(2)}x</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipKey}>fontSize</Text>
          <Text style={styles.chipVal}>{Math.round(currentLayout.fontSize)}px</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipKey}>height</Text>
          <Text style={styles.chipVal}>{Math.round(currentLayout.height)}px</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipKey}>lines</Text>
          <Text style={styles.chipVal}>{currentLayout.lineCount}</Text>
        </View>
      </View>

      {/* Slider */}
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderLabel}>{MIN_SCALE.toFixed(1)}x</Text>
        <Text style={styles.sliderLabel}>{MAX_SCALE.toFixed(1)}x</Text>
      </View>
      <View {...sliderPan.panHandlers} style={styles.sliderContainer}>
        <View style={styles.sliderTrack}>
          <View style={[styles.sliderFill, { width: thumbPosition + TRACK_PAD / 2 }]} />
          <View style={[styles.sliderThumb, { left: thumbPosition }]} />
        </View>
      </View>

      <Text style={styles.infoText}>
        usePinchToZoomText() · computeZoomLayout() on every scale change
      </Text>
      <Text style={styles.infoText}>
        layout() at 0.0002ms = 120+ layouts per frame possible
      </Text>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0c', padding: 16 },
  hint: {
    fontFamily: 'Menlo',
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginBottom: 12,
  },
  bubble: {
    backgroundColor: '#1a1a1e',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a32',
  },
  bubbleText: {
    fontFamily: 'Helvetica Neue',
    color: '#e8e4dc',
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: '#1a1a1e',
    borderWidth: 1,
    borderColor: '#2a2a32',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6,
  },
  chipKey: {
    fontFamily: 'Menlo',
    fontSize: 9,
    color: 'rgba(255,255,255,0.45)',
  },
  chipVal: {
    fontFamily: 'Menlo',
    fontSize: 11,
    color: '#ffd369',
    fontWeight: '600',
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
  infoText: {
    fontFamily: 'Menlo',
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 6,
    textAlign: 'center',
  },
})
