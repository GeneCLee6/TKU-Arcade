import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react'
import styled from 'styled-components'
import { useT } from '../i18n/useT.ts'
import { displayType } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  actions?: ReactNode
}

// A modal on the native <dialog>, which brings the focus trap, Esc, the top layer and returning
// focus to the opener. The parent owns `open`: every way out only asks it through onClose.
export function Dialog({ open, onClose, title, children, actions }: DialogProps) {
  const t = useT()
  const titleId = useId()
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const handleCancel = (event: SyntheticEvent) => {
    event.preventDefault()
    onClose()
  }

  // A browser may close the dialog itself (a second Esc skips cancel); keep the parent in step
  const handleNativeClose = () => {
    if (open) onClose()
  }

  // The content fills the dialog, so a click landing on the dialog itself is on the backdrop
  const handleClick = (event: MouseEvent) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <Panel
      ref={ref}
      aria-labelledby={titleId}
      onCancel={handleCancel}
      onClose={handleNativeClose}
      onClick={handleClick}
    >
      {open && (
        <Content>
          <Header>
            <Title id={titleId}>{title}</Title>
            <Button $variant="ghost" onClick={onClose}>
              {t('common.close')}
            </Button>
          </Header>
          <div>{children}</div>
          {actions && <Actions>{actions}</Actions>}
        </Content>
      )}
    </Panel>
  )
}

const Panel = styled.dialog`
  width: min(480px, calc(100vw - ${space.xxl}px));
  /* A long body scrolls inside: the phone's own chrome must not hide the buttons */
  max-height: calc(100dvh - ${space.xxl}px);
  padding: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: ${color.surface};
  color: ${color.text};
  border: 1px solid ${color.border};
  border-top: 3px solid ${color.accent};
  border-radius: 0;
  box-shadow: 0 ${space.xxl}px ${space.xxxl}px ${color.overlay};

  &::backdrop {
    background: ${color.overlay};
  }

  /* On a phone it sits at the bottom, where a thumb can reach its buttons */
  @media (max-width: 599px) {
    width: 100%;
    max-width: 100%;
    margin: auto 0 0;
    border-width: 3px 0 0;
  }
`

const Content = styled.div`
  display: grid;
  gap: ${space.lg}px;
  padding: ${space.xl}px ${space.xl}px calc(${space.xl}px + env(safe-area-inset-bottom));
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.lg}px;

  & > button {
    flex: none;
  }
`

// A title can hold someone's nickname; a long one without spaces must wrap, not push the close
// button off a 320px screen
const Title = styled.h2`
  min-width: 0;
  margin: 0;
  ${displayType}
  font-size: ${fontSize.lg}px;
  overflow-wrap: anywhere;
`

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: ${space.sm}px;

  @media (max-width: 599px) {
    & > * {
      flex: 1;
    }
  }
`
