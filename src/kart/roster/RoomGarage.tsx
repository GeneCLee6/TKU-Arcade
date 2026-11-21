// e10-t05: the race room's garage, in the waiting room (its own lazy chunk, loaded only for a kart
// room). Each member picks a kart and a driver, kept in their browser like on /kart, and the pick
// goes to the room as their `look` (shared/protocol.ts), so everyone sees who races in what. The race
// itself reads the pick from the browser and sends it in every frame (karts.ts, loadoutByte).
import { lazy, Suspense, useEffect, useState } from 'react'
import styled from 'styled-components'
import { KART_ROSTER_MESSAGES } from '../../../shared/kart/i18n.roster.ts'
import { isKartId, lookOf, parseLook, type DriverId, type KartId } from '../../../shared/kart/karts.ts'
import type { RoomMember } from '../../../shared/protocol.ts'
import { Heading, Section } from '../../components/roomParts.ts'
import { registerMessages } from '../../i18n/t.ts'
import { memberName } from '../../lib/memberName.ts'
import { useT } from '../../i18n/useT.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { loadBody, loadDriver, saveBody, saveDriver } from '../bodies.ts'
import { prefetchKart, RACE_ENGINE } from '../load/kartLoad.ts'
import { RosterPicker } from './RosterPicker.tsx'

registerMessages(KART_ROSTER_MESSAGES)

// The 3D preview brings three.js with it: fetched apart from the waiting room, which shows the
// cards at once and the picture when it has come (the race needs the same code a moment later)
const KartPreview = lazy(() => import('./KartPreview.tsx'))

export interface RoomGarageProps {
  members: Record<string, RoomMember>
  you: string
  onSetLook(look: string | null): void
  /**
   * 2026-11-21 (docs/ARCHITECTURE.md §4.52): the room's track, once picked: its race (the engine,
   * the track's scenery, the karts picked, the song) is fetched in the background meanwhile
   */
  track?: string
}

export default function RoomGarage({ members, you, onSetLook, track }: RoomGarageProps) {
  const t = useT()
  const [kart, setKart] = useState<KartId>(loadBody)
  const [driver, setDriver] = useState<DriverId>(loadDriver)
  const mine = members[you]?.look
  const look = lookOf(kart, driver)
  // The room hears this browser's pick on arrival and after every change (and again after a
  // reconnect, should the room have missed it)
  useEffect(() => {
    if (members[you] && mine !== look) onSetLook(look)
  }, [members, you, mine, look, onSetLook])

  const seated = Object.values(members)
    .filter((member) => member.seat !== null)
    .sort((a, b) => (a.seat as number) - (b.seat as number))
  const grid = [kart, ...seated.map((member) => parseLook(member.look)?.kart)].join()
  useEffect(() => {
    if (!track) return
    const bodies = grid.split(',').filter(isKartId)
    prefetchKart({ engine: RACE_ENGINE, track: { id: track }, bodies, music: true })
  }, [track, grid])

  return (
    <Section data-testid="kart-room-garage">
      <Heading>{t('kart.roster.title')}</Heading>
      <RosterPicker
        t={t}
        kart={kart}
        driver={driver}
        onKart={(next) => {
          saveBody(next)
          setKart(next)
        }}
        onDriver={(next) => {
          saveDriver(next)
          setDriver(next)
        }}
        track={track}
        preview={
          <Suspense fallback={null}>
            <KartPreview
              kart={kart}
              driver={driver}
              label={t('kart.roster.preview', { kart: t(`kart.body.${kart}`) })}
              hint={t('kart.roster.previewHint')}
              morphLabel={t('kart.roster.morph')}
            />
          </Suspense>
        }
      />
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
