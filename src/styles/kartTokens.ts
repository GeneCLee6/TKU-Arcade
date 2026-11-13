// The kart's 3D scene and art colours (e8-t01, e8-t05b, e8-t07), beside tokens.ts and part of the
// same token system (CLAUDE.md rule 5). A file of their own so that only the kart's chunk loads them:
// in tokens.ts, which the lobby also loads, they were in everyone's first load.
// The kart's 3D scene. Plain values, because WebGL materials cannot read CSS variables, and the same
// in both themes, because the scene's look does not follow the page's. Neutral on purpose: the
// visual style (PRD Q4) is still open.
export const kartScene = {
  sky: '#B9D3E6',
  ground: '#8A9A8C',
  gridLine: '#6B7A6E',
  body: '#C2410C',
  nose: '#F3F4F6',
  // The test arena's walls (e8-t02b)
  wall: '#3F4A5C',
  // A track's road, its centre line on the minimap, the finish line and the next gate (e8-t04)
  road: '#4B5563',
  roadLine: '#E5E7EB',
  finish: '#F9FAFB',
  nextGate: '#FACC15',
  // The track art (e8-t05b): our own palette, a sunny riverside afternoon
  skyTop: '#4F8FD6',
  skyHorizon: '#CFE6F5',
  asphalt: '#55585E',
  grass: '#5E9E3C',
  grassLight: '#86C25A',
  grassDark: '#3F7A2A',
  kerbRed: '#D7263D',
  kerbWhite: '#F4F4F4',
  barrier: '#1F6FB2',
  barrierTop: '#F4F4F4',
  barrierStripe: '#F2C230',
  water: '#2E8BC0',
  waterDeep: '#155E8C',
  checkerDark: '#1B1B1F',
  mortar: '#CDBFA8',
  brick: '#A2412B',
  roof: '#4A3F3A',
  sand: '#D9C38F',
  trunk: '#6B4A2E',
  leaf: '#3E8E3A',
  leafLight: '#6DB33F',
  hill: '#4E7D55',
  hillFar: '#7FA3A8',
  metal: '#9AA3AD',
  tyre: '#222326',
  seat: '#E4572E',
  lamp: '#FFF4C2',
  // The first kart and its driver (e8-t07): our own colours
  kartDark: '#25262B',
  suit: '#1E3A8A',
  helmet: '#F8FAFC',
  visor: '#0F172A',
  smoke: '#E5E7EB',
  skid: '#1A1A1D',
  flame: '#FFB020',
  flameCore: '#FFF3C4',
  lightSky: '#FFFFFF',
  lightGround: '#6B7280',
} as const
