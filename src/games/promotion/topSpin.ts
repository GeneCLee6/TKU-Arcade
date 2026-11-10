// The four-sided top's angle: face `index` of FACES is at the front when the top is turned to
// -90 × index degrees

/** An angle as a share of one turn, 0 to 359 */
export const turn = (angle: number) => ((angle % 360) + 360) % 360

/**
 * The angle that brings face `index` to the front, `turns` whole turns on from `from` or more,
 * always the same way round
 */
export function spunTo(from: number, index: number, turns: number): number {
  const base = from - 360 * turns
  return base - turn(base + 90 * index)
}
