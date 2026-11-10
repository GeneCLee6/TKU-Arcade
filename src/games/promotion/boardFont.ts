// The board's brush face (docs/ASSETS.md): LXGW WenKai TC (SIL OFL 1.1) from Google Fonts, asked for
// only the characters the board draws. Google then sends one small font of those glyphs instead of a
// whole CJK face, and nothing is bundled, committed or kept on R2. Until it arrives, or if it never
// does, `font.kai` falls back to the system's own kai and then to a serif.
import { BOARD, FACES } from '../../../shared/games/promotion/board.ts'
import { promotionScreenMessages } from '../../../shared/games/promotion/i18n.screen.ts'
import { promotionMessages } from '../../../shared/games/promotion/i18n.ts'

const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ·'

/** Every character the board draws in the brush face, sorted, so that the URL is always the same */
export const boardCharacters = (): string =>
  [
    ...new Set(
      LATIN +
        BOARD.map((cell) => cell.name['zh-TW']).join('') +
        Object.values(promotionScreenMessages['zh-TW']).join('') +
        // The four results, which the board writes in Chinese in both languages
        FACES.map((face) => promotionMessages['zh-TW'][`games.promotion.glyph.${face}`]).join(''),
    ),
  ]
    .sort()
    .join('')

/** Asks for the font once per page; the board draws in the fallback until it is there */
export function loadBoardFont(): void {
  const id = 'promotion-board-font'
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC:wght@700&display=swap&text=${encodeURIComponent(boardCharacters())}`
  document.head.append(link)
}
