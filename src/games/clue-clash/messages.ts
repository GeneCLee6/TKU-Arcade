// The screen's strings, registered once by whichever of this game's components loads first, so that
// they stay out of everyone's first load (shared/games/clue-clash/i18n.screen.ts).
import { clueClashScreenMessages } from '../../../shared/games/clue-clash/i18n.screen.ts'
import { registerMessages } from '../../i18n/t.ts'

registerMessages(clueClashScreenMessages)
