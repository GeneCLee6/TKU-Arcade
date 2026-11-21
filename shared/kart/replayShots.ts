// The shots on the road during a replay (e9-t06b), apart from replay.ts so that the recorder a room's
// first screen runs does not bring the shots' paths with it (2026-11-21, docs/KART-PERF.md §7)
import { TICKS_PER_SECOND } from './replay.ts'
import { shotPosition, type KartShot, type ShotItem } from './shots.ts'

/**
 * The shots on the road at `tick` (e9-t06b), where each is; a cloud flies at its target's kart as
 * the replay has it (`kartAt`)
 */
export function shotsAt(
  shots: readonly KartShot[] | undefined,
  tick: number,
  kartAt: (seat: number) => { readonly x: number; readonly z: number } | null,
): { n: number; item: ShotItem; x: number; z: number }[] {
  const ms = (tick * 1000) / TICKS_PER_SECOND
  return (shots ?? [])
    .filter((shot) => ms >= shot.at && ms <= shot.until)
    .map((shot) => ({
      n: shot.n,
      item: shot.item,
      ...shotPosition(shot, ms, shot.target === null ? null : kartAt(shot.target)),
    }))
}
