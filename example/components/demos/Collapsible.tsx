import { useState } from 'react'
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import { useCollapsibleHeight } from 'expo-pretext/animated'

const FULL_TEXT = "This is the full expanded text of a post. It goes on with multiple paragraphs explaining all the details. Here we have even more content that justifies why the user might want to see the full version. The key point is that expo-pretext can pre-compute both heights — collapsed and expanded — before any animation starts. No layout jumps, no height flicker, no onLayout reading."

const PREVIEW = "This is the full expanded text of a post. It goes on..."

const STYLE = { fontFamily: 'Helvetica Neue', fontSize: 16, lineHeight: 24 }

export function CollapsibleDemo() {
  const { width } = useWindowDimensions()
  const maxWidth = width - 64
  const [expanded, setExpanded] = useState(false)

  const { animatedHeight, expandedHeight, collapsedHeight } = useCollapsibleHeight(
    FULL_TEXT,
    PREVIEW,
    STYLE,
    maxWidth,
    expanded,
    { timing: { duration: 300 } },
  )

  const containerStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value + 32,
    overflow: 'hidden',
  }))

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.bubble, containerStyle]}>
        <Text style={styles.bubbleText}>{expanded ? FULL_TEXT : PREVIEW}</Text>
      </Animated.View>

      <Pressable onPress={() => setExpanded(!expanded)} style={styles.btn}>
        <Text style={styles.btnText}>{expanded ? 'Show less' : 'Show more'}</Text>
      </Pressable>

      <View style={styles.info}>
        <Text style={styles.infoText}>
          Collapsed: {collapsedHeight}px · Expanded: {expandedHeight}px
        </Text>
        <Text style={styles.infoText}>
          useCollapsibleHeight() · pre-computed both states, zero layout shift
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0c', padding: 16 },
  bubble: {
    backgroundColor: '#1a1a1e',
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
  },
  bubbleText: { fontFamily: 'Helvetica Neue', fontSize: 16, lineHeight: 24, color: '#e8e4dc' },
  btn: {
    marginTop: 16,
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    alignSelf: 'center',
  },
  btnText: { color: '#fff', fontFamily: 'Helvetica Neue', fontWeight: '600', fontSize: 14 },
  info: { marginTop: 24, alignItems: 'center', gap: 4 },
  infoText: { fontFamily: 'Menlo', fontSize: 10, color: 'rgba(255,255,255,0.4)' },
})
