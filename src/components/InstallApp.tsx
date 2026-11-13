import styled from 'styled-components'
import { useT } from '../i18n/useT.ts'
import { isIosBrowser, isStandalone, useInstallOffer } from '../lib/installApp.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'

/**
 * The lobby's offer to install the site as an app (e7-t09): Chrome's own install, through a button,
 * where the browser offers it; on an iPhone, the two taps in Safari that do it. Nothing once
 * installed, or where the browser cannot install at all
 */
export function InstallApp() {
  const t = useT()
  const install = useInstallOffer()
  if (isStandalone()) return null
  const ios = isIosBrowser()
  if (install === null && !ios) return null
  return (
    <Box aria-labelledby="install-app-title">
      <Title id="install-app-title">{t('install.title')}</Title>
      <Hint>{t(ios ? 'install.ios' : 'install.hint')}</Hint>
      {install !== null && (
        <Button $variant="secondary" $size="sm" onClick={() => void install()}>
          {t('install.button')}
        </Button>
      )}
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

const Hint = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`
