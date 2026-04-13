import { View, Text, StyleSheet, Pressable, SectionList } from 'react-native'
import { useState, useLayoutEffect, useEffect } from 'react'
import { useNavigation, useLocalSearchParams } from 'expo-router'

// Import all demos
import { TightBubblesDemo } from '../../components/demos/TightBubbles'
import { AccordionDemo } from '../../components/demos/Accordion'
import { EditorialEngineDemo } from '../../components/demos/EditorialEngine'
import { MasonryDemo } from '../../components/demos/Masonry'
import { I18nDemo } from '../../components/demos/I18n'
import { MarkdownChatDemo } from '../../components/demos/MarkdownChat'
import { JustificationComparisonDemo } from '../../components/demos/JustificationComparison'
import { AsciiArtDemo } from '../../components/demos/AsciiArt'
import { TypewriterDemo } from '../../components/demos/Typewriter'
import { TextMorphingDemo } from '../../components/demos/TextMorphing'
import { PinchToZoomDemo } from '../../components/demos/PinchToZoom'
import { CollapsibleDemo } from '../../components/demos/Collapsible'
import { TextClockDemo } from '../../components/demos/TextClock'
import { UmbrellaReflowDemo } from '../../components/demos/UmbrellaReflow'
import { PhysicsTodoDemo } from '../../components/demos/PhysicsTodo'
import { BreakoutTextDemo } from '../../components/demos/BreakoutText'
import { TextPathDemo } from '../../components/demos/TextPath'
import { ReadMoreDemo } from '../../components/demos/ReadMore'
import ChatScreen from './chat'

type Demo = {
  id: string
  title: string
  api: string
  desc: string
  component: React.ComponentType
}

const sections: { title: string; data: Demo[] }[] = [
  {
    title: 'Real-World Patterns',
    data: [
      { id: 'read-more', title: 'Read More / Less', api: 'truncateText() + useTypewriterLayout()', desc: 'Truncated preview with typewriter reveal on expand', component: ReadMoreDemo },
      { id: 'markdown-chat', title: 'AI Chat', api: 'FlashList + useStreamingLayout()', desc: '10,000 messages with rich markdown and streaming', component: ChatScreen },
      { id: 'tight-bubbles', title: 'Tight Chat Bubbles', api: 'walkLineRanges() + layout()', desc: 'Shrinkwrap bubbles — minimum width that keeps line count', component: TightBubblesDemo },
      { id: 'accordion', title: 'Accordion Heights', api: 'prepare() + layout()', desc: 'Expand/collapse with pre-computed heights', component: AccordionDemo },
      { id: 'collapsible', title: 'Collapsible Section', api: 'useCollapsibleHeight()', desc: 'Smooth Reanimated expand/collapse animation', component: CollapsibleDemo },
      { id: 'masonry', title: 'Masonry Grid', api: 'prepare() + layout()', desc: 'Pinterest-style grid with pre-computed card heights', component: MasonryDemo },
    ],
  },
  {
    title: 'Text Effects',
    data: [
      { id: 'typewriter', title: 'Typewriter Effect', api: 'useTypewriterLayout()', desc: 'Token-by-token reveal with pre-computed line wrapping', component: TypewriterDemo },
      { id: 'text-morphing', title: 'Text Morphing', api: 'useTextMorphing()', desc: '"Thinking..." → response transition', component: TextMorphingDemo },
      { id: 'text-clock', title: 'Text Clock', api: 'prepare() + layout()', desc: 'Real-time clock with remeasurement every tick', component: TextClockDemo },
      { id: 'text-path', title: 'Text Path', api: 'measureNaturalWidth() per character', desc: 'Characters flowing along a sine wave', component: TextPathDemo },
    ],
  },
  {
    title: 'Advanced Layout',
    data: [
      { id: 'editorial', title: 'Editorial Engine', api: 'layoutNextLine() + prepareWithSegments()', desc: 'Text reflows around draggable obstacles', component: EditorialEngineDemo },
      { id: 'umbrella', title: 'Umbrella Reflow', api: 'layoutColumn() + RectObstacle', desc: 'Drag the umbrella — text reflows in pure arithmetic', component: UmbrellaReflowDemo },
      { id: 'justification', title: 'Justification Comparison', api: 'layoutWithLines()', desc: 'Left-aligned vs justified — same prepare()', component: JustificationComparisonDemo },
      { id: 'i18n', title: 'Multilingual Feed', api: 'prepare() + layout()', desc: 'CJK, Arabic, Georgian, Thai — no locale hacks', component: I18nDemo },
    ],
  },
  {
    title: 'Interactive / Games',
    data: [
      { id: 'breakout', title: 'Breakout Text', api: 'measureNaturalWidth()', desc: 'Drag paddle, break every word at 60fps', component: BreakoutTextDemo },
      { id: 'physics-todo', title: 'Physics Todo', api: 'measureNaturalWidth()', desc: 'Bouncing items — real text widths drive collision', component: PhysicsTodoDemo },
      { id: 'pinch-zoom', title: 'Pinch to Zoom', api: 'usePinchToZoomText()', desc: 'Per-frame fontSize scaling at 0.0002ms', component: PinchToZoomDemo },
      { id: 'ascii-art', title: 'ASCII Art', api: 'prepareWithSegments() + layoutWithLines()', desc: 'Character-level width measurement', component: AsciiArtDemo },
    ],
  },
]

const allDemos = sections.flatMap(s => s.data)

export default function DemosScreen() {
  const [activeDemo, setActiveDemo] = useState<string | null>(null)
  const navigation = useNavigation()
  const params = useLocalSearchParams<{ open?: string }>()

  // Handle deep link from Home tab featured cards
  useEffect(() => {
    if (params.open && !activeDemo) {
      setActiveDemo(params.open)
    }
  }, [params.open])

  useLayoutEffect(() => {
    if (activeDemo) {
      const demo = allDemos.find(d => d.id === activeDemo)
      navigation.setOptions({
        headerTitle: demo?.title ?? 'Demo',
        headerLeft: () => (
          <Pressable onPress={() => setActiveDemo(null)} style={{ paddingLeft: 16 }}>
            <Text style={{ fontSize: 16, color: '#2563eb' }}>← Demos</Text>
          </Pressable>
        ),
      })
    } else {
      navigation.setOptions({
        headerTitle: 'Demos',
        headerLeft: undefined,
      })
    }
  }, [activeDemo, navigation])

  if (activeDemo) {
    const demo = allDemos.find(d => d.id === activeDemo)
    if (demo) {
      const DemoComponent = demo.component
      return (
        <View style={styles.demoContainer}>
          <DemoComponent />
        </View>
      )
    }
  }

  return (
    <SectionList
      style={styles.container}
      contentContainerStyle={styles.list}
      sections={sections}
      keyExtractor={item => item.id}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionTitle}>{section.title}</Text>
      )}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => setActiveDemo(item.id)}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardApi}>{item.api}</Text>
          <Text style={styles.cardDesc}>{item.desc}</Text>
        </Pressable>
      )}
    />
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  demoContainer: { flex: 1 },
  list: { padding: 16, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 13, fontWeight: '800', color: '#666',
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginTop: 20, marginBottom: 8, paddingHorizontal: 4,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#eee',
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  cardApi: { fontSize: 11, color: '#2563eb', marginTop: 3, fontFamily: 'Menlo' },
  cardDesc: { fontSize: 13, color: '#666', marginTop: 4, lineHeight: 18 },
})
