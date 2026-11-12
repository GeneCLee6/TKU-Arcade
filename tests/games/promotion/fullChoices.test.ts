// @vitest-environment node
// Promotion's full edition, second rules and board (C8, e3-t15): the players' choices (offered posts,
// buying office), event zones and restoration after dismissal, the money changes, the room options,
// the rules a game from before C8 keeps, and the board's consistency: every cell reachable, none a
// trap, and no move back to an origin.
import { describe, expect, it, vi } from 'vitest'
import { applyAction, makeSeats, startMatch, type Match } from '../../../shared/games/match.ts'
import {
  BOARD_FULL,
  BOARD_FULL_V2,
  BUY_CAPITAL,
  BUY_PROVINCES,
  DISMISSED,
  FULL_CENTRE,
  FULL_DEPARTMENTS,
  FULL_FACES,
  FULL_ORIGINS,
  FULL_RINGS,
  fullBoard,
  gradeOf,
  type FullCell,
  type FullFace,
} from '../../../shared/games/promotion/boardFull.ts'
import { promotionMessages } from '../../../shared/games/promotion/i18n.ts'
import { promotion } from '../../../shared/games/promotion/rules.ts'
import {
  BUY_DISCOUNT,
  BUY_STEP,
  buyChoices,
  DAHE_GIFT,
  finalGrade,
  hasStanding,
  initFullV1,
  lowerPost,
  meets,
  resolveCell,
  stepTarget,
  THROWS_V2,
} from '../../../shared/games/promotion/rulesFull.ts'
import type {
  FullPlayer,
  PromotionAction,
  PromotionAnyState,
  PromotionFullState,
  PromotionOptions,
} from '../../../shared/games/promotion/types.ts'
import { createRng } from '../../../shared/games/rng.ts'
import { isGameError, type Rng } from '../../../shared/games/types.ts'
import { playRandom } from '../harness.ts'

vi.setConfig({ testTimeout: 120_000 })

const B2 = fullBoard(2)
const cellOf = (id: string) => B2.get(id)
const FULL: PromotionOptions = {
  dice: 'six-sided',
  turnLimit: 60,
  edition: 'full',
  decisionSeconds: 30,
  buying: true,
  endAtDahe: false,
}
const ROLL = { type: 'roll' as const }

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

// Pips: 4 de, 6 cai, 5 gong, 3 liang, 2 rou, 1 zang
const PAIR: Record<FullFace, number[]> = {
  de: [4, 4, 5, 3],
  cai: [6, 6, 5, 3],
  gong: [5, 5, 2, 3],
  liang: [3, 3, 2, 5],
  rou: [2, 2, 3, 5],
  zang: [1, 1, 2, 3],
}
const NOTHING = [1, 2, 4, 6]

const start = (seats: number, options: Partial<PromotionOptions> = {}) =>
  promotion.init(makeSeats(seats), { ...FULL, ...options }, dice([])) as PromotionFullState

/** Players placed by hand: past the birth roll, on these cells */
function placed(state: PromotionFullState, cells: string[], extra: Partial<FullPlayer> = {}) {
  return {
    ...state,
    players: state.players.map((player, at) => ({
      ...player,
      cell: cells[at],
      rank: cellOf(cells[at]).rank,
      origin: 'baiding',
      ...extra,
    })),
  }
}

function act(state: PromotionFullState, action: PromotionAction, actor: number | 'system', pips: number[] = []) {
  const next = promotion.reduce(state, action, actor, dice(pips))
  if (isGameError(next)) throw new Error(next.gameError)
  return next as PromotionFullState
}
const roll = (state: PromotionFullState, pips: number[]) => act(state, ROLL, state.turn as number, pips)
const error = (state: PromotionFullState, action: PromotionAction, actor: number | 'system') =>
  (promotion.reduce(state, action, actor, dice([])) as { gameError?: string }).gameError
const total = (state: PromotionFullState) =>
  state.bank + state.players.reduce((sum, player) => sum + player.money, 0)

// ── Rooms from before C8 ─────────────────────────────────────────────────────────────────────

/** A running 53-bit hash (cyrb53, public domain) */
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

describe('a full-edition game from before C8', () => {
  // 200 whole games under the first rules (2 to 6 seats, 40 seeds each, a pass every seventh
  // action), every state, view and legal action and the result. Taken on main before C8 (b4dec21),
  // where every full game was one of these, and again after: they match
  it('plays exactly as it did under C6', () => {
    const hash = hasher()
    for (let seats = 2; seats <= 6; seats++) {
      for (let seed = 1; seed <= 40; seed++) {
        const rng = createRng(seed)
        let state: PromotionAnyState = initFullV1(makeSeats(seats), rng)
        let position = rng.state()
        hash.update(JSON.stringify(state))
        let n = 0
        while (!promotion.isOver(state)) {
          const r = createRng(position)
          const pass = n++ % 7 === 6
          const action: PromotionAction = pass ? { type: 'pass' } : ROLL
          const next = promotion.reduce(state, action, pass ? 'system' : (state.turn as number), r)
          if (isGameError(next)) throw new Error(next.gameError)
          state = next
          position = r.state()
          hash.update(
            JSON.stringify(state) +
              JSON.stringify(promotion.view(state, 0)) +
              JSON.stringify(promotion.view(state, 'spectator')) +
              JSON.stringify(promotion.legalActions(state, state.turn ?? 0)),
          )
        }
        hash.update(JSON.stringify(promotion.result(state)))
      }
    }
    expect(hash.digest()).toBe('c65c6eab5b4c1')
  })

  it('keeps no decisions, timers or new fields, and refuses the new actions', () => {
    const state = initFullV1(makeSeats(3), dice([]))
    expect(state).not.toHaveProperty('rulesVersion')
    expect(promotion.timers?.(state)).toEqual([])
    expect(promotion.skipAction?.(state, 0)).toEqual({ type: 'pass' })
    expect(promotion.legalActions(state, 0)).toEqual([ROLL])
    for (const action of [{ type: 'accept' }, { type: 'skip' }, { type: 'buy', cell: 'zhixian' }] as const) {
      expect(error(state, action, 0)).toBe('games.promotion.error.badAction')
    }
  })

  it('a new full game starts on the second rules, with the room options', () => {
    const state = start(3, { decisionSeconds: 45, buying: false, endAtDahe: true })
    expect(state).toMatchObject({
      rulesVersion: 2,
      rules: { decisionMs: 45_000, buying: false, endAtDahe: true },
      pending: null,
      decisions: 0,
      acts: 0,
    })
    expect(state.players[0]).toMatchObject({ bought: false, titles: 0, post: null })
  })
})

// ── The second board ─────────────────────────────────────────────────────────────────────────

const ids = new Set(BOARD_FULL_V2.map((cell) => cell.id))
const ORIGIN_IDS = new Set(BOARD_FULL_V2.filter((cell) => cell.dept === 'origin').map((cell) => cell.id))
const targetsOf = (cell: FullCell) =>
  [
    ...Object.values(cell.moves),
    ...Object.values(cell.banner ?? {}),
    cell.fengjue,
    cell.instead,
    cell.demote,
  ].filter((id): id is string => id !== null)

describe('the second full board', () => {
  it('has 150 to 250 cells, unique ids, each in a department, named in both languages', () => {
    expect(BOARD_FULL_V2.length).toBeGreaterThanOrEqual(150)
    expect(BOARD_FULL_V2.length).toBeLessThanOrEqual(250)
    expect(ids.size).toBe(BOARD_FULL_V2.length)
    expect(B2.depts).toEqual(Object.keys(FULL_DEPARTMENTS))
    for (const cell of BOARD_FULL_V2) {
      expect(cell.name['zh-TW'], cell.id).toMatch(/^[一-鿿]+$/)
      expect(cell.name.en, cell.id).toMatch(/^[A-Z][A-Za-z ,-]+ \([^()]+\)$/)
    }
  })

  it('keeps every id of the first board but the clerk, whom nothing reaches now', () => {
    const dropped = BOARD_FULL.filter((cell) => !ids.has(cell.id)).map((cell) => cell.id)
    expect(dropped).toEqual(['shuli'])
  })

  it('every destination exists; a requirement always has an instead; no requirement loops', () => {
    for (const cell of BOARD_FULL_V2) {
      for (const target of targetsOf(cell)) expect(ids, `${cell.id} -> ${target}`).toContain(target)
      expect(cell.requires === null, cell.id).toBe(cell.instead === null)
    }
    for (const profile of PROFILES) {
      for (const cell of BOARD_FULL_V2) {
        const landed = cellOf(resolveCell(B2, profile, cell.id))
        expect(landed.requires === null || meets(profile, landed.requires)).toBe(true)
      }
    }
  })

  it('no move leads back to an origin: they are only where the birth roll places a seat', () => {
    for (const cell of BOARD_FULL_V2) {
      const back = targetsOf(cell).filter((target) => ORIGIN_IDS.has(target) && target !== cell.id)
      expect(back, cell.id).toEqual([])
    }
    // The origins are the birth roll's places but the licentiate, who is in the examinations
    expect([...ORIGIN_IDS].sort()).toEqual(FULL_ORIGINS.filter((id) => id !== 'shengyuan').sort())
  })

  it('ranks move the way each kind of cell intends', () => {
    const special = (id: string) => ['end', 'event', 'penalty'].includes(cellOf(id).kind)
    for (const cell of BOARD_FULL_V2) {
      const rank = (face: FullFace) => cellOf(cell.moves[face]).rank
      const why = `${cell.id} (${cell.kind})`
      if (cell.kind === 'office') {
        expect(rank('de'), why).toBeGreaterThanOrEqual(rank('cai'))
        expect(rank('cai'), why).toBeGreaterThanOrEqual(rank('gong'))
        expect(rank('gong'), why).toBeGreaterThanOrEqual(cell.rank)
        if (!special(cell.moves.liang)) expect(rank('liang'), why).toBeGreaterThanOrEqual(cell.rank)
        if (!special(cell.moves.zang)) expect(rank('zang'), why).toBeLessThan(cell.rank)
        if (cell.demote !== null) expect(cellOf(cell.demote).rank, why).toBeLessThan(cell.rank)
      }
      if (cell.kind === 'origin' || cell.kind === 'exam') {
        for (const face of ['de', 'cai', 'gong'] as const) {
          expect(rank(face), why).toBeGreaterThanOrEqual(cell.rank)
        }
        // A fall from where a career starts stays put at worst: nothing leads back to an origin
        expect(rank('zang'), why).toBeLessThanOrEqual(cell.rank)
      }
      if (cell.kind === 'palace') {
        for (const face of FULL_FACES) expect(rank(face), why).toBeGreaterThanOrEqual(cell.rank)
      }
      if (cell.kind === 'appoint') {
        for (const face of FULL_FACES) expect(rank(face), why).toBeGreaterThanOrEqual(6)
      }
      if (cell.kind === 'end' || cell.kind === 'event') {
        for (const face of FULL_FACES) expect(cell.moves[face], why).toBe(cell.id)
      }
      expect(cell.event !== null, why).toBe(cell.kind === 'event')
    }
  })

  it('event zones have an outcome for every face; offers, minor posts and commissions are marked', () => {
    const zones = BOARD_FULL_V2.filter((cell) => cell.event !== null).map((cell) => cell.id)
    expect(zones.sort()).toEqual(['chufen', 'daji', 'dakao', 'jingcha', 'jungong', 'kuangdian'])
    for (const id of zones) expect(Object.keys(cellOf(id).event ?? {})).toEqual([...FULL_FACES])
    const offers = BOARD_FULL_V2.filter((cell) => cell.offer).map((cell) => cell.id)
    expect(offers.sort()).toEqual(['fanglue-tenglu', 'guoshi-tenglu', 'huidian-tenglu', 'jiaoxi', 'zhaoshi'])
    const minor = BOARD_FULL_V2.filter((cell) => cell.minor).map((cell) => cell.id)
    expect(minor.sort()).toEqual(['qintian-boshi', 'taiyi-limu', 'tianwensheng', 'yishi'])
    for (const id of ['xuezheng', 'fukaoguan', 'zhengkaoguan']) expect(cellOf(id).fine).toBe(15)
    // Commissions are the regular route's: a requirement of standing on every one of them
    for (const cell of BOARD_FULL_V2.filter((entry) => entry.fine > 0 && entry.money > 0)) {
      expect(cell.requires === 'zhengtu' || cell.requires === 'jinshi' || cell.dept === 'dao' || cell.dept === 'yanyuan' || cell.dept === 'junji', cell.id).toBe(true)
    }
  })

  it('what can be bought stays under the historical caps: a capital director, a provincial intendant', () => {
    const capital = Math.max(...BUY_CAPITAL.map((id) => cellOf(id).rank))
    const provinces = Math.max(...BUY_PROVINCES.map((id) => cellOf(id).rank))
    expect(capital).toBe(cellOf('revenue-langzhong').rank) // senior fifth grade
    expect(provinces).toBe(cellOf('fenshoudao').rank) // senior fourth grade
    for (const id of BUY_CAPITAL) expect(FULL_DEPARTMENTS[cellOf(id).dept].section).toBe('capital')
    for (const id of BUY_PROVINCES) expect(FULL_DEPARTMENTS[cellOf(id).dept].section).toBe('provinces')
    for (const id of [...BUY_CAPITAL, ...BUY_PROVINCES]) expect(cellOf(id).requires).toBeNull()
  })

  it('places every department once on the rings of a square board, the centre last', () => {
    const placed = [...FULL_RINGS.flat(), ...FULL_CENTRE]
    expect([...placed].sort()).toEqual([...B2.depts].sort())
    expect(new Set(placed).size).toBe(placed.length)
    expect(FULL_RINGS[0]).toContain('origin')
    expect(FULL_RINGS[0]).toContain('exam')
    expect(FULL_CENTRE).toContain('end')
    // A department's cells are together on the board, in the order they go round
    const seen = new Set<string>()
    let previous = ''
    for (const cell of BOARD_FULL_V2) {
      if (cell.dept !== previous) {
        expect(seen.has(cell.dept), cell.dept).toBe(false)
        seen.add(cell.dept)
        previous = cell.dept
      }
    }
  })

  it('every department with courtesy holds people serving: offices, appointments, origins', () => {
    for (const cell of BOARD_FULL_V2) {
      if (!FULL_DEPARTMENTS[cell.dept].courtesy) continue
      expect(['office', 'appoint', 'origin'], cell.id).toContain(cell.kind)
    }
  })
})

// ── Reaching every cell, from every origin, on the second board ──────────────────────────────

type Profile = Pick<FullPlayer, 'cell' | 'degree' | 'wu' | 'banner'> & { bought: boolean; post: string | null }
const PROFILES: FullPlayer[] = [0, 1, 2, 3].flatMap((degree) =>
  [false, true].flatMap((wu) =>
    [false, true].flatMap((banner) =>
      [false, true].map(
        (bought): FullPlayer => ({
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
          bought,
        }),
      ),
    ),
  ),
)
const key = (p: Profile) => `${p.cell}|${p.degree}|${p.wu}|${p.banner}|${p.bought}|${p.post}`
const isEnd = (id: string) => cellOf(id).kind === 'end'

/** Landing on `id` from `from`, with what the cell gives */
function arrive(from: Profile, id: string, post: string | null = null): Profile {
  const landed = cellOf(id)
  return {
    cell: id,
    degree: Math.max(from.degree, landed.degree) as Profile['degree'],
    wu: from.wu || landed.wu,
    banner: from.banner,
    bought: from.bought || id === 'juanban',
    post,
  }
}

/** Every profile one action away: any result, ennoblement or dismissal, an event's outcomes, a purchase */
function successors(from: Profile): Profile[] {
  const cell = cellOf(from.cell)
  if (cell.kind === 'end') return []
  const player = { ...PROFILES[0], ...from }
  // Dismissed: restored to the post or the next one down, or exiled
  if (from.cell === DISMISSED) {
    const post = from.post as string
    return [post, lowerPost(B2, post)]
      .map((id) => arrive(from, resolveCell(B2, player, id)))
      .concat(arrive(from, 'changshu'))
  }
  const raws = [
    ...FULL_FACES.map((face) => stepTarget(B2, player, face)),
    ...(cell.dept === 'origin' ? [] : [stepTarget(B2, player, 'dismiss')]),
    cell.fengjue ?? stepTarget(B2, player, 'de'),
  ]
  const next: Profile[] = []
  for (const raw of raws) {
    const id = resolveCell(B2, player, raw)
    const landed = cellOf(id)
    if (id === DISMISSED) {
      next.push(arrive(from, id, from.cell))
    } else if (landed.event !== null) {
      // The zone, then each outcome from the post held
      next.push(arrive(from, id, from.cell))
      const outcomes = [
        stepTarget(B2, player, 'de'),
        stepTarget(B2, player, 'cai'),
        from.cell,
        cell.demote ?? stepTarget(B2, player, 'zang'),
      ]
      for (const target of outcomes) {
        const at = cellOf(target).event !== null ? from.cell : target
        const resolved = resolveCell(B2, player, at)
        next.push(resolved === DISMISSED ? arrive(from, resolved, from.cell) : arrive(from, resolved))
      }
      next.push(arrive(from, DISMISSED, from.cell))
    } else {
      next.push(arrive(from, id))
      if (landed.minor && hasStanding({ ...player, rank: cell.rank })) {
        for (const bought of [...BUY_CAPITAL, ...BUY_PROVINCES]) {
          if (cellOf(bought).rank > landed.rank) next.push({ ...arrive(from, bought), bought: true })
        }
      }
    }
  }
  return next
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

describe('the second full board, walked', () => {
  const origins = FULL_ORIGINS.flatMap((cell) =>
    [false, true].map((banner): Profile => ({ cell, degree: 0, wu: false, banner, bought: false, post: null })),
  )

  it.each(origins.map((origin) => [origin.cell, origin.banner ? 'Banner' : 'civilian', origin] as const))(
    'from %s (%s), every cell is reachable that the household may hold, and no other origin',
    (_, __, origin) => {
      const reached = new Set([...explore([origin]).values()].map((p) => p.cell))
      const missing = BOARD_FULL_V2.filter(
        (cell) =>
          !reached.has(cell.id) &&
          !(cell.requires === 'banner' && !origin.banner) &&
          !(cell.dept === 'origin' && cell.id !== origin.cell),
      ).map((cell) => cell.id)
      expect(missing).toEqual([])
      const others = [...ORIGIN_IDS].filter((id) => id !== origin.cell && reached.has(id))
      expect(others).toEqual([])
    },
  )

  it('no cell traps a player: from every reachable position, dismissal included, a career can end', () => {
    const all = explore(origins)
    const ending = new Set<string>()
    let grew = true
    while (grew) {
      grew = false
      for (const [id, profile] of all) {
        if (ending.has(id)) continue
        if (isEnd(profile.cell) || successors(profile).some((next) => ending.has(key(next)))) {
          ending.add(id)
          grew = true
        }
      }
    }
    expect([...all.keys()].filter((id) => !ending.has(id))).toEqual([])
    expect([...all.values()].some((p) => p.cell === DISMISSED)).toBe(true)
  })
})

// ── Offered posts ────────────────────────────────────────────────────────────────────────────

describe('an offered post', () => {
  const offered = () => roll(placed(start(3), ['shengyuan', 'zhixian', 'zhixian']), PAIR.rou)

  it('waits for its seat: the turn stays, only that seat may answer, with a countdown', () => {
    const state = offered()
    expect(state.pending).toEqual({ kind: 'offer', seat: 0, cell: 'fanglue-tenglu', from: 'shengyuan' })
    expect(state.turn).toBe(0)
    expect(state.players[0].cell).toBe('shengyuan')
    expect(promotion.legalActions(state, 0)).toEqual([{ type: 'accept' }, { type: 'decline' }])
    expect(promotion.legalActions(state, 1)).toEqual([])
    expect(promotion.timers?.(state)).toEqual([{ id: 'decide-1', ms: 30_000, action: { type: 'decline' } }])
    expect(error(state, ROLL, 0)).toBe('games.promotion.error.decide')
    expect(error(state, { type: 'accept' }, 1)).toBe('games.promotion.error.notYourTurn')
    expect(error(state, { type: 'skip' }, 0)).toBe('games.promotion.error.decide')
    expect(error(state, { type: 'buy', cell: 'zhixian' }, 0)).toBe('games.promotion.error.decide')
  })

  it('accepted: the seat takes the post and its route, then the turn moves on', () => {
    const state = act(offered(), { type: 'accept' }, 0)
    expect(state.players[0].cell).toBe('fanglue-tenglu')
    expect(state).toMatchObject({ pending: null, turn: 1 })
    expect(state.last).toMatchObject({
      seat: 0,
      path: ['fanglue-tenglu'],
      decision: { kind: 'accept', cell: 'fanglue-tenglu', price: 0, timedOut: false },
    })
    expect(promotion.timers?.(state)).toEqual([])
  })

  it('declined: the move is forfeit, the seat stays and rolls as usual next time', () => {
    const state = act(offered(), { type: 'decline' }, 0)
    expect(state.players[0].cell).toBe('shengyuan')
    expect(state).toMatchObject({ pending: null, turn: 1 })
    expect(state.last?.decision).toMatchObject({ kind: 'decline', timedOut: false })
  })

  it('unanswered: the room declines when the time runs out, and only ever with the default', () => {
    const state = offered()
    expect(error(state, { type: 'accept' }, 'system')).toBe('games.promotion.error.notYourTurn')
    const timedOut = act(state, { type: 'decline' }, 'system')
    expect(timedOut.players[0].cell).toBe('shengyuan')
    expect(timedOut.last?.decision).toMatchObject({ kind: 'decline', timedOut: true })
    // A seat whose player is gone: skipping it answers with the default too, and so does covering it
    expect(promotion.skipAction?.(state, 0)).toEqual({ type: 'decline' })
    expect(promotion.proxyActions?.(state, 0)).toEqual([{ type: 'decline' }])
    expect(act(state, { type: 'pass' }, 'system').players[0].cell).toBe('shengyuan')
  })

  it('each decision gets a fresh countdown', () => {
    let state = act(offered(), { type: 'decline' }, 0)
    state = roll(state, NOTHING)
    state = roll(state, NOTHING)
    state = roll(state, PAIR.rou)
    expect(promotion.timers?.(state)).toEqual([{ id: 'decide-2', ms: 30_000, action: { type: 'decline' } }])
  })

  it('is not offered again from one offered post to another', () => {
    const state = roll(placed(start(2), ['fanglue-tenglu', 'zhixian']), PAIR.gong)
    expect(state.pending).toBeNull()
    expect(state.players[0].cell).toBe(cellOf('fanglue-tenglu').moves.gong)
  })
})

// ── Buying office ────────────────────────────────────────────────────────────────────────────

describe('buying office instead of a minor post', () => {
  const sent = (cells = ['jiansheng', 'zhixian'], options: Partial<PromotionOptions> = {}) =>
    roll(placed(start(2, options), cells), cells[0] === 'jiansheng' ? PAIR.rou : PAIR.liang)

  it('offers every office on the lists above the minor post, at 5 a rank step from it', () => {
    const state = sent()
    expect(state.pending?.kind).toBe('buy')
    if (state.pending?.kind !== 'buy') return
    expect(state.pending.cell).toBe('tianwensheng')
    const base = cellOf('tianwensheng').rank
    for (const choice of state.pending.choices) {
      expect(choice.price).toBe(BUY_STEP * (cellOf(choice.cell).rank - base))
    }
    expect(state.pending.choices.map((c) => c.cell)).toEqual([...BUY_CAPITAL, ...BUY_PROVINCES])
    expect(promotion.legalActions(state, 0)).toEqual([
      { type: 'skip' },
      ...state.pending.choices.map((c) => ({ type: 'buy', cell: c.cell })),
    ])
    expect(promotion.timers?.(state)[0]?.action).toEqual({ type: 'skip' })
  })

  it('a capital official buying a provincial post saves 5, down to 5', () => {
    const state = sent(['honglu-mingzan', 'zhixian'])
    if (state.pending?.kind !== 'buy') throw new Error('no purchase offered')
    const base = cellOf('qintian-boshi').rank
    const price = (id: string) => state.pending?.kind === 'buy' && state.pending.choices.find((c) => c.cell === id)?.price
    expect(price('zhixian')).toBe(BUY_STEP * (cellOf('zhixian').rank - base) - BUY_DISCOUNT)
    expect(price('zhongshu')).toBe(BUY_STEP * (cellOf('zhongshu').rank - base))
  })

  it('bought: the silver goes to the pot, the seat is an irregular official on the office', () => {
    const before = sent()
    const state = act(before, { type: 'buy', cell: 'zhixian' }, 0)
    const price = BUY_STEP * (cellOf('zhixian').rank - cellOf('tianwensheng').rank)
    expect(state.players[0]).toMatchObject({ cell: 'zhixian', bought: true, money: 100 - price })
    expect(state.bank).toBe(before.bank + price)
    expect(state.last?.transfers).toContainEqual({ from: 0, to: null, amount: price, why: 'buy' })
    expect(state.last?.decision).toMatchObject({ kind: 'buy', cell: 'zhixian', price })
    expect(total(state)).toBe(total(before))
    // A purchased office is not the regular route, whatever came before
    expect(meets({ ...state.players[0], degree: 1 }, 'zhengtu')).toBe(false)
    expect(meets({ ...state.players[0], degree: 1, bought: false }, 'zhengtu')).toBe(true)
  })

  it('skipped, or unanswered: the seat takes the minor post', () => {
    expect(act(sent(), { type: 'skip' }, 0).players[0].cell).toBe('tianwensheng')
    const timed = act(sent(), { type: 'skip' }, 'system')
    expect(timed.players[0].cell).toBe('tianwensheng')
    expect(timed.last?.decision).toMatchObject({ kind: 'skip', timedOut: true })
  })

  it('refuses an office not offered, one the seat cannot pay, and a buy from anyone else', () => {
    const state = sent()
    expect(error(state, { type: 'buy', cell: 'xunfu' }, 0)).toBe('games.promotion.error.badBuy')
    expect(error(state, { type: 'buy', cell: 'zhixian' }, 1)).toBe('games.promotion.error.notYourTurn')
    expect(error(state, { type: 'buy', cell: 'zhixian' }, 'system')).toBe('games.promotion.error.notYourTurn')
    const poor = { ...state, players: state.players.map((p, at) => (at === 0 ? { ...p, money: 10 } : p)) }
    expect(error(poor, { type: 'buy', cell: 'zhixian' }, 0)).toBe('games.promotion.error.cannotAfford')
    expect(promotion.reduce(state, { type: 'buy' } as never, 0, dice([]))).toEqual({
      gameError: 'games.promotion.error.badAction',
    })
  })

  it('only for those with standing, only what they can pay for, and not when the room turns it off', () => {
    const player = { ...PROFILES[0], money: 100 }
    expect(hasStanding({ ...player, rank: 1 })).toBe(false)
    expect(hasStanding({ ...player, rank: cellOf('jiansheng').rank })).toBe(true)
    expect(buyChoices(B2, { ...player, rank: 1 }, 'tianwensheng', 'tongsheng')).toEqual([])
    const some = buyChoices(B2, { ...player, rank: 2, money: 30 }, 'tianwensheng', 'jiansheng')
    expect(some.every((c) => c.price <= 30)).toBe(true)
    expect(some.length).toBeGreaterThan(0)
    const off = sent(['jiansheng', 'zhixian'], { buying: false })
    expect(off.pending).toBeNull()
    expect(off.players[0].cell).toBe('tianwensheng')
  })
})

// ── Events, commissions, dismissal, congratulations, titles ─────────────────────────────────

describe('the second rules’ events and money', () => {
  it('a turn is one throw: no combination, no move', () => {
    const state = roll(placed(start(2), ['zhixian', 'zhixian']), NOTHING)
    expect(THROWS_V2).toBe(1)
    expect(state.last?.throws).toHaveLength(1)
    expect(state.players[0].cell).toBe('zhixian')
    expect(state.turn).toBe(1)
  })

  it('an event zone throws again at once; its face decides from the post held', () => {
    const state = roll(placed(start(2), ['zhixian', 'zhixian']), [...PAIR.rou, ...PAIR.de])
    expect(state.last?.path).toEqual(['daji', stepTarget(B2, state.players[0], 'cai', 'zhixian')])
    expect(state.last?.throws.map((t) => t.event ?? null)).toEqual([null, { cell: 'daji', face: 'de' }])
    expect(state.players[0].post).toBeNull()
  })

  it('a second throw that scores nothing waits for the next turn, which decides it', () => {
    let state = roll(placed(start(2), ['zhixian', 'zhixian']), [...PAIR.rou, ...NOTHING])
    expect(state.players[0]).toMatchObject({ cell: 'daji', post: 'zhixian', rank: cellOf('zhixian').rank })
    state = roll(state, NOTHING)
    state = roll(state, PAIR.zang)
    expect(state.players[0].cell).toBe(cellOf('zhixian').moves.zang)
  })

  it('graft while holding a commission is fined, more for examiners', () => {
    const state = roll(placed(start(2), ['xuezheng', 'zhixian'], { degree: 3 }), PAIR.zang)
    expect(state.last?.transfers[0]).toEqual({ from: 0, to: null, amount: 15, why: 'fine' })
    const censor = roll(placed(start(2), ['xunchengyushi', 'zhixian'], { degree: 1 }), PAIR.zang)
    expect(censor.last?.transfers[0]).toEqual({ from: 0, to: null, amount: 10, why: 'fine' })
  })

  it('dismissal waits: virtue restores the post, talent the one below, three graft exile', () => {
    const dismissed = roll(placed(start(2), ['zhixian', 'zhixian']), [1, 1, 1, 1])
    expect(dismissed.players[0]).toMatchObject({ cell: DISMISSED, post: 'zhixian' })
    const at = { ...dismissed, turn: 0 }
    expect(roll(at, PAIR.de).players[0]).toMatchObject({ cell: 'zhixian', post: null })
    expect(roll(at, PAIR.cai).players[0].cell).toBe(lowerPost(B2, 'zhixian'))
    expect(lowerPost(B2, 'zhixian')).toBe('xiancheng')
    expect(roll(at, PAIR.gong).players[0].cell).toBe(DISMISSED)
    expect(roll(at, PAIR.zang).players[0].cell).toBe(DISMISSED)
    expect(roll(at, [1, 1, 1, 2]).players[0]).toMatchObject({ cell: 'changshu', status: 'out' })
  })

  it('dismissal always ends in restoration or exile, never back at an origin', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = createRng(seed)
      let state = { ...placed(start(2), [DISMISSED, 'zhixian']), turn: 0 } as PromotionFullState
      state = { ...state, players: state.players.map((p, at) => (at === 0 ? { ...p, post: 'zhixian' } : p)) }
      let turns = 0
      while (state.players[0].cell === DISMISSED && turns < 400) {
        const next = promotion.reduce({ ...state, turn: 0 }, ROLL, 0, rng)
        if (isGameError(next)) throw new Error(next.gameError)
        state = next as PromotionFullState
        turns += 1
      }
      expect(['zhixian', 'xiancheng', 'changshu'], `seed ${seed}`).toContain(state.players[0].cell)
    }
  })

  it('nobody is dismissed from an origin', () => {
    const state = roll(placed(start(2), ['baiding', 'zhixian']), [1, 1, 1, 1])
    expect(state.players[0].cell).toBe('baiding')
  })

  it('grand congratulations: 30 from everyone still in office or exiled, nothing from the dismissed or retired', () => {
    let state = placed(start(5), ['taishi', 'zhixian', 'changshu', DISMISSED, 'zhishi'])
    state = {
      ...state,
      players: state.players.map((p, at) => ({
        ...p,
        status: at === 2 ? ('out' as const) : at === 4 ? ('retired' as const) : p.status,
      })),
    }
    state = roll(state, PAIR.gong)
    const congrats = state.last?.transfers.filter((t) => t.why === 'congrats')
    expect(congrats).toEqual([
      { from: 1, to: 0, amount: DAHE_GIFT, why: 'congrats' },
      { from: 2, to: 0, amount: DAHE_GIFT, why: 'congrats' },
    ])
    expect(DAHE_GIFT).toBe(30)
  })

  it('the table may end the game at the first grand congratulations', () => {
    const state = roll(placed(start(3, { endAtDahe: true }), ['taishi', 'zhixian', 'zhixian']), PAIR.gong)
    expect(state).toMatchObject({ turn: null, ending: 'dahe' })
    expect(state.settlement).not.toBeNull()
    expect(promotion.result(state).summary.key).toBe('games.promotion.full.result.dahe')
  })

  it('a governor-general holds an honorary title; each is a grade more in the comparison, below the top', () => {
    const state = roll(placed(start(2), ['xunfu', 'zhixian']), PAIR.cai)
    expect(state.players[0]).toMatchObject({ cell: 'zongdu', titles: 1 })
    const player = { ...state.players[0], titles: 2 }
    expect(finalGrade(player, 2)).toBe(Math.min(12, gradeOf(player.rank) + 2))
    expect(finalGrade(player, 1)).toBe(gradeOf(player.rank))
    expect(finalGrade({ ...player, rank: 30 }, 2)).toBe(13)
    expect(finalGrade({ ...player, status: 'out' }, 2)).toBe(0)
  })
})

// ── Whole games on the second rules ──────────────────────────────────────────────────────────

function playOut(seats: number, seed: number, choose: (legal: PromotionAction[], n: number) => PromotionAction) {
  let match: Match<PromotionAnyState> = startMatch(promotion, makeSeats(seats), FULL, seed)
  let n = 0
  const moved: { seat: number; from: string; path: string[] }[] = []
  while (!promotion.isOver(match.state)) {
    const state = match.state as PromotionFullState
    const seat = state.pending?.seat ?? (state.turn as number)
    const next = applyAction(promotion, match, choose(promotion.legalActions(state, seat), n++), seat)
    if (isGameError(next)) throw new Error(next.gameError)
    match = next
    const last = (match.state as PromotionFullState).last
    if (last && !last.birth) moved.push({ seat: last.seat, from: last.from, path: last.path })
  }
  return { state: match.state as PromotionFullState, moved }
}

describe('whole games on the second rules', () => {
  it.each([2, 3, 4, 5, 6])('%i seats: the harness finds no broken rule', (seats) => {
    for (let seed = 1; seed <= 8; seed++) {
      const { result } = playRandom(promotion, { seed, seats, options: FULL })
      expect(result.standings).toHaveLength(seats)
    }
  })

  it('choices come up, silver is conserved, and nobody is ever moved to an origin after birth', () => {
    let decisions = 0
    for (let seed = 1; seed <= 150; seed++) {
      const { state, moved } = playOut(4, seed, (legal, n) => {
        if (legal.length > 1) decisions += 1
        return legal[n % legal.length]
      })
      expect(total(state)).toBe(2 * 100 * 4)
      for (const { from, path } of moved) {
        for (const id of path) expect(!ORIGIN_IDS.has(id) || id === from, `${from} -> ${id}`).toBe(true)
      }
    }
    expect(decisions).toBeGreaterThan(50)
  })

  it('has every summary, note, error and option label in both languages', () => {
    const { en, 'zh-TW': zh } = promotionMessages
    for (const key of [
      'games.promotion.error.decide',
      'games.promotion.error.nothingToDecide',
      'games.promotion.error.badBuy',
      'games.promotion.error.cannotAfford',
      ...['decisionSeconds', 'buying', 'endAtDahe'].map((name) => promotion.options[name as 'buying'].labelKey),
    ]) {
      expect(en, key).toHaveProperty(key)
      expect(zh, key).toHaveProperty(key)
    }
  })
})
