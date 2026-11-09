import { useContext, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import styled from 'styled-components'
import { useT } from '../i18n/useT.ts'
import { clearAccountFailure, signInHref, signOut, useAccount } from '../lib/account.ts'
import { color, fontSize, radius, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { ToastContext } from './useToast.ts'

/**
 * The sign-in link or the sign-out button (e1-t13), in the lobby beside the nickname and on a
 * room's nickname step. Nothing until the Worker answers, and nothing at all while sign-in is not
 * configured
 */
export function AccountControl() {
  const t = useT()
  // The top bar is also on pages without a toast provider (the rules page): nothing is said there
  const toast = useContext(ToastContext)
  const state = useAccount()
  const { pathname, search } = useLocation()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // Kept for a page that can say it, if this one cannot
    if (!state?.failed || !toast) return
    toast(t('account.failed'), { tone: 'danger' })
    clearAccountFailure()
  }, [state, toast, t])

  if (!state?.configured) return null
  if (state.account === null)
    return <SignIn href={signInHref(pathname + search)}>{t('account.signIn')}</SignIn>
  const handleSignOut = async () => {
    setBusy(true)
    const done = await signOut()
    setBusy(false)
    if (!done) toast?.(t('account.signOutFailed'), { tone: 'danger' })
  }
  return (
    <Button $variant="ghost" $size="sm" disabled={busy} onClick={() => void handleSignOut()}>
      {t('account.signOut')}
    </Button>
  )
}

// A link, since it leaves for the bridge table; as tall as the small buttons beside it
const SignIn = styled.a`
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 ${space.md}px;
  border-radius: ${radius.component}px;
  color: ${color.text};
  font-size: ${fontSize.sm}px;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;

  &:hover {
    opacity: 0.85;
  }

  @media (pointer: coarse) {
    min-height: 44px;
  }
`
