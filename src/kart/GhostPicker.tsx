// 2026-11-17 (docs/ARCHITECTURE.md §4.22): which ghost races along in the time trial, under the race
// clock: the track's overall best, this kart's own best, or none. Buttons, not a list: a list keeps
// the arrow keys the kart steers with once it has been clicked (spikeLoop.ts `isField`).
import styled from 'styled-components'
import type { KartMessageKey } from '../../shared/kart/i18n.ts'
import type { MessageParams } from '../i18n/t.ts'
import { glass } from '../styles/esports.ts'
import { color, fontSize, radius, space } from '../styles/tokens.ts'
import { GHOST_PICKS, type GhostPick } from './records.ts'

export function GhostPicker({
  t,
  pick,
  onPick,
}: {
  t: (key: KartMessageKey, params?: MessageParams) => string
  pick: GhostPick
  onPick: (pick: GhostPick) => void
}) {
  return (
    <Group role="group" aria-label={t('kart.ghost.label')} data-testid="kart-ghost">
      <Label aria-hidden="true">{t('kart.ghost.label')}</Label>
      {GHOST_PICKS.map((one) => (
        <Choice
          key={one}
          type="button"
          aria-pressed={pick === one}
          $on={pick === one}
          onClick={() => onPick(one)}
          data-ghost={one}
        >
          {t(`kart.ghost.${one}`)}
        </Choice>
      ))}
    </Group>
  )
}

const Group = styled.div`
  ${glass}
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: ${space.xs}px;
  max-width: 240px;
  padding: ${space.xs}px;
  pointer-events: auto;
`

const Label = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Choice = styled.button<{ $on: boolean }>`
  min-height: 28px;
  padding: 0 ${space.sm}px;
  border: 1px solid ${({ $on }) => ($on ? color.brand : color.border)};
  border-radius: ${radius.component}px;
  background: ${({ $on }) => ($on ? color.brand : color.raised)};
  color: ${({ $on }) => ($on ? color.onAccent : color.text)};
  font: inherit;
  font-size: ${fontSize.sm}px;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${color.brand};
    outline-offset: 2px;
  }
`
