// 2026-11-18 (owner: "more esports ... it looks like a child's toy"): the kart's interface as a race
// broadcast draws it (docs/DESIGN.md §3.6). Panels with two corners cut and a short bar of the
// accent at the top left, as a lower third has; slanted tickers for a place and a lap; numbers in the
// mono face, every digit as wide as the next, so that a running clock does not jitter; and big words
// (3, 2, 1, GO, a perfect start) that slam in. Shapes and motion only: colours come from tokens.ts,
// and everything that moves stands still under prefers-reduced-motion.
//
// Only the kart's screens load this (its chunk, and the race room's): the shell keeps esports.ts.
import { css, keyframes } from 'styled-components'
import { clippedFill, monoType } from '../../styles/esports.ts'
import { color } from '../../styles/tokens.ts'

/** A panel's cut: the top right and the bottom left corners, `cut` px each */
export const cutClip = (cut: number): string =>
  `polygon(0 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% 100%, ${cut}px 100%, 0 calc(100% - ${cut}px))`

const flat = (fill: string) => `linear-gradient(${fill}, ${fill})`

/** The panel's paint over `fill`: the accent's bar at the top left, a hairline top and bottom */
const panelFill = (fill: string) =>
  [
    `${flat(color.accent)} 0 0 / 36px 3px no-repeat`,
    `${flat(color.line)} 0 0 / 100% 1px no-repeat`,
    `${flat(color.line)} 0 100% / 100% 1px no-repeat`,
    fill,
  ].join(', ')

/**
 * A broadcast panel, in place of the shell's glass: over the race, behind a clock, a place, a list
 * of standings. The element itself is not clipped, so focus rings inside it are whole
 */
// Blur is for a screen with room to show it; a phone gets the plain, cheaper panel
export const broadcast = css`
  ${clippedFill(cutClip(12), panelFill(color.panel))}

  @media (min-width: 900px) {
    &::before {
      -webkit-backdrop-filter: blur(10px);
      backdrop-filter: blur(10px);
    }
  }
`

/** The same shape, solid: a panel of text over the race (the garage), which must not show through */
export const broadcastSolid = css`
  ${clippedFill(cutClip(12), panelFill(color.surface))}
`

/** A ticker: a slanted bar of a solid colour behind a short label (a place, a lap, a tag) */
export const ticker = (fill: string, cut = 8) => css`
  ${clippedFill(`polygon(${cut}px 0, 100% 0, calc(100% - ${cut}px) 100%, 0 100%)`, fill)}
`

/** A clock's digits: mono, every digit as wide as the next, a little tighter than a label */
export const digits = css`
  ${monoType}
  font-weight: 700;
  letter-spacing: 0.02em;
`

const slamIn = keyframes`
  0% { opacity: 0; transform: scale(2.6) skewX(-14deg); filter: blur(6px); }
  55% { opacity: 1; transform: scale(0.94) skewX(-14deg); filter: blur(0); }
  100% { opacity: 1; transform: scale(1) skewX(0deg); filter: blur(0); }
`

/** A big word slams in: from far too big and leaning, to its place. Still under reduced motion */
export const slam = (ms = 380) => css`
  animation: ${slamIn} ${ms}ms cubic-bezier(0.2, 0.9, 0.2, 1) both;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const streakOut = keyframes`
  0% { transform: scaleX(0); opacity: 0.9; }
  60% { transform: scaleX(1); opacity: 0.7; }
  100% { transform: scaleX(1); opacity: 0; }
`

/**
 * A streak across the screen behind a big word, on the element's ::after: it runs out from the
 * middle and fades. None under reduced motion
 */
export const streak = (fill: string) => css`
  &::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 8%;
    right: 8%;
    z-index: -1;
    height: 3px;
    margin-top: -1px;
    background: linear-gradient(90deg, transparent, ${fill} 30%, ${fill} 70%, transparent);
    pointer-events: none;
    animation: ${streakOut} 700ms ease-out both;
  }

  @media (prefers-reduced-motion: reduce) {
    &::after {
      display: none;
    }
  }
`

/** A big word's outline: the two brand colours split a few pixels either side, as a replay wipe */
export const splitShadow = `3px 0 0 color-mix(in srgb, ${color.magenta} 70%, transparent), -3px 0 0 color-mix(in srgb, ${color.accent} 70%, transparent), 0 0 28px ${color.accent}`
