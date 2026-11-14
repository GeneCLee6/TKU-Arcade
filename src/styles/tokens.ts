// The only source of colours, spacing, radii and type sizes (CLAUDE.md rule 5, docs/DESIGN.md §2).
// Components read `color.*`, which are CSS variables, so a theme change needs no re-render.
//
// The esports direction (E1, e7-t14): a night palette with cyan and magenta, and one hue per game.
// Dark is the default look; light is the same design by day, and passes the same contrast tests.

const light = {
  bg: '#E9EDF7',
  // Solid: a dialog, a toast, a row that must not show what is behind it
  surface: '#FFFFFF',
  // Glass: a panel over the grid floor, see-through enough to show it
  panel: '#FFFFFFD9',
  // Sunk into a panel: a chat log, an input
  sunken: '#F4F6FC',
  // A control's own fill on a panel (a secondary button, an unpressed segment), and its hover
  raised: '#0A0D1F12',
  raisedHover: '#0A0D1F21',
  text: '#0A0D1F',
  muted: '#474F75',
  border: '#C3C9E0',
  // A panel's hairline edge
  line: '#3A4A9A2E',
  // The site's own two colours: cyan for what you press, magenta for what is live
  brand: '#006E80',
  magenta: '#C2135F',
  // The current hue: the brand outside a game; a game's hue (gameHue) on its own subtree, and on the
  // whole page while one of its rooms is open (GlobalStyle), so components need no per-game logic
  accent: '#006E80',
  onAccent: '#FFFFFF',
  // One hue per game (e7-t12's theme colours); onAccent reads on each of them
  gamePromotion: '#9A5800',
  gameSilentTable: '#0B7A47',
  gameSpectrum: '#1D5FC4',
  gameBluffReader: '#6B3FD1',
  gameOddWord: '#B03A12',
  gameLantern: '#A8246A',
  gameTiles: '#3F6212',
  gameWordBridge: '#3B48B8',
  gameClueClash: '#0A6A60',
  success: '#13703A',
  danger: '#B91C1C',
  warning: '#9C4A06',
  overlay: '#0A0D1F80',
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
  // Clubroom Tiles: the same in both themes, as a set of tiles is. Four suit inks on ivory
  tileFace: '#FBF7EC',
  tileEdge: '#C9BD9E',
  tileSpade: '#1F2A44',
  tileHeart: '#B91C1C',
  tileDiamond: '#7E22CE',
  tileClub: '#15803D',
  tileJoker: '#BE185D',
}

export type ColorName = keyof typeof light

const dark: Record<ColorName, string> = {
  bg: '#06070F',
  surface: '#10142B',
  panel: '#0C0F22D1',
  sunken: '#03040A99',
  raised: '#FFFFFF14',
  raisedHover: '#FFFFFF24',
  text: '#EEF1FF',
  muted: '#A6AED6',
  border: '#2E3566',
  line: '#96AAFF29',
  brand: '#2BE6FF',
  magenta: '#FF2E8B',
  accent: '#2BE6FF',
  onAccent: '#05060D',
  gamePromotion: '#FFC23D',
  gameSilentTable: '#5CFFA8',
  gameSpectrum: '#4DA3FF',
  gameBluffReader: '#B48CFF',
  gameOddWord: '#FF8F66',
  gameLantern: '#FF9ECF',
  gameTiles: '#C6F35B',
  gameWordBridge: '#8F9BFF',
  gameClueClash: '#4FE3D0',
  success: '#5CFFA8',
  danger: '#FF5A6E',
  warning: '#FFC23D',
  overlay: '#03040AB8',
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
  tileFace: '#FBF7EC',
  tileEdge: '#C9BD9E',
  tileSpade: '#1F2A44',
  tileHeart: '#B91C1C',
  tileDiamond: '#7E22CE',
  tileClub: '#15803D',
  tileJoker: '#BE185D',
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

/** Each game's hue by its id (DESIGN §1). A game without one has the brand's */
export const gameHues: Readonly<Partial<Record<string, ColorName>>> = {
  promotion: 'gamePromotion',
  'silent-table': 'gameSilentTable',
  spectrum: 'gameSpectrum',
  // The kart keeps the brand's cyan (DESIGN §1)
  bluff: 'gameBluffReader',
  'odd-word': 'gameOddWord',
  lantern: 'gameLantern',
  tiles: 'gameTiles',
  'word-bridge': 'gameWordBridge',
  'clue-clash': 'gameClueClash',
}

/** A game's hue, for its card and its room: what `--color-accent` becomes there */
export const gameHue = (gameId: string): string => color[gameHues[gameId] ?? 'brand']

export const avatarColors: readonly string[] = [0, 1, 2, 3, 4, 5].map(seatColor)

// The kart's 3D scene colours are in kartTokens.ts: only the kart's own chunk loads them

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
  // The results, on the destination badges and the faces of the top; the full edition's six (C7)
  face: {
    de: '#F5C542',
    cai: '#5EE0F5',
    gong: '#5FD58F',
    liang: '#C3A6FF',
    rou: '#D9D2C0',
    zang: '#F27482',
  },
  // The full edition (C7): silver, the pot, the cells that end a career
  silver: '#D8DDE6',
  silverDeep: '#7D8796',
  gain: '#1F7A3A',
  loss: '#A81E1E',
  exile: '#5A5F66',
  onExile: '#F2F2F2',
  requirement: '#1F4E8C',
  onRequirement: '#FFFFFF',
  onFace: '#1A1206',
  // A cell that asks a choice or holds an event (C8): an offered post, a minor post, an evaluation
  choice: '#0F6E5C',
  onChoice: '#FFFFFF',
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

// Sharp: the esports shell is cut corners and slants (`styles/esports.ts`), not round ones
export const radius = { component: 4, card: 6 } as const

export const fontSize = { sm: 14, md: 16, lg: 18, xl: 24, xxl: 32 } as const

export const lineHeight = 1.5

// Body text stays on the system's own faces (Inter where installed): no web font for it. The display
// faces load from Google Fonts without blocking the first paint (`styles/webFonts.ts`,
// docs/ASSETS.md), so every stack ends in faces that are already there. Noto Sans TC is not in the
// body or mono stacks on purpose: the page loads only its 900, which would turn all text heavy.
// A Chinese nickname in the English interface falls through to the CJK faces glyph by glyph.
export const font = {
  // The promotion board's brush face (docs/ASSETS.md): LXGW WenKai TC where it loads, else whatever
  // kai the system has (BiauKai on a Mac, DFKai-SB on Windows), else a serif
  kai: "'LXGW WenKai TC', 'Kaiti TC', BiauKai, 'DFKai-SB', STKaiti, KaiTi, 'Noto Serif TC', 'PMingLiU', serif",
  sans: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang TC', 'Microsoft JhengHei', sans-serif",
  // Latin headings, buttons and the wordmark: Saira, italic and heavy
  display:
    "Saira, 'Noto Sans TC', 'Arial Narrow', system-ui, -apple-system, 'Segoe UI', sans-serif",
  // Chinese headings: Noto Sans TC at 900, upright
  displayZh: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif",
  // Numbers, room ids and small labels
  mono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, 'PingFang TC', 'Microsoft JhengHei', monospace",
} as const
