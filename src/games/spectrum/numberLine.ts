// The reveal's sums, kept apart from its looks so that they can be tested without a browser.
import type { SeatId } from '../../../shared/games/types.ts'
import type { SpectrumAnswererView, SpectrumReveal } from '../../../shared/games/spectrum/types.ts'

/** What the guesser said about one answer: the largest, the smallest, or a place in the order */
export type GuessPick = 'max' | 'min' | number | null

/** One answer on the line */
export type NumberLineMark = {
  seat: SeatId
  name: string
  /** Null for an answerer who sat the round out */
  text: string | null
  number: number
  pick: GuessPick
  /** Null when the guess said nothing of this answer, or there was no guess */
  correct: boolean | null
  /** A full order put it one place off: half the points (2026-11-14) */
  close: boolean
}

/** How many numbers apart two marks must be to share a lane: a mark is this many steps wide */
export const LANE_GAP = 3

/** Where on the line, from 0 (the 1 end) to 1 (the 10 end) */
export const position = (value: number): number => (Math.min(10, Math.max(1, value)) - 1) / 9

/** Lowest number first; equal numbers in seat order, as the line shows them */
export const lineOrder = (marks: readonly NumberLineMark[]): NumberLineMark[] =>
  [...marks].sort((a, b) => a.number - b.number || a.seat - b.seat)

/**
 * The lane each mark sits in, 0 being the one nearest the line, in `lineOrder`: a mark takes the
 * nearest lane where it is at least `LANE_GAP` numbers from the one before it, so no two overlap.
 */
export function lanes(ordered: readonly NumberLineMark[]): number[] {
  const last: number[] = []
  return ordered.map((mark) => {
    const free = last.findIndex((number) => mark.number - number >= LANE_GAP)
    const lane = free < 0 ? last.length : free
    last[lane] = mark.number
    return lane
  })
}

/** The marks for a revealed round: every answer, with what the guess said of it */
export function revealMarks(
  answerers: readonly SpectrumAnswererView[],
  reveal: SpectrumReveal,
  nameOf: (seat: SeatId) => string,
): NumberLineMark[] {
  const { guess } = reveal
  return answerers
    .filter((answerer) => answerer.number !== null)
    .map((answerer) => {
      let pick: GuessPick = null
      if (guess?.kind === 'extremes') {
        pick = guess.max === answerer.seat ? 'max' : guess.min === answerer.seat ? 'min' : null
      } else if (guess?.kind === 'order') {
        const place = guess.seats.indexOf(answerer.seat)
        pick = place < 0 ? null : place + 1
      }
      return {
        seat: answerer.seat,
        name: nameOf(answerer.seat),
        text: answerer.status === 'out' ? null : answerer.text,
        number: answerer.number as number,
        pick,
        correct: pick === null ? null : reveal.correct.includes(answerer.seat),
        close: (reveal.close ?? []).includes(answerer.seat),
      }
    })
}
