// The full board's rank watermarks (e3-t14): which drawing of rankArt.svg each cell gets, by the
// `art` boardFull.ts gives it, and how big. The simple board's hats (C5), with three more drawn for
// the full edition: a peer's hat over a patent of nobility, a gateway for retirement, the frontier
// for exile. A static file the browser fetches after the first paint, never part of the JS.
import type { FullArt, FullCell } from '../../../../shared/games/promotion/boardFull.ts'
import { knobOf } from '../../../../shared/games/promotion/departments.ts'
import sprite from '../rankArt.svg?no-inline'

/** The full edition's hat button: the simple board's colours, its ranks one lower (boardFull.ts) */
export const fullKnob = (rank: number) => (rank >= 7 && rank <= 24 ? knobOf(rank - 1) : null)

/** The drawing of rankArt.svg for a cell: the retirements get the gateway drawn square */
export const artSymbol = (art: FullArt): string => (art === 'gate' ? 'arch' : art)
export const fullArtHref = (art: FullArt): string => `${sprite}#${artSymbol(art)}`

/** How much of a cell the drawing takes: under half for a commoner, all of it at the top */
export function fullArtSize(cell: FullCell): number {
  if (cell.art === 'peer') return 0.95
  if (cell.kind === 'end') return 0.92
  return 0.45 + 0.5 * Math.min(1, cell.rank / 24)
}

