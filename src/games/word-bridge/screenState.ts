// What the screen makes of a view: whom to tell what, and how each word looks. Kept apart from the
// looks so that it can be tested without a browser. It only reads `view`: the rules are the server's.
import type { SeatId } from '../../../shared/games/types.ts'
import type { WbAction, WbCard, WbDuoCard, WbLogEntry, WbView } from '../../../shared/games/word-bridge/types.ts'
import type { TextKey } from '../../i18n/t.ts'

export type Prompt = { key: TextKey; params?: Record<string, string | number> }

/** Who gives the clue now; null in setup and at the end */
export function giverOf(view: WbView): SeatId | null {
  if (view.phase !== 'clue' && view.phase !== 'guess') return null
  return view.mode === 'teams' ? view.givers[view.active] : view.holders[view.giverSide]
}

/** The clue as the dock and the banner say it: "word · 2", or "word · any" */
export const clueCount = (count: number): Prompt =>
  count === 0 ? { key: 'games.word-bridge.ui.countAny' } : { key: 'games.word-bridge.ui.countN', params: { count } }

/** The dock's main line: what you should be doing now */
export function promptOf(view: WbView, legal: readonly WbAction[], nameOf: (seat: SeatId) => string): Prompt {
  const canPick = legal.some((action) => action.type === 'pick')
  const giver = giverOf(view)
  switch (view.phase) {
    case 'setup':
      return { key: view.mode === 'teams' ? 'games.word-bridge.ui.prompt.setupTeams' : 'games.word-bridge.ui.prompt.setupDuo' }
    case 'clue':
      if (giver === view.you) return { key: 'games.word-bridge.ui.prompt.youClue' }
      return { key: 'games.word-bridge.ui.prompt.clue', params: { name: giver === null ? '' : nameOf(giver) } }
    case 'guess': {
      const clue = view.clue?.text ?? ''
      if (canPick) return { key: 'games.word-bridge.ui.prompt.youPick', params: { clue } }
      if (giver === view.you) return { key: 'games.word-bridge.ui.prompt.yourClue', params: { clue } }
      return { key: 'games.word-bridge.ui.prompt.pick', params: { clue } }
    }
    case 'final':
      return { key: canPick ? 'games.word-bridge.ui.prompt.final' : 'games.word-bridge.ui.prompt.finalWatch' }
    default:
      return { key: 'games.word-bridge.ui.prompt.over' }
  }
}

/** How many more picks the pickers have on this clue; null for "until a miss" */
export function picksLeft(view: WbView): number | null {
  if (view.phase !== 'guess' || view.clue === null) return null
  if (view.mode === 'duo' || view.clue.count === 0) return null
  return view.clue.count + 1 - view.picks
}

/** What one word shows: its face once turned, or what your key says of it */
export type CellLook = {
  /** Turned over for everyone: what it was */
  shown: WbCard | 'found' | null
  /** Only you see this (a giver's or a key holder's key) */
  hint: WbCard | WbDuoCard | null
  /** Co-op: the sides on whose clue it was a bystander */
  missed: (0 | 1)[]
}

const worstOf = (a: WbDuoCard | null, b: WbDuoCard | null): WbDuoCard | null => {
  if (a === 'mine' || b === 'mine') return 'mine'
  if (a === 'target' || b === 'target') return 'target'
  return a ?? b
}

export function cellLooks(view: WbView): CellLook[] {
  if (view.mode === 'teams') {
    return view.words.map((_, index) => {
      const card = view.key[index] ?? null
      const shown = view.revealed[index] ? card : null
      return { shown, hint: shown === null ? card : null, missed: [] }
    })
  }
  const side = view.yourSide
  const over = view.phase === 'over'
  return view.words.map((_, index) => {
    const found = view.found[index]
    const missed = ([0, 1] as const).filter((at) => view.misses[at][index])
    const own = side === null ? null : view.keys[side][index]
    // At the end both sides are open: a word still down shows the worst it was to either side
    const either = over ? worstOf(view.keys[0][index], view.keys[1][index]) : null
    return { shown: found ? 'found' : null, hint: found ? null : (own ?? either), missed }
  })
}

/**
 * What a button press waits on: the room's answer changes one of these
 */
export const answerKey = (view: WbView, legal: unknown): string =>
  JSON.stringify([view.phase, view.turn, view.picks, view.log.length, legal])

type ClueEntry = Extract<WbLogEntry, { kind: 'clue' }>
type PickEntry = Extract<WbLogEntry, { kind: 'pick' }>
export type Turn = { clue: ClueEntry | null; picks: PickEntry[] }

/** The log, as one line per clue with the words picked on it; the last stand's picks on a line of their own */
export function turnsOf(log: readonly WbLogEntry[]): Turn[] {
  const turns: Turn[] = []
  for (const entry of log) {
    if (entry.kind === 'clue') turns.push({ clue: entry, picks: [] })
    else if (entry.kind === 'final') turns.push({ clue: null, picks: [] })
    else if (entry.kind === 'pick') turns.at(-1)?.picks.push(entry)
  }
  return turns
}
