// The lobby cards' pictures (e7-t12): a small original drawing for each game, drawn here as SVG (no
// asset file: DESIGN.md §6). Its own chunk, after the first paint; until it comes, and for a game
// without a drawing, the card shows the name's first letter. Since 2026-11-23 the same chunk draws
// each card's broadcast cover (GameCover) and the lobby hero's arena (HeroArena) from them.
import type { ReactElement, ReactNode } from 'react'
import styled, { keyframes } from 'styled-components'
import { color, font, gameHue } from '../styles/tokens.ts'

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const ART: Record<string, ReactElement> = {
  // Steps up to a star: rising through the ranks
  promotion: (
    <>
      <path {...stroke} d="M4 27h7v-6h7v-6h7V9" />
      <path
        fill="currentColor"
        d="M25 2.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z"
      />
    </>
  ),
  // Three cards fanned out, face down
  'silent-table': (
    <>
      <rect
        {...stroke}
        x="5"
        y="9"
        width="11"
        height="16"
        rx="1.5"
        transform="rotate(-16 10.5 17)"
      />
      <rect {...stroke} x="11" y="7" width="11" height="16" rx="1.5" />
      <rect
        {...stroke}
        x="16"
        y="9"
        width="11"
        height="16"
        rx="1.5"
        transform="rotate(16 21.5 17)"
      />
    </>
  ),
  // A dial from one end to the other, its needle somewhere between
  spectrum: (
    <>
      <path {...stroke} d="M4 24a12 12 0 0 1 24 0" />
      <path {...stroke} d="M16 24l6-9" />
      <circle fill="currentColor" cx="16" cy="24" r="2.4" />
      <path {...stroke} d="M7 17l2 1.5M25 17l-2 1.5M16 10v2.5" />
    </>
  ),
  // Two speech bubbles: one tells the truth
  bluff: (
    <>
      <path {...stroke} d="M3 6h15v10H9l-4 4v-4H3z" />
      <path {...stroke} d="M14 13h15v10h-2v4l-4-4h-9z" />
      <path {...stroke} d="M7 10h7M18 18h7" />
    </>
  ),
  // Three palace lanterns rising along a line, the highest one lit
  lantern: (
    <>
      <path {...stroke} d="M2 29L30 13" />
      <ellipse {...stroke} cx="6" cy="21" rx="3.2" ry="4" />
      <path {...stroke} d="M4.5 16.5h3M4.5 25.5h3" />
      <ellipse {...stroke} cx="15" cy="15.5" rx="3.6" ry="4.5" />
      <path {...stroke} d="M13.3 10.5h3.4M13.3 20.5h3.4" />
      <ellipse fill="currentColor" cx="25" cy="9" rx="4" ry="5" />
      <path {...stroke} d="M23 3h4M23 15h4" />
    </>
  ),
  // Three tiles in a run and a fourth on its way: a set being built
  tiles: (
    <>
      <rect {...stroke} x="2.5" y="9" width="8" height="11" rx="1.5" />
      <rect {...stroke} x="12" y="9" width="8" height="11" rx="1.5" />
      <rect {...stroke} x="21.5" y="9" width="8" height="11" rx="1.5" />
      <rect fill="currentColor" x="12" y="22.5" width="8" height="7" rx="1.5" />
      <path {...stroke} d="M5 14.5h3M14.5 14.5h3M24 14.5h3" />
    </>
  ),
  // Two face-down cards behind a seal stamped with a crown: claims at court
  palace: (
    <>
      <rect {...stroke} x="3" y="6" width="12" height="17" rx="1.5" transform="rotate(-10 9 14.5)" />
      <rect {...stroke} x="10" y="5" width="12" height="17" rx="1.5" />
      <path fill="currentColor" d="M18 27v-6l3 2.5 3-4 3 4 3-2.5v6z" />
    </>
  ),
  // Two cards held up beside a stack of chips: a hand of hold'em
  holdem: (
    <>
      <rect {...stroke} x="3" y="7" width="11" height="16" rx="1.5" transform="rotate(-12 8.5 15)" />
      <rect {...stroke} x="9" y="5" width="11" height="16" rx="1.5" />
      <ellipse {...stroke} cx="24" cy="25" rx="5" ry="2" />
      <path {...stroke} d="M19 25v-3.5M29 25v-3.5" />
      <ellipse {...stroke} cx="24" cy="21.5" rx="5" ry="2" />
    </>
  ),
  // Four word cards, one turned a different way: the odd one out
  'odd-word': (
    <>
      <rect {...stroke} x="3" y="5" width="11" height="9" rx="1.5" />
      <rect {...stroke} x="18" y="5" width="11" height="9" rx="1.5" />
      <rect {...stroke} x="3" y="18" width="11" height="9" rx="1.5" />
      <rect
        fill="currentColor"
        x="18"
        y="18"
        width="11"
        height="9"
        rx="1.5"
        transform="rotate(14 23.5 22.5)"
      />
    </>
  ),
  // A rising meter of four bars, the last one a question: how bad is this one?
  misery: (
    <>
      <path {...stroke} d="M4 28h24" />
      <rect fill="currentColor" x="5" y="22" width="4" height="4" />
      <rect fill="currentColor" x="11" y="17" width="4" height="9" />
      <rect fill="currentColor" x="17" y="11" width="4" height="15" />
      <path {...stroke} d="M23 8.5a2.6 2.6 0 1 1 3.4 2.5c-.9.4-1.4 1-1.4 2v1.5M25 19v.4" />
    </>
  ),
  // A row of word tiles with an arch over it: a clue bridging two words
  'word-bridge': (
    <>
      <path {...stroke} d="M5 17c3-9 19-9 22 0" />
      <path {...stroke} d="M10 13.5v3.5M16 11v6M22 13.5v3.5" />
      <rect fill="currentColor" x="3" y="20" width="7" height="7" rx="1.2" />
      <rect {...stroke} x="12.5" y="20" width="7" height="7" rx="1.2" />
      <rect fill="currentColor" x="22" y="20" width="7" height="7" rx="1.2" />
    </>
  ),
  // Two clue cards tilted into each other, a burst where they clash, and a question mark below
  'clue-clash': (
    <>
      <rect {...stroke} x="2.5" y="5" width="10" height="13" rx="1.5" transform="rotate(-14 7.5 11.5)" />
      <rect {...stroke} x="19.5" y="5" width="10" height="13" rx="1.5" transform="rotate(14 24.5 11.5)" />
      <path {...stroke} d="M16 3v3M12.5 4.5l1.5 2.2M19.5 4.5L18 6.7" />
      <path {...stroke} d="M13 23a3 3 0 1 1 4.2 2.7c-.8.4-1.2 1-1.2 1.8" />
      <circle fill="currentColor" cx="16" cy="30" r="1.2" />
    </>
  ),
  // Two diamond kites on one line, the higher one filled: a kite train
  kite: (
    <>
      <path {...stroke} d="M3 29q6-4 9-10t9-10" />
      <path fill="currentColor" d="M23 2l6 6-6 9-6-9z" />
      <path {...stroke} d="M12 11l5 5-5 7-5-7z" />
    </>
  ),
  // A stack of goods tokens beside a card with a sail on it: trading from the harbour
  traders: (
    <>
      <ellipse {...stroke} cx="9" cy="24" rx="6" ry="2.5" />
      <path {...stroke} d="M3 24v-3M15 24v-3" />
      <ellipse {...stroke} cx="9" cy="21" rx="6" ry="2.5" />
      <path {...stroke} d="M3 21v-3M15 21v-3" />
      <ellipse fill="currentColor" cx="9" cy="18" rx="6" ry="2.5" />
      <rect {...stroke} x="18" y="4" width="11" height="15" rx="1.5" />
      <path fill="currentColor" d="M23.5 7v8h-3.5zM24.5 8.5l3 6.5h-3z" />
    </>
  ),
  // A rolled scroll with its cord: the prize of the round
  'secret-scroll': (
    <>
      <rect {...stroke} x="8" y="6" width="16" height="20" />
      <path {...stroke} d="M5 6h22M5 26h22M12 12h8M12 16h8M12 20h5" />
      <circle fill="currentColor" cx="24" cy="20" r="3" />
    </>
  ),
  // A low wedge of a kart, two wheels and speed lines behind it (2026-11-23)
  kart: (
    <>
      <path {...stroke} d="M9 21l3-6h9l7 4v2z" />
      <path {...stroke} d="M15 15l2-4h3" />
      <circle {...stroke} cx="12" cy="23" r="2.6" />
      <circle {...stroke} cx="24" cy="23" r="2.6" />
      <path {...stroke} d="M2 14h6M3 18h4M1 22h4" />
    </>
  ),
  // A dumpling over a steamer's rim
  wasabi: (
    <>
      <path {...stroke} d="M4 20 Q16 2 28 20 Z" />
      <path {...stroke} d="M11 13l1.5 3M16 10v4M21 13l-1.5 3" />
      <path {...stroke} d="M3 24h26M6 28h20" />
    </>
  ),
}

/** The drawing for `gameId`; `fallback` for a game without one */
export default function GameArt({ gameId, fallback }: { gameId: string; fallback: ReactNode }) {
  const art = ART[gameId]
  if (!art) return fallback
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">
      {art}
    </svg>
  )
}

/** A small number from a game's id, the same every time: where its cover's bars fall */
function seedOf(id: string): number {
  let hash = 2166136261
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return hash >>> 0
}

const HEX = 'M-20 0 L-10 -17.3 L10 -17.3 L20 0 L10 17.3 L-10 17.3 Z'

/**
 * A lobby card's cover (2026-11-23): made from the game's id, in its hue (`currentColor`, which the
 * card sets to its accent). A floor of grid lines, slanted bars placed by the id, the game's drawing
 * large in a hexagon with a glow, and its number in the list. Only for the eye
 */
export function GameCover({ gameId, index }: { gameId: string; index: number }) {
  const seed = seedOf(gameId)
  const bars = [0, 1, 2, 3].map((i) => {
    const bits = (seed >>> (i * 7)) & 127
    return { x: 8 + ((bits * 37) % 150), w: 10 + (bits % 4) * 9, o: 0.12 + (bits % 3) * 0.08 }
  })
  const art = ART[gameId]
  return (
    <svg
      viewBox="0 0 320 120"
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="320" height="120" fill="currentColor" opacity="0.1" />
      {/* The floor: lines running off to a point above the drawing */}
      <g stroke="currentColor" strokeWidth="1" opacity="0.22">
        {[-160, -80, 0, 80, 160, 240, 320, 400, 480].map((x) => (
          <line key={x} x1={x} y1="120" x2="240" y2="10" />
        ))}
        {[70, 88, 104, 118].map((y) => (
          <line key={y} x1="0" y1={y} x2="320" y2={y} />
        ))}
      </g>
      {bars.map((bar, i) => (
        <path
          key={i}
          d={`M${bar.x + 30} 0h${bar.w}l-30 120h-${bar.w}z`}
          fill="currentColor"
          opacity={bar.o}
        />
      ))}
      <path d="M150 120l26-120h4l-26 120z" style={{ fill: color.magenta }} opacity="0.55" />
      <g transform="translate(244 58) scale(2.3)">
        <path d={HEX} fill="currentColor" opacity="0.16" />
        <path d={HEX} fill="none" stroke="currentColor" strokeWidth="1" opacity="0.7" />
      </g>
      {art && <g transform="translate(212 26) scale(2)">{art}</g>}
      <text
        x="14"
        y="104"
        fill="currentColor"
        opacity="0.55"
        fontSize="40"
        fontWeight="900"
        fontStyle="italic"
        style={{ fontFamily: font.display }}
      >
        {String(index + 1).padStart(2, '0')}
      </text>
    </svg>
  )
}

const HERO_GAMES = ['promotion', 'silent-table', 'spectrum', 'holdem', 'lantern', 'tiles'] as const

// Honeycomb places, around the middle one
const HERO_SPOTS = [
  [170, 70],
  [254, 118],
  [86, 118],
  [254, 214],
  [86, 214],
  [170, 262],
] as const

const drift = keyframes`
  50% {
    transform: translateY(-6px);
  }
`

const Floating = styled.g`
  animation: ${drift} 6s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const sweep = keyframes`
  0%, 70% {
    transform: translateX(-200px);
  }

  100% {
    transform: translateX(560px);
  }
`

const Sweep = styled.rect`
  animation: ${sweep} 7s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    display: none;
  }
`

/**
 * The lobby hero's picture on a wide screen (2026-11-23): an arena of the games' emblems, each in its
 * hue, round a hexagon with the site's glyph, over a grid floor in a cut-corner frame. Only for the eye
 */
export function HeroArena({ glyph }: { glyph: string }) {
  return (
    <svg viewBox="0 0 340 340" width="100%" height="100%" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="hero-frame">
          <path d="M24 0H340V300L300 340H0V24Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#hero-frame)">
        <rect width="340" height="340" style={{ fill: color.brand }} opacity="0.06" />
        <g style={{ stroke: color.brand }} strokeWidth="1" opacity="0.25">
          {[-170, -85, 0, 85, 170, 255, 340, 425, 510].map((x) => (
            <line key={x} x1={x} y1="340" x2="170" y2="150" />
          ))}
          {[250, 280, 304, 324].map((y) => (
            <line key={y} x1="0" y1={y} x2="340" y2={y} />
          ))}
        </g>
        <Sweep x="0" y="0" width="60" height="340" transform="skewX(-14)" style={{ fill: color.brand }} opacity="0.08" />
      </g>
      <path
        d="M24 0H340V300L300 340H0V24Z"
        fill="none"
        style={{ stroke: color.brand }}
        strokeWidth="1.5"
        opacity="0.6"
      />
      <path d="M0 24L24 0h60l-6 6H26L6 26v50l-6 6z" style={{ fill: color.magenta }} />
      <path d="M340 300l-40 40h-70l6-6h62l36-36v-60l6-6z" style={{ fill: color.brand }} />
      {HERO_SPOTS.map(([x, y], i) => {
        const id = HERO_GAMES[i]
        return (
          <Floating key={id} style={{ animationDelay: `${-i}s` }}>
            <g transform={`translate(${x} ${y}) scale(2)`}>
              <path d={HEX} style={{ fill: gameHue(id) }} />
            </g>
            <g transform={`translate(${x - 22} ${y - 22}) scale(1.375)`} style={{ color: color.onAccent }}>
              {ART[id]}
            </g>
          </Floating>
        )
      })}
      <g transform="translate(170 166) scale(2.6)">
        <path d={HEX} style={{ fill: color.surface, stroke: color.magenta }} strokeWidth="1.2" />
      </g>
      <text
        x="170"
        y="186"
        textAnchor="middle"
        fontSize="54"
        fontWeight="900"
        style={{ fill: color.text, fontFamily: font.displayZh }}
      >
        {glyph}
      </text>
    </svg>
  )
}
