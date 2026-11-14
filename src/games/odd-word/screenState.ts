// What the screen makes of a view: whom to tell what, and each seat's word at the reveal. Kept apart
// from the looks so that it can be tested without a browser. It only reads `view`: the rules are
// the server's.
import type { SeatId } from '../../../shared/games/types.ts'
import type { OddWordView } from '../../../shared/games/odd-word/types.ts'
import type { TextKey } from '../../i18n/t.ts'

/** The dock's main line: what you should be doing now, and the name it needs */
export function promptOf(view: OddWordView, nameOf: (seat: SeatId) => string): { key: TextKey; name?: string } {
  const hosting = view.you !== null && view.you === view.host
  switch (view.phase) {
    case 'words':
      return hosting
        ? { key: 'games.odd-word.ui.prompt.hostWords' }
        : { key: 'games.odd-word.ui.prompt.words', name: nameOf(view.host) }
    case 'reveal':
      return hosting
        ? { key: 'games.odd-word.ui.prompt.hostReveal' }
        : { key: 'games.odd-word.ui.prompt.reveal', name: nameOf(view.host) }
    default:
      return { key: 'games.odd-word.ui.prompt.over' }
  }
}

export type RevealedWord = { seat: SeatId; word: string | null; odd: boolean; blank: boolean }

/** Every seat's word once revealed, in speaking order; empty before */
export function revealedWords(view: OddWordView): RevealedWord[] {
  const reveal = view.reveal
  if (reveal === null) return []
  return view.order.map((seat) => {
    const odd = reveal.undercover.includes(seat)
    const blank = seat === reveal.blank
    return { seat, odd, blank, word: blank ? null : odd ? reveal.pair.odd : reveal.pair.common }
  })
}

/**
 * What a button press waits on: the room's answer changes one of these (a redeal changes only
 * `redeals` for the host, whose buttons stay the same)
 */
export const answerKey = (view: OddWordView, legal: unknown): string =>
  JSON.stringify([view.phase, view.round, view.redeals, view.host, legal])
