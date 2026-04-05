import { useState, useCallback, useRef, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, useWindowDimensions, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { sampleTexts } from '../../data/sample-texts'
import { useTextHeight } from 'expo-pretext'

const testWidths = [200, 280, 360]
const style = { fontFamily: 'System', fontSize: 16, lineHeight: 24 }

type AccuracyResult = {
  lang: string
  width: number
  predicted: number
  actual: number
  diff: number
  pass: boolean
}

function AccuracyRow({ lang, text, testWidth }: { lang: string; text: string; testWidth: number }) {
  const [actual, setActual] = useState<number | null>(null)
  const predicted = useTextHeight(text, style, testWidth - 8) // minus padding

  const diff = actual !== null ? Math.abs(predicted - actual) : null
  const pass = diff !== null ? diff < 1 : null

  return (
    <View style={styles.testRow}>
      <Text style={styles.widthLabel}>{testWidth}px</Text>
      <View style={[styles.textBox, { width: testWidth }]}>
        <Text
          style={styles.sampleText}
          onLayout={e => setActual(e.nativeEvent.layout.height)}
        >
          {text}
        </Text>
      </View>
      <View style={styles.resultCol}>
        {diff !== null ? (
          <>
            <Text style={[styles.diffText, pass ? styles.pass : styles.fail]}>
              {pass ? 'PASS' : 'FAIL'}
            </Text>
            <Text style={styles.diffValue}>{diff.toFixed(1)}px</Text>
            <Text style={styles.detailText}>P:{predicted.toFixed(0)} A:{actual?.toFixed(0)}</Text>
          </>
        ) : (
          <Text style={styles.diffValue}>...</Text>
        )}
      </View>
    </View>
  )
}

export default function AccuracyScreen() {
  const texts = Object.entries(sampleTexts)

  const totalTests = texts.length * testWidths.length

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Accuracy</Text>
      <Text style={styles.subtitle}>
        Predicted (expo-pretext) vs Actual (RN Text onLayout)
      </Text>
      <Text style={styles.subtitle}>
        {texts.length} texts x {testWidths.length} widths = {totalTests} tests | Target: {'<'}1px diff
      </Text>

      <ScrollView contentContainerStyle={styles.list}>
        {texts.map(([lang, text]) => (
          <View key={lang} style={styles.section}>
            <Text style={styles.sectionTitle}>{lang}</Text>
            {testWidths.map(w => (
              <AccuracyRow key={w} lang={lang} text={text} testWidth={w} />
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginTop: 16 },
  subtitle: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 4 },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 12, textTransform: 'capitalize' },
  testRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
  },
  widthLabel: { fontSize: 11, color: '#999', width: 36, paddingTop: 4 },
  textBox: {
    backgroundColor: '#f8f8f8',
    borderRadius: 4,
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    flex: 1,
  },
  sampleText: { fontSize: 16, lineHeight: 24 },
  resultCol: { width: 55, alignItems: 'center', paddingTop: 2 },
  diffText: { fontSize: 11, fontWeight: '700' },
  pass: { color: '#34C759' },
  fail: { color: '#FF3B30' },
  diffValue: { fontSize: 10, color: '#666', marginTop: 2 },
  detailText: { fontSize: 9, color: '#999', marginTop: 1 },
})
