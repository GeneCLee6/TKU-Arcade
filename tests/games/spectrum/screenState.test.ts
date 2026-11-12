import { describe, expect, it } from 'vitest'
import { answerProblem, normaliseAnswer } from '../../../shared/games/spectrum/answer.ts'
import { leaning, pick } from '../../../src/games/spectrum/screenState.ts'

describe('the guesser picking', () => {
  const none = { max: null, min: null }

  it('picks, and a second press takes it back', () => {
    expect(pick(none, 'max', 2)).toEqual({ max: 2, min: null })
    expect(pick({ max: 2, min: null }, 'max', 2)).toEqual(none)
  })

  it('never has one answer at both ends', () => {
    expect(pick({ max: 2, min: 3 }, 'min', 2)).toEqual({ max: null, min: 2 })
    expect(pick({ max: 2, min: 3 }, 'max', 3)).toEqual({ max: 3, min: null })
  })
})

describe('the hint under a secret number', () => {
  it.each([
    [1, 'low'],
    [4, 'low'],
    [5, 'middle'],
    [6, 'middle'],
    [7, 'high'],
    [10, 'high'],
  ] as const)('%i leans %s', (number, side) => {
    expect(leaning(number)).toBe(side)
  })
})

describe('the warning while typing', () => {
  it('is the very check the rules make', () => {
    expect(answerProblem(normaliseAnswer('  '))).toBe('games.spectrum.error.empty')
    expect(answerProblem(normaliseAnswer('７ cats'))).toBe('games.spectrum.error.digits')
    expect(answerProblem(normaliseAnswer('滷'.repeat(31)))).toBe('games.spectrum.error.tooLong')
    expect(answerProblem(normaliseAnswer('十分普通'))).toBeNull()
  })
})
