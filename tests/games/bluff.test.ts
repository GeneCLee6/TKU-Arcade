import { describe, expect, it, vi } from 'vitest'
import { getGame, LOBBY_GAMES } from '../../shared/games/index.ts'
import { GAME_MESSAGES } from '../../shared/games/catalog.ts'
import { defaultOptions } from '../../shared/games/options.ts'
import { createRng } from '../../shared/games/rng.ts'
import { SCREEN_MESSAGES } from '../../shared/games/screenMessages.ts'
import { BLUFF_TERMS, BLUFF_WORDS } from '../../shared/games/bluff/bank.ts'
import {
  bluff,
  MOLE_WORDS,
  PREPARE_MS,
  roundPoints,
  SCORE,
  VOTE_MS,
} from '../../shared/games/bluff/rules.ts'
import type { BluffAction, BluffOptions, BluffState } from '../../shared/games/bluff/types.ts'
import { makeSeats } from '../../shared/games/match.ts'
import { isGameError, type Actor, type GameError } from '../../shared/games/types.ts'
import { playRandom } from './harness.ts'

// 真假朗讀 (e6-t02, e6-t03), with the owner's rules and scoring of 2026-11-13

vi.setConfig({ testTimeout: 120_000 })

const OPTIONS: BluffOptions = { twoRounds: false, readSeconds: 60, mole: true, hints: true, clock: true }

const start = (seats: number, overrides: Partial<BluffOptions> = {}, seed = 1) =>
  bluff.init(makeSeats(seats), { ...OPTIONS, ...overrides }, createRng(seed))

function act(state: BluffState, action: BluffAction, actor: Actor): BluffState {
  const next = bluff.reduce(state, action, actor, createRng(7))
  if (isGameError(next)) throw new Error(`${JSON.stringify(action)} by ${actor}: ${next.gameError}`)
  return next
}

const refusal = (state: BluffState, action: unknown, actor: Actor): string => {
  const answer = bluff.reduce(state, action as BluffAction, actor, createRng(7))
  expect(isGameError(answer)).toBe(true)
  return (answer as GameError).gameError
}

const error = (name: string) => `games.bluff.error.${name}`

/** Every reader has read: the vote is open */
function voting(state: BluffState): BluffState {
  let current = act(state, { type: 'startReading' }, state.judge)
  while (current.phase === 'reading') current = act(current, { type: 'doneReading' }, current.judge)
  return current
}

/** A five-seat round with fixed roles: judge 0, honest 1, mole 2, bluffers 3 and 4 */
function fixed(): BluffState {
  const state = start(5)
  return voting({ ...state, judge: 0, honest: 1, mole: 2, order: [1, 2, 3, 4], words: ['拖鞋', '阿嬤', '宵夜'] })
}

const stick = (state: BluffState, giver: number, seat: number | null) => act(state, { type: 'sticker', seat }, giver)
const pointsOf = (state: BluffState) =>
  Object.fromEntries(state.players.map((player, index) => [player.seat, state.reveal?.points[index]]))

describe('the module', () => {
  it('runs for 3 to 9, and stays out of the lobby until its screen is there', () => {
    expect(getGame('bluff')).toBe(bluff)
    expect([bluff.meta.minPlayers, bluff.meta.maxPlayers]).toEqual([3, 9])
    expect(LOBBY_GAMES.some((game) => game.id === 'bluff')).toBe(false)
  })

  it('has every key it can send translated, in both languages', () => {
    const keys = [
      ...Object.values(bluff.options).map((field) => field.labelKey),
      'games.bluff.name',
      'games.bluff.summary',
      'games.bluff.result.won',
      'games.bluff.result.tie',
      ...Object.keys(SCREEN_MESSAGES.en).filter((key) => key.startsWith('games.bluff.error.')),
    ]
    for (const language of ['en', 'zh-TW'] as const) {
      for (const key of keys) {
        expect(GAME_MESSAGES[language][key] ?? SCREEN_MESSAGES[language][key], `${language} ${key}`).toBeTruthy()
      }
    }
  })

  it('defaults to one round each, 60 s to read, a mole, hints and the clock', () => {
    expect(defaultOptions(bluff.options)).toEqual(OPTIONS)
  })
})

describe('the deal', () => {
  it('makes one judge, and of the others one honest reader and (from four players) one mole', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const state = start(5, {}, seed)
      expect(state.order).toHaveLength(4)
      expect(state.order).not.toContain(state.judge)
      expect(state.order).toContain(state.honest)
      expect(state.mole).not.toBeNull()
      expect(state.order).toContain(state.mole)
      expect(state.mole).not.toBe(state.honest)
      expect(new Set(state.words).size).toBe(MOLE_WORDS)
      for (const word of state.words) expect(BLUFF_WORDS).toContain(word)
    }
  })

  it('has no mole with three players, or with the option off', () => {
    expect(start(3).mole).toBeNull()
    expect(start(3).words).toEqual([])
    expect(start(6, { mole: false }).mole).toBeNull()
  })

  it('draws a term from the bank with its hint and explanation, never twice in a room', () => {
    let state = start(9, { twoRounds: true }, 3)
    const [category, term, hint, explanation] = BLUFF_TERMS[state.term.id - 1]
    expect(state.term).toEqual({ id: state.term.id, category, term, hint, explanation })
    const seen = [state.term.id]
    while (state.phase !== 'over') {
      state = voting(state)
      state = act(state, { type: 'vote', seat: state.order[0] }, state.judge)
      for (const seat of state.order) if (state.phase === 'voting') state = stick(state, seat, null)
      if (state.phase === 'reveal') {
        state = act(state, { type: 'next' }, state.judge)
        seen.push(state.term.id)
      }
    }
    expect(new Set(seen).size).toBe(18)
    expect(state.usedTerms).toEqual(seen)
  })

  it('moves the judge one seat on each round, so everyone judges once', () => {
    let state = start(4, {}, 2)
    const judges = [state.judge]
    while (state.phase !== 'over') {
      state = voting(state)
      state = act(state, { type: 'vote', seat: state.order[0] }, state.judge)
      for (const seat of state.order) if (state.phase === 'voting') state = stick(state, seat, null)
      if (state.phase === 'reveal') {
        state = act(state, { type: 'next' }, state.judge)
        judges.push(state.judge)
      }
    }
    expect([...judges].sort()).toEqual([0, 1, 2, 3])
    for (let i = 1; i < judges.length; i++) expect(judges[i]).toBe((judges[i - 1] + 1) % 4)
    expect(state.history).toHaveLength(3)
  })
})

describe('preparing and reading', () => {
  it('starts reading when the judge says so, or when the time runs out', () => {
    const state = start(4)
    expect(state.phase).toBe('prepare')
    const other = state.order[0]
    expect(refusal(state, { type: 'startReading' }, other)).toBe(error('notJudge'))
    expect(act(state, { type: 'startReading' }, state.judge).phase).toBe('reading')
    expect(act(state, { type: 'timeUp' }, 'system').phase).toBe('reading')
  })

  it('goes through the readers in order, each ended by the reader or the judge', () => {
    let state = act(start(5), { type: 'startReading' }, 0 + start(5).judge)
    const [first, second] = state.order
    expect(refusal(state, { type: 'doneReading' }, second)).toBe(error('notYourReading'))
    state = act(state, { type: 'doneReading' }, first)
    expect(state.reader).toBe(1)
    state = act(state, { type: 'doneReading' }, state.judge)
    expect(state.reader).toBe(2)
    state = act(state, { type: 'timeUp' }, 'system')
    state = act(state, { type: 'doneReading' }, state.order[3])
    expect(state.phase).toBe('voting')
  })

  it('gives 15 s to prepare, the option’s seconds to each reader, 60 s to vote; none without the clock', () => {
    const state = start(4, { readSeconds: 45 })
    expect(bluff.timers?.(state)).toEqual([{ id: 'prepare-1', ms: PREPARE_MS, action: { type: 'timeUp' } }])
    const reading = act(state, { type: 'startReading' }, state.judge)
    expect(bluff.timers?.(reading)).toEqual([{ id: 'read-1-0', ms: 45_000, action: { type: 'timeUp' } }])
    const second = act(reading, { type: 'doneReading' }, reading.judge)
    expect(bluff.timers?.(second)?.[0].id).toBe('read-1-1')
    expect(bluff.timers?.(voting(state))).toEqual([{ id: 'vote-1', ms: VOTE_MS, action: { type: 'timeUp' } }])
    expect(bluff.timers?.(start(4, { clock: false }))).toEqual([])
  })
})

describe('voting and stickers', () => {
  it('lets the judge vote once for a reader, and nobody else vote', () => {
    const state = fixed()
    expect(refusal(state, { type: 'vote', seat: 1 }, 3)).toBe(error('notJudge'))
    expect(refusal(state, { type: 'vote', seat: 0 }, 0)).toBe(error('notAReader'))
    const voted = act(state, { type: 'vote', seat: 1 }, 0)
    expect(voted.phase).toBe('voting')
    expect(refusal(voted, { type: 'vote', seat: 2 }, 0)).toBe(error('notJudge'))
  })

  it('lets everyone else give one sticker to another reader, or none; not the judge, not oneself', () => {
    const state = fixed()
    expect(refusal(state, { type: 'sticker', seat: 1 }, 0)).toBe(error('judgeSticker'))
    expect(refusal(state, { type: 'sticker', seat: 3 }, 3)).toBe(error('ownSticker'))
    expect(refusal(state, { type: 'sticker', seat: 0 }, 3)).toBe(error('notAReader'))
    const given = stick(state, 3, 4)
    expect(refusal(given, { type: 'sticker', seat: 2 }, 3)).toBe(error('notVoting'))
    expect(bluff.legalActions(state, 3)).toEqual([
      { type: 'sticker', seat: 1 },
      { type: 'sticker', seat: 2 },
      { type: 'sticker', seat: 4 },
      { type: 'sticker', seat: null },
    ])
    expect(bluff.legalActions(state, 0)).toEqual([1, 2, 3, 4].map((seat) => ({ type: 'vote', seat })))
  })

  it('reveals once the judge has voted and everyone has decided, or when the time runs out', () => {
    let state = fixed()
    state = act(state, { type: 'vote', seat: 1 }, 0)
    for (const seat of [1, 2, 3]) state = stick(state, seat, null)
    expect(state.phase).toBe('voting')
    state = stick(state, 4, null)
    expect(state.phase).toBe('reveal')
    const timed = act(fixed(), { type: 'timeUp' }, 'system')
    expect(timed.reveal).toMatchObject({ vote: null, missed: 'time' })
  })
})

describe('scoring (owner, 2026-11-13)', () => {
  /** Judge 0 votes `vote`; stickers by giver; returns the round's points by seat */
  function score(vote: number | null, stickers: Record<number, number | null>) {
    let state = fixed()
    if (vote !== null) state = act(state, { type: 'vote', seat: vote }, 0)
    for (const seat of [1, 2, 3, 4]) state = stick(state, seat, stickers[seat] ?? null)
    if (vote === null) state = act(state, { type: 'timeUp' }, 'system')
    return pointsOf(state)
  }

  it('the judge finds the honest reader: both score 2; the mole unstuck scores 2', () => {
    expect(score(1, {})).toEqual({ 0: 2, 1: 2, 2: 2, 3: 0, 4: 0 })
  })

  it('the judge falls for a bluffer, or for the mole: that reader scores 3', () => {
    expect(score(3, {})).toEqual({ 0: 0, 1: 0, 2: 2, 3: 3, 4: 0 })
    expect(score(2, {})).toEqual({ 0: 0, 1: 0, 2: 3 + SCORE.moleUnstuck, 3: 0, 4: 0 })
  })

  it('a sticker on the honest reader costs 1; on the mole earns 2, and the mole loses the bonus', () => {
    expect(score(1, { 3: 1, 4: 2 })).toEqual({ 0: 2, 1: 2, 2: 0, 3: -1, 4: 2 })
    // On a plain bluffer it does nothing
    expect(score(1, { 1: 3, 2: 4 })).toEqual({ 0: 2, 1: 2, 2: 2, 3: 0, 4: 0 })
  })

  it('a missing vote scores nothing for anyone, the stickers still count', () => {
    expect(score(null, { 3: 2 })).toEqual({ 0: 0, 1: 0, 2: 0, 3: 2, 4: 0 })
  })

  it('without a mole there is no mole bonus', () => {
    const state = { ...fixed(), mole: null, words: [] }
    expect(Object.fromEntries(roundPoints(state, 1))).toEqual({ 0: 2, 1: 2, 2: 0, 3: 0, 4: 0 })
  })

  it('ends after the last judge with the reveal up, ranked by score, ties sharing a place', () => {
    let state = start(3, {}, 4)
    while (state.phase !== 'over') {
      state = voting(state)
      state = act(state, { type: 'vote', seat: state.honest }, state.judge)
      for (const seat of state.order) if (state.phase === 'voting') state = stick(state, seat, null)
      if (state.phase === 'reveal') state = act(state, { type: 'next' }, state.judge)
    }
    expect(bluff.isOver(state)).toBe(true)
    // Every round the judge and the honest reader score 2: everyone has 4 or so
    const result = bluff.result(state)
    expect(result.standings).toHaveLength(3)
    expect(result.standings[0].rank).toBe(1)
    expect(refusal(state, { type: 'next' }, state.judge)).toBe(error('over'))
  })
})

describe('view trimming', () => {
  const state = start(5, {}, 9)
  const view = (viewer: number | 'spectator', s: BluffState = state) => bluff.view(s, viewer)

  it('gives the honest reader the explanation, and nobody else before the reveal', () => {
    expect(view(state.honest).role).toBe('honest')
    expect(view(state.honest).explanation).toBe(state.term.explanation)
    for (const seat of [state.judge, ...state.order.filter((s) => s !== state.honest)]) {
      expect(view(seat).explanation).toBeNull()
    }
    expect(view('spectator').explanation).toBeNull()
  })

  it('gives bluffers and the mole the hint (if on), the mole alone the words, and hides who is who', () => {
    const bluffer = state.order.find((s) => s !== state.honest && s !== state.mole) as number
    expect(view(bluffer)).toMatchObject({ role: 'bluffer', hint: state.term.hint, words: [] })
    expect(view(state.mole as number)).toMatchObject({ role: 'mole', words: state.words })
    expect(view(state.judge)).toMatchObject({ role: 'judge', hint: null, words: [] })
    expect(view(bluffer, { ...state, hints: false }).hint).toBeNull()
    for (const viewer of [state.judge, bluffer, state.honest, 'spectator'] as const) {
      expect(view(viewer)).toMatchObject({ honest: null, mole: null })
    }
    // The full state never goes out as it is
    expect(JSON.stringify(view(bluffer))).not.toContain(state.term.explanation)
  })

  it('keeps the vote and the stickers secret until the reveal, saying only who has decided', () => {
    let s = act(voting(state), { type: 'vote', seat: state.order[0] }, state.judge)
    const giver = state.order[1]
    s = stick(s, giver, state.order[0])
    expect(view(state.judge, s).vote).toBe(state.order[0])
    expect(view(giver, s).vote).toBeNull()
    expect(view(giver, s).sticker).toBe(state.order[0])
    expect(view(state.order[2], s).sticker).toBeUndefined()
    expect(view(state.order[2], s).decided.sort()).toEqual([state.judge, giver].sort())
    expect(JSON.stringify(view(state.order[2], s))).not.toContain('"stickers"')
  })

  it('shows everything at the reveal', () => {
    let s = act(voting(state), { type: 'timeUp' }, 'system')
    expect(s.phase).toBe('reveal')
    const seen = view('spectator', s)
    expect(seen).toMatchObject({ honest: state.honest, mole: state.mole, words: state.words })
    expect(seen.explanation).toBe(state.term.explanation)
    s = act(s, { type: 'next' }, s.judge)
    expect(view('spectator', s).explanation).toBeNull()
  })
})

describe('covering for an absent seat', () => {
  it('starts the reading for a gone judge, and skips a gone reader', () => {
    const state = start(4)
    expect(bluff.skipAction?.(state, state.judge)).toEqual({ type: 'skip', seat: state.judge })
    const reading = act(state, { type: 'skip', seat: state.judge }, 'system')
    expect(reading.phase).toBe('reading')
    const reader = reading.order[0]
    expect(bluff.skipAction?.(reading, reading.order[1])).toBeNull()
    expect(act(reading, { type: 'skip', seat: reader }, 'system').reader).toBe(1)
  })

  it('passes a gone voter’s sticker, and voids a gone judge’s vote', () => {
    let state = fixed()
    state = act(state, { type: 'skip', seat: 0 }, 'system')
    expect(bluff.skipAction?.(state, 0)).toBeNull()
    for (const seat of [1, 2, 3]) state = stick(state, seat, null)
    state = act(state, { type: 'skip', seat: 4 }, 'system')
    expect(state.reveal).toMatchObject({ vote: null, missed: 'skipped' })
  })

  it('comes only from the room', () => {
    expect(refusal(start(4), { type: 'skip', seat: 0 }, 1)).toBe(error('systemOnly'))
    expect(refusal(start(4), { type: 'timeUp' }, 1)).toBe(error('systemOnly'))
  })
})

describe('chat', () => {
  it('is closed until the reveal, so nobody can type who has the real one', () => {
    const state = start(4)
    expect(bluff.chatLocked?.(state)).toBe(true)
    expect(bluff.chatLocked?.(voting(state))).toBe(true)
    expect(bluff.chatLocked?.(act(voting(state), { type: 'timeUp' }, 'system'))).toBe(false)
  })
})

describe('whole games through the harness', () => {
  it('plays to the end for 3 to 9 seats, with and without the mole and the clock', () => {
    for (const seats of [3, 4, 6, 9]) {
      for (const options of [OPTIONS, { ...OPTIONS, mole: false, clock: false, twoRounds: true }]) {
        for (let seed = 1; seed <= 5; seed++) {
          const { result, final } = playRandom(bluff, { seed, seats, options })
          expect(result.standings).toHaveLength(seats)
          expect(final.state.history).toHaveLength(final.state.totalRounds - 1)
        }
      }
    }
  })
})
