import { View, Text, StyleSheet, useWindowDimensions } from 'react-native'
import { GestureHandlerRootView, Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import { usePinchToZoomText } from 'expo-pretext/animated'

const SAMPLE_TEXT = "Pinch to zoom this text. On every gesture frame, fontSize is scaled and the layout is recomputed. layout() runs in 0.0002ms, so we can handle 120+ layouts per frame. This is impossible with CSS font-size transitions because browsers reflow synchronously. With expo-pretext, the reflow is pure arithmetic — no reflow, no layout thrashing, no jank."

const BASE_STYLE = { fontFamily: 'Helvetica Neue', fontSize: 16, lineHeight: 24 }

export function PinchToZoomDemo() {
  const { width } = useWindowDimensions()
  const maxWidth = width - 32

  const zoom = usePinchToZoomText(SAMPLE_TEXT, BASE_STYLE, maxWidth, {
    minFontSize: 10,
    maxFontSize: 48,
  })

  const pinch = Gesture.Pinch().onUpdate(e => {
    zoom.onPinchUpdate(e.scale)
  }).onEnd(() => {
    // Keep final state — don't reset
  })

  const containerStyle = useAnimatedStyle(() => ({
    height: zoom.animatedHeight.value + 32,
  }))

  const textStyle = useAnimatedStyle(() => ({
    fontSize: zoom.animatedFontSize.value,
    lineHeight: zoom.animatedLineHeight.value,
  }))

  return (
    <GestureHandlerRootView style={styles.container}>
      <Text style={styles.hint}>Pinch with two fingers to zoom</Text>
      <GestureDetector gesture={pinch}>
        <Animated.View style={[styles.bubble, containerStyle]}>
          <Animated.Text style={[styles.bubbleText, textStyle]}>
            {SAMPLE_TEXT}
          </Animated.Text>
        </Animated.View>
      </GestureDetector>

      <View style={styles.info}>
        <Text style={styles.infoText}>
          usePinchToZoomText() · 120+ layouts/frame via layout() @ 0.0002ms
        </Text>
      </View>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0c', padding: 16 },
  hint: { fontFamily: 'Menlo', fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 16 },
  bubble: {
    backgroundColor: '#1a1a1e',
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
  },
  bubbleText: { fontFamily: 'Helvetica Neue', color: '#e8e4dc' },
  info: { marginTop: 24, alignItems: 'center', gap: 4 },
  infoText: { fontFamily: 'Menlo', fontSize: 10, color: 'rgba(255,255,255,0.4)' },
})
