// Registers the room's own later strings (shared/games/roomExtras.ts) when a room's code loads
import { roomExtraMessages } from '../../shared/games/roomExtras.ts'
import { registerMessages } from './t.ts'

registerMessages(roomExtraMessages)
