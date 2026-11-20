// 2026-11-20 (docs/ARCHITECTURE.md §4.50): the tip of the moment over a race (useCoach.ts), and
// the controls panel's switch that turns the tips off.
import { useId, useState } from 'react'
import styled from 'styled-components'
import type { KartMessageKey } from '../../../shared/kart/i18n.ts'
import type { Bindings } from '../../../shared/kart/input.ts'
import type { MessageParams } from '../../i18n/t.ts'
import { displayType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { broadcastSolid, ticker } from '../ui/broadcast.ts'
import { controlLabels, useInputDevice } from './controls.ts'
import { KeyText } from './KeyText.tsx'
import { loadCoachOn, saveCoachOn } from './store.ts'
import type { CoachHandle } from './useCoach.ts'

type KartT = (key: KartMessageKey, params?: MessageParams) => string

/** The tip of the moment, over the race */
export function CoachTip({
  t,
  coach,
  bindings,
  touch,
}: {
  t: KartT
  coach: CoachHandle
  bindings: Bindings
  touch: boolean
}) {
  const device = useInputDevice(touch)
  if (!coach.tip) return null
  return (
    <TipBox role="status" data-testid="kart-coach-tip" data-tip={coach.tip}>
      <TipTag>{t('kart.school.tip')}</TipTag>
      <TipText>
        <KeyText
          t={t}
          id={`kart.school.tip.${coach.tip}`}
          labels={controlLabels(device, bindings, t)}
        />
      </TipText>
      <Close type="button" onClick={coach.close} aria-label={t('kart.school.closeTip')}>
        ×
      </Close>
    </TipBox>
  )
}

/** The switch for the tips, in the controls panel */
export function CoachSwitch({ t }: { t: KartT }) {
  const [on, setOn] = useState(loadCoachOn)
  const noteId = useId()
  return (
    <label>
      <input
        type="checkbox"
        checked={on}
        aria-describedby={noteId}
        onChange={(event) => {
          saveCoachOn(event.target.checked)
          setOn(event.target.checked)
        }}
        data-testid="kart-coach-switch"
      />
      {t('kart.school.coach')}
      <SwitchNote id={noteId}>{t('kart.school.coachNote')}</SwitchNote>
    </label>
  )
}

const TipBox = styled.div`
  ${broadcastSolid}
  position: fixed;
  z-index: 21;
  top: 22%;
  left: 50%;
  translate: -50% 0;
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
  width: max-content;
  max-width: min(460px, calc(100vw - ${2 * space.lg}px));
  padding: ${space.sm}px ${space.md}px;
  color: ${color.text};
  font-size: ${fontSize.sm}px;
  /* Never in the way of the race's own buttons: only its close button takes a press */
  pointer-events: none;
`

const TipTag = styled.span`
  ${ticker(color.warning)}
  ${displayType}
  flex: none;
  padding: 0 ${space.md}px;
  color: ${color.onAccent};
  font-size: ${fontSize.sm}px;
  text-transform: uppercase;
`

const TipText = styled.p`
  margin: 0;
`

const Close = styled.button`
  flex: none;
  min-width: 32px;
  min-height: 32px;
  border: 0;
  background: transparent;
  color: ${color.muted};
  font-size: ${fontSize.lg}px;
  cursor: pointer;
  pointer-events: auto;
`

const SwitchNote = styled.span`
  display: block;
  color: ${color.muted};
  font-size: 12px;
`
