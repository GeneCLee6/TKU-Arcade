// e10-t05: picking a kart and a driver, with each kart's tier, one line about it and its stats as
// bars. Used by /kart's garage (GaragePanel.tsx) and the race room's waiting room (RoomGarage.tsx).
// Everything is open: unlocking (e10-t06) waits for F2. Plain DOM, no three.js, so the waiting room
// can load it without the kart's scene. 2026-11-18 (owner: "more esports"): a team's garage board.
// Each kart is a cut card with a bar of its own neon colour, each driver one with their sign's
// colour and their racing number; the stats are slanted segments.
//
// 2026-11-19 (owner: "more kinds of vehicle ... and motorbikes"): seventeen vehicles are too many
// for one row, so the cards sit under tabs: all, the bikes, each series (what a vehicle is built
// for) and each tier (how demanding it is). The picked vehicle has its tags (series, character,
// tier, and a bike's three differences), and room above them for a 3D preview (`preview`: the
// caller's, KartPreview.tsx, since this file stays free of three.js).
//
// 2026-11-21 (docs/KART-META.md): given the track (`track`), what that track asks of a vehicle and
// its quickest three (shared/kart/meta.ts), each a button that picks it, and a tag on their cards.
// The season flagship has its own tier, its season on its tags and a note on what it costs.
import { useId, useState, type ReactNode } from 'react'
import styled from 'styled-components'
import {
  DRIVER_IDS,
  DRIVER_NUMBERS,
  KART_SERIES,
  KART_STATS,
  KART_TIERS,
  KARTS,
  kartSpec,
  STAT_MAX,
  STAT_MIN,
  type DriverId,
  type KartId,
  type KartSeries,
  type KartSpec,
  type KartTier,
} from '../../../shared/kart/karts.ts'
import type { KartRosterKey } from '../../../shared/kart/i18n.roster.ts'
import { trackMeta } from '../../../shared/kart/meta.ts'
import type { MessageParams } from '../../i18n/t.ts'
import { clippedFill, displayType, monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { cutClip } from '../ui/broadcast.ts'
import { kartBodies, kartDrivers } from '../../styles/kartTokens.ts'

export type RosterT = (key: KartRosterKey | `kart.body.${KartId}`, params?: MessageParams) => string

const SEGMENTS = STAT_MAX - STAT_MIN + 1

/** What the cards are narrowed to: everything, the bikes, one series or one tier */
type RosterTab = 'all' | 'bike' | `series.${KartSeries}` | `tier.${KartTier}`

const ROSTER_TABS: readonly RosterTab[] = [
  'all',
  'bike',
  ...KART_SERIES.map((series) => `series.${series}` as const),
  ...KART_TIERS.map((tier) => `tier.${tier}` as const),
]

const inTab = (spec: KartSpec, tab: RosterTab): boolean =>
  tab === 'all' ||
  (tab === 'bike' && spec.kind === 'bike') ||
  tab === `series.${spec.series}` ||
  tab === `tier.${spec.tier}`

const TIER_ORDER: { readonly [T in KartTier]: number } = {
  entry: 0,
  advanced: 1,
  expert: 2,
  flagship: 3,
}

/** A bike's three differences, as tags (karts.ts's KIND_TRAITS says them in numbers) */
const BIKE_TAGS = ['kart.tag.narrow', 'kart.tag.lean', 'kart.tag.light'] as const

/** 2026-11-20: what a machine of the item series spends on items, as tags (karts.ts's ItemPoints) */
const perkTags = (spec: KartSpec) =>
  [
    (spec.items?.luck ?? 0) > 0 && ('kart.perk.luck' as const),
    (spec.items?.duration ?? 0) > 0 && ('kart.perk.duration' as const),
    (spec.items?.shield ?? 0) > 0 && ('kart.perk.shield' as const),
  ].filter((key) => key !== false)

export interface RosterPickerProps {
  t: RosterT
  kart: KartId
  driver: DriverId
  onKart(kart: KartId): void
  onDriver(driver: DriverId): void
  /** The picked vehicle drawn in 3D (KartPreview.tsx), above its tags; none, and there is no picture */
  preview?: ReactNode
  /** The track about to be raced (2026-11-21): its quickest vehicles are recommended */
  track?: string
  /**
   * 2026-11-23 (docs/KART-WORLD.md §3): the picked driver's card, their outfits and their win
   * (DriverProfile.tsx, the caller's, loaded on its own); none, and there is only the one line
   */
  profile?: ReactNode
}

export function RosterPicker({
  t,
  kart,
  driver,
  onKart,
  onDriver,
  preview,
  track,
  profile,
}: RosterPickerProps) {
  const ids = useId()
  const spec = kartSpec(kart)
  const meta = trackMeta(track)
  const picks: readonly KartId[] = meta?.podium ?? []
  const [tab, setTab] = useState<RosterTab>('all')
  const tabLabel = (one: RosterTab): string =>
    // A series' or a tier's tab is named by its own key: `kart.series.<id>`, `kart.tier.<id>`
    one === 'all' || one === 'bike' ? t(`kart.roster.tab.${one}`) : t(`kart.${one}`)
  // Within a tab: the karts before the bikes, each by tier, as the table has them
  const shown = KARTS.map((one) => kartSpec(one.id))
    .filter((one) => inTab(one, tab))
    .sort(
    (a, b) =>
      (a.kind === 'bike' ? 1 : 0) - (b.kind === 'bike' ? 1 : 0) ||
      TIER_ORDER[a.tier] - TIER_ORDER[b.tier],
  )
  return (
    <Picker data-testid="kart-roster">
      <Label id={`${ids}kart`}>{t('kart.roster.kart')}</Label>
      {preview}
      {meta && (
        <Meta data-testid="kart-meta" data-track={track}>
          <Label>{t('kart.meta.title')}</Label>
          <Tags data-testid="kart-meta-character">
            {meta.character.map((one) => (
              <Tag key={one} data-character={one}>
                {t(`kart.meta.trait.${one}`)}
              </Tag>
            ))}
          </Tags>
          <MetaPicks>
            {meta.podium.map((one, place) => (
              <MetaPick
                key={one}
                type="button"
                aria-pressed={one === kart}
                onClick={() => onKart(one)}
                data-meta-pick={one}
              >
                <Place aria-hidden="true">{place + 1}</Place>
                <Swatch aria-hidden="true" style={{ background: kartBodies[one].accent }} />
                <ChoiceName>{t(`kart.body.${one}`)}</ChoiceName>
              </MetaPick>
            ))}
          </MetaPicks>
          <Note>{t('kart.meta.flagship')}</Note>
        </Meta>
      )}
      <Tabs role="tablist" aria-label={t('kart.roster.filter')} data-testid="kart-tabs">
        {ROSTER_TABS.map((one) => (
          <Tab
            key={one}
            type="button"
            role="tab"
            aria-selected={one === tab}
            aria-controls={`${ids}karts`}
            onClick={() => setTab(one)}
            data-tab={one}
            $gap={one === 'series.allround' || one === 'tier.entry'}
          >
            {tabLabel(one)}
          </Tab>
        ))}
      </Tabs>
      <Choices role="radiogroup" id={`${ids}karts`} aria-labelledby={`${ids}kart`}>
        {shown.map((one) => (
          <Choice
            key={one.id}
            type="button"
            role="radio"
            aria-checked={one.id === kart}
            onClick={() => onKart(one.id)}
            data-kart={one.id}
            data-kind={one.kind}
            data-tier={one.tier}
            {...(picks.includes(one.id) ? { 'data-pick': 'true' } : {})}
          >
            <Swatch aria-hidden="true" style={{ background: kartBodies[one.id].accent }} />
            <ChoiceName>{t(`kart.body.${one.id}`)}</ChoiceName>
            <Tier>
              {one.kind === 'bike'
                ? `${t('kart.kind.bike')} · ${t(`kart.tier.${one.tier}`)}`
                : `${t(`kart.trait.${one.series}`)} · ${t(`kart.tier.${one.tier}`)}`}
              {picks.includes(one.id) && <PickMark>{` · ${t('kart.meta.pickShort')}`}</PickMark>}
            </Tier>
          </Choice>
        ))}
      </Choices>
      <Picked>
        <PickedName data-testid="kart-picked">{t(`kart.body.${kart}`)}</PickedName>
        <Tags data-testid="kart-tags">
          <Tag $strong>{t(`kart.kind.${spec.kind}`)}</Tag>
          <Tag>{t(`kart.series.${spec.series}`)}</Tag>
          <Tag>{t(`kart.trait.${spec.series}`)}</Tag>
          <Tag $flagship={spec.tier === 'flagship'}>{t(`kart.tier.${spec.tier}`)}</Tag>
          {spec.tier === 'flagship' && spec.season !== undefined && (
            <Tag data-testid="kart-season">{t('kart.season', { season: spec.season })}</Tag>
          )}
          {picks.includes(kart) && <Tag data-testid="kart-picked-meta">{t('kart.meta.pick')}</Tag>}
          {spec.kind === 'bike' && BIKE_TAGS.map((key) => <Tag key={key}>{t(key)}</Tag>)}
          {perkTags(spec).map((key) => (
            <Tag key={key} data-perk={key}>
              {t(key)}
            </Tag>
          ))}
        </Tags>
      </Picked>
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
      {profile}
      {spec.kind === 'bike' && <Note data-testid="kart-bike-note">{t('kart.roster.bikeNote')}</Note>}
      {spec.series === 'item' && (
        <Note data-testid="kart-series-item-note">{t('kart.roster.itemNote')}</Note>
      )}
      {spec.tier === 'flagship' && (
        <Note data-testid="kart-flagship-note">{t('kart.roster.flagshipNote')}</Note>
      )}
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

// The tabs wrap rather than scroll: every one stays in sight on a phone held upright
const Tabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
`

const Tab = styled.button<{ $gap: boolean }>`
  ${monoType}
  min-height: 32px;
  margin-inline-start: ${(p) => (p.$gap ? space.sm : 0)}px;
  padding: 0 ${space.sm}px;
  color: ${color.muted};
  background: none;
  border: 0;
  border-bottom: 2px solid ${color.line};
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;

  @media (pointer: coarse) {
    min-height: 44px;
  }

  &:hover {
    color: ${color.text};
  }

  &[aria-selected='true'] {
    color: ${color.text};
    border-bottom-color: ${color.accent};
  }
`

const Picked = styled.div`
  display: grid;
  gap: ${space.xs}px;
`

const PickedName = styled.strong`
  ${displayType}
  font-size: ${fontSize.md}px;
  text-transform: uppercase;
`

const Tags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
`

const Tag = styled.span<{ $strong?: boolean; $flagship?: boolean }>`
  ${monoType}
  padding: 2px ${space.sm}px;
  color: ${(p) => (p.$strong ? color.onAccent : color.text)};
  background: ${(p) => (p.$strong ? color.accent : color.raised)};
  box-shadow: ${(p) =>
    p.$strong ? 'none' : `inset 0 0 0 ${p.$flagship ? 2 : 1}px ${p.$flagship ? color.accent : color.line}`};
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
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

// 2026-11-21: the track's quickest three
const Meta = styled.div`
  display: grid;
  gap: ${space.xs}px;
`

const MetaPicks = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: ${space.xs}px;
`

const MetaPick = styled.button`
  ${clippedFill(cutClip(6), color.raised)}
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: center;
  column-gap: ${space.xs}px;
  min-height: 44px;
  padding: ${space.xs}px;
  color: ${color.text};
  background: none;
  border: 0;
  font: inherit;
  text-align: start;
  cursor: pointer;

  &:hover::before {
    background: ${color.raisedHover};
  }

  &[aria-pressed='true']::before {
    background: color-mix(in srgb, ${color.accent} 18%, ${color.raised});
    box-shadow: inset 0 0 0 2px ${color.accent};
  }

  /* The swatch is shorter here: one row */
  & > span:nth-child(2) {
    grid-row: auto;
    height: 22px;
  }
`

const Place = styled.span`
  ${monoType}
  color: ${color.accent};
  font-size: 12px;
  font-weight: 700;
`

const PickMark = styled.span`
  color: ${color.accent};
`
