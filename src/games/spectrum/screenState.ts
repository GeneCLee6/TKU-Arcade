// What the screen makes of a view: who you are this round and what to tell you. Kept apart from the
// looks so that it can be tested without a browser. It only reads `view`: the rules are the server's.
import type { SeatId } from '../../../shared/games/types.ts'
import type { SpectrumAnswererView, SpectrumView } from '../../../shared/games/spectrum/types.ts'
import type { TextKey } from '../../i18n/t.ts'

export type SpectrumRole = 'guesser' | 'answerer' | 'spectator'

export function roleOf(view: SpectrumView): SpectrumRole {
  if (view.you === null) return 'spectator'
  if (view.you === view.guesser) return 'guesser'
  return view.answerers.some((answerer) => answerer.seat === view.you) ? 'answerer' : 'spectator'
}

/** Your own line in this round's answers, if you answer this round */
export const ownAnswer = (view: SpectrumView): SpectrumAnswererView | null =>
  view.answerers.find((answerer) => answerer.seat === view.you) ?? null

/** The answers the guesser picks from: sent, and not out */
export const inTheGuess = (view: SpectrumView): SpectrumAnswererView[] =>
  view.answerers.filter((answerer) => answerer.status === 'answered' && answerer.text !== null)

/** Which end a secret number leans to, for the line under it */
export function leaning(number: number): 'low' | 'middle' | 'high' {
  if (number <= 4) return 'low'
  if (number >= 7) return 'high'
  return 'middle'
}

/** The dock's main line: what you should be doing now */
export function promptKey(view: SpectrumView): { key: TextKey; withGuesser: boolean } {
  const role = roleOf(view)
  const plain = (key: TextKey) => ({ key, withGuesser: false })
  if (view.phase === 'over') return plain('games.spectrum.ui.prompt.over')
  if (view.phase === 'reveal') return plain('games.spectrum.ui.prompt.reveal')
  if (view.phase === 'answering') {
    if (role === 'guesser') return plain('games.spectrum.ui.prompt.guesserWait')
    if (role === 'spectator') return plain('games.spectrum.ui.prompt.watchAnswers')
    const own = ownAnswer(view)
    if (own?.status === 'out') return plain('games.spectrum.ui.prompt.out')
    return plain(
      own?.status === 'answered' ? 'games.spectrum.ui.prompt.sent' : 'games.spectrum.ui.prompt.answer',
    )
  }
  if (role === 'guesser') {
    return plain(
      view.mode === 'order'
        ? 'games.spectrum.ui.prompt.guessOrder'
        : 'games.spectrum.ui.prompt.guessExtremes',
    )
  }
  return { key: 'games.spectrum.ui.prompt.watchGuess', withGuesser: true }
}

/** What each seat gained this round, for the scoreboard; empty before the reveal */
export function gains(view: SpectrumView): Map<SeatId, number> {
  const out = new Map<SeatId, number>()
  if (!view.reveal) return out
  view.players.forEach((player, index) => {
    const points = view.reveal?.points[index] ?? 0
    if (points > 0) out.set(player.seat, points)
  })
  return out
}

/** The scoreboard's order: most points first, then seat order */
export const byScore = (view: SpectrumView) =>
  [...view.players].sort((a, b) => b.score - a.score || a.seat - b.seat)

export type GuessPicks = { max: SeatId | null; min: SeatId | null }

/**
 * The guesser's picks after choosing `seat` for `end`: a second press takes it back, and an answer
 * cannot be the largest and the smallest at once, so choosing it for one end clears it from the other.
 */
export function pick(picks: GuessPicks, end: 'max' | 'min', seat: SeatId): GuessPicks {
  const other = end === 'max' ? 'min' : 'max'
  const next = { ...picks, [end]: picks[end] === seat ? null : seat }
  if (next[other] === seat) next[other] = null
  return next
}
