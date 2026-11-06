// The only source of colours, spacing, radii and type sizes (CLAUDE.md rule 5, docs/DESIGN.md §2).
// Components read `color.*`, which are CSS variables, so a theme change needs no re-render.

const light = {
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  text: '#111827',
  muted: '#4B5563',
  border: '#D1D5DB',
  // Neutral outside a game (DESIGN §1). A game's theme colour (e7-t12) overrides --color-accent and
  // --color-onAccent on its own subtree, so components need no per-game logic.
  accent: '#334155',
  onAccent: '#FFFFFF',
  success: '#15803D',
  danger: '#B91C1C',
  warning: '#B45309',
  overlay: '#11182780',
  // The same in both themes: a QR code only scans reliably dark on light
  qrDark: '#000000',
  qrLight: '#FFFFFF',
}

export type ColorName = keyof typeof light

const dark: Record<ColorName, string> = {
  bg: '#111827',
  surface: '#1F2937',
  text: '#F3F4F6',
  muted: '#9CA3AF',
  border: '#374151',
  accent: '#E2E8F0',
  onAccent: '#0F172A',
  success: '#4ADE80',
  danger: '#F87171',
  warning: '#FBBF24',
  overlay: '#00000099',
  qrDark: '#000000',
  qrLight: '#FFFFFF',
}

// Raw values: only GlobalStyle (to define the variables) and the contrast tests should read these
export const palette = { light, dark } as const

const colorNames = Object.keys(light) as ColorName[]

export const color = Object.fromEntries(
  colorNames.map((name) => [name, `var(--color-${name})`]),
) as Record<ColorName, string>

// The CSS declarations that define one theme's variables
export const colorVariables = (theme: Record<ColorName, string>): string =>
  colorNames.map((name) => `--color-${name}: ${theme[name]};`).join('\n')

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const

export const radius = { component: 8, card: 16 } as const

export const fontSize = { sm: 14, md: 16, lg: 18, xl: 24, xxl: 32 } as const

export const lineHeight = 1.5

// Inter and Noto Sans TC are the design's fonts; no web font is bundled yet, so they apply only
// where installed and the system's own Latin and Traditional Chinese faces take over elsewhere.
// A Chinese nickname in the English interface falls through to the CJK faces glyph by glyph.
export const font = {
  sans: "Inter, 'Noto Sans TC', system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang TC', 'Microsoft JhengHei', sans-serif",
} as const
