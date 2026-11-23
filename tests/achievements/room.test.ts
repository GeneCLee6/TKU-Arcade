import { describe, expect, it } from 'vitest'
import type { GameResult } from '../../shared/games/types.ts'
import type { RoomMember, RoomView } from '../../shared/protocol.ts'
import { roomEvent } from '../../src/achievements/room.ts'

const member = (id: string, seat: number | null, extra: Partial<RoomMember> = {}): RoomMember => ({
  id,
  name: id,
  seat,
  ready: false,
  host: false,
  online: true,
  absent: false,
  ...extra,
})

function room(gameId: string, result: GameResult | null, members: RoomMember[]): RoomView {
  return {
    room: { id: 'r1', gameId, status: 'ended', options: {}, minPlayers: 2, maxSeats: 6 },
    members: Object.fromEntries(members.map((one) => [one.id, one])),
    game: { view: null, legal: [], over: true, result, chatLocked: false },
    coverable: [],
  }
}

const line = (seat: number, rank: number, key = 'games.x.note') => ({ seat, rank, score: null, note: { key } })

describe('a room’s finished game', () => {
  it('a board game won against a computer on Normal, with a friend', () => {
    const view = room(
      'promotion',
      { summary: { key: 'games.promotion.result.won' }, standings: [line(0, 1), line(1, 2), line(2, 3)] },
      [member('me', 0), member('ann', 1), member('bot', 2, { bot: { level: 'normal', name: 'a' } })],
    )
    expect(roomEvent(view, 'me')).toEqual({
      type: 'board.result',
      game: 'promotion',
      outcome: 'won',
      humans: 2,
      level: 'normal',
    })
  })

  it('a co-operative game carries how far the table got', () => {
    const view = room(
      'kite',
      { summary: { key: 'games.kite.result.deck', params: { score: 20, max: 25 } }, standings: [line(0, 1), line(1, 1)] },
      [member('me', 0), member('ann', 1)],
    )
    expect(roomEvent(view, 'me')).toMatchObject({ game: 'kite', outcome: 'coopLost', score: 20, most: 25 })
  })

  it('nothing for a spectator, for no result, for someone not in the room', () => {
    const result: GameResult = { summary: { key: 'x' }, standings: [line(0, 1)] }
    expect(roomEvent(room('promotion', result, [member('me', null), member('ann', 0)]), 'me')).toBeNull()
    expect(roomEvent(room('promotion', null, [member('me', 0)]), 'me')).toBeNull()
    expect(roomEvent(room('promotion', result, [member('ann', 0)]), 'me')).toBeNull()
  })

  it('a race room: the place, the computer’s level, whether the player finished', () => {
    const result: GameResult = {
      summary: { key: 'games.kart.result.won' },
      standings: [line(1, 1, 'games.kart.note.time'), line(0, 2, 'games.kart.note.time'), line(2, 3, 'games.kart.note.out')],
    }
    const members = [member('me', 0), member('ann', 1), member('bot', 2, { bot: { level: 'expert', name: 'b' } })]
    expect(roomEvent(room('kart', result, members), 'me')).toEqual({
      type: 'kart.race',
      mode: 'room',
      place: 2,
      racers: 3,
      level: 'expert',
      team: null,
      humans: 2,
    })
    expect(roomEvent(room('kart', result, members), 'bot')).toMatchObject({ place: null })
  })

  it('a team race: won or lost by the player’s side', () => {
    const result: GameResult = {
      summary: { key: 'games.kart.result.blueWon', params: { red: 3, blue: 5 } },
      standings: [line(0, 1, 'games.kart.note.redTime'), line(1, 2, 'games.kart.note.blueOut')],
    }
    const members = [member('me', 0, { team: 0 }), member('ann', 1, { team: 1 })]
    expect(roomEvent(room('kart', result, members), 'me')).toMatchObject({ team: 'lost', place: 1 })
    expect(roomEvent(room('kart', result, members), 'ann')).toMatchObject({ team: 'won', place: null })
    const draw = { ...result, summary: { key: 'games.kart.result.teamDraw' } }
    expect(roomEvent(room('kart', draw, members), 'me')).toMatchObject({ team: 'draw' })
  })
})
