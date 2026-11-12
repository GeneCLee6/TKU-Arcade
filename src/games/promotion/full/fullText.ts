// The full board's names in the current language, from boardFull.ts (loaded after the first paint,
// fullData.ts): only called for what is drawn once the board is there. Names come from the second
// board, and from the first for the one cell it alone has (書吏), which a game from before C8 may use.
import type { FullCell, FullDeptId } from '../../../../shared/games/promotion/boardFull.ts'
import type { Language } from '../../../i18n/t.ts'
import { fullData } from './fullData.ts'

const nameIn = (cell: FullCell, language: Language) => cell.name[language === 'zh-TW' ? 'zh-TW' : 'en']

let byId: ReadonlyMap<string, FullCell> | null = null

/** Any cell of either board by id */
export function anyCell(id: string): FullCell {
  if (byId === null) {
    const { BOARD_FULL, BOARD_FULL_V2 } = fullData()
    byId = new Map([...BOARD_FULL, ...BOARD_FULL_V2].map((cell) => [cell.id, cell]))
  }
  const cell = byId.get(id)
  if (cell === undefined) throw new Error(`promotion: no full-edition cell "${id}"`)
  return cell
}

/** A cell's whole name: in English the transliteration and its gloss */
export const fullCellName = (id: string, language: Language): string => nameIn(anyCell(id), language)

/** "Juren (Provincial Graduate)" as "Juren", where a sentence has no room for the gloss */
export const shortCellName = (id: string, language: Language): string =>
  fullCellName(id, language).split(' (')[0]

/**
 * What a cell says on the board, under its department's plaque: the name without the department's
 * own name in front ("戶部主事" under 戶部 is "主事", "Hubu Zhushi" is "Zhushi"); the plaque says it
 */
function boardNameOf(cell: FullCell, language: Language): string {
  const short = nameIn(cell, language).split(' (')[0]
  const dept = fullData().FULL_DEPARTMENTS[cell.dept]['zh-TW']
  const zh = cell.name['zh-TW']
  // Not a one-character department (縣, 州), nor when what is left would be one character (卿)
  if (dept.length < 2 || !zh.startsWith(dept) || zh.length - dept.length < 2) return short
  if (language === 'zh-TW') return zh.slice(dept.length)
  const words = short.split(' ')
  return words.length > 1 ? words.slice(1).join(' ') : short
}

const boardNames: Partial<Record<'en' | 'zh-TW', Map<string, string>>> = {}

export function boardCellName(id: string, language: Language): string {
  const key = language === 'zh-TW' ? 'zh-TW' : 'en'
  const names = (boardNames[key] ??= new Map())
  let name = names.get(id)
  if (name === undefined) {
    name = boardNameOf(anyCell(id), key)
    names.set(id, name)
  }
  return name
}

export const deptName = (id: FullDeptId, language: Language): string =>
  fullData().FULL_DEPARTMENTS[id][language === 'zh-TW' ? 'zh-TW' : 'en']

/** A name in lines for a cell: Chinese in rows of up to three, Latin at spaces */
export function nameLines(name: string): { lines: string[]; latin: boolean } {
  if (!/[a-z]/i.test(name)) {
    const chars = [...name]
    if (chars.length <= 3) return { lines: [name], latin: false }
    const half = Math.ceil(chars.length / 2)
    return { lines: [chars.slice(0, half).join(''), chars.slice(half).join('')], latin: false }
  }
  const lines: string[] = []
  for (const word of name.split(' ')) {
    const last = lines.at(-1)
    if (last !== undefined && last.length + 1 + word.length <= 10) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  return { lines, latin: true }
}
