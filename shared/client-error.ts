// What a browser reports to POST /api/errors when something goes wrong (e12-t04). The endpoint has
// no login, so everything here is treated as hostile and as possibly personal: `parseClientError`
// keeps only short, scrubbed text, and the Worker logs nothing else. Telemetry holds no personal
// data and no nicknames (docs/PRD/e12-platform-security-cost-ops.md).

export const CLIENT_ERROR_KINDS = ['boundary', 'chunk', 'error', 'rejection'] as const
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number]

export type ClientErrorReport = {
  kind: ClientErrorKind
  message: string
  stack: string | null
  /** The route, never a room's id (a private room's id is what lets you in) */
  path: string
  /** The commit this page was built from; differs from the Worker's on a stale tab */
  version: string
}

/** A longer POST /api/errors is refused without being parsed */
export const MAX_CLIENT_ERROR_BYTES = 8_192
export const MAX_ERROR_MESSAGE_CHARS = 300
export const MAX_ERROR_STACK_CHARS = 2_000

const IDENTIFIER_LIKE = /^[\w$.#:/-]{1,64}$/

/**
 * Takes out what could be someone's words or a secret. An error's text can quote what it choked on
 * (`Unexpected token 'h', "hello" is not valid JSON`), which may be a chat message, so anything in
 * double quotes goes, and in single quotes unless it looks like a name in the code. URLs lose their
 * query and fragment, room paths their id, and long random-looking runs (seat tokens) and e-mail
 * addresses go altogether.
 */
export function scrubText(text: string): string {
  return text
    .replace(/"[^"\n]*"/g, '"…"')
    .replace(/'([^'\n]*)'/g, (quoted, inner: string) =>
      IDENTIFIER_LIKE.test(inner) ? quoted : "'…'",
    )
    .replace(/`[^`\n]*`/g, '`…`')
    .replace(/[^\s@"']+@[^\s@"']+\.[^\s@"']+/g, '[email]')
    .replace(/(https?:\/\/[^\s?#)]*)[?#][^\s)]*/g, '$1')
    .replace(/\/(r|ws|api\/rooms)\/[^/\s?#"'):]+/g, '/$1/:id')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[token]')
}

/** The route shape of a pathname: room ids out, nothing but path-safe characters, kept short */
export function routeOf(pathname: string): string {
  return pathname
    .replace(/^\/r\/[^/]*/, '/r/:id')
    .replace(/[^\w/:.-]/g, '')
    .slice(0, 64)
}

const scrubbedText = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value !== '' ? scrubText(value).slice(0, max) : null

/** The report as it may be logged, or null when it does not look like one */
export function parseClientError(raw: string): ClientErrorReport | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  const { kind, message, stack, path, version } = value as Record<string, unknown>
  if (!CLIENT_ERROR_KINDS.includes(kind as ClientErrorKind)) return null
  const scrubbed = scrubbedText(message, MAX_ERROR_MESSAGE_CHARS)
  if (scrubbed === null) return null
  return {
    kind: kind as ClientErrorKind,
    message: scrubbed,
    stack: scrubbedText(stack, MAX_ERROR_STACK_CHARS),
    path: typeof path === 'string' ? routeOf(path) : '',
    version: typeof version === 'string' && /^[\w.-]{1,64}$/.test(version) ? version : 'unknown',
  }
}
