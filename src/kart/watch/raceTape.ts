// The recording itself (e9-t10), a lazy chunk of its own (2026-11-22, docs/KART-PERF.md): the frame
// format and the replay's recorder are not on the race room's first screen. The room's
// useRaceRecorder (src/games/kart/useRaceRecorder.ts) keeps what comes before this chunk arrives and
// hands it over in order.
import type { KartView } from '../../../shared/games/kart/types.ts'
import { decodeFrame, readRelayed } from '../../../shared/kart/net.ts'
import { createReplayRecorder, type Replay } from '../../../shared/kart/replay.ts'

export interface RaceTape {
  /** Something that came in on the room's channel: a relayed frame is kept, anything else is not */
  heard(data: Uint8Array): void
  /** Something this browser sent: its own kart's frame is kept */
  sent(seat: number, data: Uint8Array): void
  view(view: KartView): void
  hasFrames(): boolean
  replay(): Replay
}

export function createRaceTape(first: KartView): RaceTape {
  const recorder = createReplayRecorder(first)
  return {
    heard(data) {
      const relayed = readRelayed(data)
      if (relayed) recorder.frame(relayed.seat, relayed.frame)
    },
    sent(seat, data) {
      const frame = decodeFrame(data)
      if (frame) recorder.frame(seat, frame)
    },
    view: (view) => recorder.view(view),
    hasFrames: () => recorder.hasFrames(),
    replay: () => recorder.replay(),
  }
}
