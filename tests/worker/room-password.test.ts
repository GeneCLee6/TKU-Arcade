// A room's password as the room keeps it (2026-11-23, worker/room-password.ts): a salted PBKDF2
// hash, checked in constant time
import { describe, expect, it } from 'vitest'
import {
  PASSWORD_ITERATIONS,
  hashRoomPassword,
  sameBytes,
  sameLegacyPassword,
  verifyRoomPassword,
} from '../../worker/room-password.ts'

describe('a room password hash', () => {
  it('takes the right password and refuses any other', async () => {
    const stored = await hashRoomPassword('tamsui')
    expect(stored.iterations).toBe(PASSWORD_ITERATIONS)
    expect(stored.salt).toMatch(/^[0-9a-f]{32}$/)
    expect(stored.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(stored)).not.toContain('tamsui')
    expect(await verifyRoomPassword('tamsui', stored)).toBe(true)
    for (const wrong of ['Tamsui', 'tamsu', 'tamsui ', 'tamsuii', '', '淡水']) {
      expect(await verifyRoomPassword(wrong, stored), wrong).toBe(false)
    }
  })

  it('salts each one: the same password never hashes the same twice', async () => {
    const [a, b] = await Promise.all([hashRoomPassword('tamsui'), hashRoomPassword('tamsui')])
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
    expect(await verifyRoomPassword('tamsui', b)).toBe(true)
  })

  it('checks a hash with the count it was made with', async () => {
    const older = await hashRoomPassword('kite', 1_000)
    expect(older.iterations).toBe(1_000)
    expect(await verifyRoomPassword('kite', older)).toBe(true)
    expect(await verifyRoomPassword('kite', { ...older, iterations: 2_000 })).toBe(false)
  })

  it('compares in constant time: every byte is looked at, wherever the first difference is', () => {
    const expected = new Uint8Array(32).fill(7)
    expect(sameBytes(new Uint8Array(32).fill(7), expected)).toBe(true)
    // The loop has no early exit, so the only way to show it is that any one byte decides
    for (const at of [0, 15, 31]) {
      const given = new Uint8Array(32).fill(7)
      given[at] = 8
      expect(sameBytes(given, expected)).toBe(false)
    }
    expect(sameBytes(new Uint8Array(31).fill(7), expected)).toBe(false)
    expect(sameBytes(new Uint8Array(33).fill(7), expected)).toBe(false)
  })

  it('takes as long for a near miss as for a far one', async () => {
    const stored = await hashRoomPassword('tamsui-door')
    const time = async (guess: string) => {
      const started = performance.now()
      for (let i = 0; i < 4; i++) await verifyRoomPassword(guess, stored)
      return performance.now() - started
    }
    await time('warm-up')
    const near = await time('tamsui-doos')
    const far = await time('x')
    // Both are four full derivations; only noise tells them apart, never the shared prefix
    expect(Math.max(near, far) / Math.min(near, far)).toBeLessThan(3)
  })

  it('still compares a password stored as typed (before 2026-11-23), through a digest', async () => {
    expect(await sameLegacyPassword('tamsui', 'tamsui')).toBe(true)
    expect(await sameLegacyPassword('tamsu', 'tamsui')).toBe(false)
    expect(await sameLegacyPassword('', 'tamsui')).toBe(false)
  })
})
