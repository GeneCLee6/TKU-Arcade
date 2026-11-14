// 芥末餃子 (working title Wasabi Dumplings; owner's brief 2026-11-14). Every player owns four
// dumplings: three plain, one wasabi. Everyone hides one in their steamer; then in turn each adds
// another or starts the bidding: "I can eat N without biting wasabi". Bids go round, raise or pass;
// the highest bidder eats, their own steamer first, then any steamer top down. Eat N and win a gold
// chopstick (two win the game); bite wasabi and lose a dumpling: picked blind by the wasabi's owner,
// or chosen by the bidder when it was their own. No dumplings left, out of the game.
//
// docs/PRD/e19-wasabi-dumplings.md has the rules and every detail decided here.
import { wasabiInfo } from './info.ts'
import { gameError, type GameModule, type GameResult, type Rng, type SeatId } from '../types.ts'
import type {
  WasabiAction,
  WasabiDisc,
  WasabiOptions,
  WasabiPlayer,
  WasabiRoundEnd,
  WasabiState,
  WasabiView,
} from './types.ts'

/** Dumplings each player starts with */
export const PLAIN_START = 3
export const WASABI_START = 1

/** How long a finished round stays up before the next one starts itself */
export const ROUND_END_MS = 12_000

const ERROR = {
  badAction: 'games.wasabi.error.badAction',
  over: 'games.wasabi.error.over',
  notAPlayer: 'games.wasabi.error.notAPlayer',
  systemOnly: 'games.wasabi.error.systemOnly',
  outOfGame: 'games.wasabi.error.outOfGame',
  notYourTurn: 'games.wasabi.error.notYourTurn',
  alreadyPlaced: 'games.wasabi.error.alreadyPlaced',
  noSuchDisc: 'games.wasabi.error.noSuchDisc',
  badBid: 'games.wasabi.error.badBid',
  cannotPass: 'games.wasabi.error.cannotPass',
  ownFirst: 'games.wasabi.error.ownFirst',
  nothingThere: 'games.wasabi.error.nothingThere',
  badIndex: 'games.wasabi.error.badIndex',
  notNow: 'games.wasabi.error.notNow',
  nothingToSkip: 'games.wasabi.error.nothingToSkip',
} as const

const isSeat = (value: unknown): value is SeatId => Number.isInteger(value)
const isDisc = (value: unknown): value is WasabiDisc => value === 'plain' || value === 'wasabi'
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0

/** `action` comes off the network: its static type promises nothing at run time */
function parseAction(action: unknown): WasabiAction | null {
  if (typeof action !== 'object' || action === null) return null
  const { type, disc, count, seat, index } = action as Record<string, unknown>
  switch (type) {
    case 'place':
      return isDisc(disc) ? { type, disc } : null
    case 'discard':
      return isDisc(disc) ? { type, disc } : null
    case 'bid':
      return isCount(count) ? { type, count } : null
    case 'pass':
    case 'next':
      return { type }
    case 'eat':
      return isSeat(seat) ? { type, seat } : null
    case 'take':
      return isCount(index) ? { type, index } : null
    case 'skip':
      return isSeat(seat) ? { type, seat } : null
    default:
      return null
  }
}

const playerOf = (state: Pick<WasabiState, 'players'>, seat: SeatId): WasabiPlayer | undefined =>
  state.players.find((player) => player.seat === seat)

const owned = (player: WasabiPlayer): number => player.plain + player.wasabi

/** What is still in hand, not in the steamer */
export const inHand = (player: WasabiPlayer): Record<WasabiDisc, number> => {
  const placed = (disc: WasabiDisc) => player.stack.filter((placedDisc) => placedDisc === disc).length
  return { plain: player.plain - placed('plain'), wasabi: player.wasabi - placed('wasabi') }
}

/** Dumplings in all the steamers */
export const totalPlaced = (state: Pick<WasabiState, 'players'>): number =>
  state.players.reduce((sum, player) => sum + player.stack.length, 0)

const withPlayer = (state: WasabiState, seat: SeatId, change: (player: WasabiPlayer) => WasabiPlayer): WasabiState => ({
  ...state,
  players: state.players.map((player) => (player.seat === seat ? change(player) : player)),
})

/** The next seat after `seat` still in the game, and still bidding when `bidding` */
function nextSeat(state: WasabiState, seat: SeatId, bidding: boolean): SeatId {
  const at = state.players.findIndex((player) => player.seat === seat)
  for (let step = 1; step <= state.players.length; step++) {
    const candidate = state.players[(at + step) % state.players.length]
    if (!candidate.out && !(bidding && candidate.passed)) return candidate.seat
  }
  return seat
}

/** A fresh round: empty steamers, everyone opens at once */
function startRound(state: WasabiState, starter: SeatId, round: number): WasabiState {
  return {
    ...state,
    phase: 'opening',
    round,
    starter,
    current: starter,
    bid: 0,
    bidder: null,
    bites: [],
    wasabiOf: null,
    players: state.players.map((player) => ({ ...player, stack: [], eaten: 0, passed: false, placed: false })),
  }
}

/** The bid is set: straight to eating at the top bid, or round the table */
function afterBid(state: WasabiState): WasabiState {
  const bidding = state.players.filter((player) => !player.out && !player.passed)
  if (state.bid >= totalPlaced(state) || bidding.length <= 1) {
    return { ...state, phase: 'eating', current: state.bidder as SeatId }
  }
  return { ...state, phase: 'bidding', current: nextSeat(state, state.current, true) }
}

/** The bidder's own steamer still has dumplings to eat */
const ownLeft = (state: WasabiState): boolean => {
  const me = playerOf(state, state.bidder as SeatId) as WasabiPlayer
  return me.eaten < me.stack.length
}

/** Steamers the bidder may eat from now */
export function eatable(state: WasabiState): SeatId[] {
  if (state.phase !== 'eating' || state.bidder === null) return []
  if (ownLeft(state)) return [state.bidder]
  return state.players.filter((player) => player.eaten < player.stack.length).map((player) => player.seat)
}

function finishRound(state: WasabiState, end: Omit<WasabiRoundEnd, 'round' | 'bidder' | 'bid'>): WasabiState {
  const lastRound: WasabiRoundEnd = { round: state.round, bidder: state.bidder as SeatId, bid: state.bid, ...end }
  const standing = state.players.filter((player) => !player.out)
  const champion = state.players.find((player) => player.points >= state.goal)
  const winner = champion?.seat ?? (standing.length === 1 ? standing[0].seat : null)
  return { ...state, lastRound, phase: winner === null ? 'roundEnd' : 'over', winner }
}

function eat(state: WasabiState, seat: SeatId): WasabiState {
  const owner = playerOf(state, seat) as WasabiPlayer
  const disc = owner.stack[owner.stack.length - 1 - owner.eaten]
  const next: WasabiState = {
    ...withPlayer(state, seat, (player) => ({ ...player, eaten: player.eaten + 1 })),
    bites: [...state.bites, { seat, disc }],
  }
  const bidder = state.bidder as SeatId
  if (disc === 'wasabi') {
    return { ...next, phase: 'losing', wasabiOf: seat, current: seat }
  }
  if (next.bites.length >= state.bid) {
    const won = withPlayer(next, bidder, (player) => ({ ...player, points: player.points + 1 }))
    return finishRound(won, { success: true, wasabiOf: null, eliminated: false, lost: null })
  }
  return next
}

/** The bidder loses `disc` for good */
function lose(state: WasabiState, disc: WasabiDisc): WasabiState {
  const bidder = state.bidder as SeatId
  const next = withPlayer(state, bidder, (player) => {
    const plain = player.plain - (disc === 'plain' ? 1 : 0)
    const wasabi = player.wasabi - (disc === 'wasabi' ? 1 : 0)
    return { ...player, plain, wasabi, out: plain + wasabi === 0 }
  })
  const eliminated = (playerOf(next, bidder) as WasabiPlayer).out
  return finishRound(next, { success: false, wasabiOf: state.wasabiOf, eliminated, lost: disc })
}

/** Who opens the next round: the bidder; if they are out, the wasabi's owner; else the next seat */
function nextStarter(state: WasabiState): SeatId {
  const last = state.lastRound
  if (last === null) return state.starter
  const bidder = playerOf(state, last.bidder) as WasabiPlayer
  if (!bidder.out) return bidder.seat
  if (last.wasabiOf !== null && last.wasabiOf !== last.bidder) return last.wasabiOf
  return nextSeat(state, bidder.seat, false)
}

/** What a gone seat does when the room skips it: the mildest move there is */
function defaultMove(state: WasabiState, seat: SeatId): WasabiAction | null {
  const player = playerOf(state, seat)
  if (player === undefined || player.out) return null
  const hand = inHand(player)
  const placeOne = (): WasabiAction => ({ type: 'place', disc: hand.plain > 0 ? 'plain' : 'wasabi' })
  switch (state.phase) {
    case 'opening':
      return player.placed ? null : placeOne()
    case 'adding':
      if (seat !== state.current) return null
      return hand.plain + hand.wasabi > 0 ? placeOne() : { type: 'bid', count: state.bid + 1 }
    case 'bidding':
      return seat === state.current ? { type: 'pass' } : null
    case 'eating':
      return seat === state.current ? { type: 'eat', seat: eatable(state)[0] } : null
    case 'losing':
      if (seat !== state.current) return null
      return state.wasabiOf === state.bidder
        ? { type: 'discard', disc: player.plain > 0 ? 'plain' : 'wasabi' }
        : { type: 'take', index: 0 }
    default:
      return null
  }
}

/** Apply `action` from `seat`, checked against the rules */
function act(state: WasabiState, action: WasabiAction, seat: SeatId, rng: Rng): WasabiState | ReturnType<typeof gameError> {
  const me = playerOf(state, seat)
  if (me === undefined) return gameError(ERROR.notAPlayer)
  if (me.out) return gameError(ERROR.outOfGame)
  if (action.type === 'next') {
    if (state.phase !== 'roundEnd') return gameError(ERROR.notNow)
    return startRound(state, nextStarter(state), state.round + 1)
  }
  const hand = inHand(me)

  switch (action.type) {
    case 'place': {
      if (hand[action.disc] <= 0) return gameError(ERROR.noSuchDisc)
      const placed = (s: WasabiState) =>
        withPlayer(s, seat, (player) => ({ ...player, stack: [...player.stack, action.disc], placed: true }))
      if (state.phase === 'opening') {
        if (me.placed) return gameError(ERROR.alreadyPlaced)
        const next = placed(state)
        const waiting = next.players.some((player) => !player.out && !player.placed)
        return waiting ? next : { ...next, phase: 'adding', current: next.starter }
      }
      if (state.phase !== 'adding') return gameError(ERROR.notNow)
      if (seat !== state.current) return gameError(ERROR.notYourTurn)
      const next = placed(state)
      return { ...next, current: nextSeat(next, seat, false) }
    }
    case 'bid': {
      if (state.phase !== 'adding' && state.phase !== 'bidding') return gameError(ERROR.notNow)
      if (seat !== state.current) return gameError(ERROR.notYourTurn)
      if (action.count <= state.bid || action.count < 1 || action.count > totalPlaced(state)) {
        return gameError(ERROR.badBid)
      }
      const opened =
        state.phase === 'adding'
          ? { ...state, players: state.players.map((player) => ({ ...player, passed: false })) }
          : state
      return afterBid({ ...opened, bid: action.count, bidder: seat })
    }
    case 'pass': {
      if (state.phase !== 'bidding') return gameError(ERROR.notNow)
      if (seat !== state.current) return gameError(ERROR.notYourTurn)
      if (seat === state.bidder) return gameError(ERROR.cannotPass)
      return afterBid(withPlayer(state, seat, (player) => ({ ...player, passed: true })))
    }
    case 'eat': {
      if (state.phase !== 'eating') return gameError(ERROR.notNow)
      if (seat !== state.current) return gameError(ERROR.notYourTurn)
      const choices = eatable(state)
      if (!choices.includes(action.seat)) {
        return gameError(choices.includes(seat) ? ERROR.ownFirst : ERROR.nothingThere)
      }
      return eat(state, action.seat)
    }
    case 'take': {
      if (state.phase !== 'losing' || state.wasabiOf === state.bidder) return gameError(ERROR.notNow)
      if (seat !== state.current) return gameError(ERROR.notYourTurn)
      const bidder = playerOf(state, state.bidder as SeatId) as WasabiPlayer
      if (action.index >= owned(bidder)) return gameError(ERROR.badIndex)
      // Face down and shuffled: the taker cannot tell which is which
      const row = rng.shuffle([
        ...Array<WasabiDisc>(bidder.plain).fill('plain'),
        ...Array<WasabiDisc>(bidder.wasabi).fill('wasabi'),
      ])
      return lose(state, row[action.index])
    }
    case 'discard': {
      if (state.phase !== 'losing' || state.wasabiOf !== state.bidder) return gameError(ERROR.notNow)
      if (seat !== state.current) return gameError(ERROR.notYourTurn)
      if ((action.disc === 'plain' ? me.plain : me.wasabi) <= 0) return gameError(ERROR.noSuchDisc)
      return lose(state, action.disc)
    }
    default:
      return gameError(ERROR.badAction)
  }
}

export const wasabi: GameModule<WasabiState, WasabiAction, WasabiView, WasabiOptions> = {
  ...wasabiInfo,

  init(seats, options, rng) {
    const players: WasabiPlayer[] = seats.map((seat) => ({
      seat: seat.id,
      plain: PLAIN_START,
      wasabi: WASABI_START,
      stack: [],
      eaten: 0,
      points: 0,
      out: false,
      passed: false,
      placed: false,
    }))
    const starter = players[rng.int(players.length)].seat
    const base: WasabiState = {
      phase: 'opening',
      players,
      round: 1,
      starter,
      current: starter,
      bid: 0,
      bidder: null,
      bites: [],
      wasabiOf: null,
      lastRound: null,
      goal: options.goal,
      winner: null,
    }
    return startRound(base, starter, 1)
  },

  reduce(state, rawAction, actor, rng) {
    const action = parseAction(rawAction)
    if (action === null) return gameError(ERROR.badAction)
    if (state.phase === 'over') return gameError(ERROR.over)

    if (action.type === 'skip') {
      if (actor !== 'system') return gameError(ERROR.systemOnly)
      if (playerOf(state, action.seat) === undefined) return gameError(ERROR.notAPlayer)
      const move = defaultMove(state, action.seat)
      if (move === null) return gameError(ERROR.nothingToSkip)
      return act(state, move, action.seat, rng)
    }
    if (action.type === 'next' && actor === 'system') {
      if (state.phase !== 'roundEnd') return gameError(ERROR.notNow)
      return startRound(state, nextStarter(state), state.round + 1)
    }
    if (actor === 'system') return gameError(ERROR.badAction)
    return act(state, action, actor, rng)
  },

  // The only place the steamers and the lost dumpling are cut: rule 4 of shared/games/types.ts
  view(state, viewer) {
    const you = viewer !== 'spectator' && playerOf(state, viewer) !== undefined ? viewer : null
    const { players, lastRound, ...open } = state
    return {
      ...open,
      you,
      total: totalPlaced(state),
      players: players.map(({ plain, wasabi: wasabiCount, stack, ...player }) => {
        const mine = player.seat === you
        return {
          ...player,
          owned: plain + wasabiCount,
          plain: mine ? plain : null,
          wasabi: mine ? wasabiCount : null,
          stack: stack.map((disc, index) => (mine || index >= stack.length - player.eaten ? disc : null)),
        }
      }),
      lastRound:
        lastRound === null ? null : { ...lastRound, lost: lastRound.bidder === you ? lastRound.lost : null },
    }
  },

  legalActions(state, seat) {
    const me = playerOf(state, seat)
    if (me === undefined || state.phase === 'over') return []
    if (state.phase === 'roundEnd') return me.out ? [] : [{ type: 'next' }]
    if (me.out) return []
    const hand = inHand(me)
    const places: WasabiAction[] = (['plain', 'wasabi'] as const)
      .filter((disc) => hand[disc] > 0)
      .map((disc) => ({ type: 'place', disc }))
    const bids = (from: number): WasabiAction[] => {
      const out: WasabiAction[] = []
      for (let count = from; count <= totalPlaced(state); count++) out.push({ type: 'bid', count })
      return out
    }
    switch (state.phase) {
      case 'opening':
        return me.placed ? [] : places
      case 'adding':
        return seat === state.current ? [...places, ...bids(1)] : []
      case 'bidding':
        return seat === state.current ? [...bids(state.bid + 1), { type: 'pass' }] : []
      case 'eating':
        return seat === state.current ? eatable(state).map((target) => ({ type: 'eat', seat: target })) : []
      case 'losing': {
        if (seat !== state.current) return []
        if (state.wasabiOf === state.bidder) {
          return (['plain', 'wasabi'] as const)
            .filter((disc) => (disc === 'plain' ? me.plain : me.wasabi) > 0)
            .map((disc) => ({ type: 'discard', disc }))
        }
        const bidder = playerOf(state, state.bidder as SeatId) as WasabiPlayer
        return Array.from({ length: owned(bidder) }, (_, index) => ({ type: 'take', index }))
      }
      default:
        return []
    }
  },

  skipAction(state, seat) {
    return defaultMove(state, seat) === null ? null : { type: 'skip', seat }
  },

  // A finished round starts the next one itself if nobody presses the button
  timers(state) {
    if (state.phase !== 'roundEnd') return []
    return [{ id: `next-${state.round}`, ms: ROUND_END_MS, action: { type: 'next' } }]
  },

  isOver(state) {
    return state.phase === 'over'
  },

  // The winner first, then by gold chopsticks, then by dumplings left
  result(state): GameResult {
    const key = (player: WasabiPlayer) =>
      (player.seat === state.winner ? 1000 : 0) + player.points * 10 + (player.out ? 0 : 5) + owned(player)
    const ranked = [...state.players].sort((a, b) => key(b) - key(a) || a.seat - b.seat)
    const winner = state.winner ?? ranked[0].seat
    const byLast = state.players.filter((player) => !player.out).length === 1 &&
      (playerOf(state, winner) as WasabiPlayer).points < state.goal
    return {
      summary: { key: byLast ? 'games.wasabi.result.lastStanding' : 'games.wasabi.result.won', params: { goal: state.goal } },
      standings: ranked.map((player) => ({
        seat: player.seat,
        rank: 1 + ranked.filter((other) => key(other) > key(player)).length,
        score: player.points,
        note: {
          key: player.out ? 'games.wasabi.note.out' : 'games.wasabi.note.left',
          params: { points: player.points, left: owned(player) },
        },
      })),
    }
  },
}
