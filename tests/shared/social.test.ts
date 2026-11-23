// 2026-11-23 (shared/social.ts): what a player card may be, and the social messages on the wire
import { describe, expect, it } from 'vitest'
import { parseClientMessage, parseServerMessage, REACTION_COUNT } from '../../shared/protocol.ts'
import {
  EMOTE_COUNT,
  isPhrase,
  MAX_LAP_MS,
  parseProfileSummary,
  PHRASE_COUNT,
  PROFILE_MAX_CHARS,
} from '../../shared/social.ts'

const card = {
  title: 'kart-first-finish',
  unlocked: 3,
  total: 90,
  games: 12,
  boardWins: 4,
  kartWins: 2,
  kart: 'heron',
  driver: 'club',
  lap: { track: 'riverside', ms: 61_234 },
}

describe('a player card', () => {
  it('is taken with exactly its fields, the optional ones left out', () => {
    expect(parseProfileSummary(card)).toEqual(card)
    const bare = { unlocked: 0, total: 90, games: 0, boardWins: 0, kartWins: 0 }
    expect(parseProfileSummary(bare)).toEqual(bare)
  })

  it('refuses anything else: unknown fields, wrong types, numbers out of range, words for ids', () => {
    const bad: unknown[] = [
      null,
      [],
      'card',
      { ...card, extra: 1 },
      { ...card, total: 0, unlocked: 0 },
      { ...card, unlocked: 91 },
      { ...card, total: 1000 },
      { ...card, games: 1.5 },
      { ...card, kartWins: -1 },
      { ...card, boardWins: 2_000_000 },
      { ...card, games: '12' },
      { ...card, title: 'Champion of all' },
      { ...card, title: '<script>' },
      { ...card, kart: 'Heron' },
      { ...card, driver: '' },
      { ...card, lap: null },
      { ...card, lap: { track: 'riverside' } },
      { ...card, lap: { track: 'riverside', ms: MAX_LAP_MS + 1 } },
      { ...card, lap: { track: 'riverside', ms: 61_000, by: 'me' } },
    ]
    for (const value of bad) expect(parseProfileSummary(value), JSON.stringify(value)).toBeNull()
  })

  it('stays under PROFILE_MAX_CHARS', () => {
    const long = 'a'.repeat(48)
    const big = { ...card, title: long, kart: long, driver: long, lap: { track: long, ms: 61_000 } }
    const parsed = parseProfileSummary(big)
    if (parsed) expect(JSON.stringify(parsed).length).toBeLessThanOrEqual(PROFILE_MAX_CHARS)
    expect(JSON.stringify(parseProfileSummary(card)).length).toBeLessThanOrEqual(PROFILE_MAX_CHARS)
  })
})

describe('the social messages', () => {
  it('number the emotes, then the phrases', () => {
    expect(REACTION_COUNT).toBe(EMOTE_COUNT + PHRASE_COUNT)
    expect(EMOTE_COUNT).toBeGreaterThanOrEqual(8)
    expect(EMOTE_COUNT).toBeLessThanOrEqual(12)
    expect(PHRASE_COUNT).toBeGreaterThanOrEqual(6)
    expect(PHRASE_COUNT).toBeLessThanOrEqual(10)
    expect(isPhrase(EMOTE_COUNT - 1)).toBe(false)
    expect(isPhrase(EMOTE_COUNT)).toBe(true)
  })

  it('take a reaction only from the list, and a card or null', () => {
    const client = (value: unknown) => parseClientMessage(JSON.stringify(value))
    expect(client({ t: 'react', reaction: REACTION_COUNT - 1 })).toEqual({ t: 'react', reaction: REACTION_COUNT - 1 })
    expect(client({ t: 'react', reaction: REACTION_COUNT })).toBeNull()
    expect(client({ t: 'react', reaction: 'gg' })).toBeNull()
    expect(client({ t: 'profile_summary', profile: card })).toEqual({ t: 'profile_summary', profile: card })
    expect(client({ t: 'profile_summary', profile: null })).toEqual({ t: 'profile_summary', profile: null })
    expect(client({ t: 'profile_summary' })).toBeNull()
    expect(client({ t: 'profile_summary', profile: { ...card, games: -1 } })).toBeNull()
    const server = (value: unknown) => parseServerMessage(JSON.stringify(value))
    expect(server({ t: 'reaction', member: 'm', reaction: EMOTE_COUNT })).not.toBeNull()
    expect(server({ t: 'reaction', member: 'm', reaction: REACTION_COUNT })).toBeNull()
  })
})
