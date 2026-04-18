// example/components/demos/Balanced.tsx
//
// Before/after demo for CSS `text-wrap: balance` — RN has no native
// equivalent, and browsers disagree on details. expo-pretext ships a
// JS implementation that runs identically on iOS / Android / Web.

import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native'
import { BalancedText, PrettyText } from 'expo-pretext'

const HEADLINE = 'The text layout primitive React Native was missing'
const PARAGRAPH =
  'expo-pretext ships a JS-level balancing algorithm that runs identically across iOS, Android, and Expo Web. No browser version drift, no platform asymmetry, just the pyramid shape your designer keeps asking for'

export function BalancedDemo() {
  const { width } = useWindowDimensions()
  const maxContainer = Math.min(width - 48, 420)
  const [containerWidth, setContainerWidth] = useState(maxContainer)

  const headlineStyle = {
    fontFamily: 'System',
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800' as const,
    color: '#fff',
  }

  const paragraphStyle = {
    fontFamily: 'System',
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.9)',
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <Text style={s.sectionTitle}>text-wrap: balance</Text>
      <Text style={s.desc}>
        Chrome 114+ / Safari 17.5. Not on Firefox. Not on RN.{'\n'}
        expo-pretext ships it for iOS, Android, and Web.
      </Text>

      <View style={s.compareHeader}>
        <Text style={s.compareLabel}>GREEDY (RN default)</Text>
        <Text style={s.compareLabel}>BALANCED</Text>
      </View>

      <View style={[s.compareRow, { width: maxContainer * 2 + 12 }]}>
        <View style={[s.card, s.cardLeft, { width: containerWidth }]}>
          <Text style={headlineStyle}>{HEADLINE}</Text>
        </View>
        <View style={[s.card, s.cardRight, { width: containerWidth }]}>
          <BalancedText style={headlineStyle} maxWidth={containerWidth}>
            {HEADLINE}
          </BalancedText>
        </View>
      </View>

      <Text style={s.sliderLabel}>Container width: {containerWidth.toFixed(0)}px</Text>
      <View style={s.widthRow}>
        {[160, 220, 280, 340, maxContainer].map((w) => (
          <Pressable
            key={w}
            onPress={() => setContainerWidth(w)}
            style={[s.widthBtn, Math.abs(containerWidth - w) < 1 && s.widthBtnActive]}
          >
            <Text style={[s.widthBtnText, Math.abs(containerWidth - w) < 1 && s.widthBtnTextActive]}>
              {w.toFixed(0)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={s.divider} />

      <Text style={s.sectionTitle}>text-wrap: pretty</Text>
      <Text style={s.desc}>
        Widow-free paragraphs. Chrome 117+.{'\n'}
        Tail rebalancing so the last line never sits alone.
      </Text>

      <View style={s.compareHeader}>
        <Text style={s.compareLabel}>GREEDY (RN default)</Text>
        <Text style={s.compareLabel}>PRETTY</Text>
      </View>

      <View style={[s.compareRow, { width: maxContainer * 2 + 12 }]}>
        <View style={[s.card, s.cardLeft, { width: containerWidth }]}>
          <Text style={paragraphStyle}>{PARAGRAPH}</Text>
        </View>
        <View style={[s.card, s.cardRight, { width: containerWidth }]}>
          <PrettyText style={paragraphStyle} maxWidth={containerWidth}>
            {PARAGRAPH}
          </PrettyText>
        </View>
      </View>

      <View style={s.note}>
        <Text style={s.noteText}>
          Same algorithm, same output, every platform. Drag the slider — both
          cards re-layout in real time at ~5–8 layout calls each (under 10 µs).
        </Text>
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0c' },
  content: { padding: 16, paddingBottom: 60 },
  sectionTitle: {
    fontFamily: 'Menlo', fontSize: 14, fontWeight: '800', color: '#ffd369',
    letterSpacing: 1, marginBottom: 4,
  },
  desc: {
    fontFamily: 'Menlo', fontSize: 11, color: 'rgba(255,255,255,0.5)',
    lineHeight: 17, marginBottom: 14,
  },
  compareHeader: {
    flexDirection: 'row', gap: 12, marginBottom: 6,
  },
  compareLabel: {
    flex: 1, fontFamily: 'Menlo', fontSize: 9, fontWeight: '700',
    color: 'rgba(255,255,255,0.4)', letterSpacing: 1.2, textAlign: 'center',
  },
  compareRow: {
    flexDirection: 'row', gap: 12, marginBottom: 14,
  },
  card: {
    backgroundColor: '#121218', borderRadius: 14, padding: 16, minHeight: 140,
    borderWidth: 1,
  },
  cardLeft: { borderColor: 'rgba(239,68,68,0.5)' },
  cardRight: { borderColor: 'rgba(74,222,128,0.55)' },
  sliderLabel: {
    fontFamily: 'Menlo', fontSize: 11, color: 'rgba(255,255,255,0.7)',
    marginBottom: 6,
  },
  widthRow: { flexDirection: 'row', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  widthBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: '#121218',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  widthBtnActive: { backgroundColor: '#ffd369', borderColor: '#ffd369' },
  widthBtnText: { fontFamily: 'Menlo', fontSize: 10, color: 'rgba(255,255,255,0.65)' },
  widthBtnTextActive: { color: '#0a0a0c', fontWeight: '800' },
  divider: {
    height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 14,
  },
  note: {
    backgroundColor: '#17171f', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: 'rgba(96,165,250,0.25)', marginTop: 8,
  },
  noteText: {
    fontFamily: 'Menlo', fontSize: 10, color: 'rgba(255,255,255,0.65)',
    lineHeight: 15,
  },
})
