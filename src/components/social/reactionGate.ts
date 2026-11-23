// 2026-11-23: the room's limits on one member's reactions, kept by the sender too, so that a reaction
// the room would drop says "too fast" instead of vanishing (shared/social.ts)
import { ChatRateLimit } from '../../../shared/chat.ts'
import { REACTION_MIN_MS } from '../../../shared/protocol.ts'
import { REACTION_RATE } from '../../../shared/social.ts'

/** The room's limits on reactions (REACTION_MIN_MS, REACTION_RATE), kept by the sender too */
export class ReactionGate {
  private readonly window = new ChatRateLimit(REACTION_RATE)
  private last = -Infinity

  /** Whether one may go now; when it may, it is counted */
  take(now = Date.now()): boolean {
    if (now - this.last < REACTION_MIN_MS || !this.window.take('me', now)) return false
    this.last = now
    return true
  }
}
