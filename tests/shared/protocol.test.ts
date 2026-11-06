import { describe, expect, it } from 'vitest'
import { MAX_CHAT_CHARS, normalizeChatText } from '../../shared/chat.ts'
import { gameError } from '../../shared/games/types.ts'
import {
  isSeatToken,
  MAX_CLIENT_MESSAGE_CHARS,
  MAX_NAME_CHARS,
  normalizeName,
  parseClientMessage,
  parseServerMessage,
  PROTOCOL_VERSION,
  roomSocketPath,
  uniqueName,
  type RoomView,
  type ServerMessage,
} from '../../shared/protocol.ts'

const token = 'a'.repeat(43)

describe('parseClientMessage', () => {
  it('accepts what a browser sends', () => {
    const cases = [
      { t: 'join', name: 'Gene', token },
      { t: 'join', name: 'Gene', token: null },
      { t: 'resync' },
      { t: 'action', action: { type: 'place', cell: 4 } },
      { t: 'action', action: null },
      { t: 'chat', text: 'hi' },
      { t: 'sit', seat: 3 },
      { t: 'sit', seat: null },
      { t: 'ready', ready: true },
      { t: 'ready', ready: false },
      { t: 'start' },
      { t: 'reopen' },
    ]
    for (const message of cases) {
      expect(parseClientMessage(JSON.stringify(message))).toEqual(message)
    }
  })

  it('refuses what is not a message of this version', () => {
    const cases = [
      'not json',
      '[]',
      'null',
      '{}',
      JSON.stringify({ t: 'nope' }),
      JSON.stringify({ t: 'action' }),
      JSON.stringify({ t: 'join', token }),
      JSON.stringify({ t: 'join', name: '   ', token }),
      JSON.stringify({ t: 'join', name: 'x'.repeat(MAX_NAME_CHARS + 1), token }),
      JSON.stringify({ t: 'chat', text: '   ' }),
      JSON.stringify({ t: 'chat', text: 'x'.repeat(MAX_CHAT_CHARS + 1) }),
      JSON.stringify({ t: 'chat', text: 1 }),
      JSON.stringify({ t: 'sit' }),
      JSON.stringify({ t: 'sit', seat: -1 }),
      JSON.stringify({ t: 'sit', seat: 1.5 }),
      JSON.stringify({ t: 'sit', seat: '1' }),
      JSON.stringify({ t: 'ready' }),
      JSON.stringify({ t: 'ready', ready: 'yes' }),
    ]
    for (const raw of cases) expect(parseClientMessage(raw), raw).toBeNull()
  })

  it('refuses a message that is too long without parsing it', () => {
    const raw = JSON.stringify({ t: 'chat', text: 'x'.repeat(MAX_CLIENT_MESSAGE_CHARS) })
    expect(parseClientMessage(raw)).toBeNull()
  })

  it('a malformed token is someone new, and the name is normalized', () => {
    const raw = JSON.stringify({ t: 'join', name: ' Ge\u0000ne ', token: 'x' })
    expect(parseClientMessage(raw)).toEqual({ t: 'join', name: 'Gene', token: null })
  })

  it('drops anything extra a browser adds: it cannot claim a seat', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'action', action: 1, seat: 3 }))).toEqual({
      t: 'action',
      action: 1,
    })
  })
})

describe('normalizeName', () => {
  it('cleans a name, or refuses it', () => {
    expect(normalizeName('  a   b ')).toBe('a b')
    expect(normalizeName('a‮b')).toBe('ab')
    expect(normalizeName('淡'.repeat(MAX_NAME_CHARS))).toHaveLength(MAX_NAME_CHARS)
    expect(normalizeName('😀'.repeat(MAX_NAME_CHARS))).not.toBeNull()
    expect(normalizeName('淡'.repeat(MAX_NAME_CHARS + 1))).toBeNull()
    expect(normalizeName('')).toBeNull()
    expect(normalizeName(1)).toBeNull()
  })

  it('refuses a name with nothing visible in it', () => {
    expect(normalizeName('​')).toBeNull()
    expect(normalizeName(' ​ ﻿ ')).toBeNull()
    expect(normalizeName('a​b')).toBe('a​b')
  })

  it('stores names in NFC, and measures them after that', () => {
    expect(normalizeName('é')).toBe('é')
    // Composes only once the control character between the two is gone
    expect(normalizeName('e\u0000́')).toBe('é')
    expect(normalizeName('é'.repeat(MAX_NAME_CHARS))).toBe('é'.repeat(MAX_NAME_CHARS))
  })
})

describe('uniqueName', () => {
  const codePoints = (name: string) => [...name].length

  it('leaves a name nobody has alone', () => {
    expect(uniqueName('Al', [])).toBe('Al')
    expect(uniqueName('Al', ['Bo', 'Alan'])).toBe('Al')
  })

  it('takes the first free suffix', () => {
    expect(uniqueName('Al', ['Al'])).toBe('Al (2)')
    expect(uniqueName('Al', ['Al', 'Al (2)'])).toBe('Al (3)')
    expect(uniqueName('Al', ['Al', 'Al (3)'])).toBe('Al (2)')
  })

  it('accepts any iterable', () => {
    expect(uniqueName('Al', new Set(['Al']))).toBe('Al (2)')
  })

  it('counts names that only look different as the same, keeping the newcomer’s spelling', () => {
    expect(uniqueName('AL', ['al'])).toBe('AL (2)')
    expect(uniqueName('Ａｌ', ['Al'])).toBe('Ａｌ (2)')
    expect(uniqueName('A​l', ['Al'])).toBe('A​l (2)')
    expect(uniqueName('Al', ['﻿A­l‍'])).toBe('Al (2)')
    expect(uniqueName('STRASSE', ['straße'])).toBe('STRASSE (2)')
  })

  it('sees through a format character that keeps two others from composing', () => {
    expect(uniqueName('e‍́', ['é'])).toBe('e‍́ (2)')
  })

  it('sees through a format character that only hides extra whitespace', () => {
    expect(uniqueName('a ​ b', ['a b'])).toBe('a ​ b (2)')
    expect(uniqueName('​ Al', ['Al'])).toBe('​ Al (2)')
  })

  it('counts the suffix as part of the name', () => {
    // Somebody really is called that
    expect(uniqueName('Al', ['Al (2)'])).toBe('Al')
    expect(uniqueName('Al (2)', ['Al (2)'])).toBe('Al (2) (2)')
    expect(uniqueName('Al', ['Al', 'AL （2）'])).toBe('Al (3)')
  })

  it('shortens the base to fit a 16-character name', () => {
    const full = 'abcdefghijklmnop'
    expect(codePoints(full)).toBe(MAX_NAME_CHARS)
    expect(uniqueName(full, [])).toBe(full)
    expect(uniqueName(full, [full])).toBe('abcdefghijkl (2)')
    expect(uniqueName(full, [full, 'abcdefghijkl (2)'])).toBe('abcdefghijkl (3)')
  })

  it('shortens further when the suffix grows', () => {
    const full = 'abcdefghijklmnop'
    const taken = [full]
    for (let n = 2; n <= 9; n++) taken.push(`abcdefghijkl (${n})`)
    const name = uniqueName(full, taken)
    expect(name).toBe('abcdefghijk (10)')
    expect(codePoints(name)).toBe(MAX_NAME_CHARS)
  })

  it('leaves no whitespace at the cut', () => {
    const full = 'abcdefghijk mnop'
    expect(uniqueName(full, [full])).toBe('abcdefghijk (2)')
  })

  it('never splits an emoji', () => {
    // The cut falls right after the emoji, then right before it
    const kept = `${'a'.repeat(11)}😀bbbb`
    expect(uniqueName(kept, [kept])).toBe(`${'a'.repeat(11)}😀 (2)`)
    const dropped = `${'a'.repeat(12)}😀bbb`
    expect(uniqueName(dropped, [dropped])).toBe(`${'a'.repeat(12)} (2)`)

    const emoji = '😀'.repeat(MAX_NAME_CHARS)
    const name = uniqueName(emoji, [emoji])
    expect(name).toBe(`${'😀'.repeat(12)} (2)`)
    expect(codePoints(name)).toBe(MAX_NAME_CHARS)
  })

  it('gives back something normalizeName keeps as it is', () => {
    const full = 'abcdefghijk mnop'
    const name = uniqueName(full, [full])
    expect(normalizeName(name)).toBe(name)
  })
})

describe('isSeatToken', () => {
  it('knows a token', () => {
    expect(isSeatToken(token)).toBe(true)
    expect(isSeatToken('short')).toBe(false)
    expect(isSeatToken(null)).toBe(false)
  })
})

describe('parseServerMessage', () => {
  const state: RoomView = {
    room: {
      id: 'r',
      gameId: 'tictactoe',
      status: 'waiting',
      options: {},
      minPlayers: 2,
      maxSeats: 2,
    },
    members: {},
    game: null,
    coverable: [],
  }

  it('accepts what the server sends', () => {
    const cases: ServerMessage[] = [
      { t: 'welcome', v: PROTOCOL_VERSION, you: 'm', token, rev: 0, state },
      { t: 'snapshot', rev: 1, state },
      {
        t: 'snapshot',
        rev: 2,
        state: {
          ...state,
          game: { view: { board: [] }, legal: [], over: false, result: null, chatLocked: false },
        },
      },
      { t: 'patch', rev: 2, ops: [{ op: 'set', path: ['game'], value: null }] },
      { t: 'error', code: 'not_seated' },
      { t: 'error', code: 'game_error', error: gameError('games.tictactoe.error.occupied') },
      { t: 'timer', timers: [{ id: 'clue-1', remainingMs: 500, totalMs: 1000 }] },
      { t: 'timer', timers: [] },
      { t: 'chat', messages: [], reset: true },
    ]
    for (const message of cases) {
      expect(parseServerMessage(JSON.stringify(message))).toEqual(message)
    }
  })

  it('refuses another version and broken shapes', () => {
    const cases = [
      'not json',
      JSON.stringify({ t: 'welcome', v: PROTOCOL_VERSION + 1, you: 'm', token, rev: 0, state }),
      JSON.stringify({ t: 'snapshot', rev: -1, state }),
      JSON.stringify({ t: 'snapshot', rev: 1, state: {} }),
      JSON.stringify({ t: 'patch', rev: 1 }),
      JSON.stringify({ t: 'error' }),
      JSON.stringify({ t: 'timer' }),
      JSON.stringify({ t: 'chat' }),
      JSON.stringify({ t: 'nope' }),
    ]
    for (const raw of cases) expect(parseServerMessage(raw), raw).toBeNull()
  })
})

describe('roomSocketPath', () => {
  it('carries the version in the query string', () => {
    expect(roomSocketPath('abc')).toBe(`/ws/abc?v=${PROTOCOL_VERSION}`)
  })
})

describe('host control messages', () => {
  const parse = (message: unknown) => parseClientMessage(JSON.stringify(message))

  it('parse', () => {
    expect(parse({ t: 'rematch' })).toEqual({ t: 'rematch' })
    expect(parse({ t: 'dissolve', extra: 1 })).toEqual({ t: 'dissolve' })
    expect(parse({ t: 'kick', member: 'm', extra: 1 })).toEqual({ t: 'kick', member: 'm' })
    expect(parse({ t: 'transfer', member: 'm' })).toEqual({ t: 'transfer', member: 'm' })
    expect(parse({ t: 'set_game', gameId: 'g' })).toEqual({ t: 'set_game', gameId: 'g' })
    expect(parse({ t: 'set_game', gameId: 'g', options: { a: 1 } })).toEqual({
      t: 'set_game',
      gameId: 'g',
      options: { a: 1 },
    })
    expect(parse({ t: 'set_options', options: {} })).toEqual({ t: 'set_options', options: {} })
  })

  it('do not parse with the wrong shape', () => {
    for (const bad of [
      { t: 'kick' },
      { t: 'kick', member: '' },
      { t: 'kick', member: 1 },
      { t: 'transfer', member: null },
      { t: 'set_game' },
      { t: 'set_game', gameId: 1 },
      { t: 'set_game', gameId: 'g', options: [] },
      { t: 'set_game', gameId: 'g', options: null },
      { t: 'set_options' },
      { t: 'set_options', options: [] },
      { t: 'set_options', options: 'x' },
    ]) {
      expect(parse(bad), JSON.stringify(bad)).toBeNull()
    }
  })
})

describe('chat text', () => {
  it('is not a message when only zero-width characters are left', () => {
    expect(normalizeChatText('​‍ ﻿')).toBeNull()
    expect(normalizeChatText('a‍b')).toBe('a‍b')
  })
})
