import { useState } from 'react'
import styled from 'styled-components'
import type { PalaceRole } from '../../../shared/games/palace/types.ts'
import { Button } from '../../components/Button.tsx'
import { Heading } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { glass } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import './messages.ts'
import { RoleCard } from './RoleCard.tsx'
import { roleKey } from './screenState.ts'

const ROLES: readonly PalaceRole[] = ['treasurer', 'guard', 'eunuch', 'strategist', 'dowager']

/** The five roles and what anyone may do, folded away until asked for */
export function RoleGuide() {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <Panel aria-labelledby="palace-roles-heading" data-testid="role-guide">
      <Top>
        <Heading id="palace-roles-heading">{t('games.palace.ui.roles')}</Heading>
        <Button $variant="ghost" $size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          {t(open ? 'games.palace.ui.rolesHide' : 'games.palace.ui.rolesShow')}
        </Button>
      </Top>
      {open && (
        <Lines>
          <Line>
            <div>
              <Name>{t('games.palace.ui.anyone')}</Name>
              <Does>{t('games.palace.ui.anyoneDoes')}</Does>
            </div>
          </Line>
          {ROLES.map((role) => (
            <Line key={role}>
              <RoleCard role={role} size="sm" />
              <div>
                <Name>{t(roleKey(role))}</Name>
                <Does>{t(`games.palace.role.${role}.does`)}</Does>
              </div>
            </Line>
          ))}
        </Lines>
      )}
    </Panel>
  )
}

const Panel = styled.section`
  ${glass}
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.lg}px;
`

const Top = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.sm}px;
`

const Lines = styled.ul`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Line = styled.li`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px;
  padding: ${space.xs}px ${space.sm}px;
  background: ${color.sunken};
`

const Name = styled.span`
  display: block;
  font-weight: 700;
`

const Does = styled.span`
  display: block;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`
