// A game in progress and the only things that happen to it: starting, an action, and projecting it
// for a viewer. RoomDO (A4), replays (e2-t09) and tests/games/harness.ts all go through here, so
// what the tests check is what runs.
import type { JsonValue } from '../patch.ts'
import { createRng } from './rng.ts'
import {
  isGameError,
  type Actor,
  type GameError,
  type GameModule,
  type GameProjection,
  type OptionValues,
  type Seat,
  type Viewer,
} from './types.ts'

/** What to store for a running game. Never sent to a browser */
export type Match<S extends JsonValue> = {
  state: S
  /** The Rng's position (`SeededRng.state()`), kept beside `state` so no view can reach it */
  rngState: number
}

/** One accepted action, as a replay stores it */
export type ReplayStep<A extends JsonValue> = {
  actor: Actor
  action: A
}

/** `count` seats numbered from 0 */
export function makeSeats(count: number): Seat[] {
  return Array.from({ length: count }, (_, id) => ({ id }))
}

/** The first state. Throws on a seat count the game does not allow: check `meta` before calling */
export function startMatch<
  S extends JsonValue,
  A extends JsonValue,
  V extends JsonValue,
  O extends OptionValues,
>(module: GameModule<S, A, V, O>, seats: readonly Seat[], options: O, seed: number): Match<S> {
  const { minPlayers, maxPlayers } = module.meta
  if (seats.length < minPlayers || seats.length > maxPlayers) {
    throw new RangeError(`${module.id}: ${seats.length} seats, needs ${minPlayers}-${maxPlayers}`)
  }
  const rng = createRng(seed)
  const state = module.init(seats, options, rng)
  return { state, rngState: rng.state() }
}

/**
 * The match after an action, or the `GameError` to answer with. `match` is untouched either way,
 * and a refused action moves nothing: not the state, not the Rng. `actor` is who the room knows
 * sent it, never something the browser claims.
 */
export function applyAction<
  S extends JsonValue,
  A extends JsonValue,
  V extends JsonValue,
  O extends OptionValues,
>(module: GameModule<S, A, V, O>, match: Match<S>, action: A, actor: Actor): Match<S> | GameError {
  const rng = createRng(match.rngState)
  const next = module.reduce(match.state, action, actor, rng)
  if (isGameError(next)) return next
  return { state: next, rngState: rng.state() }
}

/** Everything one viewer gets to know about the game: all of it comes from the module */
export function projectGame<
  S extends JsonValue,
  A extends JsonValue,
  V extends JsonValue,
  O extends OptionValues,
>(module: GameModule<S, A, V, O>, state: S, viewer: Viewer): GameProjection<A, V> {
  const over = module.isOver(state)
  return {
    view: module.view(state, viewer),
    legal: viewer === 'spectator' ? [] : module.legalActions(state, viewer),
    over,
    result: over ? module.result(state) : null,
    chatLocked: module.chatLocked?.(state) ?? false,
  }
}

/** The match after replaying `steps` from the seed; throws if the game refuses one of them */
export function replayMatch<
  S extends JsonValue,
  A extends JsonValue,
  V extends JsonValue,
  O extends OptionValues,
>(
  module: GameModule<S, A, V, O>,
  seats: readonly Seat[],
  options: O,
  seed: number,
  steps: readonly ReplayStep<A>[],
): Match<S> {
  let match = startMatch(module, seats, options, seed)
  steps.forEach((step, index) => {
    const next = applyAction(module, match, step.action, step.actor)
    if (isGameError(next)) {
      throw new Error(`${module.id}: replay step ${index} refused: ${next.gameError}`)
    }
    match = next
  })
  return match
}
