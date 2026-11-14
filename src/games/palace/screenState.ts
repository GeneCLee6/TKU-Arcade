// What the screen makes of a view: whom to tell what, and each log line as a sentence. Kept apart from
// the looks so that it can be tested without a browser. It only reads `view`: the rules are the
// server's.
import type { SeatId } from '../../../shared/games/types.ts'
import type {
  PalaceAct,
  PalaceAction,
  PalaceLog,
  PalaceRole,
  PalaceView,
} from '../../../shared/games/palace/types.ts'
import type { TextKey } from '../../i18n/t.ts'

export type Line = { key: TextKey; params: Record<string, string | number> }

/** The one Chinese character on each role's card, the same in both languages */
export const glyphKey = (role: PalaceRole): TextKey => `games.palace.glyph.${role}`

/** The role an action claims, as the screen shows it; the server has its own copy */
export const CLAIMS: Readonly<Record<PalaceAct, PalaceRole | null>> = {
  stipend: null,
  grant: null,
  storm: null,
  levy: 'treasurer',
  arrest: 'guard',
  extort: 'eunuch',
  scheme: 'strategist',
}

export const roleKey = (role: PalaceRole): TextKey => `games.palace.role.${role}`
export const actKey = (act: PalaceAct): TextKey => `games.palace.act.${act}`

type Names = {
  name(seat: SeatId): string
  role(role: PalaceRole): string
  act(act: PalaceAct): string
}

/** The dock's main line: what you should be doing now */
export function promptOf(view: PalaceView, names: Names): Line {
  const { phase, current, you } = view
  switch (phase.kind) {
    case 'choose':
      return you === view.turn
        ? { key: 'games.palace.ui.prompt.choose', params: {} }
        : { key: 'games.palace.ui.prompt.chooseOther', params: { name: names.name(view.turn) } }
    case 'respond': {
      if (current === null) break
      const asked = you !== null && phase.eligible.includes(you)
      if (asked && phase.passed.includes(you)) return { key: 'games.palace.ui.prompt.passed', params: {} }
      if (!asked) return { key: 'games.palace.ui.prompt.waiting', params: {} }
      if (phase.window === 'challenge') {
        const claimed = CLAIMS[current.act]
        return {
          key: 'games.palace.ui.prompt.challenge',
          params: { name: names.name(current.actor), role: claimed === null ? '' : names.role(claimed) },
        }
      }
      if (phase.window === 'block') {
        return {
          key: 'games.palace.ui.prompt.block',
          params: { name: names.name(current.actor), act: names.act(current.act) },
        }
      }
      if (current.block === null) break
      return {
        key: 'games.palace.ui.prompt.challengeBlock',
        params: { name: names.name(current.block.by), role: names.role(current.block.role) },
      }
    }
    case 'lose':
      return phase.seat === you
        ? { key: 'games.palace.ui.prompt.lose', params: {} }
        : { key: 'games.palace.ui.prompt.loseOther', params: { name: names.name(phase.seat) } }
    case 'exchange':
      return current !== null && current.actor === you
        ? { key: 'games.palace.ui.prompt.exchange', params: { count: phase.keep } }
        : { key: 'games.palace.ui.prompt.exchangeOther', params: { name: names.name(view.turn) } }
    case 'over':
      return { key: 'games.palace.ui.prompt.over', params: { name: view.winner === null ? '' : names.name(view.winner) } }
  }
  return { key: 'games.palace.ui.prompt.waiting', params: {} }
}

/** One log line as a sentence */
export function logLine(entry: PalaceLog, names: Names): Line {
  switch (entry.k) {
    case 'start':
    case 'out':
    case 'exchanged':
    case 'blocked':
    case 'fizzle':
    case 'win':
      return { key: `games.palace.log.${entry.k}`, params: { name: names.name(entry.seat) } }
    case 'declare':
      return {
        key: `games.palace.log.declare.${entry.act}`,
        params: { name: names.name(entry.seat), target: entry.target === null ? '' : names.name(entry.target) },
      }
    case 'challenge':
      return {
        key: 'games.palace.log.challenge',
        params: { name: names.name(entry.by), target: names.name(entry.of), role: names.role(entry.role) },
      }
    case 'proved':
    case 'caught':
    case 'lose':
      return { key: `games.palace.log.${entry.k}`, params: { name: names.name(entry.seat), role: names.role(entry.role) } }
    case 'block':
      return { key: 'games.palace.log.block', params: { name: names.name(entry.by), role: names.role(entry.role) } }
    case 'timeout':
      return { key: 'games.palace.log.timeout', params: {} }
    case 'gain':
    case 'refund':
      return { key: `games.palace.log.${entry.k}`, params: { name: names.name(entry.seat), silver: entry.silver } }
    case 'take':
      return {
        key: 'games.palace.log.take',
        params: { name: names.name(entry.seat), target: names.name(entry.from), silver: entry.silver },
      }
  }
}

/** What a log line is about, for its colour: a claim, a fight, a loss, or plain bookkeeping */
export function logTone(entry: PalaceLog): 'claim' | 'fight' | 'loss' | 'plain' {
  switch (entry.k) {
    case 'declare':
    case 'block':
      return 'claim'
    case 'challenge':
    case 'proved':
    case 'caught':
      return 'fight'
    case 'lose':
    case 'out':
    case 'win':
      return 'loss'
    default:
      return 'plain'
  }
}

/** Whether you would be bluffing to claim `role`: you hold no such card face down */
export const isBluff = (view: PalaceView, role: PalaceRole | null): boolean =>
  role !== null && view.you !== null && !view.hand.some((card) => card.role === role)

export type ActChoice = { act: PalaceAct; targets: SeatId[]; untargeted: boolean }

/** The actions your legal list allows, each once, with the targets it allows */
export function actChoices(legal: readonly PalaceAction[]): ActChoice[] {
  const out: ActChoice[] = []
  for (const action of legal) {
    if (action.type !== 'act') continue
    let choice = out.find((one) => one.act === action.act)
    if (choice === undefined) {
      choice = { act: action.act, targets: [], untargeted: false }
      out.push(choice)
    }
    if (action.target === null) choice.untargeted = true
    else choice.targets.push(action.target)
  }
  return out
}

/** What a button press waits on: the room's answer changes one of these */
export const answerKey = (view: PalaceView, legal: unknown): string => JSON.stringify([view.step, view.phase, legal])
