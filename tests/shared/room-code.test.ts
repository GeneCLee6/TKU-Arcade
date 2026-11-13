import { describe, expect, it } from 'vitest'
import { isRoomCode, newRoomCode, parseRoomCode } from '../../shared/room-code.ts'

describe('room numbers', () => {
  it('are four digits from 1000 to 9999', () => {
    for (const code of ['1000', '4827', '9999']) expect(isRoomCode(code)).toBe(true)
    for (const code of ['0999', '999', '10000', '48a7', ' 4827', 4827]) expect(isRoomCode(code)).toBe(false)
  })

  it('are drawn evenly over the whole range, from the random bytes given', () => {
    const at = (high: number, low: number) =>
      newRoomCode((bytes) => {
        bytes[0] = high
        bytes[1] = low
      })
    expect(at(0, 0)).toBe('1000')
    expect(at(35, 39)).toBe('9999') // 35 × 256 + 39 = 8999
    expect(at(35, 40)).toBe('1000') // 9000 wraps round
    for (let i = 0; i < 200; i++) expect(isRoomCode(newRoomCode())).toBe(true)
  })

  it('redraws above the last whole range, so that no number is likelier', () => {
    const draws = [
      [255, 255], // 65535: past 63000, thrown away
      [0, 7],
    ]
    const code = newRoomCode((bytes) => {
      const [high, low] = draws.shift() ?? [0, 0]
      bytes[0] = high
      bytes[1] = low
    })
    expect(code).toBe('1007')
  })

  it('are read from what someone typed, spaces and dashes aside', () => {
    expect(parseRoomCode('4827')).toBe('4827')
    expect(parseRoomCode(' 48 27 ')).toBe('4827')
    expect(parseRoomCode('48-27')).toBe('4827')
    expect(parseRoomCode('0827')).toBeNull()
    expect(parseRoomCode('https://x/r/4827')).toBeNull()
  })
})
