import { useState } from 'react'
import styled from 'styled-components'
import { MAX_PASSWORD_CHARS, normalizePassword } from '../../shared/protocol.ts'
import '../i18n/roomExtras.ts'
import { useT } from '../i18n/useT.ts'
import { glass } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { FieldError, FieldLabel, FieldRow, TextInput } from './Field.tsx'

/** A room with a password (e1-t16): asked of someone new, once; the seat token does the rest */
export default function PasswordForm({
  wrong,
  onSubmit,
}: {
  wrong: boolean
  onSubmit(password: string): void
}) {
  const t = useT()
  const [value, setValue] = useState('')
  const password = normalizePassword(value)
  return (
    <PasswordPanel
      aria-labelledby="room-password-title"
      onSubmit={(event) => {
        event.preventDefault()
        if (password !== null) onSubmit(password)
      }}
    >
      <PasswordTitle id="room-password-title">{t('room.extra.password.title')}</PasswordTitle>
      <p>{t('room.extra.password.hint')}</p>
      <FieldLabel htmlFor="room-password">{t('room.extra.password.label')}</FieldLabel>
      <FieldRow>
        <TextInput
          id="room-password"
          type="password"
          autoComplete="off"
          maxLength={MAX_PASSWORD_CHARS}
          value={value}
          aria-invalid={wrong}
          aria-describedby={wrong ? 'room-password-error' : undefined}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
        />
        <Button type="submit" disabled={password === null}>
          {t('room.extra.password.enter')}
        </Button>
      </FieldRow>
      {wrong && (
        <FieldError id="room-password-error" role="alert">
          {t('room.extra.password.wrong')}
        </FieldError>
      )}
    </PasswordPanel>
  )
}

const PasswordPanel = styled.form`
  ${glass}
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.lg}px;

  & > p {
    margin: 0;
    color: ${color.muted};
  }
`

const PasswordTitle = styled.h2`
  margin: 0;
  font-size: ${fontSize.lg}px;
`
