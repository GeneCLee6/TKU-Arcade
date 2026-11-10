import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FACES } from '../../../shared/games/promotion/board.ts'
import type { LastRoll } from '../../../shared/games/promotion/types.ts'
import { RollDisplay } from '../../../src/games/promotion/RollDisplay.tsx'
import { spunTo } from '../../../src/games/promotion/topSpin.ts'

const roll = (face: LastRoll['face']): LastRoll => ({
  seat: 0,
  face,
  dice: null,
  from: 'baiding',
  to: 'baiding',
})

const angleOf = (container: HTMLElement) =>
  Number(container.querySelector('[data-angle]')?.getAttribute('data-angle'))

/** Which face a turn of the top shows at the front */
const frontAt = (angle: number) => FACES[((Math.round(-angle / 90) % 4) + 4) % 4]

describe('spunTo', () => {
  it('turns at least the whole turns asked for, one way round, onto the face', () => {
    for (const from of [0, -90, -450, -1234]) {
      FACES.forEach((face, index) => {
        const to = spunTo(from, index, 4)
        expect(to).toBeLessThanOrEqual(from - 4 * 360)
        expect(to).toBeGreaterThan(from - 5 * 360)
        expect(frontAt(to)).toBe(face)
      })
    }
  })

  it('does not move when asked for no turns and already on the face', () => {
    expect(spunTo(-180, 2, 0)).toBe(-180)
  })
})

describe('the four-sided top', () => {
  it('has the four results round its sides and rests on the latest', () => {
    const { container } = render(<RollDisplay kind="four-sided" roll={roll('gong')} rolling={false} />)
    const faces = [...container.querySelectorAll('[data-face]')].map((face) => face.textContent)
    expect(faces).toEqual(['德', '才', '功', '贓'])
    expect(frontAt(angleOf(container))).toBe('gong')
  })

  it('spins several turns when a roll comes and lands on what was rolled', () => {
    const { container, rerender } = render(
      <RollDisplay kind="four-sided" roll={roll('de')} rolling={false} />,
    )
    const before = angleOf(container)
    rerender(<RollDisplay kind="four-sided" roll={roll('zang')} rolling />)
    const spun = angleOf(container)
    expect(before - spun).toBeGreaterThanOrEqual(4 * 360)
    expect(frontAt(spun)).toBe('zang')
    // Stopping does not move it again
    rerender(<RollDisplay kind="four-sided" roll={roll('zang')} rolling={false} />)
    expect(angleOf(container)).toBe(spun)
    // The same face again is a new spin all the same
    rerender(<RollDisplay kind="four-sided" roll={roll('zang')} rolling />)
    expect(spun - angleOf(container)).toBeGreaterThanOrEqual(4 * 360)
  })

  it('without a roll to watch just turns to the face', () => {
    const { container, rerender } = render(
      <RollDisplay kind="four-sided" roll={roll('de')} rolling={false} />,
    )
    rerender(<RollDisplay kind="four-sided" roll={roll('cai')} rolling={false} />)
    expect(frontAt(angleOf(container))).toBe('cai')
    expect(angleOf(container)).toBeGreaterThan(-360)
  })

  it('is not there in a game of dice', () => {
    const { container } = render(<RollDisplay kind="six-sided" roll={null} rolling={false} />)
    expect(container.querySelector('[data-angle]')).toBeNull()
    expect(container.querySelectorAll('rect')).toHaveLength(4)
  })
})
