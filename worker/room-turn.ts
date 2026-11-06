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
import type { TimerInfo } from '../shared/protocol.ts'

/**
 * A countdown the game's state asked for, with the time the room gave it. `spent` once it has fired:
 * it stays while the state still lists its id, so that it does not start over (`TimerSpec`).
 */
export type RunningTimer = {
  id: string
  ms: number
  action: JsonValue
  endsAt: number
  spent: boolean
}

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
  timers: RunningTimer[]
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

/**
 * What `state` asks for: an id already running keeps its time, a new one starts now, any other stops.
 * At least 1 ms, so that a timer started while timers fire is never due in the same round.
 */
function nextTimers(
  module: AnyGameModule,
  state: JsonValue,
  running: readonly RunningTimer[],
  now: number,
): RunningTimer[] {
  if (module.isOver(state)) return []
  return (module.timers?.(state) ?? []).map(({ id, ms, action }) => {
    const known = running.find((timer) => timer.id === id)
    return known
      ? { ...known, action }
      : { id, ms, action, endsAt: now + Math.max(ms, 1), spent: false }
  })
}

/** The timer that should fire first at `now`, if any */
export function dueTimer(game: StoredGame, now: number): RunningTimer | null {
  return (
    game.timers
      .filter((timer) => !timer.spent && timer.endsAt <= now)
      .sort((a, b) => a.endsAt - b.endsAt)[0] ?? null
  )
}

/** `game` with this timer spent, whatever its action then does */
export function spendTimer(game: StoredGame, id: string): StoredGame {
  return {
    ...game,
    timers: game.timers.map((timer) => (timer.id === id ? { ...timer, spent: true } : timer)),
  }
}

/** When the next timer of this game runs out; null when none is running */
export function nextTimerAt(game: StoredGame): number | null {
  const times = game.timers.filter((timer) => !timer.spent).map((timer) => timer.endsAt)
  return times.length > 0 ? Math.min(...times) : null
}

/** The countdowns as browsers get them: durations, since their clocks disagree */
export function timerInfos(game: StoredGame | null, now: number): TimerInfo[] {
  return (game?.timers ?? [])
    .filter((timer) => !timer.spent)
    .map((timer) => ({
      id: timer.id,
      remainingMs: Math.max(timer.endsAt - now, 0),
      totalMs: timer.ms,
    }))
}

/** The new game, or null when the module could not start one or could not show the result */
export function beginGame(
  module: AnyGameModule,
  seats: Seat[],
  options: OptionValues,
  seed: number,
  now: number,
): StoredGame | null {
  try {
    const match = startMatch(module, seats, options, seed)
    const game: StoredGame = {
      gameId: module.id,
      seats,
      options,
      seed,
      match,
      steps: 0,
      timers: nextTimers(module, match.state, [], now),
    }
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
  now: number,
): ActionOutcome {
  try {
    const match = applyAction(module, structuredClone(game.match), action, actor)
    if (isGameError(match)) return { kind: 'refused', error: match }
    const next: StoredGame = {
      ...game,
      match,
      steps: game.steps + 1,
      timers: nextTimers(module, match.state, game.timers, now),
    }
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
