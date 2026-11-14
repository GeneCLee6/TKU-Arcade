import { describe, expect, it } from 'vitest'
import {
  color,
  colorVariables,
  palette,
  promotionBoard as board,
  space,
  type ColorName,
} from '../../src/styles/tokens.ts'
import { tradersPieces } from '../../src/styles/tradersTokens.ts'

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// A see-through colour (#RRGGBBAA) as it shows over an opaque one
function over(top: string, under: string): string {
  if (top.length === 7) return top
  const alpha = parseInt(top.slice(7, 9), 16) / 255
  const channel = (start: number) =>
    Math.round(
      parseInt(top.slice(start, start + 2), 16) * alpha +
        parseInt(under.slice(start, start + 2), 16) * (1 - alpha),
    )
      .toString(16)
      .padStart(2, '0')
  return `#${channel(1)}${channel(3)}${channel(5)}`
}

const readablePairs: [ColorName, ColorName][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['onAccent', 'accent'],
  // The two brand colours, and every game's hue, under the text on a primary button or a tag
  ['onAccent', 'brand'],
  ['onAccent', 'magenta'],
  ['onAccent', 'gamePromotion'],
  ['onAccent', 'gameSilentTable'],
  ['onAccent', 'gameSpectrum'],
  ['onAccent', 'gameBluffReader'],
  ['onAccent', 'gameOddWord'],
  ['onAccent', 'gameLantern'],
  ['onAccent', 'gameTiles'],
  ['onAccent', 'gameKite'],
  ['onAccent', 'gameTraders'],
  ['onAccent', 'gameSecretScroll'],
  ['onAccent', 'gameWasabi'],
  // ...and as text themselves: a public room's game, a link
  ['brand', 'bg'],
  ['gamePromotion', 'bg'],
  ['gameSilentTable', 'bg'],
  ['gameSpectrum', 'bg'],
  ['gameBluffReader', 'bg'],
  ['gameOddWord', 'bg'],
  ['gameLantern', 'bg'],
  ['gameTiles', 'bg'],
  ['gameKite', 'bg'],
  ['gameTraders', 'bg'],
  ['gameSecretScroll', 'bg'],
  ['gameWasabi', 'bg'],
  ['danger', 'surface'],
  ['danger', 'bg'],
  ['danger', 'surface'],
  ['success', 'surface'],
  ['warning', 'surface'],
  // Silent Table's reveal marks a right guess on the page's own colour (E1 found it short in light)
  ['success', 'bg'],
  ['warning', 'bg'],
  ['onSeat', 'seat0'],
  ['onSeat', 'seat1'],
  ['onSeat', 'seat2'],
  ['onSeat', 'seat3'],
  ['onSeat', 'seat4'],
  ['onSeat', 'seat5'],
  ['onFelt', 'feltPlain'],
  ['onFelt', 'feltDiving'],
  ['onFelt', 'feltClimbing'],
  ['cardInk', 'cardFace'],
  ['cardRed', 'cardFace'],
  ['tileSpade', 'tileFace'],
  ['tileHeart', 'tileFace'],
  ['tileDiamond', 'tileFace'],
  ['tileClub', 'tileFace'],
  ['tileJoker', 'tileFace'],
  ['chipInk', 'chipFace'],
]

describe('tokens', () => {
  it.each(['light', 'dark'] as const)('%s text pairs meet WCAG AA (4.5:1)', (theme) => {
    for (const [foreground, background] of readablePairs) {
      const ratio = contrast(palette[theme][foreground], palette[theme][background])
      expect(ratio, `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  // Glass and the sunken fills are see-through: what matters is how they come out over the page
  it.each(['light', 'dark'] as const)('%s text reads on glass and sunken fills', (theme) => {
    const p = palette[theme]
    const panel = over(p.panel, p.bg)
    const backgrounds = { panel, sunken: over(p.sunken, panel), raised: over(p.raised, panel) }
    for (const [name, background] of Object.entries(backgrounds)) {
      for (const foreground of ['text', 'muted', 'danger', 'success', 'warning'] as const) {
        const ratio = contrast(p[foreground], background)
        expect(ratio, `${foreground} on ${name}`).toBeGreaterThanOrEqual(4.5)
      }
    }
    const hues = [
      'accent',
      'gamePromotion',
      'gameSilentTable',
      'gameSpectrum',
      'gameBluffReader',
      'gameOddWord',
      'gameLantern',
      'gameTiles',
      'gameKite',
      'gameTraders',
      'gameSecretScroll',
      'gameWasabi',
    ] as const
    for (const hue of hues) {
      expect(contrast(p[hue], panel), `${hue} on panel`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('the promotion board, the same in both themes, has its text pairs at WCAG AA too', () => {
    const pairs: [string, string, string][] = [
      ['ink on paper', board.ink, board.paperHi],
      ['ink on shaded paper', board.ink, board.paperShade],
      ['seal', board.onSeal, board.seal],
      ['plaque', board.onPlaque, board.plaque],
      ['end', board.onEnd, board.end],
      ['end, light', board.onEnd, board.endHi],
      ...Object.entries(board.face).map(
        ([face, fill]): [string, string, string] => [face, board.onFace, fill],
      ),
    ]
    for (const [name, foreground, background] of pairs) {
      expect(contrast(foreground, background), name).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('the Tamsui Traders pieces have their text pairs at WCAG AA', () => {
    const pieces = tradersPieces
    const pairs: [string, string, string][] = [
      ['tea', pieces.onTea, pieces.tea],
      ['camphor', pieces.onCamphor, pieces.camphor],
      ['indigo', pieces.onIndigo, pieces.indigo],
      ['sugar', pieces.onSugar, pieces.sugar],
      ['pepper', pieces.onPepper, pieces.pepper],
      ['gold', pieces.onGold, pieces.gold],
      ['ink on paper', pieces.ink, pieces.paper],
      ['muted ink on paper', pieces.inkMuted, pieces.paper],
    ]
    for (const [name, foreground, background] of pairs) {
      expect(contrast(foreground, background), name).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('has the same colour names in both themes', () => {
    expect(Object.keys(palette.dark).sort()).toEqual(Object.keys(palette.light).sort())
  })

  it('exposes colours as CSS variables that each theme defines', () => {
    expect(color.accent).toBe('var(--color-accent)')
    const css = colorVariables(palette.dark)
    for (const name of Object.keys(palette.dark) as ColorName[]) {
      expect(css).toContain(`--color-${name}: ${palette.dark[name]};`)
    }
  })

  it('spaces on multiples of 4', () => {
    for (const value of Object.values(space)) expect(value % 4).toBe(0)
  })
})
