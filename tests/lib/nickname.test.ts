import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readNickname, writeNickname } from '../../src/lib/nickname.ts'

const KEY = 'tku-arcade.nickname'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('nickname', () => {
  it('has none at first', () => {
    expect(readNickname()).toBeNull()
  })

  it('stores under its key and reads it back', () => {
    writeNickname('小明')
    expect(localStorage.getItem(KEY)).toBe('小明')
    expect(readNickname()).toBe('小明')
  })

  it('does not trust what is stored: too long or blank is no nickname', () => {
    localStorage.setItem(KEY, 'x'.repeat(17))
    expect(readNickname()).toBeNull()
    localStorage.setItem(KEY, '   ')
    expect(readNickname()).toBeNull()
  })

  it('normalizes what it reads', () => {
    localStorage.setItem(KEY, '  Al   Lee ')
    expect(readNickname()).toBe('Al Lee')
  })

  it('keeps the name for this page when storage refuses it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    writeNickname('Al')
    expect(readNickname()).toBe('Al')

    vi.restoreAllMocks()
    writeNickname('Bo')
    expect(localStorage.getItem(KEY)).toBe('Bo')
    localStorage.clear()
    expect(readNickname()).toBeNull()
  })
})
