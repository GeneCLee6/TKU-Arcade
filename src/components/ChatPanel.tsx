import {
  memo,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import styled from 'styled-components'
import {
  ChatRateLimit,
  MAX_CHAT_CHARS,
  normalizeChatText,
  type ChatMessage,
} from '../../shared/chat.ts'
import type { MessageKey } from '../i18n/en.ts'
import { useLanguage, useT } from '../i18n/useT.ts'
import type { ChatDraft, ChatSendResult } from '../lib/chatState.ts'
import {
  chatTime,
  isAtBottom,
  isSendKey,
  isTouchPrimary,
  splitLinks,
  subscribeTouchPrimary,
} from '../lib/chatText.ts'
import { color, fontSize, radius, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { FieldError } from './Field.tsx'
import { Heading, Muted, Section } from './roomParts.ts'

export interface ChatPanelProps {
  messages: readonly ChatMessage[]
  /** This person's member id: their messages are marked */
  you: string
  /** The game has locked chat (`view.game.chatLocked`): the box is disabled and says why */
  locked: boolean
  /** Sends the text; anything but `sent` gives it back to the box and says why */
  onSend: (text: string) => Promise<ChatSendResult>
  /** Holds the unsent text, so it outlives this panel while the connection is away */
  draftStore: ChatDraft
}

/** The character count shows once this few are left */
const COUNT_WITHIN = 100

const SEND_PROBLEM: Record<Exclude<ChatSendResult, 'sent'>, MessageKey> = {
  rate_limited: 'room.error.rate_limited',
  chat_locked: 'room.error.chat_locked',
  failed: 'chat.sendFailed',
}

/**
 * The room's chat (e1-t07), the same for players and spectators: what the room sent, and a box to
 * write in. Messages are text: React text nodes, never HTML, with http(s) links as anchors that open
 * in a new tab without access to this page. With a keyboard Enter sends and Shift+Enter is a new
 * line; Enter while an input method is composing (注音) only picks the candidate. On a touch screen
 * Enter is a new line and only the button sends. The list follows new messages only while it is at
 * its bottom.
 */
export function ChatPanel({ messages, you, locked, onSend, draftStore }: ChatPanelProps) {
  const t = useT()
  const [draft, setDraftState] = useState(() => draftStore.read())
  const [problem, setProblem] = useState<MessageKey | null>(null)
  const [limit] = useState(() => new ChatRateLimit())
  const log = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const atBottom = useRef(true)
  const composing = useRef(false)
  const compositionEndedAt = useRef<number | null>(null)
  const hintId = useId()
  const problemId = useId()
  const touch = useSyncExternalStore(subscribeTouchPrimary, isTouchPrimary)

  const setDraft = (next: string) => {
    draftStore.write(next)
    setDraftState(next)
  }

  // Before paint, so a new message never flashes below the fold first
  const last = messages.at(-1)
  useLayoutEffect(() => {
    if (last && atBottom.current && log.current) log.current.scrollTop = log.current.scrollHeight
  }, [last])

  // The box grows with its text, up to its max-height
  useLayoutEffect(() => {
    const element = input.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [draft])

  const text = normalizeChatText(draft)
  const length = [...draft.trim()].length
  const tooLong = text === null && length > MAX_CHAT_CHARS

  const send = () => {
    if (text === null || locked) return
    if (!limit.take(you, Date.now())) {
      setProblem('room.error.rate_limited')
      return
    }
    setDraft('')
    setProblem(null)
    // Having just said something, this person wants to see it
    atBottom.current = true
    if (log.current) log.current.scrollTop = log.current.scrollHeight
    void onSend(text).then((result) => {
      if (result === 'sent') return
      // Anything typed since stays too, after the text it follows
      const typed = draftStore.read()
      setDraft(typed === '' ? text : `${text}\n${typed}`)
      setProblem(SEND_PROBLEM[result])
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const sends = isSendKey(
      {
        key: event.key,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        isComposing: event.nativeEvent.isComposing,
        keyCode: event.keyCode,
      },
      {
        enterSends: !touch,
        composing: composing.current,
        compositionEndedAt: compositionEndedAt.current,
        now: performance.now(),
      },
    )
    if (!sends) return
    event.preventDefault()
    send()
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    send()
    input.current?.focus()
  }

  return (
    <Panel>
      <Heading>{t('chat.heading')}</Heading>
      <Log
        ref={log}
        role="log"
        aria-label={t('chat.messages')}
        // A scrolling region is reachable by keyboard
        tabIndex={0}
        onScroll={(event) => {
          atBottom.current = isAtBottom(event.currentTarget)
        }}
      >
        <MessageList messages={messages} you={you} />
      </Log>
      <Compose onSubmit={onSubmit}>
        <Box $disabled={locked}>
          <Input
            ref={input}
            rows={1}
            value={draft}
            disabled={locked}
            aria-label={t('chat.inputLabel')}
            aria-describedby={problem ? `${hintId} ${problemId}` : hintId}
            aria-invalid={tooLong}
            placeholder={t('chat.placeholder')}
            // The on-screen keyboard's Enter says what it does: a new line on touch screens
            enterKeyHint={touch ? 'enter' : 'send'}
            onCompositionStart={() => {
              composing.current = true
            }}
            onCompositionEnd={() => {
              composing.current = false
              compositionEndedAt.current = performance.now()
            }}
            onChange={(event) => {
              setDraft(event.target.value)
              if (problem) setProblem(null)
            }}
            onKeyDown={onKeyDown}
          />
          <SendButton type="submit" disabled={locked || text === null}>
            {t('chat.send')}
          </SendButton>
        </Box>
        <Footer>
          <span id={hintId}>
            {locked ? t('chat.locked') : t(touch ? 'chat.hintTouch' : 'chat.hint')}
          </span>
          {!tooLong && length >= MAX_CHAT_CHARS - COUNT_WITHIN && (
            <span aria-live="polite">
              {t('chat.remaining', { count: MAX_CHAT_CHARS - length })}
            </span>
          )}
        </Footer>
        {tooLong && (
          <FieldError role="alert">{t('chat.tooLong', { max: MAX_CHAT_CHARS })}</FieldError>
        )}
        {problem && (
          <FieldError id={problemId} role="alert">
            {t(problem)}
          </FieldError>
        )}
      </Compose>
    </Panel>
  )
}

// Apart from the box: typing must not lay out up to CHAT_HISTORY messages again on every key
const MessageList = memo(function MessageList({
  messages,
  you,
}: {
  messages: readonly ChatMessage[]
  you: string
}) {
  const t = useT()
  const language = useLanguage()
  if (messages.length === 0) return <Muted>{t('chat.empty')}</Muted>
  return (
    <Messages>
      {messages.map((message) => {
        const own = message.from === you
        return (
          <Item key={message.id} $own={own}>
            <Meta>
              <Name>{message.name}</Name>
              {own && <span>{t('chat.you')}</span>}
              <time dateTime={new Date(message.at).toISOString()}>
                {chatTime(message.at, language)}
              </time>
            </Meta>
            <Bubble $own={own}>
              <MessageText text={message.text} />
            </Bubble>
          </Item>
        )
      })}
    </Messages>
  )
})

/** A message's text: plain text nodes and safe anchors, nothing else (never innerHTML) */
function MessageText({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((segment, index) =>
        segment.type === 'link' ? (
          <a key={index} href={segment.href} target="_blank" rel="noopener noreferrer">
            {segment.text}
          </a>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  )
}

// min-width: a grid item would otherwise not shrink below its content on a 320px screen
const Panel = styled(Section)`
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
`

const Log = styled.div`
  min-height: 120px;
  max-height: 320px;
  overflow-y: auto;
  padding: ${space.md}px;
  background: ${color.surface};
  border: 1px solid ${color.border};
  border-radius: ${radius.component}px;
`

const Messages = styled.ol`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.md}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Item = styled.li<{ $own: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: ${(p) => (p.$own ? 'flex-end' : 'flex-start')};
  gap: ${space.xs}px;
  min-width: 0;
`

const Meta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
  max-width: 100%;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  overflow-wrap: anywhere;
`

const Name = styled.span`
  min-width: 0;
  font-weight: 600;
`

const Bubble = styled.p<{ $own: boolean }>`
  max-width: 85%;
  margin: 0;
  padding: ${space.sm}px ${space.md}px;
  background: ${color.bg};
  border: 1px solid ${(p) => (p.$own ? color.accent : color.border)};
  border-radius: ${radius.component}px;
  /* Newlines as typed; long URLs and words wrap instead of widening the page */
  white-space: pre-wrap;
  overflow-wrap: anywhere;

  a {
    color: ${color.text};
    text-decoration: underline;
  }
`

const Compose = styled.form`
  display: grid;
  /* The column may shrink below the textarea's own width (its 20 columns) */
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.xs}px;
`

const Box = styled.div<{ $disabled: boolean }>`
  display: flex;
  align-items: flex-end;
  gap: ${space.sm}px;
  padding: ${space.xs}px ${space.xs}px ${space.xs}px ${space.md}px;
  background: ${color.surface};
  border: 1px solid ${color.border};
  border-radius: ${radius.component}px;
  opacity: ${(p) => (p.$disabled ? 0.7 : 1)};

  &:focus-within {
    outline: 2px solid ${color.accent};
    outline-offset: -1px;
  }
`

// 16px text: iOS zooms the page when focusing anything smaller. The outline is on the box around it.
const Input = styled.textarea`
  flex: 1;
  min-width: 0;
  min-height: 44px;
  max-height: calc(5 * 1.5em + ${space.lg}px);
  padding: ${space.sm}px 0;
  background: transparent;
  color: ${color.text};
  border: none;
  font-family: inherit;
  font-size: ${fontSize.md}px;
  line-height: 1.5;
  resize: none;
  overflow-y: auto;

  &:focus {
    outline: none;
  }
`

const SendButton = styled(Button)`
  flex: none;
`

const Footer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: ${space.sm}px;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`
