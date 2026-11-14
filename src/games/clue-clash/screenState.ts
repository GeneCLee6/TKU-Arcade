// What the screen makes of a view: whom to tell what. Kept apart from the looks so that it can be
// tested without a browser. It only reads `view`: the rules are the server's.
import type { CcAction, CcView } from '../../../shared/games/clue-clash/types.ts'
import type { SeatId } from '../../../shared/games/types.ts'
import type { TextKey } from '../../i18n/t.ts'

export type Prompt = { key: TextKey; params?: Record<string, string | number> }

const has = (legal: readonly CcAction[], type: CcAction['type']) => legal.some((action) => action.type === type)

/** The dock's main line: what you should be doing now */
export function promptOf(view: CcView, legal: readonly CcAction[], nameOf: (seat: SeatId) => string): Prompt {
  const name = nameOf(view.guesser)
  switch (view.phase) {
    case 'clues':
      if (view.role === 'guesser') return { key: 'games.clue-clash.ui.prompt.guesserWait' }
      if (view.role === 'spectator') return { key: 'games.clue-clash.ui.prompt.watchClues', params: { name } }
      return {
        key: view.clues.some((clue) => clue.seat === view.you && clue.status === 'thinking')
          ? 'games.clue-clash.ui.prompt.clues'
          : 'games.clue-clash.ui.prompt.cluesSent',
        params: { name },
      }
    case 'review':
      if (has(legal, 'ready')) return { key: 'games.clue-clash.ui.prompt.review' }
      if (view.role === 'giver') return { key: 'games.clue-clash.ui.prompt.reviewDone' }
      return { key: 'games.clue-clash.ui.prompt.reviewWait' }
    case 'guess':
      if (view.role === 'guesser') return { key: 'games.clue-clash.ui.prompt.guess' }
      return { key: 'games.clue-clash.ui.prompt.guessWait', params: { name } }
    case 'reveal':
      if (has(legal, 'next')) return { key: 'games.clue-clash.ui.prompt.reveal' }
      return { key: 'games.clue-clash.ui.prompt.revealWait', params: { name } }
    default:
      return { key: 'games.clue-clash.ui.prompt.over' }
  }
}

/** What the guess came to, as the reveal shows it */
export function verdictOf(view: CcView): 'right' | 'wrong' | 'pass' | null {
  const guess = view.guess
  if (guess === null) return null
  if (guess.kind !== 'guess') return 'pass'
  return guess.correct || view.accepted ? 'right' : 'wrong'
}

/** What a button press waits on: the room's answer changes one of these */
export const answerKey = (view: CcView, legal: unknown): string =>
  JSON.stringify([view.phase, view.cardsUsed, view.redrawn, view.accepted, view.ready, legal])
