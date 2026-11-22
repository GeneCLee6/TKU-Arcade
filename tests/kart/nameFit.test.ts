import { describe, expect, it } from 'vitest'
import { nameFit } from '../../src/kart/lobby/nameFit.ts'

// 2026-11-23 (#151): a long name on a race room card is shrunk to fit (then takes two lines)
describe('a name fitted to its card', () => {
  it('short names as they are; long ones smaller, never below two thirds', () => {
    expect(nameFit('Ann')).toBe(1)
    expect(nameFit('Pepper (CPU)')).toBe(1)
    expect(nameFit('Scooter (CPU)')).toBeLessThan(1)
    expect(nameFit('A really very long racing name')).toBe(0.66)
  })

  it('counts a CJK character nearly two letters wide', () => {
    expect(nameFit('小明（電腦）')).toBe(1)
    expect(nameFit('淡江橋藝社社長（電腦）')).toBeLessThan(nameFit('Tamkang bridge'))
  })
})
