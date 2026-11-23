// e10-t05: the race room's garage, in the waiting room. Each member picks a kart and a driver, kept
// in their browser like on /kart, and the pick goes to the room as their `look` (shared/protocol.ts),
// so everyone sees who races in what. The race itself reads the pick from the browser and sends it
// in every frame (karts.ts, loadoutByte). 2026-11-21: the waiting room's place cards show everyone's
// pick (src/kart/lobby/), so the garage is a dialog opened from there; `useRoomLook` keeps the room
// told of this browser's pick whether it is open or not.
import { lazy, Suspense } from 'react'
import styled from 'styled-components'
import { KART_ROSTER_MESSAGES } from '../../../shared/kart/i18n.roster.ts'
import { parseLook } from '../../../shared/kart/karts.ts'
import type { RoomMember } from '../../../shared/protocol.ts'
import { Heading, Section } from '../../components/roomParts.ts'
import { registerMessages } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { memberName } from '../../lib/memberName.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { RosterPicker } from './RosterPicker.tsx'
import { usePlayWin } from './usePlayWin.ts'
import { useRoomLook, type RoomLook } from './useRoomLook.ts'

registerMessages(KART_ROSTER_MESSAGES)

// The 3D preview brings three.js with it: fetched only once the garage opens
const KartPreview = lazy(() => import('./KartPreview.tsx'))
// 2026-11-23 (docs/KART-WORLD.md §3): the driver's card and their outfits, with words of its own
const DriverProfile = lazy(() => import('./DriverProfile.tsx'))

/** The picker itself, with its 3D preview: inside the waiting room's garage dialog */
export function RoomGarage({ look, track }: { look: RoomLook; track?: string }) {
  const t = useT()
  const { kart, driver, outfit } = look
  const win = usePlayWin(driver)
  return (
    <div data-testid="kart-room-garage">
      <RosterPicker
        t={t}
        kart={kart}
        driver={driver}
        onKart={look.setKart}
        onDriver={look.setDriver}
        track={track}
        profile={
          <Suspense fallback={null}>
            <DriverProfile
              driver={driver}
              outfit={outfit}
              onOutfit={look.setOutfit}
              onPlayWin={win.play}
              playing={win.playing}
            />
          </Suspense>
        }
        preview={
          <Suspense fallback={null}>
            <KartPreview
              kart={kart}
              driver={driver}
              outfit={outfit}
              {...(win.playing ? { pose: 'cheer' as const } : {})}
              label={t('kart.roster.preview', { kart: t(`kart.body.${kart}`) })}
              hint={t('kart.roster.previewHint')}
              morphLabel={t('kart.roster.morph')}
            />
          </Suspense>
        }
      />
    </div>
  )
}

export interface RoomGaragePanelProps {
  members: Record<string, RoomMember>
  you: string
  onSetLook(look: string | null): void
  track?: string
}

/**
 * The garage as a panel of its own, with everyone's picks under it: the race room's results, to
 * race the rematch in another kart (src/games/kart/KartScreen.tsx)
 */
export default function RoomGaragePanel({ members, you, onSetLook, track }: RoomGaragePanelProps) {
  const t = useT()
  const look = useRoomLook(members, you, onSetLook, track)
  const seated = Object.values(members)
    .filter((member) => member.seat !== null)
    .sort((a, b) => (a.seat as number) - (b.seat as number))
  return (
    <Section>
      <Heading>{t('kart.roster.title')}</Heading>
      <RoomGarage look={look} track={track} />
      <Subheading>{t('kart.roster.others')}</Subheading>
      <Picks data-testid="kart-picks">
        {seated.map((member) => {
          const pick = parseLook(member.look)
          return (
            <li key={member.id} data-member={member.id}>
              <Name>{memberName(member, 'kart')}</Name>
              <span>
                {pick
                  ? t('kart.roster.pick', {
                      kart: t(`kart.body.${pick.kart}`),
                      driver: t(`kart.driver.${pick.driver}`),
                    })
                  : t('kart.roster.notPicked')}
              </span>
            </li>
          )
        })}
      </Picks>
    </Section>
  )
}

const Subheading = styled.h3`
  margin: 0;
  font-size: ${fontSize.md}px;
`

const Picks = styled.ul`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: ${fontSize.sm}px;

  li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: ${space.sm}px;
    color: ${color.muted};
  }
`

const Name = styled.span`
  color: ${color.text};
  font-weight: 600;
  overflow-wrap: anywhere;
`
