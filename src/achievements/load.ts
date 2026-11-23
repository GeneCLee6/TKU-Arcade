// 2026-11-23 (e11-t06): the engine's loader, a chunk of its own with nothing in it. A first screen
// that can report an achievement (track.ts) then carries one short import, not the list of every
// chunk the engine needs: that list is here, and is fetched with the first event
export const loadEngine = () => import('./engine.ts')
