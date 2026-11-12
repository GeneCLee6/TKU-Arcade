// What makes an answer acceptable, in one place for the rules (which decide) and the screen (which
// only warns while someone types, H2). No topics and no rules here, so the browser may import it.

/** Characters, not bytes: an answer is one thing or one word, and this is plenty for either */
export const MAX_ANSWER_LENGTH = 30

/**
 * Any decimal digit (0-9, ０-９ and the other scripts') and any other number sign (①, ², ½). Chinese
 * numerals are words too ("一般", "十足"), so they stay allowed: the rules page asks for no numbers.
 */
const DIGIT = /[\p{Nd}\p{No}]/u

export const ANSWER_ERROR = {
  empty: 'games.spectrum.error.empty',
  tooLong: 'games.spectrum.error.tooLong',
  digits: 'games.spectrum.error.digits',
} as const

export type AnswerProblem = (typeof ANSWER_ERROR)[keyof typeof ANSWER_ERROR]

/** Spaces of any kind become one, the ends are trimmed, and control characters go */
export function normaliseAnswer(text: string): string {
  return text
    .replace(/\s+/gu, ' ')
    .replace(/\p{Cc}/gu, '')
    .trim()
}

/** Why this answer is refused, or null when it is fine. Expects `normaliseAnswer`'s output */
export function answerProblem(text: string): AnswerProblem | null {
  if (text === '') return ANSWER_ERROR.empty
  if ([...text].length > MAX_ANSWER_LENGTH) return ANSWER_ERROR.tooLong
  if (DIGIT.test(text)) return ANSWER_ERROR.digits
  return null
}
