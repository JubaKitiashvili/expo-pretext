import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native'
import { useTextMorphing } from 'expo-pretext'

const THINKING = 'Thinking...'
const RESPONSE = "Here's my analysis: the key to smooth text transitions is pre-computing the layout for both states. expo-pretext handles this in pure arithmetic, so you can animate line-by-line without re-measuring anything."

const STYLE = { fontFamily: 'Helvetica Neue', fontSize: 16, lineHeight: 24 }

export function TextMorphingDemo() {
  const { width } = useWindowDimensions()
  const maxWidth = width - 64
  const [progress, setProgress] = useState(0)
  const [animating, setAnimating] = useState(false)

  const morph = useTextMorphing(THINKING, RESPONSE, STYLE, maxWidth)

  useEffect(() => {
    if (!animating) return
    const start = Date.now()
    const DURATION = 1200
    const timer = setInterval(() => {
      const elapsed = Date.now() - start
      const p = Math.min(1, elapsed / DURATION)
      setProgress(p)
      if (p >= 1) {
        setAnimating(false)
        clearInterval(timer)
      }
    }, 16)
    return () => clearInterval(timer)
  }, [animating])

  const start = () => { setProgress(0); setAnimating(true) }
  const reset = () => { setAnimating(false); setProgress(0) }

  const currentHeight = morph.heightAt(progress)

  return (
    <View style={styles.container}>
      <View style={[styles.bubble, { height: currentHeight + 32 }]}>
        {morph.lines.map((line, i) => {
          // Fade out 'from' lines, fade in 'to' lines
          const opacity = progress < 0.5
            ? (line.existsInFrom ? 1 - progress * 2 : progress * 2)
            : (line.existsInTo ? Math.min(1, (progress - 0.3) * 2) : Math.max(0, 1 - progress * 2))
          const text = progress < 0.5 ? line.fromText : line.toText
          return (
            <Text key={i} style={[styles.line, { opacity }]}>{text}</Text>
          )
        })}
      </View>

      <View style={styles.controls}>
        <Pressable onPress={start} disabled={animating} style={[styles.btn, animating && styles.btnDisabled]}>
          <Text style={styles.btnText}>Morph</Text>
        </Pressable>
        <Pressable onPress={reset} style={styles.btn}>
          <Text style={styles.btnText}>Reset</Text>
        </Pressable>
      </View>

      <View style={styles.info}>
        <Text style={styles.infoText}>
          Progress: {(progress * 100).toFixed(0)}% · {morph.fromLineCount}→{morph.toLineCount} lines
        </Text>
        <Text style={styles.infoText}>
          useTextMorphing() · line-by-line transition with height interpolation
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
    overflow: 'hidden',
  },
  line: { fontFamily: 'Helvetica Neue', fontSize: 16, lineHeight: 24, color: '#e8e4dc' },
  controls: { flexDirection: 'row', gap: 12, marginTop: 20, justifyContent: 'center' },
  btn: { backgroundColor: '#2563eb', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontFamily: 'Helvetica Neue', fontWeight: '600', fontSize: 14 },
  info: { marginTop: 24, alignItems: 'center', gap: 4 },
  infoText: { fontFamily: 'Menlo', fontSize: 10, color: 'rgba(255,255,255,0.4)' },
})
