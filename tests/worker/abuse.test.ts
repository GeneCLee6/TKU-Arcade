// e12-t06 (AC-12.5): the abuse limits. New rooms and WebSocket upgrades through the shared
// LimiterDO, sockets per address in a room, the nickname check, and the owner key's lockout. The
// per-instance limit and the security headers are security.test.ts; chat's rate, room-host.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptableName, nameIssue, nameProblem } from '../../shared/nickname.ts'
import {
  CloseCode,
  MAX_CONNECTIONS_PER_ADDRESS,
  normalizeName,
  parseClientMessage,
  PROTOCOL_VERSION,
} from '../../shared/protocol.ts'
import {
  ADDRESS_HEADER,
  addressKey,
  addressPrefix,
  isLoopback,
  UNKNOWN_ADDRESS,
} from '../../worker/address.ts'
import type { Env } from '../../worker/app.ts'
import { forgetOwnerLockouts, ownerRefusal, sameKey } from '../../worker/owner.ts'
import { FixedWindowLimit, SHARED_LIMITS, takeShared } from '../../worker/rate-limit.ts'
import { RoomHost } from '../../worker/room-host.ts'
import { handleRooms, handleRoomSocket } from '../../worker/rooms.ts'
import { newRoomId } from '../../shared/room-id.ts'

/**
 * The LIMITER namespace: one stand-in object per shard name, each counting takes per bucket and key
 * against the limit it is given, or against `cap` when that is lower. Records the shards and keys
 */
function fakeLimiter(cap = Number.POSITIVE_INFINITY) {
  const counts = new Map<string, number>()
  const shards: string[] = []
  const take = vi.fn(async (bucket: string, key: string, limit: number) => {
    const count = (counts.get(`${bucket}:${key}`) ?? 0) + 1
    counts.set(`${bucket}:${key}`, count)
    return count <= Math.min(limit, cap)
  })
  return {
    counts,
    shards,
    take,
    idFromName: (name: string) => {
      shards.push(name)
      return name as unknown as DurableObjectId
    },
    get: () => ({ take }),
  }
}

describe('addresses', () => {
  it('count an IPv6 address by its /64 and an IPv4 one whole', () => {
    expect(addressPrefix('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2')
    expect(addressPrefix('2001:DB8:0001:0002:ffff:1:2:3')).toBe('2001:db8:1:2')
    expect(addressPrefix('2001:db8::1')).toBe('2001:db8:0:0')
    expect(addressPrefix('203.0.113.9')).toBe('203.0.113.9')
    expect(addressPrefix('::ffff:203.0.113.9')).toBe('203.0.113.9')
  })

  it('are kept as a short hash, never as they are', async () => {
    const key = await addressKey('203.0.113.9')
    expect(key).toMatch(/^[0-9a-f]{16}$/)
    expect(key).not.toContain('203')
    expect(await addressKey('203.0.113.9')).toBe(key)
    expect(await addressKey('203.0.113.10')).not.toBe(key)
    expect(await addressKey('2001:db8:1:2::5')).toBe(await addressKey('2001:db8:1:2:9::9'))
    expect(await addressKey(null)).toBe(UNKNOWN_ADDRESS)
  })

  it('on loopback are local development', () => {
    expect(isLoopback('127.0.0.1')).toBe(true)
    expect(isLoopback('::1')).toBe(true)
    expect(isLoopback('203.0.113.9')).toBe(false)
  })
})

describe('the shared limiter', () => {
  it('lets everything through without a binding, or when the limiter fails', async () => {
    expect(await takeShared(undefined, 'create', 'k')).toBe(true)
    const broken = {
      idFromName: (name: string) => name as unknown as DurableObjectId,
      get: () => ({ take: async () => Promise.reject(new Error('down')) }),
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await takeShared(broken, 'create', 'k')).toBe(true)
    spy.mockRestore()
  })

  it('asks the shard of the key’s first character, with the bucket’s own limit', async () => {
    const limiter = fakeLimiter()
    await takeShared(limiter, 'socket', 'a1b2')
    expect(limiter.shards).toEqual(['limiter-a'])
    expect(limiter.take).toHaveBeenCalledWith('socket', 'a1b2', 120)
  })
})

describe('new rooms across instances', () => {
  const post = (ip: string) =>
    new Request('https://x/api/rooms', {
      method: 'POST',
      body: '{}',
      headers: { 'cf-connecting-ip': ip },
    })
  const url = new URL('https://x/api/rooms')

  // 2026-11-22: the owner raised 5 to 10 (a campus Wi-Fi shares one address)
  it('are 10 a minute per address through the LimiterDO, keyed by the hash', async () => {
    expect(SHARED_LIMITS.create).toBe(10)
    const limiter = fakeLimiter()
    const env = { LIMITER: limiter } as unknown as Env
    const limit = new FixedWindowLimit(30, 600)
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) {
      statuses.push((await handleRooms(post('198.51.100.7'), env, url, limit, i)).status)
    }
    // An unknown game gets as far as the body: 400; the eleventh not even that
    expect(statuses).toEqual([...Array<number>(10).fill(400), 429])
    expect([...limiter.counts.keys()]).toEqual([`create:${await addressKey('198.51.100.7')}`])
    // Someone else is not held up
    expect((await handleRooms(post('198.51.100.8'), env, url, limit, 7)).status).toBe(400)
  })

  it('are not counted by the binding from loopback (npm run dev, browser tests)', async () => {
    const limiter = fakeLimiter(0)
    const env = { LIMITER: limiter } as unknown as Env
    const limit = new FixedWindowLimit(30, 600)
    expect((await handleRooms(post('127.0.0.1'), env, url, limit, 0)).status).toBe(400)
    expect(limiter.take).not.toHaveBeenCalled()
  })

  // 2026-11-21: the lobby's "Play the computer" is one room, made by one POST, so it counts once
  it('count a room opened with computer players once, against the same 10', async () => {
    const limiter = fakeLimiter()
    const room = { create: vi.fn(async () => true) }
    const lobby = { claimCode: vi.fn(async () => null) }
    const env = {
      LIMITER: limiter,
      ROOM: { idFromName: (name: string) => name, get: () => room },
      LOBBY: { idFromName: (name: string) => name, get: () => lobby },
    } as unknown as Env
    const limit = new FixedWindowLimit(30, 600)
    const quick = (i: number) =>
      new Request('https://x/api/rooms', {
        method: 'POST',
        body: JSON.stringify(
          i % 2 === 0 ? { gameId: 'holdem', bots: { count: 1, level: 'normal' } } : { gameId: 'holdem' },
        ),
        headers: { 'cf-connecting-ip': '198.51.100.9' },
      })
    const statuses: number[] = []
    for (let i = 0; i < 11; i++) statuses.push((await handleRooms(quick(i), env, url, limit, i)).status)
    expect(statuses).toEqual([...Array<number>(10).fill(201), 429])
    expect(room.create).toHaveBeenCalledTimes(10)
  })
})

describe('WebSocket upgrades across instances', () => {
  const ROOM = newRoomId()
  let closed: { code: number; reason: string }[]

  beforeEach(() => {
    closed = []
    // Node has no WebSocketPair: a stand-in that records the close
    vi.stubGlobal(
      'WebSocketPair',
      class {
        0 = {}
        1 = {
          accept: () => {},
          close: (code: number, reason: string) => closed.push({ code, reason }),
        }
      },
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  function setup(limit: number) {
    const fetch = vi.fn(async (request: Request) => {
      void request
      return new Response('upgraded')
    })
    const env = {
      LIMITER: fakeLimiter(limit),
      ROOM: { idFromName: (name: string) => name, get: () => ({ fetch }) },
    } as unknown as Env
    return { env, fetch }
  }
  const upgrade = (headers: Record<string, string> = {}) =>
    new Request(`https://x/ws/${ROOM}?v=${PROTOCOL_VERSION}`, {
      headers: { Upgrade: 'websocket', 'cf-connecting-ip': '198.51.100.7', ...headers },
    })

  it('hand the room the hashed address, never one the browser sent', async () => {
    const { env, fetch } = setup(10)
    await handleRoomSocket(upgrade({ [ADDRESS_HEADER]: 'forged' }), env, new URL(upgrade().url))
    const forwarded = fetch.mock.calls[0][0]
    expect(forwarded.headers.get(ADDRESS_HEADER)).toBe(await addressKey('198.51.100.7'))
  })

  it('past the shared limit are closed with tooManyConnections, without waking the room', async () => {
    const { env, fetch } = setup(1)
    const url = new URL(upgrade().url)
    expect(await (await handleRoomSocket(upgrade(), env, url)).text()).toBe('upgraded')
    // Node's Response refuses status 101; the socket was closed before that, which is what counts
    await handleRoomSocket(upgrade(), env, url).catch(() => null)
    expect(closed).toEqual([{ code: CloseCode.tooManyConnections, reason: 'too many connections' }])
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('sockets per address in a room', () => {
  function host() {
    const room = new RoomHost({
      sockets: { send: () => {}, close: () => {} },
      storage: {
        saveRoom: () => {},
        saveMembers: () => {},
        saveRev: () => {},
        saveGame: () => {},
        saveStep: () => {},
        dropSteps: () => {},
        saveChat: () => {},
        dropChat: () => {},
        clearAll: () => {},
      },
      games: () => null,
      now: () => 0,
      newMemberId: () => 'm',
      newToken: () => 't'.repeat(43),
      newSeed: () => 1,
    })
    // Admitting only needs the room to exist
    ;(room as unknown as { room: object }).room = { id: 'r' }
    return room
  }
  const v = String(PROTOCOL_VERSION)

  it(`are at most ${MAX_CONNECTIONS_PER_ADDRESS}; other addresses and unknown ones still get in`, () => {
    const room = host()
    for (let i = 0; i < MAX_CONNECTIONS_PER_ADDRESS; i++) {
      expect(room.admit(v, 'aaaa')).toEqual({ ok: true })
      room.opened(`c${i}`, 0, null, 'aaaa')
    }
    expect(room.admit(v, 'aaaa')).toEqual({
      ok: false,
      code: CloseCode.tooManyConnections,
      reason: 'too many connections',
    })
    expect(room.admit(v, 'bbbb')).toEqual({ ok: true })
    expect(room.admit(v, null)).toEqual({ ok: true })
    // One closes: a place again
    room.closed('c0')
    expect(room.admit(v, 'aaaa')).toEqual({ ok: true })
  })

  it('are still counted after the room wakes from hibernation', () => {
    const room = host()
    const sockets = Array.from({ length: MAX_CONNECTIONS_PER_ADDRESS }, (_, i) => ({
      conn: `c${i}`,
      openedAt: 0,
      address: 'aaaa',
    }))
    room.restore({ room: { id: 'r' } as never, members: [], rev: 0, game: null, chat: [] }, sockets, null)
    expect(room.admit(v, 'aaaa')).toMatchObject({ ok: false, code: CloseCode.tooManyConnections })
  })
})

describe('nicknames', () => {
  it('lose invisible characters; the full-width space becomes an ordinary one', () => {
    expect(normalizeName('A​l')).toBe('Al')
    expect(normalizeName('﻿Al⁠')).toBe('Al')
    expect(normalizeName('小　明')).toBe('小 明')
    expect(normalizeName('ㅤㅤ')).toBeNull()
    expect(normalizeName('⠀')).toBeNull()
    expect(normalizeName('‍​')).toBeNull()
    // An emoji built with the joiner keeps it
    expect(normalizeName('Al \u{1F469}‍\u{1F4BB}')).toBe('Al \u{1F469}‍\u{1F4BB}')
    expect(normalizeName('Al \u{1F469}\u{1F3FD}‍\u{1F4BB}')).toBe(
      'Al \u{1F469}\u{1F3FD}‍\u{1F4BB}',
    )
    expect(normalizeName('A‍l')).toBe('Al')
  })

  it('may not pass for the site or a role', () => {
    const names = ['Admin', 'ＡＤＭＩＮ', 'admin_01', '[System]', 'HOST', '房主', '系統公告', '管理员']
    for (const name of [...names, '小明管理員']) expect(nameProblem(name), name).toBe('reserved')
  })

  it('may not be plain abuse, in English or Chinese', () => {
    for (const name of ['fuck', 'F.U.C.K', 'big shit', 'Bitch', '幹你娘', '傻逼123']) {
      expect(nameProblem(name), name).toBe('blocked')
    }
  })

  it('leave ordinary names alone', () => {
    for (const name of [
      'Al',
      'Badminton',
      'Ghostface',
      'Scunthorpe',
      'shiitake',
      'Hostess',
      '幹部',
      '能幹的小明',
      '系列',
      '主持人',
      'Moderna',
      'Dick',
      '小明 (2)',
    ]) {
      expect(nameProblem(name), name).toBeNull()
    }
  })

  it('say what is wrong as one types', () => {
    expect(nameIssue('')).toBe('empty')
    expect(nameIssue('​')).toBe('empty')
    expect(nameIssue('a'.repeat(17))).toBe('tooLong')
    expect(nameIssue('Admin')).toBe('reserved')
    expect(nameIssue('Al')).toBeNull()
    expect(acceptableName('Admin')).toBeNull()
    expect(acceptableName(' Al ')).toBe('Al')
  })

  it('are checked by the room on join, whatever the page let through', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'join', name: '系統', token: null }))).toBeNull()
    expect(parseClientMessage(JSON.stringify({ t: 'join', name: 'Al', token: null }))).toMatchObject(
      { t: 'join', name: 'Al' },
    )
  })
})

describe('the owner key', () => {
  const KEY = 'right-key-0123456789'
  const env = { STATS_KEY: KEY } as Env
  const ask = (key: string, ip = '198.51.100.7') =>
    new Request('https://x/api/stats', {
      headers: { authorization: `Bearer ${key}`, 'cf-connecting-ip': ip },
    })

  beforeEach(() => forgetOwnerLockouts())

  it('is compared whatever the length of the guess', () => {
    expect(sameKey('abc', 'abc')).toBe(true)
    expect(sameKey('abd', 'abc')).toBe(false)
    expect(sameKey('ab', 'abc')).toBe(false)
    expect(sameKey('abcd', 'abc')).toBe(false)
    expect(sameKey('', 'abc')).toBe(false)
  })

  it('locks an address out for a minute after 5 wrong keys, even with the right one', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await ownerRefusal(ask('wrong'), env, ['GET'], i))?.status).toBe(403)
    }
    const locked = await ownerRefusal(ask('wrong'), env, ['GET'], 10)
    expect(locked?.status).toBe(429)
    expect(locked?.headers.get('retry-after')).toBe('60')
    expect((await ownerRefusal(ask(KEY), env, ['GET'], 20))?.status).toBe(429)
    // Another address is not
    expect(await ownerRefusal(ask(KEY, '198.51.100.8'), env, ['GET'], 20)).toBeNull()
    // A minute later the right key works again
    expect(await ownerRefusal(ask(KEY), env, ['GET'], 60_011)).toBeNull()
  })

  it('locks out at once when the LimiterDO says so (wrong keys seen by other instances)', async () => {
    const shared = { ...env, LIMITER: fakeLimiter(0) } as unknown as Env
    expect((await ownerRefusal(ask('wrong'), shared, ['GET'], 0))?.status).toBe(429)
    expect((await ownerRefusal(ask(KEY), shared, ['GET'], 1))?.status).toBe(429)
  })

  it('never counts the right key', async () => {
    const limiter = fakeLimiter(0)
    const shared = { ...env, LIMITER: limiter } as unknown as Env
    expect(await ownerRefusal(ask(KEY), shared)).toBeNull()
    expect(limiter.take).not.toHaveBeenCalled()
  })
})
