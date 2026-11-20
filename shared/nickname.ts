// What a nickname may not say (e12-t06): pass for the site or one of its roles, or be plain abuse.
// The lists are in nickname-words.ts. The browser asks before sending, to explain as one types
// (src/components/NicknameForm.tsx); the room asks again on `join` and refuses the message
// (shared/protocol.ts parseClientMessage), since a page can be made to send anything.
import {
  BLOCKED_ANYWHERE,
  BLOCKED_LATIN_WORDS,
  RESERVED_CJK,
  RESERVED_LATIN,
} from './nickname-words.ts'
import { MAX_NAME_CHARS, normalizeName } from './protocol.ts'

/** `reserved`: passes for the site or a role; `blocked`: abuse */
export type NameProblem = 'reserved' | 'blocked'

/** Also what the form explains: nothing left, longer than MAX_NAME_CHARS */
export type NameIssue = NameProblem | 'empty' | 'tooLong'

const reservedLatin = new Set<string>(RESERVED_LATIN)
const blockedWords = new Set<string>(BLOCKED_LATIN_WORDS)

/** Width and case folded: ＡＤＭＩＮ, Admin and admin are one */
const fold = (name: string) => name.normalize('NFKC').toLowerCase()

/** Why a name normalizeName accepted may still not be used, or null when it may */
export function nameProblem(name: string): NameProblem | null {
  const folded = fold(name)
  // Letters only: spaces, digits, punctuation and symbols do not make a name someone else's
  const letters = folded.replace(/\P{L}/gu, '')
  if (reservedLatin.has(letters)) return 'reserved'
  if (RESERVED_CJK.some((word) => letters.includes(word))) return 'reserved'
  if (BLOCKED_ANYWHERE.some((word) => letters.includes(word))) return 'blocked'
  if (folded.split(/\P{L}+/u).some((word) => blockedWords.has(word))) return 'blocked'
  return null
}

/** What is wrong with what someone typed, or null when it can be their nickname */
export function nameIssue(raw: string): NameIssue | null {
  const name = normalizeName(raw)
  if (name === null) {
    const typed = raw.replace(/\s+/g, ' ').trim()
    return [...typed].length > MAX_NAME_CHARS ? 'tooLong' : 'empty'
  }
  return nameProblem(name)
}

/** The nickname as the room takes it from `join`: normalized and allowed, else null */
export function acceptableName(raw: unknown): string | null {
  const name = normalizeName(raw)
  return name !== null && nameProblem(name) === null ? name : null
}
