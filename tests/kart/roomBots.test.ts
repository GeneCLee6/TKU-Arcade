// 2026-11-17: computer karts in a race room, end to end without a browser: the very bots of the race
// against the computer (botRace.ts), driven the way the host's browser drives them (roomBots.ts:
// `loaded` for their seats, frames wrapped in PROXY_FRAME), against the Worker's own room
// (worker/room-host.ts) on a counter for a clock. The room judges their laps like anyone's.
import { describe, expect, it } from 'vitest'
import { kart } from '../../shared/games/kart/rules.ts'
import type { KartAction, KartView } from '../../shared/games/kart/types.ts'
import type { AnyGameModule, GameProjection } from '../../shared/games/types.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { applyPatch, type JsonValue } from '../../shared/patch.ts'
import {
  PROTOCOL_VERSION,
  proxyFrame,
  type RoomView,
  type ServerMessage,
} from '../../shared/protocol.ts'
import { createBotRace, type BotRoom } from '../../src/kart/bots/botRace.ts'
import { botSeatOf } from '../../src/kart/bots/roomBots.ts'
import { RoomHost } from '../../worker/room-host.ts'

function world() {
  let clock = 1_000_000
  // Each socket's view; Ann's frames
  const views = new Map<string, RoomView>()
  const frames = new Set<(data: Uint8Array) => void>()
  const host = new RoomHost({
    sockets: {
      send: (conn, message: ServerMessage) => {
        const copy = JSON.parse(JSON.stringify(message)) as ServerMessage
        if (copy.t === 'welcome' || copy.t === 'snapshot') views.set(conn, copy.state)
        else if (copy.t === 'patch') {
          views.set(conn, applyPatch(views.get(conn) as JsonValue, copy.ops) as RoomView)
        }
      },
      sendBinary: (conn, data) => {
        if (conn === 'ann') for (const listener of frames) listener(data)
      },
      close: () => {},
    },
    storage: {
      saveRoom: () => {},
      saveMembers: () => {},
      saveRev: () => {},
      saveGame: () => {},
      saveStep: () => {},
      dropSteps: () => {},
      saveChat: () => {},
      dropChat: () => {},
      clearAll: () => {},
    },
    games: (id) => (id === 'kart' ? (kart as unknown as AnyGameModule) : null),
    now: () => clock,
    newMemberId: (() => {
      let n = 0
      return () => `member-${++n}`
    })(),
    newToken: () => 'token'.padEnd(43, '_'),
    newSeed: () => 42,
  })
  expect(host.create('abcdefghij', 'kart', { track: 'riverside', laps: 1, mode: 'items' })).toBe(
    true,
  )
  expect(host.admit(String(PROTOCOL_VERSION))).toEqual({ ok: true })
  host.opened('ann', clock)
  const send = (message: unknown) => host.message('ann', JSON.stringify(message))
  send({ t: 'join', name: 'Ann', token: null })
  // Someone watching, to see what happens once Ann has gone
  host.opened('cy', clock)
  host.message('cy', JSON.stringify({ t: 'join', name: 'Cy', token: null }))
  host.message('cy', JSON.stringify({ t: 'sit', seat: null }))
  const viewOf = (conn: string) => views.get(conn) as RoomView
  return {
    host,
    send,
    get clock() {
      return clock
    },
    set clock(value: number) {
      clock = value
    },
    view: () => viewOf('ann'),
    race: (conn = 'ann') => (viewOf(conn).game as GameProjection).view as unknown as KartView,
    frames,
  }
}

describe('computer karts in a race room (2026-11-17)', () => {
  it('run a whole race through the room, the host only watching', () => {
    const w = world()
    // Ann watches; two computer karts race
    w.send({ t: 'sit', seat: null })
    w.send({ t: 'add_bot', level: 'hard', look: 'heron.club' })
    w.send({ t: 'add_bot', level: 'easy' })
    w.send({ t: 'start' })
    const bots = Object.values(w.view().members)
      .filter((member) => member.bot)
      .map((member) =>
        botSeatOf({
          seat: member.seat as number,
          level: member.bot!.level,
          name: member.bot!.name,
          ...(member.look ? { look: member.look } : {}),
        }),
      )
    expect(bots.map((bot) => [bot.seat, bot.difficulty, bot.entry.kart])).toEqual([
      [0, 'hard', 'heron'],
      [1, 'easy', bots[1]!.entry.kart],
    ])
    const room: BotRoom = {
      state: () => w.race(),
      act: (action: KartAction, seat) => w.send({ t: 'action', action, botSeat: seat }),
      frame: (seat, data) => {
        const wrapped = proxyFrame(seat, data)
        w.host.binary('ann', wrapped.buffer as ArrayBuffer)
      },
      tick: () => {},
      listen: (listener) => {
        w.frames.add(listener)
        return () => w.frames.delete(listener)
      },
    }
    const race = createBotRace({
      room,
      track: raceTrack('riverside')!,
      laps: 1,
      bots,
      players: [],
      seed: w.race().seed,
      now: w.clock,
    })
    // Both on the grid at once, through the host's actions for their seats
    expect(w.race().phase).toBe('countdown')
    let relayed = 0
    w.frames.add(() => relayed++)
    for (let ms = 0; w.view().room.status === 'playing' && ms < 6 * 60_000; ms += 50) {
      w.clock += 50
      // The room's alarm: GO, and the close after the first finish
      w.host.sweep()
      race.advance(w.clock)
    }
    race.stop()
    expect(relayed).toBeGreaterThan(100)
    expect(w.view().room.status).toBe('ended')
    const racers = w.race().racers
    // Judged by the room: a lap each
    expect(racers.every((racer) => racer.finishMs !== null && racer.lapMs.length === 1)).toBe(true)
    expect(race.bots().some((bot) => bot.pickups > 0)).toBe(true)
  })

  it('stop driving a kart the room has dropped out', () => {
    const w = world()
    w.send({ t: 'add_bot', level: 'normal' })
    w.send({ t: 'start' })
    const seat = Object.values(w.view().members).find((member) => member.bot)!.seat as number
    let sent = 0
    const race = createBotRace({
      room: {
        // As the host's browser sees the room once back (here: someone else's view)
        state: () => w.race('cy'),
        act: (action, one) => w.send({ t: 'action', action, botSeat: one }),
        frame: () => sent++,
        tick: () => {},
        listen: () => () => {},
      },
      track: raceTrack('riverside')!,
      laps: 1,
      bots: [botSeatOf({ seat, level: 'normal', name: 'pepper' })],
      players: [0],
      seed: 1,
      now: w.clock,
    })
    w.send({ t: 'action', action: { t: 'loaded' } })
    w.clock += 5_000
    w.host.sweep()
    race.advance(w.clock)
    expect(w.race().phase).toBe('racing')
    expect(sent).toBeGreaterThan(0)
    // Ann hands the host over to nobody: she goes, and her bot is out
    w.host.closed('ann')
    expect(w.race('cy').racers.find((racer) => racer.seat === seat)?.out).toBe(true)
    const before = sent
    w.clock += 1_000
    race.advance(w.clock)
    expect(sent).toBe(before)
  })
})
