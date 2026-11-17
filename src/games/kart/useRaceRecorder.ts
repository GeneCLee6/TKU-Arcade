// e9-t10: records the race this browser sees, for the replay after it (shared/kart/replay.ts). It
// sits under the race screen, so it keeps recording from the grid to the result whatever is drawn
// (racing, watching, the standings): every frame relayed to this socket, and this kart's own on
// their way out. A new race (a new seed) starts a new recording. No three.js here: this is part of
// the screen's own chunk.
import { useEffect, useMemo, useState } from 'react'
import type { KartView } from '../../../shared/games/kart/types.ts'
import { decodeFrame, readRelayed } from '../../../shared/kart/net.ts'
import { createReplayRecorder, type ReplayRecorder } from '../../../shared/kart/replay.ts'
import type { RoomRealtime } from '../../lib/useRoom.ts'

export interface RaceRecording {
  recorder: ReplayRecorder
  /** The room's channel with this kart's own frames recorded as they go: the race view sends on it */
  realtime: RoomRealtime | undefined
}

export function useRaceRecorder(view: KartView, realtime: RoomRealtime | undefined): RaceRecording {
  // One recording per race (a rematch is a new seed): the view of the moment it starts is its first
  const [made, setMade] = useState(() => ({
    seed: view.seed,
    recorder: createReplayRecorder(view),
  }))
  if (made.seed !== view.seed) setMade({ seed: view.seed, recorder: createReplayRecorder(view) })
  const recorder = made.recorder
  const seat = view.you

  useEffect(() => {
    if (!realtime) return
    return realtime.listen((data) => {
      const relayed = readRelayed(data)
      if (relayed) recorder.frame(relayed.seat, relayed.frame)
    })
  }, [realtime, recorder])

  useEffect(() => {
    recorder.view(view)
  }, [recorder, view])

  const recording = useMemo<RoomRealtime | undefined>(
    () =>
      realtime && {
        send(data) {
          const frame = seat === null ? null : decodeFrame(data)
          if (frame && seat !== null) recorder.frame(seat, frame)
          return realtime.send(data)
        },
        listen: realtime.listen,
      },
    [realtime, recorder, seat],
  )

  return { recorder, realtime: recording }
}
