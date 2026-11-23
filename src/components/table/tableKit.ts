// The board games' table in the broadcast language (docs/DESIGN.md §3.9, ARCHITECTURE §4.85): the
// panels, the felt, the nameplates, the scoreboard's numbers and places, and the phase bar that every
// game's screen shares, so that no game draws its own. Only looks: what a screen shows and how it plays
// stay its own. Colours only from tokens.ts. Kept small on purpose: every game's first screen loads it.
import styled, { css, keyframes } from 'styled-components'
import { clippedFill, cornerClip, displayType, monoType, SLANT, slantClip } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { Row } from '../roomParts.ts'

/** `color` at `percent` over `base`: the one way a tint is made here */
export const mix = (tint: string, percent: number, base = 'transparent'): string =>
  `color-mix(in srgb, ${tint} ${percent}%, ${base})`

/** Numbers that change (stacks, scores, counts): one width per digit, so that nothing shakes */
export const digits = css`
  ${monoType}
  font-weight: 800;
`

/**
 * A broadcast panel, in place of plain glass: the game's hue down from the top edge, a short bar of it
 * at the top left, a hairline round it and one cut corner. All on ::before, so focus rings stay whole.
 */
export const tablePanel = css`
  ${clippedFill(
    cornerClip(14),
    `linear-gradient(${color.accent}, ${color.accent}) 0 0 / 48px 3px no-repeat,
    linear-gradient(180deg, ${mix(color.accent, 10, color.panel)}, ${color.panel} 70%)`,
  )}

  &::before {
    box-shadow:
      inset 0 0 0 1px ${color.line},
      inset 0 1px 0 ${mix(color.accent, 40)};
  }

  @media (min-width: 900px) {
    &::before {
      -webkit-backdrop-filter: blur(14px);
      backdrop-filter: blur(14px);
    }
  }
`

/**
 * A game's table top: its own material (`base`: a felt, or the game's hue over the surface), lit from
 * above, darker at the edges, with a fine grid and a rim of the game's hue. Text on it keeps the
 * colour the screen gave it; the light and the shade stay within a few percent of `base`.
 */
export const tableSurface = (base: string) => css`
  background:
    radial-gradient(ellipse at 50% 0%, ${mix(color.onFelt, 9)}, transparent 60%),
    radial-gradient(ellipse at 50% 50%, transparent 55%, ${mix(color.chipInk, 22)}),
    repeating-linear-gradient(90deg, ${mix(color.onFelt, 3)} 0 1px, transparent 1px 32px),
    ${base};
  box-shadow:
    inset 0 0 0 1px ${mix(color.accent, 55)},
    0 0 ${space.xl}px ${mix(color.accent, 16)};
`

/** The game's hue thinly over the page's surface: a table top for a game without a felt */
export const hueSurface = tableSurface(mix(color.accent, 12, color.surface))

const pulse = keyframes`
  50% {
    box-shadow:
      inset 4px 0 0 var(--seat, transparent),
      0 0 0 3px ${mix(color.accent, 30)},
      0 0 ${space.xl}px ${mix(color.accent, 55)};
  }
`

/** Whose move it is: an outline in the game's hue and a slow glow. The screen also says it in words */
export const turnGlow = css`
  outline: 2px solid ${color.accent};
  outline-offset: -2px;
  box-shadow:
    inset 4px 0 0 var(--seat, transparent),
    0 0 0 2px ${mix(color.accent, 20)},
    0 0 ${space.lg}px ${mix(color.accent, 35)};
  animation: ${pulse} 1.6s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

/**
 * A nameplate: a bar of the seat's colour (`--seat`) down its left edge, that colour faint across it.
 * Pair with `turnGlow` for the seat whose move it is.
 */
export const nameplate = css`
  background: linear-gradient(90deg, ${mix('var(--seat, transparent)', 22, color.sunken)}, ${color.sunken} 65%);
  box-shadow: inset 4px 0 0 var(--seat, ${color.line});
`

/** A slanted solid tag, a broadcast's label: a round, a phase, "up now". Text always onAccent */
export const Ticker = styled.span<{ $tone?: 'accent' | 'magenta' }>`
  ${(p) => clippedFill(slantClip(7), p.$tone === 'magenta' ? color.magenta : color.accent)}
  display: inline-flex;
  align-items: center;
  flex: none;
  padding: 2px ${space.md}px;
  color: ${color.onAccent};
  ${displayType}
  font-size: 12px;
  line-height: 1.4;
  text-transform: uppercase;
  white-space: nowrap;
`

/** A place on a scoreboard: a slanted plate with the number, the lead one in the game's hue */
export const RankPlate = styled.span<{ $lead?: boolean }>`
  ${(p) => clippedFill(slantClip(5), p.$lead ? color.accent : color.raised)}
  display: inline-grid;
  place-items: center;
  flex: none;
  min-width: 30px;
  padding: 0 ${space.sm}px;
  color: ${(p) => (p.$lead ? color.onAccent : color.text)};
  ${digits}
  font-size: ${fontSize.sm}px;
  font-style: italic;
`

/**
 * The phase bar over a table: hairlines above and below, the game's hue fading in from the left, a
 * Ticker first. Holds a screen's own words for the round and the phase.
 */
export const PhaseBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px ${space.sm}px;
  min-height: 36px;
  padding: ${space.xs}px ${space.sm}px;
  background: linear-gradient(90deg, ${mix(color.accent, 22)}, ${mix(color.accent, 4)} 70%, transparent);
  box-shadow:
    inset 0 1px 0 ${mix(color.accent, 50)},
    inset 0 -1px 0 ${color.line};
  font-weight: 700;
`

/** A thin slanted mark before a line, in the game's hue: for headings inside a panel */
export const slantMark = css`
  &::before {
    content: '';
    display: inline-block;
    width: 8px;
    height: 0.9em;
    margin-right: ${space.sm}px;
    background: ${color.accent};
    transform: skewX(${SLANT});
  }
`

/** A panel with a heading and its contents: roomParts' `Section` in the broadcast look */
export const TableSection = styled.section`
  ${tablePanel}
  display: grid;
  gap: ${space.md}px;
  padding: ${space.lg}px;
`

/** A scoreboard's or a seat list's row as a nameplate: `$mark` (the seat's colour) down its left edge */
export const PlateRow = styled(Row)`
  background: linear-gradient(90deg, ${(p) => mix(p.$mark ?? color.line, 22, color.sunken)}, ${color.sunken} 65%);
`

/** A place on a scoreboard, ties sharing it: one more than the number of scores above */
export const placeOf = (scores: readonly number[], score: number): number =>
  1 + scores.filter((other) => other > score).length
