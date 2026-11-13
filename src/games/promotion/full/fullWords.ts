// The full edition's sentences: what a throw makes, what a turn did, where silver went and why. The
// ones that name cells need the board's data (fullData.ts): the screen asks for them once it is there.
import { DISMISSED } from '../../../../shared/games/promotion/fullFaces.ts'
import type {
  FullLastTurn,
  FullPlayer,
  FullThrow,
  Transfer,
} from '../../../../shared/games/promotion/types.ts'
import type { Language, Translate } from '../../../i18n/t.ts'
import { anyCell, shortCellName } from './fullText.ts'

const face = (t: Translate, step: string) => t(`games.promotion.full.face.${step}`)

/** What an event zone's throw (C8) or a restoration's decided, in words */
function eventText(t: Translate, thrown: FullThrow, language: Language): string {
  const { cell, face: decided } = thrown.event as NonNullable<FullThrow['event']>
  const zone = shortCellName(cell, language)
  if (decided === null) return t('games.promotion.full.combo.eventWait', { zone })
  let outcome: string
  if (cell === DISMISSED) {
    const exiled = decided === 'zang' && (thrown.combo === 'three' || thrown.combo === 'allGraft')
    outcome = t(
      decided === 'de'
        ? 'games.promotion.full.restore.de'
        : decided === 'cai'
          ? 'games.promotion.full.restore.cai'
          : exiled
            ? 'games.promotion.full.restore.exile'
            : 'games.promotion.full.restore.wait',
    )
  } else {
    const result = anyCell(cell).event?.[decided]
    outcome = result
      ? [
          t(`games.promotion.full.go.${result.go}`),
          ...(result.money > 0 ? [t('games.promotion.full.go.money', { amount: result.money })] : []),
          ...(result.title ? [t('games.promotion.full.go.title')] : []),
        ].join(', ')
      : ''
  }
  return t('games.promotion.full.combo.event', { zone, face: face(t, decided), outcome })
}

/**
 * "A pair of Talent: one move", "Virtue over Graft: void, throw again". `again` is whether this turn
 * throws once more after this one: only the first board's three throws (C6) ever did; since C8 a
 * throw that scores nothing ends the turn where it stands, and must not say "throw again"
 */
export function comboText(
  t: Translate,
  thrown: FullThrow,
  birth: boolean,
  language: Language = 'en',
  again = false,
): string {
  if (birth) return t('games.promotion.full.combo.birth')
  if (thrown.event) return eventText(t, thrown, language)
  const [first, second] = thrown.steps
  switch (thrown.combo) {
    case 'none':
      return t(again ? 'games.promotion.full.combo.none' : 'games.promotion.full.combo.noMove')
    case 'cancel':
      return t(again ? 'games.promotion.full.combo.cancel' : 'games.promotion.full.combo.cancelStay')
    case 'pair':
    case 'three':
      return t(`games.promotion.full.combo.${thrown.combo}`, { face: face(t, first) })
    case 'pairs':
      return t('games.promotion.full.combo.pairs', { face: face(t, first), second: face(t, second) })
    default:
      return t(`games.promotion.full.combo.${thrown.combo}`)
  }
}

/** The household a seat was born into */
export const householdText = (t: Translate, player: FullPlayer, short = false): string =>
  t(
    player.banner
      ? short
        ? 'games.promotion.full.bannerShort'
        : 'games.promotion.full.banner'
      : short
        ? 'games.promotion.full.civilianShort'
        : 'games.promotion.full.civilian',
  )

export const degreeText = (t: Translate, player: FullPlayer): string => {
  const degree = t(`games.promotion.full.degree.${player.degree}`)
  return player.wu ? `${degree}, ${t('games.promotion.full.wu')}` : degree
}

/** What the turn did, once it is all shown: born, moved (through where), or stayed */
export function turnSentence(
  t: Translate,
  language: Language,
  last: FullLastTurn,
  player: FullPlayer | undefined,
  name: string,
): string {
  const cell = (id: string) => shortCellName(id, language)
  if (last.decision) {
    const { kind, price, timedOut } = last.decision
    const said = t(`games.promotion.full.decided.${kind}`, {
      name,
      cell: cell(last.decision.cell),
      from: cell(last.from),
      price,
    })
    return timedOut ? t('games.promotion.full.decided.timedOut', { sentence: said }) : said
  }
  if (last.birth && player) {
    return t('games.promotion.full.born', {
      name,
      origin: cell(last.path[0] ?? player.cell),
      household: householdText(t, player),
    })
  }
  const to = last.path.at(-1)
  // Still in an event zone or under review after its throw (C8)
  const waiting = last.throws.at(-1)?.event
  if (to === undefined && waiting && waiting.face === null) {
    return t('games.promotion.full.waits', { name, cell: cell(waiting.cell) })
  }
  if (to === undefined || to === last.from) {
    return t('games.promotion.full.stayed', { name, from: cell(last.from) })
  }
  if (last.path.length === 1) return t('games.promotion.full.moved', { name, from: cell(last.from), to: cell(to) })
  return t('games.promotion.full.movedVia', {
    name,
    from: cell(last.from),
    via: last.path.slice(0, -1).map(cell).join(' → '),
    to: cell(to),
  })
}

/** The last throw of a turn that went nowhere says so: after three throws (C6), or the one (C8) */
export function lastComboText(t: Translate, last: FullLastTurn, language: Language = 'en'): string {
  const thrown = last.throws.at(-1)
  if (!thrown) return ''
  if (thrown.event) return comboText(t, thrown, false, language)
  if (!last.birth && thrown.steps.length === 0) {
    if (last.throws.length >= 3) return t('games.promotion.full.combo.stuck')
    return t(thrown.combo === 'cancel' ? 'games.promotion.full.combo.cancelStay' : 'games.promotion.full.combo.noMove')
  }
  return comboText(t, thrown, last.birth, language)
}

export function transferText(t: Translate, transfer: Transfer, nameOf: (seat: number) => string): string {
  const party = (seat: number | null) => (seat === null ? t('games.promotion.full.bank') : nameOf(seat))
  return t('games.promotion.full.transfer', {
    from: party(transfer.from),
    to: party(transfer.to),
    amount: transfer.amount,
    why: t(`games.promotion.full.why.${transfer.why}`),
  })
}

/** Each seat's silver and the pot before a turn's transfers: what to show until they play */
export function beforeTransfers(
  players: readonly FullPlayer[],
  bank: number,
  transfers: readonly Transfer[],
): { money: Map<number, number>; bank: number } {
  const money = new Map(players.map((player) => [player.seat, player.money]))
  let pot = bank
  for (const { from, to, amount } of transfers) {
    if (from === null) pot += amount
    else money.set(from, (money.get(from) ?? 0) + amount)
    if (to === null) pot -= amount
    else money.set(to, (money.get(to) ?? 0) - amount)
  }
  return { money, bank: pot }
}

/** Each seat's grade for the ladder (品級考), as the end compares it: honorary titles add (C8) */
export function ladderGrade(
  player: FullPlayer,
  gradeOf: (rank: number) => number,
  second: boolean,
): number {
  if (player.status === 'out') return 0
  const grade = gradeOf(player.rank)
  if (!second || grade >= 13) return grade
  return Math.min(12, grade + (player.titles ?? 0))
}

/** "Juren · Banner" — what someone holds, for the members' list and the result */
export function seatInfo(t: Translate, language: Language, player: FullPlayer): string {
  if (player.origin === null) return t('games.promotion.full.notBorn')
  const office = `${shortCellName(player.cell, language)} · ${t(`games.promotion.full.rank.${player.rank}`)}`
  return t('games.promotion.full.seatInfo', {
    office,
    degree: degreeText(t, player),
    origin: shortCellName(player.origin, language),
    household: householdText(t, player),
    money: player.money,
  })
}
