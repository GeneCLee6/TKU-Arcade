// Tamsui Traders' pieces (2026-11-14), beside tokens.ts and part of the same token system (CLAUDE.md
// rule 5), like kartTokens.ts: a file of their own so that only the game's chunk loads them; in
// tokens.ts, which the lobby also loads, they would be in everyone's first load.
// The five goods and gold, on tokens and cards. Plain values, the same in
// both themes, as a real set of pieces is; `on*` reads on its own good, `rim` outlines the dark ones
export const tradersPieces = {
  tea: '#2F7D4A',
  camphor: '#ECE6D6',
  indigo: '#2C4A9A',
  sugar: '#B3342B',
  pepper: '#2B2623',
  gold: '#D9AE34',
  onTea: '#FFFFFF',
  onCamphor: '#2A1F14',
  onIndigo: '#FFFFFF',
  onSugar: '#FFFFFF',
  onPepper: '#FFFFFF',
  onGold: '#2A1F14',
  rim: '#8F8676',
  paper: '#F4ECD8',
  paperEdge: '#C9B48A',
  ink: '#2A1F14',
  inkMuted: '#5E4F3A',
} as const
