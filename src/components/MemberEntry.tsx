import styled from 'styled-components'
import { KICK_BAN_MS, type RoomMember } from '../../shared/protocol.ts'
import { useT } from '../i18n/useT.ts'
import { color, fontSize, radius, space, type ColorName } from '../styles/tokens.ts'
import { ConfirmButton } from './ConfirmButton.tsx'

export interface MemberEntryProps {
  member: RoomMember
  isYou: boolean
  /** Whoever is looking is the host: they get the controls on everyone else's row */
  viewerIsHost: boolean
  onKick(memberId: string): void
  onTransfer(memberId: string): void
}

/**
 * The inside of a member's row: name, badges and, for the host, what can be done to them. Give it
 * `key={member.id}` wherever a row can come to hold someone else (a seat's row, as people move): an
 * open dialog must close then, not go on to name and act on whoever sits there now.
 */
export function MemberEntry({ member, isYou, viewerIsHost, onKick, onTransfer }: MemberEntryProps) {
  const t = useT()
  const { id, name } = member
  return (
    <>
      <Name>{name}</Name>
      <Badges>
        {member.host && <Badge $tone="accent">{t('room.waiting.badge.host')}</Badge>}
        {isYou && <Badge $tone="text">{t('room.waiting.badge.you')}</Badge>}
        {member.ready && <Badge $tone="success">{t('room.waiting.badge.ready')}</Badge>}
        {!member.online && <Badge $tone="muted">{t('room.waiting.badge.offline')}</Badge>}
      </Badges>
      {viewerIsHost && !isYou && (
        <HostActions>
          {member.online && (
            <ConfirmButton
              variant="secondary"
              label={t('room.host.transfer')}
              accessibleLabel={t('room.host.transferNamed', { name })}
              title={t('room.host.transferTitle', { name })}
              body={t('room.host.transferBody', { name })}
              onConfirm={() => onTransfer(id)}
            />
          )}
          <ConfirmButton
            variant="danger"
            label={t('room.host.kick')}
            accessibleLabel={t('room.host.kickNamed', { name })}
            title={t('room.host.kickTitle', { name })}
            body={t('room.host.kickBody', { name, minutes: KICK_BAN_MS / 60_000 })}
            onConfirm={() => onKick(id)}
          />
        </HostActions>
      )}
    </>
  )
}

// A long name without spaces must wrap, not push the row past a 320px screen
const Name = styled.span`
  min-width: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
`

const Badges = styled.span`
  display: inline-flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
`

const Badge = styled.span<{ $tone: ColorName }>`
  padding: 0 ${space.sm}px;
  color: ${(p) => color[p.$tone]};
  border: 1px solid currentColor;
  border-radius: ${radius.component}px;
  font-size: ${fontSize.sm}px;
`

const HostActions = styled.span`
  display: inline-flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
  margin-left: auto;
`
