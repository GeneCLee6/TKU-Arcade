// A board row's ghost to race against in the time trial (2026-11-23, §4.81): what the leaderboard
// hands /kart's time trial. A type alone, so that the time trial's page does not load the board.
import type { Ghost } from '../../../shared/kart/ghost.ts'

export interface BoardChase {
  /** The track it was driven on (a board track's id) */
  readonly track: string
  readonly ghost: Ghost
  readonly nick: string
  readonly totalMs: number
}
