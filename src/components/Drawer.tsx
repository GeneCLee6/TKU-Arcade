import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import styled, { keyframes } from 'styled-components'
import { useT } from '../i18n/useT.ts'
import { color, fontSize, radius, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/**
 * A sheet that slides up from the bottom of a phone's screen, on the native <dialog> like Dialog: the
 * focus trap, Esc, the top layer and returning focus come with it. The parent owns `open`.
 *
 * The content mounts only once the sheet is showing, since what lays itself out when it mounts (a
 * chat log going to its last message) cannot measure anything inside a closed dialog.
 */
export function Drawer({ open, onClose, title, children }: DrawerProps) {
  const t = useT()
  const titleId = useId()
  const ref = useRef<HTMLDialogElement>(null)
  const [showing, setShowing] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
    setShowing(open)
  }, [open])

  const handleCancel = (event: SyntheticEvent) => {
    event.preventDefault()
    onClose()
  }

  // A browser may close the dialog itself (a second Esc skips cancel); keep the parent in step
  const handleNativeClose = () => {
    if (open) onClose()
  }

  // The content fills the sheet, so a click landing on the dialog itself is on the backdrop
  const handleClick = (event: MouseEvent) => {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <Sheet
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
            <Button $variant="ghost" $size="sm" onClick={onClose}>
              {t('common.close')}
            </Button>
          </Header>
          {showing && <Body>{children}</Body>}
        </Content>
      )}
    </Sheet>
  )
}

const slideUp = keyframes`
  from {
    transform: translateY(100%);
  }
`

const Sheet = styled.dialog`
  width: 100%;
  max-width: 560px;
  max-height: 85dvh;
  margin: auto auto 0;
  padding: 0;
  overflow: hidden;
  background: ${color.surface};
  color: ${color.text};
  border: 1px solid ${color.border};
  border-bottom: none;
  border-radius: ${radius.card}px ${radius.card}px 0 0;

  &[open] {
    display: flex;
    flex-direction: column;
    animation: ${slideUp} 180ms ease-out;
  }

  &::backdrop {
    background: ${color.overlay};
  }

  @media (prefers-reduced-motion: reduce) {
    &[open] {
      animation: none;
    }
  }
`

const Content = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${space.md}px;
  min-height: 0;
  padding: ${space.lg}px ${space.lg}px calc(${space.lg}px + env(safe-area-inset-bottom));
`

const Header = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.lg}px;

  & > button {
    flex: none;
  }
`

const Title = styled.h2`
  min-width: 0;
  margin: 0;
  font-size: ${fontSize.lg}px;
  overflow-wrap: anywhere;
`

const Body = styled.div`
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
`
