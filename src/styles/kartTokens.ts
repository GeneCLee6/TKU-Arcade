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
  // The best run's ghost (e8-t11)
  ghost: '#9AD8FF',
  skid: '#1A1A1D',
  flame: '#FFB020',
  flameCore: '#FFF3C4',
  lightSky: '#FFFFFF',
  lightGround: '#6B7280',
} as const

/**
 * A track's light and sky (N1, e10-t03): Riverside and the test tracks keep the sunny afternoon of
 * K1 (the same values as above, so they look as they did); the harbour is a sunset of our own. The
 * sun's direction points from the ground towards it.
 */
export interface KartTheme {
  readonly skyTop: string
  /** Between the horizon and the top; the sky blends horizon → middle → top */
  readonly skyMiddle: string
  readonly skyHorizon: string
  /** The fog and the background behind everything: the horizon's colour */
  readonly fog: string
  readonly hemisphereSky: string
  readonly hemisphereGround: string
  readonly hemisphereIntensity: number
  readonly sun: string
  readonly sunIntensity: number
  readonly sunDirection: readonly [number, number, number]
  /** A disc and a glow on the sky where the sun is; null draws none */
  readonly sunDisc: string | null
  readonly sunGlow: string | null
}

export const kartThemes = {
  day: {
    skyTop: kartScene.skyTop,
    skyMiddle: '#8DBBE6',
    skyHorizon: kartScene.skyHorizon,
    fog: kartScene.skyHorizon,
    hemisphereSky: kartScene.lightSky,
    hemisphereGround: kartScene.lightGround,
    hemisphereIntensity: 2,
    sun: kartScene.lightSky,
    sunIntensity: 1.5,
    sunDirection: [30, 60, 20],
    sunDisc: null,
    sunGlow: null,
  },
  sunset: {
    skyTop: '#2E3A86',
    skyMiddle: '#C46C9A',
    skyHorizon: '#FFB27A',
    fog: '#F4A47E',
    hemisphereSky: '#FFD6BA',
    hemisphereGround: '#4E4466',
    hemisphereIntensity: 1.55,
    sun: '#FFB878',
    sunIntensity: 2.6,
    sunDirection: [-62, 22, -80],
    sunDisc: '#FFF1C9',
    sunGlow: '#FFC27A',
  },
} as const satisfies Record<string, KartTheme>

/** The harbour at sunset (N1, e10-t03): our own palette */
export const harbourScene = {
  // The sea, tinting the shared water texture warm
  sea: '#E7A08C',
  concrete: '#B9B2A6',
  concreteDark: '#8D877E',
  quayEdge: '#F2C230',
  lighthouseRed: '#C8323C',
  lighthouseWhite: '#F6F1E7',
  lanternGlass: '#FFE7A3',
  harbourGreen: '#2E9E62',
  tetrapod: '#A7A39A',
  // Boats: hulls in four colours, white cabins, dark trim
  hulls: ['#D9443A', '#1F8A9E', '#2F5DA8', '#E8B330'],
  cabin: '#F4F1EA',
  boatTrim: '#2B2D33',
  flag: '#F24B3C',
  // Containers, sheds and the crane
  containers: ['#C0392B', '#1F6FB2', '#2E8B57', '#E67E22', '#7D3C98', '#D4AC0D'],
  shedWalls: ['#D8CFC0', '#9FB8AD', '#C9A27E'],
  roofs: ['#8C4A32', '#2F6F73', '#6B6F78'],
  crane: '#E2A72E',
  // The hillside town: painted walls, warm lit windows
  walls: ['#F3E3C3', '#F2C6B4', '#CFE3D0', '#C9DBEA', '#F6F0E6'],
  window: '#2C2F3A',
  windowLit: '#FFC66B',
  lantern: '#E5322D',
  lanternLit: '#FF7A3D',
  palmTrunk: '#8A6A48',
  palmLeaf: '#3C7F3A',
} as const
