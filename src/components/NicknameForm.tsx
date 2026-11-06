import { useId, useState, type ChangeEvent, type FormEvent } from 'react'
import { MAX_NAME_CHARS, normalizeName } from '../../shared/protocol.ts'
import { useT } from '../i18n/useT.ts'
import { readNickname, writeNickname } from '../lib/nickname.ts'
import { Button } from './Button.tsx'
import { FieldError, FieldLabel, FieldRow, TextInput } from './Field.tsx'

// A modal's showModal() runs after this mounts and moves focus to the dialog's first control (its
// Close button) unless something has the attribute, which React's autoFocus prop does not set.
// Outside a dialog nothing reads the attribute after load, hence focus() too. Stable, so that it
// runs once and does not take the focus back on every render.
const focusOnMount = (input: HTMLInputElement | null) => {
  input?.setAttribute('autofocus', '')
  input?.focus()
}

/** Asks for a nickname, stores it and hands it on; used by the lobby's dialog and the room page */
export function NicknameForm({ onSubmit }: { onSubmit: (name: string) => void }) {
  const t = useT()
  const inputId = useId()
  const errorId = useId()
  const [value, setValue] = useState(() => readNickname() ?? '')
  const [invalid, setInvalid] = useState(false)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const name = normalizeName(value)
    if (name === null) {
      setInvalid(true)
      return
    }
    writeNickname(name)
    onSubmit(name)
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value)
    setInvalid(false)
  }

  // No maxLength: it counts UTF-16 units, so it would cut off a valid name of 16 emoji
  return (
    <form onSubmit={handleSubmit} noValidate>
      <FieldLabel htmlFor={inputId}>{t('nickname.label')}</FieldLabel>
      <FieldRow>
        <TextInput
          ref={focusOnMount}
          id={inputId}
          name="nickname"
          autoComplete="nickname"
          value={value}
          onChange={handleChange}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
        />
        <Button type="submit">{t('nickname.submit')}</Button>
      </FieldRow>
      {invalid && (
        <FieldError id={errorId} role="alert">
          {t('nickname.invalid', { max: MAX_NAME_CHARS })}
        </FieldError>
      )}
    </form>
  )
}
