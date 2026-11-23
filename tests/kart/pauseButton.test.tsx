import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KART_MESSAGES } from '../../shared/kart/i18n.ts'
import { registerMessages, translate } from '../../src/i18n/t.ts'
import { PauseButton, PauseLayer } from '../../src/kart/ui/PauseLayer.tsx'
import { isRacePaused, resumeRace } from '../../src/kart/race/raceClock.ts'

// 2026-11-23 (#152): the school, a challenge and the time trial have rows of buttons of their own and
// no pause button over the race; a pause button in that row opens the same menu as Esc and Start

registerMessages(KART_MESSAGES)
const en = (key: string, params?: Record<string, string | number>) =>
  translate('en', key as `kart.${string}`, params)
const zh = (key: string, params?: Record<string, string | number>) =>
  translate('zh-TW', key as `kart.${string}`, params)

describe("a page's own pause button", () => {
  it('opens the pause menu, and the race stops', () => {
    render(
      <>
        <PauseLayer t={en} canPause button={false} onRestart={() => {}} />
        <PauseButton t={en} />
      </>,
    )
    expect(screen.queryByTestId('kart-pause')).toBeNull()
    expect(screen.queryByTestId('kart-pause-open')).toBeNull()
    fireEvent.click(screen.getByTestId('kart-pause-button'))
    expect(screen.getByTestId('kart-pause')).toHaveAttribute('data-paused', 'true')
    expect(screen.getByRole('dialog', { name: 'Paused' })).toBeVisible()
    expect(isRacePaused()).toBe(true)
    fireEvent.click(screen.getByTestId('kart-pause-resume'))
    expect(screen.queryByTestId('kart-pause')).toBeNull()
    expect(isRacePaused()).toBe(false)
    resumeRace()
  })

  it('does nothing while the menu is not taking the keys (a result shown, another panel open)', () => {
    render(
      <>
        <PauseLayer t={en} canPause button={false} enabled={false} />
        <PauseButton t={en} />
      </>,
    )
    fireEvent.click(screen.getByTestId('kart-pause-button'))
    expect(screen.queryByTestId('kart-pause')).toBeNull()
  })

  it('says Pause in both languages', () => {
    expect(en('kart.flow.pause.button')).toBe('Pause')
    expect(zh('kart.flow.pause.button')).toBe('暫停')
  })
})
