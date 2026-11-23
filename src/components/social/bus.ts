// 2026-11-23 (docs/ARCHITECTURE.md §4.98): the one tiny piece of the room's social layer every room
// screen carries. A name anywhere in a room (NameButton) asks for that member's card through here; the
// lazy layer (SocialLayer.tsx) listens. Bubbles find where a member sits on screen by SOCIAL_MEMBER
// (a name, a seat card) or, where a screen only knows seats (the kart's name tags), SOCIAL_SEAT.

/** Put on the element a member's emotes should float by: its value is the member id */
export const SOCIAL_MEMBER = 'data-social-member'
/** The same by seat, for a screen that knows only seats */
export const SOCIAL_SEAT = 'data-social-seat'

const listeners = new Set<(member: string) => void>()

/** Opens `member`'s card (nothing happens until the room's social layer has loaded) */
export function openPlayerCard(member: string): void {
  for (const listener of listeners) listener(member)
}

export function onOpenPlayerCard(listener: (member: string) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
