// The lobby cards' pictures (e7-t12): a small original drawing for each game, in the card's hexagon,
// drawn here as SVG (no asset file: DESIGN.md §6). Its own chunk, after the first paint; until it
// comes, and for a game without a drawing, the card shows the name's first letter.
import type { ReactElement, ReactNode } from 'react'

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
  // Two face-down cards behind a seal stamped with a crown: claims at court
  palace: (
    <>
      <rect {...stroke} x="3" y="6" width="12" height="17" rx="1.5" transform="rotate(-10 9 14.5)" />
      <rect {...stroke} x="10" y="5" width="12" height="17" rx="1.5" />
      <path fill="currentColor" d="M18 27v-6l3 2.5 3-4 3 4 3-2.5v6z" />
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
