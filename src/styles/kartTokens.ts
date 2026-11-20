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
  // 2026-11-19: a fence a flying kart clears, a shed of containers and a yard's brick wall
  fence: '#F2C230',
  container: '#2F7F9E',
  yardWall: '#E9D8C4',
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
  // The drift dust (e8-t07); the karts' own colours are kartBodies, below
  smoke: '#E5E7EB',
  // The dark skid marks a drift leaves on the road (2026-11-14), under the glowing trails
  skid: '#17171A',
  // The streaks rushing past the view at speed (2026-11-14)
  speedLine: '#F2FBFF',
  // The best run's ghost (e8-t11)
  ghost: '#9AD8FF',
  // The item race (e9-t05): the boxes' amber shell and pale core, and a shield's bubble
  itemBox: '#FFA62B',
  itemBoxCore: '#FFF6DA',
  shield: '#6FE0FF',
  // The shots (e9-t06b): an icy hailstone, a dark thundercloud and its bolt, a mud puddle
  hail: '#E3F4FF',
  cloud: '#4A5262',
  bolt: '#FFE14D',
  puddle: '#7A5A36',
  puddleDeep: '#4E3820',
  // 2026-11-20: a mirror's silver ring and its glint; a sea-fog bank's pale grey; a fake box's core,
  // a dull ember where a real box glows pale (the one tell); a skip's splash, a rally's cheer, static
  mirror: '#DDE7F2',
  mirrorGlint: '#9FF3FF',
  seaFog: '#D7DEE3',
  decoyCore: '#C2562E',
  splash: '#8FD8FF',
  cheer: '#7DFFB0',
  static: '#C59BFF',
  // A hit (2026-11-17): the four-pointed sparkles thrown up round a stunned kart, the white flash
  // of the moment it is hit, and the pale shards of a shield bubble popping
  hitStar: '#FFE98A',
  hitFlash: '#FFFFFF',
  popShard: '#C9F6FF',
  // The arrow boards along the outside of a corner (2026-11-17): the board and its arrows
  sign: '#FFD21F',
  signEdge: '#16171A',
  flame: '#FFB020',
  flameCore: '#FFF3C4',
  lightSky: '#FFFFFF',
  lightGround: '#6B7280',
} as const

/** The track editor's map (e10-t07): the road on grass, the piece picked, the pieces at fault */
export const kartEditor = {
  ground: '#4F8A3A',
  road: '#5A5E66',
  selected: '#38BDF8',
  problem: '#EF4444',
  joint: '#E5E7EB',
  finish: '#F9FAFB',
  grid: '#FDE68A',
  pad: '#22D3EE',
  box: '#FFA62B',
  arrow: '#F9FAFB',
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
  // 2026-11-18 (owner: "more esports"): every theme has more contrast, as a race under lights is
  // filmed. Less light from the sky all round and more from the sun, so that shadows are dark and
  // the karts' lit lines read. Day is a late afternoon: a deeper sky, a low warm sun, long shadows
  day: {
    skyTop: '#2A62B8',
    skyMiddle: '#6FA3DC',
    skyHorizon: '#FFD9A8',
    fog: '#EBD3B6',
    hemisphereSky: '#DCE8FF',
    hemisphereGround: '#59606E',
    hemisphereIntensity: 1.45,
    sun: '#FFE2B8',
    sunIntensity: 2.3,
    sunDirection: [42, 36, 24],
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
    hemisphereIntensity: 1.3,
    sun: '#FFB878',
    sunIntensity: 2.9,
    sunDirection: [-62, 22, -80],
    sunDisc: '#FFF1C9',
    sunGlow: '#FFC27A',
  },
  // The campus on its hill (2026-11-14): a clear late morning, the sun high in the south-west
  campus: {
    skyTop: '#2F7BD6',
    skyMiddle: '#7DB6EC',
    skyHorizon: '#DCEEF8',
    fog: '#D4E7F2',
    hemisphereSky: '#FFFFFF',
    hemisphereGround: '#6E7A6A',
    hemisphereIntensity: 1.5,
    sun: '#FFEFD2',
    sunIntensity: 2.3,
    sunDirection: [-45, 52, 35],
    sunDisc: null,
    sunGlow: null,
  },
  // N2's item track (e10-t04b): a night market, the moon low over the river, the haze of the
  // street lights on the horizon; light enough to read the road by
  night: {
    skyTop: '#070B24',
    skyMiddle: '#1F2158',
    skyHorizon: '#4D3A74',
    fog: '#2C2552',
    hemisphereSky: '#A7B2FF',
    hemisphereGround: '#5A4466',
    hemisphereIntensity: 1.35,
    sun: '#C9D5FF',
    sunIntensity: 1.5,
    sunDirection: [-55, 40, -45],
    sunDisc: '#F6F2DC',
    sunGlow: '#8EA2E8',
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

/**
 * The hover karts (owner, 2026-11-14: karts with no tyres, hugging the floor; e10-t05a: six): our
 * own bodies and their colours. 2026-11-18 (owner: "more esports"): a race team's look. `main` is
 * the satin black the body is cut from (a breath of the kart's hue in it), `second` its paler
 * panels, `accent` the kart's one neon colour (panels, the garage's swatch), `glow` the same as
 * light: the lit lines, the underglow, the thrusters and the drift sparks. The drivers' colours are
 * kartDrivers, below: any driver sits in any kart
 */
export const kartBodies = {
  tide: { main: '#11181C', second: '#2A3740', accent: '#12D8F2', glow: '#4DEBFF' },
  comet: { main: '#1B1512', second: '#3D302A', accent: '#FF5A1F', glow: '#FF8A3D' },
  ray: { main: '#15121F', second: '#2F2A45', accent: '#8F4DFF', glow: '#B58CFF' },
  crab: { main: '#111A14', second: '#2A3B30', accent: '#35E85C', glow: '#7CFF8E' },
  heron: { main: '#1A1A14', second: '#3A3A2E', accent: '#FFD60A', glow: '#FFE75C' },
  flyfish: { main: '#1C1218', second: '#3F2A36', accent: '#FF2E88', glow: '#FF7AB8' },
  // 2026-11-19: eight more karts and three bikes, each with a neon of its own
  dolphin: { main: '#10161F', second: '#273447', accent: '#2F7BFF', glow: '#6FA4FF' },
  skipper: { main: '#171A10', second: '#353B26', accent: '#B6F21A', glow: '#D4FF66' },
  shrimp: { main: '#1D1113', second: '#42282C', accent: '#FF3B3B', glow: '#FF7D74' },
  marlin: { main: '#101A1D', second: '#263D42', accent: '#16E0C0', glow: '#6BF5DE' },
  eel: { main: '#141420', second: '#2E2E48', accent: '#5B5BFF', glow: '#9494FF' },
  squid: { main: '#1B1220', second: '#3D2A47', accent: '#D94DFF', glow: '#EB96FF' },
  hermit: { main: '#1D1810', second: '#423827', accent: '#FF9F1A', glow: '#FFC266' },
  whale: { main: '#12181B', second: '#2B383E', accent: '#C8E6F5', glow: '#E6F6FF' },
  swift: { main: '#12161C', second: '#2A3340', accent: '#3DC8FF', glow: '#8ADEFF' },
  hornet: { main: '#1B180E', second: '#3D3722', accent: '#FFB800', glow: '#FFD45C' },
  petrel: { main: '#1C1016', second: '#402633', accent: '#FF4D9D', glow: '#FF94C4' },
  // 2026-11-20: the item series
  pelican: { main: '#191712', second: '#3B372B', accent: '#F2E6C2', glow: '#FFF4D6' },
  otter: { main: '#17120F', second: '#3A2C24', accent: '#E07A3F', glow: '#F5A474' },
  cormorant: { main: '#0E1312', second: '#24302D', accent: '#2BD9A0', glow: '#7AF0C8' },
} as const

/**
 * The four drivers (e10-t05b), card suits made people (club as in our bridge club). 2026-11-18: in
 * race kit. `suit` is the race suit's dark base, `panel` its colour blocks, `helmet` the shell,
 * `visor` the mirror's tint, `crest` the suit's sign (the team's logo) and the number's bar, `trim`
 * the gloves, the boots and the piping
 */
export const kartDrivers = {
  spade: { suit: '#15181E', panel: '#DDE4F0', helmet: '#EEF2F8', visor: '#6F8CFF', crest: '#AFC2FF', trim: '#8793B0' },
  heart: { suit: '#1A1216', panel: '#E0143F', helmet: '#1B1D24', visor: '#FF4F6E', crest: '#FF2E5C', trim: '#F4F4F6' },
  diamond: { suit: '#1A1510', panel: '#F2811D', helmet: '#F4EFE6', visor: '#FFB53D', crest: '#FF9A1F', trim: '#2A2C33' },
  club: { suit: '#101A14', panel: '#17A650', helmet: '#1B1D24', visor: '#55F59B', crest: '#3DFF86', trim: '#F5C542' },
} as const

/** The livery's marks (kartModel.ts): the number's white ink, and a cut through a mark's middle */
export const kartLivery = {
  ink: '#F4F7FA',
  cut: '#0B0C10',
} as const

/** The hover parts every body shares: thruster housings, the cockpit glass, the sparks */
/**
 * The race-day dressing every track shares (2026-11-14, festival.ts): our own bright, saturated
 * party palette for the arch, the flags, the crowds, the flowers, the Ferris wheel, the balloons and
 * the far skyline
 */
export const kartFestival = {
  arch: ['#FF3B6B', '#FFD23F', '#2EC4F1', '#7CE36B', '#B26BFF'],
  flags: ['#FF3B6B', '#FFD23F', '#2EC4F1', '#7CE36B', '#FF8A3D', '#B26BFF', '#FFFFFF'],
  pole: '#E9EEF5',
  standSeat: '#3C6FD8',
  standRoof: '#F4F7FB',
  crowd: ['#FF4D5E', '#FFC93C', '#2EC4F1', '#5BD16C', '#FF8A3D', '#9B6BFF', '#FFFFFF', '#1F2A44'],
  skin: '#F2C7A0',
  flowers: ['#FF4F8B', '#FFD23F', '#FFFFFF', '#FF8A3D', '#B26BFF'],
  flowerLeaf: '#3F9E3A',
  wheel: '#FFFFFF',
  cabins: ['#FF3B6B', '#FFD23F', '#2EC4F1', '#7CE36B'],
  balloons: ['#FF3B6B', '#FFD23F', '#2EC4F1', '#7CE36B', '#FF8A3D', '#B26BFF'],
  basket: '#8B5A2B',
  skyline: ['#9FB4CC', '#B7C6D8', '#8AA3BF', '#C9D4E2', '#A7B9CF'],
} as const

/**
 * A boost's fire (2026-11-18, boostFx.ts), by what fired it: the pale heart of the flame, its body
 * and its tips, and the ribbon of light it leaves. An instant boost is a short amber puff, a full
 * boost from the gauge a white-hot jet with crimson tips, a team boost the same in blue, a perfect
 * start gold. Our own palette
 */
export const kartBoost = {
  mini: { core: '#FFF3C4', flame: '#FFB020', tip: '#FF7A1A', trail: '#FFA63D' },
  n2o: { core: '#FFF6D8', flame: '#FF8E14', tip: '#FF3A1F', trail: '#FF6A2B' },
  team: { core: '#F0FCFF', flame: '#35B6FF', tip: '#3B4CFF', trail: '#4AA8FF' },
  start: { core: '#FFFFFF', flame: '#FFD23F', tip: '#FF8A1F', trail: '#FFC233' },
} as const

/**
 * What every kart is built from besides its own paint (2026-11-18, kartParts.ts): the carbon
 * weave's two threads, bare metal, the head lamps and the tail lamps, and the light the env map is
 * lit by (a pale sky over a dark floor, with three bright panels for the paint to catch)
 */
export const kartParts = {
  carbon: '#15171C',
  carbonThread: '#2B2F38',
  metal: '#C9CED6',
  dark: '#0B0C10',
  headLamp: '#F4FAFF',
  tailLamp: '#FF2A3C',
  envSky: '#BFD8F2',
  envHorizon: '#F6F1E6',
  envFloor: '#23262E',
  envPanel: '#FFFFFF',
} as const

/**
 * A night track's light (2026-11-20, nightLights.ts): the headlights' beam and its pool on the road,
 * the tail lamps' glow behind, the street lamps (a sodium-warm head on a dark post) and their pools,
 * and the old street's lantern light pooled on the paving
 */
export const kartNight = {
  beam: '#FFF1D2',
  tailGlow: '#FF2A3C',
  lampPost: '#2A2C33',
  lampHead: '#FFE2B0',
  lampPool: '#FFC98A',
  lanternPool: '#FF9A5C',
} as const

export const kartHover = {
  housing: '#2E3138',
  glass: '#132033',
  spark: '#FFF6D6',
  // 2026-11-14: the sparks of a drift long enough to have earned its release boost, and the sparks
  // while the release boost's window is open
  sparkEarned: '#FFC21A',
  sparkReady: '#7CF3FF',
} as const

/**
 * The Tamkang campus track (2026-11-14): our own palette for a stylised 淡江大學 淡水校園, not taken
 * from any of the university's marks. Green glazed roofs and pale walls on the lantern avenue, red
 * columns, a pale library and towers, the river and the mountain across it hazy in the distance.
 */
export const tamkangScene = {
  paving: '#D9D2C3',
  pavingJoint: '#B9B0A0',
  roofGreen: '#2F7A5B',
  roofGreenDark: '#1F5A42',
  wallWhite: '#F3EFE6',
  column: '#A8322D',
  lanternGlass: '#FFF2C9',
  lanternFrame: '#2B4A3C',
  library: '#E8E1D3',
  libraryGlass: '#3D5A73',
  tower: '#E4DCCB',
  towerBand: '#9B6B4A',
  glassTower: '#7FA6C2',
  scroll: '#FAFAF7',
  museumHull: '#F4F6F8',
  museumStripe: '#2F5DA8',
  museumFunnel: '#D9443A',
  stone: '#B9B4AA',
  stoneDark: '#8E897F',
  rail: '#5B5F66',
  lawn: '#7DBB4E',
  river: '#6FA7BE',
  riverBank: '#9E9A86',
  mountain: '#6E8F86',
  mountainFar: '#9DB4B8',
  // The campus's other buildings and the town below: painted walls
  walls: ['#F1E9DA', '#E6DED0', '#EFD9C6', '#D9E2E6', '#F5F1E8', '#E3D5BD'],
  townRoofs: ['#8C4A32', '#6B6F78', '#A85B3A', '#4E5A63'],
  window: '#33465A',
  signText: '#2B2B2B',
} as const

/**
 * N2's item track, the old street night market (e10-t04b): our own palette. Stone paving, red brick
 * shophouses with lit windows, stall canopies and bright signboards, red lanterns, a temple with
 * red columns and orange tiled roofs, the river dark under the moon.
 */
export const oldStreetScene = {
  paving: '#6E6670',
  pavingJoint: '#4E4752',
  river: '#2B3F6E',
  riverGlint: '#FFD38A',
  rail: '#3A3540',
  shopWalls: ['#9C4A36', '#B0593F', '#8A4032', '#A86E52', '#C49A74'],
  shopRoof: '#3B2F33',
  arcade: '#1E1A22',
  window: '#2A2734',
  windowLit: '#FFC873',
  canopies: ['#E8423F', '#F2B530', '#2E9CCA', '#43B36B', '#E86AA6', '#F47B30', '#F4F1EA'],
  signs: ['#FF4F6E', '#FFD447', '#4FE3FF', '#7CFF8A', '#FF9F43', '#C68BFF', '#FFFFFF'],
  counter: '#5A3B2B',
  counterLight: '#FFE2A6',
  goods: ['#F2C14E', '#E4572E', '#7FB069', '#F6E8C3', '#C8553D'],
  lantern: '#FF4A2E',
  lanternCap: '#2B1B14',
  pole: '#2E2A30',
  templeWall: '#B8322B',
  templeColumn: '#C9302C',
  templeRoof: '#E07A2E',
  templeRidge: '#2F8F7A',
  templeStone: '#A9A29A',
  censer: '#3D3530',
  chevron: '#FFD23F',
  // The house fronts' texture: near white, each house tinting it; black where a glow map is unlit
  facade: '#F2F2F2',
  unlit: '#000000',
} as const

/**
 * The four technical tracks' own scenery (2026-11-18, src/kart/art/localArt.ts): our own palette.
 * The mangrove flats (tidal pools, dark green mangroves, a grey boardwalk, white egrets); the red
 * brick fort on its hill; the new town at night (dark towers, warm windows, three neons: the kart's
 * own cyan and magenta and an amber); the volcano's upper slopes (straw silver grass, dark rock, a
 * white weather dome, steam).
 */
/**
 * 2026-11-20: the Viaduct Works' own scenery (src/kart/art/worksArt.ts): factory sheds and their
 * roofs, chimneys, the concrete of the elevated line and of the loading deck's piers
 */
export const worksScene = {
  shedWalls: ['#B9A58C', '#8E9AA3', '#A7836A', '#C7C1B4'],
  shedRoof: '#55606B',
  chimney: '#9B5A43',
  chimneyTop: '#2B2B2E',
  concrete: '#B8B3AA',
  concreteDark: '#8F8A82',
  // 2026-11-20, dressed (docs/KART-WORLD.md §6.3): the sawtooth roofs' north lights, the foundry,
  // the pipe racks, the conveyor, the deck's railings and the alley's brick and spray paint
  glazing: '#8FB8CC',
  foundry: '#5B4B44',
  foundryGlow: '#FF8A3D',
  pipes: ['#7E8C96', '#B5532F', '#3F7F6A'],
  rack: '#4A4F55',
  conveyor: '#3A3F45',
  belt: '#202124',
  brick: '#8E4A36',
  graffiti: ['#22E6FF', '#FF3DC8', '#FFB02E', '#7CFF6B', '#8A5CFF', '#F4F4F4'],
  steam: '#FFFFFF',
} as const

/**
 * 2026-11-20: what shows the way on the tracks to learn by heart (src/kart/art/skillCues.ts): the
 * way through (a slot, a branch's mouth) in one colour, the drift jumps in another, the warning
 * stripes on a fence a flier clears and on a wall's end
 */
export const skillCue = {
  path: '#22E6FF',
  jump: '#FFB02E',
  hazard: '#F2C230',
  hazardDark: '#1B1B1F',
  post: '#2B2D33',
} as const

/** 2026-11-20: the Wharf Warehouses' own scenery (src/kart/art/wharfArt.ts) */
export const wharfScene = {
  containers: ['#C0392B', '#1F6FB2', '#2E8B57', '#E67E22', '#7D3C98', '#D4AC0D', '#2F7F9E', '#8C3B2E'],
  shedWalls: ['#B8C2C9', '#9FB0A6', '#C9B79C', '#D6D2C8'],
  shedRoof: '#4F5A63',
  door: '#39424A',
  number: '#F4F4F4',
  numberBack: '#1F3A5F',
  crane: '#D9442B',
  craneWhite: '#F4F1EA',
  craneDark: '#2B2D33',
  quay: '#B9B2A6',
  quayEdge: '#F2C230',
  quayFace: '#6E6A62',
  bollard: '#2B2D33',
  bollardCap: '#F2C230',
  sea: '#3B87B5',
  hulls: ['#B83A2E', '#1F4E79', '#2F6B4F'],
  deckhouse: '#F4F1EA',
  funnel: '#C8323C',
  boatTrim: '#2B2D33',
} as const

/** 2026-11-20: the Hillside Lanes' own scenery (src/kart/art/lanesArt.ts) */
export const lanesScene = {
  brick: '#A9452E',
  pillar: '#8E3A26',
  tile: '#3E3A38',
  tileEdge: '#5A524C',
  plaster: ['#EADFC9', '#DCCBA8', '#E6D3C3', '#D5D9CF'],
  window: '#2C2F3A',
  door: '#5A3A24',
  wood: '#6B4A2E',
  lantern: '#E5322D',
  lanternGlow: '#FF5A3D',
  tassel: '#F2C230',
  stone: '#A29D92',
  stoneDark: '#6E6A62',
  water: '#2E6F8C',
  pot: '#B5552F',
  leaf: '#3E8E3A',
  leafLight: '#6DB33F',
  pole: '#7A6A58',
  wire: '#202124',
  rail: '#4A4440',
} as const

export const localScene = {
  tidePool: '#3F8FA6',
  mangroveRoot: '#4A3A2C',
  mangroveLeaf: '#2F6B3F',
  mangroveLeafLight: '#4F8F4A',
  egret: '#F7F7F2',
  egretLeg: '#3B3B3B',
  boardwalk: '#8C8478',
  boardwalkRail: '#5E584F',
  fortBrick: '#A8452F',
  fortBrickDark: '#7C3222',
  fortStone: '#C9BBA2',
  fortRoof: '#3F3A38',
  fortGate: '#2A1E1A',
  cannon: '#2B2D31',
  fortFlag: '#F2C230',
  towerWall: '#1B2030',
  towerRoof: '#10131C',
  towerWindow: '#0D1018',
  towerWindowLit: '#FFD79A',
  towerWindowCool: '#9FD8FF',
  neons: ['#22E6FF', '#FF3DC8', '#FFB02E'],
  ringBase: '#2A2F3E',
  silverGrass: '#E3D9B4',
  silverGrassStem: '#A9A070',
  rock: '#5C5F66',
  domeTower: '#B9BCC2',
  dome: '#F4F6F8',
  ventMound: '#6E6A5C',
  steam: '#FFFFFF',
  // Unlit white: what an instance's own colour or a glow map multiplies
  glow: '#FFFFFF',
} as const
