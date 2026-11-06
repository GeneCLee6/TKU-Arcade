// The module test tool (AC-2.6): plays a GameModule with random legal actions from a seed through
// the same shared/games/match.ts RoomDO runs, and checks the rules of shared/games/types.ts at
// every position. Any broken rule throws a HarnessError naming the seed and the step, so a failure
// can be played again. No test framework in here: scripts/play.ts runs it under plain Node.
//
//   const { result } = playRandom(myGame, { seed: 1, secrets: (state, viewer) => [...] })
//
// To assert a chosen game instead of a random one, use replayMatch and projectGame directly (see
// tests/games/tictactoe.test.ts).
import {
  applyAction,
  makeSeats,
  projectGame,
  replayMatch,
  startMatch,
  type Match,
  type ReplayStep,
} from '../../shared/games/match.ts'
import { defaultOptions } from '../../shared/games/options.ts'
import { createRng } from '../../shared/games/rng.ts'
import {
  isGameError,
  type Actor,
  type GameModule,
  type GameResult,
  type OptionValues,
  type SeatId,
  type Viewer,
} from '../../shared/games/types.ts'
import { applyPatch, diff, jsonEqual, type JsonValue } from '../../shared/patch.ts'

/** A step limit no sensible game reaches: past it the game is taken not to end */
const DEFAULT_MAX_STEPS = 2_000

/** What every module must refuse from anyone, at any time, with a GameError (rule 5) */
const JUNK_ACTIONS: readonly JsonValue[] = [null, 42, 'junk', [], {}, { type: '__junk__' }]

export class HarnessError extends Error {
  override name = 'HarnessError'
}

export type HarnessConfig<S extends JsonValue, O extends OptionValues> = {
  seed: number
  /** How many seats; defaults to the game's minPlayers */
  seats?: number
  /** Defaults to the schema's defaults */
  options?: O
  /** Fail if the game has not ended after this many actions */
  maxSteps?: number
  /**
   * What `viewer` must not be able to see in this state: cards, targets, roles. The harness fails
   * if any of it appears anywhere in what that viewer is sent, as a value or as an object key, so
   * make each one unmistakable: `'card-Qh'`, not the number 12. Return nothing for what the game
   * has revealed by now.
   */
  secrets?: (state: S, viewer: Viewer) => JsonValue[]
}

export type PlayedGame<S extends JsonValue, A extends JsonValue> = {
  /** Every action applied, in order: with the seed, this is the replay */
  steps: ReplayStep<A>[]
  final: Match<S>
  result: GameResult
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(deepFreeze)
  }
  return value
}

function isJson(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJson)
  if (typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return (proto === Object.prototype || proto === null) && Object.values(value).every(isJson)
}

/** Whether `needle` is anywhere inside `haystack`, as a whole value or as an object key */
function contains(haystack: JsonValue, needle: JsonValue): boolean {
  if (jsonEqual(haystack, needle)) return true
  if (Array.isArray(haystack)) return haystack.some((item) => contains(item, needle))
  if (typeof haystack !== 'object' || haystack === null) return false
  return Object.entries(haystack).some(([key, value]) => key === needle || contains(value, needle))
}

function playOnce<
  S extends JsonValue,
  A extends JsonValue,
  V extends JsonValue,
  O extends OptionValues,
>(module: GameModule<S, A, V, O>, config: HarnessConfig<S, O>): PlayedGame<S, A> {
  const { seed, secrets, maxSteps = DEFAULT_MAX_STEPS } = config
  const seats = makeSeats(config.seats ?? module.meta.minPlayers)
  const options = config.options ?? defaultOptions<O>(module.options)
  const seatIds: SeatId[] = seats.map((seat) => seat.id)
  const viewers: Viewer[] = [...seatIds, 'spectator']
  // The harness's own choices come from a separate stream: they must not move the game's Rng
  const chooser = createRng((seed ^ 0x9e3779b9) >>> 0)
  const sent = new Map<Viewer, JsonValue>()
  const steps: ReplayStep<A>[] = []

  let where = 'init'
  const fail = (message: string): never => {
    throw new HarnessError(`${module.id}, seed ${seed}, ${where}: ${message}`)
  }

  /** Runs `body`, turning anything it throws into a failure that says where */
  const guarded = <T>(what: string, body: () => T): T => {
    try {
      return body()
    } catch (error) {
      if (error instanceof HarnessError) throw error
      return fail(`${what} threw: ${String(error)}`)
    }
  }

  const tryAction = (match: Match<S>, action: A, actor: Actor) =>
    guarded(`reduce(${JSON.stringify(action)}) by ${actor}`, () =>
      applyAction(module, match, action, actor),
    )

  const checkProjections = (match: Match<S>) => {
    for (const viewer of viewers) {
      const projection = guarded(`the projection for ${viewer}`, () =>
        projectGame(module, match.state, viewer),
      )
      if (!isJson(projection)) fail(`what ${viewer} is sent is not plain JSON`)
      // What goes over the wire: the browser must end up with exactly this view
      const before = sent.get(viewer) ?? null
      if (!jsonEqual(applyPatch(before, diff(before, projection)), projection)) {
        fail(`the patch for ${viewer} does not rebuild the view`)
      }
      sent.set(viewer, projection)
      const hidden = guarded('secrets', () => secrets?.(match.state, viewer) ?? [])
      for (const secret of hidden) {
        if (contains(projection, secret)) {
          fail(`what ${viewer} is sent leaks the secret ${JSON.stringify(secret)}`)
        }
      }
    }
  }

  const legalBySeat = (match: Match<S>) =>
    new Map(
      seatIds.map((seat) => [
        seat,
        guarded(`legalActions for ${seat}`, () => module.legalActions(match.state, seat)),
      ]),
    )

  const checkActions = (match: Match<S>, legal: ReadonlyMap<SeatId, A[]>) => {
    const over = module.isOver(match.state)
    for (const seat of seatIds) {
      if (over && legal.get(seat)?.length) fail(`seat ${seat} has legal actions after the end`)
      for (const junk of JUNK_ACTIONS) {
        if (!isGameError(tryAction(match, junk as A, seat))) {
          fail(`seat ${seat}'s junk action ${JSON.stringify(junk)} was accepted`)
        }
      }
      for (const action of legal.get(seat) ?? []) {
        if (isGameError(tryAction(match, action, seat))) {
          fail(`seat ${seat}'s legal action ${JSON.stringify(action)} was refused`)
        }
      }
    }
    // Whose turn it is: what only one seat may do, the others may not
    for (const [owner, actions] of legal) {
      for (const action of actions) {
        for (const [seat, theirs] of legal) {
          if (seat === owner || theirs.some((mine) => jsonEqual(mine, action))) continue
          if (!isGameError(tryAction(match, action, seat))) {
            fail(`seat ${seat} could play seat ${owner}'s action ${JSON.stringify(action)}`)
          }
        }
      }
    }
  }

  const checkResult = (result: GameResult) => {
    const standing = result.standings.map((line) => line.seat).sort((a, b) => a - b)
    if (!jsonEqual(standing, seatIds)) fail(`result lists seats ${standing}, not every seat once`)
    if (!result.standings.some((line) => line.rank === 1)) fail('result has nobody ranked 1')
    if (result.standings.some((line) => !Number.isInteger(line.rank) || line.rank < 1)) {
      fail('result has a rank that is not a positive integer')
    }
  }

  /** The next action: a random seat that can act, else the first timer running */
  const choose = (match: Match<S>, legal: ReadonlyMap<SeatId, A[]>): ReplayStep<A> => {
    const able = seatIds.filter((seat) => legal.get(seat)?.length)
    if (able.length > 0) {
      const actor = chooser.pick(able)
      return { actor, action: chooser.pick(legal.get(actor) ?? []) }
    }
    const timer = guarded('timers', () => module.timers?.(match.state) ?? [])[0]
    if (timer) return { actor: 'system', action: timer.action }
    return fail('nobody can act, no timer is running, and the game is not over')
  }

  const started = guarded('init', () => startMatch(module, seats, options, seed))
  let match: Match<S> = { state: deepFreeze(started.state), rngState: started.rngState }

  for (;;) {
    if (!isJson(match.state)) fail('the state is not plain JSON')
    checkProjections(match)
    const legal = legalBySeat(match)
    checkActions(match, legal)
    if (module.isOver(match.state)) break
    if (steps.length >= maxSteps) fail(`the game has not ended after ${maxSteps} actions`)

    const step = choose(match, legal)
    const next = tryAction(match, step.action, step.actor)
    if (isGameError(next)) {
      const action = JSON.stringify(step.action)
      return fail(`${step.actor}'s action ${action} refused: ${next.gameError}`)
    }
    match = { state: deepFreeze(next.state), rngState: next.rngState }
    steps.push(step)
    where = `step ${steps.length}`
  }

  const result = guarded('result', () => module.result(match.state))
  checkResult(result)
  return { steps, final: match, result }
}

/**
 * Plays one whole game from `config.seed`, checking at every position that:
 *
 * - state and everything sent to each viewer is plain JSON, and its patch rebuilds it;
 * - `view`, `legalActions`, `result` never throw, and nothing leaks `config.secrets`;
 * - `reduce` never mutates the state (it is frozen), accepts each legal action, refuses junk with a
 *   GameError, and refuses from other seats what only one seat may do;
 * - somebody can act, or a timer is running; and the game ends within `maxSteps`, with a result
 *   listing every seat, and nothing legal left to do.
 *
 * Then that the same seed plays the same game again, and that seed + actions alone (a replay) gets
 * to the same state, Rng position and result.
 */
export function playRandom<
  S extends JsonValue,
  A extends JsonValue,
  V extends JsonValue,
  O extends OptionValues,
>(module: GameModule<S, A, V, O>, config: HarnessConfig<S, O>): PlayedGame<S, A> {
  const fail = (message: string): never => {
    throw new HarnessError(`${module.id}, seed ${config.seed}: ${message}`)
  }
  const played = playOnce(module, config)

  const again = playOnce(module, config)
  if (!jsonEqual(again.steps, played.steps) || !jsonEqual(again.final, played.final)) {
    fail('the same seed played a different game (is the module impure?)')
  }

  const seats = makeSeats(config.seats ?? module.meta.minPlayers)
  const options = config.options ?? defaultOptions<O>(module.options)
  const replayed = replayMatch(module, seats, options, config.seed, played.steps)
  if (!jsonEqual(replayed, played.final)) fail('the replay ended somewhere else')
  if (!jsonEqual(module.result(replayed.state), played.result)) {
    fail('the replay has another result')
  }
  return played
}
