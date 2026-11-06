import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { en } from '../../src/i18n/en.ts'
import { LanguageSwitch } from '../../src/i18n/LanguageSwitch.tsx'
import { getLanguage, initLanguage, setLanguage, t } from '../../src/i18n/t.ts'
import { useT } from '../../src/i18n/useT.ts'
import { zhTW } from '../../src/i18n/zh-TW.ts'

const STORAGE_KEY = 'tku-arcade.language'

function browserLanguages(...languages: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages)
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(languages[0] ?? '')
}

beforeEach(() => {
  localStorage.clear()
  browserLanguages('en-US', 'en')
  initLanguage()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('first visit', () => {
  it('defaults to English', () => {
    browserLanguages('fr-FR', 'en')
    initLanguage()
    expect(getLanguage()).toBe('en')
  })

  it.each(['zh-TW', 'zh', 'zh-Hant-TW', 'zh-CN', 'ZH-tw'])('%s selects zh-TW', (language) => {
    browserLanguages(language, 'en')
    initLanguage()
    expect(getLanguage()).toBe('zh-TW')
  })

  it('goes by the top preference: Chinese lower in the list does not count', () => {
    browserLanguages('en-US', 'zh-TW')
    initLanguage()
    expect(getLanguage()).toBe('en')
  })

  it('does not take another language whose code merely starts with zh', () => {
    browserLanguages('zha')
    initLanguage()
    expect(getLanguage()).toBe('en')
  })

  it('falls back to navigator.language when navigator.languages is empty', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue([])
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('zh-TW')
    initLanguage()
    expect(getLanguage()).toBe('zh-TW')
  })

  it('does not store the detected language, so only a user choice sticks', () => {
    browserLanguages('zh-TW')
    initLanguage()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('stored choice', () => {
  it('wins over the browser language, both ways', () => {
    localStorage.setItem(STORAGE_KEY, 'en')
    browserLanguages('zh-TW')
    initLanguage()
    expect(getLanguage()).toBe('en')

    localStorage.setItem(STORAGE_KEY, 'zh-TW')
    browserLanguages('en-US')
    initLanguage()
    expect(getLanguage()).toBe('zh-TW')
  })

  it('setLanguage stores the choice, and it survives the next visit', () => {
    browserLanguages('en-US')
    setLanguage('zh-TW')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('zh-TW')
    initLanguage()
    expect(getLanguage()).toBe('zh-TW')
  })

  it('ignores an invalid stored value and detects instead', () => {
    localStorage.setItem(STORAGE_KEY, 'klingon')
    browserLanguages('zh-TW')
    initLanguage()
    expect(getLanguage()).toBe('zh-TW')
  })
})

describe('when localStorage is unavailable', () => {
  it('detects and switches in memory when reaching it throws', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    browserLanguages('zh-TW')
    expect(() => initLanguage()).not.toThrow()
    expect(getLanguage()).toBe('zh-TW')
    expect(() => setLanguage('en')).not.toThrow()
    expect(getLanguage()).toBe('en')
  })

  it('switches in memory when writing throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(() => setLanguage('zh-TW')).not.toThrow()
    expect(getLanguage()).toBe('zh-TW')
  })

  it('detects when reading throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    browserLanguages('zh-TW')
    expect(() => initLanguage()).not.toThrow()
    expect(getLanguage()).toBe('zh-TW')
  })
})

describe('<html lang>', () => {
  it('follows detection and switching', () => {
    browserLanguages('zh-TW')
    initLanguage()
    expect(document.documentElement.lang).toBe('zh-TW')
    setLanguage('en')
    expect(document.documentElement.lang).toBe('en')
  })
})

describe('t', () => {
  it('reads the current language', () => {
    expect(t('common.close')).toBe('Close')
    setLanguage('zh-TW')
    expect(t('common.close')).toBe('關閉')
  })
})

describe('catalogs', () => {
  it('have exactly the same keys', () => {
    expect(Object.keys(zhTW).sort()).toEqual(Object.keys(en).sort())
  })
})

describe('useT and LanguageSwitch', () => {
  function Sample() {
    const translate = useT()
    return <p>{translate('common.close')}</p>
  }

  it('re-renders with the new language when the switch is pressed', () => {
    render(
      <>
        <LanguageSwitch />
        <Sample />
      </>,
    )
    expect(screen.getByText('Close')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '繁中' }))

    expect(screen.getByText('關閉')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '語言' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '繁中' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'false')
    expect(document.documentElement.lang).toBe('zh-TW')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('zh-TW')
  })

  it('updates when the language changes outside React', () => {
    render(<Sample />)
    act(() => setLanguage('zh-TW'))
    expect(screen.getByText('關閉')).toBeInTheDocument()
  })
})
