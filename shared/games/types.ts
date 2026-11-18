// The contract between a game and the platform (docs/ARCHITECTURE.md §3). To add a game, write a
// `GameModule` in shared/games/<id>/, add it to shared/games/index.ts and its info to catalog.ts, and play it with
// tests/games/harness.ts; shared/games/tictactoe/ is the template to copy.
//
// How a module is run (shared/games/match.ts is that code; RoomDO, replays and the harness share
// it):
//
//   startMatch   rng = createRng(seed); state = init(seats, options, rng)
//   applyAction  state = reduce(state, action, actor, rng), for every action from a browser
//                (or from a timer, as `actor: 'system'`)
//   projectGame  view(state, viewer), legalActions, isOver, result, chatLocked, for every viewer,
//                after every change; what comes out is the only thing a browser ever gets
//
// The rules a module must keep (the harness checks each one it can):
//
// 1. Pure. A function's answer depends only on its arguments: no Date.now, no Math.random, no
//    module-level variables, no DOM, no Cloudflare API. All chance comes from the `rng` argument.
//    That is what makes a replay (seed + actions) reproduce the game.
// 2. Never mutate. `reduce` returns a new state and leaves the old one as it was: a refused action
//    must leave nothing behind. The harness freezes every state it hands over.
// 3. JSON only. State, actions and views are stored and sent as JSON and diffed by shared/patch.ts,
//    so they hold plain objects, arrays, strings, finite numbers, booleans and null; no undefined
//    values, Map, Set, Date or class. Write them as `type` aliases: an `interface` is not
//    assignable to `JsonValue`.
// 4. `view` is the only way out. Anything a viewer may not know (a hand, a target, a role) must be
//    cut in `view`; the full state never reaches a browser. `legalActions` and `result` are sent
//    too, so they must not give it away either.
// 5. `reduce` is the referee and trusts nothing. `action` comes off the network as parsed JSON: the
//    `A` in its type is a hope, not a fact. Check its shape at run time, then whose turn it is,
//    then the rules, and answer `gameError(key)` for anything wrong. Never throw for a bad action.
import type { JsonValue } from '../patch.ts'

// ── Seats and viewers ────────────────────────────────────────────────────────────────────────

/**
 * A seat at the table: 0, 1, ... n - 1, in seat order. A seat outlives whoever sits in it (a player
 * who disconnects or is replaced leaves the number as it was), so games only ever talk about seats;
 * the room maps seats to members and their names.
 */
export type SeatId = number

/**
 * `team` (2026-11-18): the side its member chose in the waiting room (`RoomMember.team`), for a game
 * with teams (the kart's team race); absent when none was chosen, and any other game ignores it
 */
export type Seat = { id: SeatId; team?: number }

/** Who a view is for. A spectator is anyone without a seat */
export type Viewer = SeatId | 'spectator'

/**
 * Who sent an action: a seat, or `system` for what the room itself does (a timer running out, see
 * `TimerSpec`). No browser can act as `system`, so an action a module accepts only from `system`
 * cannot come from a player.
 */
export type Actor = SeatId | 'system'

// ── Randomness ───────────────────────────────────────────────────────────────────────────────

/**
 * The only source of chance a module may use. It is a stream: the same seed and the same calls give
 * the same numbers on every machine. The platform owns it (shared/games/rng.ts) and keeps its
 * position next to the game state, not inside it: the position predicts every future die and card,
 * so it must not be able to reach a view. A module never stores it.
 */
export interface Rng {
  /** A float in [0, 1) */
  float(): number
  /** An integer in [0, maxExclusive); throws unless maxExclusive is an integer from 1 to 2^32 */
  int(maxExclusive: number): number
  /** One item of a non-empty array; throws on an empty one */
  pick<T>(items: readonly T[]): T
  /** A shuffled copy (Fisher-Yates); `items` is left as it was */
  shuffle<T>(items: readonly T[]): T[]
}

// ── Text ─────────────────────────────────────────────────────────────────────────────────────

/**
 * A sentence for the browser to translate: modules and the server send i18n keys, never text, so
 * two people in one room can read two languages. Keys live in shared/games/<id>/i18n.ts; `{name}`
 * in a string is filled from `params`.
 */
export type TextRef = {
  key: string
  params?: Record<string, string | number>
}

export type GameLocale = 'en' | 'zh-TW'

/** A module's strings (shared/games/<id>/i18n.ts): flat `games.<id>.*` keys, the same in both */
export type GameMessages = Record<GameLocale, Record<string, string>>

// ── Refusing an action ───────────────────────────────────────────────────────────────────────

/**
 * What `reduce` returns instead of a state when an action is refused. It goes back to whoever sent
 * the action and nobody else. Make one with `gameError`. A state must not have a top-level
 * `gameError` field, or it would be taken for one of these.
 */
export type GameError = {
  /** i18n key of the message to show */
  gameError: string
  params?: Record<string, string | number>
}

export function gameError(key: string, params?: Record<string, string | number>): GameError {
  return params === undefined ? { gameError: key } : { gameError: key, params }
}

export function isGameError(value: unknown): value is GameError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { gameError?: unknown }).gameError === 'string'
  )
}

// ── Rule options ─────────────────────────────────────────────────────────────────────────────

export type OptionValue = boolean | number | string
export type OptionValues = Record<string, OptionValue>

/**
 * `showIf`: the waiting room shows the field only while another field has this value (promotion's
 * dice and round limit, which only the simple edition uses). The value is kept either way.
 */
export type ShowIf = { field: string; value: OptionValue }

/**
 * `hidden`: a field only the module's schema has, not the one in its info.ts, so the waiting room
 * never shows it. It can be set when a room is made (`POST /api/rooms`), and a host changing the
 * other options keeps it (`keepHidden`, shared/games/options.ts). For a rule a game is not ready to
 * offer yet (promotion's `edition` until C7).
 */
export type BooleanOption = {
  kind: 'boolean'
  labelKey: string
  default: boolean
  hidden?: true
  showIf?: ShowIf
}

export type IntOption = {
  kind: 'int'
  labelKey: string
  min: number
  max: number
  default: number
  hidden?: true
  showIf?: ShowIf
}

export type SelectOption<T extends string | number> = {
  kind: 'select'
  labelKey: string
  /** `hintKey`: one line under the control on what the chosen value means */
  choices: readonly { value: T; labelKey: string; hintKey?: string }[]
  default: T
  hidden?: true
  showIf?: ShowIf
}

/**
 * e10-t08: a short text a host gives, such as a kart track made in the editor (its code). `pattern`
 * and `maxLength` are checked wherever options are (shared/games/options.ts); `check`, set only on
 * the Worker's copy of the schema (the module's), checks the rest, so that what it needs stays out
 * of the browser's first load. A value that fails either is replaced by the default. `control`
 * names the control the waiting room draws for it (src/components/optionControls.ts); without one
 * it is a plain text box
 */
export type TextOption = {
  kind: 'text'
  labelKey: string
  default: string
  maxLength: number
  pattern: RegExp
  check?: (value: string) => boolean
  control?: string
  hidden?: true
  showIf?: ShowIf
}

/** Any one field, whatever its value's type */
export type AnyOptionField =
  BooleanOption | IntOption | SelectOption<string> | SelectOption<number> | TextOption

export type OptionField<T> = [T] extends [boolean]
  ? BooleanOption
  : [T] extends [number]
    ? IntOption | SelectOption<T>
    : [T] extends [string]
      ? // Any string at all may be typed in (TextOption); a set of them is chosen from
        [string] extends [T]
        ? SelectOption<T> | TextOption
        : SelectOption<T>
      : AnyOptionField

/**
 * The rule options a host can set: one field per key of `O`, from which the room form is generated
 * and the host's choices are checked (shared/games/options.ts). An empty object for a game with
 * none. `O` must be a `type` alias of booleans, numbers and strings.
 */
export type OptionsSchema<O> = { [K in keyof O]: OptionField<O[K]> }

// ── Timers ───────────────────────────────────────────────────────────────────────────────────

/**
 * A countdown the current state asks for. A module cannot read a clock, so it only says how long
 * and what then; the room keeps the time:
 *
 * - An `id` that appears in `timers(state)` starts counting then, and an id that disappears is
 *   cancelled. A timer in both the old and the new state keeps running, so put the phase in the id
 *   (`clue-3`) when a later phase needs a fresh countdown.
 * - When it runs out, the room applies `action` through `reduce` with `actor: 'system'`, like any
 *   other action. That is the only way time changes a game.
 */
export type TimerSpec<A> = {
  id: string
  ms: number
  action: A
}

// ── The end of a game ────────────────────────────────────────────────────────────────────────

/** One seat's line on the results screen */
export type Standing = {
  seat: SeatId
  /** 1 is best; tied seats share a rank. In a co-operative game everyone shares one */
  rank: number
  /** Null for a game that does not keep score */
  score: number | null
  /** The one sentence about this seat */
  note: TextRef
}

export type GameResult = {
  /** One line about the whole game (who won, or, co-operatively, whether the table won) */
  summary: TextRef
  /** Every seat exactly once, best first */
  standings: Standing[]
}

// ── The module ───────────────────────────────────────────────────────────────────────────────

export type GameMeta = {
  minPlayers: number
  maxPlayers: number
  /** A typical game's length, for the lobby card */
  minutes: number
  /** Prefix of the module's strings, `games.<id>`; `.name` and `.summary` under it must exist */
  i18nKey: `games.${string}`
  /** Left out of the lobby (a template, not something to play); rooms can still be made for it */
  unlisted?: true
  /**
   * The host may have the room play a random legal action for an absent seat. Only for a game
   * without decisions that matter: nobody should lose a game to a coin flip they did not ask for.
   */
  proxyTurns?: true
  /**
   * A page to play alone, linked from the lobby card as `<i18nKey>.tryAlone` (the kart's time
   * trial, 2026-11-14)
   */
  tryAlone?: string
}

/**
 * One turn-based game. `S` is the full state (server only), `A` an action, `V` what one viewer sees
 * and `O` the rule options.
 *
 * These are method signatures on purpose, not function-typed properties: method parameters compare
 * bivariantly, which lets every module be stored as an `AnyGameModule` in the registry without
 * casts or `any`.
 */
export interface GameModule<
  S extends JsonValue,
  A extends JsonValue,
  V extends JsonValue,
  O extends OptionValues,
> {
  /** Stable forever: rooms, results and replays refer to it */
  id: string
  meta: GameMeta
  options: OptionsSchema<O>

  /**
   * The first state. `seats` has between minPlayers and maxPlayers entries (the platform checks).
   * The module gets `options` only here: copy into the state whatever later turns need.
   */
  init(seats: readonly Seat[], options: O, rng: Rng): S

  /**
   * The next state, or `gameError(key)` to refuse. Decides everything about whether the action is
   * allowed, including a game already over: see rule 5 at the top of this file. Dice and shuffles
   * come from `rng`; if the action is refused the platform throws away whatever `rng` produced.
   */
  reduce(state: S, action: A, actor: Actor, rng: Rng): S | GameError

  /**
   * What `viewer` may see: see rule 4 at the top of this file. Called for every seat and for
   * `spectator` after every change, so it must be cheap and must not throw in any state.
   */
  view(state: S, viewer: Viewer): V

  /**
   * What `seat` can do right now, for the browser's buttons and for the harness; empty when it is
   * someone else's turn or the game is over. List every action when there are finitely many. When
   * the choice is free-form (a clue's text, a dial's angle) list a few samples: `reduce` must
   * accept each, and the browser asks for the actual value itself. Whatever is listed for one seat
   * and not for another, `reduce` must refuse from that other seat.
   */
  legalActions(state: S, seat: SeatId): A[]

  /** Once true it stays true, and `legalActions` is empty for everyone */
  isOver(state: S): boolean

  /** Only called once `isOver(state)` */
  result(state: S): GameResult

  /** The countdowns this state asks for; leave out for a game with no clock. See `TimerSpec` */
  timers?(state: S): TimerSpec<A>[]

  /**
   * The action, applied with `actor: 'system'`, that passes `seat`'s turn when the player is gone;
   * leave out, or answer null, when this game has no such thing. Only asked while
   * `legalActions(state, seat)` is not empty. `reduce` must accept it.
   */
  skipAction?(state: S, seat: SeatId): A | null

  /**
   * With `meta.proxyTurns`: the actions covering for an absent `seat` may pick from at random, when
   * that should be fewer than `legalActions` (promotion's full edition rolls for a seat but answers
   * its decisions with the default). Leaving it out means all of `legalActions`.
   */
  proxyActions?(state: S, seat: SeatId): A[]

  /** Whether the room's chat is closed in this state; leaving it out means never */
  chatLocked?(state: S): boolean

  /**
   * A real-time game's extra half (e2-t11, the kart): binary frames from the seats, passed on to
   * everyone else and judged in memory. Leave out for a turn-based game. See `RealtimeModule`
   */
  realtime?: RealtimeModule<S, A>

  /**
   * Computer seats (2026-11-17, the kart; shared/protocol.ts 14.): the levels the host may add one
   * at, and the names the room gives them in turn (ids: the browser shows them through the game's
   * strings). Leave out for a game without them. The computer's moves come from the host's browser
   * and are judged like anyone's; with a real-time game, `realtime.abandon` says what happens to
   * them when the host goes
   */
  bots?: { levels: readonly string[]; names: readonly string[] }
}

/**
 * The real-time half of a game (e2-t11, docs/ARCHITECTURE.md §4.14). Each browser simulates its own
 * kart and sends its state many times a second as a small binary frame. Those frames never go
 * through `reduce`: storing and diffing twenty a second per player would cost far too much. The room
 * passes each one on to everyone else at once, and hands it here first, so that the module can judge
 * it against the game's own state (in order checkpoints, a lap, a finish) and answer with actions.
 * Those go through `reduce` as `actor: 'system'` like a timer's, so the stored log still replays
 * the game.
 *
 * `memory` is the module's scratch space for this game, kept by the room in memory only: it is new
 * for each game, and lost if the Durable Object is evicted, so it must be rebuildable from the next
 * frames and the state. It is the only place a module may keep anything between calls.
 *
 * `now` is the server's clock (ms since the epoch): the one thing a module never gets elsewhere.
 */
export interface RealtimeModule<S extends JsonValue, A extends JsonValue> {
  /** Fresh scratch space for a new game */
  memory(): RealtimeMemory
  /**
   * One binary frame from `seat`. `relay`: the bytes everyone else gets (the room puts the seat in
   * front), or null to drop the frame. `actions`: applied in order as `system`
   */
  frame(
    state: S,
    memory: RealtimeMemory,
    seat: SeatId,
    data: Uint8Array,
    now: number,
  ): { relay: Uint8Array | null; actions: A[] }
  /**
   * After every change: actions that need the clock (the kart's start time), applied as `system`.
   * Must eventually answer none, or the room would go round for ever (it stops after a few)
   */
  clock?(state: S, now: number): A[]
  /**
   * Nobody will send frames for `seats` any more (2026-11-17: computer seats, when the host who ran
   * them goes): the actions that settle it (the kart retires them), applied as `system`
   */
  abandon?(state: S, seats: readonly SeatId[], now: number): A[]
}

/** A real-time module's scratch space: plain data or not, it never leaves the room's memory */
export type RealtimeMemory = Record<string, unknown>

/** A game's options as the room's form has them (shared/games/<id>/info.ts): no rules, and no lobby card (lobby.ts) */
export type GameInfo<O extends OptionValues = OptionValues> = {
  id: string
  options: OptionsSchema<O>
}

/** Any game's info, with its own option types forgotten */
export type AnyGameInfo = GameInfo<OptionValues>

/** Any module, with its own types forgotten: what the registry and the room hold */
export type AnyGameModule = GameModule<JsonValue, JsonValue, JsonValue, OptionValues>

/**
 * What one viewer gets from `projectGame` (shared/games/match.ts): `RoomView.game` in the protocol.
 * It is diffed and sent as a whole, so everything in it must be safe for this viewer to see.
 */
export type GameProjection<A extends JsonValue = JsonValue, V extends JsonValue = JsonValue> = {
  view: V
  /** The buttons to show; always empty for a spectator */
  legal: A[]
  over: boolean
  /** Null until `over` */
  result: GameResult | null
  chatLocked: boolean
}
