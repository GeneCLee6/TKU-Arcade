import { describe, expect, it } from 'vitest'
import { readRelayed, type KartFrame } from '../../shared/kart/net.ts'
import { gridSpot } from '../../shared/kart/race.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import type { Track } from '../../shared/kart/track.ts'
import { botSeats, createBotRace } from '../../src/kart/bots/botRace.ts'
import { createLocalRoom } from '../../src/kart/bots/localRoom.ts'
import { drawBots } from '../../src/kart/bots/roster.ts'
import {
  countdownBlend,
  countdownShot,
  CUT_AT,
  GLIDE_FROM,
  GLIDE_TO,
  gridShot,
} from '../../src/kart/director.ts'
import { createRaceNet } from '../../src/kart/race/netRace.ts'

// 2026-11-20 (owner: "like the classic kart racers, at 3-2-1 all the racers should be lined up
// together; now I can only see my own kart"). Up to GO every racer stands on its place on the grid
// and is drawn there, and the countdown's camera starts with the whole grid in view.

const track = raceTrack('riverside') as Track

describe('the countdown camera (director.ts)', () => {
  const spots = Array.from({ length: 8 }, (_, slot) => gridSpot(track, slot))

  it('starts high behind the last row, every place on the grid ahead of it and in view', () => {
    const shot = gridShot(spots)!
    expect(shot.eye.y).toBeGreaterThan(4)
    const look = { x: shot.target.x - shot.eye.x, z: shot.target.z - shot.eye.z }
    const length = Math.hypot(look.x, look.z)
    for (const spot of spots) {
      const to = { x: spot.x - shot.eye.x, z: spot.z - shot.eye.z }
      const ahead = (to.x * look.x + to.z * look.z) / length
      expect(ahead).toBeGreaterThan(5)
      // Within 25° either side of where the camera looks: on the screen
      const across = Math.abs(to.x * look.z - to.z * look.x) / length
      expect(Math.atan2(across, ahead)).toBeLessThan((25 * Math.PI) / 180)
    }
  })

  it('holds the grid until the glide, and is behind the kart for the "1"', () => {
    expect(countdownBlend(null)).toBe(1)
    expect(countdownBlend(3.5)).toBe(1)
    expect(countdownBlend(GLIDE_FROM)).toBe(1)
    const halfway = countdownBlend((GLIDE_FROM + GLIDE_TO) / 2)
    expect(halfway).toBeGreaterThan(0.2)
    expect(halfway).toBeLessThan(0.8)
    expect(countdownBlend(1)).toBe(0)
    expect(countdownShot(spots, 0.9)).toBeNull()
  })

  it('with less motion asked for, cuts once instead of gliding', () => {
    expect(countdownBlend(CUT_AT + 0.01, true)).toBe(1)
    expect(countdownBlend(CUT_AT - 0.01, true)).toBe(0)
  })

  it('has no shot without a grid', () => {
    expect(gridShot([])).toBeNull()
  })
})

describe('the grid before GO', () => {
  /** A race against `bots` computer karts in this browser, the player at the back, on a counter clock */
  function botRoom(bots: number) {
    let now = 5_000_000
    const entries = drawBots(bots, 11)
    const player = entries.length
    const room = createLocalRoom({
      seats: bots + 1,
      options: { track: 'riverside', laps: 1, mode: 'race' },
      seed: 11,
      now: () => now,
    })
    return {
      room,
      entries,
      player,
      at: () => now,
      wait: (ms: number) => {
        now += ms
      },
    }
  }

  it('every other racer is drawn on its own place, with the kart it picked, before any frame', () => {
    const { room, entries, player } = botRoom(3)
    const net = createRaceNet({
      realtime: room.realtimeFor(player),
      track,
      seat: player,
      slot: player,
      body: 'tide',
      driver: 'spade',
      goAt: () => room.view(player).goAt,
      laps: 1,
      view: () => room.view(player),
      lookOf: (seat) => entries[seat] ?? null,
    })
    const drawn = net.net.others()
    expect(drawn.map((kart) => kart.id).sort()).toEqual([0, 1, 2])
    for (const kart of drawn) {
      const spot = gridSpot(track, kart.id)
      expect(kart.x).toBeCloseTo(spot.x, 6)
      expect(kart.z).toBeCloseTo(spot.z, 6)
      expect(kart.heading).toBeCloseTo(spot.heading, 6)
      expect(kart.body).toBe(entries[kart.id]!.kart)
      expect(kart.driver).toBe(entries[kart.id]!.driver)
    }
    // The camera's grid: every racer's place, the pole first
    expect(net.net.gridSpots?.()).toEqual([0, 1, 2, 3].map((slot) => gridSpot(track, slot)))
    net.stop()
  })

  it('once racing, only karts with frames are drawn', () => {
    const { room, player, wait, at } = botRoom(2)
    for (let seat = 0; seat <= player; seat++) room.act({ t: 'loaded' }, seat)
    wait(10_000)
    room.tick(at())
    expect(room.view(player).phase).toBe('racing')
    const net = createRaceNet({
      realtime: room.realtimeFor(player),
      track,
      seat: player,
      slot: player,
      body: 'tide',
      driver: 'spade',
      goAt: () => room.view(player).goAt,
      laps: 1,
      view: () => room.view(player),
    })
    expect(net.net.others()).toHaveLength(0)
    net.stop()
  })

  it("the computer karts' frames on the grid carry the room's countdown, never a tick that stands still", () => {
    const { room, entries, player, wait, at } = botRoom(3)
    const frames: KartFrame[] = []
    const stop = room.listen((data) => {
      const relayed = readRelayed(data)
      if (relayed && relayed.seat === 0) frames.push(relayed.frame)
    })
    const race = createBotRace({
      room,
      track,
      laps: 1,
      bots: botSeats(entries, 0, 'normal'),
      players: [player],
      seed: 11,
      now: at(),
    })
    room.act({ t: 'loaded' }, player)
    const goAt = room.state().goAt!
    expect(goAt).not.toBeNull()
    while (at() < goAt - 100) {
      wait(50)
      race.advance(at())
    }
    const ticks = frames.map((frame) => frame.tick)
    expect(ticks.length).toBeGreaterThan(40)
    // From about -4 s (the "ready" second) up towards GO, always rising
    expect(ticks[0]!).toBeLessThan(-200)
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]!).toBeGreaterThan(ticks[i - 1]!)
    // And standing on its place on the grid
    const spot = gridSpot(track, 0)
    for (const frame of frames) {
      expect(frame.x).toBeCloseTo(spot.x, 3)
      expect(frame.z).toBeCloseTo(spot.z, 3)
    }
    race.stop()
    stop()
  })
})
