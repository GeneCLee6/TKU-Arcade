// The full edition's sentences: what a throw makes, what a turn did, where silver went and why
import type {
  FullLastTurn,
  FullPlayer,
  FullThrow,
  Transfer,
} from '../../../../shared/games/promotion/types.ts'
import type { Language, Translate } from '../../../i18n/t.ts'
import { shortCellName } from './fullText.ts'

const face = (t: Translate, step: string) => t(`games.promotion.full.face.${step}`)

/** "A pair of Talent: one move", "Virtue over Graft: void, throw again" */
export function comboText(t: Translate, thrown: FullThrow, birth: boolean): string {
  if (birth) return t('games.promotion.full.combo.birth')
  const [first, second] = thrown.steps
  switch (thrown.combo) {
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
  if (last.birth && player) {
    return t('games.promotion.full.born', {
      name,
      origin: cell(last.path[0] ?? player.cell),
      household: householdText(t, player),
    })
  }
  const to = last.path.at(-1)
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

/** The last throw of a turn that went nowhere says so */
export function lastComboText(t: Translate, last: FullLastTurn): string {
  const thrown = last.throws.at(-1)
  if (!thrown) return ''
  if (!last.birth && thrown.steps.length === 0) return t('games.promotion.full.combo.stuck')
  return comboText(t, thrown, last.birth)
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
