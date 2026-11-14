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

  it('shows a callout with the words for it, hidden from screen readers', () => {
    render(<CalloutText t={en} callout={{ kind: 'chain', count: 2 }} />)
    const callout = screen.getByTestId('kart-callout')
    expect(callout).toHaveTextContent('Chain ×2')
    expect(callout).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('callouts', () => {
  const drifting: KartState = { ...INITIAL_KART, drifting: true, driftDirection: 1 }

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
    expect(fieldOfView(60, { heading: 0, boost: 0, pace: 0.65 }, false)).toBeCloseTo(65, 9)
    expect(fieldOfView(60, { heading: 0, boost: 1, pace: 1.4 }, true)).toBe(60)
    // The pace follows the speed
    let rig = startRig(0)
    const car = { heading: 0, vx: 0, vz: -REFERENCE_SPEED, boosting: false }
    for (let frame = 0; frame < 120; frame++) rig = followCar(rig, car, 1 / 60)
    expect(rig.pace).toBeCloseTo(1, 2)
  })
})
