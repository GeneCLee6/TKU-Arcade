import { useEffect, useSyncExternalStore } from 'react'
import {
  parseAccount,
  AUTH_CALLBACK_PATH,
  AUTH_SIGN_OUT_PATH,
  AUTH_START_PATH,
  ME_PATH,
  TOKEN_FRAGMENT_KEY,
  type MeResponse,
} from '../../shared/account.ts'

// The optional club account in the browser (e1-t13). One request at start-up says whether sign-in
// is configured and who is signed in; nothing shows until it answers, and nothing at all while the
// Worker says `configured: false`.

/** What the page knows: null until /api/me answers. `failed`: coming back from the bridge table did not sign in */
export type AccountState = MeResponse & { failed?: boolean }

const SIGNED_OUT: AccountState = { configured: false, account: null }

let current: AccountState | null = null
const listeners = new Set<() => void>()

function set(next: AccountState): void {
  current = next
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** What the page knows of the account; asks the Worker the first time anything wants to know */
export function useAccount(): AccountState | null {
  useEffect(() => void startAccount(), [])
  return useSyncExternalStore(subscribe, () => current)
}

/** Only what the Worker would say: anything else is nobody signed in */
function asMe(value: unknown): MeResponse {
  const { configured, account } = (
    typeof value === 'object' && value !== null ? value : {}
  ) as Partial<MeResponse>
  return {
    configured: configured === true,
    account: configured === true ? parseAccount(account) : null,
  }
}

async function fetchMe(): Promise<AccountState> {
  try {
    const response = await fetch(ME_PATH, { headers: { accept: 'application/json' } })
    return response.ok ? asMe(await response.json()) : SIGNED_OUT
  } catch {
    return SIGNED_OUT
  }
}

/**
 * The token the bridge table sent back after `#`: taken out of the address at once (so it is in
 * no history entry from here on, nor in a link someone copies) and handed to the Worker
 */
function takeToken(): string | null {
  const hash = window.location.hash
  const prefix = `#${TOKEN_FRAGMENT_KEY}=`
  if (!hash.startsWith(prefix)) return null
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search,
  )
  return hash.slice(prefix.length)
}

let started: Promise<void> | null = null

/** Once, before the app renders: finishes a sign-in if there is one, then asks who this is */
export function startAccount(): Promise<void> {
  started ??= start()
  return started
}

async function start(): Promise<void> {
  const token = takeToken()
  if (token !== null) {
    try {
      const response = await fetch(AUTH_CALLBACK_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (response.ok) return set(asMe(await response.json()))
    } catch {
      // Said below
    }
    return set({ ...(await fetchMe()), failed: true })
  }
  set(await fetchMe())
}

/** The sign-in link: the Worker sends the browser to the bridge table and back to this page */
export function signInHref(path: string): string {
  return `${AUTH_START_PATH}?${new URLSearchParams({ return: path })}`
}

export async function signOut(): Promise<boolean> {
  try {
    const response = await fetch(AUTH_SIGN_OUT_PATH, { method: 'POST' })
    if (!response.ok) return false
    set({ configured: current?.configured ?? true, account: null })
    return true
  } catch {
    return false
  }
}

/** Tests only: forget what was asked */
export function resetAccountForTests(state: AccountState | null = null): void {
  started = state === null ? null : Promise.resolve()
  current = state
}

/** The failure was shown: not again */
export function clearAccountFailure(): void {
  if (current?.failed) set({ configured: current.configured, account: current.account })
}
