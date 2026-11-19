// The Worker's own answers (/api/*, /ws/*) get the same base headers as the pages (e12-t13,
// shared/security-headers.ts); the static assets get theirs from `_headers`.
import { BASE_HEADERS } from '../shared/security-headers.ts'

export function withSecurityHeaders(response: Response): Response {
  // A WebSocket upgrade passes as it is: its headers are the handshake's
  if (response.status === 101 || response.webSocket) return response
  // A response from a binding or the assets may have immutable headers: copy it first
  const out = new Response(response.body, response)
  for (const [name, value] of Object.entries(BASE_HEADERS)) {
    if (!out.headers.has(name)) out.headers.set(name, value)
  }
  return out
}
