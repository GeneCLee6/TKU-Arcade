// The screen's strings, registered once by whichever of this game's components loads first, so that
// they stay out of everyone's first load (shared/games/spectrum/i18n.screen.ts).
import { spectrumScreenMessages } from '../../../shared/games/spectrum/i18n.screen.ts'
import { registerMessages } from '../../i18n/t.ts'

registerMessages(spectrumScreenMessages)
