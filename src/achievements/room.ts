// 2026-11-23 (e11-t06, docs/ARCHITECTURE.md §4.82): what a room's finished game was for this person,
// from the room's view as every browser already has it (shared/protocol.ts RoomView). Pure. A
// spectator gets nothing; a race room becomes a kart race, anything else a board game's result.
import type { RoomView } from '../../shared/protocol.ts'
import type { BoardResultEvent, KartRaceEvent } from './events.ts'
import { boardOutcome, harderLevel } from './stats.ts'

/** A team race's summary names the winning side by its colour (shared/games/kart/rules.ts) */
const TEAM_WON = /\.result\.(red|blue)Won$/
const TEAM_NAMES = ['red', 'blue'] as const

export function roomEvent(view: RoomView, you: string): KartRaceEvent | BoardResultEvent | null {
  const result = view.game?.result
  const me = view.members[you]
  if (!result || !me || me.seat === null) return null
  const seated = Object.values(view.members).filter((member) => member.seat !== null)
  const humans = seated.filter((member) => !member.bot).length
  const level = seated.reduce<string | null>((hardest, member) => harderLevel(hardest, member.bot?.level ?? null), null)
  const summary = result.summary.key
  const mine = result.standings.find((one) => one.seat === me.seat)

  if (view.room.gameId === 'kart') {
    const won = TEAM_WON.exec(summary)?.[1]
    const side = me.team === undefined ? undefined : TEAM_NAMES[me.team]
    const team =
      summary.endsWith('.teamDraw') ? 'draw' : won && side ? (won === side ? 'won' : 'lost') : null
    return {
      type: 'kart.race',
      mode: 'room',
      // A racer who did not finish is still ranked (by how far they got); their line says "out"
      place: mine && !/[oO]ut$/.test(mine.note.key) ? mine.rank : null,
      racers: result.standings.length,
      level,
      team,
      humans,
    }
  }

  const params = result.summary.params ?? {}
  const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
  const score = number(params.score)
  const most = number(params.max)
  const levels = number(params.levels)
  return {
    type: 'board.result',
    game: view.room.gameId,
    outcome: boardOutcome(view.room.gameId, result.standings, me.seat, summary),
    humans,
    level,
    ...(score !== undefined ? { score } : {}),
    ...(most !== undefined ? { most } : {}),
    ...(levels !== undefined ? { levels } : {}),
  }
}
