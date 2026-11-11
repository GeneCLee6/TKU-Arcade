import { afterEach, describe, expect, it } from 'vitest'
import { font } from '../../src/styles/tokens.ts'
import { loadShellFonts } from '../../src/styles/webFonts.ts'

afterEach(() => {
  document.getElementById('shell-fonts')?.remove()
})

describe('the shell fonts', () => {
  it('are asked for once per page, from Google Fonts, only the weights the shell draws', () => {
    loadShellFonts()
    loadShellFonts()
    const links = document.head.querySelectorAll('link#shell-fonts[rel="stylesheet"]')
    expect(links).toHaveLength(1)
    const href = new URL((links[0] as HTMLLinkElement).href)
    expect(href.origin).toBe('https://fonts.googleapis.com')
    expect(href.searchParams.getAll('family')).toEqual([
      'JetBrains Mono:wght@500;700',
      'Noto Sans TC:wght@900',
      'Saira:ital,wght@1,800;1,900',
    ])
    // The fallback shows at once, and the face swaps in when it is there
    expect(href.searchParams.get('display')).toBe('swap')
  })

  it('leave body text alone: only 900 of Noto Sans TC loads, so it is not in the body stacks', () => {
    expect(font.sans).not.toContain('Noto Sans TC')
    expect(font.mono).not.toContain('Noto Sans TC')
    expect(font.displayZh).toMatch(/^'Noto Sans TC'/)
  })
})
