import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  chatTime,
  COMPOSITION_GRACE_MS,
  isAtBottom,
  isSendKey,
  isTouchPrimary,
  safeHref,
  splitLinks,
} from '../../src/lib/chatText.ts'

const link = (url: string) => ({ type: 'link', text: url, href: new URL(url).href })
const text = (value: string) => ({ type: 'text', text: value })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('safeHref', () => {
  it('lets http and https through', () => {
    expect(safeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(safeHref('http://example.com')).toBe('http://example.com/')
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:x',
    'file:///etc/passwd',
    'ftp://example.com',
    '//example.com',
    'example.com',
    'not a url',
    '',
  ])('refuses %s', (candidate) => {
    expect(safeHref(candidate)).toBeNull()
  })
})

describe('splitLinks', () => {
  it('leaves text without a link alone, and has nothing for nothing', () => {
    expect(splitLinks('hello there')).toEqual([text('hello there')])
    expect(splitLinks('')).toEqual([])
  })

  it('finds links among the text', () => {
    expect(splitLinks('see https://a.example/x and http://b.example now')).toEqual([
      text('see '),
      link('https://a.example/x'),
      text(' and '),
      link('http://b.example'),
      text(' now'),
    ])
  })

  it.each(['javascript:alert(1)', 'data:text/html,hi', 'vbscript:x', 'www.example.com'])(
    '%s stays text',
    (message) => {
      expect(splitLinks(message)).toEqual([text(message)])
    },
  )

  it('a javascript: wrapper around a URL links only the URL inside it', () => {
    const segments = splitLinks('javascript://https://a.example/x')
    expect(segments).toEqual([text('javascript://'), link('https://a.example/x')])
  })

  it('markup stays text and cuts a link short', () => {
    expect(splitLinks('<img src=x onerror=alert(1)>')).toEqual([
      text('<img src=x onerror=alert(1)>'),
    ])
    expect(splitLinks('<a href="https://a.example">x</a>')).toEqual([
      text('<a href="'),
      link('https://a.example'),
      text('">x</a>'),
    ])
  })

  it('a link with nothing after the scheme stays text', () => {
    expect(splitLinks('https://')).toEqual([text('https://')])
  })

  it('sentence punctuation ends the link', () => {
    expect(splitLinks('go to https://a.example/x.')).toEqual([
      text('go to '),
      link('https://a.example/x'),
      text('.'),
    ])
    expect(splitLinks('(see https://a.example/x)')).toEqual([
      text('(see '),
      link('https://a.example/x'),
      text(')'),
    ])
  })

  it('a bracket opened inside the URL belongs to it', () => {
    const url = 'https://en.wikipedia.org/wiki/Go_(game)'
    expect(splitLinks(url)).toEqual([link(url)])
  })

  it('full-width punctuation ends the link', () => {
    expect(splitLinks('網址是https://a.example/x，快來。')).toEqual([
      text('網址是'),
      link('https://a.example/x'),
      text('，快來。'),
    ])
    expect(splitLinks('「https://a.example/x」')).toEqual([
      text('「'),
      link('https://a.example/x'),
      text('」'),
    ])
  })

  it('keeps every character of the message', () => {
    const message = 'a https://a.example/x, b\nhttp://b.example. c'
    expect(
      splitLinks(message)
        .map((segment) => segment.text)
        .join(''),
    ).toBe(message)
  })
})

describe('isSendKey', () => {
  const ENTER = { key: 'Enter', shiftKey: false }
  const KEYBOARD = { enterSends: true }

  it('Enter sends, other keys do not', () => {
    expect(isSendKey(ENTER)).toBe(true)
    expect(isSendKey({ key: 'a', shiftKey: false })).toBe(false)
  })

  it('Enter with a modifier is not a send: Shift+Enter is a new line', () => {
    expect(isSendKey({ ...ENTER, shiftKey: true })).toBe(false)
    expect(isSendKey({ ...ENTER, altKey: true })).toBe(false)
    expect(isSendKey({ ...ENTER, ctrlKey: true })).toBe(false)
    expect(isSendKey({ ...ENTER, metaKey: true })).toBe(false)
  })

  it('never sends while an input method is composing, however it shows', () => {
    expect(isSendKey({ ...ENTER, isComposing: true })).toBe(false)
    expect(isSendKey({ ...ENTER, keyCode: 229 })).toBe(false)
    expect(isSendKey(ENTER, { ...KEYBOARD, composing: true })).toBe(false)
  })

  it('an Enter right after the composition ended picked the candidate (Safari)', () => {
    const justEnded = { ...KEYBOARD, compositionEndedAt: 1000 }
    expect(isSendKey(ENTER, { ...justEnded, now: 1000 })).toBe(false)
    expect(isSendKey(ENTER, { ...justEnded, now: 1000 + COMPOSITION_GRACE_MS - 1 })).toBe(false)
    expect(isSendKey(ENTER, { ...justEnded, now: 1000 + COMPOSITION_GRACE_MS })).toBe(true)
  })

  it('on a touch screen Enter never sends', () => {
    expect(isSendKey(ENTER, { enterSends: false })).toBe(false)
  })
})

describe('isTouchPrimary', () => {
  it('is false without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(isTouchPrimary()).toBe(false)
  })

  it('follows the media query', () => {
    const matchMedia = vi.fn(() => ({ matches: true }))
    vi.stubGlobal('matchMedia', matchMedia)
    expect(isTouchPrimary()).toBe(true)
    expect(matchMedia).toHaveBeenCalledWith('(hover: none) and (pointer: coarse)')
  })
})

describe('isAtBottom', () => {
  it('counts being near the end as at the bottom', () => {
    expect(isAtBottom({ scrollHeight: 1000, clientHeight: 300, scrollTop: 700 })).toBe(true)
    expect(isAtBottom({ scrollHeight: 1000, clientHeight: 300, scrollTop: 660 })).toBe(true)
  })

  it('counts reading further up as not', () => {
    expect(isAtBottom({ scrollHeight: 1000, clientHeight: 300, scrollTop: 600 })).toBe(false)
  })

  it('a list that does not scroll is at the bottom', () => {
    expect(isAtBottom({ scrollHeight: 300, clientHeight: 300, scrollTop: 0 })).toBe(true)
  })
})

describe('chatTime', () => {
  const AT = new Date(2026, 0, 2, 21, 4).getTime()

  it('reads in the given language', () => {
    expect(chatTime(AT, 'en')).toMatch(/^9:04\sPM$/)
    expect(chatTime(AT, 'zh-TW')).toContain('9:04')
    expect(chatTime(AT, 'zh-TW')).toContain('下午')
  })
})
