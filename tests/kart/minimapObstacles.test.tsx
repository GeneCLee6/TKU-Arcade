import { act, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { KART_MESSAGES } from '../../shared/kart/i18n.ts'
import { challengeTrack } from '../../shared/kart/tracks/challenge.ts'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { registerMessages, translate } from '../../src/i18n/t.ts'
import { Minimap, type MinimapHandle } from '../../src/kart/Minimap.tsx'

// 2026-11-23 (#143): the minimap draws the moving obstacles, coloured by the race clock: a barrier
// down, warned of or up; a container held, warned of or sliding, where it is

registerMessages(KART_MESSAGES)
const en = (key: string, params?: Record<string, string | number>) =>
  translate('en', key as `kart.${string}`, params)

const track = challengeTrack('ch-lock')
const states = () => screen.getAllByTestId('kart-minimap-obstacle').map((one) => one.dataset.state)

describe('the minimap and the moving obstacles', () => {
  it('draws each one, and changes them with the race clock', () => {
    const map = createRef<MinimapHandle>()
    render(
      <Minimap ref={map} t={en} road={track.road} gates={track.gates} obstacles={track.obstacles} />,
    )
    // Three barriers and a container
    expect(screen.getAllByTestId('kart-minimap-obstacle')).toHaveLength(track.obstacles!.length)
    const place = (tick: number) => act(() => map.current!.place(0, 0, 0, 0, tick))
    // GO: the lock gate up, the container held, the crossing's left half down, its right half up
    place(0)
    expect(states()).toEqual(['open', 'held', 'closed', 'open'])
    // 100 steps on: the lock gate warned of, the container about to slide
    place(100)
    expect(states()).toEqual(['warn', 'warn', 'closed', 'open'])
    // 150: the lock gate down, the container on its way across, the crossing's left half up again
    // and its right half warned of
    place(150)
    expect(states()).toEqual(['closed', 'sliding', 'open', 'warn'])
    // The container moves on the map as it slides
    const box = () => screen.getAllByTestId('kart-minimap-obstacle')[1]!.getAttribute('d')
    const sliding = box()
    place(170)
    expect(box()).not.toBe(sliding)
    // Without a clock (a place call from before): left as they were
    act(() => map.current!.place(0, 0, 0, 0))
    expect(states()).toEqual(['closed', 'sliding', 'open', 'warn'])
  })

  it('draws nothing more on a track without obstacles', () => {
    const riverside = raceTrack('riverside')!
    render(<Minimap t={en} road={riverside.road} gates={riverside.gates} obstacles={riverside.obstacles} />)
    expect(screen.queryAllByTestId('kart-minimap-obstacle')).toHaveLength(0)
  })
})
