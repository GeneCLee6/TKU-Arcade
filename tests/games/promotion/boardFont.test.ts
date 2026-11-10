import { describe, expect, it } from 'vitest'
import { BOARD } from '../../../shared/games/promotion/board.ts'
import { promotionScreenMessages } from '../../../shared/games/promotion/i18n.screen.ts'
import { boardCharacters, loadBoardFont } from '../../../src/games/promotion/boardFont.ts'

describe('the board font', () => {
  it('asks for every character the board writes in it, each once, always in one order', () => {
    const chars = boardCharacters()
    const wanted = [
      ...BOARD.map((cell) => cell.name['zh-TW']),
      ...Object.values(promotionScreenMessages['zh-TW']),
      'Ronggui Waiwei Qianzong',
    ].join('')
    for (const char of wanted) expect(chars, char).toContain(char)
    expect(new Set(chars).size).toBe([...chars].length)
    expect(boardCharacters()).toBe(chars)
  })

  it('is asked for once per page, from Google Fonts, with only those characters', () => {
    loadBoardFont()
    loadBoardFont()
    const links = document.head.querySelectorAll('link[rel="stylesheet"]')
    expect(links).toHaveLength(1)
    const href = new URL((links[0] as HTMLLinkElement).href)
    expect(href.origin).toBe('https://fonts.googleapis.com')
    expect(href.searchParams.get('family')).toBe('LXGW WenKai TC:wght@700')
    expect(href.searchParams.get('text')).toBe(boardCharacters())
  })
})
