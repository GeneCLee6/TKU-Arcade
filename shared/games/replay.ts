// A finished game played back (e2-t09): the seed and the action log, replayed with the same `reduce`
// the room ran, and shown as a spectator would have seen it. The room builds it (worker/room.ts) only
// once the game is over, so a replay never shows anything a player was still keeping to themselves;
// the browser only applies patches (src/pages/ReplayPage.tsx).
import { diff, type JsonValue, type PatchOp } from '../patch.ts'
import { applyAction, projectGame, startMatch, type ReplayStep } from './match.ts'
import {
  isGameError,
  type Actor,
  type GameModule,
  type GameProjection,
  type OptionValues,
  type Seat,
} from './types.ts'

/** One step of a replay: who acted, and how the spectator's projection changed */
export type ReplayFrame = { actor: Actor; ops: PatchOp[] }

/** GET /api/rooms/<id>/replay */
export type ReplayResponse = {
  gameId: string
  /** The rule options the game was played with */
  options: OptionValues
  /** Each seat's name when the replay was asked for, by seat id */
  names: Record<string, string>
  /** The spectator's projection before the first action */
  start: GameProjection
  frames: ReplayFrame[]
}

/**
 * The spectator's projection at the start and a patch for each step. Throws if a step is refused:
 * the log and the seed no longer give the game that was played (a module changed under it)
 */
export function buildReplay<
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
): { start: GameProjection; frames: ReplayFrame[] } {
  let match = startMatch(module, seats, options, seed)
  const project = (state: S) => projectGame(module, state, 'spectator') as unknown as GameProjection
  const start = project(match.state)
  let shown = start as unknown as JsonValue
  const frames = steps.map((step, index) => {
    const next = applyAction(module, match, step.action, step.actor)
    if (isGameError(next))
      throw new Error(`${module.id}: replay step ${index} refused: ${next.gameError}`)
    match = next
    const projection = project(match.state) as unknown as JsonValue
    const ops = diff(shown, projection)
    shown = projection
    return { actor: step.actor, ops }
  })
  return { start, frames }
}
