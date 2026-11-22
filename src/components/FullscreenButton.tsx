// 2026-11-22: the full-screen button (src/lib/fullscreen.ts): in every room's heading, the race room's
// waiting room and the kart's own menu. Its own small chunk with its words, loaded after the screen
// it sits on. Four corners pointing out to go in, pointing in to come back; our own drawing.
import styled from 'styled-components'
import { fullscreenMessages } from '../../shared/games/i18n.fullscreen.ts'
import { registerMessages } from '../i18n/t.ts'
import { useT } from '../i18n/useT.ts'
import { isIosBrowser } from '../lib/installApp.ts'
import { lockLandscape, toggleFullscreen, unlockOrientation, useFullscreenMode } from '../lib/fullscreen.ts'
import { Button, type ButtonVariant } from './Button.tsx'
import { useToast } from './useToast.ts'
import { VisuallyHidden } from './VisuallyHidden.ts'

registerMessages(fullscreenMessages)

export interface FullscreenButtonProps {
  /** The icon alone, its words for screen readers (a corner of the race room's bar) */
  iconOnly?: boolean
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  /** The kart's screens: a phone in full screen is held on its side (where the browser allows) */
  landscape?: boolean
}

/** Said once a page: focus mode is not what the person may have expected */
let told = false

export default function FullscreenButton({
  iconOnly = false,
  variant = 'secondary',
  size = 'sm',
  landscape = false,
}: FullscreenButtonProps) {
  const t = useT()
  const toast = useToast()
  const mode = useFullscreenMode()
  const on = mode !== 'off'
  const label = on ? t('room.extra.fullscreen.exit') : t('room.extra.fullscreen.enter')
  const press = async () => {
    const now = await toggleFullscreen()
    if (landscape && now === 'fullscreen') void lockLandscape()
    if (landscape && now === 'off') unlockOrientation()
    if (now === 'focus' && !told) {
      told = true
      toast(isIosBrowser() ? t('room.extra.fullscreen.ios') : t('room.extra.fullscreen.focus'), { duration: 7000 })
    }
  }
  return (
    <Button
      $variant={variant}
      $size={size}
      aria-pressed={on}
      title={iconOnly ? label : undefined}
      onClick={() => void press()}
      data-testid="fullscreen-button"
      data-mode={mode}
    >
      <Icon viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
        <path
          d={
            on
              ? 'M7 2v5H2M13 2v5h5M7 18v-5H2M13 18v-5h5'
              : 'M2 7V2h5M18 7V2h-5M2 13v5h5M18 13v5h-5'
          }
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="square"
        />
      </Icon>
      {iconOnly ? <VisuallyHidden>{label}</VisuallyHidden> : <span>{label}</span>}
    </Button>
  )
}

const Icon = styled.svg`
  flex: none;
`
