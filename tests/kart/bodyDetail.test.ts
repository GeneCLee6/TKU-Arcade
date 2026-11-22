import { describe, expect, it } from 'vitest'
import {
  BODY_DETAIL,
  bodyDetailTexture,
  DETAIL_TILE,
  paintBodyDetail,
  wearDecal,
} from '../../src/kart/art/bodyDetail.ts'

// 2026-11-22 (#99): the bodies' fine detail, by the quality. Low loads none of it; medium the seams
// and the screws; high the wear and the grain as well, on a tile twice the size

/** A 2D context that only counts what is drawn */
function counting() {
  const calls = { rects: 0, arcs: 0, strokes: 0, outs: 0 }
  const context = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillRect: () => calls.rects++,
    beginPath: () => {},
    arc: () => calls.arcs++,
    fill: () => {
      if (context.globalCompositeOperation === 'destination-out') calls.outs++
    },
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => calls.strokes++,
    save: () => {},
    restore: () => {},
  }
  return { context: context as unknown as CanvasRenderingContext2D, calls }
}

describe('the body detail', () => {
  it('low draws none of it, medium and high do, high on the bigger tile', () => {
    expect(BODY_DETAIL.low).toBe('off')
    expect(BODY_DETAIL.medium).toBe('medium')
    expect(BODY_DETAIL.high).toBe('high')
    expect(bodyDetailTexture('off')).toBeNull()
    expect(DETAIL_TILE.high).toBe(DETAIL_TILE.medium * 2)
  })

  it('medium: a grid of seams and a pair of screws on every panel; high adds the wear and grain', () => {
    const medium = counting()
    paintBodyDetail(medium.context, 256, false, () => 0.5)
    // 4 rows of panels: a seam along each row and 4 joints in it; 2 screws a panel, 2 arcs each
    expect(medium.calls.arcs).toBe(4 * 4 * 2 * 2)
    expect(medium.calls.rects).toBe(1 + 4 * 5)
    expect(medium.calls.strokes).toBe(0)
    const high = counting()
    paintBodyDetail(high.context, 512, true, () => 0.5)
    expect(high.calls.strokes).toBeGreaterThan(10)
    expect(high.calls.rects).toBeGreaterThan(medium.calls.rects + 1000)
  })

  it('wears a decal: chips cut out of it, the same for the same seed', () => {
    const one = counting()
    wearDecal(one.context, 128, 64, 7)
    expect(one.calls.outs).toBeGreaterThan(5)
    const two = counting()
    wearDecal(two.context, 128, 64, 7)
    expect(two.calls).toEqual(one.calls)
  })
})
