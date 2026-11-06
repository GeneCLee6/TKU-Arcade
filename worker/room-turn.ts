// Running a turn-based game for a room, with a module that may have a bug. Everything goes through
// shared/games/match.ts, never `reduce` directly, and whatever a module throws stops here: the
// action is refused, the game stays as it was and the room goes on.
import {
  applyAction,
  projectGame,
  startMatch,
  type Match,
  type ReplayStep,
} from '../shared/games/match.ts'
import {
  isGameError,
  type Actor,
  type AnyGameModule,
  type GameError,
  type GameProjection,
  type OptionValues,
  type Seat,
  type Viewer,
} from '../shared/games/types.ts'
import type { JsonValue } from '../shared/patch.ts'

/**
 * A running or finished game as storage holds it. Never sent to a browser. With its steps
 * (`saveStep` in worker/room-host.ts, one storage key each) this is everything a replay needs:
 * `replayMatch(module, seats, options, seed, steps)` gives `match` again (e2-t09).
 */
export type StoredGame = {
  gameId: string
  seats: Seat[]
  options: OptionValues
  seed: number
  match: Match<JsonValue>
  /** How many steps have been stored */
  steps: number
}

export type ActionOutcome =
  | { kind: 'accepted'; game: StoredGame; step: ReplayStep<JsonValue>; over: boolean }
  | { kind: 'refused'; error: GameError }
  | { kind: 'failed' }

function logFailure(module: AnyGameModule, what: string, error: unknown): void {
  // The server's log only; states and actions stay out of it
  console.error(`game ${module.id}: ${what} threw`, error)
}

/** Every viewer of this game once, so a position no one can be shown is never stored */
function projectAll(module: AnyGameModule, game: StoredGame): void {
  for (const seat of game.seats) projectGame(module, game.match.state, seat.id)
  projectGame(module, game.match.state, 'spectator')
}

/** The new game, or null when the module could not start one or could not show the result */
export function beginGame(
  module: AnyGameModule,
  seats: Seat[],
  options: OptionValues,
  seed: number,
): StoredGame | null {
  try {
    const match = startMatch(module, seats, options, seed)
    const game: StoredGame = { gameId: module.id, seats, options, seed, match, steps: 0 }
    projectAll(module, game)
    return game
  } catch (error) {
    logFailure(module, 'start', error)
    return null
  }
}

/**
 * What `actor`'s action does to `game`, which is untouched in every case: the module works on a
 * copy, so even a module that changes its state and then throws leaves nothing behind.
 */
export function playAction(
  module: AnyGameModule,
  game: StoredGame,
  action: JsonValue,
  actor: Actor,
): ActionOutcome {
  try {
    const match = applyAction(module, structuredClone(game.match), action, actor)
    if (isGameError(match)) return { kind: 'refused', error: match }
    const next: StoredGame = { ...game, match, steps: game.steps + 1 }
    projectAll(module, next)
    return {
      kind: 'accepted',
      game: next,
      step: { actor, action },
      over: module.isOver(match.state),
    }
  } catch (error) {
    logFailure(module, 'action', error)
    return { kind: 'failed' }
  }
}

/** All `viewer` gets to know of the game; null if the module cannot say (never the raw state) */
export function projectFor(
  module: AnyGameModule | null,
  game: StoredGame,
  viewer: Viewer,
): GameProjection | null {
  if (!module) return null
  try {
    return projectGame(module, game.match.state, viewer)
  } catch (error) {
    logFailure(module, 'view', error)
    return null
  }
}
