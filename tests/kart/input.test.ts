import { describe, expect, it } from 'vitest'
import {
  activeControls,
  AXIS_DEAD_ZONE,
  bindKey,
  bindPad,
  DEFAULT_BINDINGS,
  KART_ACTIONS,
  newPress,
  padValue,
  parseBindings,
  readInput,
  RESERVED_KEYS,
  serializeBindings,
  type PadSnapshot,
} from '../../shared/kart/input.ts'
import { NO_INPUT } from '../../shared/kart/physics.ts'

// e8-t12: keys, gamepad and remapping, all feeding the same KartInput

const idlePad = (): { buttons: number[]; axes: number[] } => ({
  buttons: Array.from({ length: 17 }, () => 0),
  axes: [0, 0, 0, 0],
})

const pad = (change: (pad: { buttons: number[]; axes: number[] }) => void): PadSnapshot => {
  const snapshot = idlePad()
  change(snapshot)
  return snapshot
}

const keys = (...codes: string[]) => ({ held: new Set(codes) })

describe('the default keys', () => {
  it('read arrows and WASD alike', () => {
    expect(readInput(DEFAULT_BINDINGS, keys('ArrowUp', 'ArrowRight'))).toEqual({
      ...NO_INPUT,
      throttle: true,
      steer: 1,
    })
    expect(readInput(DEFAULT_BINDINGS, keys('KeyS', 'KeyA', 'Space', 'KeyE'))).toEqual({
      ...NO_INPUT,
      brake: true,
      steer: -1,
      drift: true,
      boost: true,
    })
    expect(readInput(DEFAULT_BINDINGS, keys('KeyZ', 'KeyX'))).toMatchObject({
      drift: true,
      boost: true,
    })
  })

  it('cancel left against right', () => {
    expect(readInput(DEFAULT_BINDINGS, keys('ArrowLeft', 'KeyD')).steer).toBe(0)
  })

  it('use no Shift, no Ctrl and nothing the page keeps for itself', () => {
    const all = KART_ACTIONS.flatMap((action) => DEFAULT_BINDINGS.keys[action])
    expect(all.filter((code) => code && /Shift|Control|Meta|Alt/.test(code))).toEqual([])
    expect(all.filter((code) => code && RESERVED_KEYS.has(code))).toEqual([])
    expect(new Set(all).size).toBe(all.length)
  })

  it('fire a boost tapped between two steps', () => {
    expect(readInput(DEFAULT_BINDINGS, { held: new Set(), boostTapped: true }).boost).toBe(true)
  })
})

describe('the gamepad', () => {
  it('steers with the stick in proportion, past the dead zone', () => {
    expect(
      readInput(DEFAULT_BINDINGS, { held: new Set(), pad: pad((p) => (p.axes[0] = 0.1)) }).steer,
    ).toBe(0)
    const half = readInput(DEFAULT_BINDINGS, {
      held: new Set(),
      pad: pad((p) => (p.axes[0] = AXIS_DEAD_ZONE + (1 - AXIS_DEAD_ZONE) / 2)),
    })
    expect(half.steer).toBeCloseTo(0.5, 9)
    expect(
      readInput(DEFAULT_BINDINGS, { held: new Set(), pad: pad((p) => (p.axes[0] = -1)) }).steer,
    ).toBe(-1)
  })

  it('reads the standard mapping: A and RT accelerate, B brakes, RB drifts, X boosts, d-pad steers', () => {
    const input = readInput(DEFAULT_BINDINGS, {
      held: new Set(),
      pad: pad((p) => {
        p.buttons[7] = 0.8
        p.buttons[5] = 1
        p.buttons[2] = 1
        p.buttons[14] = 1
      }),
    })
    expect(input).toEqual({ throttle: true, brake: false, steer: -1, drift: true, boost: true })
    expect(
      readInput(DEFAULT_BINDINGS, { held: new Set(), pad: pad((p) => (p.buttons[1] = 1)) }).brake,
    ).toBe(true)
    // A trigger barely touched is not a press
    expect(
      readInput(DEFAULT_BINDINGS, { held: new Set(), pad: pad((p) => (p.buttons[7] = 0.2)) })
        .throttle,
    ).toBe(false)
  })

  it('adds up with the keyboard, up to full lock', () => {
    const both = readInput(DEFAULT_BINDINGS, {
      held: new Set(['ArrowRight']),
      pad: pad((p) => (p.axes[0] = 1)),
    })
    expect(both.steer).toBe(1)
    const against = readInput(DEFAULT_BINDINGS, {
      held: new Set(['ArrowLeft']),
      pad: pad((p) => (p.axes[0] = 1)),
    })
    expect(against.steer).toBe(0)
  })

  it('reads a value from a button or one side of an axis', () => {
    expect(
      padValue(
        { kind: 'button', index: 3 },
        pad((p) => (p.buttons[3] = 0.6)),
      ),
    ).toBe(0.6)
    expect(
      padValue(
        { kind: 'axis', index: 1, direction: -1 },
        pad((p) => (p.axes[1] = 1)),
      ),
    ).toBe(0)
    expect(padValue({ kind: 'axis', index: 9, direction: 1 }, idlePad())).toBe(0)
  })

  it('tells a new press from one held since before', () => {
    const before = activeControls(pad((p) => (p.buttons[0] = 1)))
    expect(
      newPress(
        before,
        pad((p) => (p.buttons[0] = 1)),
      ),
    ).toBeUndefined()
    expect(
      newPress(
        before,
        pad((p) => ((p.buttons[0] = 1), (p.axes[2] = -0.9))),
      ),
    ).toEqual({
      kind: 'axis',
      index: 2,
      direction: -1,
    })
  })
})

describe('remapping', () => {
  it('puts a key in a place', () => {
    const { bindings, movedFrom } = bindKey(DEFAULT_BINDINGS, 'drift', 0, 'ShiftLeft')
    expect(bindings.keys.drift).toEqual(['ShiftLeft', 'Space'])
    expect(movedFrom).toBeUndefined()
    expect(readInput(bindings, keys('ShiftLeft')).drift).toBe(true)
    expect(readInput(bindings, keys('KeyZ')).drift).toBe(false)
  })

  it('takes a key from the action that had it, and says which', () => {
    const { bindings, movedFrom } = bindKey(DEFAULT_BINDINGS, 'boost', 0, 'Space')
    expect(movedFrom).toEqual({ action: 'drift', slot: 1 })
    expect(bindings.keys.drift).toEqual(['KeyZ', null])
    expect(bindings.keys.boost).toEqual(['Space', 'KeyE'])
    expect(readInput(bindings, keys('Space'))).toMatchObject({ drift: false, boost: true })
  })

  it('moves a key between the two places of the same action', () => {
    const { bindings, movedFrom } = bindKey(DEFAULT_BINDINGS, 'throttle', 1, 'ArrowUp')
    expect(bindings.keys.throttle).toEqual([null, 'ArrowUp'])
    expect(movedFrom).toEqual({ action: 'throttle', slot: 0 })
  })

  it('refuses the keys the page keeps for itself', () => {
    for (const code of ['Tab', 'Enter', 'Escape', 'KeyF']) {
      expect(bindKey(DEFAULT_BINDINGS, 'drift', 0, code).bindings).toBe(DEFAULT_BINDINGS)
    }
  })

  it('empties a place', () => {
    expect(bindKey(DEFAULT_BINDINGS, 'boost', 1, null).bindings.keys.boost).toEqual(['KeyX', null])
  })

  it('does the same for gamepad controls, an axis side being its own control', () => {
    const stickUp = { kind: 'axis', index: 1, direction: -1 } as const
    const { bindings } = bindPad(DEFAULT_BINDINGS, 'throttle', 1, stickUp)
    expect(bindings.pad.throttle[1]).toEqual(stickUp)
    expect(
      readInput(bindings, { held: new Set(), pad: pad((p) => (p.axes[1] = -1)) }).throttle,
    ).toBe(true)

    const taken = bindPad(DEFAULT_BINDINGS, 'boost', 0, { kind: 'button', index: 5 })
    expect(taken.movedFrom).toEqual({ action: 'drift', slot: 0 })
    // The other side of the steering axis stays where it was
    const right = bindPad(DEFAULT_BINDINGS, 'drift', 0, { kind: 'axis', index: 0, direction: 1 })
    expect(right.movedFrom).toEqual({ action: 'right', slot: 0 })
    expect(right.bindings.pad.left[0]).toEqual({ kind: 'axis', index: 0, direction: -1 })
  })

  it('never changes the bindings it was given', () => {
    const frozen = JSON.stringify(DEFAULT_BINDINGS)
    bindKey(DEFAULT_BINDINGS, 'boost', 0, 'Space')
    bindPad(DEFAULT_BINDINGS, 'boost', 0, { kind: 'button', index: 5 })
    expect(JSON.stringify(DEFAULT_BINDINGS)).toBe(frozen)
  })
})

describe('stored bindings', () => {
  it('come back as they were saved', () => {
    const changed = bindPad(
      bindKey(DEFAULT_BINDINGS, 'boost', 0, 'Space').bindings,
      'drift',
      1,
      null,
    ).bindings
    expect(parseBindings(serializeBindings(changed))).toEqual(changed)
  })

  it('fall back to the defaults when missing or broken', () => {
    expect(parseBindings(null)).toEqual(DEFAULT_BINDINGS)
    expect(parseBindings('not json')).toEqual(DEFAULT_BINDINGS)
    expect(parseBindings('[1,2]')).toEqual(DEFAULT_BINDINGS)
    expect(parseBindings('"text"')).toEqual(DEFAULT_BINDINGS)
  })

  it('fall back one place at a time, and refuse reserved keys and strange values', () => {
    const stored = JSON.stringify({
      keys: { drift: ['ShiftLeft', 42], boost: ['Enter'], left: 'oops' },
      pad: {
        boost: [
          { kind: 'button', index: -1 },
          { kind: 'axis', index: 1, direction: 2 },
        ],
      },
    })
    const parsed = parseBindings(stored)
    expect(parsed.keys.drift).toEqual(['ShiftLeft', 'Space'])
    expect(parsed.keys.boost).toEqual(DEFAULT_BINDINGS.keys.boost)
    expect(parsed.keys.left).toEqual(DEFAULT_BINDINGS.keys.left)
    expect(parsed.pad.boost).toEqual(DEFAULT_BINDINGS.pad.boost)
  })

  it('never hold one control in two places, even when edited by hand', () => {
    const stored = JSON.stringify({ keys: { boost: ['KeyZ', 'KeyE'] } })
    const parsed = parseBindings(stored)
    const all = KART_ACTIONS.flatMap((action) => parsed.keys[action]).filter(
      (code) => code !== null,
    )
    expect(new Set(all).size).toBe(all.length)
    expect(parsed.keys.boost[0]).toBe('KeyZ')
  })
})
