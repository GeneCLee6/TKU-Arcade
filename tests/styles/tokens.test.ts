import { describe, expect, it } from 'vitest'
import { color, colorVariables, palette, space, type ColorName } from '../../src/styles/tokens.ts'

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const readablePairs: [ColorName, ColorName][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['onAccent', 'accent'],
  ['danger', 'bg'],
  ['danger', 'surface'],
  ['success', 'surface'],
  ['warning', 'surface'],
  ['onSeat', 'seat0'],
  ['onSeat', 'seat1'],
  ['onSeat', 'seat2'],
  ['onSeat', 'seat3'],
  ['onSeat', 'seat4'],
  ['onSeat', 'seat5'],
  ['text', 'boardTier0'],
  ['text', 'boardTier1'],
  ['text', 'boardTier2'],
  ['text', 'boardTier3'],
  ['onBoardEnd', 'boardEnd'],
]

describe('tokens', () => {
  it.each(['light', 'dark'] as const)('%s text pairs meet WCAG AA (4.5:1)', (theme) => {
    for (const [foreground, background] of readablePairs) {
      const ratio = contrast(palette[theme][foreground], palette[theme][background])
      expect(ratio, `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5)
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
