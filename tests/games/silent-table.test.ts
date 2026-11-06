import { describe, expect, it, vi } from 'vitest'
import { GAME_IDS, getGame, LOBBY_GAMES } from '../../shared/games/index.ts'
import { makeSeats, projectGame, startMatch, applyAction } from '../../shared/games/match.ts'
import { defaultOptions, parseOptions } from '../../shared/games/options.ts'
import { createRng } from '../../shared/games/rng.ts'
import { silentTableMessages } from '../../shared/games/silent-table/i18n.ts'
import { MOVES_PER_ROUND, silentTable } from '../../shared/games/silent-table/rules.ts'
import type {
  SilentTableAction,
  SilentTableOptions,
  SilentTableState,
  SilentTableView,
} from '../../shared/games/silent-table/types.ts'
import { isGameError, type Actor, type GameError, type Viewer } from '../../shared/games/types.ts'
import { bestHand, HAND_CATEGORIES, type Card } from '../../shared/poker/hand.ts'
import { playRandom } from './harness.ts'

// The harness plays whole games over many seeds, which goes past 5 s on a busy machine
vi.setConfig({ testTimeout: 120_000 })

const OPTIONS: SilentTableOptions = {
  levelsToWin: 3,
  failureLimit: 3,
  allowTakeFromPlayers: true,
  spectatorsSeeAll: false,
}

const start = (seats: number, overrides: Partial<SilentTableOptions> = {}, seed = 1) =>
  silentTable.init(makeSeats(seats), { ...OPTIONS, ...overrides }, createRng(seed))

const READY: SilentTableAction = { type: 'ready' }
const take = (chip: number): SilentTableAction => ({ type: 'takeChip', chip })
const takeFrom = (seat: number): SilentTableAction => ({ type: 'takeFrom', seat })
const pass = (seat: number): SilentTableAction => ({ type: 'pass', seat })

/** The state after an action that must be accepted */
function act(state: SilentTableState, action: SilentTableAction, actor: Actor): SilentTableState {
  const next = silentTable.reduce(state, action, actor, createRng(99))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)}: ${next.gameError}`)
  return next
}

const refusal = (state: SilentTableState, action: unknown, actor: Actor): string => {
  const answer = silentTable.reduce(state, action as SilentTableAction, actor, createRng(99))
  expect(isGameError(answer)).toBe(true)
  return (answer as GameError).gameError
}

const error = (name: string) => `games.silent-table.error.${name}`

/** Everyone takes the chip listed for them from the table and says ready */
function settle(state: SilentTableState, chips: readonly number[]): SilentTableState {
  const taken = chips.reduce((current, chip, seat) => act(current, take(chip), seat), state)
  return chips.reduce((current, _, seat) => act(current, READY, seat), taken)
}

const playLevel = (state: SilentTableState, chips: readonly number[]) =>
  settle(settle(settle(state, chips), chips), chips)

const acknowledgeAll = (state: SilentTableState) =>
  state.players.reduce((current, player) => act(current, READY, player.seat), state)

/** A right set of chips for this deal: seat order breaks a tie */
function rightChips(state: SilentTableState): number[] {
  const order = state.players
    .map((player) => ({
      seat: player.seat,
      score: bestHand([...player.hole, ...state.community]).score,
    }))
    .sort((a, b) => a.score - b.score || a.seat - b.seat)
  const chips = new Array<number>(state.players.length)
  order.forEach(({ seat }, index) => {
    chips[seat] = index + 1
  })
  return chips
}

/** The chips of a right set, one pair swapped: wrong unless those two hands tie */
function wrongChips(state: SilentTableState): number[] {
  const hands = state.players.map((player) =>
    bestHand([...player.hole, ...state.community]),
  )
  const chips = rightChips(state)
  const a = chips.indexOf(1)
  const b = chips.indexOf(state.players.length)
  if (hands[a].score === hands[b].score) throw new Error('every hand ties: pick another seed')
  return chips.map((chip, seat) => (seat === a ? chips[b] : seat === b ? chips[a] : chip))
}

const dealt = (
  state: SilentTableState,
  holes: readonly string[],
  community: string,
): SilentTableState => ({
  ...state,
  players: state.players.map((player, seat) => ({
    ...player,
    hole: holes[seat].split(' ') as Card[],
  })),
  community: community.split(' ') as Card[],
})

const viewOf = (state: SilentTableState, viewer: Viewer): SilentTableView =>
  silentTable.view(state, viewer)

describe('the module', () => {
  it('runs on the room, for 3 to 6 seats, but no lobby or menu lists it until it has a screen', () => {
    expect(getGame('silent-table')).toBe(silentTable)
    expect(GAME_IDS).toContain('silent-table')
    expect(silentTable.meta).toMatchObject({ minPlayers: 3, maxPlayers: 6, unlisted: true })
    expect(LOBBY_GAMES.map((game) => game.id)).not.toContain('silent-table')
  })

  it('does not offer to play for an absent seat, since a chip is a decision', () => {
    expect(silentTable.meta.proxyTurns).toBeUndefined()
  })
})

describe('rule options', () => {
  it('defaults to three levels, three failures, taking allowed, spectators not seeing cards', () => {
    expect(defaultOptions(silentTable.options)).toEqual(OPTIONS)
  })

  it('replaces what is invalid with the default', () => {
    expect(
      parseOptions(silentTable.options, {
        levelsToWin: 99,
        failureLimit: 0,
        allowTakeFromPlayers: 'yes',
        spectatorsSeeAll: 1,
        extra: true,
      }),
    ).toEqual(OPTIONS)
  })

  it('keeps what is valid and copies it into the state', () => {
    const chosen = { levelsToWin: 5, failureLimit: 1, allowTakeFromPlayers: false, spectatorsSeeAll: true }
    expect(parseOptions(silentTable.options, chosen)).toEqual(chosen)
    expect(start(3, chosen)).toMatchObject(chosen)
  })
})

describe('the deal', () => {
  it.each([3, 4, 5, 6])('gives each of %i seats two cards and leaves five shared, all different', (seats) => {
    const state = start(seats)
    expect(state.players.every((player) => player.hole.length === 2)).toBe(true)
    expect(state.community).toHaveLength(5)
    const all = [...state.players.flatMap((player) => player.hole), ...state.community]
    expect(new Set(all).size).toBe(seats * 2 + 5)
  })

  it('depends only on the seed', () => {
    expect(start(4, {}, 7)).toEqual(start(4, {}, 7))
    expect(start(4, {}, 7)).not.toEqual(start(4, {}, 8))
  })
})

describe('taking chips', () => {
  it('lays out one chip per seat, 1 to n, all on the table at first', () => {
    expect(viewOf(start(5), 0).tableChips).toEqual([1, 2, 3, 4, 5])
  })

  it('takes a chip from the table, and a chip already held goes back', () => {
    const first = act(start(3), take(2), 0)
    expect(first.players[0].chip).toBe(2)
    expect(viewOf(first, 1).tableChips).toEqual([1, 3])
    const second = act(first, take(3), 0)
    expect(second.players[0].chip).toBe(3)
    expect(viewOf(second, 1).tableChips).toEqual([1, 2])
  })

  it('takes a chip from another seat, who must then take another', () => {
    const state = settleNone(act(act(start(3), take(2), 0), take(3), 1))
    const next = act(state, takeFrom(1), 0)
    expect(next.players[0].chip).toBe(3)
    expect(next.players[1].chip).toBeNull()
    expect(viewOf(next, 1).tableChips).toEqual([1, 2])
    expect(silentTable.legalActions(next, 1)).not.toContainEqual(READY)
    expect(refusal(next, READY, 1)).toBe(error('needChip'))
    expect(act(next, take(2), 1).players[1].chip).toBe(2)
  })

  it('refuses a chip that is not there and a seat with nothing to take', () => {
    const state = act(start(3), take(2), 0)
    expect(refusal(state, take(2), 1)).toBe(error('noSuchChip'))
    expect(refusal(state, take(4), 1)).toBe(error('noSuchChip'))
    expect(refusal(state, take(0), 1)).toBe(error('noSuchChip'))
    expect(refusal(state, takeFrom(2), 1)).toBe(error('noChipThere'))
    expect(refusal(state, takeFrom(0), 0)).toBe(error('noChipThere'))
    expect(refusal(state, takeFrom(9), 1)).toBe(error('noChipThere'))
    expect(refusal(state, takeFrom(-1), 1)).toBe(error('noChipThere'))
  })

  it('refuses the wrong shape of action', () => {
    const state = start(3)
    for (const bad of [
      { type: 'takeChip' },
      { type: 'takeChip', chip: '1' },
      { type: 'takeChip', chip: 1.5 },
      { type: 'takeFrom', seat: null },
      { type: 'pass' },
      null,
      'ready',
    ]) {
      expect(refusal(state, bad, 0), JSON.stringify(bad)).toBe(error('badAction'))
    }
  })

  it('refuses taking from a seat when the option is off, and does not offer it', () => {
    const state = act(start(3, { allowTakeFromPlayers: false }), take(2), 0)
    expect(refusal(state, takeFrom(0), 1)).toBe(error('takeOff'))
    expect(silentTable.legalActions(state, 1)).toEqual([take(1), take(3)])
  })

  it('offers a seat the chips it can reach, and only those', () => {
    const state = act(act(start(3), take(2), 0), take(3), 1)
    expect(silentTable.legalActions(state, 2)).toEqual([take(1), takeFrom(0), takeFrom(1)])
    expect(silentTable.legalActions(state, 0)).toEqual([READY, take(1), takeFrom(1)])
  })

  it('caps the moves in a round, but a seat with no chip can always take one from the table', () => {
    let state = act(start(3), take(1), 0)
    for (let move = 0; move < MOVES_PER_ROUND; move++) {
      expect(state.players[0].movesLeft).toBe(MOVES_PER_ROUND - move)
      state = act(state, take(state.players[0].chip === 1 ? 2 : 1), 0)
    }
    expect(state.players[0].movesLeft).toBe(0)
    expect(refusal(state, take(3), 0)).toBe(error('noMoves'))
    expect(silentTable.legalActions(state, 0)).toEqual([READY])

    state = act(act(state, take(3), 1), takeFrom(0), 1)
    expect(state.players[0].chip).toBeNull()
    expect(refusal(state, takeFrom(1), 0)).toBe(error('noMoves'))
    const legal = silentTable.legalActions(state, 0)
    expect(legal.length).toBeGreaterThan(0)
    expect(legal.every((action) => action.type === 'takeChip')).toBe(true)
    expect(act(state, legal[0], 0).players[0].movesLeft).toBe(0)
  })

  it('a first chip costs no move; a change of mind and taking from a seat cost one', () => {
    const first = act(start(3), take(1), 0)
    expect(first.players[0].movesLeft).toBe(MOVES_PER_ROUND)
    expect(act(first, take(2), 0).players[0].movesLeft).toBe(MOVES_PER_ROUND - 1)
    expect(act(first, takeFrom(0), 1).players[1].movesLeft).toBe(MOVES_PER_ROUND - 1)
  })

  /** A readable name for a state nobody has said ready in */
  function settleNone(state: SilentTableState) {
    expect(state.players.some((player) => player.ready)).toBe(false)
    return state
  }
})

describe('the rounds', () => {
  it('shows three, then four, then five shared cards', () => {
    const state = start(3)
    expect(viewOf(state, 0).community).toEqual(state.community.slice(0, 3))
    const second = settle(state, [1, 2, 3])
    expect(second.round).toBe(2)
    expect(viewOf(second, 0).community).toEqual(state.community.slice(0, 4))
    const third = settle(second, [1, 2, 3])
    expect(third.round).toBe(3)
    expect(viewOf(third, 0).community).toEqual(state.community)
  })

  it('moves on only once every seat holds a chip and is ready', () => {
    let state = act(act(act(start(3), take(1), 0), take(2), 1), take(3), 2)
    state = act(act(state, READY, 0), READY, 1)
    expect(state.round).toBe(1)
    state = act(state, READY, 2)
    expect(state.round).toBe(2)
  })

  it('needs a chip to say ready, and refuses saying it twice', () => {
    const state = start(3)
    expect(refusal(state, READY, 0)).toBe(error('needChip'))
    const held = act(act(state, take(1), 0), READY, 0)
    expect(refusal(held, READY, 0)).toBe(error('alreadyReady'))
    expect(silentTable.legalActions(held, 0)).not.toContainEqual(READY)
  })

  it('clears everybody saying ready when any chip moves', () => {
    let state = act(act(act(start(3), take(1), 0), take(2), 1), READY, 0)
    state = act(state, READY, 1)
    state = act(state, take(3), 2)
    expect(state.players.map((player) => player.ready)).toEqual([false, false, false])
  })

  it('a seat that is ready can still move, which clears it too', () => {
    const state = act(act(start(3), take(1), 0), READY, 0)
    const next = act(state, take(2), 0)
    expect(next.players[0]).toMatchObject({ chip: 2, ready: false })
  })

  it('a round ends with chips back on the table, moves restored, and the old chips kept', () => {
    let state = act(start(3), take(1), 0)
    state = act(state, take(2), 0)
    state = act(act(state, take(1), 1), take(3), 2)
    state = act(act(act(state, READY, 0), READY, 1), READY, 2)
    expect(state.players.map((player) => player.chip)).toEqual([null, null, null])
    expect(state.players.map((player) => player.movesLeft)).toEqual(
      new Array(3).fill(MOVES_PER_ROUND),
    )
    expect(state.players.map((player) => player.history)).toEqual([[2], [1], [3]])
  })
})

describe('the reveal', () => {
  // Strength with this board: seat 1 (trips) > seat 0 (pair of aces) > seat 2 (pair of threes)
  const HOLES = ['As 4d', '9h 9d', '3c 5h']
  const BOARD = '9s Ah 3d Jc 2c'

  it('passes when the final chips match the hands, and only the third round counts', () => {
    const state = dealt(start(3), HOLES, BOARD)
    const after = settle(settle(settle(state, [3, 1, 2]), [1, 2, 3]), [2, 3, 1])
    expect(after.phase).toBe('reveal')
    expect(after.reveal?.passed).toBe(true)
    expect(after.reveal?.seats.map((seat) => seat.correct)).toEqual([true, true, true])
    expect(after.reveal?.seats.map((seat) => seat.hand)).toEqual([
      'pair',
      'threeOfAKind',
      'pair',
    ])
    expect(after.streak).toBe(1)
    expect(after.failures).toBe(0)
    expect(after.players.map((player) => player.history)).toEqual([
      [3, 1, 2],
      [1, 2, 3],
      [2, 3, 1],
    ])
  })

  it('fails on a wrong order, saying who was wrong and what was right', () => {
    const after = playLevel(dealt(start(3), HOLES, BOARD), [3, 2, 1])
    expect(after.reveal?.passed).toBe(false)
    expect(
      after.reveal?.seats.map(({ correct, lowestCorrectChip, highestCorrectChip }) => [
        correct,
        lowestCorrectChip,
        highestCorrectChip,
      ]),
    ).toEqual([
      [false, 2, 2],
      [false, 3, 3],
      [true, 1, 1],
    ])
    expect(after.failures).toBe(1)
    expect(after.streak).toBe(0)
    expect(after.players.map((player) => player.correctReads)).toEqual([0, 0, 1])
  })

  it('lets hands that tie hold their chips in either order', () => {
    // The board is a straight flush nobody can beat: everyone ties, so any order is right
    const everyone = ['2h 3h', '4d 5d', '6c 7c']
    const board = 'Ts Js Qs Ks As'
    for (const chips of [
      [1, 2, 3],
      [3, 2, 1],
      [2, 3, 1],
    ]) {
      const after = playLevel(dealt(start(3), everyone, board), chips)
      expect(after.reveal?.passed, chips.join()).toBe(true)
      expect(after.reveal?.seats[0]).toMatchObject({ lowestCorrectChip: 1, highestCorrectChip: 3 })
    }
  })

  it('a tie between two still has to sit in the right place against the third', () => {
    // Seats 0 and 1 share a pair of queens with the same kickers; seat 2 has the pair of aces
    const holes = ['Qs 3d', 'Qd 3c', 'As Ad']
    const board = 'Qh 9c 7d 5s Kh'
    const either = [
      [1, 2, 3],
      [2, 1, 3],
    ]
    for (const chips of either) {
      const after = playLevel(dealt(start(3), holes, board), chips)
      expect(after.reveal?.passed, chips.join()).toBe(true)
    }
    const wrong = playLevel(dealt(start(3), holes, board), [3, 1, 2])
    expect(wrong.reveal?.passed).toBe(false)
    expect(wrong.reveal?.seats.map((seat) => seat.correct)).toEqual([false, true, false])
  })

  it('moves no chips while the cards are shown, and needs every seat to go on', () => {
    const state = playLevel(start(3), [1, 2, 3])
    expect(refusal(state, take(1), 0)).toBe(error('cardsShowing'))
    expect(refusal(state, takeFrom(1), 0)).toBe(error('cardsShowing'))
    expect(silentTable.legalActions(state, 0)).toEqual([READY])
    const one = act(state, READY, 0)
    expect(one.level).toBe(1)
    expect(silentTable.legalActions(one, 0)).toEqual([])
    expect(refusal(one, READY, 0)).toBe(error('alreadyReady'))
  })

  it('then deals a new level, with new cards and nothing left of the last reveal', () => {
    const state = playLevel(start(3), [1, 2, 3])
    const next = acknowledgeAll(state)
    expect(next.level).toBe(2)
    expect(next.phase).toBe('round')
    expect(next.round).toBe(1)
    expect(next.reveal).toBeNull()
    expect(next.community).not.toEqual(state.community)
    expect(next.players[0]).toMatchObject({ chip: null, ready: false, history: [] })
  })
})

describe('levels and the end of the game', () => {
  const clear = (state: SilentTableState) => playLevel(state, rightChips(state))
  const miss = (state: SilentTableState) => playLevel(state, wrongChips(state))

  it('wins after the set number of levels in a row', () => {
    let state = start(4, { levelsToWin: 3 })
    state = acknowledgeAll(clear(state))
    expect(state).toMatchObject({ level: 2, streak: 1, ending: null })
    state = acknowledgeAll(clear(state))
    expect(state).toMatchObject({ level: 3, streak: 2, ending: null })
    state = clear(state)
    expect(state).toMatchObject({ phase: 'over', streak: 3, ending: 'won' })
    expect(silentTable.isOver(state)).toBe(true)
    expect(silentTable.result(state).summary.key).toBe('games.silent-table.result.won')
  })

  it('a failed level sets the run back to nothing but does not forget earlier failures', () => {
    let state = start(4, { levelsToWin: 2, failureLimit: 3 })
    state = acknowledgeAll(clear(state))
    expect(state.streak).toBe(1)
    state = acknowledgeAll(miss(state))
    expect(state).toMatchObject({ streak: 0, failures: 1, ending: null })
    state = acknowledgeAll(clear(state))
    expect(state).toMatchObject({ streak: 1, failures: 1, ending: null })
    state = clear(state)
    expect(state).toMatchObject({ streak: 2, failures: 1, ending: 'won' })
  })

  it('loses at the failure limit, keeping the last reveal up', () => {
    let state = start(3, { failureLimit: 2 })
    state = acknowledgeAll(miss(state))
    expect(state).toMatchObject({ failures: 1, ending: null })
    state = miss(state)
    expect(state).toMatchObject({ phase: 'over', failures: 2, ending: 'lost' })
    expect(state.reveal).not.toBeNull()
    const result = silentTable.result(state)
    expect(result.summary).toEqual({
      key: 'games.silent-table.result.lost',
      params: { levels: 3, failures: 2 },
    })
  })

  it('ends with every seat sharing first place, and nothing left to do', () => {
    const state = playLevel(start(5, { levelsToWin: 1 }, 3), rightChips(start(5, {}, 3)))
    expect(state.ending).toBe('won')
    const { standings } = silentTable.result(state)
    expect(standings.map((line) => line.rank)).toEqual([1, 1, 1, 1, 1])
    expect(standings.every((line) => line.score === null)).toBe(true)
    expect(standings[0].note).toEqual({
      key: 'games.silent-table.note.reads',
      params: { reads: 1, levels: 1 },
    })
    for (const seat of [0, 1, 2, 3, 4]) expect(silentTable.legalActions(state, seat)).toEqual([])
    expect(refusal(state, READY, 0)).toBe(error('over'))
  })
})

describe('covering for an absent seat', () => {
  it('decides for them: the lowest chip on the table if they hold none, and ready', () => {
    const state = act(start(3), take(1), 0)
    expect(silentTable.skipAction?.(state, 1)).toEqual(pass(1))
    const next = act(state, pass(1), 'system')
    expect(next.players[1]).toMatchObject({ chip: 2, ready: true })
  })

  it('keeps the chip they hold', () => {
    const state = act(act(start(3), take(3), 1), pass(1), 'system')
    expect(state.players[1]).toMatchObject({ chip: 3, ready: true, movesLeft: MOVES_PER_ROUND })
  })

  it('can finish a round, and acknowledge a reveal, so the table never stays stuck', () => {
    let state = act(act(start(3), take(1), 0), take(2), 1)
    state = act(act(state, READY, 0), READY, 1)
    state = act(state, pass(2), 'system')
    // The chip it took moved, so the others have to accept it again
    expect(state.round).toBe(1)
    state = act(act(state, READY, 0), READY, 1)
    expect(state.round).toBe(2)

    state = settle(settle(state, [1, 2, 3]), [1, 2, 3])
    expect(state.phase === 'reveal' || state.phase === 'over').toBe(true)
    state = act(act(state, READY, 0), READY, 1)
    state = act(state, pass(2), 'system')
    expect(state).toMatchObject({ level: 2, phase: 'round' })
  })

  it('is harmless for a seat already ready, and comes only from the room', () => {
    const state = act(act(act(start(3), take(1), 0), READY, 0), pass(0), 'system')
    expect(state.players[0]).toMatchObject({ chip: 1, ready: true })
    expect(state.round).toBe(1)
    expect(refusal(start(3), pass(1), 1)).toBe(error('systemOnly'))
    expect(refusal(start(3), pass(9), 'system')).toBe(error('notAPlayer'))
    expect(refusal(start(3), take(1), 'system')).toBe(error('badAction'))
    expect(refusal(start(3), READY, 'system')).toBe(error('badAction'))
  })

  it('goes through the same match code the room uses', () => {
    const match = startMatch(silentTable, makeSeats(3), OPTIONS, 5)
    const next = applyAction(silentTable, match, pass(0), 'system')
    expect(isGameError(next)).toBe(false)
  })
})

describe('view trimming', () => {
  /** What `viewer` is really sent, as the text the socket would carry */
  const wire = (state: SilentTableState, viewer: Viewer) =>
    JSON.stringify(projectGame(silentTable, state, viewer))

  const onWire = (text: string, card: Card) => text.includes(`"${card}"`)

  it('a seat sees its own hole cards and not the others', () => {
    const state = start(4)
    const view = viewOf(state, 2)
    expect(view.you).toBe(2)
    expect(view.players[2].hole).toEqual(state.players[2].hole)
    for (const seat of [0, 1, 3]) expect(view.players[seat].hole).toBeNull()
  })

  it('a spectator sees no hole cards, unless the room chose to show them', () => {
    const closed = viewOf(start(4), 'spectator')
    expect(closed.you).toBeNull()
    expect(closed.players.every((player) => player.hole === null)).toBe(true)
    const open = start(4, { spectatorsSeeAll: true })
    expect(viewOf(open, 'spectator').players.map((player) => player.hole)).toEqual(
      open.players.map((player) => player.hole),
    )
    // That option is for spectators only
    expect(viewOf(open, 1).players[0].hole).toBeNull()
    // And it never shows the cards still to come
    expect(viewOf(open, 'spectator').community).toHaveLength(3)
  })

  it('shows every hand to everybody at the reveal', () => {
    const state = playLevel(start(3), [1, 2, 3])
    for (const viewer of [0, 1, 2, 'spectator'] as const) {
      expect(viewOf(state, viewer).players.map((player) => player.hole)).toEqual(
        state.players.map((player) => player.hole),
      )
    }
  })

  /** Whole games of random legal actions, looking at the wire text after every single one */
  function everyPosition(seats: number, seed: number, check: (state: SilentTableState) => void) {
    const chooser = createRng(seed ^ 0x51ed)
    let match = startMatch(silentTable, makeSeats(seats), OPTIONS, seed)
    check(match.state)
    while (!silentTable.isOver(match.state)) {
      const able = makeSeats(seats)
        .map((seat) => seat.id)
        .filter((seat) => silentTable.legalActions(match.state, seat).length > 0)
      const actor = chooser.pick(able)
      const action = chooser.pick(silentTable.legalActions(match.state, actor))
      const next = applyAction(silentTable, match, action, actor)
      if (isGameError(next)) throw new Error(next.gameError)
      match = next
      check(match.state)
    }
  }

  it.each([3, 4, 5, 6])('no serialised view leaks a hidden card, %i seats, over many seeds', (seats) => {
    let positions = 0
    let reveals = 0
    for (let seed = 0; seed < 10; seed++) {
      everyPosition(seats, seed * 37 + 1, (state) => {
        const viewers: Viewer[] = [...state.players.map((player) => player.seat), 'spectator']
        const shown = state.phase === 'round' ? [3, 4, 5][state.round - 1] : 5
        for (const viewer of viewers) {
          const text = wire(state, viewer)
          const wrong: string[] = []
          for (const player of state.players) {
            for (const card of player.hole) {
              const allowed = state.phase !== 'round' || player.seat === viewer
              // Both ways: the scan must see a card that is there, or it would prove nothing
              if (onWire(text, card) !== allowed) wrong.push(`seat ${player.seat} ${card}`)
            }
          }
          state.community.forEach((card, index) => {
            if (onWire(text, card) !== index < shown) wrong.push(`shared ${index} ${card}`)
          })
          expect(wrong, `what ${viewer} got`).toEqual([])
          if (state.phase === 'round') positions++
          else reveals++
        }
      })
    }
    expect(positions).toBeGreaterThan(0)
    expect(reveals).toBeGreaterThan(0)
  })

  it('keeps nothing else of the deck in the view', () => {
    const view = viewOf(start(3), 0)
    expect(Object.keys(view)).not.toContain('deck')
    expect(JSON.stringify(view).match(/"[2-9TJQKA][shdc]"/g)).toHaveLength(2 + 3)
  })
})

describe('whole games through the harness', () => {
  /** Others' hole cards until the reveal; the cards still to come, for everybody */
  const secrets = (state: SilentTableState, viewer: Viewer): Card[] => {
    if (state.phase !== 'round') return []
    const hole = state.spectatorsSeeAll && viewer === 'spectator'
      ? []
      : state.players.filter((player) => player.seat !== viewer).flatMap((player) => player.hole)
    return [...hole, ...state.community.slice([3, 4, 5][state.round - 1])]
  }

  const VARIATIONS: SilentTableOptions[] = [
    OPTIONS,
    { ...OPTIONS, allowTakeFromPlayers: false },
    { ...OPTIONS, spectatorsSeeAll: true },
    { levelsToWin: 1, failureLimit: 1, allowTakeFromPlayers: true, spectatorsSeeAll: false },
    { levelsToWin: 7, failureLimit: 5, allowTakeFromPlayers: true, spectatorsSeeAll: false },
  ]

  // The harness checks every action of every seat at every position, so a game at five or six seats
  // takes seconds: the many-seed run is the wire-text scan above, and these are a sample
  it.each([
    [3, 6],
    [4, 4],
    [5, 2],
    [6, 2],
  ])('plays out at %i seats with the defaults, inside the default step limit', (seats, seeds) => {
    for (let seed = 0; seed < seeds; seed++) {
      const { final } = playRandom(silentTable, { seed: seed * 101 + 7, seats, secrets })
      expect(silentTable.isOver(final.state)).toBe(true)
    }
  })

  it.each([3, 6])('plays out at %i seats under every kind of option', (seats) => {
    for (const options of VARIATIONS) {
      playRandom(silentTable, { seed: 11, seats, options, secrets, maxSteps: 20_000 })
    }
  })

  it('can both win and lose in play, over many seeds at the smallest table', () => {
    const endings = new Set<string | null>()
    const options = { ...OPTIONS, levelsToWin: 1 }
    for (let seed = 0; seed < 15; seed++) {
      const { final } = playRandom(silentTable, { seed, seats: 3, options, secrets })
      endings.add(final.state.ending)
    }
    expect([...endings].sort()).toEqual(['lost', 'won'])
  })
})

describe('strings', () => {
  const { en, 'zh-TW': zhTW } = silentTableMessages

  it('has the owner-chosen names', () => {
    expect(en['games.silent-table.name']).toBe('Silent Table')
    expect(zhTW['games.silent-table.name']).toBe('默契牌局')
  })

  it('has the same keys in both languages, and every string filled in', () => {
    expect(Object.keys(zhTW).sort()).toEqual(Object.keys(en).sort())
    for (const value of [...Object.values(en), ...Object.values(zhTW)]) {
      expect(value.trim()).not.toBe('')
    }
  })

  it('the same params fill the same placeholders in both languages', () => {
    const holes = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
    for (const key of Object.keys(en)) expect(holes(zhTW[key]), key).toEqual(holes(en[key]))
  })

  it('has every key the module refers to', () => {
    const fields = Object.values(silentTable.options)
    const won = playLevel(start(3, { levelsToWin: 1 }), rightChips(start(3)))
    const lost = playLevel(start(3, { failureLimit: 1 }), wrongChips(start(3)))
    const referred = [
      `${silentTable.meta.i18nKey}.name`,
      `${silentTable.meta.i18nKey}.summary`,
      ...fields.map((field) => field.labelKey),
      ...HAND_CATEGORIES.map((category) => `games.silent-table.hand.${category}`),
      ...[won, lost].flatMap((state) => {
        const result = silentTable.result(state)
        return [result.summary.key, ...result.standings.map((line) => line.note.key)]
      }),
    ]
    for (const key of referred) expect(Object.keys(en), key).toContain(key)
  })

  it('keeps to the neutral theme, in both languages', () => {
    const banned = /heist|gang|steal|\brob|thief|vault|alarm|盜|搶|竊|金庫|保險箱|幫/i
    for (const [key, value] of [...Object.entries(en), ...Object.entries(zhTW)]) {
      expect(value, key).not.toMatch(banned)
    }
  })
})
