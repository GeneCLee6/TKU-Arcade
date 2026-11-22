// e9-t10: records the race this browser sees, for the replay after it (shared/kart/replay.ts). It
// sits under the race screen, so it keeps recording from the grid to the result whatever is drawn
// (racing, watching, the standings): every frame relayed to this socket, and this kart's own on
// their way out. A new race (a new seed) starts a new recording. No three.js here: this is part of
// the screen's own chunk. The recording itself (the frame format, the recorder) is a lazy chunk of
// its own (src/kart/watch/raceTape.ts, 2026-11-22): what comes before it arrives waits here, in order.
import { useEffect, useMemo, useState } from 'react'
import type { KartView } from '../../../shared/games/kart/types.ts'
import type { Replay } from '../../../shared/kart/replay.ts'
import type { RoomRealtime } from '../../lib/useRoom.ts'
import type { RaceTape } from '../../kart/watch/raceTape.ts'

export interface RaceRecorder {
  /** Whether there is anything to watch (nothing until the recording's chunk has arrived) */
  hasFrames(): boolean
  /** The race so far; only once hasFrames() */
  replay(): Replay
  /** Settles once the recording's chunk is in and everything before it is recorded (the tests) */
  readonly ready: Promise<void>
}

export interface RaceRecording {
  recorder: RaceRecorder
  /** The room's channel with this kart's own frames recorded as they go: the race view sends on it */
  realtime: RoomRealtime | undefined
}

interface DeferredRecorder extends RaceRecorder {
  heard(data: Uint8Array): void
  sent(seat: number, data: Uint8Array): void
  view(view: KartView): void
}

// Far more than a race's grid sends before a small chunk arrives; past it the oldest are let go
const MAX_WAITING = 20_000

function deferredRecorder(first: KartView): DeferredRecorder {
  let tape: RaceTape | null = null
  let failed = false
  let waiting: ((tape: RaceTape) => void)[] = []
  const run = (call: (tape: RaceTape) => void) => {
    if (tape) call(tape)
    else if (!failed) {
      waiting.push(call)
      if (waiting.length > MAX_WAITING) waiting.shift()
    }
  }
  const ready = import('../../kart/watch/raceTape.ts').then(
    ({ createRaceTape }) => {
      const made = createRaceTape(first)
      for (const call of waiting) call(made)
      waiting = []
      tape = made
    },
    () => {
      // No replay of this race (offline, a newer deployment): the race itself goes on
      failed = true
      waiting = []
    },
  )
  return {
    heard: (data) => run((one) => one.heard(data)),
    sent: (seat, data) => run((one) => one.sent(seat, data)),
    view: (view) => run((one) => one.view(view)),
    hasFrames: () => tape?.hasFrames() ?? false,
    replay: () => {
      if (!tape) throw new Error('No recording yet')
      return tape.replay()
    },
    ready,
  }
}

export function useRaceRecorder(view: KartView, realtime: RoomRealtime | undefined): RaceRecording {
  // One recording per race (a rematch is a new seed): the view of the moment it starts is its first
  const [made, setMade] = useState(() => ({ seed: view.seed, recorder: deferredRecorder(view) }))
  if (made.seed !== view.seed) setMade({ seed: view.seed, recorder: deferredRecorder(view) })
  const recorder = made.recorder
  const seat = view.you

  useEffect(() => {
    if (!realtime) return
    return realtime.listen((data) => recorder.heard(data))
  }, [realtime, recorder])

  useEffect(() => {
    recorder.view(view)
  }, [recorder, view])

  const recording = useMemo<RoomRealtime | undefined>(
    () =>
      realtime && {
        send(data) {
          if (seat !== null) recorder.sent(seat, data)
          return realtime.send(data)
        },
        listen: realtime.listen,
      },
    [realtime, recorder, seat],
  )

  return { recorder, realtime: recording }
}
