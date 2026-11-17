// A cup's trophy's shape from its id (Trophy.tsx draws it; docs/ARCHITECTURE.md §4.23). Pure.

/** A small stable number from a string (FNV-1a) */
function hashOf(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/** The trophy's shape, from the cup: pure, for the tests */
export function trophyShape(cup: string, races: number) {
  const hash = hashOf(cup)
  return {
    /** Half the rim's width, of the 120 wide picture */
    rim: 26 + (hash % 4) * 3,
    bands: 1 + ((hash >>> 2) % 3),
    starPoints: 5 + ((hash >>> 4) % 4),
    steps: Math.max(1, Math.min(4, races)),
  }
}
