// How the word games compare what people type (搭橋's clues, 撞詞's clues and guesses). No rules and
// no banks here, so the browser may import it to warn while someone types; the server decides.

/** Spaces of any kind become one, the ends are trimmed, control characters go; full-width forms fold (NFKC) */
export function tidyText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

/**
 * What two words are compared by: tidied, lower case, letters and digits only (no spaces, no
 * punctuation), so that "Bridge!", "bridge" and "ｂｒｉｄｇｅ" are one word
 */
export function foldText(text: string): string {
  return tidyText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

/** Characters, not UTF-16 units: one Chinese character is one */
export const textLength = (text: string): number => [...text].length

/** Any decimal digit or other number sign; Chinese numerals are words and stay allowed */
export const HAS_DIGIT = /[\p{Nd}\p{No}]/u

/** Whether one folded word holds the other: "雞" and "火雞", "ship" and "shipping" */
export function overlaps(a: string, b: string): boolean {
  const left = foldText(a)
  const right = foldText(b)
  if (left === '' || right === '') return false
  return left.includes(right) || right.includes(left)
}
