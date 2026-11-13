import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import styled, { keyframes } from 'styled-components'
import { useT } from '../i18n/useT.ts'
import { color, fontSize, space, type ColorName } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { ToastContext, type ShowToast, type ToastTone } from './useToast.ts'

const DEFAULT_DURATION = 5000
const MAX_VISIBLE = 3

interface ToastEntry {
  id: number
  message: string
  tone: ToastTone
  duration: number
}

const toneColor: Record<ToastTone, ColorName> = {
  info: 'accent',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
}

// Holds the toasts and their live region. The region is always in the page, because screen readers
// only announce changes inside a live region they already know about.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const nextId = useRef(0)

  const show = useCallback<ShowToast>((message, options) => {
    const entry: ToastEntry = {
      id: nextId.current++,
      message,
      tone: options?.tone ?? 'info',
      duration: options?.duration ?? DEFAULT_DURATION,
    }
    setToasts((current) => [...current, entry].slice(-MAX_VISIBLE))
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <Region aria-live="polite">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </Region>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: ToastEntry; onDismiss: (id: number) => void }) {
  const t = useT()
  const { id, duration } = toast

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), duration)
    return () => clearTimeout(timer)
  }, [id, duration, onDismiss])

  return (
    <Item $tone={toast.tone} role={toast.tone === 'danger' ? 'alert' : undefined}>
      <span>{toast.message}</span>
      <Button $variant="ghost" $size="sm" onClick={() => onDismiss(id)}>
        {t('common.close')}
      </Button>
    </Item>
  )
}

const slideIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(${space.sm}px);
  }
`

const Region = styled.div`
  position: fixed;
  right: ${space.lg}px;
  bottom: calc(${space.lg}px + env(safe-area-inset-bottom));
  left: ${space.lg}px;
  z-index: 10;
  display: grid;
  justify-items: end;
  gap: ${space.sm}px;
  pointer-events: none;
`

const Item = styled.div<{ $tone: ToastTone }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.md}px;
  width: min(400px, 100%);
  padding: ${space.sm}px ${space.md}px;
  background: ${color.surface};
  color: ${color.text};
  border: 1px solid ${color.border};
  border-left: ${space.xs}px solid ${(p) => color[toneColor[p.$tone]]};
  box-shadow: 0 ${space.xs}px ${space.lg}px ${color.overlay};
  font-size: ${fontSize.sm}px;
  pointer-events: auto;
  animation: ${slideIn} 150ms ease-out;
`
