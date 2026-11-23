import { describe, expect, it } from 'vitest'
import { KART_IDS } from '../../shared/kart/karts.ts'
import { RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import * as lists from '../../src/achievements/kartLists.ts'
import { CHALLENGE_KEY } from '../../src/kart/challenge/store.ts'
import { CHAPTER_IDS, missionsOf } from '../../src/kart/challenge/missions.ts'
import { CUP_IDS } from '../../src/kart/cup/cups.ts'
import { LESSON_IDS } from '../../src/kart/school/lessons.ts'

// The achievements copy these (kartLists.ts says why): a new kart, track, cup, lesson or mission
// must be copied there too, or its achievement could never unlock
describe('the kart lists the achievements keep', () => {
  it('match the kart’s own', () => {
    expect(lists.KART_IDS).toEqual(KART_IDS)
    expect(lists.RACE_TRACK_IDS).toEqual(RACE_TRACK_IDS)
    expect(lists.CUP_IDS).toEqual(CUP_IDS)
    expect(lists.LESSON_IDS).toEqual(LESSON_IDS)
    expect(lists.CHAPTER_IDS).toEqual(CHAPTER_IDS)
    for (const chapter of CHAPTER_IDS) {
      expect(lists.CHAPTER_MISSIONS[chapter]).toEqual(missionsOf(chapter).map((mission) => mission.id))
    }
    expect(lists.KART_KEYS.challenge).toBe(CHALLENGE_KEY)
  })

  it('the kart’s stores say when they change', async () => {
    const heard: string[] = []
    const listener = () => heard.push('changed')
    window.addEventListener(lists.KART_PROGRESS_EVENT, listener)
    const { saveStars } = await import('../../src/kart/challenge/store.ts')
    const { saveResult } = await import('../../src/kart/school/store.ts')
    const { keepCupBest } = await import('../../src/kart/cup/store.ts')
    saveStars('clean', 2)
    saveResult('drive', 3)
    keepCupBest('ebb', { place: 1, points: 40 })
    window.removeEventListener(lists.KART_PROGRESS_EVENT, listener)
    localStorage.clear()
    expect(heard).toHaveLength(3)
  })
})
