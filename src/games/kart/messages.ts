// The race screen's strings, registered once by whichever of this game's components loads first, so
// that they stay out of everyone's first load (shared/games/kart/i18n.screen.ts).
import { kartScreenMessages } from '../../../shared/games/kart/i18n.screen.ts'
import { registerMessages } from '../../i18n/t.ts'

registerMessages(kartScreenMessages)
