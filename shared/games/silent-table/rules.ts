// Silent Table (e4-t02, e4-t03): a co-operative poker game played without words. Everyone holds two
// hole cards and shares five cards, turned in three rounds (3, 1, 1). Each round every seat takes one
// rank chip, 1 for the weakest final hand at the table up to n for the strongest, from the table or
// from another seat, and the round ends once everybody holds a chip and has said ready. After the
// third round the hands are shown: the level is cleared when the chips put them in the right order.
// Clear `levelsToWin` levels in a row to win; fail `failureLimit` levels in all to lose.
//
// Three decisions the epic left open, recorded there too:
// - Hands that tie may hold their chips in either order.
// - Any chip moving clears everyone's ready, because ready means accepting the chips as they are.
// - `MOVES_PER_ROUND` caps a seat's moves in a round, so a round always ends without a clock.
import { bestHand, fullDeck, type Card } from '../../poker/hand.ts'
import { gameError, type GameModule, type GameResult, type Rng, type SeatId } from '../types.ts'
import type {
  Reveal,
  SilentTableAction,
  SilentTableOptions,
  SilentTablePlayer,
  SilentTableState,
  SilentTableView,
} from './types.ts'

export const HOLE_CARDS = 2
/** How many shared cards are showing in round 1, 2 and 3 */
export const COMMUNITY_BY_ROUND: readonly number[] = [3, 4, 5]
export const ROUNDS = COMMUNITY_BY_ROUND.length
/**
 * Moves one seat may make in one round: plenty to argue over a chip, and it means the moves run out,
 * so nobody can keep the table in a round for ever, even in a game with no timer.
 */
export const MOVES_PER_ROUND = 5

const ERROR = {
  badAction: 'games.silent-table.error.badAction',
  over: 'games.silent-table.error.over',
  cardsShowing: 'games.silent-table.error.cardsShowing',
  noSuchChip: 'games.silent-table.error.noSuchChip',
  noChipThere: 'games.silent-table.error.noChipThere',
  takeOff: 'games.silent-table.error.takeOff',
  noMoves: 'games.silent-table.error.noMoves',
  needChip: 'games.silent-table.error.needChip',
  alreadyReady: 'games.silent-table.error.alreadyReady',
  notAPlayer: 'games.silent-table.error.notAPlayer',
  systemOnly: 'games.silent-table.error.systemOnly',
} as const

/** `action` comes off the network: its static type promises nothing at run time */
function parseAction(action: unknown): SilentTableAction | null {
  if (typeof action !== 'object' || action === null) return null
  const { type, chip, seat } = action as { type?: unknown; chip?: unknown; seat?: unknown }
  if (type === 'ready' || type === 'timeUp') return { type }
  if (type === 'takeChip' && Number.isInteger(chip)) return { type, chip: chip as number }
  if ((type === 'takeFrom' || type === 'pass') && Number.isInteger(seat)) {
    return { type, seat: seat as SeatId }
  }
  return null
}

const tableChips = (players: readonly SilentTablePlayer[]): number[] => {
  const held = new Set(players.map((player) => player.chip))
  return players.map((_, index) => index + 1).filter((chip) => !held.has(chip))
}

const withPlayers = (
  state: SilentTableState,
  update: (player: SilentTablePlayer) => SilentTablePlayer,
): SilentTableState => ({ ...state, players: state.players.map(update) })

/** A fresh deck, new hands and empty hands of chips for the next level */
function dealLevel(
  state: Pick<SilentTableState, 'players'>,
  rng: Rng,
): Pick<SilentTableState, 'players' | 'community' | 'phase' | 'round' | 'reveal'> {
  const deck = rng.shuffle(fullDeck())
  const hands = state.players.length * HOLE_CARDS
  return {
    players: state.players.map((player, index) => ({
      ...player,
      hole: deck.slice(index * HOLE_CARDS, (index + 1) * HOLE_CARDS),
      chip: null,
      ready: false,
      movesLeft: MOVES_PER_ROUND,
      history: [],
    })),
    community: deck.slice(hands, hands + COMMUNITY_BY_ROUND[ROUNDS - 1]),
    phase: 'round',
    round: 1,
    reveal: null,
  }
}

/** The final hands against the final chips. Tied hands share a range of chips, so may hold either */
function compareToChips(players: readonly SilentTablePlayer[], community: readonly Card[]): Reveal {
  const hands = players.map((player) => bestHand([...player.hole, ...community]))
  const seats = players.map((player, index) => {
    const { score, category, best } = hands[index]
    const weaker = hands.filter((other) => other.score < score).length
    const tied = hands.filter((other) => other.score === score).length
    const chip = player.chip as number
    const lowestCorrectChip = weaker + 1
    const highestCorrectChip = weaker + tied
    return {
      seat: player.seat,
      hand: category,
      best,
      chip,
      lowestCorrectChip,
      highestCorrectChip,
      correct: chip >= lowestCorrectChip && chip <= highestCorrectChip,
    }
  })
  return { passed: seats.every((seat) => seat.correct), seats }
}

function finishLevel(state: SilentTableState): SilentTableState {
  const reveal = compareToChips(state.players, state.community)
  const streak = reveal.passed ? state.streak + 1 : 0
  const failures = reveal.passed ? state.failures : state.failures + 1
  const ending = streak >= state.levelsToWin ? 'won' : failures >= state.failureLimit ? 'lost' : null
  return {
    ...state,
    players: state.players.map((player, index) => ({
      ...player,
      ready: false,
      correctReads: player.correctReads + (reveal.seats[index].correct ? 1 : 0),
    })),
    phase: ending === null ? 'reveal' : 'over',
    reveal,
    streak,
    failures,
    ending,
  }
}

/** Once every seat holds a chip and is ready: turn the next cards, or finish the level */
function advanceIfSettled(state: SilentTableState): SilentTableState {
  if (!state.players.every((player) => player.ready && player.chip !== null)) return state
  const settled = withPlayers(state, (player) => ({
    ...player,
    history: [...player.history, player.chip as number],
  }))
  if (state.round === ROUNDS) return finishLevel(settled)
  return {
    ...withPlayers(settled, (player) => ({
      ...player,
      chip: null,
      ready: false,
      movesLeft: MOVES_PER_ROUND,
    })),
    round: state.round + 1,
  }
}

/** Every seat acknowledged a reveal: deal the next level, keeping the score */
function advanceIfAcknowledged(state: SilentTableState, rng: Rng): SilentTableState {
  if (!state.players.every((player) => player.ready)) return state
  return { ...state, ...dealLevel(state, rng), level: state.level + 1 }
}

function moveChip(
  state: SilentTableState,
  actor: SeatId,
  chip: number,
  from: SeatId | null,
  costsMove: boolean,
): SilentTableState {
  return withPlayers(state, (player) => {
    const cleared = { ...player, ready: false }
    if (player.seat === actor) {
      return {
        ...cleared,
        chip,
        movesLeft: player.movesLeft - (costsMove ? 1 : 0),
      }
    }
    return player.seat === from ? { ...cleared, chip: null } : cleared
  })
}

/** Accepts this seat's position for the round, taking the lowest free chip if it holds none */
function passFor(state: SilentTableState, seat: SeatId, rng: Rng): SilentTableState {
  if (state.phase === 'reveal') return acknowledge(state, seat, rng)
  const player = state.players[seat]
  const chip = player.chip ?? tableChips(state.players)[0]
  const moved = player.chip === null ? moveChip(state, seat, chip, null, false) : state
  return advanceIfSettled(
    withPlayers(moved, (other) => (other.seat === seat ? { ...other, ready: true } : other)),
  )
}

/**
 * The round's time ran out. All at once, not one `passFor` per seat: a chip moving clears everyone's
 * ready, so seats passed in turn would undo each other. Nobody's chip moves but those who hold none.
 */
function timeUp(state: SilentTableState): SilentTableState {
  const free = tableChips(state.players)
  let nextFree = 0
  return advanceIfSettled(
    withPlayers(state, (player) => ({
      ...player,
      chip: player.chip ?? free[nextFree++],
      ready: true,
    })),
  )
}

function acknowledge(state: SilentTableState, seat: SeatId, rng: Rng): SilentTableState {
  return advanceIfAcknowledged(
    withPlayers(state, (other) => (other.seat === seat ? { ...other, ready: true } : other)),
    rng,
  )
}

export const silentTable: GameModule<
  SilentTableState,
  SilentTableAction,
  SilentTableView,
  SilentTableOptions
> = {
  id: 'silent-table',
  // Unlisted until the owner signs docs/IP-CHECKLIST.md: merging deploys, and a listed game is live.
  // No `proxyTurns`: a chip is a decision, and a random one could lose the level
  meta: {
    minPlayers: 3,
    maxPlayers: 6,
    minutes: 20,
    i18nKey: 'games.silent-table',
    unlisted: true,
  },

  options: {
    levelsToWin: {
      kind: 'int',
      labelKey: 'games.silent-table.option.levelsToWin',
      min: 1,
      max: 7,
      default: 3,
    },
    failureLimit: {
      kind: 'int',
      labelKey: 'games.silent-table.option.failureLimit',
      min: 1,
      max: 5,
      default: 3,
    },
    allowTakeFromPlayers: {
      kind: 'boolean',
      labelKey: 'games.silent-table.option.allowTakeFromPlayers',
      default: true,
    },
    spectatorsSeeAll: {
      kind: 'boolean',
      labelKey: 'games.silent-table.option.spectatorsSeeAll',
      default: false,
    },
    roundSeconds: {
      kind: 'select',
      labelKey: 'games.silent-table.option.roundSeconds',
      choices: [
        { value: 0, labelKey: 'games.silent-table.option.roundSeconds.off' },
        { value: 60, labelKey: 'games.silent-table.option.roundSeconds.60' },
        { value: 90, labelKey: 'games.silent-table.option.roundSeconds.90' },
        { value: 120, labelKey: 'games.silent-table.option.roundSeconds.120' },
      ],
      default: 0,
    },
    skin: {
      kind: 'select',
      labelKey: 'games.silent-table.option.skin',
      choices: [
        { value: 'plain', labelKey: 'games.silent-table.option.skin.plain' },
        { value: 'diving', labelKey: 'games.silent-table.option.skin.diving' },
        { value: 'climbing', labelKey: 'games.silent-table.option.skin.climbing' },
      ],
      default: 'plain',
    },
  },

  init(seats, options, rng) {
    const players = seats.map(
      (seat): SilentTablePlayer => ({
        seat: seat.id,
        hole: [],
        chip: null,
        ready: false,
        movesLeft: MOVES_PER_ROUND,
        history: [],
        correctReads: 0,
      }),
    )
    return {
      ...dealLevel({ players }, rng),
      level: 1,
      streak: 0,
      failures: 0,
      levelsToWin: options.levelsToWin,
      failureLimit: options.failureLimit,
      allowTakeFromPlayers: options.allowTakeFromPlayers,
      spectatorsSeeAll: options.spectatorsSeeAll,
      roundSeconds: options.roundSeconds,
      skin: options.skin,
      ending: null,
    }
  },

  reduce(state, rawAction, actor, rng) {
    const action = parseAction(rawAction)
    if (action === null) return gameError(ERROR.badAction)
    if (state.phase === 'over') return gameError(ERROR.over)

    if (action.type === 'pass') {
      if (actor !== 'system') return gameError(ERROR.systemOnly)
      if (!state.players[action.seat]) return gameError(ERROR.notAPlayer)
      return passFor(state, action.seat, rng)
    }

    if (action.type === 'timeUp') {
      if (actor !== 'system') return gameError(ERROR.systemOnly)
      if (state.phase !== 'round') return gameError(ERROR.cardsShowing)
      return timeUp(state)
    }

    if (actor === 'system') return gameError(ERROR.badAction)
    const player = state.players[actor]
    if (!player) return gameError(ERROR.notAPlayer)

    if (action.type === 'ready') {
      if (player.ready) return gameError(ERROR.alreadyReady)
      if (state.phase === 'reveal') return acknowledge(state, actor, rng)
      if (player.chip === null) return gameError(ERROR.needChip)
      return advanceIfSettled(
        withPlayers(state, (other) => (other.seat === actor ? { ...other, ready: true } : other)),
      )
    }

    if (state.phase !== 'round') return gameError(ERROR.cardsShowing)

    if (action.type === 'takeChip') {
      if (!tableChips(state.players).includes(action.chip)) return gameError(ERROR.noSuchChip)
      const costsMove = player.chip !== null
      if (costsMove && player.movesLeft === 0) return gameError(ERROR.noMoves)
      return moveChip(state, actor, action.chip, null, costsMove)
    }

    if (!state.allowTakeFromPlayers) return gameError(ERROR.takeOff)
    const held = action.seat === actor ? null : (state.players[action.seat]?.chip ?? null)
    if (held === null) return gameError(ERROR.noChipThere)
    if (player.movesLeft === 0) return gameError(ERROR.noMoves)
    return moveChip(state, actor, held, action.seat, true)
  },

  // The only place hole cards and the undealt shared cards are cut: rule 4 of shared/games/types.ts
  view(state, viewer) {
    const shownToAll = state.phase !== 'round'
    const showHole = (seat: SeatId) =>
      shownToAll || viewer === seat || (viewer === 'spectator' && state.spectatorsSeeAll)
    const shared =
      state.phase === 'round' ? COMMUNITY_BY_ROUND[state.round - 1] : state.community.length
    return {
      ...state,
      you: viewer === 'spectator' ? null : viewer,
      players: state.players.map((player) => ({
        ...player,
        hole: showHole(player.seat) ? player.hole : null,
      })),
      community: state.community.slice(0, shared),
      tableChips: tableChips(state.players),
    }
  },

  legalActions(state, seat) {
    const player = state.players[seat]
    if (state.phase === 'over' || !player) return []
    if (state.phase === 'reveal') return player.ready ? [] : [{ type: 'ready' }]

    const actions: SilentTableAction[] = []
    if (player.chip !== null && !player.ready) actions.push({ type: 'ready' })
    if (player.chip === null || player.movesLeft > 0) {
      for (const chip of tableChips(state.players)) actions.push({ type: 'takeChip', chip })
    }
    if (state.allowTakeFromPlayers && player.movesLeft > 0) {
      for (const other of state.players) {
        if (other.seat !== seat && other.chip !== null) {
          actions.push({ type: 'takeFrom', seat: other.seat })
        }
      }
    }
    return actions
  },

  // Everyone acts at once, so the table waits for an absent seat until the host decides for it
  skipAction(_state, seat) {
    return { type: 'pass', seat }
  },

  // Level and round in the id, so that every round gets a fresh clock. Nothing to wait for at a reveal
  timers(state) {
    if (state.phase !== 'round' || !state.roundSeconds) return []
    return [
      {
        id: `round-${state.level}-${state.round}`,
        ms: state.roundSeconds * 1000,
        action: { type: 'timeUp' },
      },
    ]
  },

  // Only the chips may speak while they are being taken; at a reveal the table can talk it over
  chatLocked(state) {
    return state.phase === 'round'
  },

  isOver(state) {
    return state.phase === 'over'
  },

  result(state): GameResult {
    const won = state.ending === 'won'
    return {
      summary: {
        key: won ? 'games.silent-table.result.won' : 'games.silent-table.result.lost',
        params: { levels: state.levelsToWin, failures: state.failures },
      },
      // Co-operative: the table wins or loses together
      standings: state.players.map((player) => ({
        seat: player.seat,
        rank: 1,
        score: null,
        note: {
          key: 'games.silent-table.note.reads',
          params: { reads: player.correctReads, levels: state.level },
        },
      })),
    }
  },
}
