// The screen's strings, registered once by whichever of this game's components loads first, so that
// they stay out of everyone's first load (shared/games/traders/i18n.screen.ts).
import { tradersScreenMessages } from '../../../shared/games/traders/i18n.screen.ts'
import { registerMessages } from '../../i18n/t.ts'

registerMessages(tradersScreenMessages)
