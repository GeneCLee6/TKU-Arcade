// 朝堂暗鬥 (working title Palace Bluff; owner's request 2026-11-14). A bluffing elimination game at an
// imperial court. Everyone starts with two face-down backers from a deck of five roles × 3 and two
// silver (in a two-player game the first player starts with one). On your turn you take one action;
// an action that needs a role can be claimed by anyone, holding the role or not.
//
// A turn plays out as: the claim → a challenge window (anyone) → a block window (the target, or anyone
// for a grant) → a window to challenge the block (anyone). Every window is open to everyone who can
// answer at once and closes on the first challenge or block, when all have passed, or when its clock
// runs out (everyone left passes). Whoever loses a challenge turns a backer face up; a proven claim
// goes back into the deck and the claimant draws a new card. Lose both backers and you are out.
//
// docs/PRD/e17-palace-bluff.md has the rules and every detail decided here.
import { palaceInfo } from './info.ts'
import { gameError, type GameModule, type GameResult, type Rng, type SeatId } from '../types.ts'
import type {
  PalaceAct,
  PalaceAction,
  PalaceCard,
  PalaceLog,
  PalaceOptions,
  PalacePhase,
  PalacePlayer,
  PalaceRole,
  PalaceState,
  PalaceThen,
  PalaceView,
  PalaceWindow,
  PalaceWindowKind,
} from './types.ts'

export const ROLES: readonly PalaceRole[] = ['treasurer', 'guard', 'eunuch', 'strategist', 'dowager']
export const ACTS: readonly PalaceAct[] = ['stipend', 'grant', 'storm', 'levy', 'arrest', 'extort', 'scheme']
export const COPIES = 3
export const START_SILVER = 2
export const STORM_COST = 7
export const ARREST_COST = 3
/** From this much silver the only action is to storm */
export const MUST_STORM = 10
/** The schemer draws this many */
export const SCHEME_DRAW = 2
/** Most lines the log keeps: an hour of play is far fewer */
const LOG_LIMIT = 200

/** The role an action claims, if any */
export const ACT_ROLE: Readonly<Record<PalaceAct, PalaceRole | null>> = {
  stipend: null,
  grant: null,
  storm: null,
  levy: 'treasurer',
  arrest: 'guard',
  extort: 'eunuch',
  scheme: 'strategist',
}

/** Who may block an action, by claimed role */
export const BLOCKERS: Readonly<Record<PalaceAct, readonly PalaceRole[]>> = {
  stipend: [],
  grant: ['treasurer'],
  storm: [],
  levy: [],
  arrest: ['dowager'],
  extort: ['eunuch', 'strategist'],
  scheme: [],
}

const COST: Readonly<Record<PalaceAct, number>> = {
  stipend: 0,
  grant: 0,
  storm: STORM_COST,
  levy: 0,
  arrest: ARREST_COST,
  extort: 0,
  scheme: 0,
}

const GAIN: Readonly<Partial<Record<PalaceAct, number>>> = { stipend: 1, grant: 2, levy: 3 }
const EXTORT_TAKE = 2

const TARGETED: ReadonlySet<PalaceAct> = new Set(['storm', 'arrest', 'extort'])

const ERROR = {
  badAction: 'games.palace.error.badAction',
  over: 'games.palace.error.over',
  notAPlayer: 'games.palace.error.notAPlayer',
  systemOnly: 'games.palace.error.systemOnly',
  notYourTurn: 'games.palace.error.notYourTurn',
  notNow: 'games.palace.error.notNow',
  silver: 'games.palace.error.silver',
  mustStorm: 'games.palace.error.mustStorm',
  badTarget: 'games.palace.error.badTarget',
  notAsked: 'games.palace.error.notAsked',
  cannotBlock: 'games.palace.error.cannotBlock',
  badCard: 'games.palace.error.badCard',
  badKeep: 'games.palace.error.badKeep',
  nothingToSkip: 'games.palace.error.nothingToSkip',
} as const

const isSeat = (value: unknown): value is SeatId => Number.isInteger(value)
const isRole = (value: unknown): value is PalaceRole => ROLES.includes(value as PalaceRole)
const isAct = (value: unknown): value is PalaceAct => ACTS.includes(value as PalaceAct)

/** `action` comes off the network: its static type promises nothing at run time */
function parseAction(action: unknown): PalaceAction | null {
  if (typeof action !== 'object' || action === null) return null
  const raw = action as Record<string, unknown>
  switch (raw.type) {
    case 'act':
      if (!isAct(raw.act)) return null
      if (raw.target !== null && !isSeat(raw.target)) return null
      return { type: 'act', act: raw.act, target: raw.target }
    case 'pass':
    case 'challenge':
      return { type: raw.type }
    case 'block':
      return isRole(raw.role) ? { type: 'block', role: raw.role } : null
    case 'lose':
      return typeof raw.card === 'string' ? { type: 'lose', card: raw.card } : null
    case 'keep':
      return Array.isArray(raw.cards) && raw.cards.every((card) => typeof card === 'string')
        ? { type: 'keep', cards: raw.cards as string[] }
        : null
    case 'timeout':
      return Number.isInteger(raw.step) ? { type: 'timeout', step: raw.step as number } : null
    case 'skip':
      return isSeat(raw.seat) ? { type: 'skip', seat: raw.seat } : null
    default:
      return null
  }
}

// ── Small readers ────────────────────────────────────────────────────────────────────────────

const playerOf = (state: PalaceState, seat: SeatId): PalacePlayer | undefined =>
  state.players.find((player) => player.seat === seat)

export const isIn = (player: PalacePlayer): boolean => player.hidden.length > 0

/** Seats still in, in seat order */
export const seatsIn = (state: PalaceState): SeatId[] =>
  state.players.filter(isIn).map((player) => player.seat)

const seatIsIn = (state: PalaceState, seat: SeatId | null): boolean => {
  if (seat === null) return false
  const player = playerOf(state, seat)
  return player !== undefined && isIn(player)
}

/** The next seat still in after `seat`, in seat order */
function nextIn(state: PalaceState, seat: SeatId): SeatId {
  const index = state.players.findIndex((player) => player.seat === seat)
  for (let step = 1; step <= state.players.length; step++) {
    const player = state.players[(index + step) % state.players.length]
    if (isIn(player)) return player.seat
  }
  return seat
}

const withPlayer = (state: PalaceState, seat: SeatId, change: (player: PalacePlayer) => PalacePlayer): PalaceState => ({
  ...state,
  players: state.players.map((player) => (player.seat === seat ? change(player) : player)),
})

const logged = (state: PalaceState, ...lines: PalaceLog[]): PalaceState => ({
  ...state,
  log: [...state.log, ...lines].slice(-LOG_LIMIT),
})

const toPhase = (state: PalaceState, phase: PalacePhase): PalaceState => ({ ...state, phase, step: state.step + 1 })

// ── The turn, step by step ───────────────────────────────────────────────────────────────────

const beginTurn = (state: PalaceState, seat: SeatId): PalaceState =>
  toPhase({ ...state, turn: seat, current: null }, { kind: 'choose' })

const endTurn = (state: PalaceState): PalaceState => beginTurn(state, nextIn(state, state.turn))

/** Who may answer a window */
function eligibleFor(state: PalaceState, window: PalaceWindowKind): SeatId[] {
  const current = state.current
  if (current === null) return []
  const others = (seat: SeatId) => seatsIn(state).filter((other) => other !== seat)
  switch (window) {
    case 'challenge':
      return others(current.actor)
    case 'block':
      if (current.act === 'grant') return others(current.actor)
      return seatIsIn(state, current.target) ? [current.target as SeatId] : []
    case 'challengeBlock':
      return current.block === null ? [] : others(current.block.by)
  }
}

function openWindow(state: PalaceState, window: PalaceWindowKind): PalaceState {
  const eligible = eligibleFor(state, window)
  if (eligible.length === 0) return allPassed(state, window)
  return toPhase(state, { kind: 'respond', window, eligible, passed: [] })
}

/** Nobody answered a window */
function allPassed(state: PalaceState, window: PalaceWindowKind): PalaceState {
  switch (window) {
    case 'challenge':
      return toBlock(state)
    case 'block':
      return resolve(state)
    case 'challengeBlock':
      return endTurn(logged(state, { k: 'blocked', seat: (state.current as NonNullable<PalaceState['current']>).actor }))
  }
}

/** The claim stood: a block window if the action can be blocked, else it happens */
function toBlock(state: PalaceState): PalaceState {
  const current = state.current
  if (current === null || BLOCKERS[current.act].length === 0) return resolve(state)
  return openWindow(state, 'block')
}

/** The action happens */
function resolve(state: PalaceState): PalaceState {
  const current = state.current
  if (current === null) return endTurn(state)
  const { actor, act, target } = current
  if (TARGETED.has(act) && !seatIsIn(state, target)) return endTurn(logged(state, { k: 'fizzle', seat: actor }))
  const gain = GAIN[act]
  if (gain !== undefined) {
    const paid = withPlayer(state, actor, (player) => ({ ...player, silver: player.silver + gain }))
    return endTurn(logged(paid, { k: 'gain', seat: actor, silver: gain }))
  }
  switch (act) {
    case 'extort': {
      const from = target as SeatId
      const taken = Math.min(EXTORT_TAKE, (playerOf(state, from) as PalacePlayer).silver)
      const moved = withPlayer(
        withPlayer(state, from, (player) => ({ ...player, silver: player.silver - taken })),
        actor,
        (player) => ({ ...player, silver: player.silver + taken }),
      )
      return endTurn(logged(moved, { k: 'take', seat: actor, from, silver: taken }))
    }
    case 'storm':
    case 'arrest':
      return loseBacker(state, target as SeatId, 'end')
    case 'scheme': {
      const drawn = state.deck.slice(0, SCHEME_DRAW)
      return toPhase({ ...state, deck: state.deck.slice(SCHEME_DRAW) }, { kind: 'exchange', drawn })
    }
    default:
      return endTurn(state)
  }
}

/** `seat` must turn a backer face up: at once with one left, by their choice with two */
function loseBacker(state: PalaceState, seat: SeatId, then: PalaceThen): PalaceState {
  const player = playerOf(state, seat)
  if (player === undefined || player.hidden.length === 0) return carryOn(state, then)
  if (player.hidden.length === 1) return turnUp(state, seat, player.hidden[0].id, then)
  return toPhase(state, { kind: 'lose', seat, then })
}

/** The card goes face up; its owner may be out, and the game may be over */
function turnUp(state: PalaceState, seat: SeatId, cardId: string, then: PalaceThen): PalaceState {
  const player = playerOf(state, seat) as PalacePlayer
  const card = player.hidden.find((one) => one.id === cardId) as PalaceCard
  let next = withPlayer(state, seat, (one) => ({
    ...one,
    hidden: one.hidden.filter((other) => other.id !== cardId),
    lost: [...one.lost, card.role],
  }))
  next = logged(next, { k: 'lose', seat, role: card.role })
  if (player.hidden.length === 1) {
    next = logged({ ...next, outOrder: [...next.outOrder, seat] }, { k: 'out', seat })
    const left = seatsIn(next)
    if (left.length === 1) {
      return logged(
        { ...next, winner: left[0], current: null, phase: { kind: 'over' }, step: next.step + 1 },
        { k: 'win', seat: left[0] },
      )
    }
  }
  return carryOn(next, then)
}

function carryOn(state: PalaceState, then: PalaceThen): PalaceState {
  switch (then) {
    case 'end':
      return endTurn(state)
    case 'block':
      return toBlock(state)
    case 'resolve':
      return resolve(state)
  }
}

/** A card back into the deck and a fresh one out, after a claim is proven */
function replaceCard(state: PalaceState, seat: SeatId, cardId: string, rng: Rng): PalaceState {
  const player = playerOf(state, seat) as PalacePlayer
  const card = player.hidden.find((one) => one.id === cardId) as PalaceCard
  const deck = rng.shuffle([...state.deck, card])
  const [fresh, ...rest] = deck
  return withPlayer({ ...state, deck: rest }, seat, (one) => ({
    ...one,
    hidden: one.hidden.map((other) => (other.id === cardId ? fresh : other)),
  }))
}

/** `by` challenges the claim this window is about */
function challenge(state: PalaceState, by: SeatId, window: PalaceWindowKind, rng: Rng): PalaceState {
  const current = state.current as NonNullable<PalaceState['current']>
  const onBlock = window === 'challengeBlock'
  const claimant = onBlock ? (current.block as NonNullable<typeof current.block>).by : current.actor
  const role = onBlock ? (current.block as NonNullable<typeof current.block>).role : (ACT_ROLE[current.act] as PalaceRole)
  let next = logged(state, { k: 'challenge', by, of: claimant, role })
  const proof = (playerOf(next, claimant) as PalacePlayer).hidden.find((card) => card.role === role)

  if (proof !== undefined) {
    // True: the card is shown, shuffled back, replaced; the challenger loses a backer
    next = replaceCard(logged(next, { k: 'proved', seat: claimant, role }), claimant, proof.id, rng)
    if (onBlock) next = logged(next, { k: 'blocked', seat: current.actor })
    return loseBacker(next, by, onBlock ? 'end' : 'block')
  }

  // A bluff: the claimant loses a backer. A caught action gets its price back; a caught block lets
  // the action through
  next = logged(next, { k: 'caught', seat: claimant, role })
  if (!onBlock) {
    const cost = COST[current.act]
    if (cost > 0) {
      next = withPlayer(next, current.actor, (player) => ({ ...player, silver: player.silver + cost }))
      next = logged(next, { k: 'refund', seat: current.actor, silver: cost })
    }
    return loseBacker(next, claimant, 'end')
  }
  return loseBacker(next, claimant, 'resolve')
}

// ── What each seat may do ────────────────────────────────────────────────────────────────────

/** Why `seat` may not take `act` on `target` now; null if it may */
function actRefusal(state: PalaceState, seat: SeatId, act: PalaceAct, target: SeatId | null): string | null {
  const player = playerOf(state, seat) as PalacePlayer
  if (player.silver >= MUST_STORM && act !== 'storm') return ERROR.mustStorm
  if (player.silver < COST[act]) return ERROR.silver
  if (TARGETED.has(act)) {
    if (target === null || target === seat || !seatIsIn(state, target)) return ERROR.badTarget
  } else if (target !== null) return ERROR.badTarget
  return null
}

function chooseActions(state: PalaceState, seat: SeatId): PalaceAction[] {
  const targets = seatsIn(state).filter((other) => other !== seat)
  const out: PalaceAction[] = []
  for (const act of ACTS) {
    for (const target of TARGETED.has(act) ? targets : [null]) {
      if (actRefusal(state, seat, act, target) === null) out.push({ type: 'act', act, target })
    }
  }
  return out
}

/** Every way to keep `count` of `cards`, by id */
function keepChoices(cards: readonly PalaceCard[], count: number): string[][] {
  if (count === 0) return [[]]
  const out: string[][] = []
  cards.forEach((card, index) => {
    for (const rest of keepChoices(cards.slice(index + 1), count - 1)) out.push([card.id, ...rest])
  })
  return out
}

const waitingOn = (phase: PalacePhase, seat: SeatId): boolean =>
  phase.kind === 'respond' && phase.eligible.includes(seat) && !phase.passed.includes(seat)

/** What an absent seat does when the room skips it, or its clock runs out: the quietest choice */
function quietAction(state: PalaceState, seat: SeatId): PalaceAction | null {
  const phase = state.phase
  const player = playerOf(state, seat)
  if (player === undefined) return null
  switch (phase.kind) {
    case 'choose': {
      if (seat !== state.turn) return null
      if (player.silver < MUST_STORM) return { type: 'act', act: 'stipend', target: null }
      return { type: 'act', act: 'storm', target: nextIn(state, seat) }
    }
    case 'respond':
      return waitingOn(phase, seat) ? { type: 'pass' } : null
    case 'lose':
      return phase.seat === seat ? { type: 'lose', card: player.hidden[0].id } : null
    case 'exchange':
      return seat === state.current?.actor ? { type: 'keep', cards: player.hidden.map((card) => card.id) } : null
    case 'over':
      return null
  }
}

/** One seat's action, already checked to come from a seat in this game */
function play(state: PalaceState, action: PalaceAction, seat: SeatId, rng: Rng): PalaceState | ReturnType<typeof gameError> {
  const phase = state.phase
  const player = playerOf(state, seat) as PalacePlayer
  switch (action.type) {
    case 'act': {
      if (phase.kind !== 'choose') return gameError(ERROR.notNow)
      if (seat !== state.turn) return gameError(ERROR.notYourTurn)
      const refusal = actRefusal(state, seat, action.act, action.target)
      if (refusal !== null) return gameError(refusal)
      const { act, target } = action
      let next = withPlayer(state, seat, (one) => ({ ...one, silver: one.silver - COST[act] }))
      next = logged({ ...next, current: { actor: seat, act, target, block: null } }, { k: 'declare', seat, act, target })
      if (ACT_ROLE[act] !== null) return openWindow(next, 'challenge')
      if (BLOCKERS[act].length > 0) return openWindow(next, 'block')
      return resolve(next)
    }
    case 'pass': {
      if (phase.kind !== 'respond' || !waitingOn(phase, seat)) return gameError(ERROR.notAsked)
      const passed = [...phase.passed, seat]
      if (phase.eligible.every((one) => passed.includes(one))) return allPassed(state, phase.window)
      return { ...state, phase: { ...phase, passed } }
    }
    case 'challenge': {
      if (phase.kind !== 'respond' || !waitingOn(phase, seat) || phase.window === 'block') {
        return gameError(ERROR.notAsked)
      }
      return challenge(state, seat, phase.window, rng)
    }
    case 'block': {
      if (phase.kind !== 'respond' || !waitingOn(phase, seat) || phase.window !== 'block') {
        return gameError(ERROR.notAsked)
      }
      const current = state.current as NonNullable<PalaceState['current']>
      if (!BLOCKERS[current.act].includes(action.role)) return gameError(ERROR.cannotBlock)
      const next = logged(
        { ...state, current: { ...current, block: { by: seat, role: action.role } } },
        { k: 'block', by: seat, role: action.role },
      )
      return openWindow(next, 'challengeBlock')
    }
    case 'lose': {
      if (phase.kind !== 'lose' || phase.seat !== seat) return gameError(ERROR.notAsked)
      if (!player.hidden.some((card) => card.id === action.card)) return gameError(ERROR.badCard)
      return turnUp(state, seat, action.card, phase.then)
    }
    case 'keep': {
      if (phase.kind !== 'exchange' || state.current?.actor !== seat) return gameError(ERROR.notAsked)
      const pool = [...player.hidden, ...phase.drawn]
      const kept = new Set(action.cards)
      if (kept.size !== action.cards.length || kept.size !== player.hidden.length) return gameError(ERROR.badKeep)
      if (!action.cards.every((id) => pool.some((card) => card.id === id))) return gameError(ERROR.badKeep)
      const hidden = pool.filter((card) => kept.has(card.id))
      const back = pool.filter((card) => !kept.has(card.id))
      const next = withPlayer({ ...state, deck: rng.shuffle([...state.deck, ...back]) }, seat, (one) => ({
        ...one,
        hidden,
      }))
      return endTurn(logged(next, { k: 'exchanged', seat }))
    }
    default:
      return gameError(ERROR.badAction)
  }
}

/** A shuffled deck of five roles × COPIES, each card with its own id */
export function newDeck(rng: Rng): PalaceCard[] {
  const cards = ROLES.flatMap((role, r) =>
    Array.from({ length: COPIES }, (_, copy) => ({ id: `card-${r * COPIES + copy}`, role })),
  )
  return rng.shuffle(cards)
}

/** The clock a phase runs on, in ms; null for one that waits (the actor's choice) */
export function phaseMs(phase: PalacePhase, seconds: PalaceWindow): number | null {
  switch (phase.kind) {
    case 'respond':
      return seconds * 1000
    // Turning a card up or keeping cards is a real decision: twice as long
    case 'lose':
    case 'exchange':
      return seconds * 2000
    default:
      return null
  }
}

export const palace: GameModule<PalaceState, PalaceAction, PalaceView, PalaceOptions> = {
  ...palaceInfo,

  init(seats, options, rng) {
    let deck = newDeck(rng)
    const first = seats[rng.int(seats.length)].id
    const players: PalacePlayer[] = seats.map((seat) => {
      const hidden = deck.slice(0, 2)
      deck = deck.slice(2)
      // The usual two-player adjustment: whoever starts has one silver fewer
      const silver = seats.length === 2 && seat.id === first ? START_SILVER - 1 : START_SILVER
      return { seat: seat.id, silver, hidden, lost: [] }
    })
    return {
      windowSeconds: options.window,
      players,
      deck,
      turn: first,
      step: 0,
      phase: { kind: 'choose' },
      current: null,
      outOrder: [],
      winner: null,
      log: [{ k: 'start', seat: first }],
    }
  },

  reduce(state, rawAction, actor, rng) {
    const action = parseAction(rawAction)
    if (action === null) return gameError(ERROR.badAction)
    if (state.phase.kind === 'over') return gameError(ERROR.over)

    if (action.type === 'timeout' || action.type === 'skip') {
      if (actor !== 'system') return gameError(ERROR.systemOnly)
      if (action.type === 'skip') {
        if (playerOf(state, action.seat) === undefined) return gameError(ERROR.notAPlayer)
        const quiet = quietAction(state, action.seat)
        if (quiet === null) return gameError(ERROR.nothingToSkip)
        return play(state, quiet, action.seat, rng)
      }
      if (action.step !== state.step) return gameError(ERROR.notNow)
      const phase = state.phase
      switch (phase.kind) {
        case 'respond': {
          const left = phase.eligible.filter((seat) => !phase.passed.includes(seat))
          return allPassed(logged(state, { k: 'timeout', seats: left }), phase.window)
        }
        case 'lose':
          return play(state, quietAction(state, phase.seat) as PalaceAction, phase.seat, rng)
        case 'exchange': {
          const seat = (state.current as NonNullable<PalaceState['current']>).actor
          return play(state, quietAction(state, seat) as PalaceAction, seat, rng)
        }
        default:
          return gameError(ERROR.notNow)
      }
    }

    if (actor === 'system') return gameError(ERROR.badAction)
    const player = playerOf(state, actor)
    if (player === undefined) return gameError(ERROR.notAPlayer)
    if (!isIn(player)) return gameError(ERROR.notAsked)
    return play(state, action, actor, rng)
  },

  // The only place the cards are cut: rule 4 of types.ts. A seat sees its own face-down cards, and
  // the two a scheme drew while it chooses; nobody sees anyone else's, nor the deck
  view(state, viewer) {
    const you = viewer !== 'spectator' && playerOf(state, viewer) !== undefined ? viewer : null
    const mine = you === null ? undefined : playerOf(state, you)
    const phase = state.phase
    const exchanging = phase.kind === 'exchange' && you !== null && state.current?.actor === you
    const publicPhase: PalaceView['phase'] = (() => {
      switch (phase.kind) {
        case 'lose':
          return { kind: 'lose', seat: phase.seat }
        case 'exchange': {
          const actor = playerOf(state, (state.current as NonNullable<PalaceState['current']>).actor)
          return { kind: 'exchange', keep: actor?.hidden.length ?? 0 }
        }
        default:
          return phase
      }
    })()
    return {
      you,
      windowSeconds: state.windowSeconds,
      players: state.players.map((player) => ({
        seat: player.seat,
        silver: player.silver,
        hiddenCount: player.hidden.length,
        lost: player.lost,
        out: !isIn(player),
      })),
      hand: mine?.hidden ?? [],
      drawn: exchanging && phase.kind === 'exchange' ? phase.drawn : [],
      deckSize: state.deck.length,
      turn: state.turn,
      step: state.step,
      phase: publicPhase,
      current: state.current,
      winner: state.winner,
      log: state.log,
    }
  },

  legalActions(state, seat) {
    const phase = state.phase
    const player = playerOf(state, seat)
    if (player === undefined || !isIn(player)) return []
    switch (phase.kind) {
      case 'choose':
        return seat === state.turn ? chooseActions(state, seat) : []
      case 'respond': {
        if (!waitingOn(phase, seat)) return []
        if (phase.window !== 'block') return [{ type: 'pass' }, { type: 'challenge' }]
        const act = (state.current as NonNullable<PalaceState['current']>).act
        return [{ type: 'pass' }, ...BLOCKERS[act].map((role) => ({ type: 'block' as const, role }))]
      }
      case 'lose':
        return phase.seat === seat ? player.hidden.map((card) => ({ type: 'lose' as const, card: card.id })) : []
      case 'exchange':
        return state.current?.actor === seat
          ? keepChoices([...player.hidden, ...phase.drawn], player.hidden.length).map((cards) => ({
              type: 'keep' as const,
              cards,
            }))
          : []
      case 'over':
        return []
    }
  },

  skipAction(state, seat) {
    return quietAction(state, seat) === null ? null : { type: 'skip', seat }
  },

  // A window's clock: when it runs out everyone left passes, a card is turned up for whoever had to
  // choose, or a schemer keeps what they had. The step in the id gives every window a fresh clock
  timers(state) {
    const ms = phaseMs(state.phase, state.windowSeconds)
    if (ms === null) return []
    return [{ id: `palace-${state.step}`, ms, action: { type: 'timeout', step: state.step } }]
  },

  isOver(state) {
    return state.phase.kind === 'over'
  },

  // The last one standing first, then the others from the last to go out to the first
  result(state): GameResult {
    const order = [...(state.winner === null ? [] : [state.winner]), ...[...state.outOrder].reverse()]
    const rest = state.players.map((player) => player.seat).filter((seat) => !order.includes(seat))
    const ranked = [...order, ...rest]
    return {
      summary: { key: 'games.palace.result.won', params: { players: state.players.length } },
      standings: ranked.map((seat, index) => ({
        seat,
        rank: index + 1,
        score: null,
        note:
          seat === state.winner
            ? { key: 'games.palace.note.winner' }
            : { key: 'games.palace.note.out', params: { place: index + 1 } },
      })),
    }
  },
}
