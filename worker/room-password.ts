// A room's password (e1-t16), kept only as a salted hash (2026-11-23, docs/SECURITY.md §11). It is a
// door code for friends, not anyone's own password, but people reuse what they type: the room keeps
// PBKDF2-SHA256 of it with a salt of its own, never the text, so storage, a backup or a debug dump
// has nothing to read back. Web Crypto only (`crypto.subtle`), which Workers and Node both have.

/** What a room stores in place of its password. Hex, so that it survives JSON and structured clone */
export type PasswordHash = {
  /** 16 random bytes, new for each password set */
  salt: string
  /** 32 bytes of PBKDF2-SHA256 */
  hash: string
  /** Stored with it, so that the count can be raised later without locking old rooms */
  iterations: number
}

/**
 * PBKDF2 rounds. 20,000 is ~3.4 ms of CPU on one core (measured, Node's BoringSSL/OpenSSL, the same
 * native code Workers run): a join or `set_password` stays well inside the free plan's 10 ms of CPU
 * per event with the rest of the message, while an offline guess at a leaked hash costs 20,000 HMACs.
 * Online guessing is what the rate limits stop (PASSWORD_TRIES per socket, PASSWORD_FAILS per address
 * per room, worker/room-host.ts); this only makes a copy of storage useless. Raising it later is safe:
 * each hash keeps its own count
 */
export const PASSWORD_ITERATIONS = 20_000

const SALT_BYTES = 16
const HASH_BITS = 256

function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(Math.floor(hex.length / 2))
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16) || 0
  return bytes
}

async function derive(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    HASH_BITS,
  )
  return new Uint8Array(bits)
}

/** A new hash of `password` (already normalizePassword'd), with a new salt */
export async function hashRoomPassword(
  password: string,
  iterations: number = PASSWORD_ITERATIONS,
): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  return { salt: toHex(salt), hash: toHex(await derive(password, salt, iterations)), iterations }
}

/**
 * The same time whatever the bytes are, for two arrays of the expected length: which bytes differ
 * never shows in the time taken (the owner key's `sameKey`, worker/owner.ts, on bytes)
 */
export function sameBytes(given: Uint8Array, expected: Uint8Array): boolean {
  let diff = given.length ^ expected.length
  for (let i = 0; i < expected.length; i++) diff |= (given[i] ?? 0) ^ expected[i]!
  return diff === 0
}

/**
 * Whether `password` is the one `stored` was made from. Always one full derivation and a comparison
 * of all 32 bytes, so a wrong guess takes as long as a right one, whatever it shares with it
 */
export async function verifyRoomPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const iterations =
    Number.isInteger(stored.iterations) && stored.iterations > 0
      ? stored.iterations
      : PASSWORD_ITERATIONS
  const derived = await derive(password, fromHex(stored.salt), iterations)
  return sameBytes(derived, fromHex(stored.hash))
}

/**
 * A room from before 2026-11-23 kept its password as typed: compared through SHA-256, so that both
 * sides are 32 bytes and the comparison takes the same time whatever was guessed. Only until the
 * room next loads, when RoomDO hashes it (`RoomHost.migratePassword`)
 */
export async function sameLegacyPassword(given: string, stored: string): Promise<boolean> {
  const digest = async (text: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  const [a, b] = await Promise.all([digest(given), digest(stored)])
  return sameBytes(a, b)
}
