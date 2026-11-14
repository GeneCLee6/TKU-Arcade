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
