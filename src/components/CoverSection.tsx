import styled from 'styled-components'
import type { CoverableSeat, RoomMember } from '../../shared/protocol.ts'
import { useT } from '../i18n/useT.ts'
import { Button } from './Button.tsx'
import type { RoomInPlayProps } from './RoomInPlay.tsx'
import { Actions, Heading, List, Muted, Row, Section } from './roomParts.ts'

// Shown only once a game is stuck on a seat, long after the room's first paint: it loads late
// (src/lib/lateParts.ts, 2026-11-23)

export interface CoverSectionProps {
  seated: RoomMember[]
  coverable: CoverableSeat[]
  isHost: boolean
  onCover: RoomInPlayProps['onCover']
}

/** The seats a game is stuck on: the host keeps it moving, everyone else hears why it stopped */
export function CoverSection({ seated, coverable, isHost, onCover }: CoverSectionProps) {
  const t = useT()
  if (!isHost) return <Muted>{t('room.cover.waitForHost')}</Muted>
  return (
    <Section>
      <Heading>{t('room.cover.heading')}</Heading>
      <List>
        {coverable.map(({ seat, skip, proxy }) => {
          // Nobody holds a seat whose player was kicked
          const name = seated.find((member) => member.seat === seat)?.name
          const number = seat + 1
          return (
            <CoverRow key={seat}>
              <span>
                {name === undefined
                  ? t('room.cover.seatEmpty', { seat: number })
                  : t('room.cover.seatHeld', { seat: number, name })}
              </span>
              {skip || proxy ? (
                <Actions>
                  {skip && (
                    <Button
                      $variant="secondary"
                      aria-label={t('room.cover.skipNamed', { seat: number })}
                      onClick={() => onCover(seat, 'skip')}
                    >
                      {t('room.cover.skip')}
                    </Button>
                  )}
                  {proxy && (
                    <Button
                      $variant="secondary"
                      aria-label={t('room.cover.proxyNamed', { seat: number })}
                      onClick={() => onCover(seat, 'proxy')}
                    >
                      {t('room.cover.proxy')}
                    </Button>
                  )}
                </Actions>
              ) : (
                <Muted>{t('room.cover.cannotContinue')}</Muted>
              )}
            </CoverRow>
          )
        })}
      </List>
    </Section>
  )
}

const CoverRow = styled(Row)`
  overflow-wrap: anywhere;
`
