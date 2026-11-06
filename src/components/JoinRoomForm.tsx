import { useId, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseRoomInput } from '../../shared/room-id.ts'
import { useT } from '../i18n/useT.ts'
import { Button } from './Button.tsx'
import { FieldError, FieldLabel, FieldRow, TextInput } from './Field.tsx'

/** The lobby's "got a link?" box: a whole link or a bare room id */
export function JoinRoomForm() {
  const t = useT()
  const navigate = useNavigate()
  const inputId = useId()
  const errorId = useId()
  const [value, setValue] = useState('')
  const [invalid, setInvalid] = useState(false)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const id = parseRoomInput(value)
    if (id === null) setInvalid(true)
    else navigate(`/r/${id}`)
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value)
    setInvalid(false)
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FieldLabel htmlFor={inputId}>{t('lobby.join.label')}</FieldLabel>
      <FieldRow>
        <TextInput
          id={inputId}
          name="room"
          autoComplete="off"
          value={value}
          onChange={handleChange}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
        />
        <Button type="submit" $variant="secondary">
          {t('lobby.join.submit')}
        </Button>
      </FieldRow>
      {invalid && (
        <FieldError id={errorId} role="alert">
          {t('lobby.join.invalid')}
        </FieldError>
      )}
    </form>
  )
}
