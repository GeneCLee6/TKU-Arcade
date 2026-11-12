import { describe, expect, it, vi } from 'vitest'
import { GAME_IDS, getGame } from '../../shared/games/index.ts'
import { applyAction, makeSeats, projectGame, startMatch } from '../../shared/games/match.ts'
import { defaultOptions, parseOptions } from '../../shared/games/options.ts'
import {
  BOARD,
  END_CELL,
  FACES,
  getCell,
  MAX_RANK,
  START_CELL,
  type Face,
} from '../../shared/games/promotion/board.ts'
import { promotionDetailMessages } from '../../shared/games/promotion/i18n.detail.ts'
import { promotionMessages } from '../../shared/games/promotion/i18n.ts'
import {
  DEFAULT_TURN_LIMIT,
  faceFromDice,
  promotionSimple as promotion,
  SIX_SIDED_TABLE,
} from '../../shared/games/promotion/rules.ts'
import type {
  PromotionOptions,
  PromotionPlayer,
  PromotionState,
} from '../../shared/games/promotion/types.ts'
import { isGameError, type Actor, type GameError, type Rng } from '../../shared/games/types.ts'
import { playRandom } from './harness.ts'

// The harness plays whole games over many seeds, which goes past 5 s on a busy machine
vi.setConfig({ testTimeout: 60_000 })

const options: PromotionOptions = { dice: 'four-sided', turnLimit: DEFAULT_TURN_LIMIT, edition: 'simple' }
const ROLL = { type: 'roll' as const }

/** An Rng that answers the four-sided top from a list of results, and opens with the first seat */
function scripted(faces: readonly Face[]): Rng {
  const queue = [...faces]
  return {
    float: () => 0,
    int: () => 0,
    pick<T>(items: readonly T[]): T {
      if (items !== (FACES as readonly unknown[])) return items[0]
      const face = queue.shift()
      if (face === undefined) throw new Error('the script ran out')
      return face as T
    },
    shuffle: <T>(items: readonly T[]) => [...items],
  }
}

const start = (seats: number, overrides: Partial<PromotionOptions> = {}): PromotionState =>
  promotion.init(makeSeats(seats), { ...options, ...overrides }, scripted([]))

/** Rolls `faces` in turn order from `state`; each must be accepted */
function rollAll(state: PromotionState, faces: readonly Face[]): PromotionState {
  const rng = scripted(faces)
  return faces.reduce((current) => {
    const next = promotion.reduce(current, ROLL, current.turn as number, rng)
    if (isGameError(next)) throw new Error(next.gameError)
    return next
  }, state)
}

const standingOn = (state: PromotionState, cells: readonly string[]): PromotionState => ({
  ...state,
  players: state.players.map((player, index): PromotionPlayer => ({ ...player, cell: cells[index] })),
})

const isRefused = (answer: unknown): GameError => {
  expect(isGameError(answer)).toBe(true)
  return answer as GameError
}

describe('promotion board data', () => {
  const ids = BOARD.map((cell) => cell.id)

  it('has 60 to 80 cells with unique ids, from the start cell to the end cell', () => {
    expect(BOARD.length).toBeGreaterThanOrEqual(60)
    expect(BOARD.length).toBeLessThanOrEqual(80)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0]).toBe(START_CELL)
    expect(ids.at(-1)).toBe(END_CELL)
    expect(getCell(END_CELL).rank).toBe(MAX_RANK)
  })

  it('names every cell in both languages: zh-TW in Chinese, English as "Pinyin (Gloss)"', () => {
    for (const { id, name } of BOARD) {
      expect(name['zh-TW'], id).toMatch(/^\p{Script=Han}+$/u)
      expect(name.en, id).toMatch(/^[A-Z][\w' -]* \([A-Z][\w ,-]*\)$/)
    }
    expect(new Set(BOARD.map((cell) => cell.name['zh-TW'])).size).toBe(BOARD.length)
    expect(new Set(BOARD.map((cell) => cell.name.en)).size).toBe(BOARD.length)
  })

  it('is in order of seniority', () => {
    BOARD.forEach((cell, index) => {
      if (index > 0) expect(cell.rank, cell.id).toBeGreaterThanOrEqual(BOARD[index - 1].rank)
      expect(Number.isInteger(cell.rank), cell.id).toBe(true)
    })
  })

  it('every move leads to a cell that exists', () => {
    for (const cell of BOARD) {
      for (const face of FACES) expect(ids, `${cell.id} ${face}`).toContain(cell.moves[face])
    }
  })

  it('de, cai and gong promote: later on the board, de at least as high as cai as gong', () => {
    for (const cell of BOARD.filter(({ id }) => id !== END_CELL)) {
      const at = ids.indexOf(cell.id)
      const [de, cai, gong] = (['de', 'cai', 'gong'] as const).map((face) => cell.moves[face])
      for (const target of [de, cai, gong]) expect(ids.indexOf(target), cell.id).toBeGreaterThan(at)
      expect(getCell(de).rank, cell.id).toBeGreaterThanOrEqual(getCell(cai).rank)
      expect(getCell(cai).rank, cell.id).toBeGreaterThanOrEqual(getCell(gong).rank)
      expect(getCell(gong).rank, cell.id).toBeGreaterThanOrEqual(cell.rank)
    }
  })

  it('zang demotes to a strictly lower rank; only the bottom cell, with nowhere to go, stays', () => {
    for (const cell of BOARD.filter(({ id }) => id !== END_CELL)) {
      if (cell.id === START_CELL) expect(cell.moves.zang).toBe(START_CELL)
      else expect(getCell(cell.moves.zang).rank, cell.id).toBeLessThan(cell.rank)
    }
  })

  /** Every id reachable from `from` by following `next` */
  function reach(from: readonly string[], next: (id: string) => readonly string[]): Set<string> {
    const seen = new Set(from)
    const queue = [...from]
    for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
      for (const target of next(id)) {
        if (!seen.has(target)) {
          seen.add(target)
          queue.push(target)
        }
      }
    }
    return seen
  }

  const targetsOf = (id: string) => FACES.map((face) => getCell(id).moves[face])

  it('has no dead ends: every cell other than the end leads somewhere else', () => {
    for (const { id } of BOARD.filter((cell) => cell.id !== END_CELL)) {
      expect(targetsOf(id).some((target) => target !== id), id).toBe(true)
    }
  })

  it('every cell can reach the end', () => {
    const backward = new Map<string, string[]>()
    for (const { id } of BOARD) {
      for (const target of targetsOf(id)) backward.set(target, [...(backward.get(target) ?? []), id])
    }
    const canFinish = reach([END_CELL], (id) => backward.get(id) ?? [])
    expect(ids.filter((id) => !canFinish.has(id))).toEqual([])
  })

  it('no cell is an orphan: every one can be reached from the start', () => {
    const reachable = reach([START_CELL], targetsOf)
    expect(ids.filter((id) => !reachable.has(id))).toEqual([])
  })

  it('has every grade: a label for each rank in use and a cell on each', () => {
    const ranks = new Set(BOARD.map((cell) => cell.rank))
    for (let rank = 0; rank <= MAX_RANK; rank++) {
      expect(ranks.has(rank), `a cell of rank ${rank}`).toBe(true)
      expect(promotionDetailMessages.en[`games.promotion.rank.${rank}`]).toBeTruthy()
    }
    expect(Math.max(...ranks)).toBe(MAX_RANK)
  })

  it('getCell refuses what is not on the board', () => {
    expect(() => getCell('nope')).toThrow(/nope/)
    expect(() => getCell('__proto__')).toThrow()
  })
})

describe('promotion, the corruption path', () => {
  it('zang moves a seat down to the cell the board says, and counts the demotion', () => {
    for (const { id } of BOARD.filter((cell) => cell.id !== END_CELL)) {
      const state = rollAll(standingOn(start(2), [id, START_CELL]), ['zang'])
      expect(state.players[0].cell).toBe(getCell(id).moves.zang)
      expect(state.players[0].demotions).toBe(1)
      expect(state.last).toEqual({
        seat: 0,
        face: 'zang',
        dice: null,
        from: id,
        to: getCell(id).moves.zang,
      })
    }
  })

  it('a magistrate caught out falls below his rank, and the game goes on', () => {
    const state = rollAll(standingOn(start(2), ['zhixian', START_CELL]), ['zang'])
    expect(getCell(state.players[0].cell).rank).toBeLessThan(getCell('zhixian').rank)
    expect(state.turn).toBe(1)
    expect(promotion.isOver(state)).toBe(false)
  })

  it('a commoner has nowhere to fall', () => {
    const state = rollAll(start(2), ['zang'])
    expect(state.players[0]).toMatchObject({ cell: START_CELL, demotions: 1, rolls: 1 })
    expect(state.turn).toBe(1)
  })

  it('only zang counts as a demotion', () => {
    const state = rollAll(start(2), ['de', 'cai', 'gong', 'zang'])
    expect(state.players.map((player) => player.demotions)).toEqual([0, 1])
  })
})

describe('promotion, the retire-in-glory ending', () => {
  /** Seat 0 rolls de all the way up while seat 1 is stuck rolling zang */
  function raceToTheEnd(): PromotionState {
    let state = start(2)
    let rolls = 0
    while (!promotion.isOver(state)) {
      state = rollAll(state, [state.turn === 0 ? 'de' : 'zang'])
      rolls += 1
      if (rolls > 200) throw new Error('never got there')
    }
    return state
  }

  it('the first to reach the end wins at once: the other seat does not get another roll', () => {
    const state = raceToTheEnd()
    expect(state).toMatchObject({ ending: 'retired', winner: 0, turn: null })
    expect(state.players[0].cell).toBe(END_CELL)
    expect(state.last).toMatchObject({ seat: 0, to: END_CELL })
    expect(state.players[0].rolls).toBe(state.players[1].rolls + 1)
    expect(promotion.isOver(state)).toBe(true)
    expect(promotion.legalActions(state, 0)).toEqual([])
    expect(promotion.legalActions(state, 1)).toEqual([])
  })

  it('the result has the winner first and says so', () => {
    const { summary, standings } = promotion.result(raceToTheEnd())
    expect(summary.key).toBe('games.promotion.result.retired')
    expect(standings.map((line) => [line.seat, line.rank])).toEqual([
      [0, 1],
      [1, 2],
    ])
    expect(standings[0].score).toBe(MAX_RANK)
    expect(standings[0].note.key).toBe('games.promotion.note.retired')
    expect(standings[1].note.key).toBe('games.promotion.note.commoner')
  })

  it('retiring on the very last roll of the limit counts as retiring', () => {
    let state = standingOn(start(2, { turnLimit: 10 }), [START_CELL, 'taishi'])
    state = { ...state, round: 10, turn: 1 }
    const end = rollAll(state, ['de'])
    expect(end).toMatchObject({ ending: 'retired', winner: 1 })
  })

  it('refuses another roll after the end, whoever asks', () => {
    const match = { state: raceToTheEnd(), rngState: 1 }
    for (const actor of [0, 1, 'system'] as Actor[]) {
      expect(isRefused(applyAction(promotion, match, ROLL, actor)).gameError).toBe(
        'games.promotion.error.over',
      )
    }
  })
})

describe('promotion, the turn-limit ending', () => {
  it('ends after every seat has rolled `turnLimit` times, with no winner', () => {
    const state = rollAll(start(3, { turnLimit: 10 }), Array<Face>(30).fill('zang'))
    expect(state).toMatchObject({ ending: 'turnLimit', winner: null, turn: null, round: 10 })
    expect(state.players.map((player) => player.rolls)).toEqual([10, 10, 10])
    expect(promotion.isOver(state)).toBe(true)
  })

  it('is still going one roll before the limit', () => {
    const state = rollAll(start(3, { turnLimit: 10 }), Array<Face>(29).fill('zang'))
    expect(state.ending).toBeNull()
    expect(state.turn).toBe(2)
    expect(state.round).toBe(10)
  })

  it('every seat gets the same rolls, whichever seat opened', () => {
    let state: PromotionState = { ...start(3, { turnLimit: 10 }), first: 2, turn: 2 }
    state = rollAll(state, Array<Face>(29).fill('zang'))
    expect(state.turn).toBe(1)
    expect(state.round).toBe(10)
    state = rollAll(state, ['zang'])
    expect(state.ending).toBe('turnLimit')
    expect(state.players.map((player) => player.rolls)).toEqual([10, 10, 10])
  })

  it('seniority decides, and equal seniority shares a place', () => {
    const ended: PromotionState = {
      ...standingOn(start(4, { turnLimit: 10 }), ['zhixian', 'zhifu', 'bianxiu', START_CELL]),
      turn: null,
      ending: 'turnLimit',
    }
    const { summary, standings } = promotion.result(ended)
    expect(summary.key).toBe('games.promotion.result.turnLimit')
    expect(summary.params).toEqual({ rounds: 1 })
    // zhixian and bianxiu are both Senior 7th grade
    expect(standings.map((line) => [line.seat, line.rank])).toEqual([
      [1, 1],
      [0, 2],
      [2, 2],
      [3, 4],
    ])
    expect(standings[0].score).toBe(getCell('zhifu').rank)
  })

  it('everyone stuck at the bottom ties for first', () => {
    const state = rollAll(start(2, { turnLimit: 10 }), Array<Face>(20).fill('zang'))
    expect(promotion.result(state).standings.map((line) => line.rank)).toEqual([1, 1])
  })
})

describe('promotion, refusing and showing', () => {
  const match = () => startMatch(promotion, makeSeats(3), options, 7)

  it.each([
    ['null', null],
    ['a number', 42],
    ['an array', []],
    ['an empty object', {}],
    ['another type', { type: 'move' }],
    ['a roll in name only', { type: ['roll'] }],
  ])('refuses %s', (_, action) => {
    const before = match()
    const answer = applyAction(promotion, before, action as never, before.state.turn as number)
    expect(isRefused(answer).gameError).toBe('games.promotion.error.badAction')
  })

  it('refuses a roll out of turn and from the system', () => {
    const { state, rngState } = match()
    const other = ((state.turn as number) + 1) % 3
    for (const actor of [other, 'system'] as Actor[]) {
      expect(isRefused(applyAction(promotion, { state, rngState }, ROLL, actor)).gameError).toBe(
        'games.promotion.error.notYourTurn',
      )
    }
  })

  it('everybody sees the same thing but `you`; only the seat on turn gets a button', () => {
    const { state } = match()
    const seat = state.turn as number
    const of = (viewer: number | 'spectator') => projectGame(promotion, state, viewer)
    expect(of(seat).legal).toEqual([ROLL])
    expect(of((seat + 1) % 3).legal).toEqual([])
    expect(of('spectator').legal).toEqual([])
    expect(of(seat).view.you).toBe(seat)
    expect(of('spectator').view.you).toBeNull()
    expect({ ...of(seat).view, you: null }).toEqual(of('spectator').view)
  })

  it('everyone starts as a commoner, and the opening seat comes from the rng', () => {
    const firsts = new Set<number>()
    for (let seed = 1; seed <= 40; seed++) {
      const { state } = startMatch(promotion, makeSeats(4), options, seed)
      expect(state.players.every((player) => player.cell === START_CELL)).toBe(true)
      firsts.add(state.first)
      expect(state.turn).toBe(state.first)
    }
    expect(firsts).toEqual(new Set([0, 1, 2, 3]))
  })
})

describe('promotion options', () => {
  it('defaults and bad input fall back to the schema', () => {
    expect(defaultOptions(promotion.options)).toEqual({
      dice: 'four-sided',
      turnLimit: DEFAULT_TURN_LIMIT,
      edition: 'simple',
    })
    expect(parseOptions(promotion.options, { dice: 'loaded', turnLimit: 5 })).toEqual({
      dice: 'four-sided',
      turnLimit: DEFAULT_TURN_LIMIT,
      edition: 'simple',
    })
    expect(parseOptions(promotion.options, { dice: 'six-sided', turnLimit: 25 })).toEqual({
      dice: 'six-sided',
      turnLimit: 25,
      edition: 'simple',
    })
  })

  it('the table reads every one of the 1296 rolls of four dice as its counts promise', () => {
    const counts: Record<Face, number> = { de: 0, cai: 0, gong: 0, zang: 0 }
    const faces = [1, 2, 3, 4, 5, 6]
    for (const a of faces) {
      for (const b of faces) {
        for (const c of faces) {
          for (const d of faces) counts[faceFromDice([a, b, c, d])] += 1
        }
      }
    }
    expect(counts).toEqual({ zang: 256, gong: 512, cai: 384, de: 144 })
    expect(SIX_SIDED_TABLE).toHaveLength(5)
  })

  it.each<[number[], Face]>([
    [[2, 3, 5, 6], 'zang'],
    [[1, 2, 3, 5], 'gong'],
    [[4, 2, 3, 5], 'gong'],
    [[1, 4, 2, 2], 'cai'],
    [[1, 1, 4, 6], 'de'],
    [[4, 4, 4, 4], 'de'],
  ])('dice %j read as %s', (dice, face) => {
    expect(faceFromDice(dice)).toBe(face)
  })

  /** How often each result came up over a lot of rolls */
  function shares(dice: PromotionOptions['dice']): Record<Face, number> {
    const counts: Record<Face, number> = { de: 0, cai: 0, gong: 0, zang: 0 }
    let total = 0
    for (let seed = 1; seed <= 200; seed++) {
      let match = startMatch(promotion, makeSeats(2), { dice, turnLimit: 30, edition: 'simple' }, seed)
      while (!promotion.isOver(match.state)) {
        const next = applyAction(promotion, match, ROLL, match.state.turn as number)
        if (isGameError(next)) throw new Error(next.gameError)
        match = next
        if (match.state.last) counts[match.state.last.face] += 1
        total += 1
      }
    }
    return {
      de: counts.de / total,
      cai: counts.cai / total,
      gong: counts.gong / total,
      zang: counts.zang / total,
    }
  }

  it('`dice: four-sided` rolls each result a quarter of the time and shows no dice', () => {
    const seen = shares('four-sided')
    for (const face of FACES) expect(seen[face]).toBeCloseTo(0.25, 1)

    const opening = startMatch(promotion, makeSeats(2), options, 1)
    const next = applyAction(promotion, opening, ROLL, opening.state.turn as number)
    if (isGameError(next)) throw new Error(next.gameError)
    expect(next.state.last?.dice).toBeNull()
  })

  it('`dice: six-sided` follows the table instead, and shows the four dice', () => {
    const seen = shares('six-sided')
    expect(seen.zang).toBeCloseTo(16 / 81, 1)
    expect(seen.gong).toBeCloseTo(32 / 81, 1)
    expect(seen.cai).toBeCloseTo(24 / 81, 1)
    expect(seen.de).toBeCloseTo(9 / 81, 1)

    const opening = startMatch(promotion, makeSeats(2), { ...options, dice: 'six-sided' }, 1)
    const next = applyAction(promotion, opening, ROLL, opening.state.turn as number)
    if (isGameError(next)) throw new Error(next.gameError)
    const { last } = next.state
    expect(last?.dice).toHaveLength(4)
    for (const die of last?.dice ?? []) expect(die).toBeGreaterThanOrEqual(1)
    for (const die of last?.dice ?? []) expect(die).toBeLessThanOrEqual(6)
    expect(last?.face).toBe(faceFromDice(last?.dice ?? []))
  })

  it('`turnLimit`: the same seed stops at the lower limit and carries on at the higher', () => {
    const play = (turnLimit: number) => {
      let match = startMatch(promotion, makeSeats(2), { ...options, turnLimit }, 3)
      let rolls = 0
      while (!promotion.isOver(match.state)) {
        const next = applyAction(promotion, match, ROLL, match.state.turn as number)
        if (isGameError(next)) throw new Error(next.gameError)
        match = next
        rolls += 1
      }
      return { rolls, state: match.state }
    }
    const short = play(10)
    const long = play(DEFAULT_TURN_LIMIT)
    expect(short.rolls).toBe(20)
    expect(short.state.ending).toBe('turnLimit')
    expect(long.rolls).toBeGreaterThan(20)
  })

  it('the options reach the later turns through the state alone', () => {
    const { state } = startMatch(promotion, makeSeats(2), { dice: 'six-sided', turnLimit: 25, edition: 'simple' }, 1)
    expect(state).toMatchObject({ dice: 'six-sided', turnLimit: 25 })
  })
})

describe('promotion through the harness', () => {
  it('a fixed seed plays a whole game with a result for every seat', () => {
    const { steps, final, result } = playRandom(promotion, { seed: 20261106, seats: 4 })
    expect(promotion.isOver(final.state)).toBe(true)
    expect(steps.length).toBeGreaterThan(4)
    expect(result.standings).toHaveLength(4)
    expect(final.state.players.reduce((sum, player) => sum + player.rolls, 0)).toBe(steps.length)
  })

  it.each([2, 3, 4, 5, 6])('%i seats, both dice, breaks no rule over many seeds', (seats) => {
    for (const dice of ['four-sided', 'six-sided'] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        playRandom(promotion, { seed, seats, options: { dice, turnLimit: DEFAULT_TURN_LIMIT, edition: 'simple' } })
      }
    }
  })

  it('short limits reach the turn-limit ending under the harness too', () => {
    const endings = new Set<string | null>()
    for (let seed = 1; seed <= 30; seed++) {
      const { final } = playRandom(promotion, { seed, options: { ...options, turnLimit: 25 } })
      endings.add(final.state.ending)
    }
    expect(endings).toEqual(new Set(['retired', 'turnLimit']))
  })
})

describe('promotion game length', () => {
  /** Rounds played by `games` random games; plain match.ts, the harness is too slow for this many */
  function rounds(seats: number, games: number) {
    const played: { round: number; ending: PromotionState['ending'] }[] = []
    for (let seed = 1; seed <= games; seed++) {
      let match = startMatch(promotion, makeSeats(seats), options, seed)
      while (!promotion.isOver(match.state)) {
        const next = applyAction(promotion, match, ROLL, match.state.turn as number)
        if (isGameError(next)) throw new Error(next.gameError)
        match = next
      }
      played.push({ round: match.state.round, ending: match.state.ending })
    }
    return played
  }

  // Guards the tuning of the board (see the batch's report): a change that breaks these bands has
  // made a game a lot longer or shorter, which may be right, but should be looked at.
  it.each([
    [2, 28, 48, 0.25],
    [4, 25, 38, 0.05],
    [6, 22, 34, 0.02],
  ])('%i seats: median rounds in band, the limit is a safety net', (seats, low, high, atLimit) => {
    const played = rounds(seats, 400)
    const sorted = played.map((game) => game.round).sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    expect(median).toBeGreaterThanOrEqual(low)
    expect(median).toBeLessThanOrEqual(high)
    const limit = played.filter((game) => game.ending === 'turnLimit').length / played.length
    expect(limit).toBeLessThanOrEqual(atLimit)
  })
})

describe('promotion strings', () => {
  it('is in the registry', () => {
    expect(GAME_IDS).toContain('promotion')
    expect(getGame('promotion')?.id).toBe('promotion')
  })

  it('has the same keys in both languages, and every string filled in', () => {
    const { en, 'zh-TW': zhTW } = promotionMessages
    expect(Object.keys(zhTW).sort()).toEqual(Object.keys(en).sort())
    for (const value of [...Object.values(en), ...Object.values(zhTW)]) {
      expect(value.trim()).not.toBe('')
    }
  })

  it('has every key the module refers to', () => {
    const keys = new Set([
      ...Object.keys(promotionMessages.en),
      ...Object.keys(promotionDetailMessages.en),
    ])
    const { dice, turnLimit } = promotion.options
    const referred = [
      `${promotion.meta.i18nKey}.name`,
      dice.labelKey,
      ...(dice.kind === 'select' ? dice.choices.map((choice) => choice.labelKey) : []),
      turnLimit.labelKey,
      ...FACES.map((face) => `games.promotion.face.${face}`),
      ...BOARD.map((cell) => `games.promotion.cell.${cell.id}`),
    ]
    for (const cell of BOARD) {
      const ended: PromotionState = {
        ...standingOn(start(2), [cell.id, START_CELL]),
        turn: null,
        ending: cell.id === END_CELL ? 'retired' : 'turnLimit',
      }
      const result = promotion.result(ended)
      referred.push(result.summary.key, ...result.standings.map((line) => line.note.key))
    }
    for (const key of referred) expect(keys, key).toContain(key)
  })

  it('keeps the screen words out of the first load: no cell, rank, face or status line (D4)', () => {
    const keys = Object.keys(promotionMessages.en)
    expect(keys.filter((key) => /\.(cell|rank|face|ui)\./.test(key))).toEqual([])
  })

  it('the same params fill the same placeholders in both languages', () => {
    const { en, 'zh-TW': zhTW } = promotionMessages
    const holes = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
    for (const key of Object.keys(en)) expect(holes(zhTW[key]), key).toEqual(holes(en[key]))
  })
})
