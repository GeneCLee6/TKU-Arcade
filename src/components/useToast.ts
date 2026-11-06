import { createContext, useContext } from 'react'

export type ToastTone = 'info' | 'success' | 'warning' | 'danger'

export interface ToastOptions {
  tone?: ToastTone
  // Milliseconds on screen
  duration?: number
}

export type ShowToast = (message: string, options?: ToastOptions) => void

export const ToastContext = createContext<ShowToast | null>(null)

export function useToast(): ShowToast {
  const show = useContext(ToastContext)
  if (!show) throw new Error('useToast must be used inside <ToastProvider>')
  return show
}
