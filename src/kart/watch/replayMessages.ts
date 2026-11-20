// 2026-11-20: the replay file's and link's strings, registered by whichever screen offering them
// loads first (ReplayShare.tsx, ReplayFilePage.tsx), never by the room's first screen
import { kartReplayFileMessages } from '../../../shared/games/kart/i18n.replayFile.ts'
import { registerMessages } from '../../i18n/t.ts'

registerMessages(kartReplayFileMessages)
