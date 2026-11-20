// 2026-11-20 (§4.43): the confetti's pieces (Confetti.tsx draws them), apart so that they are tested in Node
import { kartFestival } from '../../styles/kartTokens.ts'

/** How long it lasts, ms */
export const CONFETTI_MS = 3_200
const PIECES = 140
const SPARKS_PER_BURST = 36
const BURSTS = 3
export const GRAVITY = 900

export interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  spin: number
  turn: number
  size: number
  fill: string
  /** A spark of a burst (a dot that fades) rather than a strip of paper */
  spark: boolean
  /** When it starts, ms */
  at: number
}

/** The pieces for a screen `width` × `height`: paper from the top, bursts of sparks in the middle */
export function confettiPieces(width: number, height: number, random = Math.random): Piece[] {
  const fills = kartFestival.flags
  const pick = () => fills[Math.floor(random() * fills.length)] ?? fills[0]
  const pieces: Piece[] = []
  for (let i = 0; i < PIECES; i++) {
    pieces.push({
      x: random() * width,
      y: -20 - random() * height * 0.4,
      vx: (random() - 0.5) * 160,
      vy: 80 + random() * 220,
      spin: random() * Math.PI * 2,
      turn: (random() - 0.5) * 14,
      size: 6 + random() * 7,
      fill: pick(),
      spark: false,
      at: random() * 600,
    })
  }
  for (let burst = 0; burst < BURSTS; burst++) {
    const cx = width * (0.2 + 0.3 * burst + (random() - 0.5) * 0.1)
    const cy = height * (0.25 + random() * 0.15)
    const fill = pick()
    for (let i = 0; i < SPARKS_PER_BURST; i++) {
      const angle = (i / SPARKS_PER_BURST) * Math.PI * 2
      const speed = 220 + random() * 160
      pieces.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        spin: 0,
        turn: 0,
        size: 3 + random() * 2,
        fill,
        spark: true,
        at: 250 + burst * 550,
      })
    }
  }
  return pieces
}
