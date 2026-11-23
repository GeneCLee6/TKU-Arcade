// 2026-11-23 (e11-t06): /me's loader, a chunk with nothing else in it, so that the lobby's bundle
// carries one short import rather than the list of every chunk the profile page needs (load.ts too)
export const loadProfilePage = () => import('./ProfilePage.tsx')
