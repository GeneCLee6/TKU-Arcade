import { getGameInfo } from '../../shared/games/catalog.ts'
import type { Translate } from '../i18n/t.ts'

/** A game's name; a room from a newer deployment can have a game this page does not know */
export function gameTitle(t: Translate, gameId: string): string {
  const game = getGameInfo(gameId)
  return game ? t(`${game.meta.i18nKey}.name`) : t('room.genericTitle')
}
