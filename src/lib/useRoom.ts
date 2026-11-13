import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeChatText, type ChatMessage } from '../../shared/chat.ts'
import type { OptionValues } from '../../shared/games/types.ts'
import type { JsonValue } from '../../shared/patch.ts'
import type { ClientMessage, CoverMessage, ErrorMessage, RoomView } from '../../shared/protocol.ts'
import { useToast } from '../components/useToast.ts'
import { en } from '../i18n/en.ts'
import { t, type TextKey } from '../i18n/t.ts'
import { ChatSends, mergeChat, type ChatSendResult } from './chatState.ts'
import { connectRoom, type RoomConnection, type RoomEnd, type RoomTimer } from './roomConnection.ts'

export type RoomSession =
  | { phase: 'joining' }
  /** `reconnecting`: the connection dropped; `view` is the last one seen, nothing can be sent */
  | { phase: 'joined'; you: string; view: RoomView; reconnecting: boolean }
  /** The room has a password (e1-t16) and this browser has none, or the wrong one */
  | { phase: 'password'; wrong: boolean }
  | { phase: 'ended'; end: RoomEnd }

export type RoomHandle = {
  session: RoomSession
  /** The countdowns running now; none once the connection has ended */
  timers: readonly RoomTimer[]
  /** The room's messages, oldest first; kept through a reconnect until a `reset` replaces them */
  chat: readonly ChatMessage[]
  retry(): void
  sit(seat: number | null): void
  setReady(ready: boolean): void
  start(): void
  act(action: JsonValue): void
  kick(memberId: string): void
  transfer(memberId: string): void
  dissolve(): void
  rematch(): void
  reopen(): void
  /** The host deals with a seat in `view.coverable` */
  cover(seat: number, how: CoverMessage['how']): void
  setGame(gameId: string, options?: OptionValues): void
  setOptions(options: OptionValues): void
  /** e1-t16: the host's; null takes the password away */
  setPassword(password: string | null): void
  /** Settles when the room has answered or won't: anything but `sent` means it did not arrive */
  sendChat(text: string): Promise<ChatSendResult>
}

function errorText(error: ErrorMessage): string {
  if (error.code === 'game_error') return t(error.error.gameError as TextKey, error.error.params)
  const key = `room.error.${error.code}`
  // A newer server can send a code this page does not know
  return t(key in en ? (key as TextKey) : 'room.error.generic')
}

/** One person's connection to a room. Rules stay on the server: this only shows `view` and asks */
export function useRoom(roomId: string, name: string): RoomHandle {
  const toast = useToast()
  const [session, setSession] = useState<RoomSession>({ phase: 'joining' })
  const [timers, setTimers] = useState<readonly RoomTimer[]>([])
  const [attempt, setAttempt] = useState(0)
  const connection = useRef<RoomConnection | null>(null)
  const [chat, setChat] = useState<readonly ChatMessage[]>([])
  const chatSends = useRef(new ChatSends())
  const you = useRef<string | null>(null)

  useEffect(() => {
    if (session.phase === 'joined') you.current = session.you
  }, [session])

  // Another room's messages are not this one's. Not on a reconnect: those wait for the `reset`
  useEffect(() => {
    const sends = chatSends.current
    return () => {
      sends.reset()
      setChat([])
    }
  }, [roomId])

  useEffect(() => {
    const opened = connectRoom(roomId, name, {
      onView: (you, view) => setSession({ phase: 'joined', you, view, reconnecting: false }),
      // Sends still waiting stay so: one that got through shows up in the history the next socket
      // gets, and giving its text back now would have it sent twice. CHAT_ACK_TIMEOUT_MS ends the rest
      onReconnecting: () =>
        setSession((current) =>
          current.phase === 'joined' ? { ...current, reconnecting: true } : current,
        ),
      onUnanswered: () => toast(t('room.reconnecting.lostTap'), { tone: 'warning' }),
      onError: (error) => {
        // Not let in: ask for the password, and stop knocking until it is typed (`retry`)
        if (error.code === 'password_required' || error.code === 'wrong_password') {
          opened.leave()
          setSession({ phase: 'password', wrong: error.code === 'wrong_password' })
          return
        }
        // A refused message is the composer's to explain, with its text back in the box
        if (!chatSends.current.refused(error.code)) toast(errorText(error), { tone: 'danger' })
      },
      onTimers: setTimers,
      onChat: (messages, reset) => {
        setChat((current) => mergeChat(current, messages, reset))
        chatSends.current.heard(messages, you.current)
      },
      onEnd: (end) => {
        setSession({ phase: 'ended', end })
        setTimers([])
        chatSends.current.failAll()
      },
    })
    connection.current = opened
    return () => {
      opened.leave()
      // A sender can be called between this and the next effect
      if (connection.current === opened) connection.current = null
    }
  }, [roomId, name, attempt, toast])

  // Every button goes through here, so none of them can look as if it had worked while offline
  const send = useCallback(
    (message: ClientMessage) => {
      if (!connection.current?.send(message)) {
        toast(t('room.reconnecting.notSent'), { tone: 'warning' })
      }
    },
    [toast],
  )

  const retry = useCallback(() => {
    setSession({ phase: 'joining' })
    setTimers([])
    setAttempt((count) => count + 1)
  }, [])
  const sit = useCallback((seat: number | null) => send({ t: 'sit', seat }), [send])
  const setReady = useCallback((ready: boolean) => send({ t: 'ready', ready }), [send])
  const start = useCallback(() => send({ t: 'start' }), [send])
  const act = useCallback((action: JsonValue) => send({ t: 'action', action }), [send])
  const kick = useCallback((member: string) => send({ t: 'kick', member }), [send])
  const transfer = useCallback((member: string) => send({ t: 'transfer', member }), [send])
  const dissolve = useCallback(() => send({ t: 'dissolve' }), [send])
  const rematch = useCallback(() => send({ t: 'rematch' }), [send])
  const reopen = useCallback(() => send({ t: 'reopen' }), [send])
  const cover = useCallback(
    (seat: number, how: CoverMessage['how']) => send({ t: 'cover', seat, how }),
    [send],
  )
  const setGame = useCallback(
    (gameId: string, options?: OptionValues) =>
      send(options ? { t: 'set_game', gameId, options } : { t: 'set_game', gameId }),
    [send],
  )
  const setOptions = useCallback(
    (options: OptionValues) => send({ t: 'set_options', options }),
    [send],
  )
  const setPassword = useCallback(
    (password: string | null) => send({ t: 'set_password', password }),
    [send],
  )
  const sendChat = useCallback((raw: string): Promise<ChatSendResult> => {
    // The room closes the socket over a message that does not parse
    const text = normalizeChatText(raw)
    // Not sent while reconnecting: the composer keeps the text and says so
    if (text === null || !connection.current?.send({ t: 'chat', text })) {
      return Promise.resolve('failed')
    }
    return chatSends.current.add(text)
  }, [])

  return {
    session,
    timers,
    chat,
    retry,
    sit,
    setReady,
    start,
    act,
    kick,
    transfer,
    dissolve,
    rematch,
    reopen,
    cover,
    setGame,
    setOptions,
    setPassword,
    sendChat,
  }
}
