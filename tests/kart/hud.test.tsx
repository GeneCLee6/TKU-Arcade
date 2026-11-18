import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KART_MESSAGES } from '../../shared/kart/i18n.ts'
import { INITIAL_KART, type KartState } from '../../shared/kart/physics.ts'
import { registerMessages, translate } from '../../src/i18n/t.ts'
import {
  aimOf,
  BOOST_FOV_KICK,
  fieldOfView,
  followCar,
  REFERENCE_SPEED,
  SLIDE_SWING,
  SPEED_FOV_KICK,
  startRig,
} from '../../src/kart/camera.ts'
import { calloutAtStart, calloutBetween, louder } from '../../src/kart/callouts.ts'
import { CalloutText, GAUGE_SEGMENTS, Hud } from '../../src/kart/Hud.tsx'
import type { SpikeHud } from '../../src/kart/spikeLoop.ts'

registerMessages(KART_MESSAGES)
const en = (key: string, params?: Record<string, string | number>) =>
  translate('en', key as `kart.${string}`, params)
const zh = (key: string, params?: Record<string, string | number>) =>
  translate('zh-TW', key as `kart.${string}`, params)

const HUD: SpikeHud = { speed: 0, gauge: 0, storedBoosts: 0, boosting: false, chain: 0, hits: 0 }
const DEGREE = Math.PI / 180

describe('the HUD', () => {
  // Owner, 2026-11-18: "everyone collects their own N2O, and there is a red one and a blue one"
  it('draws the charges a kart holds red and blue on its own panel, the blue ones first', () => {
    const hud = { ...HUD, storedBoosts: 2, teamBoosts: 1 }
    const { unmount } = render(<Hud t={en} hud={hud} maxStored={2} />)
    const stored = screen.getByRole('img', { name: 'Boosts ready: 1 red and 1 blue, of 2' })
    expect(stored).toHaveAttribute('data-red', '1')
    expect(stored).toHaveAttribute('data-blue', '1')
    expect([...stored.querySelectorAll('i')].map((one) => one.dataset.kind)).toEqual([
      'blue',
      'red',
    ])
    unmount()
    // None blue yet: both red. And in a race without sides there is neither
    const red = render(<Hud t={zh} hud={{ ...hud, teamBoosts: 0 }} maxStored={2} />)
    expect(screen.getByRole('img', { name: '可用噴射：紅 2、藍 0（最多 2）' })).toBeInTheDocument()
    red.unmount()
    render(<Hud t={en} hud={{ ...HUD, storedBoosts: 2 }} maxStored={2} />)
    const plain = screen.getByRole('img', { name: 'Boosts ready: 2 of 2' })
    expect(plain).not.toHaveAttribute('data-blue')
    expect(plain.querySelector('[data-kind]')).toBeNull()
  })

  it('shows the speed, the gauge in segments and the stored boosts', () => {
    render(<Hud t={en} hud={{ ...HUD, speed: 108, gauge: 47, storedBoosts: 1 }} maxStored={2} />)
    expect(screen.getByTestId('kart-speed')).toHaveTextContent('108')
    expect(screen.getByText('km/h')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Boost gauge' })).toHaveAttribute(
      'aria-valuenow',
      '47',
    )
    expect(screen.getByText('47%')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Boosts ready: 1 of 2' })).toBeInTheDocument()
    const segments = screen.getByTestId('kart-gauge').children
    expect(segments).toHaveLength(GAUGE_SEGMENTS)
    expect(screen.queryByTestId('kart-boosting')).toBeNull()
  })

  it('says BOOST in a boost and CHAIN ×n in a chained one, in either language', () => {
    const { rerender } = render(<Hud t={en} hud={{ ...HUD, boosting: true }} maxStored={2} />)
    expect(screen.getByTestId('kart-boosting')).toHaveTextContent('Boost')
    rerender(<Hud t={en} hud={{ ...HUD, boosting: true, chain: 3 }} maxStored={2} />)
    expect(screen.getByTestId('kart-boosting')).toHaveTextContent('Chain ×3')
    rerender(<Hud t={zh} hud={{ ...HUD, boosting: true, chain: 3 }} maxStored={3} />)
    expect(screen.getByTestId('kart-boosting')).toHaveTextContent('連噴 ×3')
    expect(screen.getByRole('img', { name: '可用噴射：0／3' })).toBeInTheDocument()
  })

  // 2026-11-18, owner: "it should take a big drift to boost"
  it('shows how deep the drift is until the instant boost is earned, then the gold prompt', () => {
    const { rerender } = render(<Hud t={en} hud={HUD} maxStored={2} />)
    expect(screen.queryByTestId('kart-depth')).toBeNull()
    rerender(<Hud t={en} hud={{ ...HUD, depth: 9 }} maxStored={2} />)
    const meter = screen.getByRole('meter', { name: 'Hold the drift' })
    expect(meter).toHaveAttribute('aria-valuenow', '45')
    expect(screen.queryByTestId('kart-dash')).toBeNull()
    // Earned: the meter gives way to the prompt
    rerender(<Hud t={zh} hud={{ ...HUD, depth: 20, dash: 1 }} maxStored={2} />)
    expect(screen.queryByTestId('kart-depth')).toBeNull()
    expect(screen.getByTestId('kart-dash')).toHaveTextContent('瞬間加速 已備妥')
  })

  // 2026-11-18, owner: "normally one has to end before the next"
  it('shows the running boost running down, and the charges locked until it ends', () => {
    const boosting = { ...HUD, storedBoosts: 1, boosting: true, boostLeft: 12, boostLocked: true }
    const { rerender } = render(<Hud t={en} hud={boosting} maxStored={2} />)
    expect(screen.getByRole('meter', { name: 'Boost time left' })).toHaveAttribute(
      'aria-valuenow',
      '60',
    )
    expect(
      screen.getByRole('img', { name: 'Boosts ready: 1 of 2, once this boost ends' }),
    ).toHaveAttribute('data-locked')
    // Over: no bar, and the charge can be fired
    rerender(<Hud t={en} hud={{ ...HUD, storedBoosts: 1 }} maxStored={2} />)
    expect(screen.queryByTestId('kart-boost-left')).toBeNull()
    expect(screen.getByRole('img', { name: 'Boosts ready: 1 of 2' })).not.toHaveAttribute(
      'data-locked',
    )
    rerender(<Hud t={zh} hud={boosting} maxStored={2} />)
    expect(
      screen.getByRole('img', { name: '可用噴射：1／2（這次噴完才能再噴）' }),
    ).toBeInTheDocument()
  })

  it('shows a callout with the words for it, hidden from screen readers', () => {
    render(<CalloutText t={en} callout={{ kind: 'chain', count: 2 }} />)
    const callout = screen.getByTestId('kart-callout')
    expect(callout).toHaveTextContent('Combo ×2')
    expect(callout).toHaveAttribute('aria-hidden', 'true')
  })

  // 2026-11-18: the gauge by the quality of the drift (docs/KART-FEEL.md §3.5)
  it('shows the combo from two in a row, and what an exit has just added to the gauge', () => {
    const { rerender } = render(<Hud t={en} hud={{ ...HUD, combo: 0, gains: 0 }} maxStored={2} />)
    expect(screen.queryByTestId('kart-combo')).toBeNull()
    expect(screen.queryByTestId('kart-gain')).toBeNull()
    rerender(<Hud t={en} hud={{ ...HUD, combo: 3, gains: 4, gain: 38, grade: 3 }} maxStored={2} />)
    expect(screen.getByTestId('kart-combo')).toHaveTextContent('Combo ×3')
    const gain = screen.getByTestId('kart-gain')
    expect(gain).toHaveTextContent('+38')
    expect(gain).toHaveAttribute('data-grade', '3')
    expect(gain).toHaveAccessibleName('Gauge up 38')
    // An exit that added nothing (a wall touched in the drift) shows no number
    rerender(<Hud t={en} hud={{ ...HUD, combo: 3, gains: 5, gain: 0, grade: 2 }} maxStored={2} />)
    expect(screen.queryByTestId('kart-gain')).toBeNull()
    rerender(<Hud t={zh} hud={{ ...HUD, combo: 2, gains: 6, gain: 12, grade: 2 }} maxStored={2} />)
    expect(screen.getByTestId('kart-combo')).toHaveTextContent('連段 ×2')
    expect(screen.getByTestId('kart-gain')).toHaveAccessibleName('加速條增加 12')
  })

  it('says when the drift has lasted long enough for a perfect exit', () => {
    const { rerender } = render(<Hud t={en} hud={{ ...HUD, dash: 1 }} maxStored={2} />)
    expect(screen.getByTestId('kart-dash')).toHaveTextContent('Instant boost earned')
    expect(screen.getByTestId('kart-dash')).not.toHaveAttribute('data-perfect')
    rerender(<Hud t={en} hud={{ ...HUD, dash: 1, perfectReady: true }} maxStored={2} />)
    expect(screen.getByTestId('kart-dash')).toHaveTextContent('Perfect ready: let go and tap!')
    expect(screen.getByTestId('kart-dash')).toHaveAttribute('data-perfect')
    // Let go: the prompt to press forward, as ever
    rerender(<Hud t={en} hud={{ ...HUD, dash: 2, perfectReady: false }} maxStored={2} />)
    expect(screen.getByTestId('kart-dash')).toHaveTextContent('Let go, then tap forward!')
  })

  it('a perfect exit is called out, with the combo it has reached; a late one too', () => {
    const { rerender } = render(<CalloutText t={en} callout={{ kind: 'perfect', count: 1 }} />)
    expect(screen.getByTestId('kart-callout')).toHaveTextContent('Perfect!')
    rerender(<CalloutText t={zh} callout={{ kind: 'perfect', count: 4 }} />)
    expect(screen.getByTestId('kart-callout')).toHaveTextContent('完美！連段 ×4')
    rerender(<CalloutText t={en} callout={{ kind: 'late', count: 0 }} />)
    expect(screen.getByTestId('kart-callout')).toHaveTextContent('Late')
  })
})

describe('callouts', () => {
  const drifting: KartState = { ...INITIAL_KART, drifting: true, driftDirection: 1 }

  it('calls out the timing of an instant boost in the classic feel: perfect, late, or nothing more', () => {
    const before: KartState = { ...INITIAL_KART, dashCount: 2, chain: 2 }
    const fired = (grade: number, chain: number): KartState => ({
      ...before,
      dashCount: 3,
      dashGrade: grade,
      chain,
      miniSeconds: 0.7,
    })
    expect(calloutBetween(before, fired(3, 3))).toEqual({ kind: 'perfect', count: 3 })
    expect(calloutBetween(before, fired(1, 2))).toEqual({ kind: 'late', count: 0 })
    // A good one is the combo's callout, as an instant boost always was
    expect(calloutBetween(before, fired(2, 3))).toEqual({ kind: 'chain', count: 3 })
  })

  it('calls out a drift starting, a boost fired and a chain', () => {
    expect(calloutBetween(INITIAL_KART, drifting)).toEqual({ kind: 'drift', count: 0 })
    expect(calloutBetween(drifting, drifting)).toBeUndefined()
    expect(
      calloutBetween(
        { ...drifting, storedBoosts: 1 },
        { ...drifting, storedBoosts: 0, boostSeconds: 1.2 },
      ),
    ).toEqual({ kind: 'boost', count: 0 })
    expect(
      calloutBetween(
        { ...INITIAL_KART, chain: 1, miniSeconds: 0.1 },
        { ...INITIAL_KART, chain: 2, miniSeconds: 0.6 },
      ),
    ).toEqual({ kind: 'chain', count: 2 })
  })

  it('calls out the techniques: a release boost, a boost slide, the start', () => {
    expect(calloutBetween(INITIAL_KART, { ...INITIAL_KART, chain: 1, miniSeconds: 0.6 })).toEqual({
      kind: 'release',
      count: 0,
    })
    const boosting = { ...INITIAL_KART, boostSeconds: 1 }
    expect(
      calloutBetween(boosting, { ...boosting, drifting: true, driftDirection: 1, sliding: true }),
    ).toEqual({ kind: 'slide', count: 0 })
    expect(calloutAtStart('boost')).toEqual({ kind: 'start', count: 0 })
    expect(calloutAtStart('stall')).toEqual({ kind: 'stall', count: 0 })
    expect(calloutAtStart('none')).toBeUndefined()
  })

  it('calls out the double by name, not as one more link of the chain', () => {
    const first = { ...INITIAL_KART, chain: 1, miniSeconds: 0.5 }
    expect(calloutBetween(first, { ...first, chain: 2, miniSeconds: 1.2, doubles: 1 })).toEqual({
      kind: 'double',
      count: 0,
    })
    expect(en('kart.callout.double')).toBe('Double!')
    expect(zh('kart.callout.double')).toBe('雙收尾！')
  })

  it('has words for every callout in both languages', () => {
    for (const kind of ['start', 'stall', 'release', 'slide'] as const) {
      const { unmount } = render(<CalloutText t={en} callout={{ kind, count: 0 }} />)
      expect(screen.getByTestId('kart-callout').textContent).toBe(en(`kart.callout.${kind}`))
      unmount()
    }
    expect(zh('kart.callout.slide')).toBe('推滑')
  })

  it('keeps the louder of two in one frame', () => {
    const drift = { kind: 'drift', count: 0 } as const
    const chain = { kind: 'chain', count: 1 } as const
    expect(louder(chain, drift)).toBe(chain)
    expect(louder(drift, chain)).toBe(chain)
    expect(louder(undefined, drift)).toBe(drift)
  })
})

describe('the chase camera', () => {
  it('aims along the travel in a drift, and along the nose when slow or reversing', () => {
    const slip = 25 * DEGREE
    const sliding = { heading: 0.5, vx: 20 * Math.sin(0.5 - slip), vz: -20 * Math.cos(0.5 - slip) }
    expect(aimOf({ ...sliding, boosting: false })).toBeCloseTo(0.5 - slip, 9)
    expect(aimOf({ heading: 0.5, vx: 0.5, vz: 0, boosting: false })).toBe(0.5)
    expect(aimOf({ heading: 0, vx: 0, vz: 5, boosting: false })).toBe(0)
  })

  it('swings part of the way round with the nose while the car slides, and lags', () => {
    const slip = 40 * DEGREE
    const car = { heading: 0.5, vx: 40 * Math.sin(0.5 - slip), vz: -40 * Math.cos(0.5 - slip) }
    const sliding = { ...car, boosting: false, skidding: true }
    expect(aimOf(sliding)).toBeCloseTo(0.5 - slip + slip * SLIDE_SWING, 9)
    // Slower to follow than when the car grips
    const gripping = followCar(startRig(0), { ...car, boosting: false }, 0.1)
    const slid = followCar(startRig(0), { ...sliding, heading: 0.5 - slip }, 0.1)
    expect(Math.abs(slid.heading)).toBeLessThan(Math.abs(gripping.heading))
  })

  it('swings round the same way whatever the frame rate', () => {
    const car = { heading: 1, vx: 20 * Math.sin(1), vz: -20 * Math.cos(1), boosting: true }
    let at30 = startRig(0)
    for (let frame = 0; frame < 15; frame++) at30 = followCar(at30, car, 1 / 30)
    let at144 = startRig(0)
    for (let frame = 0; frame < 72; frame++) at144 = followCar(at144, car, 1 / 144)
    expect(at144.heading).toBeCloseTo(at30.heading, 9)
    expect(at144.boost).toBeCloseTo(at30.boost, 9)
    expect(at30.heading).toBeGreaterThan(0.8)
    expect(at30.heading).toBeLessThan(1)
  })

  it('widens the view in a boost, unless motion is reduced', () => {
    const rig = { heading: 0, boost: 1, pace: 0 }
    expect(fieldOfView(60, rig, false)).toBe(60 + BOOST_FOV_KICK)
    expect(fieldOfView(60, rig, true)).toBe(60)
    expect(fieldOfView(60, startRig(0), false)).toBe(60)
  })

  it('widens the view with speed too, fully at the top speed', () => {
    expect(fieldOfView(60, { heading: 0, boost: 0, pace: 1 }, false)).toBe(60 + SPEED_FOV_KICK)
    // 60° to 75° (2026-11-17, the classic feel)
    expect(fieldOfView(60, { heading: 0, boost: 0, pace: 0.65 }, false)).toBeCloseTo(67.5, 9)
    expect(SPEED_FOV_KICK).toBe(15)
    expect(BOOST_FOV_KICK).toBe(8)
    expect(fieldOfView(60, { heading: 0, boost: 1, pace: 1.4 }, true)).toBe(60)
    // The pace follows the speed
    let rig = startRig(0)
    const car = { heading: 0, vx: 0, vz: -REFERENCE_SPEED, boosting: false }
    for (let frame = 0; frame < 120; frame++) rig = followCar(rig, car, 1 / 60)
    expect(rig.pace).toBeCloseTo(1, 2)
  })
})
