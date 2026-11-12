import type { Translate } from '../../i18n/t.ts'

/** A cell's name in the current language: in English the transliteration with its gloss */
export const cellText = (t: Translate, id: string): string => t(`games.promotion.cell.${id}`)

/** "Juren (Provincial Graduate)" as "Juren", where a sentence has no room for the gloss */
export const shortCellText = (t: Translate, id: string): string => cellText(t, id).split(' (')[0]
