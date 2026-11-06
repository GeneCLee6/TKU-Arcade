import { useCallback, useEffect, useRef, useState } from 'react'
import type { OptionValues } from '../../shared/games/types.ts'
import type { JsonValue } from '../../shared/patch.ts'
import type { ClientMessage, ErrorMessage, RoomView } from '../../shared/protocol.ts'
import { useToast } from '../components/useToast.ts'
import { en } from '../i18n/en.ts'
import { t, type TextKey } from '../i18n/t.ts'
import { connectRoom, type RoomConnection, type RoomEnd, type RoomTimer } from './roomConnection.ts'

export type RoomSession =
  | { phase: 'joining' }
  | { phase: 'joined'; you: string; view: RoomView }
  | { phase: 'ended'; end: RoomEnd }

export type RoomHandle = {
  session: RoomSession
  /** The countdowns running now; none once the connection has ended */
  timers: readonly RoomTimer[]
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
  setGame(gameId: string, options?: OptionValues): void
  setOptions(options: OptionValues): void
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

  useEffect(() => {
    const opened = connectRoom(roomId, name, {
      onView: (you, view) => setSession({ phase: 'joined', you, view }),
      onError: (error) => toast(errorText(error), { tone: 'danger' }),
      onTimers: setTimers,
      onEnd: (end) => {
        setSession({ phase: 'ended', end })
        setTimers([])
      },
    })
    connection.current = opened
    return () => {
      opened.leave()
      // A sender can be called between this and the next effect
      if (connection.current === opened) connection.current = null
    }
  }, [roomId, name, attempt, toast])

  const send = useCallback((message: ClientMessage) => connection.current?.send(message), [])

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
  const setGame = useCallback(
    (gameId: string, options?: OptionValues) =>
      send(options ? { t: 'set_game', gameId, options } : { t: 'set_game', gameId }),
    [send],
  )
  const setOptions = useCallback(
    (options: OptionValues) => send({ t: 'set_options', options }),
    [send],
  )

  return {
    session,
    timers,
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
    setGame,
    setOptions,
  }
}
