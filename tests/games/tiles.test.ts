import { describe, expect, it, vi } from 'vitest'
import { GAME_MESSAGES } from '../../shared/games/catalog.ts'
import { getGame, LOBBY_GAMES } from '../../shared/games/index.ts'
import { makeSeats } from '../../shared/games/match.ts'
import { defaultOptions } from '../../shared/games/options.ts'
import { createRng } from '../../shared/games/rng.ts'
import { SCREEN_MESSAGES } from '../../shared/games/screenMessages.ts'
import { SCORED_MS, scoreRound, tiles } from '../../shared/games/tiles/rules.ts'
import {
  checkArrangement,
  checkTurn,
  displayOrder,
  isValidSet,
  JOKERS,
  numberOf,
  openingPoints,
  rackValue,
  readSet,
  setValue,
  suitOf,
  TILE_COUNT,
} from '../../shared/games/tiles/tiles.ts'
import type { TileId, TilesAction, TilesOptions, TilesState, TileTable } from '../../shared/games/tiles/types.ts'
import { isGameError, type Actor, type GameError } from '../../shared/games/types.ts'
import { playRandom } from './harness.ts'

// 社辦牌陣 (working title Clubroom Tiles), the owner's request of 2026-11-14

vi.setConfig({ testTimeout: 60_000 })

const OPTIONS: TilesOptions = { clock: 90, rounds: 1 }

/** A numbered tile: suit 0–3 (spades, hearts, diamonds, clubs), number 1–13, first or second copy */
const T = (suit: number, number: number, copy = 0): TileId => suit * 26 + (number - 1) * 2 + copy
const S = (number: number, copy = 0) => T(0, number, copy)
const H = (number: number, copy = 0) => T(1, number, copy)
const D = (number: number, copy = 0) => T(2, number, copy)
const C = (number: number, copy = 0) => T(3, number, copy)
const [J1, J2] = JOKERS

const start = (seats = 2, overrides: Partial<TilesOptions> = {}, seed = 1) =>
  tiles.init(makeSeats(seats), { ...OPTIONS, ...overrides }, createRng(seed))

/**
 * A state set up by hand: seat 0's turn unless said, the racks, table and pool given, and every
 * other tile out of the game (as if in the pool's far end, which a test never reaches)
 */
function setUp(parts: Partial<TilesState> & { racks: TileId[][] }): TilesState {
  const base = start(parts.racks.length)
  return {
    ...base,
    turn: 0,
    table: [],
    draft: null,
    pool: [],
    melded: parts.racks.map(() => false),
    ...parts,
  }
}

function act(state: TilesState, action: TilesAction, actor: Actor, seed = 7): TilesState {
  const next = tiles.reduce(state, action, actor, createRng(seed))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)} by ${actor}: ${next.gameError}`)
  return next
}

const refusal = (state: TilesState, action: unknown, actor: Actor): string => {
  const answer = tiles.reduce(state, action as TilesAction, actor, createRng(7))
  expect(isGameError(answer)).toBe(true)
  return (answer as GameError).gameError
}

const error = (name: string) => `games.tiles.error.${name}`

describe('the tiles', () => {
  it('are 106: 1–13 in four suits twice, and two wildcards', () => {
    expect(TILE_COUNT).toBe(106)
    const counts = new Map<string, number>()
    for (let tile = 0; tile < 104; tile++) {
      const name = `${suitOf(tile)}-${numberOf(tile)}`
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    expect(counts.size).toBe(52)
    expect([...counts.values()].every((count) => count === 2)).toBe(true)
    expect(JOKERS).toEqual([104, 105])
    expect([suitOf(S(1)), numberOf(S(1)), suitOf(C(13, 1)), numberOf(C(13, 1))]).toEqual([0, 1, 3, 13])
  })

  it('cost their number in a rack at the end, a wildcard 30', () => {
    expect(rackValue([S(5), H(13), J1])).toBe(48)
    expect(rackValue([])).toBe(0)
  })
})

describe('groups', () => {
  it('are three or four of a number in different suits', () => {
    expect(readSet([S(7), H(7), D(7)])).toMatchObject({ kind: 'group', value: 21 })
    expect(readSet([S(7), H(7), D(7), C(7)])).toMatchObject({ kind: 'group', value: 28 })
  })

  it('take no suit twice, no fifth tile, no other number', () => {
    expect(isValidSet([S(7), S(7, 1), H(7)])).toBe(false)
    expect(isValidSet([S(7), H(7), D(7), C(7), S(7, 1)])).toBe(false)
    expect(isValidSet([S(7), H(7), D(8)])).toBe(false)
    expect(isValidSet([S(7), H(7)])).toBe(false)
  })

  it('let a wildcard stand in for a missing suit', () => {
    expect(readSet([S(10), H(10), J1])).toMatchObject({ kind: 'group', value: 30 })
    expect(readSet([S(10), H(10), D(10), J1])).toMatchObject({ kind: 'group', value: 40 })
    expect(readSet([S(10), J1, J2, H(10)])).toMatchObject({ kind: 'group', value: 40 })
  })

  it('cannot grow past four with a wildcard', () => {
    expect(isValidSet([S(10), H(10), D(10), C(10), J1])).toBe(false)
  })

  it('keep a wildcard from making a suit twice right', () => {
    expect(isValidSet([S(4), S(4, 1), J1])).toBe(false)
  })
})

describe('runs', () => {
  it('are three or more numbers in a row in one suit', () => {
    expect(readSet([H(3), H(4), H(5)])).toMatchObject({ kind: 'run', value: 12 })
    expect(readSet([H(5), H(3), H(4)])).toMatchObject({ kind: 'run', value: 12 })
    const all = Array.from({ length: 13 }, (_, index) => D(index + 1))
    expect(readSet(all)).toMatchObject({ kind: 'run', value: 91 })
  })

  it('take one suit, no gaps and no number twice', () => {
    expect(isValidSet([H(3), H(4), S(5)])).toBe(false)
    expect(isValidSet([H(3), H(4), H(6)])).toBe(false)
    expect(isValidSet([H(3), H(4), H(4, 1), H(5)])).toBe(false)
    expect(isValidSet([H(3), H(4)])).toBe(false)
  })

  it('let a wildcard fill a gap', () => {
    expect(readSet([C(5), J1, C(7)])).toMatchObject({ kind: 'run', numbers: [5, 6, 7], value: 18 })
    expect(readSet([C(5), J1, J2, C(8)])).toMatchObject({ kind: 'run', numbers: [5, 6, 7, 8] })
    expect(isValidSet([C(5), J1, C(8)])).toBe(false)
  })

  it('read a wildcard at an end as high as it can go', () => {
    expect(readSet([C(5), C(6), J1])).toMatchObject({ numbers: [5, 6, 7], value: 18 })
    expect(readSet([J1, C(5), C(6)])).toMatchObject({ numbers: [5, 6, 7], value: 18 })
  })

  it('end at 13: 12-13 and a wildcard is 11-12-13', () => {
    expect(readSet([S(12), S(13), J1])).toMatchObject({ kind: 'run', numbers: [11, 12, 13], value: 36 })
    // 13 and two wildcards is a run 11-12-13 (36) too, but as three 13s it is worth more
    expect(readSet([S(13), J1, J2])).toMatchObject({ kind: 'group', value: 39 })
  })

  it('start at 1: 1-2 and a wildcard is 1-2-3', () => {
    expect(readSet([S(1), S(2), J1])).toMatchObject({ kind: 'run', numbers: [1, 2, 3], value: 6 })
  })

  it('do not wrap: 1 never comes after 13', () => {
    expect(isValidSet([S(12), S(13), S(1)])).toBe(false)
    expect(isValidSet([S(13), S(1), S(2)])).toBe(false)
    expect(isValidSet([S(13), S(1), J1])).toBe(false)
  })

  it('cannot be longer than 1 to 13', () => {
    const all = Array.from({ length: 13 }, (_, index) => D(index + 1))
    expect(isValidSet([...all, J1])).toBe(false)
    expect(isValidSet([...all.slice(1), J1])).toBe(true)
    expect(isValidSet([...all.slice(2), J1, J2])).toBe(true)
  })

  it('read a lone number with two wildcards as the better of a run and a group', () => {
    expect(readSet([H(7), J1, J2])).toMatchObject({ kind: 'run', value: 24 })
    expect(readSet([H(13), J1, J2])).toMatchObject({ kind: 'group', value: 39 })
  })

  it('cannot be made of wildcards alone', () => {
    expect(isValidSet([J1, J2])).toBe(false)
    expect(setValue([J1, J2])).toBe(0)
  })
})

describe('the order a set is shown in', () => {
  it('puts each wildcard where it stands in a run', () => {
    expect(displayOrder([C(7), J1, C(5)])).toEqual([C(5), J1, C(7)])
    expect(displayOrder([J1, S(12), S(13)])).toEqual([J1, S(12), S(13)])
    expect(displayOrder([J1, S(5), S(6)])).toEqual([S(5), S(6), J1])
  })

  it('puts a group in suit order, the wildcards last', () => {
    expect(displayOrder([D(9), J1, S(9)])).toEqual([S(9), D(9), J1])
  })
})

describe('a legal table: only tiles from the rack added, no table tile gone', () => {
  const table: TileTable = [
    [S(5), J1, S(7)],
    [H(9), D(9), C(9)],
  ]

  it('accepts a split and rejoin with a tile from the rack, and says what was added', () => {
    const draft = [
      [S(5), S(6), S(7)],
      [H(9), D(9), C(9), S(9)],
    ]
    // The wildcard is gone from the table: refused
    expect(checkArrangement(table, draft, [S(6), S(9)])).toEqual({ ok: false, problem: 'tableTileGone' })
    const keepJoker = [
      [S(5), S(6), S(7)],
      [H(9), D(9), C(9)],
      [S(8), J1, S(10)],
    ]
    expect(checkTurn(table, keepJoker, [S(6), S(8), S(10)], true)).toEqual({ ok: true, added: [S(6), S(8), S(10)] })
  })

  it('lets a wildcard be taken back by its tile, as long as it is used again this turn', () => {
    const rack = [S(6), H(12), D(12)]
    const reused = [
      [S(5), S(6), S(7)],
      [H(9), D(9), C(9)],
      [H(12), D(12), J1],
    ]
    expect(checkTurn(table, reused, rack, true).ok).toBe(true)
    // Taken back and left lying alone: not a set
    const leftAlone = [[S(5), S(6), S(7)], [H(9), D(9), C(9)], [J1]]
    expect(checkTurn(table, leftAlone, rack, true)).toEqual({ ok: false, problem: 'invalidSet' })
    // Taken back into the rack: a table tile left the table
    expect(checkTurn(table, [[S(5), S(6), S(7)], [H(9), D(9), C(9)]], rack, true)).toEqual({
      ok: false,
      problem: 'tableTileGone',
    })
  })

  it('refuses a tile that was neither on the table nor in the rack', () => {
    expect(checkArrangement(table, [...table, [H(1), H(2), H(3)]], [H(1), H(2)])).toEqual({
      ok: false,
      problem: 'notYourTile',
    })
  })

  it('refuses a tile twice, or a number that is no tile', () => {
    expect(checkArrangement(table, [...table, [S(5)]], [S(5)])).toEqual({ ok: false, problem: 'badTiles' })
    expect(checkArrangement(table, [...table, [999]], [])).toEqual({ ok: false, problem: 'badTiles' })
    expect(checkArrangement(table, [...table, [1.5]], [])).toEqual({ ok: false, problem: 'badTiles' })
  })

  it('takes any arrangement of the right tiles mid-turn, valid sets or not', () => {
    expect(checkArrangement(table, [[S(5)], [J1, S(7), H(9)], [D(9), C(9), H(1)]], [H(1)])).toEqual({
      ok: true,
      added: [H(1)],
    })
  })

  it('wants at least one tile from the rack to end a turn', () => {
    const shuffled = [
      [H(9), D(9), C(9)],
      [S(7), S(5), J1],
    ]
    expect(checkTurn(table, shuffled, [H(1)], true)).toEqual({ ok: false, problem: 'nothingAdded' })
  })

  it('wants every set valid to end a turn', () => {
    expect(checkTurn(table, [...table, [H(1), H(2)]], [H(1), H(2)], true)).toEqual({ ok: false, problem: 'invalidSet' })
  })
})

describe('the first play', () => {
  const table: TileTable = [[H(9), D(9), C(9)]]

  it('needs 30 points of new sets from the rack alone', () => {
    const rack = [S(10), H(10), D(10), C(2)]
    expect(checkTurn(table, [...table, [S(10), H(10), D(10)]], rack, false).ok).toBe(true)
    expect(checkTurn([], [[S(9), H(9), D(9)]], [S(9), H(9), D(9)], false)).toEqual({ ok: false, problem: 'openingLow' })
  })

  it('may add up several sets', () => {
    const rack = [S(1), S(2), S(3), H(8), D(8), C(8)]
    const draft = [...table, [S(1), S(2), S(3)], [H(8), D(8), C(8)]]
    expect(openingPoints(table, draft)).toBe(30)
    expect(checkTurn(table, draft, rack, false).ok).toBe(true)
  })

  it('counts a wildcard as the number it stands for', () => {
    expect(checkTurn([], [[S(10), H(10), J1]], [S(10), H(10), J1], false).ok).toBe(true)
    expect(checkTurn([], [[S(12), S(13), J1]], [S(12), S(13), J1], false).ok).toBe(true)
  })

  it('may not touch the sets already on the table', () => {
    const rack = [S(9), S(10), H(10), D(10)]
    const added = [
      [H(9), D(9), C(9), S(9)],
      [S(10), H(10), D(10)],
    ]
    expect(checkTurn(table, added, rack, false)).toEqual({ ok: false, problem: 'openingTouched' })
    // Once opened, the same table is fine
    expect(checkTurn(table, added, rack, true).ok).toBe(true)
  })

  it('does not count a table tile used in a new set', () => {
    const draft = [[H(9), D(9), H(10)], [C(9), S(10), D(10)]]
    expect(openingPoints(table, draft)).toBe(0)
  })
})

describe('the catalog', () => {
  it('is listed, with defaults, and strings in both languages', () => {
    expect(getGame('tiles')).toBe(tiles)
    expect(LOBBY_GAMES.map((game) => game.id)).toContain('tiles')
    expect(defaultOptions(tiles.options)).toEqual(OPTIONS)
    expect([tiles.meta.minPlayers, tiles.meta.maxPlayers]).toEqual([2, 4])
    for (const language of ['en', 'zh-TW'] as const) {
      expect(GAME_MESSAGES[language]['games.tiles.name']).toBeTruthy()
      expect(SCREEN_MESSAGES[language]['games.tiles.ui.done']).toBeTruthy()
    }
  })
})

describe('the deal', () => {
  it.each([2, 3, 4])('gives %i players 14 each and leaves the rest in the pool', (players) => {
    const state = start(players)
    expect(state.racks).toHaveLength(players)
    expect(state.racks.every((rack) => rack.length === 14)).toBe(true)
    expect(state.pool).toHaveLength(106 - 14 * players)
    expect(new Set([...state.racks.flat(), ...state.pool]).size).toBe(106)
    expect(state.table).toEqual([])
    expect(state.melded.every((done) => !done)).toBe(true)
  })

  it('starts with a random player and moves the start on each round', () => {
    const starters = new Set<number>()
    for (let seed = 1; seed <= 20; seed++) starters.add(start(3, {}, seed).turn)
    expect(starters.size).toBe(3)
  })
})

describe('a turn', () => {
  const rack0 = [S(10), H(10), D(10), C(1), C(2)]
  const rack1 = [S(1), S(2), S(3), H(5)]
  const base = () => setUp({ racks: [rack0, rack1], pool: [C(13), C(12)] })

  it('only for the player on turn', () => {
    const state = base()
    expect(refusal(state, { type: 'draw' }, 1)).toBe(error('notYourTurn'))
    expect(refusal(state, { type: 'arrange', sets: [[S(1)]] }, 1)).toBe(error('notYourTurn'))
    expect(refusal(state, { type: 'draw' }, 5)).toBe(error('notAPlayer'))
    expect(refusal(state, { type: 'draw' }, 'system')).toBe(error('badAction'))
  })

  it('refuses junk', () => {
    const state = base()
    for (const junk of [null, 'draw', [], { type: 'arrange' }, { type: 'arrange', sets: [[1, 'x']] }, { type: 'arrange', sets: 'x' }, { type: 'commit', sets: [3] }, { type: 'skip' }]) {
      expect(refusal(state, junk, 0)).toBe(error('badAction'))
    }
  })

  it('keeps a draft everyone sees, checked only for its tiles', () => {
    const state = act(base(), { type: 'arrange', sets: [[S(10), H(10)], []] }, 0)
    expect(state.draft).toEqual([[S(10), H(10)]])
    expect(state.table).toEqual([])
    expect(tiles.view(state, 1).draft).toEqual([[S(10), H(10)]])
    expect(tiles.view(state, 'spectator').draft).toEqual([[S(10), H(10)]])
    expect(refusal(state, { type: 'arrange', sets: [[S(1)]] }, 0)).toBe(error('notYourTile'))
    // Not ready to end the turn yet: no Done offered
    expect(tiles.legalActions(state, 0).map((action) => action.type)).toEqual(['draw', 'arrange', 'reset'])
  })

  it('goes back to the table as it was on reset', () => {
    const drafted = act(base(), { type: 'arrange', sets: [[S(10), H(10)]] }, 0)
    expect(act(drafted, { type: 'reset' }, 0).draft).toBeNull()
  })

  it('ends with a play that passes, offered as Done once the draft would pass', () => {
    const drafted = act(base(), { type: 'arrange', sets: [[S(10), H(10), D(10)]] }, 0)
    expect(tiles.legalActions(drafted, 0)).toContainEqual({ type: 'commit' })
    const played = act(drafted, { type: 'commit' }, 0)
    expect(played.table).toEqual([[S(10), H(10), D(10)]])
    expect(played.draft).toBeNull()
    expect(played.racks[0]).toEqual([C(1), C(2)])
    expect(played.melded).toEqual([true, false])
    expect(played.turn).toBe(1)
    expect(played.turnNo).toBe(drafted.turnNo + 1)
    expect(played.last).toEqual({ kind: 'played', seat: 0, tiles: 3, first: true })
  })

  it('may end with the table sent at once', () => {
    const played = act(base(), { type: 'commit', sets: [[S(10), H(10), D(10)]] }, 0)
    expect(played.racks[0]).toEqual([C(1), C(2)])
  })

  it('refuses a play that does not pass and leaves the state as it was', () => {
    const state = base()
    expect(refusal(state, { type: 'commit', sets: [[S(10), H(10)]] }, 0)).toBe(error('invalidSet'))
    expect(refusal(state, { type: 'commit' }, 0)).toBe(error('nothingAdded'))
    expect(refusal(state, { type: 'commit', sets: [[C(1), C(2), J1]] }, 0)).toBe(error('notYourTile'))
    const low = setUp({ racks: [[S(1), S(2), S(3)], rack1] })
    expect(refusal(low, { type: 'commit', sets: [[S(1), S(2), S(3)]] }, 0)).toBe(error('openingLow'))
  })

  it('ends with a draw: the table goes back and a tile comes from the pool', () => {
    const drafted = act(base(), { type: 'arrange', sets: [[S(10), H(10)]] }, 0)
    const drawn = act(drafted, { type: 'draw' }, 0)
    expect(drawn.draft).toBeNull()
    expect(drawn.racks[0]).toEqual([...rack0, C(13)])
    expect(drawn.pool).toEqual([C(12)])
    expect(drawn.turn).toBe(1)
    expect(drawn.last).toEqual({ kind: 'drew', seat: 0, why: 'chose' })
  })
})

describe('the turn clock', () => {
  it('asks for one countdown per turn, of the host’s length', () => {
    const state = start(2, { clock: 60 })
    expect(tiles.timers?.(state)).toEqual([{ id: 'turn-1-1', ms: 60_000, action: { type: 'timeUp' } }])
    const next = act(state, { type: 'draw' }, state.players[state.turn])
    expect(tiles.timers?.(next)?.[0].id).toBe('turn-1-2')
    expect(tiles.timers?.(start(2, { clock: 120 }))?.[0].ms).toBe(120_000)
  })

  it('keeps running while the player moves tiles', () => {
    const state = setUp({ racks: [[S(10), H(10)], [S(1)]], pool: [C(5)] })
    const moved = act(state, { type: 'arrange', sets: [[S(10)]] }, 0)
    expect(tiles.timers?.(moved)).toEqual(tiles.timers?.(state))
  })

  it('is off when the host says so', () => {
    expect(tiles.timers?.(start(2, { clock: 0 }))).toEqual([])
  })

  it('runs out: the table goes back and the player draws', () => {
    const state = setUp({ racks: [[S(10), H(10)], [S(1)]], pool: [C(5)] })
    const moved = act(state, { type: 'arrange', sets: [[S(10), H(10)]] }, 0)
    expect(refusal(moved, { type: 'timeUp' }, 0)).toBe(error('systemOnly'))
    const out = act(moved, { type: 'timeUp' }, 'system')
    expect(out.table).toEqual([])
    expect(out.racks[0]).toEqual([S(10), H(10), C(5)])
    expect(out.last).toEqual({ kind: 'drew', seat: 0, why: 'timeUp' })
  })
})

describe('a player who is gone', () => {
  it('is skipped by the room only on their turn, as a draw', () => {
    const state = setUp({ racks: [[S(10)], [S(1)]], pool: [C(5)] })
    expect(tiles.skipAction?.(state, 0)).toEqual({ type: 'skip', seat: 0 })
    expect(tiles.skipAction?.(state, 1)).toBeNull()
    expect(refusal(state, { type: 'skip', seat: 1 }, 'system')).toBe(error('nothingToSkip'))
    expect(refusal(state, { type: 'skip', seat: 0 }, 1)).toBe(error('systemOnly'))
    const skipped = act(state, { type: 'skip', seat: 0 }, 'system')
    expect(skipped.racks[0]).toEqual([S(10), C(5)])
    expect(skipped.last).toEqual({ kind: 'drew', seat: 0, why: 'skipped' })
  })
})

describe('the end of a round', () => {
  it('comes when someone empties their rack: the others pay what they hold, the winner takes it', () => {
    const state = setUp({
      racks: [[S(4), S(5), S(6)], [H(13), J1], [D(2)]],
      table: [[C(7), C(8), C(9)]],
      melded: [true, true, false],
    })
    const over = act(state, { type: 'commit', sets: [[C(7), C(8), C(9)], [S(4), S(5), S(6)]] }, 0)
    expect(over.phase).toBe('over')
    expect(over.history[0]).toEqual({
      round: 1,
      winners: [0],
      out: true,
      racks: [[], [H(13), J1], [D(2)]],
      deltas: [45, -43, -2],
    })
    expect(over.scores).toEqual([45, -43, -2])
    expect(tiles.isOver(over)).toBe(true)
    expect(tiles.legalActions(over, 1)).toEqual([])
    expect(refusal(over, { type: 'draw' }, 1)).toBe(error('over'))
    const result = tiles.result(over)
    expect(result.summary).toEqual({ key: 'games.tiles.result.won', params: { score: 45, rounds: 1, winners: 1 } })
    expect(result.standings.map((line) => [line.seat, line.rank, line.score])).toEqual([
      [0, 1, 45],
      [2, 2, -2],
      [1, 3, -43],
    ])
    expect(result.standings[0].note).toEqual({ key: 'games.tiles.note.out' })
    expect(result.standings[2].note).toEqual({ key: 'games.tiles.note.left', params: { tiles: 2, points: 43 } })
  })

  it('comes, with the pool empty, after everyone in a row passes: the lowest rack wins', () => {
    let state = setUp({ racks: [[S(9)], [H(2), H(3)], [D(13)]] })
    state = act(state, { type: 'draw' }, 0)
    expect(state.last).toEqual({ kind: 'passed', seat: 0, why: 'chose' })
    expect(state.passes).toBe(1)
    state = act(state, { type: 'draw' }, 1)
    expect(state.phase).toBe('play')
    state = act(state, { type: 'timeUp' }, 'system')
    expect(state.phase).toBe('over')
    expect(state.history[0]).toMatchObject({ winners: [1], out: false, deltas: [-9, 22, -13] })
  })

  it('starts the count of passes again after a play', () => {
    let state = setUp({ racks: [[S(9)], [H(2), H(3), H(4), H(9)], [D(13)]], melded: [true, true, true] })
    state = act(state, { type: 'draw' }, 0)
    state = act(state, { type: 'commit', sets: [[H(2), H(3), H(4)]] }, 1)
    expect(state.passes).toBe(0)
  })

  it('splits the winner’s gain between tied lowest racks, rounded down', () => {
    expect(scoreRound([[S(3)], [H(3)], [D(13)]], null)).toEqual({ winners: [0, 1], deltas: [6, 6, -13] })
    expect(scoreRound([[S(3)], [H(3)], [D(12)], [J1]], null)).toEqual({ winners: [0, 1], deltas: [21, 21, -12, -30] })
    expect(scoreRound([[], [H(3)]], 0)).toEqual({ winners: [0], deltas: [3, -3] })
  })
})

describe('more than one round', () => {
  const twoRounds = () =>
    setUp({
      racks: [[S(4), S(5), S(6)], [H(13)]],
      table: [[C(7), C(8), C(9)]],
      melded: [true, true],
      totalRounds: 2,
    })

  it('shows the score until anyone goes on, or the clock deals the next round', () => {
    const scored = act(twoRounds(), { type: 'commit', sets: [[C(7), C(8), C(9)], [S(4), S(5), S(6)]] }, 0)
    expect(scored.phase).toBe('scored')
    expect(tiles.isOver(scored)).toBe(false)
    expect(tiles.legalActions(scored, 0)).toEqual([{ type: 'next' }])
    expect(tiles.legalActions(scored, 1)).toEqual([{ type: 'next' }])
    expect(tiles.timers?.(scored)).toEqual([{ id: 'scored-1', ms: SCORED_MS, action: { type: 'next' } }])
    expect(refusal(scored, { type: 'draw' }, 1)).toBe(error('notPlaying'))
    const next = act(scored, { type: 'next' }, 1)
    expect(next.round).toBe(2)
    expect(next.phase).toBe('play')
    expect(next.racks.every((rack) => rack.length === 14)).toBe(true)
    expect(next.melded).toEqual([false, false])
    expect(next.table).toEqual([])
    expect(next.scores).toEqual([13, -13])
    // The start moves on a seat
    expect(next.turn).toBe((scored.firstStarter + 1) % 2)
    expect(act(scored, { type: 'next' }, 'system').round).toBe(2)
    expect(refusal(next, { type: 'next' }, 0)).toBe(error('notScored'))
  })

  it('notes the rounds each player won at the end', () => {
    const scored = act(twoRounds(), { type: 'commit', sets: [[C(7), C(8), C(9)], [S(4), S(5), S(6)]] }, 0)
    const last = { ...act(scored, { type: 'next' }, 0), racks: [[S(1)], [H(1), H(2), H(3)]], pool: [], melded: [true, true], table: [] }
    const turnOf1 = { ...last, turn: 1 }
    const over = act(turnOf1, { type: 'commit', sets: [[H(1), H(2), H(3)]] }, 1)
    expect(over.phase).toBe('over')
    const result = tiles.result(over)
    expect(result.standings.map((line) => line.note)).toEqual([
      { key: 'games.tiles.note.wins', params: { wins: 1 } },
      { key: 'games.tiles.note.wins', params: { wins: 1 } },
    ])
    expect(result.summary.key).toBe('games.tiles.result.wonRounds')
  })
})

describe('the view', () => {
  it('shows each seat its own rack, the others only counts, and the pool only its size', () => {
    const state = start(3)
    for (const seat of [0, 1, 2]) {
      const view = tiles.view(state, seat)
      expect(view.rack).toEqual(state.racks[seat])
      expect(view.you).toBe(seat)
      expect(view.pool).toBe(state.pool.length)
      expect(view.seats.map((entry) => entry.tiles)).toEqual([14, 14, 14])
      const text = JSON.stringify(view)
      for (const other of [0, 1, 2].filter((each) => each !== seat)) {
        expect(text).not.toContain(JSON.stringify(state.racks[other]))
      }
      expect(text).not.toContain(JSON.stringify(state.pool))
    }
    const spectator = tiles.view(state, 'spectator')
    expect(spectator.rack).toBeNull()
    expect(spectator.you).toBeNull()
  })

  it('offers no hint: Done appears only for a draft that passes, never for a play the rack could make', () => {
    const state = setUp({ racks: [[S(10), H(10), D(10)], [S(1)]] })
    expect(tiles.legalActions(state, 0).map((action) => action.type)).toEqual(['draw', 'arrange'])
    expect(tiles.legalActions(state, 1)).toEqual([])
  })
})

/** Rack-only sets a simple player would lay: groups and runs of three or more, no wildcards */
function findSets(rack: readonly TileId[]): TileTable {
  const left = new Set(rack.filter((tile) => tile < 104))
  const sets: TileTable = []
  for (let suit = 0; suit < 4; suit++) {
    let run: TileId[] = []
    for (let number = 1; number <= 14; number++) {
      const tile = [T(suit, number), T(suit, number, 1)].find((each) => number <= 13 && left.has(each))
      if (tile !== undefined) run.push(tile)
      else {
        if (run.length >= 3) {
          sets.push(run)
          run.forEach((each) => left.delete(each))
        }
        run = []
      }
    }
  }
  for (let number = 1; number <= 13; number++) {
    const group = [0, 1, 2, 3]
      .map((suit) => [T(suit, number), T(suit, number, 1)].find((each) => left.has(each)))
      .filter((tile): tile is TileId => tile !== undefined)
    if (group.length >= 3) {
      sets.push(group)
      group.forEach((each) => left.delete(each))
    }
  }
  return sets
}

describe('whole games', () => {
  it.each([2, 3, 4])('plays random %i-player games to the end, with no secrets leaking', (players) => {
    for (const seed of [1, 2, 3]) {
      playRandom(tiles, {
        seed,
        seats: players,
        options: { clock: 60, rounds: 2 },
        // A round's end lays every rack open (the score shows them); until then they are secret
        secrets: (state, viewer) =>
          state.phase !== 'play' ? [] : [
          state.pool.length > 1 ? state.pool : [],
          ...state.racks.filter((rack, index) => state.players[index] !== viewer && rack.length > 1),
        ].filter((secret) => secret.length > 0),
      })
    }
  })

  it('keeps every tile in the game and every set valid while simple players play it out', () => {
    let outs = 0
    for (let seed = 1; seed <= 30; seed++) {
      let state = start(2 + (seed % 3), { rounds: 2 }, seed)
      for (let step = 0; step < 2000 && state.phase !== 'over'; step++) {
        if (state.phase === 'scored') {
          state = act(state, { type: 'next' }, 'system', seed + step)
          continue
        }
        const seat = state.players[state.turn]
        const found = findSets(state.racks[state.turn])
        const value = found.reduce((sum, set) => sum + setValue(set), 0)
        const opening = !state.melded[state.turn]
        const table = opening && value < 30 ? state.table : [...state.table, ...found].map((set) => [...set])
        // Once opened, each tile left that fits on the end of a set goes there too
        let laid = opening ? (value >= 30 ? found.flat().length : 0) : found.flat().length
        if (!opening) {
          const used = new Set(found.flat())
          for (const tile of state.racks[state.turn].filter((each) => !used.has(each))) {
            const set = table.find((each) => isValidSet([...each, tile]))
            if (set) {
              set.push(tile)
              laid++
            }
          }
        }
        state = act(state, laid > 0 ? { type: 'commit', sets: table } : { type: 'draw' }, seat, seed + step)
        const all = [...state.racks.flat(), ...state.pool, ...state.table.flat()]
        expect(all).toHaveLength(106)
        expect(new Set(all).size).toBe(106)
        expect(state.table.every(isValidSet)).toBe(true)
      }
      expect(state.phase).toBe('over')
      const total = state.scores.reduce((sum, score) => sum + score, 0)
      // Zero-sum unless tied winners split with a remainder
      expect(Math.abs(total)).toBeLessThan(state.players.length * 2)
      outs += state.history.filter((round) => round.out).length
    }
    // Some rounds were won by going out, not only by the pool running dry
    expect(outs).toBeGreaterThan(0)
  })
})
