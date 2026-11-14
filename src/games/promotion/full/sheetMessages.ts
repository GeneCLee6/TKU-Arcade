// The cell sheet's and the settlement's strings, registered by whichever of the two loads first, so
// that they stay out of the full board's first screen (shared/games/promotion/i18n.sheets.ts).
import { promotionSheetMessages } from '../../../../shared/games/promotion/i18n.sheets.ts'
import { registerMessages } from '../../../i18n/t.ts'

registerMessages(promotionSheetMessages)
