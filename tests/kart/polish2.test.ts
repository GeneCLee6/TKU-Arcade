import { describe, expect, it } from 'vitest'
import { KART_MESSAGES } from '../../shared/kart/i18n.ts'
import { registerMessages, translate } from '../../src/i18n/t.ts'
import { keepsForBlue } from '../../src/kart/bots/brain.ts'
import { DRIVERS } from '../../src/kart/bots/drivers.ts'
import { EXPERT_SKILL } from '../../src/kart/bots/expert.ts'
import { BOT_SKILLS } from '../../src/kart/bots/skill.ts'
import { keycap, keyLabel, pickPad, type PadSeen } from '../../src/kart/devices.ts'
import { HUD_STEPS } from '../../src/kart/hudSteps.ts'
import { boostButtonLook } from '../../src/kart/touch/boostButton.ts'

// 2026-11-22 (feat/kart-polish-2; docs/ARCHITECTURE.md §4.63): the touch BOOST button while a boost
// burns (#100), the computer keeping a charge to turn blue (#102), the keys named by what is printed
// on them and the gamepad last used driving (#19)

registerMessages(KART_MESSAGES)
const t = (key: string, params?: Record<string, string | number>) =>
  translate('en', key as `kart.${string}`, params)

describe('the touch BOOST button', () => {
  it('shows a burning boost as a ring running down, and locked in the classic feel', () => {
    const look = boostButtonLook(
      { storedBoosts: 1, boostLeft: HUD_STEPS / 4, boostLocked: true, boosting: true },
      2,
    )
    expect(look.state).toBe('burning')
    expect(look.locked).toBe(true)
    expect(look.left).toBe(0.25)
    expect(look.cells).toEqual(['charge', 'empty'])
  })

  it('is ready with a charge held, empty with none; a boost that may be stacked is not locked', () => {
    expect(boostButtonLook({ storedBoosts: 2, boosting: false }, 2)).toEqual({
      state: 'ready',
      locked: false,
      left: 0,
      cells: ['charge', 'charge'],
    })
    expect(boostButtonLook({ storedBoosts: 0, boostLeft: 0, boosting: false }, 2).state).toBe(
      'empty',
    )
    const arcade = boostButtonLook(
      { storedBoosts: 1, boostLeft: 10, boostLocked: false, boosting: true },
      2,
    )
    expect(arcade.state).toBe('burning')
    expect(arcade.locked).toBe(false)
  })

  it('in a team race draws the blue charges blue and first, the rest red', () => {
    const look = boostButtonLook({ storedBoosts: 2, teamBoosts: 1, boosting: false }, 3)
    expect(look.cells).toEqual(['blue', 'red', 'empty'])
    // Never more blue than held, nor more held than the kart can hold
    expect(boostButtonLook({ storedBoosts: 5, teamBoosts: 9, boosting: false }, 2).cells).toEqual([
      'blue',
      'blue',
    ])
  })
})

describe('a computer kart in a team race', () => {
  it('keeps its last red charge for the gauge to turn blue, once the gauge is nearly full', () => {
    expect(keepsForBlue(1, 0, 0.8, 0.6)).toBe(true)
    // Not yet near full: fired
    expect(keepsForBlue(1, 0, 0.4, 0.6)).toBe(false)
    // Two held: one is fired, one kept
    expect(keepsForBlue(2, 0, 0.9, 0.6)).toBe(false)
    // Blue already: nothing to wait for
    expect(keepsForBlue(1, 1, 0.9, 0.6)).toBe(false)
    // Any other race, or a level that does not wait
    expect(keepsForBlue(1, 0, undefined, 0.6)).toBe(false)
    expect(keepsForBlue(1, 0, 0.9, undefined)).toBe(false)
  })

  it('the normal, hard and expert levels wait; the easy one and the scripted drivers do not care', () => {
    expect(BOT_SKILLS.easy.teamSave).toBeUndefined()
    expect(BOT_SKILLS.normal.teamSave).toBeGreaterThan(0)
    expect(BOT_SKILLS.hard.teamSave).toBeGreaterThan(0)
    expect(EXPERT_SKILL.teamSave).toBeGreaterThan(0)
    // The wall: the hard and the expert watch it; people's hands (kart:feel, kart:meta) do not
    expect(BOT_SKILLS.hard.wallCare).toBeGreaterThan(0)
    expect(EXPERT_SKILL.wallCare).toBeGreaterThan(0)
    for (const driver of Object.values(DRIVERS)) expect(driver.skill.wallCare ?? 0).toBe(0)
  })
})

describe('what the keys are called', () => {
  const azerty = new Map([
    ['KeyQ', 'a'],
    ['KeyA', 'q'],
    ['KeyW', 'z'],
    ['KeyZ', 'w'],
    ['Digit1', '&'],
    ['Space', ' '],
  ])

  it('by what is printed on the key where the layout says, upper case', () => {
    expect(keycap('KeyQ', azerty)).toBe('A')
    expect(keyLabel('KeyZ', t, azerty)).toBe('W')
    expect(keyLabel('KeyW', t, azerty)).toBe('Z')
    expect(keyLabel('Digit1', t, azerty)).toBe('&')
  })

  it('by the place on a US keyboard where the browser does not say', () => {
    expect(keycap('KeyQ', null)).toBeNull()
    expect(keyLabel('KeyQ', t, null)).toBe('Q')
    expect(keyLabel('Digit2', t, azerty)).toBe('2')
    expect(keyLabel('KeyX', t, new Map())).toBe('X')
  })

  it('keys named by their place keep their names, whatever the layout', () => {
    expect(keyLabel('Space', t, azerty)).toBe('Space')
    expect(keyLabel('ArrowUp', t, azerty)).toBe('Up arrow')
    expect(keycap('Numpad1', new Map([['Numpad1', '1']]))).toBeNull()
  })
})

describe('several gamepads', () => {
  const pad = (index: number, active = false, standard = true): PadSeen => ({
    index,
    active,
    standard,
  })

  it('drives with the one last used, and any of them may take over', () => {
    expect(pickPad([], null)).toBeNull()
    // None used yet: the first on the standard layout
    expect(pickPad([pad(0, false, false), pad(1)], null)).toBe(1)
    // The second is pressed: it drives, and keeps driving when let go
    expect(pickPad([pad(0), pad(1, true)], 0)).toBe(1)
    expect(pickPad([pad(0), pad(1)], 1)).toBe(1)
    // Both held: the one driving goes on driving
    expect(pickPad([pad(0, true), pad(1, true)], 1)).toBe(1)
    // The one driving is unplugged: one with input, else the first
    expect(pickPad([pad(0), pad(2, true)], 1)).toBe(2)
    expect(pickPad([pad(0), pad(2)], 1)).toBe(0)
  })
})
