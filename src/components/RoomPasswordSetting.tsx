import { useState } from 'react'
import styled from 'styled-components'
import { MAX_PASSWORD_CHARS, normalizePassword } from '../../shared/protocol.ts'
import '../i18n/roomExtras.ts'
import { useT } from '../i18n/useT.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { FieldLabel, FieldRow, TextInput } from './Field.tsx'

interface RoomPasswordSettingProps {
  /** The room's password, null for none */
  password: string | null
  /** The host's: set it, or take it away with null. Without it the password is only shown */
  onSet?: (password: string | null) => void
}

/**
 * The room's password in the invitation (e1-t16): the host sets or takes it away; everyone in the
 * room sees it, to pass on with the link. Someone new is asked for it; members already in are not.
 */
export default function RoomPasswordSetting({ password, onSet }: RoomPasswordSettingProps) {
  const t = useT()
  const [draft, setDraft] = useState('')
  const typed = normalizePassword(draft)

  if (!onSet) {
    return (
      <Shown>
        {t('room.extra.password.is')} <Value translate="no">{password}</Value>
      </Shown>
    )
  }
  if (password !== null) {
    return (
      <Block>
        <Shown>
          {t('room.extra.password.is')} <Value translate="no">{password}</Value>
        </Shown>
        <Hint>{t('room.extra.password.setHint')}</Hint>
        <div>
          <Button $variant="ghost" $size="sm" onClick={() => onSet(null)}>
            {t('room.extra.password.remove')}
          </Button>
        </div>
      </Block>
    )
  }
  return (
    <Block
      as="form"
      onSubmit={(event) => {
        event.preventDefault()
        if (typed === null) return
        onSet(typed)
        setDraft('')
      }}
    >
      <FieldLabel htmlFor="room-password-setting">{t('room.extra.password.setLabel')}</FieldLabel>
      <FieldRow>
        <TextInput
          id="room-password-setting"
          type="text"
          autoComplete="off"
          maxLength={MAX_PASSWORD_CHARS}
          value={draft}
          aria-describedby="room-password-setting-hint"
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" $variant="secondary" disabled={typed === null}>
          {t('room.extra.password.set')}
        </Button>
      </FieldRow>
      <Hint id="room-password-setting-hint">{t('room.extra.password.setHint')}</Hint>
    </Block>
  )
}

const Block = styled.div`
  display: grid;
  gap: ${space.xs}px;
`

const Shown = styled.p`
  margin: 0;
  font-weight: 700;
`

const Value = styled.span`
  color: ${color.accent};
  overflow-wrap: anywhere;
`

const Hint = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`
