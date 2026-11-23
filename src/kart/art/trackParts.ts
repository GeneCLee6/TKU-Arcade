// 2026-11-23 (docs/KART-PERF.md §11): the art of what only some tracks have, in one lazy chunk
// (trackFeatures.ts fetches it for a track that has any of it). One chunk rather than five: each
// chunk is compressed on its own, and five small ones cost more to fetch than the one they make.
export * as forks from './forkArt.ts'
export * as ledges from './ledgeArt.ts'
export * as crossings from './crossingArt.ts'
export * as obstacles from './obstacleArt.ts'
export * as night from './nightLights.ts'
