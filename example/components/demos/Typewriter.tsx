import { useEffect, useState, useCallback } from 'react'
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native'
import { useTypewriterLayout } from 'expo-pretext'

const SAMPLE_TEXT = "Sure! I can help with that. The key insight about text layout prediction is that once you know the exact segment widths, everything else is pure arithmetic. This is why expo-pretext can hit 60fps even during complex gesture-driven layouts — all the heavy work happens once in prepare(), and layout() just adds numbers."

const STYLE = { fontFamily: 'Helvetica Neue', fontSize: 16, lineHeight: 24 }

export function TypewriterDemo() {
  const { width } = useWindowDimensions()
  const maxWidth = width - 64
  const [playing, setPlaying] = useState(false)

  const typewriter = useTypewriterLayout(SAMPLE_TEXT, STYLE, maxWidth)

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      if (!typewriter.advance()) {
        setPlaying(false)
      }
    }, 30)
    return () => clearInterval(timer)
  }, [playing, typewriter])

  const start = useCallback(() => {
    typewriter.reset()
    setPlaying(true)
  }, [typewriter])

  const stop = useCallback(() => setPlaying(false), [])

  return (
    <View style={styles.container}>
      <View style={[styles.bubble, { minHeight: typewriter.height + 24 }]}>
        <Text style={styles.bubbleText}>
          {typewriter.current?.revealedText ?? 'Press play to start typing...'}
        </Text>
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={playing ? stop : start}
          style={[styles.btn, playing && styles.btnActive]}
        >
          <Text style={styles.btnText}>{playing ? 'Pause' : typewriter.revealIndex >= typewriter.totalFrames - 1 ? 'Replay' : 'Play'}</Text>
        </Pressable>
        <Pressable onPress={() => { setPlaying(false); typewriter.reset() }} style={styles.btn}>
          <Text style={styles.btnText}>Reset</Text>
        </Pressable>
      </View>

      <View style={styles.info}>
        <Text style={styles.infoText}>
          Frame {typewriter.revealIndex + 1} / {typewriter.totalFrames} · {typewriter.lineCount} lines · {typewriter.height}px
        </Text>
        <Text style={styles.infoText}>
          useTypewriterLayout() · layout() at 0.0002ms = smooth reveal
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
  bubbleText: {
    fontFamily: 'Helvetica Neue',
    fontSize: 16,
    lineHeight: 24,
    color: '#e8e4dc',
  },
  controls: { flexDirection: 'row', gap: 12, marginTop: 20, justifyContent: 'center' },
  btn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
  },
  btnActive: { backgroundColor: '#7c3aed' },
  btnText: { color: '#fff', fontFamily: 'Helvetica Neue', fontWeight: '600', fontSize: 14 },
  info: { marginTop: 24, alignItems: 'center', gap: 4 },
  infoText: { fontFamily: 'Menlo', fontSize: 10, color: 'rgba(255,255,255,0.4)' },
})
