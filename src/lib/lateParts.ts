// The room's parts that are not on a game's first paint (src/lib/lateChunk.ts, 2026-11-23): each loads
// right after the page has painted, long before it is needed, and renders at once once loaded. Every
// game's first screen was nearer its budget after #155. The components that draw them are in
// src/components/LateParts.tsx; tests/setup.ts loads them all up front.
import { lateChunk } from './lateChunk.ts'

/** How a game ended (ResultPanel.tsx): shown only once someone has won */
export const resultPanelChunk = lateChunk(() =>
  import('../components/ResultPanel.tsx').then((module) => module.ResultPanel),
)

/** The room's chat: nobody has written anything when a room opens; on a phone it is in a drawer */
export const chatPanelChunk = lateChunk(() =>
  import('../components/ChatPanel.tsx').then((module) => module.ChatPanel),
)

/** The phone's sheet and its tabs: a closed sheet shows nothing */
export const drawerChunk = lateChunk(() =>
  Promise.all([import('../components/Drawer.tsx'), import('../components/Tabs.tsx')]).then(
    ([drawer, tabs]) => ({ Drawer: drawer.Drawer, Tabs: tabs.Tabs }),
  ),
)

/** The bar while a room's socket comes back: it shows nothing for the first second of a drop */
export const bannerChunk = lateChunk(() =>
  import('../components/ConnectionBanner.tsx').then((module) => module.ConnectionBanner),
)

/** The ring round the avatar of whoever is to move (docs/DESIGN.md §3.9): only for the eye */
export const turnRingChunk = lateChunk(() =>
  import('../components/table/TurnRing.tsx').then((module) => module.TurnRing),
)

/**
 * A board game's event caption (docs/DESIGN.md §3.9): the big slanted words a broadcast throws over the
 * table when something happens (all in, a line snapped, a promotion). Nothing needs it before the first
 * move, so it shows nothing until its code is in.
 */
export const captionChunk = lateChunk(() =>
  import('../components/table/EventCaption.tsx').then((module) => module.EventCaption),
)


/** The seats a game is stuck on (CoverSection.tsx): only once a seat has kept everyone waiting */
export const coverChunk = lateChunk(() =>
  import('../components/CoverSection.tsx').then((module) => module.CoverSection),
)
