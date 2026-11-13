// @vitest-environment node
// Promotion's full edition (C6, e3-t12, e3-t13): the first board's consistency, the dice, and the
// first rules' turns, silver, ending and settlement, which every game from before C8 still plays by;
// whole games on the latest rules through the harness; and that the simple edition plays exactly as
// before. The second board and rules (C8) are in fullChoices.test.ts.
import { describe, expect, it, vi } from 'vitest'
import { applyAction, makeSeats, replayMatch, startMatch, type Match } from '../../../shared/games/match.ts'
import {
  BOARD_FULL,
  FULL_DEPARTMENTS,
  FULL_FACES,
  FULL_ORIGINS,
  fullBoard,
  gradeOf,
  type FullCell,
  type FullFace,
} from '../../../shared/games/promotion/boardFull.ts'
import { promotionFullMessages } from '../../../shared/games/promotion/i18n.full.ts'
import { promotionMessages } from '../../../shared/games/promotion/i18n.ts'
import { promotion } from '../../../shared/games/promotion/rules.ts'
import {
  birthOf,
  COURTESY,
  initFullV1,
  FULL_ROUND_LIMIT,
  MAX_THROWS,
  meets,
  RANK_STEP,
  readThrow,
  resolveCell,
  RUN_REWARD,
  START_MONEY,
  stepTarget,
} from '../../../shared/games/promotion/rulesFull.ts'
import type {
  FullPlayer,
  PromotionAnyState,
  PromotionFullState,
  PromotionOptions,
} from '../../../shared/games/promotion/types.ts'
import { isGameError, type Rng } from '../../../shared/games/types.ts'
import { playRandom } from '../harness.ts'

vi.setConfig({ testTimeout: 120_000 })

const FULL: PromotionOptions = {
  dice: 'four-sided',
  turnLimit: 60,
  edition: 'full',
  decisionSeconds: 30,
  buying: true,
  endAtDahe: false,
}
/** The first board: what the C6 tests below hold, and what a game from before C8 still plays on */
const B1 = fullBoard(1)
const getFullCell = (id: string) => B1.get(id)
const ROLL = { type: 'roll' as const }
const ids = new Set(BOARD_FULL.map((cell) => cell.id))
const isEnd = (cell: FullCell) => cell.kind === 'end'

/** An Rng whose dice come from a list of pips; the first seat opens */
function dice(pips: readonly number[]): Rng {
  const queue = [...pips]
  return {
    float: () => 0,
    int(max: number) {
      if (max !== 6) return 0
      const pip = queue.shift()
      if (pip === undefined) throw new Error('the script ran out')
      return pip - 1
    },
    pick: <T>(items: readonly T[]) => items[0],
    shuffle: <T>(items: readonly T[]) => [...items],
  }
}

/** A game under the first rules (C6), as a room from before C8 holds it */
const start = (seats: number) => initFullV1(makeSeats(seats), dice([]))

function roll(state: PromotionFullState, pips: readonly number[]): PromotionFullState {
  const next = promotion.reduce(state, ROLL, state.turn as number, dice(pips))
  if (isGameError(next)) throw new Error(next.gameError)
  return next as PromotionFullState
}

/** Players placed by hand: past the birth roll, on these cells */
function placed(state: PromotionFullState, cells: string[], extra: Partial<FullPlayer> = {}) {
  return {
    ...state,
    players: state.players.map((player, at) => ({
      ...player,
      cell: cells[at],
      rank: getFullCell(cells[at]).rank,
      origin: 'baiding',
      ...extra,
    })),
  }
}

const total = (state: PromotionFullState) =>
  state.bank + state.players.reduce((sum, player) => sum + player.money, 0)

// ── The board ────────────────────────────────────────────────────────────────────────────────

describe('the full board', () => {
  it('has 150 to 250 cells with unique ids, each in a department', () => {
    expect(BOARD_FULL.length).toBeGreaterThanOrEqual(150)
    expect(BOARD_FULL.length).toBeLessThanOrEqual(250)
    expect(ids.size).toBe(BOARD_FULL.length)
    for (const cell of BOARD_FULL) expect(FULL_DEPARTMENTS, cell.id).toHaveProperty(cell.dept)
    // The first 37 departments are the first board's; the second board (C8) adds the rest
    const used = new Set(BOARD_FULL.map((cell) => cell.dept))
    expect([...used].sort()).toEqual(Object.keys(FULL_DEPARTMENTS).slice(0, 37).sort())
    expect(B1.depts).toEqual(Object.keys(FULL_DEPARTMENTS).slice(0, 37))
  })

  it('names every cell in both languages: Chinese, and English as "Pinyin (Gloss)"', () => {
    for (const cell of BOARD_FULL) {
      expect(cell.name['zh-TW'], cell.id).toMatch(/^[一-鿿]+$/)
      expect(cell.name.en, cell.id).toMatch(/^[A-Z][A-Za-z ]+ \([^()]+\)$/)
    }
  })

  it('every destination exists: moves, ennoblement, instead and Banner moves', () => {
    for (const cell of BOARD_FULL) {
      const targets = [
        ...Object.values(cell.moves),
        ...Object.values(cell.banner ?? {}),
        cell.fengjue,
        cell.instead,
      ].filter((id): id is string => id !== null)
      for (const target of targets) expect(ids, `${cell.id} -> ${target}`).toContain(target)
    }
  })

  it('a requirement always comes with somewhere else to land, and only then', () => {
    for (const cell of BOARD_FULL) expect(cell.requires === null, cell.id).toBe(cell.instead === null)
  })

  it('every player can land somewhere for every cell: no requirement chain loops', () => {
    for (const profile of PROFILES) {
      for (const cell of BOARD_FULL) {
        const landed = getFullCell(resolveCell(B1, profile, cell.id))
        expect(landed.requires === null || meets(profile, landed.requires)).toBe(true)
      }
    }
  })

  it('ranks move the way each kind of cell intends', () => {
    for (const cell of BOARD_FULL) {
      const rank = (face: FullFace) => getFullCell(cell.moves[face]).rank
      const why = `${cell.id} (${cell.kind})`
      if (cell.kind === 'office') {
        expect(rank('de'), why).toBeGreaterThanOrEqual(rank('cai'))
        expect(rank('cai'), why).toBeGreaterThanOrEqual(rank('gong'))
        expect(rank('gong'), why).toBeGreaterThanOrEqual(cell.rank)
        if (getFullCell(cell.moves.liang).kind !== 'end') {
          expect(rank('liang'), why).toBeGreaterThanOrEqual(cell.rank)
        }
        const fall = getFullCell(cell.moves.zang)
        if (fall.kind !== 'penalty') expect(fall.rank, why).toBeLessThan(cell.rank)
      }
      if (cell.kind === 'origin' || cell.kind === 'exam') {
        for (const face of ['de', 'cai', 'gong'] as const) {
          expect(rank(face), why).toBeGreaterThanOrEqual(cell.rank)
        }
        if (cell.rank > 0) expect(rank('zang'), why).toBeLessThan(cell.rank)
        else expect(cell.moves.zang, why).toBe(cell.id)
      }
      if (cell.kind === 'palace') {
        // The palace examination failed nobody
        for (const face of FULL_FACES) expect(rank(face), why).toBeGreaterThanOrEqual(cell.rank)
      }
      if (cell.kind === 'appoint') {
        for (const face of FULL_FACES) expect(rank(face), why).toBeGreaterThanOrEqual(6)
      }
      if (cell.kind === 'end') {
        for (const face of FULL_FACES) expect(cell.moves[face], why).toBe(cell.id)
        expect(cell.retire !== null || cell.out, why).toBe(true)
      }
    }
  })

  it('the bottom cells stay on graft; a dismissal can end in exile', () => {
    expect(getFullCell('baiding').moves.zang).toBe('baiding')
    expect(getFullCell('geizhi').moves.zang).toBe('changshu')
    expect(getFullCell('changshu').out).toBe(true)
  })

  it('ennoblement leads up: the first peerage, or the next one', () => {
    for (const cell of BOARD_FULL) {
      if (cell.fengjue === null) continue
      expect(getFullCell(cell.fengjue).rank, cell.id).toBeGreaterThanOrEqual(cell.rank)
    }
  })

  it('every rank in use has a grade, and grades never fall as ranks rise', () => {
    const ranks = [...new Set(BOARD_FULL.map((cell) => cell.rank))].sort((a, b) => a - b)
    const grades = ranks.map(gradeOf)
    expect(grades).toEqual([...grades].sort((a, b) => a - b))
    expect(gradeOf(30)).toBe(13)
    expect(gradeOf(24)).toBe(11)
    expect(gradeOf(7)).toBe(3)
  })

  it('every department is entirely office or none: courtesy only where people serve', () => {
    for (const cell of BOARD_FULL) {
      if (!FULL_DEPARTMENTS[cell.dept].courtesy) continue
      expect(['office', 'appoint', 'origin'], cell.id).toContain(cell.kind)
    }
  })

  it('carries what the C7 screen needs: department, section, rank and a watermark', () => {
    for (const cell of BOARD_FULL) {
      expect(FULL_DEPARTMENTS[cell.dept].section, cell.id).toBeTruthy()
      expect(cell.art, cell.id).toBeTruthy()
    }
  })
})

// ── Reaching every cell, from every origin ───────────────────────────────────────────────────

/** The parts of a player a move depends on */
type Profile = Pick<FullPlayer, 'cell' | 'degree' | 'wu' | 'banner'>
const PROFILES: FullPlayer[] = [0, 1, 2, 3].flatMap((degree) =>
  [false, true].flatMap((wu) =>
    [false, true].map(
      (banner): FullPlayer => ({
        seat: 0,
        cell: 'baiding',
        rank: 0,
        money: 0,
        degree: degree as 0 | 1 | 2 | 3,
        wu,
        banner,
        origin: 'baiding',
        status: 'active',
        rolls: 0,
      }),
    ),
  ),
)

const key = (p: Profile) => `${p.cell}|${p.degree}|${p.wu}|${p.banner}`

/** Every profile one move away: any of the six results, ennoblement, or dismissal */
function successors(from: Profile): Profile[] {
  const cell = getFullCell(from.cell)
  if (isEnd(cell)) return []
  const player = { ...PROFILES[0], ...from }
  const raws = [
    ...FULL_FACES.map((face) => stepTarget(B1, player, face)),
    stepTarget(B1, player, 'dismiss'),
    cell.fengjue ?? stepTarget(B1, player, 'de'),
  ]
  return raws.map((raw) => {
    const landed = getFullCell(resolveCell(B1, player, raw))
    return {
      cell: landed.id,
      degree: Math.max(from.degree, landed.degree) as Profile['degree'],
      wu: from.wu || landed.wu,
      banner: from.banner,
    }
  })
}

function explore(starts: Profile[]): Map<string, Profile> {
  const seen = new Map(starts.map((p) => [key(p), p]))
  const queue = [...starts]
  while (queue.length > 0) {
    for (const next of successors(queue.pop() as Profile)) {
      if (seen.has(key(next))) continue
      seen.set(key(next), next)
      queue.push(next)
    }
  }
  return seen
}

describe('the full board, walked', () => {
  const origins = FULL_ORIGINS.flatMap((cell) =>
    [false, true].map((banner) => ({ cell, degree: 0 as const, wu: false, banner })),
  )

  it.each(origins.map((origin) => [origin.cell, origin.banner ? 'Banner' : 'civilian', origin] as const))(
    'from %s (%s), every cell is reachable that the household may hold',
    (_, __, origin) => {
      const reached = new Set([...explore([origin]).values()].map((p) => p.cell))
      // A hereditary student is born, never become: only the birth roll places anyone there
      const missing = BOARD_FULL.filter(
        (cell) =>
          !reached.has(cell.id) &&
          !(cell.requires === 'banner' && !origin.banner) &&
          !(cell.id === 'yinsheng' && origin.cell !== 'yinsheng'),
      ).map((cell) => cell.id)
      expect(missing).toEqual([])
      if (!origin.banner) {
        expect(BOARD_FULL.filter((cell) => reached.has(cell.id) && cell.requires === 'banner')).toEqual([])
      }
    },
  )

  it('no cell traps a player: from every reachable position a career can end', () => {
    const all = explore(origins)
    // Backwards from the end cells: which positions can still reach one
    const ending = new Set<string>()
    let grew = true
    while (grew) {
      grew = false
      for (const [id, profile] of all) {
        if (ending.has(id)) continue
        const cell = getFullCell(profile.cell)
        if (isEnd(cell) || successors(profile).some((next) => ending.has(key(next)))) {
          ending.add(id)
          grew = true
        }
      }
    }
    expect([...all.keys()].filter((id) => !ending.has(id))).toEqual([])
  })

  it('the hereditary student is the one birth-only cell: no move leads there', () => {
    const into = BOARD_FULL.filter((cell) =>
      [...Object.values(cell.moves), ...Object.values(cell.banner ?? {}), cell.fengjue, cell.instead].includes(
        'yinsheng',
      ),
    )
    expect(into.map((cell) => cell.id)).toEqual(['yinsheng'])
  })

  it('no office but the ends holds a player in place on every result', () => {
    for (const cell of BOARD_FULL) {
      if (isEnd(cell)) continue
      expect(new Set(Object.values(cell.moves)).size, cell.id).toBeGreaterThan(1)
    }
  })
})

// ── The dice ─────────────────────────────────────────────────────────────────────────────────

describe('reading four dice', () => {
  it('reads the named patterns as the rules page says', () => {
    expect(readThrow([4, 4, 4, 4])).toEqual({ combo: 'four', steps: ['fengjue'] })
    expect(readThrow([6, 6, 6, 6])).toEqual({ combo: 'four', steps: ['fengjue'] })
    expect(readThrow([1, 1, 1, 1])).toEqual({ combo: 'allGraft', steps: ['dismiss'] })
    expect(readThrow([3, 1, 4, 2])).toEqual({ combo: 'run', steps: ['de'] })
    expect(readThrow([5, 3, 6, 4])).toEqual({ combo: 'run', steps: ['de'] })
    expect(readThrow([4, 5, 4, 5])).toEqual({ combo: 'redPairs', steps: ['de', 'de'] })
    expect(readThrow([2, 5, 5, 2])).toEqual({ combo: 'pairs', steps: ['gong', 'rou'] })
    expect(readThrow([1, 6, 1, 6])).toEqual({ combo: 'pairs', steps: ['cai', 'zang'] })
    expect(readThrow([3, 3, 3, 5])).toEqual({ combo: 'three', steps: ['liang', 'liang'] })
    expect(readThrow([2, 6, 2, 5])).toEqual({ combo: 'pair', steps: ['rou'] })
    expect(readThrow([1, 2, 4, 6])).toEqual({ combo: 'none', steps: [] })
  })

  it('two de with a graft forgive the graft and throw again, except on the birth roll', () => {
    expect(readThrow([4, 4, 1, 6])).toEqual({ combo: 'cancel', steps: [] })
    expect(readThrow([4, 4, 1, 1])).toEqual({ combo: 'cancel', steps: [] })
    expect(readThrow([4, 4, 4, 1])).toEqual({ combo: 'cancel', steps: [] })
    expect(readThrow([4, 1, 1, 6])).toEqual({ combo: 'pair', steps: ['zang'] })
    expect(readThrow([4, 4, 1, 1], true)).toEqual({ combo: 'redPairs', steps: ['de', 'de'] })
  })

  it('counts every one of the 1296 throws into the documented shares', () => {
    const counts: Record<string, number> = {}
    for (let n = 0; n < 1296; n++) {
      const pips = [n % 6, Math.floor(n / 6) % 6, Math.floor(n / 36) % 6, Math.floor(n / 216)].map((d) => d + 1)
      const { combo } = readThrow(pips)
      counts[combo] = (counts[combo] ?? 0) + 1
    }
    expect(counts).toEqual({
      four: 5,
      allGraft: 1,
      cancel: 58,
      run: 72,
      redPairs: 24,
      pairs: 60,
      three: 116,
      pair: 672,
      none: 288,
    })
  })

  it('the birth roll places by pattern and household, with the shares the rules page gives', () => {
    expect(birthOf([4, 5, 4, 5])).toEqual({ origin: 'yinsheng', banner: false })
    expect(birthOf([1, 2, 3, 4])).toEqual({ origin: 'yinsheng', banner: false })
    expect(birthOf([4, 4, 6, 2])).toEqual({ origin: 'shengyuan', banner: true })
    expect(birthOf([6, 6, 2, 3])).toEqual({ origin: 'jiansheng', banner: false })
    expect(birthOf([5, 5, 2, 3])).toEqual({ origin: 'tongsheng', banner: false })
    expect(birthOf([2, 2, 5, 5])).toEqual({ origin: 'tongsheng', banner: false })
    expect(birthOf([2, 2, 4, 6])).toEqual({ origin: 'baiding', banner: true })
    expect(birthOf([1, 2, 4, 6])).toEqual({ origin: 'baiding', banner: true })
    const counts: Record<string, number> = {}
    let banner = 0
    for (let n = 0; n < 1296; n++) {
      const pips = [n % 6, Math.floor(n / 6) % 6, Math.floor(n / 36) % 6, Math.floor(n / 216)].map((d) => d + 1)
      const birth = birthOf(pips)
      counts[birth.origin] = (counts[birth.origin] ?? 0) + 1
      if (birth.banner) banner += 1
    }
    expect(counts).toEqual({ yinsheng: 108, shengyuan: 140, jiansheng: 140, tongsheng: 340, baiding: 568 })
    expect(banner).toBe(302)
  })
})

// ── Turns, silver and the end ────────────────────────────────────────────────────────────────

describe('a full-edition turn', () => {
  it('starts everyone on nothing with 100 silver, the bank with 100 a seat', () => {
    const state = start(4)
    expect(state.bank).toBe(4 * START_MONEY)
    expect(state.players.every((p) => p.money === START_MONEY && p.origin === null)).toBe(true)
    expect(state.turnLimit).toBe(FULL_ROUND_LIMIT)
  })

  it('the first roll is the birth roll: it places, sets the household, and charges a purchase', () => {
    let state = start(2)
    state = roll(state, [6, 6, 4, 2]) // a talent pair, a 4 and a 6: purchased studentship, Banner
    expect(state.players[0]).toMatchObject({ cell: 'jiansheng', origin: 'jiansheng', banner: true, money: 90 })
    expect(state.bank).toBe(210)
    expect(state.last).toMatchObject({ birth: true, path: ['jiansheng'] })
    state = roll(state, [1, 2, 4, 6]) // nothing: a commoner, Banner
    expect(state.players[1]).toMatchObject({ cell: 'baiding', banner: true })
    expect(state.round).toBe(2)
  })

  it('throws again while nothing scores, at most MAX_THROWS times, then passes', () => {
    let state = placed(start(2), ['zhixian', 'zhixian'])
    state = roll(state, [1, 2, 4, 6, 4, 4, 1, 3, 2, 3, 5, 6])
    expect(state.last?.throws.map((t) => t.combo)).toEqual(['none', 'cancel', 'none'])
    expect(MAX_THROWS).toBe(3)
    expect(state.players[0].cell).toBe('zhixian')
    expect(state.turn).toBe(1)
  })

  it('moves by each step in turn: two pairs in priority order', () => {
    let state = placed(start(2), ['zhixian', 'baiding'])
    state = roll(state, [5, 5, 6, 6]) // cai then gong
    const cai = getFullCell('zhixian').moves.cai
    expect(state.last?.path).toEqual([cai, getFullCell(cai).moves.gong])
  })

  it('a requirement redirects: a Hanlin post without jinshi lands on its instead', () => {
    const player = { ...PROFILES[0], cell: 'zhongshu' }
    expect(resolveCell(B1, player, 'jiantao')).toBe('zhongshu')
    expect(resolveCell(B1, { ...player, degree: 3 }, 'jiantao')).toBe('jiantao')
    expect(resolveCell(B1, player, 'lanling')).toBe('qianzong')
    expect(resolveCell(B1, { ...player, wu: true }, 'lanling')).toBe('lanling')
  })

  it('a Banner commoner on good conduct joins the Banner companies; a civilian takes the military exam', () => {
    let state = placed(start(2), ['baiding', 'baiding'], { banner: true })
    state = roll(state, [3, 3, 2, 5])
    expect(state.players[0].cell).toBe('pijia')
    state = placed(start(2), ['baiding', 'baiding'])
    state = roll(state, [3, 3, 2, 5])
    expect(state.players[0].cell).toBe('wutong')
  })

  it('a junior landing in a senior’s department pays the senior; equals pay nothing', () => {
    let state = placed(start(3), ['jingli', 'zhifu', 'tongpan'])
    // jingli's gong is tongpan (the same rank as seat 2) in the prefecture, where zhifu serves
    expect(getFullCell('jingli').moves.gong).toBe('tongpan')
    state = roll(state, [5, 5, 2, 3])
    expect(state.players.map((p) => p.money)).toEqual([100 - COURTESY, 100 + COURTESY, 100])
    expect(state.last?.transfers).toEqual([{ from: 0, to: 1, amount: COURTESY, why: 'courtesy' }])
  })

  it('a reward and a straight are paid by the bank', () => {
    let state = placed(start(2), ['huishi', 'baiding'])
    state = roll(state, [1, 2, 3, 4]) // a straight: de to huiyuan (reward 10) and the straight's 10
    expect(state.players[0].cell).toBe('huiyuan')
    expect(state.players[0].money).toBe(100 + 10 + RUN_REWARD)
    expect(state.bank).toBe(200 - 10 - RUN_REWARD)
  })

  it('retiring collects congratulations from everyone still playing, and ends a two-seat game', () => {
    let state = placed(start(3), ['taishi', 'baiding', 'baiding'])
    state = { ...state, players: state.players.map((p, at) => (at === 2 ? { ...p, status: 'out' as const } : p)) }
    state = roll(state, [5, 5, 2, 3]) // taishi's gong: the grand congratulations
    expect(state.players[0]).toMatchObject({ cell: 'dahe', status: 'retired' })
    expect(state.last?.transfers).toContainEqual({ from: 1, to: 0, amount: 20, why: 'congrats' })
    expect(state.ending).toBe('oneLeft')
    expect(state.turn).toBeNull()
  })

  it('keeps the rank held before an ordinary retirement', () => {
    let state = placed(start(3), ['tirenge', 'baiding', 'baiding'])
    state = roll(state, [2, 2, 3, 5]) // rou at the first grade: retire with honours
    expect(state.players[0]).toMatchObject({ cell: 'yugao', rank: getFullCell('tirenge').rank })
    expect(state.turn).toBe(1)
  })

  it('four graft dismisses; graft at dismissal exiles, and the exiled stop playing', () => {
    let state = placed(start(3), ['zhixian', 'baiding', 'baiding'])
    state = roll(state, [1, 1, 1, 1])
    expect(state.players[0]).toMatchObject({ cell: 'geizhi', money: 90 })
    state = { ...state, turn: 0 }
    state = roll(state, [1, 1, 2, 3])
    expect(state.players[0]).toMatchObject({ cell: 'changshu', status: 'out' })
    expect(state.turn).toBe(1)
    state = roll(state, [1, 2, 4, 6, 1, 2, 4, 6, 1, 2, 4, 6])
    expect(state.turn).toBe(2) // seat 0 is skipped from now on
  })

  it('four of a kind ennobles a senior official, and is three de for anyone else', () => {
    let state = placed(start(2), ['anchashi', 'baiding'])
    state = roll(state, [6, 6, 6, 6])
    expect(state.players[0].cell).toBe('nan')
    state = placed(start(2), ['zhixian', 'baiding'])
    state = roll(state, [6, 6, 6, 6])
    expect(state.last?.path).toHaveLength(3)
  })

  it('settles at the end: rank comparison between every two, the bank shared, the rest to the poorest', () => {
    let state = placed(start(3), ['taishi', 'zhixian', 'baiding'])
    state = {
      ...state,
      bank: 301,
      players: state.players.map((p, at) => ({ ...p, money: [100, 100, 99][at], status: at === 2 ? ('out' as const) : p.status })),
    }
    state = roll(state, [5, 5, 2, 3]) // to dahe: retires, seat 1 is the last one playing
    const grades = [13, gradeOf(getFullCell('zhixian').rank), 0]
    const settlement = state.settlement
    expect(settlement?.lines.map((line) => line.grade)).toEqual(grades)
    const duipin = grades.map((g, at) => grades.reduce((sum, other, b) => (b === at ? sum : sum + (g - other) * RANK_STEP), 0))
    expect(settlement?.lines.map((line) => line.duipin)).toEqual(duipin)
    expect(settlement?.remainder).toEqual({ seat: 2, amount: 1 })
    expect(state.bank).toBe(0)
    expect(total(state)).toBe(100 + 100 + 99 + 301)
    const result = promotion.result(state)
    expect(result.standings[0]).toMatchObject({ seat: 0, rank: 1, score: state.players[0].money })
    expect(result.summary.key).toBe('games.promotion.full.result.oneLeft')
  })

  it('ends at the round limit with the seats still playing compared as they stand', () => {
    let state: PromotionFullState = { ...placed(start(2), ['zhixian', 'zhixian']), round: FULL_ROUND_LIMIT }
    state = roll(state, [1, 2, 4, 6, 1, 2, 4, 6, 1, 2, 4, 6])
    expect(state.turn).toBe(1)
    state = roll(state, [1, 2, 4, 6, 1, 2, 4, 6, 1, 2, 4, 6])
    expect(state).toMatchObject({ turn: null, ending: 'turnLimit', round: FULL_ROUND_LIMIT })
    expect(promotion.result(state).standings.map((line) => line.rank)).toEqual([1, 1])
  })

  it('a pass (the room, for someone gone) moves the turn on, and leaves an unrolled birth for later', () => {
    let state = start(2)
    const passed = promotion.reduce(state, { type: 'pass' }, 'system', dice([]))
    expect(isGameError(passed)).toBe(false)
    state = passed as PromotionFullState
    expect(state.turn).toBe(1)
    expect(state.players[0].origin).toBeNull()
    expect(isGameError(promotion.reduce(state, { type: 'pass' }, 1, dice([])))).toBe(true)
  })

  it('refuses a roll out of turn, junk, and anything after the end', () => {
    const state = start(2)
    expect(promotion.reduce(state, ROLL, 1, dice([]))).toEqual({ gameError: 'games.promotion.error.notYourTurn' })
    expect(promotion.reduce(state, { type: 'nope' } as never, 0, dice([]))).toEqual({
      gameError: 'games.promotion.error.badAction',
    })
    expect(promotion.reduce({ ...state, turn: null }, ROLL, 0, dice([]))).toEqual({
      gameError: 'games.promotion.error.over',
    })
  })
})

// ── Whole games ──────────────────────────────────────────────────────────────────────────────

function playOut(seats: number, seed: number) {
  let match: Match<PromotionAnyState> = startMatch(promotion, makeSeats(seats), FULL, seed)
  const sums: number[] = []
  while (!promotion.isOver(match.state)) {
    // The latest rules: a decision is answered with its first answer (accept, or take the post)
    const state = match.state as PromotionFullState
    const seat = state.pending?.seat ?? (state.turn as number)
    const next = applyAction(promotion, match, promotion.legalActions(state, seat)[0], seat)
    if (isGameError(next)) throw new Error(next.gameError)
    match = next
    sums.push(total(match.state as PromotionFullState))
  }
  return { state: match.state as PromotionFullState, sums }
}

describe('full-edition games', () => {
  it.each([2, 3, 4, 5, 6])('%i seats: the harness finds no broken rule over many seeds', (seats) => {
    for (let seed = 1; seed <= 12; seed++) {
      const { final, result } = playRandom(promotion, { seed, seats, options: FULL })
      expect(result.standings).toHaveLength(seats)
      expect((final.state as PromotionFullState).settlement).not.toBeNull()
    }
  })

  it('conserves silver: seats and bank always hold what they started with', () => {
    for (const seats of [2, 4, 6]) {
      for (let seed = 1; seed <= 40; seed++) {
        const { state, sums } = playOut(seats, seed)
        expect(new Set(sums)).toEqual(new Set([2 * START_MONEY * seats]))
        expect(state.bank).toBe(0)
      }
    }
  })

  it('a seed and its actions replay to the very same game', () => {
    const { steps, final } = playRandom(promotion, { seed: 20261112, seats: 5, options: FULL })
    const again = replayMatch(promotion, makeSeats(5), FULL, 20261112, steps)
    expect(again.state).toEqual(final.state)
    expect(playOut(4, 99).state).toEqual(playOut(4, 99).state)
  })

  it('every game ends, well inside the round limit, with at most one seat still playing', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { state } = playOut(4, seed)
      expect(state.round).toBeLessThan(FULL_ROUND_LIMIT)
      expect(state.players.filter((p) => p.status === 'active').length).toBeLessThanOrEqual(1)
    }
  })

  // Guards the tuning (e3 epic, "完整版規則細節"): a change that leaves these bands made games a
  // lot longer or shorter, which may be right, but should be looked at
  it.each([
    [4, 80, 170],
    [6, 130, 230],
  ])('%i seats: the median game is %i to %i turns', (seats, low, high) => {
    const turns: number[] = []
    for (let seed = 1; seed <= 200; seed++) {
      const { state } = playOut(seats, seed)
      turns.push(state.players.reduce((sum, p) => sum + p.rolls, 0))
    }
    turns.sort((a, b) => a - b)
    const median = turns[100]
    expect(median).toBeGreaterThanOrEqual(low)
    expect(median).toBeLessThanOrEqual(high)
  })

  it('nothing is hidden: every viewer gets the state, and `you`', () => {
    const { state } = playOut(3, 5)
    expect(promotion.view(state, 1)).toEqual({ ...state, you: 1 })
    expect(promotion.view(state, 'spectator')).toEqual({ ...state, you: null })
  })

  it('has a string for every summary and note the module sends, in both languages', () => {
    const { en, 'zh-TW': zh } = promotionFullMessages
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    const keys = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      const result = promotion.result(playOut(3, seed).state)
      keys.add(result.summary.key)
      for (const line of result.standings) keys.add(line.note.key)
    }
    keys.add('games.promotion.full.result.turnLimit')
    for (const key of keys) {
      expect(en, key).toHaveProperty(key)
      expect(zh, key).toHaveProperty(key)
    }
    // The option is shown since C7: its labels are in the waiting room's strings
    const edition = promotion.options.edition
    expect(edition.kind === 'select' && edition.hidden).toBeFalsy()
    if (edition.kind === 'select') {
      for (const label of [edition.labelKey, ...edition.choices.flatMap((c) => [c.labelKey, c.hintKey ?? ''])]) {
        expect(promotionMessages.en, label).toHaveProperty(label)
        expect(promotionMessages['zh-TW'], label).toHaveProperty(label)
      }
    }
  })
})

/** A running 53-bit hash (cyrb53, public domain): enough to tell two long streams apart */
function hasher() {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  return {
    update(text: string) {
      for (let at = 0; at < text.length; at++) {
        const code = text.charCodeAt(at)
        h1 = Math.imul(h1 ^ code, 2654435761)
        h2 = Math.imul(h2 ^ code, 1597334677)
      }
    },
    digest() {
      const a = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
      const b = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
      return (4294967296 * (2097151 & b) + (a >>> 0)).toString(16)
    },
  }
}

// ── The simple edition is untouched ──────────────────────────────────────────────────────────

describe('the simple edition', () => {
  // A fingerprint of 200 whole games (both dice, 2 to 6 seats, 20 seeds each), every state and view
  // and the result, through the registered module with options as a room before C6 stored them (no
  // `edition`). Taken on main before C6 (c349616) and again after: they match
  it('plays exactly as before C6', () => {
    const hash = hasher()
    // The career route (2026-11-13) is new: the play is what must not change
    const json = (value: unknown) =>
      JSON.stringify(value, (key, field: unknown) => (key === 'route' ? undefined : field))
    for (const kind of ['four-sided', 'six-sided'] as const) {
      for (let seats = 2; seats <= 6; seats++) {
        for (let seed = 1; seed <= 20; seed++) {
          const options = { dice: kind, turnLimit: 40 } as PromotionOptions
          let match = startMatch(promotion, makeSeats(seats), options, seed)
          hash.update(json(match.state))
          while (!promotion.isOver(match.state)) {
            const next = applyAction(promotion, match, ROLL, match.state.turn as number)
            if (isGameError(next)) throw new Error(next.gameError)
            match = next
            hash.update(
              json(match.state) +
                json(promotion.view(match.state, 0)) +
                json(promotion.view(match.state, 'spectator')),
            )
          }
          hash.update(json(promotion.result(match.state)))
        }
      }
    }
    expect(hash.digest()).toBe('139c56be19ac36')
  })

  it('is what `edition: simple` plays too, and its states have no `edition`', () => {
    const a = startMatch(promotion, makeSeats(3), { ...FULL, edition: 'simple' }, 4)
    const b = startMatch(promotion, makeSeats(3), { dice: 'four-sided', turnLimit: 60 } as PromotionOptions, 4)
    expect(a.state).toEqual(b.state)
    expect(a.state).not.toHaveProperty('edition')
  })
})
