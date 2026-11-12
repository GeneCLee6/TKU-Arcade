import { useEffect, useState } from 'react'
import type { FullLastTurn, FullPlayer } from '../../../../shared/games/promotion/types.ts'
import { playCue } from '../../../lib/sound.ts'

/** The dice tumbling, for each throw of a turn */
export const TUMBLE_MS = 750
/** A throw's dice and what they make, read before the next throw or the first move */
export const READ_MS = 900
/** One move: the piece in the air */
export const STEP_MS = 650
/** The silver changing hands, with its reasons */
export const PAY_MS = 2200

/**
 * One moment of a turn played out. `throw` and `read` are a throw (by its index in `throws`) tumbling
 * and then shown; `move` is the piece flying to `path[index]`; `pay` shows the turn's transfers
 */
export type Beat =
  | { kind: 'throw'; index: number }
  | { kind: 'read'; index: number }
  | { kind: 'move'; index: number }
  | { kind: 'pay' }

const DURATION: Record<Beat['kind'], number> = {
  throw: TUMBLE_MS,
  read: READ_MS,
  move: STEP_MS,
  pay: PAY_MS,
}

/** Every beat of a turn, in order: each throw, each move, then the silver if any moved */
export function beatsOf(last: FullLastTurn): Beat[] {
  const beats: Beat[] = []
  last.throws.forEach((_, index) => beats.push({ kind: 'throw', index }, { kind: 'read', index }))
  last.path.forEach((_, index) => beats.push({ kind: 'move', index }))
  if (last.transfers.length > 0) beats.push({ kind: 'pay' })
  return beats
}

export interface TurnPlayback {
  /** Every turn rolled in the game so far */
  count: number
  /** The beat on screen, or null once the latest turn is all shown */
  beat: Beat | null
  at: number
}

/** How many turns have been rolled: one more with each roll, none for a pass */
export const turnCount = (players: readonly FullPlayer[]): number =>
  players.reduce((sum, player) => sum + player.rolls, 0)

/**
 * What a new `view` means for the animation, as in the simple edition: only a turn rolled while this
 * person was watching plays; joining, reconnecting past several and a rematch just show where things
 * stand, and a newer turn replaces one still playing
 */
export function nextTurnPlayback(
  current: TurnPlayback,
  count: number,
  last: FullLastTurn | null,
  reducedMotion: boolean,
): TurnPlayback {
  if (count === current.count) return current
  const played = count === current.count + 1 && last !== null && !reducedMotion
  return { count, at: 0, beat: played ? (beatsOf(last)[0] ?? null) : null }
}

/**
 * Plays each new turn beat by beat: every throw (the dice, then what they make), every move, then the
 * silver. It only times what is drawn: `view` already holds where everything ends up, and the room
 * never waits for this. Sound plays with reduced motion too, once, at the landing.
 */
export function useTurnPlayback(
  players: readonly FullPlayer[],
  last: FullLastTurn | null,
  over: boolean,
  reducedMotion: boolean,
): TurnPlayback {
  const count = turnCount(players)
  const [playback, setPlayback] = useState<TurnPlayback>({ count, at: 0, beat: null })

  // During render, as React asks for state that follows a prop: no frame shows the end of a turn first
  const next = nextTurnPlayback(playback, count, last, reducedMotion)
  if (next !== playback) setPlayback(next)

  const kind = next.beat?.kind ?? null
  useEffect(() => {
    if (kind === null || last === null) return undefined
    if (kind === 'throw') playCue('roll')
    if (kind === 'move') {
      const step = next.beat?.kind === 'move' ? last.path[next.beat.index] : null
      playCue(step === 'geizhi' || step === 'changshu' ? 'demote' : 'move')
    }
    const beats = beatsOf(last)
    const timer = setTimeout(() => {
      const at = next.at + 1
      setPlayback({ count: next.count, at, beat: beats[at] ?? null })
    }, DURATION[kind])
    return () => clearTimeout(timer)
    // `last` changes only together with the count
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next.count, next.at, kind])

  // The landing: after the last beat, or at once when there was nothing to watch
  const [landed, setLanded] = useState(count)
  useEffect(() => {
    if (next.beat !== null || next.count === landed) return
    setLanded(next.count)
    if (next.count < landed || last === null) return
    playCue(over ? 'win' : 'land')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next.count, next.beat])

  return next
}
