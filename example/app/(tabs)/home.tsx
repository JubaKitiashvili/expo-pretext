import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { useRouter } from 'expo-router'

const STATS = [
  { value: '0.0002ms', label: 'layout() speed' },
  { value: '400+', label: 'tests passing' },
  { value: '3', label: 'platforms' },
]

const FEATURED = [
  { id: 'read-more', title: 'Read More / Less', desc: 'Truncated preview + typewriter reveal', color: '#3b82f6' },
  { id: 'breakout', title: 'Breakout Text', desc: 'Prose reflows around the ball at 60fps', color: '#ef4444' },
  { id: 'markdown-chat', title: 'AI Chat', desc: '10K messages with FlashList + streaming', color: '#8b5cf6' },
  { id: 'editorial', title: 'Editorial Engine', desc: 'Text reflows around draggable obstacles', color: '#10b981' },
]

export default function HomeScreen() {
  const router = useRouter()

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <View style={s.hero}>
        <Text style={s.heroTitle}>expo-pretext</Text>
        <Text style={s.heroTagline}>
          The text layout primitive{'\n'}React Native was missing.
        </Text>
        <Text style={s.heroSub}>
          Native measurement, ~0.0002ms pure-JS layout arithmetic,{'\n'}
          and full control over how text flows.
        </Text>
      </View>

      <View style={s.statsRow}>
        {STATS.map(stat => (
          <View key={stat.label} style={s.statCard}>
            <Text style={s.statValue}>{stat.value}</Text>
            <Text style={s.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <Text style={s.sectionTitle}>Featured Demos</Text>
      {FEATURED.map(item => (
        <Pressable
          key={item.id}
          style={s.featuredCard}
          onPress={() => router.push({ pathname: '/(tabs)/demos', params: { open: item.id } })}
        >
          <View style={[s.featuredDot, { backgroundColor: item.color }]} />
          <View style={s.featuredText}>
            <Text style={s.featuredTitle}>{item.title}</Text>
            <Text style={s.featuredDesc}>{item.desc}</Text>
          </View>
          <Text style={s.featuredArrow}>›</Text>
        </Pressable>
      ))}

      <View style={s.install}>
        <Text style={s.installLabel}>Quick install</Text>
        <View style={s.installBox}>
          <Text style={s.installCode}>npx expo install expo-pretext</Text>
        </View>
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0c' },
  content: { paddingBottom: 40 },
  hero: { paddingTop: 80, paddingHorizontal: 24, paddingBottom: 32 },
  heroTitle: {
    fontFamily: 'Menlo', fontSize: 28, fontWeight: '900',
    color: '#ffd369', letterSpacing: 1.5, marginBottom: 12,
  },
  heroTagline: {
    fontSize: 22, fontWeight: '700', color: '#fff', lineHeight: 30, marginBottom: 12,
  },
  heroSub: {
    fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 24, marginBottom: 32,
  },
  statCard: {
    flex: 1, backgroundColor: '#121218', borderRadius: 12,
    padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,211,105,0.15)',
  },
  statValue: {
    fontFamily: 'Menlo', fontSize: 16, fontWeight: '800', color: '#ffd369',
  },
  statLabel: {
    fontFamily: 'Menlo', fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 4,
    textAlign: 'center',
  },
  sectionTitle: {
    fontFamily: 'Menlo', fontSize: 12, fontWeight: '700',
    color: 'rgba(255,255,255,0.5)', letterSpacing: 1,
    paddingHorizontal: 24, marginBottom: 12, textTransform: 'uppercase',
  },
  featuredCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 24, marginBottom: 10, padding: 14,
    backgroundColor: '#121218', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  featuredDot: { width: 10, height: 10, borderRadius: 5, marginRight: 14 },
  featuredText: { flex: 1 },
  featuredTitle: { fontSize: 15, fontWeight: '600', color: '#fff' },
  featuredDesc: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  featuredArrow: { fontSize: 22, color: 'rgba(255,255,255,0.2)', fontWeight: '300' },
  install: { paddingHorizontal: 24, marginTop: 24 },
  installLabel: {
    fontFamily: 'Menlo', fontSize: 10, fontWeight: '700',
    color: 'rgba(255,255,255,0.3)', marginBottom: 8, textTransform: 'uppercase',
  },
  installBox: {
    backgroundColor: '#121218', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  installCode: { fontFamily: 'Menlo', fontSize: 13, color: '#4ade80' },
})
