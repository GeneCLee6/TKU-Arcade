import { afterEach, describe, expect, it } from 'vitest'
import { RACE_TRACK_IDS } from '../../shared/kart/tracks/list.ts'
import {
  charAt,
  chordDegrees,
  degreeMidi,
  degreeOf,
  drumsAt,
  dueSteps,
  FINAL_TEMPO,
  INTRO_CUTOFF,
  lengthAt,
  midiHz,
  mixFor,
  notesAt,
  OPEN_CUTOFF,
  RACE_CUTOFF,
  restartsOn,
  sectionFor,
  stepSeconds,
} from '../../src/kart/audio/sequencer.ts'
import {
  loadedSong,
  loadSong,
  SONG_IDS,
  songFor,
  TRACK_SONGS,
  type Song,
  type SongId,
} from '../../src/kart/audio/songs.ts'
import {
  DEFAULT_VOLUMES,
  forgetVolumesForTest,
  loadVolumes,
  parseVolumes,
  saveVolumes,
} from '../../src/kart/audio/volumes.ts'
import { ambienceFor, crowdLevel, CROWD_GONE, CROWD_NEAR, nextIn, TRACK_AMBIENCE } from '../../src/kart/audio/ambience.ts'

// 2026-11-21: each song is a lazy chunk (songs.ts); fetched here, all of them
const SONGS = Object.fromEntries(
  await Promise.all(SONG_IDS.map(async (id) => [id, await loadSong(id)] as const)),
) as Record<SongId, Song>


// 2026-11-20 (§4.46): the soundtrack's sequencer, its parts, the songs' data, the volumes, the ambience

describe('the parts of a song', () => {
  it('follows the race: intro on the grid, the band racing, more on the last lap, an ending, then the quiet song', () => {
    const at = (phase: 'none' | 'countdown' | 'racing' | 'finished', finalLap = false, celebrating = false) =>
      sectionFor({ phase, finalLap, celebrating })
    expect(at('countdown')).toBe('intro')
    expect(at('racing')).toBe('race')
    expect(at('racing', true)).toBe('final')
    expect(at('finished', false, true)).toBe('outro')
    expect(at('finished')).toBe('menu')
    expect(at('none')).toBe('menu')
  })

  it('opens the filter in a boost, closes it in the intro, speeds the last lap up and layers it', () => {
    expect(mixFor('race', false).cutoff).toBe(RACE_CUTOFF)
    expect(mixFor('race', true).cutoff).toBe(OPEN_CUTOFF)
    expect(mixFor('final', true).cutoff).toBe(OPEN_CUTOFF)
    expect(mixFor('intro', false).cutoff).toBe(INTRO_CUTOFF)
    expect(mixFor('intro', true).cutoff).toBe(INTRO_CUTOFF)
    expect(mixFor('final', false).tempo).toBe(FINAL_TEMPO)
    expect(mixFor('race', false).tempo).toBe(1)
    const final = mixFor('final', false).layers
    expect(final.leadHigh && final.hatDoubled).toBe(true)
    const intro = mixFor('intro', false).layers
    expect(intro.lead || intro.snare || intro.kick).toBe(false)
    expect(intro.pad && intro.kickOnOne && intro.bassOnBeat).toBe(true)
    expect(Object.values(mixFor('outro', false).layers).some(Boolean)).toBe(false)
  })

  it('starts again from the first bar at GO and at the last lap, not on a boost', () => {
    expect(restartsOn('intro', 'race')).toBe(true)
    expect(restartsOn('race', 'final')).toBe(true)
    expect(restartsOn('outro', 'menu')).toBe(true)
    expect(restartsOn('race', 'race')).toBe(false)
    expect(restartsOn('final', 'outro')).toBe(false)
  })
})

describe('the sequencer clock', () => {
  it('is a sixteenth of a beat a step, faster with the tempo', () => {
    expect(stepSeconds(120)).toBeCloseTo(0.125)
    expect(stepSeconds(120, 2)).toBeCloseTo(0.0625)
  })

  it('hands out every step before the horizon, once, in order', () => {
    const seconds = stepSeconds(120)
    const first = dueSteps({ step: 0, at: 10 }, 10.3, seconds, 0, 10)
    expect(first.steps.map((one) => one.step)).toEqual([0, 1, 2])
    expect(first.steps[1]!.at).toBeCloseTo(10.125)
    const second = dueSteps(first.next, 10.6, seconds, 0, 10.3)
    expect(second.steps.map((one) => one.step)).toEqual([3, 4])
    expect(second.next.step).toBe(5)
  })

  it('swings every second sixteenth late, but keeps the grid', () => {
    const seconds = stepSeconds(100)
    const { steps, next } = dueSteps({ step: 0, at: 0 }, seconds * 4, seconds, 0.2, 0)
    expect(steps[0]!.at).toBe(0)
    expect(steps[1]!.at).toBeCloseTo(seconds * 1.2)
    expect(steps[2]!.at).toBeCloseTo(seconds * 2)
    expect(next.at).toBeCloseTo(seconds * 4)
  })

  it('skips to now after a long stall instead of playing everything missed at once', () => {
    const { steps } = dueSteps({ step: 0, at: 0 }, 30.2, 0.1, 0, 30)
    expect(steps.length).toBe(2)
    expect(steps[0]!.at).toBe(30)
  })
})

describe('the patterns', () => {
  it('reads degrees, rests and holds', () => {
    expect(degreeOf('0')).toBe(0)
    expect(degreeOf('9')).toBe(9)
    expect(degreeOf('a')).toBe(10)
    expect(degreeOf('f')).toBe(15)
    expect(degreeOf('.')).toBeNull()
    expect(degreeOf('-')).toBeNull()
    expect(lengthAt('4---.2-.', 0)).toBe(4)
    expect(lengthAt('4---.2-.', 5)).toBe(2)
    expect(charAt('x.', 5)).toBe('.')
  })

  it('turns degrees into notes of the key, an octave every seven', () => {
    const song = { root: 60, scale: [0, 2, 4, 5, 7, 9, 11] }
    expect(degreeMidi(song, 0)).toBe(60)
    expect(degreeMidi(song, 4)).toBe(67)
    expect(degreeMidi(song, 7)).toBe(72)
    expect(degreeMidi(song, 2, -1)).toBe(52)
    expect(midiHz(69)).toBeCloseTo(440)
    expect(midiHz(81)).toBeCloseTo(880)
    expect(chordDegrees(3)).toEqual([3, 5, 7])
    expect(chordDegrees(0, 'power')).toEqual([0, 4, 7])
    expect(chordDegrees(1, 'seventh')).toEqual([1, 3, 5, 7])
  })

  it('plays the bass on the beat only in the intro, and the lead only racing', () => {
    const song = SONGS.neon
    const intro = mixFor('intro', false).layers
    const race = mixFor('race', false).layers
    const introBass = Array.from({ length: 16 }, (_, step) => notesAt(song, step, intro).filter((one) => one.voice === 'bass').length)
    expect(introBass.filter((count, step) => count > 0 && step % 4 !== 0)).toEqual([])
    expect(introBass[0]).toBe(1)
    const leads = Array.from({ length: 64 }, (_, step) => notesAt(song, step, race)).flat()
    expect(leads.some((one) => one.voice === 'lead')).toBe(true)
    expect(leads.some((one) => one.voice === 'leadHigh')).toBe(false)
    const final = notesAt(song, 0, mixFor('final', false).layers)
    expect(final.find((one) => one.voice === 'leadHigh')?.midi).toBe(final.find((one) => one.voice === 'lead')!.midi + 12)
  })

  it('beats the drums as written, a heartbeat on the one in the intro', () => {
    const song = SONGS.breeze
    const race = mixFor('race', false).layers
    expect(drumsAt(song, 0, race)).toContain('kick')
    expect(drumsAt(song, 4, race)).toContain('snare')
    expect(drumsAt(song, 1, race)).toEqual([])
    const intro = mixFor('intro', false).layers
    expect(drumsAt(song, 16, intro)).toContain('kick')
    expect(drumsAt(song, 20, intro)).not.toContain('kick')
    expect(drumsAt(song, 20, intro)).not.toContain('snare')
  })
})

describe('the songs', () => {
  const ids = Object.keys(SONGS) as SongId[]

  it('are all well formed: 16 steps a bar, notes the sequencer can read', () => {
    for (const id of ids) {
      const song = SONGS[id]
      for (const pattern of [song.kick, song.snare, song.hat, song.bass, song.perc ?? '', song.arp ?? '']) {
        if (pattern) expect(pattern, id).toMatch(/^[x.o0-9a-f-]{16}$/)
      }
      for (const bar of song.lead) expect(bar, id).toMatch(/^[0-9a-f.-]{16}$/)
      expect(song.lead.length % song.chords.length === 0 || song.chords.length % song.lead.length === 0, id).toBe(true)
      expect(song.bpm, id).toBeGreaterThan(60)
      expect(song.bpm, id).toBeLessThan(180)
      // Every note within hearing and below a piercing pitch
      for (let step = 0; step < 64; step++) {
        for (const played of notesAt(song, step, mixFor('final', false).layers)) {
          expect(midiHz(played.midi), id).toBeGreaterThan(30)
          expect(midiHz(played.midi), id).toBeLessThan(3000)
        }
      }
    }
  })

  it('gives every race track a song, each kind of track its own, and a quiet one for the menus', () => {
    for (const id of RACE_TRACK_IDS) expect(SONGS[TRACK_SONGS[id]]).toBeDefined()
    expect(new Set(Object.values(TRACK_SONGS)).size).toBe(6)
    expect(Object.values(TRACK_SONGS)).not.toContain('lounge')
    expect(songFor(null)).toBe('lounge')
    expect(songFor({ id: 'oldstreet' })).toBe('neon')
    expect(songFor({ id: 'my-own', theme: 'night' })).toBe('neon')
    expect(songFor({ id: 'my-own' })).toBe('breeze')
    expect(SONGS.lounge.bpm).toBeLessThan(Math.min(...Object.values(TRACK_SONGS).map((id) => SONGS[id].bpm)))
  })
})

describe('the volumes', () => {
  afterEach(() => {
    window.localStorage.clear()
    forgetVolumesForTest()
  })

  it('start at the defaults and keep what was set', () => {
    expect(loadVolumes()).toEqual(DEFAULT_VOLUMES)
    expect(saveVolumes({ music: 0.25, effects: 0.8 })).toBe(true)
    forgetVolumesForTest()
    expect(loadVolumes()).toEqual({ music: 0.25, effects: 0.8 })
  })

  it('throws nothing away but what is odd, and clamps', () => {
    expect(parseVolumes('{"music":2,"effects":"loud"}')).toEqual({ music: 1, effects: DEFAULT_VOLUMES.effects })
    expect(parseVolumes('not json')).toEqual(DEFAULT_VOLUMES)
    expect(parseVolumes('null')).toEqual(DEFAULT_VOLUMES)
    expect(parseVolumes(null)).toEqual(DEFAULT_VOLUMES)
  })

  it('lasts for the page when storage refuses', () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('full')
    }
    try {
      expect(saveVolumes({ music: 0.1, effects: 0.2 })).toBe(false)
      expect(loadVolumes()).toEqual({ music: 0.1, effects: 0.2 })
    } finally {
      Storage.prototype.setItem = original
    }
  })
})

describe('the ambience', () => {
  it('gives every race track a world to hear', () => {
    for (const id of RACE_TRACK_IDS) {
      expect(Object.keys(TRACK_AMBIENCE[id].layers).length, id).toBeGreaterThan(0)
    }
    expect(TRACK_AMBIENCE.harbour.layers.surf).toBeGreaterThan(0)
    expect(TRACK_AMBIENCE.oldstreet.layers.market).toBeGreaterThan(0)
    expect(TRACK_AMBIENCE.works.layers.machines).toBeGreaterThan(0)
    expect(TRACK_AMBIENCE.datun.layers.wind).toBeGreaterThan(0)
    expect(ambienceFor({ id: 'custom', theme: 'night' }).layers.insects).toBeGreaterThan(0)
  })

  it('has the crowd loud at the line and fading smoothly away from it', () => {
    expect(crowdLevel(0)).toBe(1)
    expect(crowdLevel(CROWD_NEAR)).toBe(1)
    expect(crowdLevel(CROWD_GONE)).toBe(0)
    expect(crowdLevel(1000)).toBe(0)
    let last = 1
    for (let distance = CROWD_NEAR; distance <= CROWD_GONE; distance += 5) {
      const level = crowdLevel(distance)
      expect(level).toBeLessThanOrEqual(last)
      last = level
    }
  })

  it('spaces the occasional sounds within their ranges', () => {
    expect(nextIn('gulls', () => 0)).toBe(3)
    expect(nextIn('gulls', () => 1)).toBe(8)
    expect(nextIn('machines', () => 0.5)).toBe(1.6)
  })
})

describe('songs as lazy chunks (2026-11-21)', () => {
  it('lists every song once and keeps one fetched', async () => {
    expect(new Set(SONG_IDS).size).toBe(SONG_IDS.length)
    expect(Object.keys(SONGS).sort()).toEqual([...SONG_IDS].sort())
    for (const id of SONG_IDS) expect(loadedSong(id)).toBe(SONGS[id])
    expect(await loadSong('neon')).toBe(SONGS.neon)
  })
})
