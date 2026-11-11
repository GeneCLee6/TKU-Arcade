// The esports shell's shapes and type (E1, e7-t14; docs/DESIGN.md §3): slants, cut corners, glass and
// the display faces. Colours still come only from tokens.ts.
import { css } from 'styled-components'
import { color, font } from './tokens.ts'

/** The shell's one angle: tabs, tags and buttons lean this far */
export const SLANT = '-14deg'

/** A parallelogram that leans like SLANT: `cut` px off the bottom left and the top right */
export const slantClip = (cut: number): string =>
  `polygon(${cut}px 0, 100% 0, calc(100% - ${cut}px) 100%, 0 100%)`

/** A panel's one cut corner, at the top right */
export const cornerClip = (cut: number): string =>
  `polygon(0 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% 100%, 0 100%)`

/**
 * Paints a clipped shape behind an element, on its ::before. The element itself is not clipped, so
 * neither is its own focus ring nor that of anything inside it (a clip-path cuts outlines off).
 */
export const clippedFill = (clip: string, fill: string) => css`
  position: relative;
  isolation: isolate;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: ${fill};
    clip-path: ${clip};
    pointer-events: none;
  }
`

/** A glass panel: see-through over the grid floor, a hairline edge, one corner cut */
export const glass = css`
  ${clippedFill(cornerClip(16), color.panel)}

  &::before {
    box-shadow: inset 0 0 0 1px ${color.line};
  }

  /* Blur is for a screen with room to show it; a phone gets the plain, cheaper glass */
  @media (min-width: 900px) {
    &::before {
      -webkit-backdrop-filter: blur(14px);
      backdrop-filter: blur(14px);
    }
  }
`

/**
 * Headings: Saira italic heavy for Latin, Noto Sans TC 900 upright for Chinese. A CJK glyph inside
 * Latin type (a nickname) is never slanted by the browser, as a fake italic of a CJK face looks broken.
 */
export const displayType = css`
  font-family: ${font.display};
  font-style: italic;
  font-weight: 900;
  font-synthesis-style: none;
  letter-spacing: 0.02em;
  line-height: 1.15;

  &:lang(zh) {
    font-family: ${font.displayZh};
    font-style: normal;
    letter-spacing: 0.06em;
  }
`

/** Small mono labels and numbers: seat numbers, counts, room ids */
export const monoType = css`
  font-family: ${font.mono};
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
`
