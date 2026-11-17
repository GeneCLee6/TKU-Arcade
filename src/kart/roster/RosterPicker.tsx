// e10-t05: picking a kart and a driver, with each kart's tier, one line about it and its stats as
// bars. Used by /kart's garage (GaragePanel.tsx) and the race room's waiting room (RoomGarage.tsx).
// Everything is open: unlocking (e10-t06) waits for F2. Plain DOM, no three.js, so the waiting room
// can load it without the kart's scene.
import { useId } from 'react'
import styled from 'styled-components'
import {
  DRIVER_IDS,
  KART_STATS,
  KARTS,
  kartSpec,
  STAT_MAX,
  STAT_MIN,
  type DriverId,
  type KartId,
} from '../../../shared/kart/karts.ts'
import type { KartRosterKey } from '../../../shared/kart/i18n.roster.ts'
import type { MessageParams } from '../../i18n/t.ts'
import { color, fontSize, radius, space } from '../../styles/tokens.ts'
import { kartBodies, kartDrivers } from '../../styles/kartTokens.ts'

export type RosterT = (key: KartRosterKey | `kart.body.${KartId}`, params?: MessageParams) => string

const SEGMENTS = STAT_MAX - STAT_MIN + 1

export interface RosterPickerProps {
  t: RosterT
  kart: KartId
  driver: DriverId
  onKart(kart: KartId): void
  onDriver(driver: DriverId): void
}

export function RosterPicker({ t, kart, driver, onKart, onDriver }: RosterPickerProps) {
  const ids = useId()
  const spec = kartSpec(kart)
  return (
    <Picker data-testid="kart-roster">
      <Label id={`${ids}kart`}>{t('kart.roster.kart')}</Label>
      <Choices role="radiogroup" aria-labelledby={`${ids}kart`}>
        {KARTS.map((one) => (
          <Choice
            key={one.id}
            type="button"
            role="radio"
            aria-checked={one.id === kart}
            onClick={() => onKart(one.id)}
            data-kart={one.id}
          >
            <Swatch aria-hidden="true" style={{ background: kartBodies[one.id].main }} />
            <ChoiceName>{t(`kart.body.${one.id}`)}</ChoiceName>
            <Tier>{t(`kart.tier.${one.tier}`)}</Tier>
          </Choice>
        ))}
      </Choices>
      <Blurb data-testid="kart-blurb">{t(`kart.blurb.${kart}`)}</Blurb>
      <Stats data-testid="kart-stats">
        {KART_STATS.map((stat) => {
          const value = spec.stats[stat] - STAT_MIN + 1
          return (
            <StatRow key={stat}>
              <dt>{t(`kart.stat.${stat}`)}</dt>
              <dd
                role="img"
                aria-label={t('kart.roster.statValue', { value })}
                data-stat={stat}
                data-value={value}
              >
                {Array.from({ length: SEGMENTS }, (_, i) => (
                  <Segment key={i} $on={i < value} />
                ))}
              </dd>
            </StatRow>
          )
        })}
      </Stats>

      <Label id={`${ids}driver`}>{t('kart.roster.driver')}</Label>
      <Choices role="radiogroup" aria-labelledby={`${ids}driver`}>
        {DRIVER_IDS.map((one) => (
          <Choice
            key={one}
            type="button"
            role="radio"
            aria-checked={one === driver}
            onClick={() => onDriver(one)}
            data-driver={one}
          >
            <Swatch aria-hidden="true" style={{ background: kartDrivers[one].crest }} />
            <ChoiceName>{t(`kart.driver.${one}`)}</ChoiceName>
          </Choice>
        ))}
      </Choices>
      <Blurb>{t(`kart.driverBlurb.${driver}`)}</Blurb>
      <Note>{t('kart.roster.note')}</Note>
    </Picker>
  )
}

const Picker = styled.div`
  display: grid;
  gap: ${space.sm}px;
  font-size: ${fontSize.sm}px;
`

const Label = styled.span`
  font-weight: 700;
`

const Choices = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
  gap: ${space.xs}px;
`

const Choice = styled.button`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  column-gap: ${space.xs}px;
  min-height: 44px;
  padding: ${space.xs}px ${space.sm}px;
  color: ${color.text};
  background: ${color.raised};
  border: 1px solid ${color.border};
  border-radius: ${radius.component}px;
  font: inherit;
  text-align: start;
  cursor: pointer;

  &:hover {
    background: ${color.raisedHover};
  }

  &[aria-checked='true'] {
    border-color: ${color.accent};
    box-shadow: inset 0 0 0 1px ${color.accent};
  }
`

const Swatch = styled.span`
  grid-row: span 2;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px ${color.line};
`

const ChoiceName = styled.span`
  font-weight: 700;
  overflow-wrap: anywhere;
`

const Tier = styled.span`
  color: ${color.muted};
`

const Blurb = styled.p`
  margin: 0;
`

const Stats = styled.dl`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
`

const StatRow = styled.div`
  display: grid;
  grid-template-columns: minmax(6em, auto) minmax(0, 1fr);
  align-items: center;
  gap: ${space.sm}px;

  dt {
    color: ${color.muted};
  }

  dd {
    display: grid;
    grid-template-columns: repeat(${SEGMENTS}, minmax(0, 1fr));
    gap: 3px;
    margin: 0;
    max-width: 180px;
  }
`

const Segment = styled.span<{ $on: boolean }>`
  height: 8px;
  border-radius: 2px;
  background: ${(p) => (p.$on ? color.accent : color.raised)};
`

const Note = styled.p`
  margin: 0;
  color: ${color.muted};
`
