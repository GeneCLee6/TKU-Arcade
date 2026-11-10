import { useEffect, useState } from 'react'
import type { LastRoll, PromotionPlayer } from '../../../shared/games/promotion/types.ts'
import { playCue } from '../../lib/sound.ts'

/** How long the top spins or the dice tumble */
export const ROLL_MS = 1100
/** How long the piece is in the air */
export const MOVE_MS = 650

export type PlaybackStage = 'idle' | 'rolling' | 'moving'

export interface Playback {
  /** Every roll in the game so far: `last` says what the latest was, this says that there is a new one */
  count: number
  stage: PlaybackStage
}

/** How many rolls there have been. Rises by one with each roll, and only then: a pass moves nothing */
export const rollCount = (players: readonly PromotionPlayer[]): number =>
  players.reduce((sum, player) => sum + player.rolls, 0)

/**
 * What a new `view` means for the animation. Only a roll made while this person was watching plays:
 * joining, reconnecting past several rolls and a rematch's reset all just show where things stand.
 * Fast play is never queued: a newer roll replaces whatever was still playing.
 */
export function nextPlayback(
  current: Playback,
  count: number,
  last: LastRoll | null,
  reducedMotion: boolean,
): Playback {
  if (count === current.count) return current
  const played = count === current.count + 1 && last !== null && !reducedMotion
  return { count, stage: played ? 'rolling' : 'idle' }
}

/**
 * Plays each new roll: the top or dice first, then the piece's flight, then the landing. It only
 * times what is drawn: `view` already holds where everything is, and the room never waits for this.
 * Sound does not move, so it plays with reduced motion too.
 */
export function useRollPlayback(
  players: readonly PromotionPlayer[],
  last: LastRoll | null,
  over: boolean,
  reducedMotion: boolean,
): Playback {
  const count = rollCount(players)
  const [playback, setPlayback] = useState<Playback>({ count, stage: 'idle' })

  // During render, as React asks for state that follows a prop: no frame shows the piece already moved
  const next = nextPlayback(playback, count, last, reducedMotion)
  if (next !== playback) setPlayback(next)

  useEffect(() => {
    if (next.stage === 'rolling') {
      playCue('roll')
      const timer = setTimeout(() => setPlayback({ count: next.count, stage: 'moving' }), ROLL_MS)
      return () => clearTimeout(timer)
    }
    if (next.stage === 'moving') {
      playCue(last?.face === 'zang' ? 'demote' : 'move')
      const timer = setTimeout(() => setPlayback({ count: next.count, stage: 'idle' }), MOVE_MS)
      return () => clearTimeout(timer)
    }
    return undefined
    // `last` changes only together with the count
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next.count, next.stage])

  // The landing: after a flight, or at once when there was none to watch
  const [landed, setLanded] = useState(count)
  useEffect(() => {
    if (next.stage !== 'idle' || next.count === landed) return
    setLanded(next.count)
    if (next.count < landed || last === null) return
    playCue(over ? 'win' : 'land')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next.count, next.stage])

  return next
}
