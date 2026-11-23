// A race recorded as a browser would record it, for the broadcast's tests: karts driven along the
// middle of a track at steady speeds (raceDriver.ts), judged as the room judges them (their gates and
// laps), kept by the replay's recorder, with the hits and the finishes in the room's view.
import { judgeFrame, startTracking, type Tracked } from '../../shared/kart/race.ts'
import { createReplayRecorder, type RecordedView, type Replay } from '../../shared/kart/replay.ts'
import type { Track } from '../../shared/kart/track.ts'
import { driveFrames } from './raceDriver.ts'

export interface RaceHit {
  /** Race time, ms */
  readonly at: number
  readonly by: number
  readonly target: number
}

/**
 * `metres[seat]` a frame (20 frames a second) for each kart, `laps` laps; each kart keeps going a
 * couple of seconds past its finish, as a kart does
 */
export function recordRace(
  track: Track,
  laps: number,
  metres: readonly number[],
  hits: readonly RaceHit[] = [],
  /** Seconds each kart is late off the line (a slow start), none when left out */
  late: readonly number[] = [],
): Replay {
  const racers = metres.map((_, seat) => ({
    seat,
    item: null,
    lapMs: [] as number[],
    finishMs: null as number | null,
    out: false,
  }))
  const view = (): RecordedView => ({
    track: track.id,
    laps,
    mode: 'items',
    goAt: 0,
    racers: racers.map((racer) => ({ ...racer, lapMs: [...racer.lapMs] })),
    events: hits.map((hit, n) => ({
      n,
      item: 'cloud',
      by: hit.by,
      targets: [hit.target],
      blocked: [],
      at: hit.at,
      hit: true,
    })),
  })
  // The first view knows of no hits (it marks where the room's list starts)
  const recorder = createReplayRecorder({ ...view(), events: [] })
  metres.forEach((step, seat) => {
    const frames = driveFrames(track, seat, step, Math.round((late[seat] ?? 0) * 60))
    let tracked: Tracked = startTracking(track, seat)
    let lapsCounted = 0
    let lapStart = 0
    let doneAt: number | null = null
    const racer = racers[seat]!
    for (const frame of frames) {
      const now = (frame.tick / 60) * 1000
      if (doneAt !== null && now > doneAt + 2000) break
      if (now > 600_000) break
      const verdict = judgeFrame(tracked, frame, { track, slot: seat, now, goAt: 0, laps: lapsCounted })
      if (verdict.kind !== 'taken') continue
      tracked = verdict.tracked
      if (verdict.lapAt !== null && doneAt === null) {
        racer.lapMs.push(verdict.lapAt - lapStart)
        lapStart = verdict.lapAt
        lapsCounted++
        if (lapsCounted >= laps) {
          racer.finishMs = verdict.lapAt
          doneAt = verdict.lapAt
        }
      }
      recorder.frame(seat, {
        ...frame,
        crossings: tracked.crossings,
        nextGate: tracked.nextGate,
        finished: doneAt !== null,
      })
    }
  })
  recorder.view(view())
  return recorder.replay()
}
