// The rank watermarks (e3-t11): which drawing of rankArt.svg a cell gets, and how big. The drawings
// are original line art in a file of their own, fetched by the browser after the first paint and
// never part of the JS (docs/ASSETS.md). Illustrative, after Qing dress in general: the hat tells the
// stage of a career, and it grows grander with the rank.
import { END_CELL, getCell } from '../../../shared/games/promotion/board.ts'
import type { CSSProperties } from 'react'
import { DEPARTMENTS, knobOf } from '../../../shared/games/promotion/departments.ts'
import { promotionBoard } from '../../styles/tokens.ts'
import sprite from './rankArt.svg?no-inline'

export type RankArt =
  | 'cap'
  | 'scholar'
  | 'laureate'
  | 'official1'
  | 'official2'
  | 'official3'
  | 'court'
  | 'helmet1'
  | 'helmet2'
  | 'helmet3'
  | 'guard1'
  | 'guard2'
  /** Not a rank: the gateway over the end of the game */
  | 'gate'


/** `href` of one drawing, for an SVG `<use>` */
export const artHref = (art: RankArt): string => `${sprite}#${art}`

const LAUREATES = ['zhuangyuan', 'bangyan', 'tanhua', 'jinshi', 'wuzhuangyuan', 'wujinshi']

/**
 * The drawing of a cell, or null for the end of the game. Without a post: a plain cap, a scholar's
 * hat, flowers for those at the top of the examinations. Officials: the summer hat, then a blue
 * plume, then a peacock feather; the army's helmet the same way; the guard's hat with its plume; and
 * at the very top the court hat with a two-eyed feather and court beads
 */
export function rankArtOf(id: string): RankArt | null {
  if (id === END_CELL) return null
  const { rank } = getCell(id)
  const army = DEPARTMENTS.army.includes(id)
  if (rank >= 22 || DEPARTMENTS.top.includes(id)) return army ? 'helmet3' : 'court'
  if (rank <= 1) return 'cap'
  if (LAUREATES.includes(id)) return 'laureate'
  if (rank <= 4) return 'scholar'
  if (army) return rank >= 20 ? 'helmet3' : rank >= 14 ? 'helmet2' : 'helmet1'
  if (DEPARTMENTS.guard.includes(id)) return rank >= 15 ? 'guard2' : 'guard1'
  return rank >= 18 ? 'official3' : rank >= 12 ? 'official2' : 'official1'
}

/** How much of the cell's height the drawing takes: half for a commoner, nearly all at the top */
export const rankArtSize = (rank: number): number => 0.5 + 0.45 * Math.min(1, rank / 23)

/** The colour of a rank's hat button for the drawing's own button, if the rank has one */
export function knobStyle(rank: number): CSSProperties | undefined {
  const knob = knobOf(rank)
  return knob ? ({ '--knob': promotionBoard.knob[knob] } as CSSProperties) : undefined
}
