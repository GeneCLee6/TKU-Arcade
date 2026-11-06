// What the browser remembers about the room's chat (e1-t07): the list of messages, and the messages
// it sent that the room has not answered yet. Plain code, so Vitest runs it without React.
import { CHAT_HISTORY, type ChatMessage } from '../../shared/chat.ts'
import type { ErrorMessage } from '../../shared/protocol.ts'

/**
 * The list after a `chat` frame: `reset` replaces it, otherwise the new messages go on the end. A
 * message already there is skipped, and only the latest CHAT_HISTORY stay. The same array comes back
 * when nothing changed.
 */
export function mergeChat(
  current: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
  reset: boolean,
): readonly ChatMessage[] {
  const base = reset ? [] : current
  const seen = new Set(base.map((message) => message.id))
  const added = incoming.filter((message) => {
    if (seen.has(message.id)) return false
    seen.add(message.id)
    return true
  })
  if (!reset && added.length === 0) return current
  return [...base, ...added].slice(-CHAT_HISTORY)
}

/**
 * How many messages from others came after the last one this person has seen. `seen` may be null, or
 * have scrolled out of the history: then all of them count.
 */
export function unreadCount(
  messages: readonly ChatMessage[],
  seen: number | null,
  you: string,
): number {
  const after = seen === null ? -1 : messages.findLastIndex((message) => message.id === seen)
  return messages.slice(after + 1).filter((message) => message.from !== you).length
}

/** What someone is writing, kept apart from the panel so that it outlives a connection problem */
export class ChatDraft {
  private text = ''

  read(): string {
    return this.text
  }

  write(text: string): void {
    this.text = text
  }
}

/** How a message ended: the room has it, the room said no, or nothing was heard back in time */
export type ChatSendResult = 'sent' | 'rate_limited' | 'chat_locked' | 'failed'

/** Past this without an answer the message counts as lost (the socket may have died under it) */
export const CHAT_ACK_TIMEOUT_MS = 8_000

type PendingSend = {
  text: string
  /** The newest message id known when it was sent: an answer has a higher one */
  after: number
  settle: (result: ChatSendResult) => void
}

/**
 * The sends the room has not answered. The room's answer to `chat` is the message itself, sent back
 * to everyone, or a refusal to the sender (shared/protocol.ts point 5), so a composer can give the
 * text back when it did not arrive, however the socket fared. A message that went through while its
 * socket died is recognised in the history the next socket gets.
 */
export class ChatSends {
  private pending: PendingSend[] = []
  private newestId = -1

  add(text: string): Promise<ChatSendResult> {
    return new Promise((resolve) => {
      const entry: PendingSend = {
        text,
        after: this.newestId,
        settle: (result) => {
          clearTimeout(timer)
          this.pending = this.pending.filter((other) => other !== entry)
          resolve(result)
        },
      }
      const timer = setTimeout(() => entry.settle('failed'), CHAT_ACK_TIMEOUT_MS)
      this.pending.push(entry)
    })
  }

  /** Messages arrived: this person's own may answer a send */
  heard(messages: readonly ChatMessage[], you: string | null): void {
    for (const message of messages) {
      this.newestId = Math.max(this.newestId, message.id)
      if (message.from !== you) continue
      this.pending
        .find((entry) => entry.text === message.text && message.id > entry.after)
        ?.settle('sent')
    }
  }

  /** The room refused something. True when that was a send, whose composer will say so */
  refused(code: ErrorMessage['code']): boolean {
    if (code !== 'rate_limited' && code !== 'chat_locked') return false
    const oldest = this.pending[0]
    oldest?.settle(code)
    return oldest !== undefined
  }

  /** The connection is gone: nothing more will be heard on it */
  failAll(): void {
    for (const entry of [...this.pending]) entry.settle('failed')
  }

  /** Another room, where message ids start over */
  reset(): void {
    this.failAll()
    this.newestId = -1
  }
}
