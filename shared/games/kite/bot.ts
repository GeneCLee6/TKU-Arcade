// A computer player for 放風箏 (2026-11-23, docs/ARCHITECTURE.md "電腦玩家"). It sees what its seat's
// browser would: every hand but its own, what the notes told it about its own kites, the strings
// flying, what was set aside, and the table's log. From those it works out what each of its own kites
// can still be: what the notes allow, less every copy it can see somewhere else.
//
// Normal follows one convention, the same one it reads its partners' notes by (a common one at this
// kind of table): a note's focus is the newest kite it points at that no earlier note pointed at.
// If some kite fitting the note could fly right now, the note means "fly the focus"; if none could,
// it means "keep the focus" (a save). So it only passes a note whose focus really flies now (and is
// not one the table is already about to fly), or, to the next player, a save for a kite that cannot
// be replaced (a 5, or the last copy) about to be set aside. On its own turn it flies a kite it is
// sure of, then passes a useful note, then flies a kite it was told to fly if it is likely enough,
// then sets aside a kite it knows is useless, else its oldest kite no note pointed at.
//
// Easy is careful and simple: it flies only a kite the notes alone prove can fly, passes a note that
// points at something flyable (without minding which kite it focuses), and otherwise sets aside its
// oldest kite.
import type { Rng, SeatId } from '../types.ts'
import { MAX_BURNS, MAX_NOTES } from './limits.ts'
import type { KiteAction, KiteFace, KiteHint, KiteRank, KiteSuit, KiteView, KiteViewCard } from './types.ts'

const RANKS: readonly KiteRank[] = [1, 2, 3, 4, 5]
/** Copies of each number in a colour (rules.ts COPIES; not imported, rules.ts imports this) */
const COPIES: Readonly<Record<KiteRank, number>> = { 1: 3, 2: 2, 3: 2, 4: 2, 5: 1 }

/** What a note means for its focus: fly it (one of `faces`), or keep it */
export type KiteMark = { kind: 'play'; faces: KiteFace[] } | { kind: 'save' }

type Stacks = Partial<Record<KiteSuit, number>>

const faceKey = (face: KiteFace) => `${face.suit}${face.rank}`

function touches(hint: KiteHint, face: KiteFace): boolean {
  if (hint.kind === 'rank') return face.rank === hint.rank
  return face.suit === hint.suit || face.suit === 'rainbow'
}

const playable = (stacks: Stacks, face: KiteFace) => (stacks[face.suit] ?? 0) + 1 === face.rank

/** The kites that could fly now and fit `hint`: what the note asks its focus to be */
function flyingFaces(suits: readonly KiteSuit[], stacks: Stacks, hint: KiteHint): KiteFace[] {
  return suits.flatMap((suit) => {
    const rank = (stacks[suit] ?? 0) + 1
    if (rank > 5) return []
    const face = { suit, rank: rank as KiteRank }
    return touches(hint, face) ? [face] : []
  })
}

/** The focus of a note pointing at `cards` (ids, newest first): the newest one no earlier note touched */
const focusOf = (cards: readonly number[], clued: ReadonlySet<number>): number | undefined =>
  cards.find((id) => !clued.has(id)) ?? cards[0]

/**
 * What every note so far told its focus, read by the convention, and every kite any note has pointed
 * at. Public: everyone can work it out from the log
 */
export function readNotes(view: KiteView): { marks: Map<number, KiteMark>; clued: Set<number> } {
  const stacks: Stacks = {}
  const marks = new Map<number, KiteMark>()
  const clued = new Set<number>()
  for (const entry of view.log) {
    if (entry.kind === 'play' && entry.ok) stacks[entry.card.suit] = entry.card.rank
    if (entry.kind !== 'hint') continue
    const focus = focusOf(entry.cards, clued)
    if (focus !== undefined) {
      const faces = flyingFaces(view.suits, stacks, entry.hint)
      marks.set(focus, faces.length > 0 ? { kind: 'play', faces } : { kind: 'save' })
    }
    for (const id of entry.cards) clued.add(id)
  }
  return { marks, clued }
}

/** Copies of each face nobody has seen fly or be set aside (visible hands not taken off) */
function unspent(view: KiteView): Map<string, number> {
  const left = new Map<string, number>()
  for (const suit of view.suits) {
    for (const rank of RANKS) left.set(faceKey({ suit, rank }), COPIES[rank] - ((view.stacks[suit] ?? 0) >= rank ? 1 : 0))
  }
  for (const face of view.discards) left.set(faceKey(face), (left.get(faceKey(face)) ?? 0) - 1)
  return left
}

/** A face that can never fly: already up, or a lower number of its colour is gone for good */
function dead(view: KiteView, left: ReadonlyMap<string, number>, face: KiteFace): boolean {
  const height = view.stacks[face.suit] ?? 0
  if (face.rank <= height) return true
  for (let rank = height + 1; rank < face.rank; rank++) {
    if ((left.get(faceKey({ suit: face.suit, rank: rank as KiteRank })) ?? 0) <= 0) return true
  }
  return false
}

/** The last copy that could still fly: setting it aside loses it */
const critical = (view: KiteView, left: ReadonlyMap<string, number>, face: KiteFace) =>
  !dead(view, left, face) && (left.get(faceKey(face)) ?? 0) <= 1

type Reading = {
  view: KiteView
  me: SeatId
  left: Map<string, number>
  /** `left` less every kite in the hands this seat sees */
  unseen: Map<string, number>
  marks: Map<number, KiteMark>
  clued: Set<number>
}

function read(view: KiteView): Reading | null {
  if (view.you === null) return null
  const left = unspent(view)
  const unseen = new Map(left)
  for (const hand of view.hands) {
    for (const card of hand.cards) {
      if (card.suit !== null && card.rank !== null) {
        const key = faceKey({ suit: card.suit, rank: card.rank })
        unseen.set(key, (unseen.get(key) ?? 0) - 1)
      }
    }
  }
  return { view, me: view.you, left, unseen, ...readNotes(view) }
}

/** What one of this seat's own kites can be, each with how many copies of it could be there */
function possible(reading: Reading, card: KiteViewCard, useMarks: boolean, useSight: boolean): { face: KiteFace; weight: number }[] {
  const counts = useSight ? reading.unseen : reading.left
  const faces = card.knows.suits.flatMap((suit) => card.knows.ranks.map((rank) => ({ suit, rank })))
  const counted = faces.map((face) => ({ face, weight: counts.get(faceKey(face)) ?? 0 })).filter((one) => one.weight > 0)
  // Counting ruled out everything (a misread note): fall back on the notes alone
  const all = counted.length > 0 ? counted : faces.map((face) => ({ face, weight: 1 }))
  const mark = useMarks ? reading.marks.get(card.id) : undefined
  if (mark?.kind === 'play') {
    const narrowed = all.filter(({ face }) => mark.faces.some((one) => faceKey(one) === faceKey(face)))
    if (narrowed.length > 0) return narrowed
  }
  return all
}

const share = (options: { face: KiteFace; weight: number }[], test: (face: KiteFace) => boolean) => {
  const total = options.reduce((sum, one) => sum + one.weight, 0)
  if (total <= 0) return 0
  return options.reduce((sum, one) => sum + (test(one.face) ? one.weight : 0), 0) / total
}

const myHand = (reading: Reading) => reading.view.hands.find((hand) => hand.seat === reading.me)?.cards ?? []

/** Whether `seat`, reading the notes alone, would fly this kite of theirs (a guess at their mind) */
function willFly(reading: Reading, card: KiteViewCard): boolean {
  const options = possible(reading, card, true, false)
  return options.length > 0 && options.every(({ face }) => playable(reading.view.stacks, face))
}

/** The kites the table is about to fly: faces this seat sees in hands their holders know can fly */
function pipeline(reading: Reading): Set<string> {
  const coming = new Set<string>()
  for (const hand of reading.view.hands) {
    if (hand.seat === reading.me) continue
    for (const card of hand.cards) {
      if (card.suit !== null && card.rank !== null && willFly(reading, card)) {
        coming.add(faceKey({ suit: card.suit, rank: card.rank }))
      }
    }
  }
  return coming
}

const hintOf = (action: KiteAction): KiteHint | null =>
  action.type === 'hintSuit'
    ? { kind: 'suit', suit: action.suit }
    : action.type === 'hintRank'
      ? { kind: 'rank', rank: action.rank }
      : null

/** How many seats after this one `seat` sits, 1 for the next */
function distance(view: KiteView, me: SeatId, seat: SeatId): number {
  const order = view.hands.map((hand) => hand.seat)
  const from = order.indexOf(me)
  const to = order.indexOf(seat)
  return (to - from + order.length) % order.length
}

type Scored = { action: KiteAction; score: number }

/** A note's effect by the convention: which of the receiver's kites it focuses, and what it says */
function noteEffect(reading: Reading, action: KiteAction): { focus: KiteViewCard; mark: KiteMark; touched: KiteViewCard[] } | null {
  const hint = hintOf(action)
  if (!hint || action.type === 'play' || action.type === 'discard' || action.type === 'timeUp' || action.type === 'skip') return null
  const hand = reading.view.hands.find((one) => one.seat === action.to)?.cards ?? []
  const touched = hand.filter((card) => card.suit !== null && card.rank !== null && touches(hint, card as KiteFace))
  const focusId = focusOf(
    touched.map((card) => card.id),
    reading.clued,
  )
  const focus = touched.find((card) => card.id === focusId)
  if (!focus) return null
  const faces = flyingFaces(reading.view.suits, reading.view.stacks, hint)
  return { focus, touched, mark: faces.length > 0 ? { kind: 'play', faces } : { kind: 'save' } }
}

/** The best "fly this" note: its focus flies now and nobody is about to fly that face already */
function playNote(reading: Reading, legal: readonly KiteAction[]): KiteAction | null {
  const coming = pipeline(reading)
  const { stacks } = reading.view
  let found: Scored | null = null
  for (const action of legal) {
    const effect = noteEffect(reading, action)
    if (!effect || effect.mark.kind !== 'play' || action.type !== 'hintSuit' && action.type !== 'hintRank') continue
    const face = effect.focus as KiteFace
    if (!playable(stacks, face) || coming.has(faceKey(face)) || willFly(reading, effect.focus)) continue
    // A twin of the focus elsewhere in the same hand would be flown on a later turn and burn
    const others = effect.touched.filter((card) => card !== effect.focus)
    const extra = others.filter((card) => playable(stacks, card as KiteFace) && faceKey(card as KiteFace) !== faceKey(face))
    const score = 10 + extra.length - 0.4 * (distance(reading.view, reading.me, action.to) - 1) + (face.rank === 5 ? 0.5 : 0)
    if (!found || score > found.score) found = { action, score }
  }
  return found?.action ?? null
}

/** The oldest kite no note pointed at: the one a player sets aside */
function chop(cards: readonly KiteViewCard[], reading: Reading): KiteViewCard | undefined {
  for (let at = cards.length - 1; at >= 0; at--) {
    if (!reading.clued.has(cards[at].id) && !reading.marks.has(cards[at].id)) return cards[at]
  }
  return undefined
}

/** A "keep this" note for the next player's oldest kite, when it cannot be replaced */
function saveNote(reading: Reading, legal: readonly KiteAction[]): KiteAction | null {
  const order = reading.view.hands.map((hand) => hand.seat)
  const next = order[(order.indexOf(reading.me) + 1) % order.length]
  if (next === reading.me) return null
  const cards = reading.view.hands.find((hand) => hand.seat === next)?.cards ?? []
  // Someone with a kite to fly flies it rather than set one aside
  if (cards.some((card) => willFly(reading, card))) return null
  const oldest = chop(cards, reading)
  if (!oldest || oldest.suit === null || oldest.rank === null) return null
  const face = oldest as KiteFace
  if (!critical(reading.view, reading.left, face)) return null
  const fits = legal.filter((action) => {
    if ((action.type !== 'hintRank' && action.type !== 'hintSuit') || action.to !== next) return false
    const effect = noteEffect(reading, action)
    if (!effect || effect.focus.id !== oldest.id) return false
    // Read as "fly it" it must really fly; otherwise it has to read as a save
    return effect.mark.kind === 'save' || playable(reading.view.stacks, face)
  })
  // A number says more about a last copy than a colour does
  return fits.find((action) => action.type === 'hintRank') ?? fits[0] ?? null
}

function normalMove(reading: Reading, legal: readonly KiteAction[]): KiteAction | null {
  const { view } = reading
  const hand = myHand(reading)
  const odds = hand.map((card) => {
    const options = possible(reading, card, true, true)
    return {
      card,
      fly: share(options, (face) => playable(view.stacks, face)),
      useless: share(options, (face) => dead(view, reading.left, face)),
      marked: reading.marks.get(card.id)?.kind === 'play',
    }
  })
  const canPlay = (id: number) => legal.find((action) => action.type === 'play' && action.card === id)
  const canDiscard = (id: number) => legal.find((action) => action.type === 'discard' && action.card === id)

  // Next player about to set aside a kite that cannot be replaced
  if (view.notes > 0) {
    const save = saveNote(reading, legal)
    if (save) return save
  }
  const sure = odds.filter((one) => one.fly >= 0.999).sort((a, b) => Number(b.marked) - Number(a.marked))[0]
  if (sure) return canPlay(sure.card.id) ?? null
  if (view.notes > 0) {
    const note = playNote(reading, legal)
    if (note) return note
  }
  const room = MAX_BURNS - view.burns
  const told = odds
    .filter((one) => one.marked && one.fly >= (room >= 2 ? 0.5 : 0.8))
    .sort((a, b) => b.fly - a.fly)[0]
  if (told) return canPlay(told.card.id) ?? null
  // The last round: a burn costs nothing then, as long as it is not the last one
  if (view.finalTurns !== null && room >= 2) {
    const chance = [...odds].sort((a, b) => b.fly - a.fly)[0]
    if (chance && chance.fly > 0) return canPlay(chance.card.id) ?? null
  }
  if (view.notes < MAX_NOTES) {
    const useless = odds.filter((one) => one.useless >= 0.999)[0]
    if (useless) return canDiscard(useless.card.id) ?? null
    const oldest = chop(hand, reading)
    if (oldest) return canDiscard(oldest.id) ?? null
    // Every kite was pointed at: the one least likely to matter
    const least = [...odds].sort((a, b) => b.useless - a.useless || a.fly - b.fly)[0]
    if (least) return canDiscard(least.card.id) ?? null
  }
  // Notes full and nothing to fly: a note that cannot be misread (a save, or a focus that flies)
  const safe = legal.find((action) => {
    const effect = noteEffect(reading, action)
    return effect !== null && (effect.mark.kind === 'save' || playable(view.stacks, effect.focus as KiteFace))
  })
  return safe ?? legal.find((action) => hintOf(action) !== null) ?? null
}

function easyMove(reading: Reading, legal: readonly KiteAction[], rng: Rng): KiteAction | null {
  const { view } = reading
  const hand = myHand(reading)
  // Only what the notes alone prove: no counting, no convention
  const sure = hand.find((card) => {
    const options = possible(reading, card, false, false)
    return options.length > 0 && options.every(({ face }) => playable(view.stacks, face))
  })
  if (sure) return legal.find((action) => action.type === 'play' && action.card === sure.id) ?? null
  const notes = legal.filter((action) => hintOf(action) !== null)
  if (notes.length > 0 && (view.notes >= MAX_NOTES || rng.float() < 0.6)) {
    const useful = notes.filter((action) => {
      const effect = noteEffect(reading, action)
      return effect?.touched.some((card) => playable(view.stacks, card as KiteFace))
    })
    return rng.pick(useful.length > 0 ? useful : notes)
  }
  const oldest = hand.at(-1)
  return (oldest && legal.find((action) => action.type === 'discard' && action.card === oldest.id)) ?? (notes.length > 0 ? rng.pick(notes) : null)
}

export function kiteBot(view: KiteView, legal: readonly KiteAction[], level: string, rng: Rng): KiteAction | null {
  if (legal.length === 0) return null
  const reading = read(view)
  if (!reading) return null
  return level === 'easy' ? easyMove(reading, legal, rng) : normalMove(reading, legal)
}
