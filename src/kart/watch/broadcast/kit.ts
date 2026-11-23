// 2026-11-23 (the broadcast, docs/KART-NETCODE.md §11.6): everything the broadcast adds to watching a
// race, one lazy chunk fetched the first time someone turns it on (or asks for the highlights):
// the director at work, its overlay (and its strings), and the highlights' picking.
import { kartBroadcastMessages } from '../../../../shared/games/kart/i18n.broadcast.ts'
import { registerMessages } from '../../../i18n/t.ts'

registerMessages(kartBroadcastMessages)

export { createBroadcastRun } from './broadcastRun.ts'
export { BroadcastOverlay } from './BroadcastOverlay.tsx'
export { pickHighlights, replayOrderAt, replayPassings } from '../../../../shared/kart/highlights.ts'
