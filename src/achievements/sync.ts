// 2026-11-23 (e11-t06, docs/ARCHITECTURE.md §4.82): the kart's progress, read from what the kart
// already keeps (challenge medals and missions, school stars, cup bests, best runs), as one event. The
// engine reads it on its first event of a visit and whenever the kart says a store changed
// (KART_PROGRESS_EVENT), so a medal won before achievements existed unlocks its badge too. Read
// straight from localStorage (kartLists.ts says why), and as warily as the kart's own stores do.
import { readStored } from '../lib/storage.ts'
import type { KartProgressEvent } from './events.ts'
import { CHAPTER_IDS, CHAPTER_MISSIONS, CUP_IDS, KART_IDS, KART_KEYS } from './kartLists.ts'

type Json = Record<string, unknown>
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function readJson(key: string): Json {
  try {
    const value: unknown = JSON.parse(readStored(key) ?? 'null')
    return isObject(value) ? value : {}
  } catch {
    return {}
  }
}

/** Every key localStorage has; none when it cannot be reached */
function storedKeys(): string[] {
  try {
    const storage = window.localStorage
    const keys: string[] = []
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (key !== null) keys.push(key)
    }
    return keys
  } catch {
    return []
  }
}

const KARTS: ReadonlySet<string> = new Set(KART_IDS)

export function readKartProgress(): KartProgressEvent {
  const challenge = readJson(KART_KEYS.challenge)
  const medals = Object.values(isObject(challenge.medals) ? challenge.medals : {})
  const stars = isObject(challenge.stars) ? challenge.stars : {}
  const passed = (mission: string) => [1, 2, 3].includes(stars[mission] as number)
  const school = readJson(KART_KEYS.school)
  const tracks = new Set<string>()
  const karts = new Set<string>()
  for (const key of storedKeys()) {
    // A record's track is its id without `@revision`
    if (key.startsWith(KART_KEYS.bestRun)) tracks.add(key.slice(KART_KEYS.bestRun.length).split('@')[0]!)
    else if (key.startsWith(KART_KEYS.kartBestRun)) {
      const kart = key.slice(KART_KEYS.kartBestRun.length).split('.')[0]!
      if (KARTS.has(kart)) karts.add(kart)
    }
  }
  return {
    type: 'kart.progress',
    gold: medals.filter((medal) => medal === 'gold' || medal === 'platinum').length,
    platinum: medals.filter((medal) => medal === 'platinum').length,
    school: Object.keys(school).filter((lesson) => school[lesson] === 3),
    chapters: CHAPTER_IDS.filter((chapter) => CHAPTER_MISSIONS[chapter].every(passed)),
    cups: CUP_IDS.filter((cup) => readJson(`${KART_KEYS.cupBest}${cup}`).place === 1),
    tracks: [...tracks],
    karts: [...karts],
  }
}
