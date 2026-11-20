// Who is asking, for the abuse limits (e12-t06, docs/SECURITY.md §6): a short hash of the address
// Cloudflare saw (`CF-Connecting-IP`), never the address itself. It is only ever a rate limiter's
// key or a room's count of open sockets, kept in memory or in the limiter's own short window.

/** Between the Worker and a RoomDO: the hashed address of the socket being opened (`addressKey`) */
export const ADDRESS_HEADER = 'x-tku-address'

/** What every request without an address counts as (cannot happen behind Cloudflare) */
export const UNKNOWN_ADDRESS = 'unknown'

/** Hex characters of the hash kept: 64 bits, plenty to tell the addresses of one site apart */
const KEY_CHARS = 16

/**
 * The part of an address that is one subscriber: an IPv4 address whole, an IPv6 address by its
 * /64 (one home or phone gets a whole /64 and could walk through it). Lower case, so that two
 * spellings of one address agree
 */
export function addressPrefix(address: string): string {
  const ip = address.trim().toLowerCase()
  // IPv4, also written as an IPv6 address (`::ffff:192.0.2.1`)
  if (ip.includes('.')) return ip.slice(ip.lastIndexOf(':') + 1)
  // Expand `::` so that the first four groups are the /64
  const [head, tail = ''] = ip.split('::')
  const left = head ? head.split(':') : []
  const right = ip.includes('::') && tail ? tail.split(':') : []
  const groups = ip.includes('::')
    ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    : left
  return groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ''))
    .join(':')
}

/** 127.0.0.0/8 and ::1: only ever local development (Cloudflare never reports them) */
export function isLoopback(address: string): boolean {
  const ip = address.trim().toLowerCase()
  return /^127\./.test(ip) || ip === '::1' || ip === '0:0:0:0:0:0:0:1' || ip === '::ffff:127.0.0.1'
}

/** The request's address as Cloudflare saw it, or null when there is none */
export function clientAddress(request: Request): string | null {
  const address = request.headers.get('cf-connecting-ip')?.trim()
  return address ? address : null
}

/** A short SHA-256 of the address's subscriber part; UNKNOWN_ADDRESS without an address */
export async function addressKey(address: string | null): Promise<string> {
  if (address === null) return UNKNOWN_ADDRESS
  const bytes = new TextEncoder().encode(`tku-arcade:${addressPrefix(address)}`)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  let hex = ''
  for (const byte of digest.subarray(0, KEY_CHARS / 2)) hex += byte.toString(16).padStart(2, '0')
  return hex
}
