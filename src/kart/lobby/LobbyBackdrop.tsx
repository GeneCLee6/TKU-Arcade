// 2026-11-21 (owner: "and a background picture"): behind the race room's waiting room, a picture
// made here from the room's track: its sky (the same light the race is drawn in, kartThemes), the
// sun or the moon, stars at night and clouds by day, hills and a skyline whose shapes come from the
// track's id (so each track has its own, and the same one every time), and the track itself, seen
// from above, glowing across the foot of it. Our own drawing, SVG, no file to fetch; it changes
// when the host picks another track. Decoration only: hidden from screen readers.
import { memo, useMemo } from 'react'
import type { RoadPoint, TrackThemeName } from '../../../shared/kart/track.ts'
import { kartLobby, kartThemes } from '../../styles/kartTokens.ts'

export interface LobbyBackdropProps {
  /** The track's id (custom tracks: their code): the seed of the skyline */
  seed: string
  theme: TrackThemeName
  /** The track's centre line, once it has loaded */
  road?: readonly RoadPoint[]
}

const WIDTH = 1600
const HEIGHT = 900
const HORIZON = 560

/** A small, steady random from a string: the same track, the same picture */
function randomFrom(seed: string): () => number {
  let state = 2166136261
  for (let index = 0; index < seed.length; index++) {
    state = Math.imul(state ^ seed.charCodeAt(index), 16777619)
  }
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507)
    state = Math.imul(state ^ (state >>> 13), 3266489909)
    state ^= state >>> 16
    return (state >>> 0) / 2 ** 32
  }
}

const round = (value: number) => Math.round(value * 10) / 10

/** The track seen from above, fitted into a box at the foot of the picture */
function outlineOf(road: readonly RoadPoint[]): string {
  if (road.length < 3) return ''
  const xs = road.map((point) => point.x)
  const zs = road.map((point) => point.z)
  const minX = Math.min(...xs)
  const minZ = Math.min(...zs)
  const spanX = Math.max(1, Math.max(...xs) - minX)
  const spanZ = Math.max(1, Math.max(...zs) - minZ)
  const box = { x: 260, y: 600, width: 1080, height: 260 }
  const scale = Math.min(box.width / spanX, box.height / spanZ)
  const left = box.x + (box.width - spanX * scale) / 2
  const top = box.y + (box.height - spanZ * scale) / 2
  return `M${road
    .map((point) => `${round(left + (point.x - minX) * scale)} ${round(top + (point.z - minZ) * scale)}`)
    .join('L')}Z`
}

export const LobbyBackdrop = memo(function LobbyBackdrop({ seed, theme, road }: LobbyBackdropProps) {
  const sky = kartThemes[theme]
  const night = theme === 'night'
  const picture = useMemo(() => {
    const random = randomFrom(`${seed}:${theme}`)
    // Far hills: a ridge of soft bumps
    let hills = `M0 ${HORIZON}`
    for (let x = 0; x <= WIDTH; x += 80) {
      hills += ` Q${x + 40} ${round(HORIZON - 40 - random() * 90)} ${x + 80} ${round(HORIZON - 20 - random() * 40)}`
    }
    hills += ` L${WIDTH} ${HEIGHT} L0 ${HEIGHT}Z`
    // The skyline: blocks of every height, a few with a mast
    const blocks: { x: number; width: number; height: number; windows: { x: number; y: number }[] }[] = []
    for (let x = -20; x < WIDTH; ) {
      const width = 40 + Math.floor(random() * 70)
      const height = 40 + Math.floor(random() * random() * 210)
      const windows: { x: number; y: number }[] = []
      for (let row = HORIZON + 20 - height; row < HORIZON - 10; row += 18) {
        for (let column = x + 8; column < x + width - 10; column += 14) {
          if (random() < (night ? 0.35 : 0.08)) windows.push({ x: column, y: row })
        }
      }
      blocks.push({ x, width, height, windows })
      x += width + Math.floor(random() * 26)
    }
    const stars = night
      ? Array.from({ length: 90 }, () => ({
          x: round(random() * WIDTH),
          y: round(random() * (HORIZON - 160)),
          r: round(0.8 + random() * 1.8),
          o: round(0.35 + random() * 0.6),
        }))
      : []
    const clouds = night
      ? []
      : Array.from({ length: 5 }, () => ({
          x: round(random() * WIDTH),
          y: round(80 + random() * 260),
          w: round(120 + random() * 220),
        }))
    const sun = { x: round(WIDTH * (0.18 + random() * 0.64)), y: round(theme === 'sunset' ? HORIZON - 70 : 150 + random() * 80) }
    return { hills, blocks, stars, clouds, sun }
  }, [seed, theme, night])
  const outline = useMemo(() => (road ? outlineOf(road) : ''), [road])
  const ground = night ? kartLobby.skylineNight : kartLobby.skylineDay
  const id = `lobby-${theme}`

  return (
    <>
      {/* Below the picture the ground goes on, as far as the waiting room does */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: ground }} />
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      data-testid="kart-lobby-backdrop"
      data-theme={theme}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 'min(100%, 860px)' }}
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky.skyTop} />
          <stop offset="0.45" stopColor={sky.skyMiddle} />
          <stop offset="0.66" stopColor={sky.skyHorizon} />
          <stop offset="1" stopColor={sky.fog} />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor={sky.sunGlow ?? sky.sun} stopOpacity="0.85" />
          <stop offset="1" stopColor={sky.sunGlow ?? sky.sun} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={WIDTH} height={HEIGHT} fill={`url(#${id}-sky)`} />
      {picture.stars.map((star, index) => (
        <circle key={index} cx={star.x} cy={star.y} r={star.r} fill={kartLobby.star} opacity={star.o} />
      ))}
      <circle cx={picture.sun.x} cy={picture.sun.y} r={night ? 160 : 230} fill={`url(#${id}-glow)`} />
      {(sky.sunDisc || night) && (
        <circle cx={picture.sun.x} cy={picture.sun.y} r={night ? 38 : 62} fill={sky.sunDisc ?? sky.sun} />
      )}
      {picture.clouds.map((cloud, index) => (
        <ellipse
          key={index}
          cx={cloud.x}
          cy={cloud.y}
          rx={cloud.w}
          ry={cloud.w * 0.16}
          fill={kartLobby.cloud}
          opacity={0.32}
        />
      ))}
      <path d={picture.hills} fill={night ? kartLobby.hillsNight : kartLobby.hillsDay} opacity={0.75} />
      {picture.blocks.map((block, index) => (
        <g key={index}>
          <rect x={block.x} y={HORIZON - block.height} width={block.width} height={block.height + 20} fill={ground} />
          {block.windows.map((window, at) => (
            <rect key={at} x={window.x} y={window.y} width={6} height={8} fill={kartLobby.windowLit} opacity={0.8} />
          ))}
        </g>
      ))}
      <rect y={HORIZON + 18} width={WIDTH} height={HEIGHT - HORIZON} fill={ground} />
      {outline && (
        <g data-testid="kart-lobby-outline">
          <path d={outline} fill="none" stroke={sky.skyHorizon} strokeWidth={18} strokeOpacity={0.18} strokeLinejoin="round" />
          <path d={outline} fill="none" stroke={kartLobby.trackGlow} strokeWidth={3} strokeOpacity={0.55} strokeLinejoin="round" />
        </g>
      )}
    </svg>
    </>
  )
})
