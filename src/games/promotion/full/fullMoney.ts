// The full edition's words that need no board data (2026-11-22): the silver and the seats, which the
// first screen shows before the board's data has come. The sentences that name cells are in
// fullWords.ts, which comes with that data (fullData.ts)
import type { FullPlayer, Transfer } from '../../../../shared/games/promotion/types.ts'
import type { Translate } from '../../../i18n/t.ts'

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
