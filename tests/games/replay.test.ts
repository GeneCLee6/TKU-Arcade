import { describe, expect, it } from 'vitest'
import { GAME_IDS, getGame } from '../../shared/games/index.ts'
import { makeSeats, projectGame } from '../../shared/games/match.ts'
import { buildReplay } from '../../shared/games/replay.ts'
import { defaultOptions } from '../../shared/games/options.ts'
import type { AnyGameModule } from '../../shared/games/types.ts'
import { applyPatch, type JsonValue } from '../../shared/patch.ts'
import { playRandom } from './harness.ts'

// e2-t09, AC-2.5: the seed and the steps replay the game that was played, and the patches the replay
// sends rebuild the spectator's projection after every step

describe('replays', () => {
  it.each(GAME_IDS)('rebuild the finished game of %s, step by step', (gameId) => {
    const module = getGame(gameId) as AnyGameModule
    const seats = Math.min(module.meta.maxPlayers, Math.max(module.meta.minPlayers, 4))
    const options = defaultOptions(module.options)
    const played = playRandom(module, { seed: 11, seats, options })
    const { start, frames } = buildReplay(module, makeSeats(seats), options, 11, played.steps)
    expect(frames).toHaveLength(played.steps.length)
    let shown = start as unknown as JsonValue
    for (const [index, frame] of frames.entries()) {
      expect(frame.actor).toEqual(played.steps[index].actor)
      shown = applyPatch(shown, frame.ops)
    }
    expect(shown).toEqual(projectGame(module, played.final.state, 'spectator'))
    expect((shown as { over: boolean }).over).toBe(true)
  })

  it('refuses a log the seed does not give', () => {
    const module = getGame('tictactoe') as AnyGameModule
    const played = playRandom(module, { seed: 3 })
    const broken = [played.steps[0], played.steps[0]]
    expect(() =>
      buildReplay(module, makeSeats(2), defaultOptions(module.options), 3, broken),
    ).toThrow(/refused/)
  })
})
