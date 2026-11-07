import { avatarColors } from '../styles/tokens.ts'

/** The first character as a person reads it: an emoji or a Chinese surname, whole */
export function initialOf(name: string): string {
  const trimmed = name.trim()
  const first = new Intl.Segmenter().segment(trimmed)[Symbol.iterator]().next()
  return first.done ? '' : first.value.segment
}

/** The same name is the same colour on every screen and every device */
export function avatarColor(name: string): string {
  let hash = 0
  for (const unit of name) hash = (hash * 31 + (unit.codePointAt(0) as number)) >>> 0
  return avatarColors[hash % avatarColors.length]
}
