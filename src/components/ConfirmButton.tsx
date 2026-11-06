import { useState, type ReactNode } from 'react'
import styled from 'styled-components'
import { useT } from '../i18n/useT.ts'
import { Button, type ButtonVariant } from './Button.tsx'
import { Dialog } from './Dialog.tsx'

export interface ConfirmButtonProps {
  label: string
  /** When the label alone would not say who or what it is about */
  accessibleLabel?: string
  variant?: ButtonVariant
  title: string
  body: ReactNode
  onConfirm(): void
}

/**
 * A button that does its work only after a confirm dialog. Keep it mounted only while the action
 * still makes sense: unmounting takes an open dialog with it, so nothing stale can be confirmed.
 */
export function ConfirmButton({
  label,
  accessibleLabel,
  variant,
  title,
  body,
  onConfirm,
}: ConfirmButtonProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <>
      <Button $variant={variant} aria-label={accessibleLabel} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={title}
        actions={
          <>
            <Button $variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              $variant={variant === 'danger' ? 'danger' : 'primary'}
              onClick={() => {
                close()
                onConfirm()
              }}
            >
              {label}
            </Button>
          </>
        }
      >
        <Body>{body}</Body>
      </Dialog>
    </>
  )
}

const Body = styled.p`
  margin: 0;
  overflow-wrap: anywhere;
`
