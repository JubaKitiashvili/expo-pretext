// PRETEXT BREAKER — arcade-style breakout game where bricks are words.
// Inspired by the pretextjs.dev Pretext Breaker demo.
// Each brick's width = natural width of its word at the game font (measureNaturalWidth).
// Polished UI matching the PinchToZoom design language.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { View, Text, StyleSheet, useWindowDimensions, PanResponder, Pressable } from 'react-native'
import {
  prepareWithSegments,
  measureNaturalWidth,
  layoutColumn,
  type CircleObstacle,
  type RectObstacle,
} from 'expo-pretext'

const BRICK_STYLE = { fontFamily: 'Menlo', fontSize: 13, lineHeight: 20 }
const PROSE_STYLE = { fontFamily: 'Menlo', fontSize: 10, lineHeight: 14 }
const PROSE_LH = 14

// Meaningful sentence — each word becomes a brick
const SENTENCE = 'PRETEXT TURNS MOTION INTO LANGUAGE AND LETS EVERY MEASURED WORD SWING INTO PLACE WHILE YOU BREAK THE APART'
const WORDS = SENTENCE.split(' ')

// Arcade palette — cycles per brick
const BRICK_COLORS = [
  '#e0893e', // orange
  '#d9a441', // yellow
  '#9c6eba', // purple
  '#4a9e5d', // green
  '#3d8bbf', // cyan
  '#c44e5a', // red
]

// Background prose text — reflows around the ball and bricks via layoutColumn().
// This is the core dogfood of expo-pretext: obstacle layout at 60fps with a
// moving circular obstacle (the ball) carving a hole in real text.
const BG_PROSE = `The layout engine measures every segment once then lays out lines in pure arithmetic no reflows no DOM reads no thrashing The ball is a cursor the bricks are words and the words are geometry When a word breaks its measured width returns to the pool When the paddle catches a power word the rules shift for a moment slow motion multi ball wider guard The sentence at the top of the arena describes a philosophy once you measure the text with the same engine that renders it you stop fighting the browser and start choreographing it Pretext prepares once and layouts many times The native TextKit measurement is pixel accurate The JavaScript line break algorithm runs in microseconds The ball traces a path through words and prose and the text simply flows around it `.repeat(4)

const CONTAINER_PADDING = 16
const ARENA_PAD = 12

type Brick = {
  id: number
  text: string
  x: number
  y: number
  w: number
  h: number
  color: string
  alive: boolean
  // Physics: when the ball hits a brick it enters "falling" state — it
  // detaches from the grid and becomes a rigid body with gravity, bouncing
  // off walls and the paddle just like the ball. Still acts as a text obstacle.
  falling: boolean
  vx: number
  vy: number
}

type Ball = { x: number; y: number; vx: number; vy: number; r: number }

// Physics constants
const GRAVITY = 0.35
const BRICK_BOUNCE_DAMPING = 0.72
const BRICK_FRICTION = 0.985

export function BreakoutTextDemo() {
  const { width } = useWindowDimensions()
  const stageW = width - CONTAINER_PADDING * 2
  const arenaH = 420
  const BRICK_H = 26
  const BRICK_V_GAP = 4
  const BRICK_H_GAP = 6

  // Prepare the background prose once — it gets re-laid-out every frame as
  // the ball moves. This is the whole point of the demo.
  const preparedProse = useMemo(() => prepareWithSegments(BG_PROSE, PROSE_STYLE), [])

  // Build bricks once per width
  const initialBricks = useMemo<Brick[]>(() => {
    const list: Brick[] = []
    const widths = WORDS.map(w => {
      const prepared = prepareWithSegments(w, BRICK_STYLE)
      return measureNaturalWidth(prepared) + 18 // padding inside the brick
    })

    let x = ARENA_PAD
    let y = ARENA_PAD
    for (let i = 0; i < WORDS.length; i++) {
      const w = widths[i]!
      if (x + w > stageW - ARENA_PAD) {
        x = ARENA_PAD
        y += BRICK_H + BRICK_V_GAP
      }
      list.push({
        id: i,
        text: WORDS[i]!,
        x, y, w, h: BRICK_H,
        color: BRICK_COLORS[i % BRICK_COLORS.length]!,
        alive: true,
        falling: false,
        vx: 0,
        vy: 0,
      })
      x += w + BRICK_H_GAP
    }
    return list
  }, [stageW])

  const [bricks, setBricks] = useState<Brick[]>(initialBricks)
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [level] = useState(1)
  const [gameState, setGameState] = useState<'running' | 'gameover' | 'won'>('running')

  // Paddle & ball use arena-local coordinates (0..stageW horizontally, 0..arenaH vertically)
  const [paddle, setPaddle] = useState({ x: stageW / 2 - 50, y: arenaH - 22, w: 100, h: 10 })
  const paddleRef = useRef(paddle)
  paddleRef.current = paddle

  const [ball, setBall] = useState<Ball>({ x: stageW / 2, y: arenaH - 60, vx: 2.6, vy: -2.6, r: 6 })

  const [powerLabel, setPowerLabel] = useState<string | null>(null)
  const powerExpiresRef = useRef(0)

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      // Use absolute pageX to avoid locationX oscillating between nested hit targets
      // (bricks, ball, paddle). Subtract the arena's left offset (container padding).
      const lx = e.nativeEvent.pageX - CONTAINER_PADDING
      setPaddle(p => ({ ...p, x: Math.max(ARENA_PAD, Math.min(stageW - p.w - ARENA_PAD, lx - p.w / 2)) }))
    },
    onPanResponderMove: (_e, gestureState) => {
      const lx = gestureState.moveX - CONTAINER_PADDING
      setPaddle(p => ({ ...p, x: Math.max(ARENA_PAD, Math.min(stageW - p.w - ARENA_PAD, lx - p.w / 2)) }))
    },
    onPanResponderTerminationRequest: () => false,
  }), [stageW])

  useEffect(() => {
    if (gameState !== 'running') return
    const timer = setInterval(() => {
      if (powerExpiresRef.current && Date.now() > powerExpiresRef.current) {
        powerExpiresRef.current = 0
        setPowerLabel(null)
      }

      // Update falling bricks (gravity + wall/paddle bounces + off-screen cleanup)
      setBricks(prev => {
        let anyChanged = false
        const next: Brick[] = []
        for (const br of prev) {
          if (!br.falling) {
            next.push(br)
            continue
          }
          let { x, y, vx, vy } = br
          vy += GRAVITY
          vx *= BRICK_FRICTION
          x += vx
          y += vy

          // Wall bounces
          if (x < ARENA_PAD) {
            x = ARENA_PAD
            vx = -vx * BRICK_BOUNCE_DAMPING
          }
          if (x + br.w > stageW - ARENA_PAD) {
            x = stageW - ARENA_PAD - br.w
            vx = -vx * BRICK_BOUNCE_DAMPING
          }

          // Paddle collision (rect-vs-rect overlap on paddle top edge)
          const pd = paddleRef.current
          if (
            y + br.h >= pd.y && y + br.h <= pd.y + pd.h + 8 &&
            x + br.w > pd.x && x < pd.x + pd.w &&
            vy > 0
          ) {
            y = pd.y - br.h
            vy = -Math.abs(vy) * BRICK_BOUNCE_DAMPING
            // Horizontal kick from where the brick landed on the paddle
            const rel = ((x + br.w / 2) - (pd.x + pd.w / 2)) / (pd.w / 2)
            vx += rel * 2.2
          }

          // Remove when fully below arena floor
          if (y > arenaH + 40) {
            anyChanged = true
            continue
          }

          anyChanged = true
          next.push({ ...br, x, y, vx, vy })
        }
        return anyChanged ? next : prev
      })

      setBall(b => {
        let { x, y, vx, vy, r } = b

        const slow = powerLabel === 'SLOW' ? 0.55 : 1
        x += vx * slow
        y += vy * slow

        // Wall collisions (arena bounds)
        if (x - r < ARENA_PAD) { x = ARENA_PAD + r; vx = -vx }
        if (x + r > stageW - ARENA_PAD) { x = stageW - ARENA_PAD - r; vx = -vx }
        if (y - r < ARENA_PAD) { y = ARENA_PAD + r; vy = -vy }

        // Paddle collision
        const p = paddleRef.current
        if (y + r >= p.y && y + r <= p.y + p.h + 6 && x >= p.x && x <= p.x + p.w && vy > 0) {
          vy = -Math.abs(vy)
          const rel = (x - (p.x + p.w / 2)) / (p.w / 2)
          vx = rel * 3.5
        }

        // Ball below arena → lose life
        if (y > arenaH) {
          setLives(l => {
            const next = Math.max(0, l - 1)
            if (next === 0) setGameState('gameover')
            return next
          })
          return { x: stageW / 2, y: arenaH - 60, vx: 2.6, vy: -2.6, r }
        }

        // Brick collisions — transition from alive to falling instead of destroying
        setBricks(prev => {
          let hit = false
          const next = prev.map(br => {
            if (!br.alive || br.falling) return br
            if (
              x + r >= br.x && x - r <= br.x + br.w &&
              y + r >= br.y && y - r <= br.y + br.h
            ) {
              hit = true
              vy = -vy
              if (Math.random() < 0.18) {
                const powers = ['SLOW', 'MULTI', 'EXPAND'] as const
                const power = powers[Math.floor(Math.random() * powers.length)]!
                setPowerLabel(power)
                powerExpiresRef.current = Date.now() + 5000
                if (power === 'EXPAND') {
                  setPaddle(pp => ({ ...pp, w: 160 }))
                  setTimeout(() => setPaddle(pp => ({ ...pp, w: 100 })), 5000)
                }
              }
              // Transfer some of the ball's velocity to the brick, plus an upward pop
              return {
                ...br,
                alive: false,
                falling: true,
                vx: vx * 0.4 + (Math.random() - 0.5) * 1.2,
                vy: -2.2,
              }
            }
            return br
          })
          if (hit) {
            setScore(s => s + 60 + level * 10)
            if (next.every(b => !b.alive)) setGameState('won')
          }
          return hit ? next : prev
        })

        return { x, y, vx, vy, r }
      })
    }, 16)
    return () => clearInterval(timer)
  }, [stageW, arenaH, level, powerLabel, gameState])

  const aliveCount = bricks.filter(b => b.alive).length

  // Compute background prose reflowed around the ball, live bricks, falling
  // bricks, and paddle. Runs every frame — layoutColumn() is pure arithmetic
  // at ~0.0002ms per line so this is effectively free.
  const proseLines = useMemo(() => {
    const circles: CircleObstacle[] = [
      { cx: ball.x, cy: ball.y, r: ball.r + 6, hPad: 4, vPad: 2 },
    ]
    const rects: RectObstacle[] = [
      // Every brick that is still in the arena — both alive (grid) and falling
      ...bricks
        .filter(b => b.alive || b.falling)
        .map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
      // Paddle as obstacle
      { x: paddle.x, y: paddle.y, w: paddle.w, h: paddle.h },
    ]
    return layoutColumn(
      preparedProse,
      { segmentIndex: 0, graphemeIndex: 0 },
      { x: ARENA_PAD, y: ARENA_PAD, width: stageW - ARENA_PAD * 2, height: arenaH - ARENA_PAD * 2 },
      PROSE_LH,
      circles,
      rects,
    ).lines
  }, [preparedProse, ball, bricks, paddle, stageW, arenaH])

  const reset = useCallback(() => {
    setBricks(initialBricks)
    setScore(0)
    setLives(3)
    setBall({ x: stageW / 2, y: arenaH - 60, vx: 2.6, vy: -2.6, r: 6 })
    setPaddle({ x: stageW / 2 - 50, y: arenaH - 22, w: 100, h: 10 })
    setPowerLabel(null)
    powerExpiresRef.current = 0
    setGameState('running')
  }, [initialBricks, stageW, arenaH])

  return (
    <View style={styles.container}>
      {/* Top header card */}
      <View style={styles.headerCard}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>PRETEXT BREAKER</Text>
          <View style={styles.livePill}>
            <View style={[styles.liveDot, gameState !== 'running' && styles.liveDotPaused]} />
            <Text style={styles.liveText}>
              {gameState === 'running' ? 'LIVE' : gameState === 'won' ? 'WON' : 'OVER'}
            </Text>
          </View>
        </View>

        {/* Metrics grid — matches PinchToZoom style */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>SCORE</Text>
            <Text style={styles.metricValue}>{String(score).padStart(4, '0')}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>LIVES</Text>
            <Text style={styles.metricValue}>{'♥'.repeat(lives) || '—'}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>LEVEL</Text>
            <Text style={styles.metricValue}>{String(level).padStart(2, '0')}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricCell}>
            <Text style={styles.metricLabel}>LEFT</Text>
            <Text style={styles.metricValue}>{aliveCount}</Text>
          </View>
        </View>

        <Text style={styles.instructions}>
          Drag anywhere in the arena to move the paddle. Break every word.
        </Text>
      </View>

      {/* Arena */}
      <View {...pan.panHandlers} style={[styles.arena, { width: stageW, height: arenaH }]}>
        {/* Background prose — reflows around ball + bricks + paddle via layoutColumn() */}
        {proseLines.map((line, i) => (
          <Text
            key={`${i}-${line.x}-${line.y}`}
            style={[styles.proseLine, {
              left: line.x,
              top: line.y,
              width: line.width,
            }]}
            numberOfLines={1}
          >
            {line.text}
          </Text>
        ))}

        {/* Word bricks — both alive (on grid) and falling (free bodies) */}
        {bricks.map(br => (br.alive || br.falling) && (
          <View key={br.id} style={{
            position: 'absolute',
            left: br.x,
            top: br.y,
            width: br.w,
            height: br.h,
            backgroundColor: br.color,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: br.falling ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)',
            justifyContent: 'center',
            alignItems: 'center',
            opacity: br.falling ? 0.92 : 1,
            shadowColor: br.color,
            shadowOpacity: br.falling ? 0.6 : 0,
            shadowRadius: br.falling ? 8 : 0,
            shadowOffset: { width: 0, height: 0 },
          }}>
            <Text style={styles.brickText}>{br.text}</Text>
          </View>
        ))}

        {/* Ball */}
        <View style={{
          position: 'absolute',
          left: ball.x - ball.r,
          top: ball.y - ball.r,
          width: ball.r * 2,
          height: ball.r * 2,
          borderRadius: ball.r,
          backgroundColor: '#ffe066',
          shadowColor: '#ffe066',
          shadowOpacity: 0.8,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
        }} />

        {/* Paddle */}
        <View style={{
          position: 'absolute',
          left: paddle.x,
          top: paddle.y,
          width: paddle.w,
          height: paddle.h,
          backgroundColor: '#ffd369',
          borderRadius: 4,
          shadowColor: '#ffd369',
          shadowOpacity: 0.6,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
        }} />

        {/* Power badge */}
        {powerLabel && (
          <View style={styles.powerBadge}>
            <Text style={styles.powerText}>⚡ {powerLabel}</Text>
          </View>
        )}

        {/* Game over / won overlay */}
        {gameState !== 'running' && (
          <View style={styles.overlay}>
            <Text style={styles.overlayTitle}>
              {gameState === 'won' ? '🎉 YOU WIN' : 'GAME OVER'}
            </Text>
            <Text style={styles.overlayScore}>Score {String(score).padStart(4, '0')}</Text>
            <Pressable onPress={reset} style={styles.overlayBtn}>
              <Text style={styles.overlayBtnText}>PLAY AGAIN</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Bottom action bar */}
      <View style={styles.actionBar}>
        <Text style={styles.footerText}>
          measureNaturalWidth() · brick widths = real text widths
        </Text>
        <Pressable onPress={reset} style={styles.resetBtn}>
          <Text style={styles.resetBtnText}>RESET</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0c',
    paddingHorizontal: CONTAINER_PADDING,
    paddingTop: CONTAINER_PADDING,
  },

  // Header card
  headerCard: {
    backgroundColor: '#1a1a22',
    borderWidth: 1,
    borderColor: 'rgba(255,211,105,0.18)',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#ffd369',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontFamily: 'Menlo',
    fontSize: 16,
    fontWeight: '800',
    color: '#ffd369',
    letterSpacing: 2,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(74,158,93,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(74,158,93,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4a9e5d',
  },
  liveDotPaused: {
    backgroundColor: '#c44e5a',
  },
  liveText: {
    fontFamily: 'Menlo',
    fontSize: 9,
    fontWeight: '700',
    color: '#6dd184',
    letterSpacing: 1,
  },
  metricsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f0f14',
    borderRadius: 10,
    paddingVertical: 10,
  },
  metricCell: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  metricLabel: {
    fontFamily: 'Menlo',
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    marginBottom: 4,
  },
  metricValue: {
    fontFamily: 'Menlo',
    fontSize: 17,
    fontWeight: '800',
    color: '#ffd369',
    letterSpacing: -0.3,
  },
  instructions: {
    fontFamily: 'Menlo',
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 10,
    textAlign: 'center',
  },

  // Arena
  arena: {
    backgroundColor: '#0f0f14',
    borderWidth: 1,
    borderColor: 'rgba(255,211,105,0.15)',
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 12,
    alignSelf: 'center',
  },
  proseLine: {
    position: 'absolute',
    height: PROSE_LH,
    fontFamily: 'Menlo',
    fontSize: 10,
    lineHeight: PROSE_LH,
    color: 'rgba(120, 170, 130, 0.32)',
    overflow: 'hidden',
  },
  brickText: {
    fontFamily: 'Menlo',
    fontSize: 12,
    fontWeight: '800',
    color: '#0a0a0c',
    letterSpacing: 0.5,
  },
  powerBadge: {
    position: 'absolute',
    right: 12,
    top: 10,
    backgroundColor: '#ffd369',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    shadowColor: '#ffd369',
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  powerText: {
    fontFamily: 'Menlo',
    fontSize: 10,
    fontWeight: '800',
    color: '#0a0a0c',
    letterSpacing: 0.5,
  },

  // Game over overlay
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(10,10,12,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  overlayTitle: {
    fontFamily: 'Menlo',
    fontSize: 22,
    fontWeight: '800',
    color: '#ffd369',
    letterSpacing: 2,
  },
  overlayScore: {
    fontFamily: 'Menlo',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
  },
  overlayBtn: {
    backgroundColor: '#ffd369',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    marginTop: 8,
    shadowColor: '#ffd369',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  overlayBtnText: {
    fontFamily: 'Menlo',
    fontSize: 12,
    fontWeight: '800',
    color: '#0a0a0c',
    letterSpacing: 1,
  },

  // Bottom action bar
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  footerText: {
    fontFamily: 'Menlo',
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
    flex: 1,
    letterSpacing: 0.3,
  },
  resetBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,211,105,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  resetBtnText: {
    fontFamily: 'Menlo',
    fontSize: 10,
    fontWeight: '800',
    color: '#ffd369',
    letterSpacing: 1,
  },
})
