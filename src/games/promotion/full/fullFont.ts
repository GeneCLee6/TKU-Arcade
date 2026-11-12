// The full board's brush face: the same LXGW WenKai TC (SIL OFL 1.1) from Google Fonts as the simple
// board (boardFont.ts, docs/ASSETS.md), asked for only the characters the full board draws: its 182
// names, the plaques, seals and the six results. A request of its own, as the simple board's does not
// have these characters.
import { BOARD_FULL } from '../../../../shared/games/promotion/boardFull.ts'
import { promotionFullMessages } from '../../../../shared/games/promotion/i18n.full.ts'

const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ·.+−×'
const DRAWN = /^games\.promotion\.full\.(plaque|seal|glyph)\./

/** Every character the full board draws in the brush face, sorted, so that the URL never changes */
export const fullBoardCharacters = (): string =>
  [
    ...new Set(
      LATIN +
        BOARD_FULL.map((cell) => cell.name['zh-TW']).join('') +
        Object.entries(promotionFullMessages['zh-TW'])
          .filter(([key]) => DRAWN.test(key))
          .map(([, text]) => text)
          .join(''),
    ),
  ]
    .sort()
    .join('')

/** Asks for the font once per page; the board draws in the fallback until it is there */
export function loadFullBoardFont(): void {
  const id = 'promotion-full-board-font'
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC:wght@700&display=swap&text=${encodeURIComponent(fullBoardCharacters())}`
  document.head.append(link)
}
