import { describe, expect, it } from 'vitest'
import { gameError } from '../../shared/games/types.ts'
import {
  isSeatToken,
  MAX_CHAT_CHARS,
  MAX_CLIENT_MESSAGE_CHARS,
  MAX_NAME_CHARS,
  normalizeName,
  parseClientMessage,
  parseServerMessage,
  PROTOCOL_VERSION,
  roomSocketPath,
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
