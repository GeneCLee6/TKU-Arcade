// The full board's brush face: the same LXGW WenKai TC (SIL OFL 1.1) from Google Fonts as the simple
// board (boardFont.ts, docs/ASSETS.md), asked for only the characters the full board draws: the names
// of both boards' cells, the plaques, seals, grades and the six results. A request of its own, as the
// simple board's does not have these characters. Asked for once the board's data is there (fullData.ts).
import { promotionFullMessages } from '../../../../shared/games/promotion/i18n.full.ts'
import { fullData } from './fullData.ts'

const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ·.+−×'
const DRAWN = /^games\.promotion\.full\.(plaque|seal|glyph|grade)\./

/** Every character the full board draws in the brush face, sorted, so that the URL never changes */
export const fullBoardCharacters = (): string =>
  [
    ...new Set(
      LATIN +
        [...fullData().BOARD_FULL, ...fullData().BOARD_FULL_V2].map((cell) => cell.name['zh-TW']).join('') +
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
