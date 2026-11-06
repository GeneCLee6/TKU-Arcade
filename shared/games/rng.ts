// The seedable generator behind the `Rng` interface (shared/games/types.ts).
//
// mulberry32: the whole position is one 32-bit integer, so it fits next to the game state as a
// plain JSON number and `createRng(rng.state())` carries on exactly where it stopped, after a
// hibernation or in a replay. Changing this algorithm changes the game every stored replay plays
// back (tests/games/rng.test.ts pins its output).
//
// Not cryptographic: with at most 2^32 streams, someone who knew the algorithm could search for the
// seed from their own hole cards. Anti-cheat is a non-goal among friends (E2).
import type { Rng } from './types.ts'

const TWO_32 = 2 ** 32

/** An `Rng` the platform holds; modules only see the `Rng` part, so cannot store the position */
export interface SeededRng extends Rng {
  /** The position now, a uint32; pass it to `createRng` to continue from here */
  state(): number
}

/** A generator starting at `seed` (a seed and a saved position are the same thing) */
export function createRng(seed: number): SeededRng {
  let position = seed >>> 0

  const uint32 = (): number => {
    position = (position + 0x6d2b79f5) >>> 0
    let t = Math.imul(position ^ (position >>> 15), 1 | position)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return (t ^ (t >>> 14)) >>> 0
  }

  const int = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > TWO_32) {
      throw new RangeError(`Rng.int: bad bound ${maxExclusive}`)
    }
    // Rejection sampling: a plain `% n` would favour the low numbers
    const limit = TWO_32 - (TWO_32 % maxExclusive)
    let value = uint32()
    while (value >= limit) value = uint32()
    return value % maxExclusive
  }

  return {
    state: () => position,
    float: () => uint32() / TWO_32,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError('Rng.pick: empty array')
      return items[int(items.length)]
    },
    shuffle<T>(items: readonly T[]): T[] {
      const copy = [...items]
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(i + 1)
        const swapped = copy[i]
        copy[i] = copy[j]
        copy[j] = swapped
      }
      return copy
    },
  }
}
