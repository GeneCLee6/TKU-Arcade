// 2026-11-22 (#103): what the moving obstacles (shared/kart/obstacles.ts) say out loud to the kart
// coming to them: a level-crossing bell, two dings a beat while a boom ahead is warned of and while
// it is down, and a trolley's horn as a container ahead is about to slide. Only for obstacles in
// front of the kart, near enough to matter. Pure: spikeLoop.ts plays what this returns
// (itemSounds.ts has the sounds).
import { obstacleState, type Obstacle } from '../../shared/kart/obstacles.ts'

/** Obstacles further than this, metres, or behind the kart, are not heard */
export const CUE_REACH = 110
/** The bell rings this often while it rings, steps */
export const BELL_EVERY = 24

export type ObstacleCue = 'bell' | 'horn'

/** The cues for the step from `before` to `tick`, for a kart at (x, z) */
export function obstacleCues(
  obstacles: readonly Obstacle[],
  before: number,
  tick: number,
  x: number,
  z: number,
): ObstacleCue[] {
  const cues: ObstacleCue[] = []
  for (const obstacle of obstacles) {
    const along = (x - obstacle.x) * obstacle.dx + (z - obstacle.z) * obstacle.dz
    if (along > 2 || Math.hypot(x - obstacle.x, z - obstacle.z) > CUE_REACH) continue
    const was = obstacleState(obstacle, before)
    const now = obstacleState(obstacle, tick)
    if (obstacle.json.kind === 'boom') {
      const ringing = now.warn || now.closed
      // The first ring as the warning starts, then one every BELL_EVERY steps while it lasts
      const start = ringing && !(was.warn || was.closed)
      const beat = ringing && Math.floor(tick / BELL_EVERY) !== Math.floor(before / BELL_EVERY)
      if ((start || beat) && !cues.includes('bell')) cues.push('bell')
    } else if (now.warn && !was.warn && !cues.includes('horn')) {
      cues.push('horn')
    }
  }
  return cues
}
