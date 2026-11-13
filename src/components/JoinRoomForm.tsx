import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import styled from 'styled-components'
import { parseRoomCode } from '../../shared/room-code.ts'
import { parseRoomInput } from '../../shared/room-id.ts'
import type { TextKey } from '../i18n/t.ts'
import { useT } from '../i18n/useT.ts'
import { findRoomByCode } from '../lib/rooms.ts'
import { useNavigate } from '../lib/useRouter.ts'
import { monoType } from '../styles/esports.ts'
import { fontSize } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { FieldError, FieldLabel, FieldRow, TextInput } from './Field.tsx'

/**
 * The lobby's join box: a room's four-digit number (shared/room-code.ts), a whole link, or a bare
 * room id. `prominent` is the installed app's version (owner, 2026-11-13): the first thing on the
 * page, a number pad on a phone, and big digits
 */
export function JoinRoomForm({ prominent = false }: { prominent?: boolean }) {
  const t = useT()
  const navigate = useNavigate()
  const inputId = useId()
  const errorId = useId()
  const [value, setValue] = useState('')
  const [problem, setProblem] = useState<TextKey | null>(null)
  const [looking, setLooking] = useState(false)
  const inFlight = useRef<AbortController | null>(null)

  // Whoever left the lobby meanwhile should not be carried off to the room
  useEffect(() => () => inFlight.current?.abort(), [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (looking) return
    const code = parseRoomCode(value)
    if (code !== null) {
      const controller = new AbortController()
      inFlight.current = controller
      setLooking(true)
      const found = await findRoomByCode(code, controller.signal)
      if (controller.signal.aborted) return
      setLooking(false)
      if (found === 'missing') setProblem('lobby.join.notFound')
      else if (found === null) setProblem('lobby.join.failed')
      else navigate(`/r/${found}`)
      return
    }
    const id = parseRoomInput(value)
    if (id === null) setProblem('lobby.join.invalid')
    else navigate(`/r/${id}`)
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value)
    setProblem(null)
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate>
      <FieldLabel htmlFor={inputId}>{t(prominent ? 'lobby.join.appLabel' : 'lobby.join.label')}</FieldLabel>
      <FieldRow>
        <CodeInput
          id={inputId}
          name="room"
          autoComplete="off"
          // A room id is case-sensitive: a phone's keyboard must not "correct" what is typed
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          // The app asks for a number, so a phone shows its number pad; a pasted link still works
          inputMode={prominent ? 'numeric' : 'url'}
          enterKeyHint="go"
          placeholder={prominent ? '1234' : undefined}
          value={value}
          onChange={handleChange}
          aria-invalid={problem !== null}
          aria-describedby={problem !== null ? errorId : undefined}
          $big={prominent}
        />
        <Button type="submit" $variant={prominent ? 'primary' : 'secondary'} aria-disabled={looking}>
          {t('lobby.join.submit')}
        </Button>
      </FieldRow>
      {problem !== null && (
        <FieldError id={errorId} role="alert">
          {t(problem)}
        </FieldError>
      )}
    </form>
  )
}

// A link, an id or a number: mono, as ids are everywhere else
const CodeInput = styled(TextInput)<{ $big: boolean }>`
  ${monoType}
  ${(p) => (p.$big ? `font-size: ${fontSize.xxl}px; letter-spacing: 0.2em; min-height: 56px;` : '')}
`
