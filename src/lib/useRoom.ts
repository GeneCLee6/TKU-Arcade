import { useCallback, useEffect, useRef, useState } from 'react'
import type { JsonValue } from '../../shared/patch.ts'
import type { ClientMessage, ErrorMessage, RoomView } from '../../shared/protocol.ts'
import { useToast } from '../components/useToast.ts'
import { en } from '../i18n/en.ts'
import { t, type TextKey } from '../i18n/t.ts'
import { connectRoom, type RoomConnection, type RoomEnd } from './roomConnection.ts'

export type RoomSession =
  | { phase: 'joining' }
  | { phase: 'joined'; you: string; view: RoomView }
  | { phase: 'ended'; end: RoomEnd }

export type RoomHandle = {
  session: RoomSession
  retry(): void
  sit(seat: number | null): void
  setReady(ready: boolean): void
  start(): void
  act(action: JsonValue): void
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
  const [attempt, setAttempt] = useState(0)
  const connection = useRef<RoomConnection | null>(null)

  useEffect(() => {
    const opened = connectRoom(roomId, name, {
      onView: (you, view) => setSession({ phase: 'joined', you, view }),
      onError: (error) => toast(errorText(error), { tone: 'danger' }),
      onEnd: (end) => setSession({ phase: 'ended', end }),
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
    setAttempt((count) => count + 1)
  }, [])
  const sit = useCallback((seat: number | null) => send({ t: 'sit', seat }), [send])
  const setReady = useCallback((ready: boolean) => send({ t: 'ready', ready }), [send])
  const start = useCallback(() => send({ t: 'start' }), [send])
  const act = useCallback((action: JsonValue) => send({ t: 'action', action }), [send])

  return { session, retry, sit, setReady, start, act }
}
