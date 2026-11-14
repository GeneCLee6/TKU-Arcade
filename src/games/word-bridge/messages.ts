// The screen's strings, registered once by whichever of this game's components loads first, so that
// they stay out of everyone's first load (shared/games/word-bridge/i18n.screen.ts).
import { wordBridgeScreenMessages } from '../../../shared/games/word-bridge/i18n.screen.ts'
import { registerMessages } from '../../i18n/t.ts'

registerMessages(wordBridgeScreenMessages)
