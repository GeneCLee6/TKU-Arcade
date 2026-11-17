// e10-t07: a shared track's link read back from whatever was pasted, and the editor's saves in this
// browser (localStorage, which may hold anything).
import { afterEach, describe, expect, it } from 'vitest'
import { encodeSpec } from '../../shared/kart/editor/codec.ts'
import { starterSpec } from '../../shared/kart/editor/spec.ts'
import { codeFromText, shareLink } from '../../src/kart/editor/link.ts'
import {
  deleteTrack,
  forgetSaves,
  loadSaves,
  MAX_SAVES,
  saveTrack,
} from '../../src/kart/editor/saves.ts'

const KEY = 'tku-arcade.kart.editor.tracks'

afterEach(() => {
  localStorage.clear()
  forgetSaves()
})

describe('track links', () => {
  const code = encodeSpec(starterSpec())

  it('read the code from a whole link, a path or the code alone', () => {
    expect(shareLink(code, 'https://arcade.example')).toBe(
      `https://arcade.example/kart?custom=${code}`,
    )
    expect(codeFromText(shareLink(code, 'https://arcade.example'))).toBe(code)
    expect(codeFromText(`  /kart?custom=${code}&autopilot  `)).toBe(code)
    expect(codeFromText(code)).toBe(code)
  })

  it('find nothing in text that holds no code', () => {
    expect(codeFromText('')).toBeNull()
    expect(codeFromText('https://arcade.example/kart')).toBeNull()
    expect(codeFromText('https://arcade.example/kart?custom=a%20b')).toBeNull()
    expect(codeFromText('hello there')).toBeNull()
  })
})

describe('saved tracks', () => {
  it('keep newest first, update a save in place, and delete', () => {
    const first = saveTrack({ ...starterSpec(), name: 'One' }, null, 1000)
    const second = saveTrack({ ...starterSpec(), name: 'Two' }, null, 2000)
    expect(loadSaves().map((save) => save.id)).toEqual([second, first])
    expect(saveTrack({ ...starterSpec(), name: 'One again' }, first, 3000)).toBe(first)
    expect(loadSaves().map((save) => save.id)).toEqual([first, second])
    deleteTrack(second)
    expect(loadSaves()).toHaveLength(1)
    // As a new page reads them
    forgetSaves()
    expect(loadSaves()[0]!.id).toBe(first)
  })

  it('keep at most MAX_SAVES, dropping the oldest', () => {
    for (let i = 0; i < MAX_SAVES + 5; i++) saveTrack(starterSpec(), null, 1000 + i)
    expect(loadSaves()).toHaveLength(MAX_SAVES)
    expect(loadSaves().at(-1)!.savedAt).toBe(1005)
  })

  it('drop whatever in storage is not a save of a track', () => {
    const good = { id: 'a', code: encodeSpec(starterSpec()), savedAt: 1 }
    localStorage.setItem(KEY, JSON.stringify([good, { id: 'b', code: 'junk', savedAt: 2 }, 7]))
    expect(loadSaves()).toEqual([good])
    forgetSaves()
    localStorage.setItem(KEY, '{not json')
    expect(loadSaves()).toEqual([])
  })
})
