import { describe, expect, it } from 'vitest'
import { makeSeats } from '../../../shared/games/match.ts'
import { createRng } from '../../../shared/games/rng.ts'
import { bluff } from '../../../shared/games/bluff/rules.ts'
import type { BluffAction, BluffState, BluffView } from '../../../shared/games/bluff/types.ts'
import { isGameError, type Actor } from '../../../shared/games/types.ts'
import {
  answerKey,
  gains,
  promptOf,
  readerNow,
  readingStatus,
  signed,
} from '../../../src/games/bluff/screenState.ts'

const start = () =>
  bluff.init(makeSeats(4), { twoRounds: false, readSeconds: 60, mole: true, hints: true, clock: true }, createRng(7))

function act(state: BluffState, action: BluffAction, actor: Actor): BluffState {
  const next = bluff.reduce(state, action, actor, createRng(3))
  if (isGameError(next)) throw new Error(next.gameError)
  return next
}

const viewOf = (state: BluffState, seat: number): BluffView => bluff.view(state, seat)
const name = (seat: number) => `P${seat}`

describe('the bluff screen state', () => {
  it('tells the judge to start and everyone else who starts', () => {
    const state = start()
    expect(promptOf(viewOf(state, state.judge), name).key).toBe('games.bluff.ui.prompt.prepareJudge')
    expect(promptOf(viewOf(state, state.honest), name)).toEqual({
      key: 'games.bluff.ui.prompt.prepare',
      name: name(state.judge),
    })
  })

  it('follows the reader through the order', () => {
    let state = act(start(), { type: 'startReading' }, start().judge)
    const first = viewOf(state, state.judge)
    expect(readerNow(first)).toBe(state.order[0])
    expect(readingStatus(first, 0)).toBe('now')
    expect(readingStatus(first, 1)).toBe('later')
    expect(promptOf(viewOf(state, state.order[0]), name).key).toBe('games.bluff.ui.prompt.readYou')
    state = act(state, { type: 'doneReading' }, state.judge)
    const second = viewOf(state, state.judge)
    expect(readingStatus(second, 0)).toBe('done')
    expect(readingStatus(second, 1)).toBe('now')
  })

  // The judge's legal actions are the same for every reader: the key must still change (#25's trap)
  it('changes the answer key from one reader to the next, though the judge’s legal stays the same', () => {
    const state = act(start(), { type: 'startReading' }, start().judge)
    const next = act(state, { type: 'doneReading' }, state.judge)
    const legal = bluff.legalActions(state, state.judge)
    expect(bluff.legalActions(next, next.judge)).toEqual(legal)
    expect(answerKey(viewOf(next, next.judge), legal)).not.toBe(answerKey(viewOf(state, state.judge), legal))
  })

  it('counts gains and losses, signed with a true minus', () => {
    expect(signed(2)).toBe('+2')
    expect(signed(-1)).toBe('−1')
    let state = start()
    state = act(state, { type: 'startReading' }, state.judge)
    for (const _ of state.order) state = act(state, { type: 'doneReading' }, state.judge)
    const giver = state.order.find((seat) => seat !== state.honest) as number
    state = act(state, { type: 'sticker', seat: state.honest }, giver)
    for (const seat of state.order.filter((other) => other !== giver)) state = act(state, { type: 'sticker', seat: null }, seat)
    state = act(state, { type: 'vote', seat: state.honest }, state.judge)
    const gained = gains(viewOf(state, state.judge))
    expect(gained.get(giver)).toBe(giver === state.mole ? 1 : -1)
    expect(gained.get(state.judge)).toBe(2)
  })
})
