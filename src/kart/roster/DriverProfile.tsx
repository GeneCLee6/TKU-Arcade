// 2026-11-23 (docs/KART-WORLD.md §3.1–3.3; owner: "each one's background, victory, clothes, looks ...
// think of it as an online game"): the garage's driver card, under the driver picker in /kart's garage
// and the race room's (RosterPicker.tsx's `profile`). Who the picked driver is (build, personality,
// where from, catchphrase, best tracks, the other three), their outfits to pick from (kept per driver
// in this browser, told to the room with the pick), and a button that plays their win on the 3D
// preview. Loaded on its own, with its words (shared/kart/i18n.drivers.ts), when the garage opens.
import { useId } from 'react'
import styled from 'styled-components'
import { KART_DRIVER_MESSAGES, type KartDriverKey } from '../../../shared/kart/i18n.drivers.ts'
import { DRIVER_IDS, DRIVER_NUMBERS, type DriverId } from '../../../shared/kart/karts.ts'
import { OUTFIT_IDS, outfitOpen, type OutfitId } from '../../../shared/kart/outfits.ts'
import { registerMessages } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { clippedFill, displayType, monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { kartDrivers, kartOutfits } from '../../styles/kartTokens.ts'
import { cutClip } from '../ui/broadcast.ts'

registerMessages(KART_DRIVER_MESSAGES)

export interface DriverProfileProps {
  driver: DriverId
  outfit: OutfitId
  onOutfit(outfit: OutfitId): void
  /** Plays the driver's win on the preview; none, and there is no button */
  onPlayWin?: () => void
  /** Whether the win is playing now */
  playing?: boolean
}

const FIELDS = ['personality', 'origin', 'catchphrase', 'tracks', 'win'] as const

export default function DriverProfile({
  driver,
  outfit,
  onOutfit,
  onPlayWin,
  playing,
}: DriverProfileProps) {
  const t = useT()
  const ids = useId()
  const own = (key: string) => t(key as KartDriverKey)
  return (
    <Card data-testid="kart-driver-profile" data-driver={driver} $crest={kartDrivers[driver].crest}>
      <Top>
        <Label>{t('kart.profile.title')}</Label>
        <Name>
          {t(`kart.driver.${driver}`)}
          <Number>{t('kart.profile.number', { number: DRIVER_NUMBERS[driver] })}</Number>
        </Name>
        <Build>{own(`kart.profile.${driver}.build`)}</Build>
      </Top>

      <Label id={`${ids}outfit`}>{t('kart.profile.outfit')}</Label>
      <Outfits role="radiogroup" aria-labelledby={`${ids}outfit`} data-testid="kart-outfits">
        {OUTFIT_IDS.map((one) => {
          const open = outfitOpen(one)
          const dress = kartOutfits[driver][one]
          return (
            <Outfit
              key={one}
              type="button"
              role="radio"
              aria-checked={one === outfit}
              disabled={!open}
              onClick={() => onOutfit(one)}
              data-outfit={one}
            >
              <Swatch aria-hidden="true" style={{ background: dress.body }} />
              <Swatch
                aria-hidden="true"
                style={{ background: dress.sleeve === dress.body ? dress.panel : dress.sleeve }}
              />
              <OutfitName>{own(`kart.outfit.${driver}.${one}`)}</OutfitName>
              {!open && <Locked>{t('kart.profile.locked')}</Locked>}
            </Outfit>
          )
        })}
      </Outfits>
      {onPlayWin && (
        <PlayWin
          type="button"
          onClick={onPlayWin}
          aria-pressed={playing ?? false}
          data-testid="kart-play-win"
        >
          {t('kart.profile.playWin')}
        </PlayWin>
      )}

      <Facts>
        {FIELDS.map((field) => (
          <div key={field}>
            <dt>{t(`kart.profile.${field}`)}</dt>
            <dd data-field={field}>{own(`kart.profile.${driver}.${field}`)}</dd>
          </div>
        ))}
      </Facts>
      <Label>{t('kart.profile.relations')}</Label>
      <Relations data-testid="kart-driver-relations">
        {DRIVER_IDS.filter((one) => one !== driver).map((one) => (
          <li key={one} data-other={one}>
            <Other $crest={kartDrivers[one].crest}>{t(`kart.driver.${one}`)}</Other>
            <span>{own(`kart.profile.${driver}.rel.${one}`)}</span>
          </li>
        ))}
      </Relations>
    </Card>
  )
}

const Card = styled.section<{ $crest: string }>`
  ${({ $crest }) => clippedFill(cutClip(10), `color-mix(in srgb, ${$crest} 10%, ${color.surface})`)}
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.md}px;
  font-size: ${fontSize.sm}px;
`

const Top = styled.div`
  display: grid;
  gap: 2px;
`

const Label = styled.span`
  ${monoType}
  color: ${color.muted};
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
`

const Name = styled.strong`
  ${displayType}
  display: flex;
  align-items: baseline;
  gap: ${space.sm}px;
  font-size: ${fontSize.lg}px;
  text-transform: uppercase;
`

const Number = styled.span`
  ${monoType}
  color: ${color.muted};
  font-size: 12px;
`

const Build = styled.span`
  color: ${color.muted};
`

const Outfits = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: ${space.xs}px;
`

const Outfit = styled.button`
  ${clippedFill(cutClip(6), color.raised)}
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: center;
  column-gap: 4px;
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

  &[aria-checked='true']::before {
    background: color-mix(in srgb, ${color.accent} 18%, ${color.raised});
    box-shadow: inset 0 0 0 2px ${color.accent};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`

const Swatch = styled.span`
  width: 7px;
  height: 24px;
  transform: skewX(${SLANT});
  box-shadow: 0 0 0 1px ${color.line};
`

const OutfitName = styled.span`
  font-size: 12px;
  font-weight: 700;
  overflow-wrap: anywhere;
`

const Locked = styled.span`
  ${monoType}
  grid-column: 1 / -1;
  color: ${color.muted};
  font-size: 11px;
`

const PlayWin = styled.button`
  ${monoType}
  justify-self: start;
  min-height: 36px;
  padding: 0 ${space.md}px;
  color: ${color.text};
  background: ${color.raised};
  border: 1px solid ${color.line};
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;

  @media (pointer: coarse) {
    min-height: 44px;
  }

  &[aria-pressed='true'] {
    color: ${color.onAccent};
    background: ${color.accent};
    border-color: ${color.accent};
  }
`

const Facts = styled.dl`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;

  div {
    display: grid;
    grid-template-columns: minmax(6em, auto) minmax(0, 1fr);
    gap: ${space.sm}px;
  }

  dt {
    color: ${color.muted};
  }

  dd {
    margin: 0;
  }
`

const Relations = styled.ul`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: minmax(5em, auto) minmax(0, 1fr);
    gap: ${space.sm}px;
  }
`

const Other = styled.span<{ $crest: string }>`
  ${displayType}
  padding-inline-start: ${space.xs}px;
  border-inline-start: 3px solid ${({ $crest }) => $crest};
  font-size: ${fontSize.sm}px;
`
