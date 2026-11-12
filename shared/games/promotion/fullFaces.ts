// The full edition's six faces and two cells everyone knows, apart from the board (boardFull.ts), so
// that the screen's first paint need not load the board's data (C8: the board loads after it).

/** The six results, best first: the priority order two pairs move in */
export const FULL_FACES = ['de', 'cai', 'gong', 'liang', 'rou', 'zang'] as const
export type FullFace = (typeof FULL_FACES)[number]

/** Which face each pip of a six-sided die is */
export const PIP_FACE: Readonly<Record<number, FullFace>> = {
  4: 'de',
  6: 'cai',
  5: 'gong',
  3: 'liang',
  2: 'rou',
  1: 'zang',
}

/** Where everyone stands before the birth roll */
export const FULL_START = 'baiding'
/** Dismissal (革職) */
export const DISMISSED = 'geizhi'
/** Where the best career ends */
export const FULL_TOP = 'dahe'
