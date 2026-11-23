// 2026-11-23: a member's name as a button that opens their card (bus.ts); it looks like the name it
// replaces, and emotes float by it (SOCIAL_MEMBER)
import type { ReactNode } from 'react'
import styled from 'styled-components'
import { useT } from '../../i18n/useT.ts'
import { color } from '../../styles/tokens.ts'
import { openPlayerCard, SOCIAL_MEMBER } from './bus.ts'

export function NameButton({ member, name, children }: { member: string; name: string; children?: ReactNode }) {
  const t = useT()
  return (
    <Plain
      type="button"
      {...{ [SOCIAL_MEMBER]: member }}
      aria-haspopup="dialog"
      aria-label={t('room.card.open', { name })}
      title={t('room.card.open', { name })}
      onClick={() => openPlayerCard(member)}
    >
      {children ?? name}
    </Plain>
  )
}

// The name's own look, with a dotted underline on hover to say it opens something
const Plain = styled.button`
  min-width: 0;
  padding: 0;
  color: inherit;
  background: none;
  border: 0;
  font: inherit;
  text-align: inherit;
  overflow-wrap: anywhere;
  cursor: pointer;

  &:hover {
    text-decoration: underline dotted ${color.accent};
    text-underline-offset: 3px;
  }
`
