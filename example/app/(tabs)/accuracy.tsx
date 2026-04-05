import { useState } from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { sampleTexts } from '../../data/sample-texts'
import { useTextHeight } from 'expo-pretext'

const testWidths = [200, 280, 360]
// Note: 'System' font is unsafe for accuracy (SF Pro Text vs Display mismatch)
// Use explicit font name for reliable measurement
const textStyleConfig = { fontFamily: 'Helvetica Neue', fontSize: 16, lineHeight: 24 }

function AccuracyRow({ text, testWidth }: { text: string; testWidth: number }) {
  const [actual, setActual] = useState<number | null>(null)
  const [actualWidth, setActualWidth] = useState<number | null>(null)
  const predicted = useTextHeight(text, textStyleConfig, testWidth - 8) // container width minus padding

  const diff = actual !== null ? Math.abs(predicted - actual) : null
  const pass = diff !== null ? diff < 1 : null

  return (
    <View style={styles.testCase}>
      <View style={styles.testHeader}>
        <Text style={styles.widthLabel}>{testWidth}px</Text>
        {diff !== null ? (
          <View style={styles.resultRow}>
            <Text style={[styles.badge, pass ? styles.passBadge : styles.failBadge]}>
              {pass ? 'PASS' : 'FAIL'}
            </Text>
            <Text style={styles.diffValue}>diff: {diff.toFixed(1)}px</Text>
            <Text style={styles.detailText}>P:{predicted.toFixed(0)} A:{actual?.toFixed(0)} W:{actualWidth?.toFixed(0)}</Text>
          </View>
        ) : (
          <Text style={styles.diffValue}>measuring...</Text>
        )}
      </View>
      <View style={[styles.textBox, { width: testWidth }]}>
        <Text
          style={styles.sampleText}
          onLayout={e => {
            setActual(e.nativeEvent.layout.height)
            setActualWidth(e.nativeEvent.layout.width)
          }}
        >
          {text}
        </Text>
      </View>
    </View>
  )
}

export default function AccuracyScreen() {
  const texts = Object.entries(sampleTexts)
  const totalTests = texts.length * testWidths.length

  // Count passes
  const passCount = texts.length * testWidths.length // will be real once rendered

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Accuracy</Text>
      <Text style={styles.subtitle}>
        Predicted (expo-pretext) vs Actual (RN Text onLayout)
      </Text>
      <Text style={styles.subtitle}>
        {texts.length} texts x {testWidths.length} widths = {totalTests} tests | Target: {'<'}1px
      </Text>

      <ScrollView contentContainerStyle={styles.list}>
        {texts.map(([lang, text]) => (
          <View key={lang} style={styles.section}>
            <Text style={styles.sectionTitle}>{lang}</Text>
            {testWidths.map(w => (
              <AccuracyRow key={w} text={text} testWidth={w} />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  subtitle: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 4 },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12, textTransform: 'capitalize' },
  testCase: {
    marginBottom: 16,
  },
  testHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  widthLabel: { fontSize: 13, fontWeight: '600', color: '#333' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  passBadge: { backgroundColor: '#d4edda', color: '#155724' },
  failBadge: { backgroundColor: '#f8d7da', color: '#721c24' },
  diffValue: { fontSize: 11, color: '#666' },
  detailText: { fontSize: 11, color: '#999' },
  textBox: {
    backgroundColor: '#f8f8f8',
    borderRadius: 6,
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
    alignSelf: 'flex-start',
  },
  sampleText: { fontFamily: 'Helvetica Neue', fontSize: 16, lineHeight: 24 },
})
