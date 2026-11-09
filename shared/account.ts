// The optional club account (e1-t11 – e1-t13, ARCHITECTURE.md §6): someone signs in on the bridge
// table (Overtrick), which sends them back with a short-lived signed token; worker/auth.ts checks it
// and starts this site's own session. Shared by the Worker and the browser.
import { MAX_NAME_CHARS, normalizeName } from './protocol.ts'

/** Someone signed in: their account id on the bridge table, and the name the rooms show */
export type Account = { id: string; name: string }

/** GET /api/me. `configured` is false until the owner sets the shared secret: then nobody sees a button */
export type MeResponse = { configured: boolean; account: Account | null }

/** Where the sign-in link goes: the Worker sends the browser on to the bridge table from there */
export const AUTH_START_PATH = '/api/auth/start'
/** Where the page hands over the token it found in its address (POST, JSON `{ token }`) */
export const AUTH_CALLBACK_PATH = '/api/auth/callback'
/** POST: forgets the session */
export const AUTH_SIGN_OUT_PATH = '/api/auth/signout'
export const ME_PATH = '/api/me'
/** The fragment's key the bridge table sends the token back under */
export const TOKEN_FRAGMENT_KEY = 'overtrick_token'

/** Longer than any address of this site; the bridge table takes a return_to of 200 characters */
const MAX_RETURN_CHARS = 160

/**
 * A path of this site to come back to after signing in: starts with one `/`, no backslash, no
 * fragment; anything else is the lobby. Never another site
 */
export function safeReturnPath(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > MAX_RETURN_CHARS) return '/'
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\\#\s]/.test(raw)) return '/'
  return raw
}

/**
 * An account's name as a room shows it: the bridge table's display name, cleaned like any nickname
 * (normalizeName), cut to MAX_NAME_CHARS when it is longer. Null when nothing is left
 */
export function accountName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = normalizeName(raw)
  if (name !== null) return name
  const cleaned = normalizeName(
    [...raw.replace(/\s+/g, ' ').trim()].slice(0, MAX_NAME_CHARS).join(''),
  )
  return cleaned
}

/** An account as the Worker hands it to a room, or null when it is not one */
export function parseAccount(value: unknown): Account | null {
  if (typeof value !== 'object' || value === null) return null
  const { id, name } = value as { id?: unknown; name?: unknown }
  if (typeof id !== 'string' || id.length === 0 || id.length > 128) return null
  const clean = accountName(name)
  return clean === null ? null : { id, name: clean }
}
