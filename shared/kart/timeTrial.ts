// e8-t10 (AC-8.4): a time trial on a track, a step at a time, on top of course.ts's run. Pure.
//
// The countdown holds the car on the grid; the clock starts at "GO" and laps come from the finish
// line crossings course.ts counts in order (so cutting the course or going round backwards counts
// nothing). The car starts behind the line and lap 1 is timed from GO, its run-up included, so the
// laps add up to the total; crossing the line for the (laps + 1)th time finishes. Driving the wrong way is warned about, not punished: the gates
// already refuse to count it.
//
// The start boost (2026-11-14, owner): press the throttle in the last `startWindow` seconds before
// GO and hold it, and the car leaves the grid with a boost; hold it from earlier than that and the
// engine bogs down for a moment instead. Letting go and pressing again inside the window still counts.
import { resetRun, startRun, stepRun, type Course, type Run } from './course.ts'
import {
  DEFAULT_RULES,
  KART_TUNING,
  STEP_SECONDS,
  type KartInput,
  type KartRules,
  type KartTuning,
} from './physics.ts'
import { roadDirection, type RoadPoint } from './track.ts'

/** 3, 2, 1, then GO */
export const COUNTDOWN_SECONDS = 3
/** Going against the road at least this fast, for this long, is going the wrong way */
export const WRONG_WAY_SPEED = 3
export const WRONG_WAY_SECONDS = 1
/** How much against the road: the direction of travel is more than ~110° from the road's */
const WRONG_WAY_DOT = -0.35

export type TrialPhase = 'countdown' | 'racing' | 'finished'

/** How the car left the grid: nothing special, a start boost, or a stall from a jump start */
export type TrialStart = 'none' | 'boost' | 'stall'

export interface Trial {
  readonly phase: TrialPhase
  readonly run: Run
  /** Seconds of countdown left while counting down */
  readonly countdown: number
  /** Race time since GO, in steps, so that every lap adds up exactly */
  readonly steps: number
  /** Each finished lap's time, in steps */
  readonly laps: readonly number[]
  /** The race time when the current lap began, in steps */
  readonly lapStartedAt: number
  /** Seconds spent going the wrong way, and whether that is long enough to say so */
  readonly wrongSeconds: number
  readonly wrongWay: boolean
  /** While counting down with the throttle held: the countdown left when it was pressed */
  readonly startPress: number | null
  /** Settled at GO */
  readonly start: TrialStart
}

export interface TrialCourse extends Course {
  readonly checkpoints: NonNullable<Course['checkpoints']>
  /** The centre line, to tell which way is forward */
  readonly road: readonly RoadPoint[]
}

const IDLE: KartInput = { throttle: false, brake: false, steer: 0, drift: false, boost: false }

export function startTrial(course: TrialCourse): Trial {
  return {
    phase: 'countdown',
    run: startRun(course),
    countdown: COUNTDOWN_SECONDS,
    steps: 0,
    laps: [],
    lapStartedAt: 0,
    wrongSeconds: 0,
    wrongWay: false,
    startPress: null,
    start: 'none',
  }
}

/** How a throttle pressed with `pressedAt` seconds of countdown left, and held to GO, starts */
export function startFrom(pressedAt: number | null, tuning: KartTuning): TrialStart {
  if (pressedAt === null) return 'none'
  return pressedAt <= tuning.startWindow + 1e-9 ? 'boost' : 'stall'
}

/** Seconds, from steps */
export const seconds = (steps: number): number => steps * STEP_SECONDS

/** The road point nearest (x, z): which part of the track the car is on */
export function nearestRoadPoint(road: readonly RoadPoint[], x: number, z: number): number {
  let best = 0
  let bestDistance = Infinity
  road.forEach((point, index) => {
    const distance = (point.x - x) ** 2 + (point.z - z) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  })
  return best
}

/** Whether the car is moving against the road where it is */
export function goingBackwards(
  road: readonly RoadPoint[],
  x: number,
  z: number,
  vx: number,
  vz: number,
): boolean {
  const speed = Math.hypot(vx, vz)
  if (speed < WRONG_WAY_SPEED) return false
  const { dx, dz } = roadDirection(road, nearestRoadPoint(road, x, z))
  return (vx * dx + vz * dz) / speed < WRONG_WAY_DOT
}

/** One step of 1/60 s */
export function stepTrial(
  trial: Trial,
  input: KartInput,
  course: TrialCourse,
  tuning: KartTuning = KART_TUNING,
  rules: KartRules = DEFAULT_RULES,
): Trial {
  if (trial.phase === 'finished') {
    // The car rolls to a stop on its own; nothing counts any more
    return { ...trial, run: stepRun(trial.run, { ...IDLE, brake: true }, course, tuning, rules) }
  }
  if (trial.phase === 'countdown') {
    // Held on the grid; only the throttle counts, for the start boost. When it was pressed is the
    // countdown left at that step, before it runs down
    const startPress = input.throttle ? (trial.startPress ?? trial.countdown) : null
    const countdown = trial.countdown - STEP_SECONDS
    if (countdown > 1e-9) return { ...trial, countdown, startPress }
    const start = startFrom(startPress, tuning)
    const kart = trial.run.kart
    const launched =
      start === 'boost'
        ? {
            ...kart,
            boostSeconds: tuning.startBoostDuration,
            chainWindow: tuning.startBoostDuration + tuning.chainGrace,
            throttleHeld: true,
          }
        : start === 'stall'
          ? { ...kart, stallSeconds: tuning.startStallSeconds, throttleHeld: true }
          : kart
    return {
      ...trial,
      phase: 'racing',
      countdown: 0,
      startPress: null,
      start,
      run: { ...trial.run, kart: launched },
    }
  }

  const run = stepRun(trial.run, input, course, tuning, rules)
  const steps = trial.steps + 1
  let { laps, lapStartedAt } = trial
  // A finish line crossing ends the lap before it; the first only starts lap 1, timed from GO
  if (run.crossings > trial.run.crossings && run.crossings >= 2) {
    laps = [...laps, steps - lapStartedAt]
    lapStartedAt = steps
  }
  const backwards = goingBackwards(course.road, run.kart.x, run.kart.z, run.kart.vx, run.kart.vz)
  const wrongSeconds = backwards ? trial.wrongSeconds + STEP_SECONDS : 0
  const finished = laps.length >= course.checkpoints.laps
  return {
    phase: finished ? 'finished' : 'racing',
    run,
    countdown: 0,
    steps,
    laps,
    lapStartedAt,
    wrongSeconds,
    wrongWay: wrongSeconds >= WRONG_WAY_SECONDS - 1e-9,
    startPress: null,
    start: trial.start,
  }
}

/** Back to the grid for another go, the countdown again */
export const restartTrial = (course: TrialCourse): Trial => startTrial(course)

/** A reset during the race: back to the last gate, the clock running on */
export const resetTrial = (trial: Trial): Trial =>
  trial.phase === 'racing'
    ? { ...trial, run: resetRun(trial.run), wrongSeconds: 0, wrongWay: false }
    : trial

/** The lap now being driven, from 1 (lap 1 from GO, before the line too) */
export const currentLap = (trial: Trial): number =>
  trial.phase === 'finished' ? trial.laps.length : Math.max(1, trial.laps.length + 1)

/** The time on the current lap so far, in steps */
export const lapSteps = (trial: Trial): number => trial.steps - trial.lapStartedAt

/** The fastest finished lap, in steps; null before any */
export const bestLap = (trial: Trial): number | null =>
  trial.laps.length === 0 ? null : Math.min(...trial.laps)

/** "1:02.345" */
export function formatTime(totalSeconds: number): string {
  const millis = Math.max(0, Math.round(totalSeconds * 1000))
  const minutes = Math.floor(millis / 60_000)
  const rest = millis - minutes * 60_000
  const secondsPart = Math.floor(rest / 1000)
  return `${minutes}:${String(secondsPart).padStart(2, '0')}.${String(rest % 1000).padStart(3, '0')}`
}
