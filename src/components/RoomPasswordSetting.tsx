import { useState } from 'react'
import styled from 'styled-components'
import { MAX_PASSWORD_CHARS, normalizePassword } from '../../shared/protocol.ts'
import '../i18n/roomExtras.ts'
import { useT } from '../i18n/useT.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { FieldLabel, FieldRow, TextInput } from './Field.tsx'

interface RoomPasswordSettingProps {
  /** Whether the room has a password */
  locked: boolean
  /** The password as this browser set or typed it (src/lib/roomPassword.ts), null when it has none */
  known: string | null
  /** The host's: set it, or take it away with null. Without it the room only says it has one */
  onSet?: (password: string | null) => void
}

/**
 * The room's password in the invitation (e1-t16): the host sets or takes it away; someone new is
 * asked for it, members already in are not. Since 2026-11-23 the room keeps only a salted hash, so
 * nobody is sent the password: the host sees the one this browser set, others only that there is one.
 */
export default function RoomPasswordSetting({ locked, known, onSet }: RoomPasswordSettingProps) {
  const t = useT()
  const [draft, setDraft] = useState('')
  const typed = normalizePassword(draft)
  const shown =
    known !== null ? (
      <Shown>
        {t('room.extra.password.is')} <Value translate="no">{known}</Value>
      </Shown>
    ) : (
      <Shown>{t('room.extra.password.locked')}</Shown>
    )

  if (!onSet) {
    return (
      <Block>
        <Shown>{t('room.extra.password.locked')}</Shown>
        <Hint>{t('room.extra.password.askHost')}</Hint>
      </Block>
    )
  }
  if (locked) {
    return (
      <Block>
        {shown}
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
