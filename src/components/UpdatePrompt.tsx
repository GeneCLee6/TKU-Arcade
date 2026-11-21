// 2026-11-21 (docs/ARCHITECTURE.md §4.56): a new version of the site is out and installed alongside
// (the service worker), and this page is still the old one. Says so on every page, with a reload,
// until its person reloads or puts it off; a game in a room comes back after the reload (the seat's
// token). Its own lazy chunk, loaded only once there is a new version.
import { useState } from 'react'
import styled from 'styled-components'
import { useT } from '../i18n/useT.ts'
import { applyUpdate } from '../lib/installApp.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'

export default function UpdatePrompt() {
  const t = useT()
  const [later, setLater] = useState(false)
  if (later) return null
  return (
    <Bar role="status" data-testid="update-prompt">
      <span>{t('update.ready')}</span>
      <Actions>
        <Button $size="sm" onClick={applyUpdate}>
          {t('update.reload')}
        </Button>
        <Button $variant="ghost" $size="sm" onClick={() => setLater(true)}>
          {t('update.later')}
        </Button>
      </Actions>
    </Bar>
  )
}

const Bar = styled.div`
  position: fixed;
  top: calc(${space.sm}px + env(safe-area-inset-top));
  left: 50%;
  z-index: 11;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.sm}px ${space.md}px;
  width: min(520px, calc(100% - ${space.lg * 2}px));
  padding: ${space.sm}px ${space.md}px;
  translate: -50% 0;
  background: ${color.surface};
  color: ${color.text};
  border: 1px solid ${color.border};
  border-left: ${space.xs}px solid ${color.brand};
  box-shadow: 0 ${space.xs}px ${space.lg}px ${color.overlay};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Actions = styled.div`
  display: flex;
  gap: ${space.xs}px;
`
