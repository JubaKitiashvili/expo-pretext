import { useState, useMemo, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, useWindowDimensions, Animated, PanResponder } from 'react-native'
import {
  prepareWithSegments,
  layoutColumn,
  type CircleObstacle,
} from 'expo-pretext'

const bodyStyle = { fontFamily: 'Georgia', fontSize: 16, lineHeight: 26 }
const LH = 26
const HEADLINE = 'THE FUTURE OF\nTEXT LAYOUT IS\nNOT CSS'

const bodyText = `he web renders text through a pipeline that was designed thirty years ago for static documents. A browser loads a font, shapes the text into glyphs, measures their combined width, determines where lines break, and positions each line vertically. Every step depends on the previous one. Every step requires the rendering engine to consult its internal layout tree — a structure so expensive to maintain that browsers guard access to it behind synchronous reflow barriers that can freeze the main thread for tens of milliseconds at a time. For a paragraph in a blog post, this pipeline is invisible. The browser loads, lays out, and paints before the reader's eye has traveled from the address bar to the first word. But the web is no longer a collection of static documents. It is a platform for applications, and those applications need to know about text in ways the original pipeline never anticipated. A messaging application needs to know the exact height of every message bubble before rendering a virtualized list. A masonry layout needs the height of every card to position them without overlap. An editorial page needs text to flow around images, advertisements, and interactive elements.`

type OrbState = {
  x: number; y: number; vx: number; vy: number
  r: number; color: [number, number, number]
}

const initOrbs = (w: number, h: number): OrbState[] => [
  { x: w * 0.45, y: h * 0.12, r: w * 0.18, vx: 0.4, vy: 0.3, color: [196, 163, 90] },
  { x: w * 0.35, y: h * 0.52, r: w * 0.13, vx: -0.3, vy: 0.4, color: [100, 130, 220] },
  { x: w * 0.7, y: h * 0.75, r: w * 0.15, vx: 0.25, vy: -0.35, color: [160, 100, 200] },
]

export function EditorialEngineDemo() {
  const { width } = useWindowDimensions()
  const stageW = width - 16
  const stageH = 700
  const pad = 16

  const [orbs, setOrbs] = useState<OrbState[]>(() => initOrbs(stageW - pad * 2, stageH - pad * 2))
  const [paused, setPaused] = useState(false)
  const dragRef = useRef<number | null>(null)
  const orbsRef = useRef(orbs)
  orbsRef.current = orbs

  const innerW = stageW - pad * 2
  const bodyTop = pad

  // Physics
  useEffect(() => {
    if (paused) return
    const bodyH = stageH - bodyTop - pad
    const iv = setInterval(() => {
      setOrbs(prev => prev.map((o, i) => {
        if (i === dragRef.current) return o
        let { x, y, vx, vy } = o
        x += vx; y += vy
        if (x - o.r < 0 || x + o.r > innerW) vx = -vx
        if (y - o.r < 0 || y + o.r > bodyH) vy = -vy
        return { ...o, vx, vy, x: Math.max(o.r, Math.min(innerW - o.r, x)), y: Math.max(o.r, Math.min(bodyH - o.r, y)) }
      }))
    }, 33)
    return () => clearInterval(iv)
  }, [paused, innerW, stageH, bodyTop])

  // Drag
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const lx = e.nativeEvent.locationX - pad
      const ly = e.nativeEvent.locationY - bodyTop
      const idx = orbsRef.current.findIndex(o => Math.hypot(lx - o.x, ly - o.y) < o.r + 15)
      if (idx >= 0) {
        dragRef.current = idx
      } else {
        dragRef.current = null
        setPaused(p => !p)
      }
    },
    onPanResponderMove: (e) => {
      if (dragRef.current === null) return
      const lx = e.nativeEvent.locationX - pad
      const ly = e.nativeEvent.locationY - bodyTop
      const bodyH = stageH - bodyTop - pad
      setOrbs(prev => prev.map((o, i) => i === dragRef.current ? {
        ...o, x: Math.max(o.r, Math.min(innerW - o.r, lx)), y: Math.max(o.r, Math.min(bodyH - o.r, ly)),
      } : o))
    },
    onPanResponderRelease: () => { dragRef.current = null },
  }), [innerW, stageH, bodyTop, pad])

  // Layout — drop cap + pullquote as rect obstacles, orbs as circle obstacles
  const DROP_CAP_W = 52
  const DROP_CAP_H = LH * 3

  // Pullquote position (right side, middle of body)
  const PQ_W = Math.floor(innerW * 0.48)
  const PQ_X = innerW - PQ_W
  const PQ_Y = LH * 9
  const PQ_H = LH * 7
  const PQ_TEXT = '\u201CThe performance improvement is not incremental \u2014 it is categorical. 0.05ms versus 30ms. Zero reflows versus five hundred.\u201D'

  const lines = useMemo(() => {
    const prepared = prepareWithSegments(bodyText, bodyStyle)
    const bodyH = stageH - bodyTop - pad
    const circleObs: CircleObstacle[] = orbs.map(o => ({
      cx: o.x, cy: o.y, r: o.r, hPad: 12, vPad: 4,
    }))
    const rectObs = [
      { x: 0, y: 0, w: DROP_CAP_W, h: DROP_CAP_H },
      { x: PQ_X - 8, y: PQ_Y - 4, w: PQ_W + 8, h: PQ_H + 8 },
    ]
    return layoutColumn(
      prepared,
      { segmentIndex: 0, graphemeIndex: 0 },
      { x: 0, y: 0, width: innerW, height: bodyH },
      LH, circleObs, rectObs,
    ).lines
  }, [orbs, innerW, stageH, bodyTop, PQ_X, PQ_Y])

  return (
    <View style={styles.outerContainer}>
      <View {...pan.panHandlers} style={[styles.stage, { width: stageW, height: stageH }]}>
        {/* Drop cap */}
        <Text style={styles.dropCap}>T</Text>

        {/* Body text lines */}
        {lines.map((s, i) => (
          <View key={i} style={{
            position: 'absolute',
            top: bodyTop + s.y,
            left: pad + s.x,
            width: s.width,
            height: LH,
            overflow: 'hidden',
          }}>
            <Text style={styles.bodyLine}>{s.text}</Text>
          </View>
        ))}

        {/* Orbs */}
        {orbs.map((o, i) => {
          const [r, g, b] = o.color
          return (
            <View key={i} pointerEvents="none" style={[styles.orbContainer, {
              position: 'absolute',
              left: pad + o.x - o.r,
              top: bodyTop + o.y - o.r,
              width: o.r * 2,
              height: o.r * 2,
              borderRadius: o.r,
            }]}>
              {/* Core */}
              <View style={[styles.orbCore, {
                width: o.r * 2,
                height: o.r * 2,
                borderRadius: o.r,
                backgroundColor: `rgba(${r},${g},${b},0.15)`,
                shadowColor: `rgb(${r},${g},${b})`,
                shadowOpacity: 0.4,
                shadowRadius: o.r * 0.8,
                shadowOffset: { width: 0, height: 0 },
              }]} />
              {/* Highlight */}
              <View style={[styles.orbHighlight, {
                width: o.r * 0.8,
                height: o.r * 0.8,
                borderRadius: o.r * 0.4,
                top: o.r * 0.2,
                left: o.r * 0.3,
                backgroundColor: `rgba(${r},${g},${b},0.25)`,
              }]} />
            </View>
          )
        })}

        {/* Pullquote */}
        <View style={{
          position: 'absolute',
          left: pad + PQ_X,
          top: bodyTop + PQ_Y,
          width: PQ_W,
          height: PQ_H,
          borderLeftWidth: 3,
          borderLeftColor: '#6b5a3d',
          paddingLeft: 14,
          justifyContent: 'center',
        }}>
          <Text style={styles.pullquote}>{PQ_TEXT}</Text>
        </View>

        {/* Hint */}
        <View style={styles.hintPill}>
          <Text style={styles.hintText}>
            Drag orbs · Tap to {paused ? 'resume' : 'pause'} · Zero DOM reads
          </Text>
        </View>
      </View>

      <Text style={styles.stats}>
        {lines.length} lines · layoutColumn() · {paused ? 'Paused' : 'Running'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1, backgroundColor: '#0a0a0c', alignItems: 'center', paddingTop: 4 },
  stage: {
    backgroundColor: '#0f0f14',
    overflow: 'hidden',
  },
  dropCap: {
    position: 'absolute', top: 18, left: 16,
    fontFamily: 'Georgia', fontWeight: '700', fontSize: 72, lineHeight: 72,
    color: '#c4a35a',
  },
  bodyLine: {
    fontFamily: 'Georgia', fontSize: 16, lineHeight: 26,
    color: '#e8e4dc',
  },
  pullquote: {
    fontFamily: 'Georgia', fontStyle: 'italic', fontSize: 17, lineHeight: 24,
    color: '#b8a070',
  },
  orbContainer: {
    position: 'absolute',
  },
  orbCore: {
    position: 'absolute',
  },
  orbHighlight: {
    position: 'absolute',
  },
  hintPill: {
    position: 'absolute', bottom: 8, alignSelf: 'center', left: '15%', right: '15%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999,
    alignItems: 'center',
  },
  hintText: { fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: 'Helvetica Neue' },
  stats: { fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginTop: 6, fontFamily: 'Menlo' },
})
