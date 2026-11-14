// 搭橋 (working title Word Bridge; owner's request 2026-11-14). 25 words on a 5×5 grid.
//
// Team game (4–10): two partnerships, North–South and East–West, each with a clue-giver who sees
// the secret key: 9 words for the side that starts, 8 for the other, 7 bystanders, 1 trap that loses
// at once. The giver types one word and a number; partners pick up to number + 1 words. Their own
// word lets them go on; a bystander or the other side's word ends the turn; the trap loses.
//
// Co-op (2–3, or chosen): a two-sided key. Each key holder sees their own side: 9 words to find, 3
// traps. They take turns giving clues; the others pick, judged by the giver's side, until a miss.
// 15 words to find in all within the clue limit; after it, a last stand without clues.
//
// docs/PRD/e20-word-bridge.md has the rules and every detail decided here.
import { WB_WORDS } from './bank.ts'
import { clueProblem, tidyClue } from './clue.ts'
import { WB_TEAMS_FROM, wordBridgeInfo } from './info.ts'
import { gameError, type GameError, type GameModule, type GameResult, type Rng, type SeatId } from '../types.ts'
import { overlaps } from '../wordFold.ts'
import type {
  WbAction,
  WbCard,
  WbDuoCard,
  WbDuoState,
  WbDuoView,
  WbOptions,
  WbState,
  WbTeam,
  WbTeamsState,
  WbTeamsView,
  WbView,
} from './types.ts'

export const GRID_SIZE = 25
/** The team game's key: the starting side's words, the other side's, bystanders, the trap */
export const STARTING_WORDS = 9
export const SECOND_WORDS = 8
export const BYSTANDERS = 7
/** The co-op key: 15 to find, each side 9 targets and 3 traps */
export const DUO_TARGETS = 15
export const MIN_TEAM = 2

/** What `legalActions` lists for a clue: the browser asks for the real one */
export const SAMPLE_CLUES: readonly string[] = ['kiwi', 'oasis', 'zebra', 'quartz']

const ERROR = {
  badAction: 'games.word-bridge.error.badAction',
  over: 'games.word-bridge.error.over',
  notAPlayer: 'games.word-bridge.error.notAPlayer',
  systemOnly: 'games.word-bridge.error.systemOnly',
  notSetup: 'games.word-bridge.error.notSetup',
  wrongMode: 'games.word-bridge.error.wrongMode',
  sameTeam: 'games.word-bridge.error.sameTeam',
  alreadyGiver: 'games.word-bridge.error.alreadyGiver',
  sameSide: 'games.word-bridge.error.sameSide',
  teamsShort: 'games.word-bridge.error.teamsShort',
  notClue: 'games.word-bridge.error.notClue',
  notGiver: 'games.word-bridge.error.notGiver',
  notGuess: 'games.word-bridge.error.notGuess',
  notPicker: 'games.word-bridge.error.notPicker',
  badIndex: 'games.word-bridge.error.badIndex',
  taken: 'games.word-bridge.error.taken',
  noPickYet: 'games.word-bridge.error.noPickYet',
  nothingToSkip: 'games.word-bridge.error.nothingToSkip',
} as const

const TEAMS: readonly WbTeam[] = ['ns', 'ew']
const other = (team: WbTeam): WbTeam => (team === 'ns' ? 'ew' : 'ns')

const isSeat = (value: unknown): value is SeatId => Number.isInteger(value)

/** `action` comes off the network: its static type promises nothing at run time */
function parseAction(action: unknown): WbAction | null {
  if (typeof action !== 'object' || action === null) return null
  const { type, team, side, text, count, index, seat } = action as Record<string, unknown>
  if (type === 'give' || type === 'shuffle' || type === 'begin' || type === 'stop' || type === 'timeUp') {
    return { type }
  }
  if (type === 'join' && (team === 'ns' || team === 'ew')) return { type, team }
  if (type === 'hold' && (side === 0 || side === 1)) return { type, side }
  if (type === 'clue' && typeof text === 'string' && typeof count === 'number') return { type, text, count }
  if (type === 'pick' && Number.isInteger(index)) return { type, index: index as number }
  if (type === 'skip' && isSeat(seat)) return { type, seat }
  return null
}

/** 25 words from the bank, no one of which holds another ("雞" never beside "火雞") */
export function dealWords(rng: Rng): string[] {
  const picked: string[] = []
  for (const [, word] of rng.shuffle(WB_WORDS)) {
    if (picked.length === GRID_SIZE) break
    if (picked.some((other) => overlaps(other, word))) continue
    picked.push(word)
  }
  return picked
}

const filled = <T>(value: T): T[] => Array.from({ length: GRID_SIZE }, () => value)

// ── The team game ────────────────────────────────────────────────────────────────────────────

/** Seats alternate between the partnerships; each one's first is its giver */
function seatTeams(players: readonly SeatId[]): Pick<WbTeamsState, 'teams' | 'givers'> {
  const ns = players.filter((_, index) => index % 2 === 0)
  const ew = players.filter((_, index) => index % 2 === 1)
  return { teams: { ns, ew }, givers: { ns: ns[0] ?? null, ew: ew[0] ?? null } }
}

const teamOf = (state: Pick<WbTeamsState, 'teams'>, seat: SeatId): WbTeam | null =>
  state.teams.ns.includes(seat) ? 'ns' : state.teams.ew.includes(seat) ? 'ew' : null

export function teamsReady(state: Pick<WbTeamsState, 'teams' | 'givers'>): boolean {
  return TEAMS.every((team) => {
    const giver = state.givers[team]
    return state.teams[team].length >= MIN_TEAM && giver !== null && state.teams[team].includes(giver)
  })
}

/** The key: 9 for the starting side, 8 for the other, 7 bystanders and the trap, shuffled */
export function dealKey(starting: WbTeam, rng: Rng): WbCard[] {
  const cards: WbCard[] = [
    ...Array<WbCard>(STARTING_WORDS).fill(starting),
    ...Array<WbCard>(SECOND_WORDS).fill(other(starting)),
    ...Array<WbCard>(BYSTANDERS).fill('neutral'),
    'mine',
  ]
  return rng.shuffle(cards)
}

const teamLeft = (state: WbTeamsState, team: WbTeam): number =>
  state.key.filter((card, index) => card === team && !state.revealed[index]).length

function endTeamsTurn(state: WbTeamsState): WbTeamsState {
  return { ...state, phase: 'clue', active: other(state.active), clue: null, picks: 0, turn: state.turn + 1 }
}

function setupTeams(state: WbTeamsState, action: WbAction, actor: SeatId, rng: Rng): WbTeamsState | GameError {
  switch (action.type) {
    case 'join': {
      const from = teamOf(state, actor)
      if (from === action.team) return gameError(ERROR.sameTeam)
      const teams = {
        ...state.teams,
        [action.team]: [...state.teams[action.team], actor].sort((a, b) => a - b),
      } as Record<WbTeam, SeatId[]>
      if (from !== null) teams[from] = state.teams[from].filter((seat) => seat !== actor)
      const givers = { ...state.givers }
      if (from !== null && givers[from] === actor) givers[from] = teams[from][0] ?? null
      if (givers[action.team] === null) givers[action.team] = actor
      return { ...state, teams, givers }
    }
    case 'give': {
      const team = teamOf(state, actor)
      if (team === null) return gameError(ERROR.notAPlayer)
      if (state.givers[team] === actor) return gameError(ERROR.alreadyGiver)
      return { ...state, givers: { ...state.givers, [team]: actor } }
    }
    case 'shuffle': {
      const mixed = rng.shuffle(state.players)
      const { teams, givers } = seatTeams(mixed)
      return {
        ...state,
        teams: { ns: [...teams.ns].sort((a, b) => a - b), ew: [...teams.ew].sort((a, b) => a - b) },
        givers,
      }
    }
    case 'begin': {
      if (!teamsReady(state)) return gameError(ERROR.teamsShort)
      const starting: WbTeam = rng.int(2) === 0 ? 'ns' : 'ew'
      return {
        ...state,
        phase: 'clue',
        words: dealWords(rng),
        key: dealKey(starting, rng),
        revealed: filled(false),
        starting,
        active: starting,
        turn: 1,
      }
    }
    default:
      return gameError(ERROR.wrongMode)
  }
}

function pickTeams(state: WbTeamsState, index: number, actor: SeatId): WbTeamsState {
  const card = state.key[index]
  const revealed = state.revealed.map((shown, at) => shown || at === index)
  const log = [...state.log, { kind: 'pick' as const, seat: actor, index, card }]
  const next: WbTeamsState = { ...state, revealed, log, picks: state.picks + 1 }
  if (card === 'mine') {
    return { ...next, phase: 'over', winner: other(state.active), ending: { reason: 'mine', seat: actor } }
  }
  if (card !== 'neutral' && teamLeft(next, card) === 0) {
    return { ...next, phase: 'over', winner: card, ending: { reason: 'allFound', seat: actor } }
  }
  if (card !== state.active) return endTeamsTurn(next)
  const allowed = state.clue === null || state.clue.count === 0 ? GRID_SIZE : state.clue.count + 1
  return next.picks >= allowed ? endTeamsTurn(next) : next
}

const pickersOf = (state: WbTeamsState): SeatId[] =>
  state.teams[state.active].filter((seat) => seat !== state.givers[state.active])

// ── Co-op ────────────────────────────────────────────────────────────────────────────────────

/**
 * The two-sided key, as [side 0, side 1] for each word: 3 targets on both sides, 5 on each side
 * alone with a bystander behind, 1 on each side with the other's trap behind, 1 trap on both, 1 trap
 * on each side with a bystander behind, and 7 bystanders on both. 15 targets, 9 and 3 traps a side
 */
const DUO_LAYOUT: readonly (readonly [WbDuoCard, WbDuoCard, number])[] = [
  ['target', 'target', 3],
  ['target', 'neutral', 5],
  ['neutral', 'target', 5],
  ['target', 'mine', 1],
  ['mine', 'target', 1],
  ['mine', 'mine', 1],
  ['mine', 'neutral', 1],
  ['neutral', 'mine', 1],
  ['neutral', 'neutral', 7],
]

export function dealDuoKeys(rng: Rng): [WbDuoCard[], WbDuoCard[]] {
  const pairs = rng.shuffle(
    DUO_LAYOUT.flatMap(([a, b, times]) => Array.from({ length: times }, () => [a, b] as const)),
  )
  return [pairs.map(([a]) => a), pairs.map(([, b]) => b)]
}

/** Targets on `side` not yet found: the words that side's clues still have to bridge to */
export const duoLeftFor = (state: Pick<WbDuoState, 'keys' | 'found'>, side: 0 | 1): number =>
  state.keys[side].filter((card, index) => card === 'target' && !state.found[index]).length

const duoFound = (state: Pick<WbDuoState, 'found'>): number => state.found.filter(Boolean).length

function startDuo(state: WbDuoState, rng: Rng): WbDuoState {
  return {
    ...state,
    phase: 'clue',
    words: dealWords(rng),
    keys: dealDuoKeys(rng),
    found: filled(false),
    misses: [filled(false), filled(false)],
    giverSide: rng.int(2) === 0 ? 0 : 1,
    turn: 1,
  }
}

function endDuoTurn(state: WbDuoState): WbDuoState {
  const turnsLeft = state.turnsLeft - 1
  const base = { ...state, clue: null, picks: 0, turn: state.turn + 1, turnsLeft }
  if (turnsLeft <= 0) return { ...base, phase: 'final', log: [...state.log, { kind: 'final' }] }
  const next: 0 | 1 = state.giverSide === 0 ? 1 : 0
  // A side with nothing left to clue hands the turn back
  return { ...base, phase: 'clue', giverSide: duoLeftFor(state, next) > 0 ? next : state.giverSide }
}

const duoGiver = (state: WbDuoState): SeatId => state.holders[state.giverSide]

const duoSideOf = (state: Pick<WbDuoState, 'holders'>, seat: SeatId): 0 | 1 | null =>
  state.holders[0] === seat ? 0 : state.holders[1] === seat ? 1 : null

/** Whether `seat` may pick word `index` now, in a clue's picks or the last stand */
function duoCanPick(state: WbDuoState, seat: SeatId, index: number): boolean {
  if (state.found[index]) return false
  if (state.phase === 'guess') return seat !== duoGiver(state) && !state.misses[state.giverSide][index]
  if (state.phase !== 'final') return false
  const side = duoSideOf(state, seat)
  if (side === null) return false
  const partner: 0 | 1 = side === 0 ? 1 : 0
  return duoLeftFor(state, partner) > 0 && !state.misses[partner][index]
}

function pickDuo(state: WbDuoState, index: number, actor: SeatId): WbDuoState {
  // In a clue's picks the giver's side judges; in the last stand, the picker's partner's side
  const side: 0 | 1 =
    state.phase === 'guess' ? state.giverSide : duoSideOf(state, actor) === 0 ? 1 : 0
  const card = state.keys[side][index]
  const log = [...state.log, { kind: 'pick' as const, seat: actor, index, card }]
  if (card === 'target') {
    const found = state.found.map((done, at) => done || at === index)
    const next = { ...state, found, log, picks: state.picks + 1 }
    if (duoFound(next) >= DUO_TARGETS) {
      return { ...next, phase: 'over', won: true, ending: { reason: 'allFound', seat: actor } }
    }
    return next
  }
  if (card === 'mine' || state.phase === 'final') {
    const reason = card === 'mine' ? 'mine' : 'finalMiss'
    return { ...state, log, phase: 'over', won: false, ending: { reason, seat: actor } }
  }
  const misses: [boolean[], boolean[]] = [
    side === 0 ? state.misses[0].map((miss, at) => miss || at === index) : state.misses[0],
    side === 1 ? state.misses[1].map((miss, at) => miss || at === index) : state.misses[1],
  ]
  return endDuoTurn({ ...state, log, misses })
}

// ── Both ─────────────────────────────────────────────────────────────────────────────────────

/** Words still face down: what a clue may not hold */
export const openWords = (state: WbState): string[] =>
  state.words.filter((_, index) => !(state.mode === 'teams' ? state.revealed[index] : state.found[index]))

const giverNow = (state: WbState): SeatId | null =>
  state.mode === 'teams' ? state.givers[state.active] : duoGiver(state)

const pickersNow = (state: WbState): SeatId[] =>
  state.mode === 'teams' ? pickersOf(state) : state.players.filter((seat) => seat !== duoGiver(state))

const endTurn = (state: WbState): WbState =>
  state.mode === 'teams' ? endTeamsTurn(state) : endDuoTurn(state)

const logEnd = (state: WbState, reason: 'stop' | 'time' | 'skipped'): WbState =>
  endTurn({ ...state, log: [...state.log, { kind: 'end', reason }] } as WbState)

/** Whether `seat` may pick word `index` now */
function canPick(state: WbState, seat: SeatId, index: number): boolean {
  if (index < 0 || index >= state.words.length) return false
  if (state.mode === 'duo') return duoCanPick(state, seat, index)
  return state.phase === 'guess' && pickersOf(state).includes(seat) && !state.revealed[index]
}

/** What the room does for a seat whose player is gone */
function skip(state: WbState, seat: SeatId): WbState | null {
  if (state.phase === 'clue') return seat === giverNow(state) ? logEnd(state, 'skipped') : null
  if (state.phase === 'guess') return pickersNow(state).includes(seat) ? logEnd(state, 'skipped') : null
  if (state.phase === 'final' && state.mode === 'duo' && duoSideOf(state, seat) !== null) {
    return { ...state, phase: 'over', won: false, ending: { reason: 'skipped', seat } }
  }
  return null
}

/** The co-op mode for 2–3 players, or whenever chosen; the team game needs four */
export const modeFor = (players: number, choice: WbOptions['mode']): 'teams' | 'duo' =>
  players < WB_TEAMS_FROM || choice === 'duo' ? 'duo' : 'teams'

export const wordBridge: GameModule<WbState, WbAction, WbView, WbOptions> = {
  ...wordBridgeInfo,

  init(seats, options, rng) {
    const players = seats.map((seat) => seat.id)
    const base = {
      phase: 'setup' as const,
      players,
      clockMs: options.clock * 60_000,
      words: [],
      turn: 0,
      clue: null,
      picks: 0,
      log: [],
      ending: null,
    }
    if (modeFor(players.length, options.mode) === 'teams') {
      return {
        ...base,
        mode: 'teams',
        ...seatTeams(players),
        starting: 'ns',
        active: 'ns',
        key: [],
        revealed: [],
        winner: null,
      }
    }
    const duo: WbDuoState = {
      ...base,
      mode: 'duo',
      holders: [players[0], players[1]],
      keys: [[], []],
      found: [],
      misses: [[], []],
      giverSide: 0,
      turnsLeft: options.turns,
      totalTurns: options.turns,
      won: false,
    }
    // Two players: nothing to set up
    return players.length === 2 ? startDuo(duo, rng) : duo
  },

  reduce(state, rawAction, actor, rng) {
    const action = parseAction(rawAction)
    if (action === null) return gameError(ERROR.badAction)
    if (state.phase === 'over') return gameError(ERROR.over)

    if (action.type === 'skip' || action.type === 'timeUp') {
      if (actor !== 'system') return gameError(ERROR.systemOnly)
      if (action.type === 'skip') {
        if (!state.players.includes(action.seat)) return gameError(ERROR.notAPlayer)
        return skip(state, action.seat) ?? gameError(ERROR.nothingToSkip)
      }
      if (state.clockMs === 0 || (state.phase !== 'clue' && state.phase !== 'guess')) {
        return gameError(ERROR.nothingToSkip)
      }
      return logEnd(state, 'time')
    }

    if (actor === 'system') return gameError(ERROR.badAction)
    if (!state.players.includes(actor)) return gameError(ERROR.notAPlayer)

    switch (action.type) {
      case 'join':
      case 'give':
      case 'shuffle':
      case 'hold':
      case 'begin': {
        if (state.phase !== 'setup') return gameError(ERROR.notSetup)
        if (state.mode === 'teams') return setupTeams(state, action, actor, rng)
        if (action.type === 'begin') return startDuo(state, rng)
        if (action.type !== 'hold') return gameError(ERROR.wrongMode)
        if (state.holders[action.side] === actor) return gameError(ERROR.sameSide)
        const holders: [SeatId, SeatId] = [...state.holders]
        const was = duoSideOf(state, actor)
        if (was !== null) holders[was] = state.holders[action.side]
        holders[action.side] = actor
        return { ...state, holders }
      }
      case 'clue': {
        if (state.phase !== 'clue') return gameError(ERROR.notClue)
        if (actor !== giverNow(state)) return gameError(ERROR.notGiver)
        const text = tidyClue(action.text)
        const problem = clueProblem(text, action.count, openWords(state))
        if (problem !== null) return gameError(problem.key, problem.params)
        const clue = { text, count: action.count }
        const log = [...state.log, { kind: 'clue' as const, seat: actor, ...clue }]
        return { ...state, phase: 'guess', clue, picks: 0, log }
      }
      case 'pick': {
        if (state.phase !== 'guess' && state.phase !== 'final') return gameError(ERROR.notGuess)
        if (action.index < 0 || action.index >= state.words.length) return gameError(ERROR.badIndex)
        if (!canPick(state, actor, action.index)) {
          const mine = state.phase === 'guess' && pickersNow(state).includes(actor)
          return gameError(mine ? ERROR.taken : ERROR.notPicker)
        }
        return state.mode === 'teams' ? pickTeams(state, action.index, actor) : pickDuo(state, action.index, actor)
      }
      case 'stop': {
        if (state.phase !== 'guess') return gameError(ERROR.notGuess)
        if (!pickersNow(state).includes(actor)) return gameError(ERROR.notPicker)
        if (state.picks === 0) return gameError(ERROR.noPickYet)
        return logEnd(state, 'stop')
      }
    }
  },

  // The only place the key is cut: rule 4 of types.ts
  view(state, viewer): WbView {
    const seat = viewer !== 'spectator' && state.players.includes(viewer) ? viewer : null
    const over = state.phase === 'over'
    if (state.mode === 'teams') {
      const { key, ...open } = state
      const yourTeam = seat === null ? null : teamOf(state, seat)
      const giver = seat !== null && yourTeam !== null && state.givers[yourTeam] === seat
      const all = over || (giver && state.phase !== 'setup')
      const view: WbTeamsView = {
        ...open,
        you: seat,
        role: seat === null ? 'spectator' : giver ? 'giver' : 'picker',
        yourTeam,
        key: key.map((card, index) => (all || state.revealed[index] ? card : null)),
        left: { ns: teamLeft(state, 'ns'), ew: teamLeft(state, 'ew') },
      }
      return view
    }
    const { keys, ...open } = state
    const yourSide = seat === null ? null : duoSideOf(state, seat)
    const side = (at: 0 | 1) => keys[at].map((card) => (over || yourSide === at ? card : null))
    const view: WbDuoView = {
      ...open,
      you: seat,
      yourSide,
      keys: [side(0), side(1)],
      left: state.phase === 'setup' ? DUO_TARGETS : DUO_TARGETS - duoFound(state),
    }
    return view
  },

  legalActions(state, seat) {
    if (!state.players.includes(seat)) return []
    switch (state.phase) {
      case 'setup': {
        if (state.mode === 'duo') {
          const holds = ([0, 1] as const)
            .filter((side) => state.holders[side] !== seat)
            .map((side): WbAction => ({ type: 'hold', side }))
          return [...holds, { type: 'begin' }]
        }
        const team = teamOf(state, seat)
        const actions: WbAction[] = TEAMS.filter((other) => other !== team).map((other) => ({
          type: 'join',
          team: other,
        }))
        if (team !== null && state.givers[team] !== seat) actions.push({ type: 'give' })
        actions.push({ type: 'shuffle' })
        if (teamsReady(state)) actions.push({ type: 'begin' })
        return actions
      }
      case 'clue': {
        if (seat !== giverNow(state)) return []
        const open = openWords(state)
        return SAMPLE_CLUES.filter((text) => clueProblem(text, 1, open) === null)
          .slice(0, 2)
          .flatMap((text): WbAction[] => [
            { type: 'clue', text, count: 1 },
            { type: 'clue', text, count: 2 },
          ])
      }
      case 'guess':
      case 'final': {
        const picks: WbAction[] = state.words
          .map((_, index) => index)
          .filter((index) => canPick(state, seat, index))
          .map((index) => ({ type: 'pick', index }))
        if (state.phase === 'guess' && state.picks > 0 && pickersNow(state).includes(seat)) {
          picks.push({ type: 'stop' })
        }
        return picks
      }
      default:
        return []
    }
  },

  // The giver while a clue is due; the pickers while they pick; in the last stand, each key holder
  skipAction(state, seat) {
    return skip(state, seat) === null ? null : { type: 'skip', seat }
  },

  // The turn in the id: every clue and every round of picks gets a fresh clock
  timers(state) {
    if (state.clockMs === 0) return []
    if (state.phase === 'clue') return [{ id: `clue-${state.turn}`, ms: state.clockMs, action: { type: 'timeUp' } }]
    if (state.phase === 'guess') return [{ id: `guess-${state.turn}`, ms: state.clockMs, action: { type: 'timeUp' } }]
    return []
  },

  isOver(state) {
    return state.phase === 'over'
  },

  result(state): GameResult {
    if (state.mode === 'teams') {
      const winner = state.winner ?? 'ns'
      const loser = other(winner)
      const found = (team: WbTeam) => state.key.filter((card, index) => card === team && state.revealed[index]).length
      const rankOf = (seat: SeatId) => (teamOf(state, seat) === winner ? 1 : 2)
      return {
        summary: {
          key: `games.word-bridge.result.${winner}.${state.ending?.reason === 'mine' ? 'mine' : 'allFound'}`,
        },
        standings: [...state.players]
          .sort((a, b) => rankOf(a) - rankOf(b) || a - b)
          .map((seat) => {
            const team = teamOf(state, seat) ?? loser
            return {
              seat,
              rank: rankOf(seat),
              score: found(team),
              note: {
                key: state.givers[team] === seat ? `games.word-bridge.note.${team}.giver` : `games.word-bridge.note.${team}`,
              },
            }
          }),
      }
    }
    const found = duoFound(state)
    return {
      summary: {
        key: state.won ? 'games.word-bridge.result.duo.won' : `games.word-bridge.result.duo.${state.ending?.reason ?? 'mine'}`,
        params: { found, total: DUO_TARGETS, turns: state.totalTurns - Math.max(0, state.turnsLeft) },
      },
      standings: state.players.map((seat) => ({
        seat,
        rank: 1,
        score: found,
        note: {
          key: duoSideOf(state, seat) === null ? 'games.word-bridge.note.duo.picker' : 'games.word-bridge.note.duo.holder',
        },
      })),
    }
  },
}
