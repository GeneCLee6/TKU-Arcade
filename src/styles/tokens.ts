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
  // A seat's piece, the same in both themes so that a seat keeps its colour; onSeat reads on all six
  seat0: '#C2410C',
  seat1: '#1D4ED8',
  seat2: '#15803D',
  seat3: '#7E22CE',
  seat4: '#0F766E',
  seat5: '#BE185D',
  onSeat: '#FFFFFF',
  // Silent Table: the same in both themes, as a table and a deck of cards are
  feltPlain: '#14532D',
  feltDiving: '#0C4A6E',
  feltClimbing: '#44403C',
  onFelt: '#FFFFFF',
  cardFace: '#FFFFFF',
  cardInk: '#111827',
  cardRed: '#B91C1C',
  chipFace: '#FDE68A',
  chipInk: '#111827',
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
  seat0: '#C2410C',
  seat1: '#1D4ED8',
  seat2: '#15803D',
  seat3: '#7E22CE',
  seat4: '#0F766E',
  seat5: '#BE185D',
  onSeat: '#FFFFFF',
  feltPlain: '#14532D',
  feltDiving: '#0C4A6E',
  feltClimbing: '#44403C',
  onFelt: '#FFFFFF',
  cardFace: '#FFFFFF',
  cardInk: '#111827',
  cardRed: '#B91C1C',
  chipFace: '#FDE68A',
  chipInk: '#111827',
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

/** A seat's colour: its piece, and the avatar of whoever sits there during a game */
export const seatColor = (seat: number): string => color[`seat${seat % 6}` as ColorName]

export const avatarColors: readonly string[] = [0, 1, 2, 3, 4, 5].map(seatColor)

// The kart's 3D scene. Plain values, because WebGL materials cannot read CSS variables, and the same
// in both themes, because the scene's look does not follow the page's. Neutral on purpose: the
// visual style (PRD Q4) is still open.
export const kartScene = {
  sky: '#B9D3E6',
  ground: '#8A9A8C',
  gridLine: '#6B7A6E',
  body: '#C2410C',
  nose: '#F3F4F6',
  lightSky: '#FFFFFF',
  lightGround: '#6B7280',
} as const

// The promotion board (e3-t08): red lacquer with gold trim, rice-paper cells, red seals. Plain
// values, the same in both themes as a real board is (like Silent Table's felt): the board's SVG
// takes them as attributes, which cannot read CSS variables
export const promotionBoard = {
  lacquerHi: '#5E1616',
  lacquer: '#3A0B0B',
  lacquerDeep: '#220505',
  gold: '#C9A24A',
  goldDeep: '#8C6A2A',
  block: '#000000',
  plaque: '#240606',
  onPlaque: '#F2D58A',
  paperHi: '#FBF2DC',
  paper: '#EEDDB5',
  paperShade: '#DFC491',
  edge: '#8C6A3A',
  drop: '#4A2E12',
  ink: '#2A170B',
  seal: '#A81E1E',
  onSeal: '#FFF3E6',
  endHi: '#FFF0BE',
  end: '#EDBE4E',
  endDeep: '#B57A18',
  onEnd: '#4A2A05',
  select: '#2BE6FF',
  focus: '#FFE066',
  sheen: '#FFFFFF',
  shade: '#000000',
  // The four results, on the destination badges and the faces of the top
  face: { de: '#F5C542', cai: '#5EE0F5', gong: '#5FD58F', zang: '#F27482' },
  onFace: '#1A1206',
  // Hat buttons by grade, first to ninth (illustrative)
  knob: {
    ruby: '#D7263D',
    coral: '#F25C54',
    sapphire: '#3A86FF',
    lapis: '#22409A',
    crystal: '#EAF4FF',
    shell: '#F4EEDC',
    gold: '#E0B03A',
    engravedGold: '#B8892E',
  },
} as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const

export const radius = { component: 8, card: 16 } as const

export const fontSize = { sm: 14, md: 16, lg: 18, xl: 24, xxl: 32 } as const

export const lineHeight = 1.5

// Inter and Noto Sans TC are the design's fonts; no web font is bundled yet, so they apply only
// where installed and the system's own Latin and Traditional Chinese faces take over elsewhere.
// A Chinese nickname in the English interface falls through to the CJK faces glyph by glyph.
export const font = {
  // The promotion board's brush face (docs/ASSETS.md): LXGW WenKai TC where it loads, else whatever
  // kai the system has (BiauKai on a Mac, DFKai-SB on Windows), else a serif
  kai: "'LXGW WenKai TC', 'Kaiti TC', BiauKai, 'DFKai-SB', STKaiti, KaiTi, 'Noto Serif TC', 'PMingLiU', serif",
  sans: "Inter, 'Noto Sans TC', system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang TC', 'Microsoft JhengHei', sans-serif",
} as const
