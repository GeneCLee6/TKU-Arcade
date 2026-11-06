import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MessageKey } from '../../src/i18n/en.ts'
import { translate } from '../../src/i18n/t.ts'

// A catalog pair with a key zh-TW lacks and keys with placeholders. The compile-time check makes
// this impossible in the real catalogs, so the fallback can only be reached with a mock.
vi.mock('../../src/i18n/en.ts', () => ({
  en: {
    'only.english': 'Only in English',
    'with.name': 'Hello {name}',
    'with.count': '{count} players',
    'with.price': 'Costs {amount}',
  },
}))
vi.mock('../../src/i18n/zh-TW.ts', () => ({
  zhTW: { 'with.name': '哈囉 {name}', 'with.count': '{count} 位玩家' },
}))

const key = (name: string) => name as MessageKey

afterEach(() => {
  vi.restoreAllMocks()
})

describe('translate', () => {
  it('falls back to English and warns when a translation is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(translate('zh-TW', key('only.english'))).toBe('Only in English')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('only.english'))
  })

  it('does not warn when the translation exists', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(translate('zh-TW', key('with.name'), { name: 'Gene' })).toBe('哈囉 Gene')
    expect(warn).not.toHaveBeenCalled()
  })

  it('returns the key itself when no catalog has it', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(translate('en', key('no.such.key'))).toBe('no.such.key')
  })

  it('fills string params as they are, without special replacement patterns', () => {
    expect(translate('en', key('with.name'), { name: '$& <b>' })).toBe('Hello $& <b>')
  })

  it('formats number params with Intl for the language', () => {
    expect(translate('en', key('with.count'), { count: 1234 })).toBe('1,234 players')
    expect(translate('zh-TW', key('with.count'), { count: 1234 })).toBe('1,234 位玩家')
  })

  it('leaves a placeholder visible when its param is missing', () => {
    expect(translate('en', key('with.price'), {})).toBe('Costs {amount}')
  })
})
