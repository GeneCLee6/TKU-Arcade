// e10-t05: picking a kart and a driver, with each kart's tier, one line about it and its stats as
// bars. Used by /kart's garage (GaragePanel.tsx) and the race room's waiting room (RoomGarage.tsx).
// Everything is open: unlocking (e10-t06) waits for F2. Plain DOM, no three.js, so the waiting room
// can load it without the kart's scene. 2026-11-18 (owner: "more esports"): a team's garage board.
// Each kart is a cut card with a bar of its own neon colour, each driver one with their sign's
// colour and their racing number; the stats are slanted segments.
import { useId } from 'react'
import styled from 'styled-components'
import {
  DRIVER_IDS,
  DRIVER_NUMBERS,
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
import { clippedFill, displayType, monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { cutClip } from '../ui/broadcast.ts'
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
            <Swatch aria-hidden="true" style={{ background: kartBodies[one.id].accent }} />
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
            <Number aria-hidden="true">{`#${DRIVER_NUMBERS[one]}`}</Number>
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
  ${monoType}
  color: ${color.muted};
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
`

const Choices = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
  gap: ${space.xs}px;
`

// A cut card. The fill is on ::before, so the focus ring is whole
const Choice = styled.button`
  ${clippedFill(cutClip(8), color.raised)}
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  column-gap: ${space.sm}px;
  min-height: 48px;
  padding: ${space.xs}px ${space.sm}px;
  color: ${color.text};
  background: none;
  border: 0;
  font: inherit;
  text-align: start;
  cursor: pointer;

  &:hover::before {
    background: ${color.raisedHover};
  }

  &[aria-checked='true']::before {
    background: color-mix(in srgb, ${color.accent} 18%, ${color.raised});
    box-shadow: inset 0 0 0 2px ${color.accent};
  }
`

// The kart's or the driver's own colour: a slanted bar down the card's left
const Swatch = styled.span`
  grid-row: span 2;
  width: 8px;
  height: 30px;
  transform: skewX(${SLANT});
  box-shadow: 0 0 0 1px ${color.line};
`

const ChoiceName = styled.span`
  ${displayType}
  font-size: ${fontSize.sm}px;
  overflow-wrap: anywhere;
`

const Tier = styled.span`
  ${monoType}
  color: ${color.muted};
  font-size: 11px;
  text-transform: uppercase;
`

const Number = styled.span`
  ${monoType}
  color: ${color.muted};
  font-size: 12px;
  font-weight: 700;
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
  height: 10px;
  transform: skewX(${SLANT});
  background: ${(p) => (p.$on ? color.accent : color.raised)};
  box-shadow: ${(p) => (p.$on ? 'none' : `inset 0 0 0 1px ${color.line}`)};
`

const Note = styled.p`
  margin: 0;
  color: ${color.muted};
`
