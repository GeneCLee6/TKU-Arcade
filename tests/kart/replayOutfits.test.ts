import { describe, expect, it } from 'vitest'
import { OUTFIT_IDS } from '../../shared/kart/outfits.ts'
import type { Replay } from '../../shared/kart/replay.ts'
import { drawBots } from '../../src/kart/bots/roster.ts'
import { parseCupRun, startCup } from '../../src/kart/cup/cupRun.ts'
import { createRng } from '../../shared/games/rng.ts'
import { DRIVER_IDS, KART_IDS } from '../../shared/kart/karts.ts'
import { BOT_NAMES } from '../../shared/games/kart/bots.ts'
import { fileInfo, outfitsOf } from '../../src/kart/watch/replayFiles.ts'

// 2026-11-23 (docs/ARCHITECTURE.md §4.96; #177's known limits): the computer's drivers each in an
// outfit of their own, and every replay's file saying what everyone wore

describe("the computer's drivers' outfits", () => {
  it('draws one for each, from the same seed, without changing who drives what', () => {
    const bots = drawBots(7, 42)
    expect(bots.every((bot) => OUTFIT_IDS.includes(bot.outfit!))).toBe(true)
    expect(drawBots(7, 42)).toEqual(bots)
    // Over many races, every outfit is worn
    const worn = new Set(Array.from({ length: 40 }, (_, seed) => drawBots(7, seed)).flat().map((bot) => bot.outfit))
    expect(worn).toEqual(new Set(OUTFIT_IDS))
    // The names, karts and drivers are what this seed always drew (the outfits from a stream of their own)
    const rng = createRng(42)
    const names = rng.shuffle(BOT_NAMES)
    const before = names.slice(0, 7).map((name) => ({ name, kart: rng.pick(KART_IDS), driver: rng.pick(DRIVER_IDS) }))
    expect(bots.map(({ name, kart, driver }) => ({ name, kart, driver }))).toEqual(before)
  })

  it("keeps a Grand Prix's outfits, and reads one saved before them as the race suit", () => {
    const run = startCup({ cup: 'ebb', bots: 3, difficulty: 'normal', mode: 'race', laps: 2 }, 9)
    const kept = parseCupRun(JSON.parse(JSON.stringify(run)))!
    expect(kept.entries.map((entry) => entry.outfit)).toEqual(run.entries.map((entry) => entry.outfit))
    const older = JSON.parse(JSON.stringify(run)) as { entries: Record<string, unknown>[] }
    for (const entry of older.entries) delete entry.outfit
    const read = parseCupRun(older)!
    expect(read).not.toBeNull()
    expect(read.entries.every((entry) => entry.outfit === undefined)).toBe(true)
    // An outfit not known: left out, the run still read
    older.entries[0]!.outfit = 'tuxedo'
    expect(parseCupRun(older)!.entries[0]!.outfit).toBeUndefined()
  })
})

describe("a replay file's header", () => {
  const replay = {
    track: 'riverside',
    racers: [
      { seat: 0, finishMs: null },
      { seat: 2, finishMs: null },
      { seat: 3, finishMs: null },
    ],
  } as unknown as Replay

  it('names what each racer wore, the race suit left out', () => {
    const wear = { 0: 'street', 2: 'race', 3: 'campus' } as const
    const info = fileInfo(replay, () => 'x', 0, undefined, (seat) => wear[seat as 0 | 2 | 3])
    expect(info.outfits).toEqual([
      { seat: 0, outfit: 'street' },
      { seat: 3, outfit: 'campus' },
    ])
    // Nobody's known, or all in the suit: no field at all
    expect(fileInfo(replay, () => 'x', 0)).not.toHaveProperty('outfits')
    expect(outfitsOf(replay, () => 'race')).toEqual({})
  })
})
