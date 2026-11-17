import type { CSSProperties } from 'react'
import { css } from 'styled-components'
import { buttonPx, type TouchSettings } from '../../../shared/kart/touch.ts'
import { space } from '../../styles/tokens.ts'

// Where the touch buttons sit (TouchControls.tsx) and how the race screens keep the HUD and the
// minimap clear of them (docs/ARCHITECTURE.md §4.25). Its own file, so that a screen reads it
// without the buttons' component.

/** Gap between buttons, px */
export const GAP = space.sm
/** Small buttons (reset, settings): the touch minimum */
export const SMALL = 48
/** The steering buttons are this much bigger than the rest */
export const STEER_SCALE = 1.2
/** The slider is this many buttons wide; full lock is this many buttons' drag from the start */
export const SLIDER_WIDTH = 2.6
export const SLIDER_REACH = 1.1

/** The two clusters' sizes, px: what the HUD and the minimap keep clear of */
export function touchFootprint(settings: TouchSettings): {
  steer: { width: number; height: number }
  actions: { width: number; height: number }
} {
  const size = buttonPx(settings)
  const steer = Math.round(size * STEER_SCALE)
  return {
    steer: {
      width: settings.steer === 'slider' ? Math.round(size * SLIDER_WIDTH) : 2 * steer + GAP,
      height: steer,
    },
    actions: { width: 2 * size + GAP, height: SMALL + 3 * size + 3 * GAP },
  }
}

/**
 * CSS variables for the page while the buttons show: `--touch-left`, `--touch-right` (how much of
 * each bottom corner they take, edge and gap included) and `--touch-tall` (the taller cluster)
 */
export function touchSpace(settings: TouchSettings): CSSProperties {
  const { steer, actions } = touchFootprint(settings)
  const left = settings.leftHanded ? actions : steer
  const right = settings.leftHanded ? steer : actions
  return {
    '--touch-left': `${left.width + 2 * space.sm}px`,
    '--touch-right': `${right.width + 2 * space.sm}px`,
    '--touch-tall': `${Math.max(steer.height, actions.height) + 2 * space.sm}px`,
  } as CSSProperties
}

/** The HUD's row between the touch buttons; above them when the phone is upright */
export const touchBottom = css`
  left: var(--touch-left);
  right: var(--touch-right);
  /* Nothing in it to press (the how-to is folded away): a tap goes through to the race */
  pointer-events: none;

  @media (orientation: portrait) {
    left: ${space.sm}px;
    right: ${space.sm}px;
    bottom: var(--touch-tall);
  }
`

/**
 * The map corner on a short screen with the buttons showing: the map beside the clock rather than
 * under it, to stay clear of the buttons; over the steering, since the tall cluster has the other
 * side (on the left for a right-handed layout)
 */
export const touchCorner = (side: 'left' | 'right') => css`
  @media (max-height: 500px) {
    ${
      side === 'left' &&
      css`
        right: auto;
        left: ${space.sm}px;
        justify-items: start;
      `
    }
    align-items: start;
    grid-template-columns: auto auto;

    & > * {
      grid-column: 1;
    }

    & > :last-child {
      grid-column: 2;
      grid-row: 1 / span 2;
    }
  }
`
