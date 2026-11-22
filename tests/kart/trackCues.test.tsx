import { fireEvent, render, screen } from '@testing-library/react'
import { InstancedMesh } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { raceTrack } from '../../shared/kart/tracks/registry.ts'
import { buildTrackArt } from '../../src/kart/art/trackArt.ts'
import { loadTrackScenery } from '../../src/kart/art/trackScenery.ts'
import { TrackCuesSwitch } from '../../src/kart/school/CoachTip.tsx'
import { loadTrackCuesOn, onTrackCuesChange, saveTrackCuesOn } from '../../src/kart/trackCues.ts'

// 2026-11-22 (owner, docs/NEXT.md §2.2): the cyan and amber marks on the tracks to learn by heart
// (#115) have a switch in the controls panel, on unless turned off, kept in localStorage that
// never throws; a race already drawn follows it at once.

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('the track cues switch', () => {
  it('is on unless turned off, and tells who listens', () => {
    expect(loadTrackCuesOn()).toBe(true)
    const heard: boolean[] = []
    const stop = onTrackCuesChange((on) => heard.push(on))
    saveTrackCuesOn(false)
    expect(loadTrackCuesOn()).toBe(false)
    saveTrackCuesOn(true)
    stop()
    saveTrackCuesOn(false)
    expect(heard).toEqual([false, true])
  })

  it('never throws when the browser keeps nothing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadTrackCuesOn()).toBe(true)
    expect(() => saveTrackCuesOn(false)).not.toThrow()
  })

  it('is a checkbox in the controls panel', () => {
    render(<TrackCuesSwitch t={(key) => key} />)
    const box = screen.getByTestId('kart-track-cues-switch') as HTMLInputElement
    expect(box.checked).toBe(true)
    fireEvent.click(box)
    expect(box.checked).toBe(false)
    expect(loadTrackCuesOn()).toBe(false)
  })

  it('hides and shows the marks of a track already drawn', async () => {
    // jsdom draws no canvas: the textures come out blank, which is all this needs
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const track = raceTrack('wharf')
    if (!track) throw new Error('no wharf track')
    const scenery = await loadTrackScenery(track)
    const art = buildTrackArt(track, { density: 1, shadows: false, anisotropy: 1 }, scenery)
    const shown = () =>
      art.group.children.filter((child) => child instanceof InstancedMesh && child.visible).length
    const all = shown()
    saveTrackCuesOn(false)
    const without = shown()
    expect(without).toBeLessThan(all)
    saveTrackCuesOn(true)
    expect(shown()).toBe(all)
    art.dispose()
    // Disposed: no longer listening
    saveTrackCuesOn(false)
    expect(shown()).toBe(all)
  })
})
