import { useState } from 'react'
import styled from 'styled-components'
import { useT } from '../i18n/useT.ts'
import {
  dismissInstallHint,
  installHintDismissed,
  isAndroidBrowser,
  isIosBrowser,
  isStandalone,
  useInstallOffer,
} from '../lib/installApp.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'

/**
 * The lobby's offer to install the site as an app (e7-t09): Chrome's own install, through a button,
 * where the browser offers it; on an iPhone, the two taps in Safari that do it; on an Android phone
 * whose browser has no such offer, where its menu has it (2026-11-21). Nothing once installed, where
 * the browser cannot install at all, or once its person said not now (remembered on the device)
 */
export function InstallApp() {
  const t = useT()
  const install = useInstallOffer()
  const [dismissed, setDismissed] = useState(installHintDismissed)
  if (dismissed || isStandalone()) return null
  const ios = isIosBrowser()
  const android = install === null && !ios && isAndroidBrowser()
  if (install === null && !ios && !android) return null
  const dismiss = () => {
    dismissInstallHint()
    setDismissed(true)
  }
  return (
    <Box aria-labelledby="install-app-title" data-testid="install-app">
      <Title id="install-app-title">{t('install.title')}</Title>
      <Hint>{t(ios ? 'install.ios' : android ? 'install.android' : 'install.hint')}</Hint>
      <Actions>
        {install !== null && (
          <Button $variant="secondary" $size="sm" onClick={() => void install()}>
            {t('install.button')}
          </Button>
        )}
        <Button $variant="ghost" $size="sm" onClick={dismiss}>
          {t('install.dismiss')}
        </Button>
      </Actions>
    </Box>
  )
}

const Box = styled.section`
  display: grid;
  justify-items: start;
  gap: ${space.xs}px;
  padding: ${space.sm}px ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${color.accent};
`

const Title = styled.h2`
  margin: 0;
  font-size: ${fontSize.md}px;
`

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
`

const Hint = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`
