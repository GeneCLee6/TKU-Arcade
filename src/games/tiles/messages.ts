// The screen's strings, registered once by whichever of this game's components loads first, so that
// they stay out of everyone's first load (shared/games/tiles/i18n.screen.ts).
import { tilesScreenMessages } from '../../../shared/games/tiles/i18n.screen.ts'
import { registerMessages } from '../../i18n/t.ts'

registerMessages(tilesScreenMessages)
